import type { Snapshot } from '../shared/types.js';

/** A failed source's partial fresh pages cannot be mixed with its cached full snapshot. */
export function withFallback(fresh: Snapshot, previous: Snapshot | null): Snapshot {
  const result: Snapshot = {
    ...fresh,
    markets: [...fresh.markets],
    providers: fresh.providers.map((p) => ({ ...p })),
  };
  if (!previous) return result;
  for (const provider of result.providers) {
    if (provider.status !== 'error') continue;
    const prior = previous.markets.filter((m) => m.protocol === provider.protocol);
    if (!prior.length) continue;
    result.markets = result.markets.filter((m) => m.protocol !== provider.protocol);
    result.markets.push(...prior);
    provider.status = 'stale';
    provider.marketCount = prior.length;
    provider.fetchedAt =
      previous.providers.find((p) => p.protocol === provider.protocol)?.fetchedAt ?? previous.fetchedAt;
    provider.detail = `${provider.detail ?? 'Upstream unavailable'}. Showing cached source data from ${provider.fetchedAt}.`;
  }
  return result;
}
