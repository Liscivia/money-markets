import type { Asset, Market, Protocol } from './types.js';
import { collateralAssets } from './market-details.js';

export interface ComparisonFilters {
  protocol: Protocol;
  network: string;
  debtAsset: string;
  collateralAsset: string;
  search: string;
}
export const comparisonFilters = (protocol: Protocol): ComparisonFilters => ({
  protocol,
  network: 'all',
  debtAsset: 'all',
  collateralAsset: 'all',
  search: '',
});
export const comparisonAssetKey = (chainId: number, asset: Asset) =>
  `${chainId}:${asset.address.toLowerCase()}`;

export function filterComparisonMarkets(markets: Market[], filters: ComparisonFilters): Market[] {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return markets
    .filter(
      (m) =>
        m.protocol === filters.protocol &&
        (filters.network === 'all' || String(m.chainId) === filters.network) &&
        (filters.debtAsset === 'all' || comparisonAssetKey(m.chainId, m.asset) === filters.debtAsset) &&
        (filters.collateralAsset === 'all' ||
          collateralAssets(m).some(
            (asset) => comparisonAssetKey(m.chainId, asset) === filters.collateralAsset,
          )) &&
        terms.every((term) =>
          `${m.version} ${m.name} ${m.id} ${m.address} ${m.asset.address} ${m.asset.symbol} ${m.chain} ${collateralAssets(
            m,
          )
            .map((asset) => asset.symbol)
            .join(' ')}`
            .toLowerCase()
            .includes(term),
        ),
    )
    .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd || a.id.localeCompare(b.id));
}

/** Never append an old selected market that fails the new filters. */
export function selectedComparisonMarket(matches: Market[], preferredId: string): Market | undefined {
  return matches.find((m) => m.id === preferredId) ?? matches[0];
}

export function comparisonOptions(markets: Market[], filters: ComparisonFilters) {
  const protocolMarkets = markets.filter((m) => m.protocol === filters.protocol);
  const networkMarkets = protocolMarkets.filter(
    (m) => filters.network === 'all' || String(m.chainId) === filters.network,
  );
  const networks = [
    ...new Map(
      protocolMarkets.map((m) => [String(m.chainId), { value: String(m.chainId), label: m.chain }]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const tokens = (collateral: boolean) =>
    [
      ...new Map(
        networkMarkets.flatMap((m) =>
          (collateral ? collateralAssets(m) : [m.asset]).map(
            (asset) =>
              [
                comparisonAssetKey(m.chainId, asset),
                {
                  value: comparisonAssetKey(m.chainId, asset),
                  label: `${asset.symbol} · ${m.chain} · ${asset.address.slice(0, 6)}…${asset.address.slice(-4)}`,
                },
              ] as const,
          ),
        ),
      ).values(),
    ].sort((a, b) => a.label.localeCompare(b.label));
  return { networks, debtAssets: tokens(false), collateralAssets: tokens(true) };
}

export function updateComparisonFilter<K extends keyof ComparisonFilters>(
  filters: ComparisonFilters,
  key: K,
  value: ComparisonFilters[K],
): ComparisonFilters {
  if (key === 'protocol') return comparisonFilters(value as Protocol);
  if (key === 'network') return { ...filters, network: value, debtAsset: 'all', collateralAsset: 'all' };
  return { ...filters, [key]: value };
}
