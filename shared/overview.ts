import type { Market } from './types.js';
import { totalLiquidity } from './metrics.js';

export const COMPARISON_MIN_LIQUIDITY = 5_000_000;
export const COMPARISON_MIN_SUPPLIED = 5_000_000;
export const COMPARISON_MIN_MARKET_DEBT = 1_000_000;
export const COMPARISON_MIN_PROTOCOL_DEBT = 5_000_000;
// Latest-reported research benchmark, not an execution quote. Source age stays
// visible; the opportunity engine retains its independent 15-minute cutoff.
export const COMPARISON_MAX_AGE_MS = 60 * 60_000;
export const COMPARISON_FETCH_MAX_AGE_MS = 15 * 60_000;
export type RateSide = 'borrowApy' | 'supplyApy';
export type RateMode = 'average' | 'best';
export const assetIdentity = (m: Market) => `${m.chainId}:${m.asset.address.toLowerCase()}`;
const positive = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
export const benchmarkScope = (m: Market) => m.listed && (m.protocol === 'Morpho' || m.version === 'V3');
export const activeBook = (m: Market) =>
  benchmarkScope(m) &&
  Number.isFinite(m.totalSupplyUsd) &&
  m.totalSupplyUsd >= COMPARISON_MIN_SUPPLIED &&
  Number.isFinite(m.totalBorrowUsd) &&
  m.totalBorrowUsd >= COMPARISON_MIN_MARKET_DEBT;
export const rateWeight = (m: Market, side: RateSide) =>
  positive(side === 'borrowApy' ? m.totalBorrowUsd : m.totalSupplyUsd);

export function rateExclusion(
  m: Market,
  side: RateSide,
  _mode: RateMode = 'average',
  now = Date.now(),
): string | null {
  if (!benchmarkScope(m)) return 'Outside V3 / Blue benchmark';
  if (!activeBook(m)) return 'Below $5M supplied or $1M borrowed';
  const fetched = Date.parse(m.fetchedAt);
  if (!Number.isFinite(fetched) || now - fetched > COMPARISON_FETCH_MAX_AGE_MS || fetched - now > 300_000)
    return 'Snapshot needs refresh';
  if (m.warnings.some((w) => /^(CRITICAL:|RED:)/i.test(w))) return 'Risk warning';
  // Collateral prices do not enter a loan-token rate or its USD book weight.
  // They remain essential to the independent opportunity engine.
  if (m.warnings.some((w) => /^STALE_/i.test(w) && !/^STALE_STATE:|^STALE_PRICE: Collateral /i.test(w)))
    return 'Loan valuation unavailable';
  const observed =
    m.protocol === 'Morpho' || m.rateObservedAt !== undefined ? Date.parse(m.rateObservedAt ?? '') : fetched;
  if (!Number.isFinite(observed)) return 'Source timestamp unavailable';
  if (now - observed > COMPARISON_MAX_AGE_MS || observed - now > 300_000)
    return 'Source observation over 1h old';
  if (m[side] === null || !Number.isFinite(m[side]) || m[side]! < 0) return 'Rate unavailable';
  return null;
}
export function eligibleRateMarkets(
  markets: Market[],
  side: RateSide,
  mode: RateMode = 'average',
  now = Date.now(),
) {
  return markets.filter((m) => rateExclusion(m, side, mode, now) === null);
}

/** Average and extreme use EXACTLY the same population. Neither is an executable offer. */
export function rateQuote(markets: Market[], side: RateSide, mode: RateMode, now = Date.now()) {
  const books = markets.filter(activeBook),
    excluded = new Map<string, number>();
  const eligible = books.filter((m) => {
    const reason = rateExclusion(m, side, mode, now);
    if (reason) excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
    return !reason;
  });
  const sorted = [...eligible].sort((a, b) =>
    mode === 'average'
      ? rateWeight(b, side) - rateWeight(a, side) || a.id.localeCompare(b.id)
      : (a[side]! - b[side]!) * (side === 'borrowApy' ? 1 : -1) ||
        b.liquidityUsd - a.liquidityUsd ||
        a.id.localeCompare(b.id),
  );
  const balance = eligible.reduce((s, m) => s + rateWeight(m, side), 0);
  const totalBalance = books.reduce((s, m) => s + rateWeight(m, side), 0);
  const supplied = eligible.reduce((s, m) => s + m.totalSupplyUsd, 0),
    borrowed = eligible.reduce((s, m) => s + m.totalBorrowUsd, 0);
  const rate =
    mode === 'best'
      ? (sorted[0]?.[side] ?? null)
      : balance > 0
        ? eligible.reduce((s, m) => s + m[side]! * rateWeight(m, side), 0) / balance
        : null;
  const observations = eligible.map((m) => Date.parse(m.rateObservedAt ?? m.fetchedAt));
  return {
    rate,
    balance,
    totalBalance,
    supplied,
    borrowed,
    utilization: supplied > 0 ? borrowed / supplied : null,
    liquidity: eligible.every((m) => Number.isFinite(m.liquidityUsd) && m.liquidityUsd >= 0)
      ? totalLiquidity(eligible)
      : null,
    count: eligible.length,
    totalCount: books.length,
    coverage: totalBalance > 0 ? balance / totalBalance : 0,
    representative: sorted[0],
    markets: sorted,
    low: eligible.length ? Math.min(...eligible.map((m) => m[side]!)) : null,
    high: eligible.length ? Math.max(...eligible.map((m) => m[side]!)) : null,
    oldest: observations.length ? Math.min(...observations) : null,
    newest: observations.length ? Math.max(...observations) : null,
    excluded: [...excluded].map(([reason, count]) => ({ reason, count })),
    reason: eligible.length ? null : ([...excluded.keys()][0] ?? 'No meaningful lending book'),
  };
}
export type RateQuote = ReturnType<typeof rateQuote>;

