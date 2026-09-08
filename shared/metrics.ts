import type { Market } from './types.js';

/** V4 spokes can share the same hub liquidity. Count that liquidity once. */
export function totalLiquidity(markets: Market[]): number {
  const groups = new Map<string, number>();
  let sum = 0;
  for (const market of markets) {
    if (market.liquidityGroupId) {
      groups.set(
        market.liquidityGroupId,
        Math.max(groups.get(market.liquidityGroupId) ?? 0, market.liquidityGroupUsd ?? market.liquidityUsd),
      );
    } else sum += market.liquidityUsd;
  }
  return sum + [...groups.values()].reduce((a, b) => a + b, 0);
}
