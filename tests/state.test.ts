import test from 'node:test';
import assert from 'node:assert/strict';
import { withFallback } from '../server/state.js';
import { totalLiquidity } from '../shared/metrics.js';
import type { Market, Snapshot } from '../shared/types.js';
test('partial provider failure uses whole prior source once without duplicated financial totals', () => {
  const old = {
    fetchedAt: '2026-09-07T12:00:00Z',
    markets: [
      { id: 'a', protocol: 'Aave', totalSupplyUsd: 10 },
      { id: 'b', protocol: 'Aave', totalSupplyUsd: 20 },
    ],
    providers: [{ protocol: 'Aave', status: 'live', fetchedAt: '2026-09-07T12:00:00Z' }],
  } as Snapshot;
  const fresh = {
    fetchedAt: '2026-09-07T12:05:00Z',
    markets: [
      { id: 'a', protocol: 'Aave', totalSupplyUsd: 11 },
      { id: 'm', protocol: 'Morpho', totalSupplyUsd: 30 },
    ],
    providers: [
      { protocol: 'Aave', status: 'error' },
      { protocol: 'Morpho', status: 'live' },
    ],
  } as Snapshot;
  const result = withFallback(fresh, old);
  assert.equal(new Set(result.markets.map((m) => m.id)).size, result.markets.length);
  assert.equal(
    result.markets.reduce((s, m) => s + m.totalSupplyUsd, 0),
    60,
  );
  assert.equal(result.providers[0].status, 'stale');
  assert.equal(result.providers[0].fetchedAt, old.fetchedAt);
  assert.equal(result.providers[1].status, 'live');
  assert.equal(fresh.markets.length, 2, 'Input snapshot stays unchanged');
});
test('V4 hub liquidity is counted once across reserve rows', () => {
  const markets = [
    { liquidityUsd: 10 },
    { liquidityUsd: 8, liquidityGroupId: 'hub1', liquidityGroupUsd: 20 },
    { liquidityUsd: 12, liquidityGroupId: 'hub1', liquidityGroupUsd: 20 },
    { liquidityUsd: 4, liquidityGroupId: 'hub2', liquidityGroupUsd: 4 },
  ] as Market[];
  assert.equal(totalLiquidity(markets), 34);
});
