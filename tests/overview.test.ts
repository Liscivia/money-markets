import assert from 'node:assert/strict';
import test from 'node:test';
import type { Market } from '../shared/types.js';
import {
  comparisonAssets,
  defaultComparisonChain,
  rateQuote,
  quoteAccess,
  filterMarkets,
  EMPTY_MARKET_FILTERS,
  COMPARISON_MAX_AGE_MS,
  COMPARISON_FETCH_MAX_AGE_MS,
} from '../shared/overview.js';
import { ratePercent } from '../src/components/LiquidAssetComparison.js';

const now = Date.now(),
  fetchedAt = new Date(now).toISOString();
function market(id: string, overrides: Partial<Market> = {}): Market {
  return {
    id,
    protocol: 'Aave',
    version: 'V3',
    chainId: 1,
    chain: 'Ethereum',
    name: 'Core',
    address: 'pool',
    asset: { address: '0xUSDC', symbol: 'USDC', decimals: 6, priceUsd: 1, nativeApr: null },
    collateral: [],
    supplyApy: 0.03,
    borrowApy: 0.04,
    supplyRewardApr: 0,
    borrowRewardApr: 0,
    totalSupplyUsd: 50e6,
    totalBorrowUsd: 40e6,
    liquidityUsd: 10e6,
    borrowCapacityUsd: 10e6,
    supplyCapacityUsd: null,
    utilization: 0.8,
    lltv: null,
    listed: true,
    isFrozen: false,
    isPaused: false,
    borrowingEnabled: true,
    sourceUrl: '',
    fetchedAt,
    rateObservedAt: fetchedAt,
    warnings: [],
    historyRef: {},
    ...overrides,
  };
}
const quote = (rows: Market[], side: 'borrowApy' | 'supplyApy', mode: 'average' | 'best') =>
  rateQuote(rows, side, mode, now);
const near = (value: number | null, expected: number) =>
  assert.ok(value !== null && Math.abs(value - expected) < 1e-12, `${value} != ${expected}`);
const pair = (id: string, overrides: Partial<Market> = {}) => [
  market(id + 'a', overrides),
  market(id + 'm', { ...overrides, protocol: 'Morpho', version: 'Blue' }),
];