export function quoteAccess(m: Market, side: RateSide, now = Date.now()): string | null {
  if (m.isPaused || m.isFrozen) return 'Closed to entry';
  if (m.warnings.some((w) => /permissioned/i.test(w))) return 'Restricted access';
  if (
    m.warnings.some((w) => /^STALE_|^RED:|^CRITICAL:/i.test(w)) ||
    now - Date.parse(m.rateObservedAt ?? m.fetchedAt) > COMPARISON_FETCH_MAX_AGE_MS
  )
    return 'Recheck before entry';
  if (side === 'borrowApy' && !m.borrowingEnabled) return 'Borrowing disabled';
  if (!Number.isFinite(m.liquidityUsd) || m.liquidityUsd < COMPARISON_MIN_LIQUIDITY) return 'Under $5M cash';
  const capacity = side === 'borrowApy' ? m.borrowCapacityUsd : m.supplyCapacityUsd;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < COMPARISON_MIN_LIQUIDITY))
    return 'Under $5M headroom';
  return null;
}
export function comparisonNetworks(markets: Market[]) {
  const networks = new Map<number, { id: number; name: string; supplied: number }>();
  for (const m of markets.filter(benchmarkScope)) {
    const row = networks.get(m.chainId) ?? { id: m.chainId, name: m.chain, supplied: 0 };
    row.supplied += positive(m.totalSupplyUsd);
    networks.set(m.chainId, row);
  }
  return [...networks.values()].sort((a, b) => b.supplied - a.supplied || a.id - b.id);
}
export function defaultComparisonChain(markets: Market[]) {
  const networks = comparisonNetworks(markets);
  return networks.some((n) => n.id === 1) ? 1 : (networks[0]?.id ?? 1);
}
/** Rank demand, not collateral. Membership survives source outages. */
export function comparisonAssets(
  markets: Market[],
  limit = 6,
  chainId = defaultComparisonChain(markets),
  minCashUsd = 0,
) {
  const grouped = new Map<string, Market[]>();
  for (const m of markets.filter(
    (m) =>
      m.chainId === chainId &&
      benchmarkScope(m) &&
      (minCashUsd <= 0 || (Number.isFinite(m.liquidityUsd) && m.liquidityUsd >= minCashUsd)),
  ))
    grouped.set(assetIdentity(m), [...(grouped.get(assetIdentity(m)) ?? []), m]);
  return [...grouped.entries()]
    .map(([key, rows]) => ({
      key,
      symbol: rows[0].asset.symbol,
      address: rows[0].asset.address,
      chain: rows[0].chain,
      chainId,
      markets: rows,
      supplied: rows.reduce((s, m) => s + positive(m.totalSupplyUsd), 0),
      liquidity: totalLiquidity(rows),
      borrowed: rows.reduce((s, m) => s + positive(m.totalBorrowUsd), 0),
    }))
    .filter((row) =>
      ['Aave', 'Morpho'].every(
        (p) =>
          row.markets
            .filter((m) => m.protocol === p && activeBook(m))
            .reduce((s, m) => s + m.totalBorrowUsd, 0) >= COMPARISON_MIN_PROTOCOL_DEBT,
      ),
    )
    .sort((a, b) => b.borrowed - a.borrowed || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export interface MarketFilters {
  asset: string;
  protocol: string;
  chain: string;
  minLiquidityUsd: number;
  search: string;
}
export const EMPTY_MARKET_FILTERS: MarketFilters = {
  asset: 'all',
  protocol: 'all',
  chain: 'all',
  minLiquidityUsd: 0,
  search: '',
};
export function filterMarkets(markets: Market[], filters: MarketFilters): Market[] {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return markets.filter(
    (m) =>
      (filters.asset === 'all' || m.asset.symbol === filters.asset) &&
      (filters.protocol === 'all' || m.protocol === filters.protocol) &&
      (filters.chain === 'all' || m.chain === filters.chain) &&
      m.liquidityUsd >= Math.max(0, filters.minLiquidityUsd) &&
      terms.every((term) =>
        `${m.protocol} ${m.version} ${m.chain} ${m.asset.symbol} ${m.name} ${m.id} ${m.asset.address} ${m.collateral.map((c) => c.asset.symbol).join(' ')}`
          .toLowerCase()
          .includes(term),
      ),
  );
}
