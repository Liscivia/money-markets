import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOpportunities } from '../server/opportunities.js';
import type { Asset, CollateralOption, Market, Snapshot } from '../shared/types.js';

const USD = 1_000_000;
const WETH: Asset = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  decimals: 18,
  priceUsd: 3_000,
  nativeApr: null,
};
const WSTETH: Asset = {
  address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
  symbol: 'wstETH',
  decimals: 18,
  priceUsd: 3_600,
  nativeApr: 0.05,
  nativeYieldSource: 'https://api.morpho.org/graphql:asset.yield',
  nativeYieldLookbackSeconds: 604800,
};
const USDC: Asset = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
  priceUsd: 1,
  nativeApr: null,
};
const collateral = (overrides: Partial<CollateralOption> = {}): CollateralOption => ({
  asset: WSTETH,
  ltv: 0.86,
  liquidationThreshold: 0.86,
  supplyCapacityUsd: null,
  supplyApy: 0,
  ...overrides,
});
const baseBorrowApr = 0.04 * (1 + 0.75 * ((0.4 - 0.9) / 0.9));
const market = (overrides: Partial<Market> = {}): Market => ({
  id: 'morpho-eth',
  protocol: 'Morpho',
  version: 'Blue',
  chainId: 1,
  chain: 'Ethereum',
  name: 'wstETH / WETH',
  address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  asset: WETH,
  collateral: [collateral()],
  supplyApy: Math.expm1(baseBorrowApr * 0.4),
  borrowApy: Math.expm1(baseBorrowApr),
  supplyRewardApr: 0,
  borrowRewardApr: 0,
  totalSupplyUsd: 100 * USD,
  totalBorrowUsd: 40 * USD,
  liquidityUsd: 60 * USD,
  borrowCapacityUsd: 60 * USD,
  supplyCapacityUsd: null,
  utilization: 0.4,
  lltv: 0.86,
  listed: true,
  isFrozen: false,
  isPaused: false,
  borrowingEnabled: true,
  sourceUrl: 'https://api.morpho.org/graphql',
  fetchedAt: '2026-09-07T18:00:00Z',
  warnings: [],
  rateModel: { kind: 'morpho-adaptive', optimalUtilization: 0.9, baseApr: 0.04, slope1: 0, slope2: 0 },
  historyRef: {},
  ...overrides,
});
const snapshot = (markets: Market[]): Snapshot => ({
  markets,
  fetchedAt: '2026-09-07T18:00:00Z',
  providers: [
    {
      protocol: 'Morpho',
      status: 'live',
      fetchedAt: '2026-09-07T18:00:00Z',
      marketCount: markets.filter((m) => m.protocol === 'Morpho').length,
      coverage: 'test',
    },
    {
      protocol: 'Aave',
      status: 'live',
      fetchedAt: '2026-09-07T18:00:00Z',
      marketCount: markets.filter((m) => m.protocol === 'Aave').length,
      coverage: 'test',
    },
  ],
});
const aave = (overrides: Partial<Market> = {}) =>
  market({
    id: 'aave-weth',
    protocol: 'Aave',
    version: 'V3',
    address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    borrowApy: Math.expm1(0.02),
    supplyApy: Math.expm1(0.0072),
    rateModel: { kind: 'aave-kink', optimalUtilization: 0.8, baseApr: 0, slope1: 0.04, slope2: 0.75 },
    ...overrides,
  });
function carryFixture(): Market[] {
  return [
    aave({
      id: 'aave-usdc',
      asset: USDC,
      collateral: [
        collateral({ asset: USDC, ltv: 0.8, liquidationThreshold: 0.85, supplyApy: Math.expm1(0.0072) }),
      ],
    }),
    market({
      id: 'morpho-usdc-lend',
      asset: USDC,
      collateral: [],
      totalBorrowUsd: 80 * USD,
      liquidityUsd: 20 * USD,
      utilization: 0.8,
      borrowApy: Math.expm1(0.08),
      supplyApy: Math.expm1(0.064),
      rateModel: {
        kind: 'morpho-adaptive',
        optimalUtilization: 0.9,
        baseApr: 0.08 / (1 - 0.75 / 9),
        slope1: 0,
        slope2: 0,
      },
    }),
  ];
}
function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

