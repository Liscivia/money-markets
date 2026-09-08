import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAavePool,
  normalizeAaveV4,
  normalizeMorpho,
  numeric,
  supplyCapacity,
} from '../server/providers.js';
import { totalLiquidity } from '../shared/metrics.js';

const percent = (value: number) => ({ value: String(value) });
const now = new Date().toISOString();
function reserve(symbol = 'USDC') {
  return {
    underlyingToken: { address: `0x${symbol.padEnd(40, '0')}`, symbol, decimals: 6 },
    usdExchangeRate: '1',
    size: { usd: '10000000' },
    isFrozen: false,
    isPaused: false,
    isolationModeConfig: null as null | {
      canBeCollateral: boolean;
      canBeBorrowed?: boolean;
      debtCeiling?: { usd: string };
      totalBorrows?: { usd: string };
    },
    eModeInfo: [] as any[],
    incentives: [],
    supplyInfo: {
      apy: percent(0.03),
      maxLTV: percent(0.8),
      liquidationThreshold: percent(0.85),
      canBeCollateral: true,
      supplyCap: { amount: { value: '20000000' } },
      supplyCapReached: false,
      total: { value: '10000000' },
    },
    borrowInfo: {
      apy: percent(0.04),
      total: { usd: '6000000', amount: { value: '6000000' } },
      availableLiquidity: { usd: '4000000' },
      utilizationRate: percent(0.6),
      borrowingState: 'ENABLED',
      borrowCap: { amount: { value: '7000000' } },
      borrowCapReached: false,
      baseVariableBorrowRate: percent(0),
      variableRateSlope1: percent(0.04),
      variableRateSlope2: percent(0.5),
      optimalUsageRate: percent(0.9),
    },
  };
}
function pool(reserves: ReturnType<typeof reserve>[]) {
  return { name: 'AaveV3Ethereum', address: '0xpool', chain: { chainId: 1, name: 'Ethereum' }, reserves };
}

test('Missing rates stay unknown and zero Aave caps mean explicitly uncapped', () => {
  assert.equal(numeric(null), null);
  assert.equal(numeric(undefined), null);
  assert.equal(numeric(''), null);
  assert.equal(numeric('0'), 0);
  const raw = reserve();
  raw.supplyInfo.supplyCap.amount.value = '0';
  assert.equal(supplyCapacity(raw), null);
  raw.isFrozen = true;
  assert.equal(supplyCapacity(raw), 0);
});

test('Borrow sizing obeys cap room rather than raw cash and supply totals do not add other collateral', () => {
  const [row] = normalizeAavePool(pool([reserve(), reserve('WETH')]), now);
  assert.equal(row.liquidityUsd, 4_000_000);
  assert.equal(row.borrowCapacityUsd, 1_000_000);
  assert.equal(row.totalSupplyUsd, 10_000_000);
  assert.equal(row.supplyApy, 0.03);
  assert.equal(row.borrowApy, 0.04);
});

test('eMode collateral must match debt eligibility; isolation cannot silently use standard LTV', () => {
  const debt = reserve();
  const collateral = reserve('wstETH');
  const mode = {
    categoryId: 1,
    label: 'ETH',
    maxLTV: percent(0.95),
    liquidationThreshold: percent(0.97),
    canBeCollateral: true,
    canBeBorrowed: false,
    hasLtvZero: false,
  };
  collateral.eModeInfo = [mode];
  debt.eModeInfo = [{ ...mode, canBeCollateral: false, canBeBorrowed: false }];
  assert.ok(
    !normalizeAavePool(pool([debt, collateral]), now)[0].collateral.some((c) => c.mode?.startsWith('eMode')),
  );
  debt.eModeInfo[0].canBeBorrowed = true;
  assert.ok(
    normalizeAavePool(pool([debt, collateral]), now)[0].collateral.some((c) => c.mode?.startsWith('eMode')),
  );
  collateral.isolationModeConfig = { canBeCollateral: true };
  assert.ok(
    !normalizeAavePool(pool([debt, collateral]), now)[0].collateral.some((c) => c.asset.symbol === 'wstETH'),
  );
});

