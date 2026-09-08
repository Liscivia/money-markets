import type { Market, Protocol } from './types.js';
import { totalLiquidity } from './metrics.js';

export type CapitalMetric = 'depositsUsd' | 'debtUsd' | 'tvlUsd';
export interface CapitalTotals {
  depositsUsd: number | null;
  debtUsd: number | null;
  tvlUsd: number | null;
}
export interface CapitalComponent extends CapitalTotals {
  slug: string;
  label: string;
  url: string;
  available: boolean;
  reported: boolean;
  tvlObservedAt: string | null;
  debtObservedAt: string | null;
}
export interface ProtocolCapital extends CapitalTotals {
  protocol: Protocol;
  components: CapitalComponent[];
}
export interface ProtocolCapitalSnapshot {
  chain: string;
  fetchedAt: string;
  protocols: ProtocolCapital[];
  networks: { chain: string; protocols: ProtocolCapital[] }[];
  warnings: string[];
  networkReconciliation: {
    protocol: Protocol;
    metric: CapitalMetric;
    globalUsd: number;
    networkSumUsd: number;
    differenceUsd: number;
  }[];
}
export const CAPITAL_LABELS: Record<CapitalMetric, string> = {
  depositsUsd: 'Gross deposits',
  debtUsd: 'Outstanding debt',
  tvlUsd: 'TVL',
};
export const CAPITAL_METRICS: CapitalMetric[] = ['depositsUsd', 'debtUsd', 'tvlUsd'];
export interface CapitalHistoryPoint {
  timestamp: number;
  aaveTvl: number | null;
  morphoTvl: number | null;
  aaveBorrowed: number | null;
  morphoBorrowed: number | null;
  aaveDeposits: number | null;
  morphoDeposits: number | null;
}
export const HISTORY_KEYS = { depositsUsd: 'Deposits', debtUsd: 'Borrowed', tvlUsd: 'Tvl' } as const;
export function capitalHistoryStats(points: CapitalHistoryPoint[], metric: CapitalMetric) {
  return (['aave', 'morpho'] as const).map((protocol) => {
    const key = `${protocol}${HISTORY_KEYS[metric]}` as Exclude<keyof CapitalHistoryPoint, 'timestamp'>;
    const observed = points
      .filter((p) => p[key] !== null && Number.isFinite(p[key]))
      .sort((a, b) => a.timestamp - b.timestamp);
    const first = observed[0],
      last = observed.at(-1);
    const initial = first?.[key],
      latest = last?.[key] ?? null;
    return {
      protocol,
      latest,
      firstAt: first?.timestamp ?? null,
      lastAt: last?.timestamp ?? null,
      change: initial != null && initial > 0 && latest !== null ? (latest / initial - 1) * 100 : null,
    };
  });
}

/** Unknown components never become synthetic zero balances. */
export function sumKnown(values: (number | null)[]): number | null {
  return !values.length || values.some((v) => v === null || !Number.isFinite(v) || v < 0)
    ? null
    : (values as number[]).reduce((a, b) => a + b, 0);
}
export function capitalShares(values: (number | null)[]): number[] | null {
  const total = sumKnown(values);
  return total === null || total === 0 ? null : (values as number[]).map((v) => v / total);
}

/** These are indexed-market diagnostics, NOT standardized protocol totals. */
export function indexedCapital(markets: Market[], protocol: Protocol) {
  const rows = markets.filter((m) => m.protocol === protocol);
  const supply = rows.reduce((s, m) => s + m.totalSupplyUsd, 0);
  const debt = rows.reduce((s, m) => s + m.totalBorrowUsd, 0);
  const cash = totalLiquidity(rows);
  // Aave collateral is already included in reserve supply/cash. Never add its
  // collateral OPTIONS: the same reserve is eligible for many debt assets.
  const missingCollateral =
    protocol === 'Morpho' ? rows.filter((m) => m.segregatedCollateralUsd == null).length : 0;
  const reportedCollateral =
    protocol === 'Morpho' ? rows.reduce((s, m) => s + (m.segregatedCollateralUsd ?? 0), 0) : 0;
  return {
    count: rows.length,
    supplyUsd: rows.length ? supply : null,
    debtUsd: rows.length ? debt : null,
    cashUsd: rows.length ? cash : null,
    reportedCollateralUsd: rows.length ? reportedCollateral : null,
    loanCashResidualUsd: rows.length ? supply - debt - cash : null,
    missingCollateral,
    heldAssetsSubtotalUsd: rows.length ? cash + reportedCollateral : null,
    observedAt:
      rows
        .map((m) => m.fetchedAt)
        .filter(Boolean)
        .sort()[0] ?? null,
  };
}