test('native loops reconcile debt, collateral, equity and HF without borrowing past the risk limit', () => {
  const result = computeOpportunities(snapshot([market()]), { targetLeverage: 4 });
  assert.equal(result.loops.length, 1);
  const row = result.loops[0];
  close(row.targetLtv, 0.86 / 1.2);
  close(row.healthFactor, 1.2);
  close(row.exposureUsd - row.equityUsd, 5 * USD, 1e-8);
  close(row.exposureUsd / row.equityUsd, row.leverage);
  close((5 * USD) / row.exposureUsd, row.targetLtv);
  close(row.netReturnOnEquity, row.leverage * 0.05 - (row.leverage - 1) * baseBorrowApr);
  close(row.modeledBorrowApr!, 0.025);
  assert.ok(row.modeledNetReturnOnEquity! < row.netReturnOnEquity);
  close(row.collateralUsd, row.exposureUsd);
  close(row.debtUsd, 5 * USD);
  close(row.externalSupplyUsd, 0);
});

test('10x requests disclose the HF floor as the binding limit, not a profitability optimization', () => {
  for (const [ltv, threshold, expectedLeverage] of [
    [0.9, 0.92, 30 / 7],
    [0.93, 0.95, 4.8],
  ]) {
    const source = market({ collateral: [collateral({ ltv, liquidationThreshold: threshold })] });
    const result = computeOpportunities(snapshot([source]), { targetLeverage: 10 });
    const row = result.loops[0];
    close(result.minHealthFactor, 1.2);
    close(row.leverage, expectedLeverage);
    close(row.targetLtv, threshold / 1.2);
    assert.equal(row.leveragePolicy.limitingFactor, 'health-factor');
    assert.equal(row.leveragePolicy.requested, 10);
    close(row.leveragePolicy.protocolMaxLtv, ltv);
    const muchHigherYield = {
      ...source,
      collateral: [
        collateral({ ltv, liquidationThreshold: threshold, asset: { ...WSTETH, nativeApr: 0.5 } }),
      ],
    };
    close(
      computeOpportunities(snapshot([muchHigherYield]), { targetLeverage: 10 }).loops[0].leverage,
      row.leverage,
    );
  }
});

test('requested and protocol-limited leverage are distinguished without changing the risk rules', () => {
  const target = computeOpportunities(snapshot([market()]), { targetLeverage: 2 }).loops[0];
  assert.equal(target.leveragePolicy.limitingFactor, 'requested');
  close(target.leverage, 2);
  const protocol = computeOpportunities(
    snapshot([
      market({
        collateral: [collateral({ ltv: 0.5, liquidationThreshold: 0.9, mode: 'Conservative mode' })],
      }),
    ]),
    { targetLeverage: 10 },
  ).loops[0];
  assert.equal(protocol.leveragePolicy.limitingFactor, 'protocol-ltv');
  assert.equal(protocol.leveragePolicy.collateralMode, 'Conservative mode');
  close(protocol.targetLtv, 0.5 * 0.98);
});

test('APY is converted with log1p and native APR is used directly, without double counting Morpho collateral supply or rewards', () => {
  const base = computeOpportunities(snapshot([market()])).loops[0];
  const changed = computeOpportunities(
    snapshot([
      market({ supplyRewardApr: 20, borrowRewardApr: 10, collateral: [collateral({ supplyApy: 1 })] }),
    ]),
  ).loops[0];
  close(changed.borrowApr, Math.log1p(market().borrowApy!));
  close(changed.nativeApr, 0.05);
  close(changed.lendingApr, 0);
  close(changed.netReturnOnEquity, base.netReturnOnEquity);
});

test('positive base yield cannot hide a negative incremental loop spread', () => {
  const result = computeOpportunities(
    snapshot([market({ collateral: [collateral({ asset: { ...WSTETH, nativeApr: 0.021 } })] })]),
  );
  assert.equal(result.loops.length, 0);
  assert.ok(result.excluded[0].netReturnOnEquity > 0);
  assert.match(result.excluded[0].exclusionReasons.join(' '), /incremental yield/);
});

test('a currently positive loop is excluded when a $5m debt takes Morpho through its kink', () => {
  const current = 0.04 * (1 - (0.75 * 0.01) / 0.9);
  const result = computeOpportunities(
    snapshot([
      market({
        totalBorrowUsd: 89 * USD,
        liquidityUsd: 11 * USD,
        utilization: 0.89,
        borrowApy: Math.expm1(current),
        supplyApy: Math.expm1(current * 0.89),
        collateral: [collateral({ asset: { ...WSTETH, nativeApr: 0.08 } })],
      }),
    ]),
  );
  assert.equal(result.loops.length, 0);
  assert.ok(result.excluded[0].spreadApr > 0);
  close(result.excluded[0].modeledBorrowApr!, 0.088);
  assert.ok(result.excluded[0].modeledNetReturnOnEquity! > 0); // Positive total ROE is insufficient.
  assert.match(result.excluded[0].exclusionReasons.join(' '), /Post-size/);
});