test('Aave comparison details show full supply caps, usage and headroom without changing the opportunity allowlist', () => {
  const debt = reserve(),
    collateral = reserve('WETH');
  const [market] = normalizeAavePool(pool([debt, collateral]), now);
  const detail = market.collateralDetails!.find((d) => d.asset.symbol === 'WETH')!;
  assert.equal(detail.ltv, 0.8);
  assert.equal(detail.liquidationThreshold, 0.85);
  assert.deepEqual(detail.supplyCap, {
    status: 'capped',
    usedTokens: 10e6,
    limitTokens: 20e6,
    usedUsd: 10e6,
    limitUsd: 20e6,
    usedRatio: 0.5,
  });
  assert.equal(detail.supplyHeadroomUsd, 10e6);
  collateral.isFrozen = true;
  const [frozen] = normalizeAavePool(pool([debt, collateral]), now);
  assert.ok(!frozen.collateral.some((c) => c.asset.symbol === 'WETH'));
  const shown = frozen.collateralDetails!.find((d) => d.asset.symbol === 'WETH')!;
  assert.equal(shown.newSupplyEnabled, false);
  assert.equal(shown.supplyHeadroomUsd, 0);
  assert.equal(shown.supplyCap.usedRatio, 0.5); // A freeze is not 100% cap use.
});

test('Aave isolation details require eligible debt and expose the shared ceiling without enabling screened routes', () => {
  const debt = reserve(),
    isolated = reserve('ISOLATED');
  isolated.isolationModeConfig = {
    canBeCollateral: true,
    debtCeiling: { usd: '5000000' },
    totalBorrows: { usd: '4000000' },
  };
  assert.ok(
    !normalizeAavePool(pool([debt, isolated]), now)[0].collateralDetails!.some((d) => d.mode === 'Isolation'),
  );
  debt.isolationModeConfig = { canBeCollateral: false, canBeBorrowed: true };
  const [market] = normalizeAavePool(pool([debt, isolated]), now);
  assert.ok(!market.collateral.some((d) => d.asset.symbol === 'ISOLATED'));
  const detail = market.collateralDetails!.find((d) => d.mode === 'Isolation')!;
  assert.deepEqual(detail.isolationDebt, { ceilingUsd: 5e6, usedUsd: 4e6 });
  assert.equal(detail.ltv, 0.8);
});

test('Displayed eMode limits belong to the selected debt category, and supply-only reserves do not claim collateral borrowing', () => {
  const debt = reserve(),
    collateral = reserve('stETH');
  collateral.eModeInfo = [
    {
      categoryId: 2,
      label: 'ETH',
      canBeCollateral: true,
      hasLtvZero: false,
      maxLTV: percent(0.95),
      liquidationThreshold: percent(0.97),
    },
  ];
  assert.ok(
    !normalizeAavePool(pool([debt, collateral]), now)[0].collateralDetails!.some((d) =>
      d.mode.startsWith('eMode'),
    ),
  );
  debt.eModeInfo = [{ categoryId: 2, canBeBorrowed: true }];
  const [market] = normalizeAavePool(pool([debt, collateral]), now);
  assert.equal(market.collateralDetails!.find((d) => d.mode.startsWith('eMode'))!.ltv, 0.95);
  assert.deepEqual(
    normalizeAavePool({ ...pool([debt]), reserves: [{ ...debt, borrowInfo: null }] }, now)[0]
      .collateralDetails,
    [],
  );
});

function morphoRaw() {
  return {
    marketId: '0xmarket',
    chain: { id: 1, network: 'Ethereum' },
    lltv: '860000000000000000',
    listed: true,
    irmAddress: '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC',
    warnings: [],
    loanAsset: {
      address: '0xloan',
      symbol: 'WETH',
      decimals: 18,
      price: { usd: 2500, timestamp: (Date.now() / 1000) as number | undefined },
    },
    collateralAsset: {
      address: '0xcol',
      symbol: 'wstETH',
      decimals: 18,
      price: { usd: 3000, timestamp: (Date.now() / 1000) as number | undefined },
      yield: { apr: 0.03, lookback: 604800 },
    },
    state: {
      timestamp: Date.now() / 1000,
      supplyApy: 0.02,
      borrowApy: 0.025,
      supplyAssetsUsd: 20_000_000,
      borrowAssetsUsd: 15_000_000,
      liquidityAssetsUsd: 5_000_000,
      utilization: 0.75,
      apyAtTarget: 0.04,
      rewards: [],
    },
  };
}

test('Morpho native collateral yield is separate, stale state has no borrow capacity and unknown IRM has no modeled curve', () => {
  const raw = morphoRaw();
  let row = normalizeMorpho(raw, now);
  assert.equal(row.collateral[0].supplyApy, 0);
  assert.equal(row.collateral[0].asset.nativeApr, 0.03);
  assert.equal(row.supplyApy, 0.02);
  assert.equal(row.rateObservedAt, new Date(raw.state.timestamp * 1000).toISOString());
  assert.equal(row.rateModel?.baseApr, Math.log1p(0.04));
  raw.irmAddress = '0xunknown';
  raw.state.timestamp -= 3600;
  row = normalizeMorpho(raw, now);
  assert.equal(row.rateModel, undefined);
  assert.equal(row.borrowCapacityUsd, 0);
});

