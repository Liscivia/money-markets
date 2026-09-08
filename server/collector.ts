import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';
import { SNAPSHOT_KEY, type DataService } from './service.js';
import type { CacheStore } from './store.js';
import type { NewsResult, Snapshot } from '../shared/types.js';

export const MARKET_INTERVAL = 10 * 60_000;
export const NEWS_INTERVAL = 60 * 60_000;
export const DAILY_INTERVAL = 24 * 60 * 60_000;
export const SNAPSHOT_MAX_AGE = 15 * 60_000;

/** Collection time is not the rate observation time. Never re-date cached markets. */
export function collectedSnapshot(cache: CacheStore, now = Date.now()): Snapshot {
  const cached = cache.get<Snapshot>(SNAPSHOT_KEY);
  if (!cached) throw new HttpError(503, 'Waiting for the first scheduled market collection.');
  return {
    ...cached.value,
    providers: cached.value.providers.map((provider) => {
      const fetched = Date.parse(provider.fetchedAt ?? '');
      if (
        provider.status !== 'live' ||
        (Number.isFinite(fetched) && now - fetched <= SNAPSHOT_MAX_AGE && fetched <= now + 300_000)
      )
        return provider;
      return {
        ...provider,
        status: 'stale',
        detail: `Scheduled collection overdue. Last source fetch: ${provider.fetchedAt ?? 'unknown'}.`,
      };
    }),
  };
}

/** Public reads never trigger snapshot, news or capital polling. Cold histories remain bounded on-demand reads. */
export function collectorReadService(service: DataService, cache: CacheStore, now = Date.now): DataService {
  return {
    ...service,
    getSnapshot: async () => collectedSnapshot(cache, now()),
    news: async () => {
      const cached = cache.get<NewsResult>('news');
      if (!cached) throw new HttpError(503, 'Waiting for the first scheduled governance collection.');
      if (now() - Date.parse(cached.value.fetchedAt) <= 2 * NEWS_INTERVAL) return cached.value;
      return {
        ...cached.value,
        sources: cached.value.sources.map((source) => ({
          ...source,
          status: 'stale',
          error: `Scheduled refresh overdue; cached ${cached.value.fetchedAt}.`,
        })),
      };
    },
  };
}

export interface JobState {
  status: 'running' | 'ok' | 'error';
  attemptedAt: number;
  finishedAt: number | null;
  lastSuccessAt: number | null;
}

/** One flight per job; durable due times survive restarts. Slow backfills cannot delay market polling. */
export class CollectorJobs {
  private running = new Map<string, Promise<void>>();
  constructor(
    private cache: CacheStore,
    private now = Date.now,
  ) {}
  run(name: string, interval: number, work: () => Promise<void>, retryInterval = 60_000): Promise<void> {
    const running = this.running.get(name);
    if (running) return running;
    const key = `collector:job:${name}`;
    const previous = this.cache.get<JobState>(key)?.value;
    // Failed jobs retry after one minute; successful jobs use their configured cadence.
    const delay = previous?.status === 'error' ? Math.min(interval, retryInterval) : interval;
    if (previous && this.now() - previous.attemptedAt < delay) return Promise.resolve();
    const state: JobState = {
      status: 'running',
      attemptedAt: this.now(),
      finishedAt: null,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
    };
    this.cache.set(key, state, this.now());
    const promise = Promise.resolve()
      .then(work)
      .then(() => {
        this.cache.set(
          key,
          { ...state, status: 'ok', finishedAt: this.now(), lastSuccessAt: this.now() },
          this.now(),
        );
        console.log(JSON.stringify({ job: name, status: 'ok', elapsedMs: this.now() - state.attemptedAt }));
      })
      .catch(() => {
        this.cache.set(key, { ...state, status: 'error', finishedAt: this.now() }, this.now());
        console.error(
          JSON.stringify({
            job: name,
            status: 'error',
            message: 'Collection incomplete; saved observations retained.',
          }),
        );
      })
      .finally(() => this.running.delete(name));
    this.running.set(name, promise);
    return promise;
  }
  states() {
    return Object.fromEntries(
      ['markets', 'news', 'capital', 'history', 'backup'].map((name) => [
        name,
        this.cache.get<JobState>(`collector:job:${name}`)?.value ?? null,
      ]),
    );
  }
}

/** Dedicated server-to-server token; never a wallet, trading or account credential. */
export function collectorAccess(token: string): RequestHandler {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Collector token must contain 32 random bytes as hex');
  const expected = Buffer.from(`Bearer ${token}`);
  let windowStart = Date.now(),
    requests = 0;
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.set('Allow', 'GET, HEAD').status(405).json({ error: 'Read-only collector' });
      return;
    }
    const provided = Buffer.from(req.headers.authorization ?? '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      res.status(401).json({ error: 'Collector authentication required' });
      return;
    }
    if (Date.now() - windowStart >= 60_000) {
      windowStart = Date.now();
      requests = 0;
    }
    if (++requests > 300) {
      res.set('Retry-After', '60').status(429).json({ error: 'Collector request limit; retry shortly.' });
      return;
    }
    next();
  };
}