test('minimum liquidity, debt scenario, and collateral supply cap are independent gates', () => {
  for (const patch of [
    { liquidityUsd: 4 * USD },
    { liquidityUsd: 5 * USD },
    { borrowCapacityUsd: 4.99 * USD },
    { collateral: [collateral({ supplyCapacityUsd: 6 * USD })] },
    { collateral: [collateral({ supplyCapacityUsd: Number.NaN })] },
  ]) {
    const result = computeOpportunities(snapshot([market(patch)]));
    assert.equal(result.loops.length, 0);
    assert.ok(result.excluded[0].exclusionReasons.length > 0);
  }
});

test('unknown native yield is not replaced with a guessed staking rate', () => {
  for (const patch of [
    { nativeApr: null },
    { nativeApr: 0.05, nativeYieldSource: undefined },
    { nativeApr: Number.NaN },
  ]) {
    const result = computeOpportunities(
      snapshot([market({ collateral: [collateral({ asset: { ...WSTETH, ...patch } })] })]),
    );
    assert.equal(result.loops.length, 0);
    assert.match(result.excluded[0].exclusionReasons.join(' '), /yield is unavailable/);
  }
});

test('address/chain identity blocks symbol lookalikes and unknown economic relationships', () => {
  const spoof = '0x1111111111111111111111111111111111111111';
  for (const patch of [
    { collateral: [collateral({ asset: { ...WSTETH, address: spoof } })] },
    { asset: { ...WETH, address: spoof } },
    { chainId: 8453 },
    { asset: USDC },
  ]) {
    const result = computeOpportunities(snapshot([market(patch)]));
    assert.equal(result.loops.length, 0);
    assert.match(result.excluded[0].exclusionReasons.join(' '), /chain\/address/);
  }
});

test('fixed maturity tokens are excluded even if a provider reports native APR', () => {
  const result = computeOpportunities(
    snapshot([market({ collateral: [collateral({ asset: { ...WSTETH, symbol: 'PT-wstETH-25DEC2026' } })] })]),
  );
  assert.equal(result.loops.length, 0);
  assert.match(result.excluded[0].exclusionReasons.join(' '), /maturity-aware/);
});

test('stale providers, disabled borrowing, bad price and missing APY fail closed', () => {
  const stale = snapshot([market()]);
  stale.providers[0].status = 'stale';
  assert.equal(computeOpportunities(stale).loops.length, 0);
  for (const patch of [
    { isPaused: true },
    { isFrozen: true },
    { listed: false },
    { borrowingEnabled: false },
    { asset: { ...WETH, priceUsd: null } },
    { borrowApy: null },
    { borrowApy: Number.NaN },
    { collateral: [collateral({ ltv: 0.95, liquidationThreshold: 0.8 })] },
  ])
    assert.equal(computeOpportunities(snapshot([market(patch)])).loops.length, 0);
});

test('unknown or inconsistent interest models stay null and are not manufactured into a simulation', () => {
  for (const patch of [
    { rateModel: undefined },
    {
      rateModel: {
        kind: 'morpho-adaptive' as const,
        optimalUtilization: 0.9,
        baseApr: 0.4,
        slope1: 0,
        slope2: 0,
      },
    },
    { totalSupplyUsd: 200 * USD },
    {
      rateModel: {
        kind: 'aave-kink' as const,
        optimalUtilization: 0.8,
        baseApr: 0,
        slope1: 0.04,
        slope2: 0.75,
      },
    },
  ]) {
    const row = computeOpportunities(snapshot([market(patch)])).loops[0];
    assert.ok(row.eligible);
    assert.equal(row.modeledBorrowApr, null);
    assert.equal(row.modeledNetReturnOnEquity, null);
    assert.match(row.assumptions.join(' '), /unknown/);
  }
});

test('Aave collateral lending income dilutes with the collateral deposit and can eliminate the spread', () => {
  const col = { ...WSTETH, nativeApr: 0.001 };
  const result = computeOpportunities(
    snapshot([
      aave({ collateral: [collateral({ asset: col, supplyApy: Math.expm1(0.032) })] }),
      aave({
        id: 'aave-wsteth',
        asset: col,
        collateral: [],
        totalSupplyUsd: USD,
        totalBorrowUsd: 0.8 * USD,
        liquidityUsd: 0.2 * USD,
        utilization: 0.8,
        borrowApy: Math.expm1(0.04),
        supplyApy: Math.expm1(0.032),
      }),
    ]),
  );
  assert.equal(result.loops.length, 0);
  assert.ok(result.excluded[0].spreadApr > 0);
  assert.match(result.excluded[0].exclusionReasons.join(' '), /lending dilution/);
});