test('Borrow is debt weighted; supply is deposit weighted, never idle-cash weighted', () => {
  const rows = [
    market('a', {
      borrowApy: 0.02,
      supplyApy: 0.01,
      totalBorrowUsd: 90e6,
      totalSupplyUsd: 100e6,
      liquidityUsd: 1e6,
    }),
    market('b', { borrowApy: 0.06, supplyApy: 0.04, totalBorrowUsd: 10e6, liquidityUsd: 30e6 }),
  ];
  near(quote(rows, 'borrowApy', 'average').rate, 0.024);
  near(quote(rows, 'supplyApy', 'average').rate, 0.02);
  assert.equal(quote(rows, 'borrowApy', 'average').balance, 100e6);
  assert.equal(quote(rows, 'supplyApy', 'average').balance, 150e6);
});
test('Average and extreme share the same population, even for low-cash or capped books', () => {
  const rows = [
    market('a'),
    market('b', {
      borrowApy: 0.01,
      supplyApy: 0.09,
      liquidityUsd: 10,
      borrowCapacityUsd: 0,
      supplyCapacityUsd: 0,
    }),
  ];
  for (const side of ['borrowApy', 'supplyApy'] as const) {
    const avg = quote(rows, side, 'average'),
      best = quote(rows, side, 'best');
    assert.deepEqual(avg.markets.map((m) => m.id).sort(), best.markets.map((m) => m.id).sort());
    assert.ok(avg.low! <= avg.rate! && avg.rate! <= avg.high!);
    assert.equal(best.representative.id, 'b');
  }
});
test('Dust and near-idle collateral inventories never dominate either rate', () => {
  const rows = [
    market('a'),
    market('dust', { totalSupplyUsd: 1000, totalBorrowUsd: 999, supplyApy: 1000, borrowApy: 1000 }),
    market('collateral', { totalSupplyUsd: 10e9, totalBorrowUsd: 1000, supplyApy: 0 }),
  ];
  assert.equal(quote(rows, 'borrowApy', 'average').count, 1);
  near(quote(rows, 'borrowApy', 'average').rate, 0.04);
  near(quote(rows, 'supplyApy', 'average').rate, 0.03);
});
test('Both rate sides exclude V4 rather than blending different protocol scopes', () => {
  for (const side of ['borrowApy', 'supplyApy'] as const)
    for (const mode of ['average', 'best'] as const)
      assert.equal(quote([market('v4', { version: 'V4' })], side, mode).rate, null);
});
test('Major assets rank actual debt on both protocols, not gross deposits', () => {
  const rows = [
    ...pair('usdc'),
    ...pair('weth', {
      totalBorrowUsd: 90e6,
      totalSupplyUsd: 100e6,
      asset: { ...market('').asset, symbol: 'WETH', address: '0xweth' },
    }),
    ...pair('collateral', {
      totalSupplyUsd: 10e9,
      totalBorrowUsd: 1000,
      asset: { ...market('').asset, symbol: 'weETH', address: '0xweeth' },
    }),
  ];
  assert.deepEqual(
    comparisonAssets(rows).map((a) => a.symbol),
    ['WETH', 'USDC'],
  );
  assert.equal(comparisonAssets(rows)[0].borrowed, 180e6);
});
test('A one-sided asset cannot fill the shared benchmark with empty comparisons', () => {
  const rows = [
    ...pair('usdc'),
    market('only', {
      asset: { ...market('').asset, address: '0xonly', symbol: 'ONLY' },
      totalSupplyUsd: 10e9,
    }),
  ];
  assert.equal(comparisonAssets(rows).length, 1);
  assert.equal(comparisonAssets([rows.at(-1)!]).length, 0);
});
test('Source outage does not silently replace an important shared asset', () => {
  const rows = pair('usdc').map((m) => ({ ...m, rateObservedAt: null }));
  assert.equal(comparisonAssets(rows).length, 1);
  assert.equal(quote(rows, 'borrowApy', 'average').rate, null);
});
test('Exact addresses and networks prevent ticker-only and cross-chain blending', () => {
  const rows = [
    ...pair('eth'),
    ...pair('base', { chain: 'Base', chainId: 8453 }),
    ...pair('other', { asset: { ...market('').asset, address: '0xnotusdc' } }),
  ];
  assert.equal(defaultComparisonChain(rows), 1);
  assert.equal(comparisonAssets(rows).length, 2);
  assert.equal(comparisonAssets(rows, 6, 8453).length, 1);
  assert.equal(
    comparisonAssets(
      pair('case').map((m, i) => ({ ...m, asset: { ...m.asset, address: i ? '0xUSDC' : '0xusdc' } })),
    ).length,
    1,
  );
});
test('At most six meaningful assets, stable across both rate sides', () => {
  const rows = Array.from({ length: 9 }, (_, i) =>
    pair(String(i), { totalBorrowUsd: (i + 1) * 2e6, asset: { ...market('').asset, address: '0x' + i } }),
  ).flat();
  assert.equal(comparisonAssets(rows).length, 6);
  assert.equal(comparisonAssets(rows)[0].address, '0x8');
});
test('Cash screen applies before grouping and to both averages and extremes, never sums small cash balances', () => {
  const rows = [
    ...pair('liquid'),
    market('thin', { protocol: 'Morpho', liquidityUsd: 1e6, supplyApy: 0.99 }),
  ];
  const liquid = comparisonAssets(rows, 6, 1, 5e6)[0];
  assert.equal(liquid.markets.length, 2);
  for (const mode of ['average', 'best'] as const) near(quote(liquid.markets, 'supplyApy', mode).rate, 0.03);
  assert.equal(comparisonAssets(pair('thin', { liquidityUsd: 3e6 }), 6, 1, 5e6).length, 0);
  assert.equal(comparisonAssets(pair('thin', { liquidityUsd: 3e6 }), 6, 1).length, 1);
});
test('Latest-reported benchmark admits a 40-minute observation, preserves its age, but flags entry recheck', () => {
  const old = market('old', {
    protocol: 'Morpho',
    rateObservedAt: new Date(now - 40 * 60_000).toISOString(),
    warnings: ['STALE_STATE: more than 15 minutes old'],
  });
  const avg = quote([old], 'borrowApy', 'average');
  near(avg.rate, 0.04);
  assert.equal(avg.oldest, now - 40 * 60_000);
  assert.equal(quoteAccess(old, 'borrowApy', now), 'Recheck before entry');
});
test('Unknown, too old, future, invalid and critical-risk data cannot enter either mode', () => {
  const overrides: Partial<Market>[] = [
    { borrowApy: null, supplyApy: null },
    { borrowApy: Infinity, supplyApy: NaN },
    { rateObservedAt: null },
    { protocol: 'Morpho', rateObservedAt: undefined },
    { rateObservedAt: new Date(now - COMPARISON_MAX_AGE_MS - 1).toISOString() },
    { rateObservedAt: new Date(now + 300_001).toISOString() },
    { fetchedAt: new Date(now - COMPARISON_FETCH_MAX_AGE_MS - 1).toISOString() },
    { fetchedAt: '' },
    { warnings: ['RED: risk'] },
    { warnings: ['CRITICAL: risk'] },
    { warnings: ['STALE_PRICE: Loan asset USDC'] },
    { totalBorrowUsd: NaN },
    { totalSupplyUsd: Infinity },
    { borrowApy: -0.01, supplyApy: -0.01 },
  ];
  for (const patch of overrides)
    for (const side of ['borrowApy', 'supplyApy'] as const)
      for (const mode of ['average', 'best'] as const)
        assert.equal(quote([market('bad', patch)], side, mode).rate, null, JSON.stringify(patch));
});
test('Collateral valuation does not enter loan APYs but is still flagged before entry', () => {
  const m = market('col', { warnings: ['STALE_PRICE: Collateral asset price missing'] });
  near(quote([m], 'supplyApy', 'average').rate, 0.03);
  assert.equal(quoteAccess(m, 'supplyApy', now), 'Recheck before entry');
});
test('Book coverage is balance weighted and cannot be hidden by many tiny markets', () => {
  const rows = [
    market('small'),
    market('big', { totalSupplyUsd: 500e6, totalBorrowUsd: 400e6, rateObservedAt: null }),
  ];
  const q = quote(rows, 'borrowApy', 'average');
  near(q.coverage, 40 / 440);
  assert.equal(q.totalCount, 2);
  assert.equal(q.excluded[0].count, 1);
});
test('Utilization uses included debt / supply and one-market equality is genuine', () => {
  const rows = [market('only')];
  const q = quote(rows, 'borrowApy', 'average');
  near(q.utilization, 0.8);
  assert.equal(q.rate, quote(rows, 'borrowApy', 'best').rate);
  assert.equal(q.count, 1);
});
test('True low yields are not rounded into misleading zero or missing artifacts', () => {
  assert.equal(ratePercent(0.0000001), '<0.01%');
  assert.equal(ratePercent(0), '0.00%');
  assert.equal(ratePercent(null), 'Unavailable');
  assert.equal(quote([market('zero', { supplyApy: 0 })], 'supplyApy', 'average').rate, 0);
});
test('Low liquidity, permissioned, closed and capped books are benchmarks, not promoted as executable', () => {
  const cases: [Partial<Market>, string][] = [
    [{ liquidityUsd: 1e6 }, 'Under $5M cash'],
    [{ isFrozen: true }, 'Closed to entry'],
    [{ warnings: ['Permissioned Horizon market'] }, 'Restricted access'],
    [{ borrowCapacityUsd: 0 }, 'Under $5M headroom'],
  ];
  for (const [patch, reason] of cases) {
    const m = market('m', patch);
    assert.equal(quoteAccess(m, 'borrowApy', now), reason);
    assert.notEqual(quote([m], 'borrowApy', 'average').rate, null);
  }
});
test('Extremes are deterministic and unknown cash is not replaced by an invented number', () => {
  assert.equal(quote([market('b'), market('a')], 'borrowApy', 'best').representative.id, 'a');
  assert.equal(quote([market('noCash', { liquidityUsd: NaN })], 'borrowApy', 'average').liquidity, null);
});
test('Explore filters remain independent', () => {
  const rows = pair('u');
  assert.equal(filterMarkets(rows, EMPTY_MARKET_FILTERS).length, 2);
  assert.equal(
    filterMarkets(rows, { ...EMPTY_MARKET_FILTERS, protocol: 'Morpho', search: 'USDC', minLiquidityUsd: 5e6 })
      .length,
    1,
  );
});