test('Morpho collateral valuation is a separate field and never inflates lending liquidity or rate-model supply', () => {
  const raw = {
    ...morphoRaw(),
    state: {
      ...morphoRaw().state,
      collateralAssets: '10000000000000000000000',
      collateralAssetsUsd: 30e6 as number | null,
    },
  };
  const market = normalizeMorpho(raw, now);
  assert.equal(market.segregatedCollateralUsd, 30e6);
  assert.equal(market.collateralDetails?.length, 1);
  assert.equal(market.collateralDetails?.[0].ltv, null);
  assert.equal(market.collateralDetails?.[0].liquidationThreshold, 0.86);
  assert.equal(market.collateralDetails?.[0].supplyCap.status, 'uncapped');
  assert.equal(market.totalSupplyUsd, 20e6);
  assert.equal(market.liquidityUsd, 5e6);
  assert.equal(market.borrowCapacityUsd, 5e6);
  raw.state.collateralAssetsUsd = null;
  assert.equal(normalizeMorpho(raw, now).segregatedCollateralUsd, null);
  raw.state.collateralAssets = '0';
  assert.equal(normalizeMorpho(raw, now).segregatedCollateralUsd, 0);
  assert.equal(normalizeMorpho({ ...raw, collateralAsset: null }, now).segregatedCollateralUsd, 0);
});

test('Fresh Morpho balances cannot validate a loop when either USD price is stale or has no timestamp', () => {
  const raw = morphoRaw();
  assert.equal(normalizeMorpho(raw, now).borrowingEnabled, true);
  for (const role of ['loanAsset', 'collateralAsset'] as const) {
    for (const timestamp of [Date.now() / 1000 - 3_601, undefined]) {
      const scenario = structuredClone(raw);
      scenario[role].price.timestamp = timestamp;
      const row = normalizeMorpho(scenario, now);
      assert.equal(row.borrowingEnabled, false);
      assert.equal(row.borrowCapacityUsd, 0);
      assert.ok(row.warnings.some((warning) => warning.startsWith('STALE_PRICE:')));
      assert.ok(!row.warnings.some((warning) => warning.startsWith('STALE_STATE:')));
      assert.equal(row.supplyApy, 0.02); // Historical/comparison visibility is preserved.
      assert.equal(row.liquidityUsd, 5_000_000);
    }
  }
});

test('Two V4 spokes retain their own balances but share one hub liquidity total', () => {
  const raw = (id: string) => ({
    id,
    chain: { chainId: 1, name: 'Ethereum' },
    spoke: { id, name: id, address: id },
    canBorrow: true,
    canSupply: true,
    canUseAsCollateral: true,
    status: { active: true, frozen: false, paused: false },
    settings: { collateralFactor: percent(0.8), supplyCap: { amount: { value: 8_000_000 } } },
    asset: {
      id: 'same-hub-asset',
      hub: { name: 'Core' },
      underlying: { address: '0xUSDC', info: { symbol: 'USDC', decimals: 6 } },
      summary: { availableLiquidity: { exchange: { value: 5_000_000 } }, utilizationRate: percent(0.5) },
    },
    summary: {
      supplied: { amount: { value: 5_000_000 }, exchange: { value: 5_000_000 }, exchangeRate: { value: 1 } },
      borrowed: { exchange: { value: 2_500_000 } },
      suppliable: { exchange: { value: 2_000_000 } },
      borrowable: { exchange: { value: 1_000_000 } },
      supplyApy: percent(0.02),
      borrowApy: percent(0.04),
      underlyingApy: null,
    },
  });
  const rows = normalizeAaveV4([raw('spoke-a'), raw('spoke-b')], now);
  assert.equal(
    rows.reduce((sum, row) => sum + row.totalSupplyUsd, 0),
    10_000_000,
  );
  assert.equal(totalLiquidity(rows), 5_000_000);
  assert.equal(rows[0].borrowCapacityUsd, 1_000_000);
  assert.equal(rows[0].asset.nativeApr, null);
  assert.equal(rows[0].collateralDetails!.length, 1); // Only this spoke, not another sharing the hub.
  assert.equal(rows[0].collateralDetails![0].ltv, null);
  assert.equal(rows[0].collateralDetails![0].liquidationThreshold, 0.8);
  assert.equal(rows[0].collateralDetails![0].supplyCap.usedRatio, 0.625);
  assert.equal(rows[0].collateralDetails![0].supplyCap.limitUsd, 8e6);
  assert.equal(rows[0].collateralDetails![0].supplyHeadroomUsd, 2e6); // Effective headroom, not guessed cap - deposits.
});