test('Aave borrow utilization uses available liquidity plus debt, not total aToken supply', () => {
  const row = computeOpportunities(snapshot([aave({ totalSupplyUsd: 103 * USD })])).loops[0];
  assert.ok(row.modeledBorrowApr !== null);
  close(row.modeledBorrowApr!, 0.0225);
});

test('collateral supply simulation must match the Aave pool as well as chain and address', () => {
  const result = computeOpportunities(
    snapshot([
      aave({ collateral: [collateral({ supplyApy: Math.expm1(0.001) })] }),
      aave({
        id: 'other-aave-pool',
        address: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        asset: WSTETH,
        collateral: [],
      }),
    ]),
  );
  assert.equal(result.loops.length, 1);
  assert.equal(result.loops[0].modeledNetReturnOnEquity, null);
});

test('zero-rate Aave collateral with no borrowers remains zero income without inventing a missing borrow curve', () => {
  const result = computeOpportunities(
    snapshot([
      aave(),
      aave({
        id: 'aave-wsteth',
        asset: WSTETH,
        collateral: [],
        totalBorrowUsd: 0,
        supplyApy: 0,
        borrowApy: null,
        borrowingEnabled: false,
        rateModel: undefined,
      }),
    ]),
  );
  assert.equal(result.loops.length, 1);
  assert.ok(result.loops[0].modeledNetReturnOnEquity !== null);
  close(result.loops[0].modeledNetReturnOnEquity!, 3 * 0.05 - 2 * 0.0225);
});

test('same-asset cross-protocol carry needs separately posted equity and never claims recursive 4x leverage', () => {
  const markets = carryFixture();
  const result = computeOpportunities(snapshot(markets), { targetLeverage: 4 });
  assert.equal(result.carry.length, 1);
  const row = result.carry[0];
  assert.equal(row.borrowProtocol, 'Aave');
  assert.equal(row.lendProtocol, 'Morpho');
  close(row.targetLtv, 0.85 / 1.2);
  close(row.leverage, 1 + row.targetLtv);
  close(row.equityUsd, (5 * USD) / row.targetLtv, 1e-8);
  close(row.exposureUsd - row.equityUsd, 5 * USD, 1e-8);
  close(row.netReturnOnEquity, 0.0072 + row.targetLtv * (0.064 - 0.02));
  close(row.collateralUsd, row.equityUsd);
  close(row.externalSupplyUsd, 5 * USD);
  close(row.collateralUsd + row.externalSupplyUsd, row.exposureUsd, 1e-8);
  close(row.collateralLendingApr, 0.0072);
  assert.ok(row.modeledLendingApr !== null && row.modeledLendingApr < row.lendingApr);
  assert.ok(row.leverage < 2);
  assert.ok(row.modeledNetReturnOnEquity !== null);
  const nextU = (40 * USD + 5 * USD) / (100 * USD + row.equityUsd);
  close(row.modeledBorrowApr!, (0.04 * nextU) / 0.8); // Equity USDC supply belongs in this denominator.
});

test('cross-protocol carry does not treat symbol matches or different chains as the same token', () => {
  for (const patch of [
    { asset: { ...USDC, address: '0x1111111111111111111111111111111111111111' } },
    { chainId: 10 },
    { protocol: 'Aave' as const },
  ]) {
    const [borrow, lend] = carryFixture();
    assert.equal(computeOpportunities(snapshot([borrow, { ...lend, ...patch }])).carry.length, 0);
  }
});

test('carry screens lending exit liquidity and both supply caps independently', () => {
  for (const patch of [
    { liquidityUsd: 4 * USD },
    { supplyCapacityUsd: 4 * USD },
    { isPaused: true },
    { listed: false },
  ]) {
    const [borrow, lend] = carryFixture();
    assert.equal(computeOpportunities(snapshot([borrow, { ...lend, ...patch }])).carry.length, 0);
  }
  const [borrow, lend] = carryFixture();
  borrow.collateral[0].supplyCapacityUsd = 6 * USD;
  assert.equal(computeOpportunities(snapshot([borrow, lend])).carry.length, 0);
});

