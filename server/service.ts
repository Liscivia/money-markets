import { fetchNews } from './news.js';
import { fetchSnapshot, fetchHistory } from './providers.js';
import {
  fetchCompetition,
  fetchLiquidityBenchmarks,
  fetchProtocolCapital,
  type CompetitionHistory,
} from './competition.js';
import { withFallback } from './state.js';
import { totalLiquidity } from '../shared/metrics.js';
import type { Snapshot, Market, MarketHistory, NewsResult } from '../shared/types.js';
import type { CacheStore } from './store.js';
import { HttpError } from './errors.js';

export const SNAPSHOT_KEY = 'snapshot:source-observations-v2';
export const SNAPSHOT_TTL = 5 * 60_000;
const HISTORY_TTL = 60 * 60_000;
const MANUAL_REFRESH_FLOOR = 60_000;

const sources = {
  fetchSnapshot,
  fetchHistory,
  fetchNews,
  fetchCompetition,
  fetchLiquidityBenchmarks,
  fetchProtocolCapital,
};
export type DataSources = typeof sources;

export function staleSnapshot(value: Snapshot): Snapshot {
  return {
    ...value,
    providers: value.providers.map((p) => ({
      ...p,
      status: 'stale',
      detail: `Cached data from ${p.fetchedAt ?? value.fetchedAt}. Source refresh unavailable. ${p.detail ?? ''}`,
    })),
  };
}

/** Transport-independent service: no listener, timer, Vite, filesystem, or startup fetch. */
export function createDataService(
  cache: CacheStore,
  dependencies: Partial<DataSources> = {},
  now = Date.now,
) {
  const upstream = { ...sources, ...dependencies };
  let snapshotFlight: Promise<Snapshot> | null = null;
  let newsFlight: Promise<NewsResult> | null = null;
  let lastSnapshotAttempt = -Infinity;
  let lastNewsAttempt = -Infinity;
  const historyFlight = new Map<string, Promise<MarketHistory>>();

  async function getSnapshot(force = false): Promise<Snapshot> {
    const cached = cache.get<Snapshot>(SNAPSHOT_KEY);
    if (cached && now() - cached.savedAt < (force ? MANUAL_REFRESH_FLOOR : SNAPSHOT_TTL)) return cached.value;
    if (snapshotFlight) return snapshotFlight;
    if (now() - lastSnapshotAttempt < MANUAL_REFRESH_FLOOR) {
      if (cached) return staleSnapshot(cached.value);
      throw new HttpError(503, 'Market sources are temporarily unavailable. Try again in a minute.');
    }
    lastSnapshotAttempt = now();
    snapshotFlight = (async () => {
      try {
        const fresh = withFallback(await upstream.fetchSnapshot(), cached?.value ?? null);
        if (!fresh.markets.length) throw new Error('Market sources returned no data');
        cache.set(SNAPSHOT_KEY, fresh, now());
        cache.recordSnapshot?.(fresh);
        const timestamp = Math.floor(now() / 3_600_000) * 3_600_000;
        for (const provider of fresh.providers.filter((p) => p.status === 'live')) {
          const rows = fresh.markets.filter((m) => m.protocol === provider.protocol);
          cache.aggregate(
            timestamp,
            provider.protocol,
            rows.reduce((s, m) => s + m.totalSupplyUsd, 0),
            rows.reduce((s, m) => s + m.totalBorrowUsd, 0),
            totalLiquidity(rows),
          );
        }
        return fresh;
      } catch (error) {
        if (cached) return staleSnapshot(cached.value);
        throw error;
      }
    })().finally(() => {
      snapshotFlight = null;
    });
    // Await refresh inside the request: serverless cannot rely on detached work.
    return snapshotFlight;
  }

  async function history(market: Market, days: number): Promise<MarketHistory> {
    const key = `history:${market.id}:${days}`;
    const cached = cache.get<MarketHistory>(key);
    if (cached && now() - cached.savedAt < HISTORY_TTL) return cached.value;
    const existing = historyFlight.get(key);
    if (existing) return existing;
    if (historyFlight.size >= 8) throw new HttpError(429, 'Too many history requests. Try again shortly.');
    const pending = upstream
      .fetchHistory(market, days)
      .then((data) => {
        cache.recordHistory?.(data);
        // Empty results are real data too; briefly cache them to avoid retry storms.
        cache.set(key, data, now() - (data.points.length ? 0 : HISTORY_TTL - MANUAL_REFRESH_FLOOR));
        return data;
      })
      .catch((error) => {
        if (cached)
          return {
            ...cached.value,
            warning: `Cached history from ${cached.value.fetchedAt}; refresh unavailable.`,
          };
        const archived = cache.marketHistory?.(market.id, now() / 1000 - days * 86400) ?? [];
        if (archived.length)
          return {
            marketId: market.id,
            points: archived,
            source: 'Archived official source observations · last observation per UTC day',
            fetchedAt: new Date(archived.at(-1)!.timestamp * 1000).toISOString(),
            warning: 'Upstream history unavailable. Showing archived observations only; gaps are not filled.',
          };
        throw error;
      })
      .finally(() => historyFlight.delete(key));
    historyFlight.set(key, pending);
    return pending;
  }

  async function news(force = false): Promise<NewsResult> {
    const cached = cache.get<NewsResult>('news');
    if (cached && now() - cached.savedAt < (force ? MANUAL_REFRESH_FLOOR : 15 * 60_000)) return cached.value;
    if (newsFlight) return newsFlight;
    if (now() - lastNewsAttempt < MANUAL_REFRESH_FLOOR) {
      if (cached) return cached.value;
      throw new HttpError(503, 'Governance sources are temporarily unavailable. Try again in a minute.');
    }
    lastNewsAttempt = now();
    newsFlight = upstream
      .fetchNews()
      .then((value) => {
        if (cached)
          for (const source of value.sources.filter((s) => s.status === 'error')) {
            const previous = cached.value.items.filter((i) => i.protocol === source.protocol);
            if (previous.length) {
              value.items.push(...previous);
              source.status = 'stale';
              source.error = `Feed unavailable; cached ${cached.value.fetchedAt}`;
            }
          }
        value.items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
        cache.set('news', value, now());
        return value;
      })
      .finally(() => {
        newsFlight = null;
      });
    return newsFlight;
  }

  async function protocolHistory(days: number, chain: string): Promise<CompetitionHistory> {
    const key = `protocol-history:capital-accounting-v2:${days}:${chain}`;
    const cached = cache.get<CompetitionHistory>(key);
    // Cards and charts use the SAME raw source cache. This store is fallback only.
    try {
      const data = await upstream.fetchCompetition(days, chain);
      cache.set(key, data, now());
      return data;
    } catch (error) {
      if (cached)
        return {
          ...cached.value,
          warnings: [
            ...cached.value.warnings,
            `Cached data from ${cached.value.fetchedAt}; refresh unavailable.`,
          ],
        };
      throw error;
    }
  }

  return {
    getSnapshot,
    history,
    news,
    protocolHistory,
    protocolCapital: upstream.fetchProtocolCapital,
    liquidityBenchmarks: upstream.fetchLiquidityBenchmarks,
    observations: (since: number) => cache.aggregates(since),
  };
}

export type DataService = ReturnType<typeof createDataService>;
