import type { CollateralCap, CollateralDetail, Market } from './types.js';

const valid = (n: number | null) => n !== null && Number.isFinite(n) && n >= 0;
export function collateralCap(
  usedTokens: number | null,
  limitTokens: number | null,
  priceUsd: number | null,
  zeroMeansUncapped: boolean,
): CollateralCap {
  const used = valid(usedTokens) ? usedTokens : null;
  const limit = valid(limitTokens) ? limitTokens : null;
  const price = priceUsd !== null && Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;
  const status = limit === null ? 'unknown' : limit === 0 && zeroMeansUncapped ? 'uncapped' : 'capped';
  return {
    status,
    usedTokens: used,
    limitTokens: status === 'capped' ? limit : null,
    usedUsd: used !== null && price !== null ? used * price : null,
    limitUsd: status === 'capped' && limit !== null && price !== null ? limit * price : null,
    usedRatio: status === 'capped' && limit !== null && limit > 0 && used !== null ? used / limit : null,
  };
}
export function collateralAssets(market: Market) {
  return (market.collateralDetails ?? market.collateral).map((c) => c.asset);
}
export function groupCollateral(details: CollateralDetail[]) {
  const groups = new Map<string, { asset: CollateralDetail['asset']; details: CollateralDetail[] }>();
  for (const detail of details) {
    const key = detail.asset.address.toLowerCase();
    const group = groups.get(key) ?? { asset: detail.asset, details: [] };
    if (
      !group.details.some(
        (d) =>
          d.mode === detail.mode &&
          d.ltv === detail.ltv &&
          d.liquidationThreshold === detail.liquidationThreshold,
      )
    )
      group.details.push(detail);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.asset.symbol.localeCompare(b.asset.symbol) || a.asset.address.localeCompare(b.asset.address),
  );
}
