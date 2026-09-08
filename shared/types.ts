export type Protocol = 'Aave' | 'Morpho';
export interface Asset {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
  nativeApr: number | null;
  nativeYieldSource?: string;
  nativeYieldLookbackSeconds?: number;
}
export interface CollateralOption {
  asset: Asset;
  ltv: number;
  liquidationThreshold: number;
  supplyCapacityUsd: number | null;
  supplyApy: number;
  mode?: string;
}
export interface CollateralCap {
  status: 'capped' | 'uncapped' | 'unknown';
  usedUsd: number | null;
  limitUsd: number | null;
  usedTokens: number | null;
  limitTokens: number | null;
  usedRatio: number | null;
}
/** Protocol configuration for display, NOT the conservative opportunity allowlist. */
export interface CollateralDetail {
  asset: Asset;
  mode: string;
  ltv: number | null;
  liquidationThreshold: number | null;
  supplyCap: CollateralCap;
  supplyHeadroomUsd: number | null;
  newSupplyEnabled: boolean;
  restrictions: string[];
  isolationDebt?: { usedUsd: number | null; ceilingUsd: number | null };
}
export interface RateModel {
  kind: 'aave-kink' | 'morpho-adaptive';
  optimalUtilization: number;
  baseApr: number;
  slope1: number;
  slope2: number;
}
export interface Market {
  id: string;
  protocol: Protocol;
  version: string;
  chainId: number;
  chain: string;
  name: string;
  address: string;
  asset: Asset;
  collateral: CollateralOption[];
  collateralDetails?: CollateralDetail[];
  supplyApy: number | null;
  borrowApy: number | null;
  supplyRewardApr: number;
  borrowRewardApr: number;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  liquidityUsd: number;
  /** Morpho borrower collateral, separate from the lending book; null means unvalued. */
  segregatedCollateralUsd?: number | null;
  liquidityGroupId?: string;
  liquidityGroupUsd?: number;
  borrowCapacityUsd: number;
  supplyCapacityUsd: number | null;
  utilization: number;
  lltv: number | null;
  listed: boolean;
  isFrozen: boolean;
  isPaused: boolean;
  borrowingEnabled: boolean;
  sourceUrl: string;
  fetchedAt: string;
  warnings: string[];
  /** Source rate-state observation time, distinct from the API retrieval time. */
  rateObservedAt?: string | null;
  rateModel?: RateModel;
  historyRef: Record<string, string | number>;
}
export interface ProviderStatus {
  protocol: Protocol;
  status: 'live' | 'stale' | 'error';
  fetchedAt: string | null;
  marketCount: number;
  detail?: string;
  coverage: string;
}
export interface Snapshot {
  markets: Market[];
  providers: ProviderStatus[];
  fetchedAt: string;
}
export interface HistoryPoint {
  timestamp: number;
  supplyApy: number | null;
  borrowApy: number | null;
  totalSupplyUsd?: number | null;
  totalBorrowUsd?: number | null;
  utilization?: number | null;
}
export interface MarketHistory {
  marketId: string;
  points: HistoryPoint[];
  source: string;
  fetchedAt: string;
  warning?: string;
}
export interface Opportunity {
  id: string;
  type: 'native-loop' | 'same-asset-carry';
  title: string;
  chainId: number;
  chain: string;
  borrowMarketId: string;
  lendMarketId?: string;
  borrowProtocol: Protocol;
  lendProtocol: Protocol | 'Native';
  collateralSymbol: string;
  debtSymbol: string;
  nativeApr: number;
  lendingApr: number;
  borrowApr: number;
  spreadApr: number;
  leverage: number;
  targetLtv: number;
  liquidationThreshold: number;
  healthFactor: number;
  grossReturnOnEquity: number;
  netReturnOnEquity: number;
  borrowLiquidityUsd: number;
  capacityUsd: number;
  equityUsd: number;
  exposureUsd: number;
  /** Posted collateral is not the same as gross assets for cross-protocol carry. */
  collateralUsd: number;
  debtUsd: number;
  externalSupplyUsd: number;
  collateralLendingApr: number;
  modeledLendingApr: number | null;
  leveragePolicy: {
    requested: number;
    minHealthFactor: number;
    protocolMaxLtv: number;
    collateralMode: string;
    limitingFactor: 'requested' | 'health-factor' | 'protocol-ltv' | 'screen-ltv';
  };
  modeledBorrowApr: number | null;
  modeledNetReturnOnEquity: number | null;
  assumptions: string[];
  eligible: boolean;
  exclusionReasons: string[];
}
export interface OpportunityResult {
  loops: Opportunity[];
  carry: Opportunity[];
  excluded: Opportunity[];
  minLiquidityUsd: number;
  targetLeverage: number;
  debtSizeUsd: number;
  minHealthFactor: number;
  methodology: string[];
  fetchedAt: string;
}
export interface NewsItem {
  id: string;
  protocol: Protocol;
  title: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  category: string;
  source: string;
  replies?: number;
}
export interface NewsResult {
  items: NewsItem[];
  sources: { protocol: Protocol; url: string; status: string; error?: string }[];
  fetchedAt: string;
}