test('stale and red-flag destinations cannot qualify as carry even when their provider is live', () => {
  for (const warning of [
    'STALE_STATE: API state more than 15 minutes old',
    'RED: ORACLE_UNVERIFIED',
    'CRITICAL: BAD_DEBT',
  ]) {
    const [borrow, lend] = carryFixture();
    lend.warnings = [warning];
    const result = computeOpportunities(snapshot([borrow, lend]));
    assert.equal(result.carry.length, 0);
    assert.match(
      result.excluded.find((row) => row.type === 'same-asset-carry')!.exclusionReasons.join(' '),
      /Lending market has stale data or a red\/critical/,
    );
  }
  const [borrow, lend] = carryFixture();
  borrow.warnings = ['STALE_PRICE: indexed price too old'];
  assert.equal(computeOpportunities(snapshot([borrow, lend])).carry.length, 0);
  borrow.warnings = [];
  lend.warnings = ['Displayed reward APR is indicative; campaign eligibility is not included.'];
  assert.equal(computeOpportunities(snapshot([borrow, lend])).carry.length, 1);
});

test('supply dilution can erase a positive cross-platform spread and is not ignored', () => {
  const [borrow, lender] = carryFixture();
  // Small destination deposit market, but above the configurable liquidity minimum.
  const lend = { ...lender, totalSupplyUsd: 10 * USD, totalBorrowUsd: 8 * USD, liquidityUsd: 2 * USD };
  const result = computeOpportunities(snapshot([borrow, lend]), {
    minLiquidityUsd: USD,
    debtSizeUsd: 20 * USD,
  });
  assert.equal(result.carry.length, 0);
  assert.match(
    result.excluded.find((r) => r.type === 'same-asset-carry')!.exclusionReasons.join(' '),
    /eliminate the external spread/,
  );
});

test('Aave V4 premium cannot be mistaken for a complete V3 borrow simulation', () => {
  const result = computeOpportunities(snapshot([aave({ version: 'V4' })]));
  assert.equal(result.loops.length, 0);
  assert.match(result.excluded[0].exclusionReasons.join(' '), /risk premium/);
});

test('top five are positive independent routes, prefer size simulation, and deduplicate collateral modes', () => {
  const markets = Array.from({ length: 8 }, (_, index) =>
    market({
      id: `route-${index}`,
      collateral: [
        collateral({ mode: 'normal' }),
        collateral({ mode: 'eMode: ETH', ltv: 0.87, liquidationThreshold: 0.87 }),
      ],
    }),
  );
  markets.push(
    market({
      id: 'unknown-very-high-yield',
      rateModel: undefined,
      collateral: [collateral({ asset: { ...WSTETH, nativeApr: 0.9 } })],
    }),
  );
  const result = computeOpportunities(snapshot(markets));
  assert.equal(result.loops.length, 5);
  assert.equal(new Set(result.loops.map((r) => r.borrowMarketId)).size, 5);
  assert.ok(result.loops.every((row) => row.modeledNetReturnOnEquity !== null && row.spreadApr > 0));
});

test('invalid user scenario values fail explicitly instead of leaking NaN or infinite KPIs', () => {
  for (const options of [
    { debtSizeUsd: 0 },
    { minLiquidityUsd: Number.NaN },
    { targetLeverage: 1 },
    { targetLeverage: Number.POSITIVE_INFINITY },
    { minHealthFactor: 1 },
  ])
    assert.throws(() => computeOpportunities(snapshot([market()]), options), RangeError);
});

test('A smaller manual scenario admits sub-$5m markets while default and capacity gates remain intact', () => {
  const small = market({
    totalSupplyUsd: 1_000_000,
    totalBorrowUsd: 400_000,
    liquidityUsd: 600_000,
    borrowCapacityUsd: 600_000,
  });
  assert.equal(computeOpportunities(snapshot([small])).loops.length, 0);
  const result = computeOpportunities(snapshot([small]), { minLiquidityUsd: 100_000, debtSizeUsd: 25_000 });
  assert.equal(result.loops.length, 1);
  assert.equal(result.minLiquidityUsd, 100_000);
  close(result.loops[0].exposureUsd - result.loops[0].equityUsd, 25_000);
  assert.ok(result.methodology.some((line) => line.includes('$100,000') && line.includes('$25,000')));
  assert.equal(
    computeOpportunities(snapshot([small]), { minLiquidityUsd: 100_000, debtSizeUsd: 700_000 }).loops.length,
    0,
  );
});
