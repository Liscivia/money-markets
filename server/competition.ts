import {
  sumKnown,
  CAPITAL_METRICS,
  CAPITAL_LABELS,
  type CapitalComponent,
  type ProtocolCapital,
  type ProtocolCapitalSnapshot,
} from '../shared/protocol-capital.js';
import type { CompetitionHistory } from '../shared/competition.js';
import type { CacheStore } from './store.js';
import { HttpError } from './errors.js';
export type { CompetitionHistory } from '../shared/competition.js';
export type TvlPoint = { date: number; totalLiquidityUSD: number };
export type RawProtocol = { name: string; tvl: TvlPoint[]; chainTvls: Record<string, { tvl?: TvlPoint[] }> };
export interface LiquidityBenchmark {
  slug: string;
  label: string;
  url: string;
  tvlUsd: number | null;
  borrowedUsd: number | null;
  observedAt: string | null;
  borrowedObservedAt: string | null;
}
export interface LiquidityBenchmarks {
  rows: LiquidityBenchmark[];
  fetchedAt: string;
  warnings: string[];
}
const slugs = ['aave-v3', 'aave-v4', 'morpho-blue'] as const;
type RawResult = { at: number; rows: (RawProtocol | null)[]; warnings: string[] };
/** DefiLlama also returns large token-level ledgers which this app never uses. */
export function compactProtocol(data: RawProtocol): RawProtocol {
  if (!Array.isArray(data.tvl) || !data.chainTvls || typeof data.chainTvls !== 'object')
    throw new Error('Protocol capital history is unavailable');
  return {
    name: data.name,
    tvl: data.tvl,
    chainTvls: Object.fromEntries(
      Object.entries(data.chainTvls).map(([chain, value]) => [chain, { tvl: value.tvl }]),
    ),
  };
}
let cachedRaw: RawResult | null = null;
let flight: Promise<RawResult> | null = null;
const RAW_KEY = 'defillama:raw-capital-v2';
let scheduledStore: CacheStore | null = null;
/** Collector only: cards and every chain's history share one durable source generation. */
export function useScheduledCompetition(store: CacheStore) {
  scheduledStore = store;
  cachedRaw = store.get<RawResult>(RAW_KEY)?.value ?? null;
}
export async function refreshScheduledCompetition() {
  return rawData(true);
}
async function rawData(force = false): Promise<RawResult> {
  if (scheduledStore && !force) {
    if (!cachedRaw) throw new HttpError(503, 'Protocol capital is awaiting its first scheduled collection.');
    return Date.now() - cachedRaw.at <= 36 * 3600_000
      ? cachedRaw
      : {
          ...cachedRaw,
          warnings: [
            ...cachedRaw.warnings,
            `Scheduled capital refresh overdue; cached ${new Date(cachedRaw.at).toISOString()}.`,
          ],
        };
  }
  if (!force && cachedRaw && Date.now() - cachedRaw.at < 3600_000) return cachedRaw;
  if (flight) return flight;
  flight = (async () => {
    // Parse one large upstream response at a time, then retain only capital series.
    // Parallel full-protocol JSON responses cause avoidable daily memory spikes.
    const results: PromiseSettledResult<RawProtocol>[] = [];
    for (const slug of slugs) {
      try {
        const r = await fetch(`https://api.llama.fi/protocol/${slug}`, {
          signal: AbortSignal.timeout(25_000),
        });
        if (!r.ok) throw new Error(`${slug}: HTTP ${r.status}`);
        results.push({ status: 'fulfilled', value: compactProtocol((await r.json()) as RawProtocol) });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    }
    const warnings = results.flatMap((r, i) =>
      r.status === 'rejected' ? [`${slugs[i]}: source unavailable`] : [],
    );
    const rows = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    if (scheduledStore && warnings.length && cachedRaw) {
      cachedRaw = {
        ...cachedRaw,
        warnings: [
          ...warnings,
          `Retaining the complete capital snapshot from ${new Date(cachedRaw.at).toISOString()}.`,
        ],
      };
      scheduledStore.set(RAW_KEY, cachedRaw, cachedRaw.at);
      throw new Error('Incomplete capital refresh; previous source generation retained');
    }
    if (!rows.some(Boolean)) throw new Error('Protocol history source unavailable');
    cachedRaw = { at: Date.now(), rows, warnings };
    scheduledStore?.set(RAW_KEY, cachedRaw, cachedRaw.at);
    return cachedRaw;
  })().finally(() => {
    flight = null;
  });
  return flight;
}
const aliases: Record<string, string> = {
  'Ethereum Mainnet': 'Ethereum',
  'Arbitrum One': 'Arbitrum',
  'Polygon PoS': 'Polygon',
  'BNB Smart Chain': 'Binance',
  'BNB Chain': 'Binance',
  BSC: 'Binance',
  'Avalanche C-Chain': 'Avalanche',
  'OP Mainnet': 'Optimism',
  zkSync: 'zkSync Era',
  'zkSync Era': 'zkSync Era',
  'Gnosis Chain': 'xDai',
  Gnosis: 'xDai',
  HyperEVM: 'Hyperliquid L1',
  'Tempo Mainnet': 'Tempo',
};
export function series(data: RawProtocol | null, chain: string, borrow = false): TvlPoint[] | null {
  if (!data) return null;
  if (chain === 'all') return borrow ? (data.chainTvls.borrowed?.tvl ?? null) : data.tvl;
  const name = aliases[chain] ?? chain;
  const key = Object.keys(data.chainTvls).find(
    (k) => k.toLowerCase() === `${name}${borrow ? '-borrowed' : ''}`.toLowerCase(),
  );
  return key ? (data.chainTvls[key]?.tvl ?? null) : null;
}
export function daily(points: TvlPoint[] | null): Map<number, number> | null {
  if (points === null) return null;
  const result = new Map<number, number>();
  for (const p of [...points].sort((a, b) => a.date - b.date)) {
    if (Number.isFinite(p.date) && Number.isFinite(p.totalLiquidityUSD) && p.totalLiquidityUSD >= 0)
      result.set(Math.floor(p.date / 86400) * 86400, p.totalLiquidityUSD);
  }
  return result;
}
function at(map: Map<number, number> | null, timestamp: number) {
  if (map === null) return null;
  if (map.size === 0) return 0; // Source confirms no deployment for this chain.
  if (timestamp < Math.min(...map.keys())) return 0; // Before deployment inception, not missing active history.
  return map.get(timestamp) ?? null;
}
function sum(a: number | null, b: number | null) {
  return a === null || b === null ? null : a + b;
}
function reportsChain(data: RawProtocol | null, chain: string): boolean {
  if (!data) return false;
  if (chain === 'all') return true;
  return Object.keys(data.chainTvls).some(
    (key) => key.toLowerCase() === (aliases[chain] ?? chain).toLowerCase(),
  );
}
export function aaveAt(
  rows: (RawProtocol | null)[],
  maps: (Map<number, number> | null)[],
  chain: string,
  timestamp: number,
): number | null {
  // A present source with no such network isn't a failed source. Sum only its
  // reported components, and disclose that scope below. Entire-source failure
  // or a missing observation inside a tracked component must still stay null.
  const indices =
    chain === 'all' || !rows[0] || !rows[1] ? [0, 1] : [0, 1].filter((i) => reportsChain(rows[i], chain));
  return indices.length
    ? indices.reduce<number | null>((total, i) => sum(total, at(maps[i], timestamp)), 0)
    : null;
}
export async function fetchCompetition(days: number, chain = 'all'): Promise<CompetitionHistory> {
  const data = await rawData();
  const maps = data.rows.map((r) => daily(series(r, chain)));
  const borrows = data.rows.map((r) => daily(series(r, chain, true)));
  const end = Math.floor(Date.now() / 86400_000) * 86400;
  const start = end - days * 86400;
  const points = [];
  for (let timestamp = start; timestamp <= end; timestamp += 86400) {
    const aaveTvl = aaveAt(data.rows, maps, chain, timestamp),
      morphoTvl = at(maps[2], timestamp);
    const aaveBorrowed = aaveAt(data.rows, borrows, chain, timestamp),
      morphoBorrowed = at(borrows[2], timestamp);
    points.push({
      timestamp,
      aaveTvl,
      morphoTvl,
      aaveBorrowed,
      morphoBorrowed,
      aaveDeposits: sum(aaveTvl, aaveBorrowed),
      morphoDeposits: sum(morphoTvl, morphoBorrowed),
    });
  }
  const warnings = [...data.warnings];
  if (chain !== 'all')
    data.rows.forEach((row, i) => {
      if (row && !reportsChain(row, chain))
        warnings.push(
          `${['Aave V3', 'Aave V4', 'Morpho Blue'][i]}: DefiLlama does not report ${chain}. Only reported components are charted; absent coverage is not proof of no deployment.`,
        );
    });
  return {
    points,
    fetchedAt: new Date(data.at).toISOString(),
    source: 'https://defillama.com/protocols/Lending',
    coverage: `${chain === 'all' ? 'All chains' : chain} · Reported Aave V3 + V4 versus Morpho Blue. Gross deposits = DefiLlama TVL + debt, a standardized gross-capital proxy, not the API lending book. TVL excludes outstanding loans and includes held collateral.`,
    warnings,
  };
}

export function latestPoint(points: TvlPoint[] | undefined): TvlPoint | null {
  return (points ?? [])
    .filter(
      (p) => Number.isFinite(p.date) && Number.isFinite(p.totalLiquidityUSD) && p.totalLiquidityUSD >= 0,
    )
    .reduce<TvlPoint | null>((latest, p) => (!latest || p.date > latest.date ? p : latest), null);
}
export async function fetchLiquidityBenchmarks(): Promise<LiquidityBenchmarks> {
  const data = await rawData();
  return {
    fetchedAt: new Date(data.at).toISOString(),
    warnings: data.warnings,
    rows: data.rows.map((row, i) => {
      const tvl = latestPoint(row?.tvl),
        borrowed = latestPoint(row?.chainTvls.borrowed?.tvl);
      return {
        slug: slugs[i],
        label: ['Aave V3', 'Aave V4', 'Morpho Blue'][i],
        url: `https://defillama.com/protocol/${slugs[i]}`,
        tvlUsd: tvl?.totalLiquidityUSD ?? null,
        borrowedUsd: borrowed?.totalLiquidityUSD ?? null,
        observedAt: tvl ? new Date(tvl.date * 1000).toISOString() : null,
        borrowedObservedAt: borrowed ? new Date(borrowed.date * 1000).toISOString() : null,
      };
    }),
  };
}

const labels = ['Aave V3', 'Aave V4', 'Morpho Blue'];
function component(row: RawProtocol | null, i: number, chain: string): CapitalComponent {
  const tvl = latestPoint(series(row, chain) ?? undefined);
  const debt = latestPoint(series(row, chain, true) ?? undefined);
  // Do not manufacture gross deposits by adding values from different observations.
  const depositsUsd =
    tvl && debt && tvl.date === debt.date ? tvl.totalLiquidityUSD + debt.totalLiquidityUSD : null;
  return {
    slug: slugs[i],
    label: labels[i],
    url: `https://defillama.com/protocol/${slugs[i]}`,
    available: row !== null,
    reported: reportsChain(row, chain),
    depositsUsd,
    tvlUsd: tvl?.totalLiquidityUSD ?? null,
    debtUsd: debt?.totalLiquidityUSD ?? null,
    tvlObservedAt: tvl ? new Date(tvl.date * 1000).toISOString() : null,
    debtObservedAt: debt ? new Date(debt.date * 1000).toISOString() : null,
  };
}
export function protocolCapital(rows: (RawProtocol | null)[], chain: string): ProtocolCapital[] {
  const components = slugs.map((_, i) => component(rows[i] ?? null, i, chain));
  return (['Aave', 'Morpho'] as const).map((protocol) => {
    const all = protocol === 'Aave' ? components.slice(0, 2) : components.slice(2);
    // Skip an unreported network only if the source itself succeeded. Source
    // failure stays unknown, never masquerades as a smaller complete total.
    const selected = all.filter((c) => chain === 'all' || c.reported || !c.available);
    return {
      protocol,
      components: all,
      tvlUsd: sumKnown(selected.map((c) => c.tvlUsd)),
      debtUsd: sumKnown(selected.map((c) => c.debtUsd)),
      depositsUsd: sumKnown(selected.map((c) => c.depositsUsd)),
    };
  });
}
export function buildProtocolCapital(
  rows: (RawProtocol | null)[],
  chain: string,
  fetchedAt: string,
  initialWarnings: string[] = [],
): ProtocolCapitalSnapshot {
  const protocols = protocolCapital(rows, chain);
  const excluded = /^(borrowed|staking|pool2|vesting|treasury|offers|doublecounted|liquidstaking)$/i;
  const names = [
    ...new Set(
      rows.flatMap((row) =>
        Object.keys(row?.chainTvls ?? {}).filter(
          (key) =>
            !/-(borrowed|staking|pool2|vesting|treasury|offers|doublecounted|liquidstaking)$/i.test(key) &&
            !excluded.test(key),
        ),
      ),
    ),
  ].sort();
  const warnings = [...initialWarnings];
  for (const c of protocols.flatMap((p) => p.components)) {
    if (!c.available) {
      if (!warnings.some((w) => w.startsWith(c.slug)))
        warnings.push(`${c.slug}: source unavailable; totals remain unknown.`);
    } else if (!c.reported)
      warnings.push(
        `${c.label}: ${chain} is not reported by DefiLlama. This is missing coverage, not a confirmed zero balance.`,
      );
    else if (c.tvlUsd === null || c.debtUsd === null)
      warnings.push(`${c.label}: a capital observation is missing.`);
    else if (c.depositsUsd === null)
      warnings.push(`${c.label}: TVL and debt timestamps differ; gross deposits are withheld.`);
  }
  const networks =
    chain === 'all'
      ? names.map((name) => ({ chain: name, protocols: protocolCapital(rows, name) }))
      : [{ chain, protocols }];
  const networkReconciliation: ProtocolCapitalSnapshot['networkReconciliation'] = [];
  if (chain === 'all')
    for (const p of protocols) {
      for (const metric of CAPITAL_METRICS) {
        const globalUsd = p[metric];
        const reported = networks
          .map((n) => n.protocols.find((row) => row.protocol === p.protocol)?.[metric] ?? null)
          .filter((v) => v !== null);
        const networkSumUsd = sumKnown(reported);
        if (globalUsd === null || networkSumUsd === null) continue;
        const differenceUsd = networkSumUsd - globalUsd;
        networkReconciliation.push({ protocol: p.protocol, metric, globalUsd, networkSumUsd, differenceUsd });
        // Ignore per-chain integer rounding, but disclose real source residuals.
        // Gross deposits inherits both residuals, so avoid a duplicate warning.
        if (metric !== 'depositsUsd' && Math.abs(differenceUsd) > Math.max(1000, names.length * 2)) {
          const amount = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
            maximumFractionDigits: 2,
          }).format(Math.abs(differenceUsd));
          const percent =
            globalUsd > 0 ? ` (${((Math.abs(differenceUsd) / globalUsd) * 100).toFixed(2)}%)` : '';
          warnings.push(
            `DefiLlama source reconciliation: ${p.protocol} reported network ${CAPITAL_LABELS[metric]} totals are ${amount}${percent} ${differenceUsd > 0 ? 'above' : 'below'} its global series. Cards and history use the global series; network bars retain the reported chain values. The residual is not attributed or forced to zero.`,
          );
        }
      }
    }
  return { chain, fetchedAt, protocols, networks, warnings, networkReconciliation };
}
export async function fetchProtocolCapital(chain = 'all'): Promise<ProtocolCapitalSnapshot> {
  const data = await rawData();
  return buildProtocolCapital(data.rows, chain, new Date(data.at).toISOString(), data.warnings);
}
