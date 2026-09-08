import type {
  Asset,
  CollateralOption,
  Market,
  Opportunity,
  OpportunityResult,
  Snapshot,
} from '../shared/types.js';
import { parseOpportunityParameters } from '../shared/opportunity-inputs.js';

type Family = 'ETH' | 'USD';
type AssetClass = { family: Family; nativeYield: boolean };
type Options = {
  minLiquidityUsd?: number;
  targetLeverage?: number;
  debtSizeUsd?: number;
  minHealthFactor?: number;
};

// Address identity is deliberately conservative. A token named "wstETH" is not proof of ETH exposure.
// Sources: https://github.com/bgd-labs/aave-address-book/tree/main/src (read 2026-09-07),
// https://docs.ethena.fi/solution-design/key-addresses. Unknown assets remain visible in Markets.
const ASSET_CLASSES = new Map<string, AssetClass>();
function register(chain: number, family: Family, nativeYield: boolean, addresses: string[]) {
  for (const address of addresses)
    ASSET_CLASSES.set(`${chain}:${address.toLowerCase()}`, { family, nativeYield });
}
register(1, 'ETH', false, ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2']);
register(1, 'ETH', true, [
  '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
  '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
  '0xae78736Cd615f374D3085123A210448E74Fc6393',
  '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
  '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b',
  '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7',
  '0xbf5495Efe5DB9ce00f80364C8B423567e58d2110',
]);
register(1, 'USD', true, [
  '0x83F20F44975D03b1b09e64809B757c47f942BEeA',
  '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
]);
register(1, 'USD', false, [
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
  '0x853d955aCEf822Db058eb8505911ED77F175b99e',
  '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
  '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E',
  '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
  '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
  '0xdC035D45d973E3EC169d2276DDab16f1e407384F',
  '0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD',
]);
register(8453, 'ETH', false, ['0x4200000000000000000000000000000000000006']);
register(8453, 'ETH', true, [
  '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
  '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A',
  '0x2416092f143378750bb29b79eD961ab195CcEea5',
]);
register(8453, 'USD', false, [
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '0x6Bb7a212910682DCFdbd5BCBb3e28FB4E8da10Ee',
]);
register(42161, 'ETH', false, ['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']);
register(42161, 'ETH', true, [
  '0x5979D7b546E38E414F7E9822514be443A4800529',
  '0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8',
  '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe',
  '0x2416092f143378750bb29b79eD961ab195CcEea5',
  '0x4186BFC76E2E237523CBC30FD220FE055156b41F',
]);
register(42161, 'USD', false, [
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  '0x93b346b6BC2548dA6A1E7d98E9a421B42541425b',
  '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
  '0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33',
]);
register(10, 'ETH', false, ['0x4200000000000000000000000000000000000006']);
register(10, 'ETH', true, [
  '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
  '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D',
]);
register(10, 'USD', false, [
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  '0xc40F949F8a4e094D1b49a23ea9241D289B7b2819',
]);
register(137, 'ETH', false, ['0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619']);
register(137, 'ETH', true, ['0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD']);
register(137, 'USD', false, [
  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
]);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validRate = (value: unknown): value is number => finite(value) && value >= 0;
const positive = (value: unknown): value is number => finite(value) && value > 0;
const sameAsset = (a: Asset, b: Asset) =>
  /^0x[\da-f]{40}$/i.test(a.address) && a.address.toLowerCase() === b.address.toLowerCase();
const assetClass = (chain: number, asset: Asset) =>
  ASSET_CLASSES.get(`${chain}:${asset.address.toLowerCase()}`);
const fixedMaturity = (asset: Asset) =>
  /(?:^|[^a-z])(?:PT|YT)(?:[-_\s]|$)/i.test(asset.symbol) || /^PT[A-Z]/.test(asset.symbol);
const unsafeSourceWarning = (market: Market) =>
  market.warnings.some((warning) => /STALE(?:_STATE)?|RED:|CRITICAL:/i.test(warning));
const annualRate = (apy: number | null) => (validRate(apy) ? Math.log1p(apy) : null);
// null is explicitly "uncapped" in the provider contract; unknown caps are zero with a warning.
const capacity = (value: number | null) =>
  value === null ? Number.POSITIVE_INFINITY : validRate(value) ? value : 0;

function curve(market: Market, utilization: number): number | null {
  const model = market.rateModel;
  if (
    !model ||
    !finite(utilization) ||
    utilization < 0 ||
    utilization > 1 ||
    !positive(model.optimalUtilization) ||
    model.optimalUtilization >= 1 ||
    !validRate(model.baseApr)
  )
    return null;
  if (model.kind === 'morpho-adaptive' && market.protocol === 'Morpho') {
    if (Math.abs(model.optimalUtilization - 0.9) > 1e-6) return null;
    // Frozen current rateAtTarget: this is the instantaneous curve, not its future adaptation.
    const error = (utilization - 0.9) / (utilization < 0.9 ? 0.9 : 0.1);
    return model.baseApr * (1 + (error < 0 ? 0.75 : 3) * error);
  }
  if (
    model.kind !== 'aave-kink' ||
    market.protocol !== 'Aave' ||
    !validRate(model.slope1) ||
    !validRate(model.slope2)
  )
    return null;
  return utilization <= model.optimalUtilization
    ? model.baseApr + (model.slope1 * utilization) / model.optimalUtilization
    : model.baseApr +
        model.slope1 +
        (model.slope2 * (utilization - model.optimalUtilization)) / (1 - model.optimalUtilization);
}

/** A size stress, not a trade quote. Reject curves that do not reconcile to the indexed current rate. */
function sizedRate(
  market: Market,
  debtAdded: number,
  supplyAdded = 0,
): { borrowApr: number; supplyApr: number | null } | null {
  if (
    !validRate(market.totalBorrowUsd) ||
    !validRate(market.liquidityUsd) ||
    !positive(market.totalSupplyUsd)
  )
    return null;
  const capital = market.totalBorrowUsd + market.liquidityUsd;
  if (!positive(capital)) return null;
  // Aave borrowing uses virtual available liquidity + debt, while supply accounting can include
  // unbacked amounts. It is incorrect to require total aToken supply == the borrow denominator.
  // https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/misc/DefaultReserveInterestRateStrategyV2.sol
  if (market.protocol === 'Morpho' && Math.abs(market.totalSupplyUsd / capital - 1) > 0.025) return null;
  const currentU = market.totalBorrowUsd / capital;
  if (!finite(market.utilization) || Math.abs(currentU - market.utilization) > 0.025) return null;
  const currentBorrow = annualRate(market.borrowApy);
  const expectedCurrent = curve(market, currentU);
  if (
    currentBorrow === null ||
    expectedCurrent === null ||
    Math.abs(expectedCurrent - currentBorrow) > Math.max(0.0005, currentBorrow * 0.1)
  )
    return null;
  const newCapital = capital + supplyAdded;
  const newU = (market.totalBorrowUsd + debtAdded) / newCapital;
  const newBorrow = curve(market, newU);
  if (newBorrow === null) return null;
  const currentSupply = annualRate(market.supplyApy);
  let newSupply: number | null = null;
  if (currentSupply === 0 && currentU === 0 && newU === 0) newSupply = 0;
  else if (currentSupply !== null && currentBorrow > 0 && currentU > 0) {
    // Infer the current pass-through after fees, then hold it constant under the size stress.
    // An impossible pass-through signals missing components (e.g. stable debt or external yield).
    const currentSupplyU = market.totalBorrowUsd / market.totalSupplyUsd;
    const newSupplyU = (market.totalBorrowUsd + debtAdded) / (market.totalSupplyUsd + supplyAdded);
    const passThrough = currentSupply / (currentBorrow * currentSupplyU);
    if (passThrough >= 0 && passThrough <= 1.025)
      newSupply = Math.min(1, passThrough) * newBorrow * newSupplyU;
  }
  return { borrowApr: newBorrow, supplyApr: newSupply };
}

function collateralReserve(
  snapshot: Snapshot,
  borrow: Market,
  collateral: CollateralOption,
): Market | undefined {
  return snapshot.markets.find(
    (m) =>
      m.protocol === 'Aave' &&
      m.chainId === borrow.chainId &&
      m.address.toLowerCase() === borrow.address.toLowerCase() &&
      sameAsset(m.asset, collateral.asset),
  );
}

function collateralIncome(
  snapshot: Snapshot,
  borrow: Market,
  collateral: CollateralOption,
  supplyAdded: number,
  debtAdded = 0,
) {
  if (borrow.protocol === 'Morpho') return { current: 0, modeled: 0 as number | null };
  const current = annualRate(collateral.supplyApy);
  const reserve = collateralReserve(snapshot, borrow, collateral);
  // A zero-rate reserve with no borrowing cannot lose any current organic lending income from dilution.
  const noBorrowerIncome = current === 0 && reserve?.totalBorrowUsd === 0 && debtAdded === 0;
  const modeled = noBorrowerIncome
    ? 0
    : reserve
      ? (sizedRate(reserve, debtAdded, supplyAdded)?.supplyApr ?? null)
      : current === 0
        ? 0
        : null;
  return { current, modeled };
}

function commonReasons(
  snapshot: Snapshot,
  market: Market,
  collateral: CollateralOption,
  debt: number,
  minimum: number,
): string[] {
  const reasons: string[] = [];
  if (snapshot.providers.find((p) => p.protocol === market.protocol)?.status !== 'live')
    reasons.push(`${market.protocol} provider data is not live.`);
  if (!market.listed) reasons.push('Market is not listed by the provider.');
  if (market.isPaused || market.isFrozen || !market.borrowingEnabled)
    reasons.push('Market is paused, frozen, permissioned, or borrowing is disabled.');
  if (unsafeSourceWarning(market))
    reasons.push('Borrow market has stale data or a red/critical provider risk warning.');
  if (market.protocol === 'Aave' && /(?:^|\D)4(?:\D|$)/.test(market.version))
    reasons.push('Aave V4 borrower-specific risk premium is not modeled.');
  if (!validRate(market.borrowApy)) reasons.push('Borrow rate is missing or invalid.');
  if (!validRate(market.liquidityUsd) || market.liquidityUsd < minimum)
    reasons.push(`Borrow liquidity is below the $${(minimum / 1e6).toFixed(2)}m minimum.`);
  if (!validRate(market.borrowCapacityUsd) || market.borrowCapacityUsd < debt)
    reasons.push('Remaining borrow capacity is below the requested debt size.');
  if (!validRate(market.liquidityUsd) || market.liquidityUsd <= debt)
    reasons.push('Debt size consumes or exceeds all available borrow liquidity.');
  if (!positive(market.asset.priceUsd) || !positive(collateral.asset.priceUsd))
    reasons.push('A debt or collateral USD price is unavailable.');
  if (
    !positive(collateral.ltv) ||
    collateral.ltv >= 1 ||
    !positive(collateral.liquidationThreshold) ||
    collateral.liquidationThreshold > 1 ||
    collateral.ltv > collateral.liquidationThreshold
  )
    reasons.push('Collateral risk parameters are invalid.');
  if (fixedMaturity(collateral.asset) || fixedMaturity(market.asset))
    reasons.push('Fixed-maturity PT/YT assets require a maturity-aware model.');
  return reasons;
}

function riskLimit(collateral: CollateralOption, targetLeverage: number, minHF: number) {
  // Never plan exactly at the protocol admission LTV, even if a user asks for its theoretical maximum.
  const limits: { value: number; reason: Opportunity['leveragePolicy']['limitingFactor'] }[] = [
    { value: 1 - 1 / targetLeverage, reason: 'requested' },
    { value: positive(collateral.ltv) ? collateral.ltv * 0.98 : 0, reason: 'protocol-ltv' },
    {
      value: positive(collateral.liquidationThreshold) ? collateral.liquidationThreshold / minHF : 0,
      reason: 'health-factor',
    },
    { value: 0.95, reason: 'screen-ltv' },
  ];
  const binding = limits.reduce((a, b) => (b.value < a.value ? b : a));
  return {
    targetLtv: Math.max(0, binding.value),
    leveragePolicy: {
      requested: targetLeverage,
      minHealthFactor: minHF,
      protocolMaxLtv: collateral.ltv,
      collateralMode: collateral.mode || 'Standard collateral',
      limitingFactor: binding.reason,
    },
  };
}

const BASE_ASSUMPTIONS = [
  'Research candidate from indexed rates; collateral swap depth, oracle behavior, position simulation and atomic entry/exit are not verified.',
  'Financing-net simple annualized return on equity; excludes incentives, gas, swap slippage, execution fees and future rate changes. It is not compounded loop APY.',
  'Each row is an independent scenario. Routes sharing a reserve compete for the same liquidity; capacities cannot be added.',
];

function rateAssumption(market: Market, modeled: number | null) {
  return modeled === null
    ? 'Simulated post-size rates are unknown: the rate model or supply-income inputs are absent, inconsistent or unsupported. Current-rate profitability is not size-validated.'
    : market.protocol === 'Morpho'
      ? 'Simulated post-size rates hold the current AdaptiveCurveIRM rate-at-target fixed and apply its utilization curve. Sustained high utilization can subsequently raise the target rate.'
      : 'Simulated borrow rate applies the indexed Aave two-slope curve; simulated lending yield uses the inferred current fee pass-through and new utilization. It is an immediate stress, not a one-year forecast.';
}

function nativeLoop(
  snapshot: Snapshot,
  borrow: Market,
  collateral: CollateralOption,
  settings: Required<Options>,
): Opportunity {
  const reasons = commonReasons(snapshot, borrow, collateral, settings.debtSizeUsd, settings.minLiquidityUsd);
  const colClass = assetClass(borrow.chainId, collateral.asset);
  const debtClass = assetClass(borrow.chainId, borrow.asset);
  if (
    !colClass?.nativeYield ||
    !debtClass ||
    debtClass.nativeYield ||
    colClass.family !== debtClass.family ||
    sameAsset(collateral.asset, borrow.asset)
  ) {
    reasons.push('Collateral/debt economic relationship is not in the verified chain/address coverage.');
  }
  if (!positive(collateral.asset.nativeApr) || !collateral.asset.nativeYieldSource)
    reasons.push('Native collateral yield is unavailable or has no source.');
  const { targetLtv, leveragePolicy } = riskLimit(
    collateral,
    settings.targetLeverage,
    settings.minHealthFactor,
  );
  const leverage = targetLtv > 0 && targetLtv < 1 ? 1 / (1 - targetLtv) : 1;
  const equityUsd = leverage > 1 ? settings.debtSizeUsd / (leverage - 1) : 0;
  const exposureUsd = equityUsd + settings.debtSizeUsd;
  if (targetLtv <= 0) reasons.push('No positive leverage is available under the requested risk limits.');
  if (capacity(collateral.supplyCapacityUsd) < exposureUsd)
    reasons.push('Collateral deposit exceeds its remaining supply cap.');
  const nativeApr = validRate(collateral.asset.nativeApr) ? collateral.asset.nativeApr : 0;
  const income = collateralIncome(snapshot, borrow, collateral, exposureUsd);
  if (income.current === null) reasons.push('Collateral lending rate is missing or invalid.');
  const lendingApr = income.current ?? 0;
  const borrowApr = annualRate(borrow.borrowApy) ?? 0;
  const spreadApr = nativeApr + lendingApr - borrowApr;
  const grossReturnOnEquity = leverage * (nativeApr + lendingApr);
  const netReturnOnEquity = grossReturnOnEquity - (leverage - 1) * borrowApr;
  // A native loop requires positive incremental carry, not merely a positive unlevered base yield.
  if (!(spreadApr > 0)) reasons.push('Current incremental yield does not exceed the borrow cost.');
  const modeledBorrowApr = sizedRate(borrow, settings.debtSizeUsd)?.borrowApr ?? null;
  const modeledNetReturnOnEquity =
    modeledBorrowApr !== null && income.modeled !== null
      ? leverage * (nativeApr + income.modeled) - (leverage - 1) * modeledBorrowApr
      : null;
  if (
    modeledBorrowApr !== null &&
    income.modeled !== null &&
    nativeApr + income.modeled <= modeledBorrowApr
  ) {
    reasons.push('Post-size utilization and lending dilution eliminate the incremental spread.');
  }
  const borrowCapacity = Math.min(
    capacity(borrow.borrowCapacityUsd),
    capacity(borrow.liquidityUsd),
    capacity(collateral.supplyCapacityUsd) * targetLtv,
  );
  const assumptions = [
    ...BASE_ASSUMPTIONS,
    `Debt $${settings.debtSizeUsd.toLocaleString('en-US')}; equity = debt / (L - 1); collateral = L × equity; ROE = L × (native APR + collateral lending APR) - (L - 1) × borrow APR.`,
    `L is capped by 98% of collateral LTV and minimum health factor ${settings.minHealthFactor}; ${collateral.mode || 'normal collateral mode'}.`,
    colClass?.family === 'ETH'
      ? 'ETH-denominated carry retains LST/ETH basis, slashing, redemption-delay and collateral liquidation risk.'
      : 'USD-denominated carry retains stablecoin depeg, collateral redemption-delay and issuer/basis risk.',
    borrow.protocol === 'Morpho'
      ? 'Morpho collateral is not lent out: collateral lending APR is zero; only verified native token yield accrues.'
      : 'Aave collateral receives its reserve lending rate in addition to verified native token yield; the two income sources are counted once each.',
    `Native yield source: ${collateral.asset.nativeYieldSource || 'unknown'}${collateral.asset.nativeYieldLookbackSeconds ? `; lookback ${collateral.asset.nativeYieldLookbackSeconds} seconds` : ''}. Native yield is held constant in the size stress.`,
    rateAssumption(borrow, modeledNetReturnOnEquity),
  ];
  return {
    id: `loop:${borrow.id}:${collateral.asset.address.toLowerCase()}:${encodeURIComponent(collateral.mode || 'normal')}`,
    type: 'native-loop',
    title: `${collateral.asset.symbol} / ${borrow.asset.symbol}`,
    chainId: borrow.chainId,
    chain: borrow.chain,
    borrowMarketId: borrow.id,
    borrowProtocol: borrow.protocol,
    lendProtocol: 'Native',
    collateralSymbol: collateral.asset.symbol,
    debtSymbol: borrow.asset.symbol,
    nativeApr,
    lendingApr,
    borrowApr,
    spreadApr,
    leverage,
    targetLtv,
    liquidationThreshold: collateral.liquidationThreshold,
    healthFactor: targetLtv > 0 ? collateral.liquidationThreshold / targetLtv : 0,
    grossReturnOnEquity,
    netReturnOnEquity,
    borrowLiquidityUsd: borrow.liquidityUsd,
    capacityUsd: finite(borrowCapacity) ? Math.max(0, borrowCapacity) : 0,
    equityUsd,
    exposureUsd,
    collateralUsd: exposureUsd,
    debtUsd: settings.debtSizeUsd,
    externalSupplyUsd: 0,
    collateralLendingApr: lendingApr,
    modeledLendingApr: income.modeled,
    leveragePolicy,
    modeledBorrowApr,
    modeledNetReturnOnEquity,
    assumptions,
    eligible: reasons.length === 0,
    exclusionReasons: reasons,
  };
}

function crossCarry(
  snapshot: Snapshot,
  borrow: Market,
  lend: Market,
  collateral: CollateralOption,
  settings: Required<Options>,
): Opportunity {
  const reasons = commonReasons(snapshot, borrow, collateral, settings.debtSizeUsd, settings.minLiquidityUsd);
  const colClass = assetClass(borrow.chainId, collateral.asset);
  const debtClass = assetClass(borrow.chainId, borrow.asset);
  if (
    !sameAsset(collateral.asset, borrow.asset) &&
    (!colClass || !debtClass || colClass.family !== debtClass.family)
  ) {
    reasons.push('Collateral basis is not in the verified chain/address coverage.');
  }
  if (
    borrow.chainId !== lend.chainId ||
    !sameAsset(borrow.asset, lend.asset) ||
    borrow.protocol === lend.protocol
  )
    reasons.push('Carry requires the exact same chain and token address across different protocols.');
  if (snapshot.providers.find((p) => p.protocol === lend.protocol)?.status !== 'live')
    reasons.push(`${lend.protocol} lending provider data is not live.`);
  if (!lend.listed || lend.isFrozen || lend.isPaused)
    reasons.push('Lending market is unlisted, paused or frozen.');
  if (unsafeSourceWarning(lend))
    reasons.push('Lending market has stale data or a red/critical provider risk warning.');
  if (!validRate(lend.supplyApy)) reasons.push('Lending rate is unavailable.');
  if (!validRate(lend.liquidityUsd) || lend.liquidityUsd < settings.minLiquidityUsd)
    reasons.push('Lending market existing exit liquidity is below the minimum.');
  if (capacity(lend.supplyCapacityUsd) < settings.debtSizeUsd)
    reasons.push('Lending destination supply cap cannot accommodate the debt size.');
  if (
    colClass?.nativeYield &&
    (!validRate(collateral.asset.nativeApr) || !collateral.asset.nativeYieldSource)
  )
    reasons.push('Native equity collateral yield is unknown.');
  const { targetLtv, leveragePolicy } = riskLimit(
    collateral,
    settings.targetLeverage,
    settings.minHealthFactor,
  );
  const equityUsd = targetLtv > 0 ? settings.debtSizeUsd / targetLtv : 0;
  const exposureUsd = equityUsd + settings.debtSizeUsd;
  // The entire posted collateral is equity: lend receipts are NOT recursively pledged.
  const leverage = targetLtv > 0 ? 1 + targetLtv : 1;
  if (targetLtv <= 0) reasons.push('No borrowing is available under the requested risk limits.');
  if (capacity(collateral.supplyCapacityUsd) < equityUsd)
    reasons.push('Separately posted collateral equity exceeds its supply cap.');
  const sameReserve = borrow.protocol === 'Aave' && sameAsset(collateral.asset, borrow.asset);
  const collateralApr = collateralIncome(
    snapshot,
    borrow,
    collateral,
    equityUsd,
    sameReserve ? settings.debtSizeUsd : 0,
  );
  if (collateralApr.current === null) reasons.push('Collateral reserve lending rate is unknown.');
  const nativeApr =
    colClass?.nativeYield && validRate(collateral.asset.nativeApr) ? collateral.asset.nativeApr : 0;
  const lendingApr = annualRate(lend.supplyApy) ?? 0;
  const borrowApr = annualRate(borrow.borrowApy) ?? 0;
  const spreadApr = lendingApr - borrowApr;
  const grossReturnOnEquity = nativeApr + (collateralApr.current ?? 0) + targetLtv * lendingApr;
  const netReturnOnEquity = grossReturnOnEquity - targetLtv * borrowApr;
  if (!(spreadApr > 0)) reasons.push('Current external lending rate does not exceed the borrow cost.');
  const modeledBorrowApr =
    sizedRate(borrow, settings.debtSizeUsd, sameReserve ? equityUsd : 0)?.borrowApr ?? null;
  const modeledLendApr = sizedRate(lend, 0, settings.debtSizeUsd)?.supplyApr ?? null;
  const modeledNetReturnOnEquity =
    modeledBorrowApr !== null && modeledLendApr !== null && collateralApr.modeled !== null
      ? nativeApr + collateralApr.modeled + targetLtv * (modeledLendApr - modeledBorrowApr)
      : null;
  if (modeledBorrowApr !== null && modeledLendApr !== null && modeledLendApr <= modeledBorrowApr)
    reasons.push('Post-size borrow cost and lending dilution eliminate the external spread.');
  const available = Math.min(
    capacity(borrow.borrowCapacityUsd),
    capacity(borrow.liquidityUsd),
    capacity(lend.supplyCapacityUsd),
    capacity(collateral.supplyCapacityUsd) * targetLtv,
  );
  return {
    id: `carry:${borrow.id}:${lend.id}:${collateral.asset.address.toLowerCase()}:${collateral.mode || 'normal'}`,
    type: 'same-asset-carry',
    title: `${borrow.asset.symbol}: ${borrow.protocol} → ${lend.protocol}`,
    chainId: borrow.chainId,
    chain: borrow.chain,
    borrowMarketId: borrow.id,
    lendMarketId: lend.id,
    borrowProtocol: borrow.protocol,
    lendProtocol: lend.protocol,
    collateralSymbol: collateral.asset.symbol,
    debtSymbol: borrow.asset.symbol,
    nativeApr,
    lendingApr,
    borrowApr,
    spreadApr,
    leverage,
    targetLtv,
    liquidationThreshold: collateral.liquidationThreshold,
    healthFactor: targetLtv > 0 ? collateral.liquidationThreshold / targetLtv : 0,
    grossReturnOnEquity,
    netReturnOnEquity,
    borrowLiquidityUsd: borrow.liquidityUsd,
    capacityUsd: finite(available) ? Math.max(0, available) : 0,
    equityUsd,
    exposureUsd,
    collateralUsd: equityUsd,
    debtUsd: settings.debtSizeUsd,
    externalSupplyUsd: settings.debtSizeUsd,
    collateralLendingApr: collateralApr.current ?? 0,
    modeledLendingApr: modeledLendApr,
    leveragePolicy,
    modeledBorrowApr,
    modeledNetReturnOnEquity,
    eligible: reasons.length === 0,
    exclusionReasons: reasons,
    assumptions: [
      ...BASE_ASSUMPTIONS,
      `Post separate ${collateral.asset.symbol} equity C = debt / LTV and lend only the borrowed ${borrow.asset.symbol}. Gross assets/equity = 1 + LTV (${leverage.toFixed(2)}×), not the requested recursive loop multiplier.`,
      `ROE = native equity APR + collateral lending APR (${((collateralApr.current ?? 0) * 100).toFixed(3)}%) + LTV × (external lending APR - borrow APR).`,
      'The external lend receipt is not assumed pledgeable at the borrowing venue. Exact chain/token addresses match; no bridge route is assumed.',
      'Debt-token native appreciation is not counted again on the externally lent principal: that principal and its same-token debt offset. Incentives are excluded on both legs.',
      'Lending destination needs the minimum pre-existing exit liquidity and enough supply-cap headroom. Liquidity can be borrowed away after entry.',
      `Collateral mode: ${collateral.mode || 'normal'}; collateral and loan retain oracle, liquidation, peg/basis and redemption risk.`,
      rateAssumption(borrow, modeledNetReturnOnEquity),
      modeledLendApr === null
        ? 'Simulated lending yield after deposit is unknown.'
        : `Simulated lending yield after deposit: ${(modeledLendApr * 100).toFixed(3)}% APR, after utilization dilution.`,
    ],
  };
}

function rank(a: Opportunity, b: Opportunity): number {
  // Measured positive size-stress candidates precede candidates awaiting an interest model.
  const confidence =
    Number(b.modeledNetReturnOnEquity !== null) - Number(a.modeledNetReturnOnEquity !== null);
  return (
    confidence ||
    (b.modeledNetReturnOnEquity ?? b.netReturnOnEquity) -
      (a.modeledNetReturnOnEquity ?? a.netReturnOnEquity) ||
    b.capacityUsd - a.capacityUsd ||
    a.id.localeCompare(b.id)
  );
}

function bestPerRoute(candidates: Opportunity[], key: (row: Opportunity) => string): Opportunity[] {
  const seen = new Set<string>();
  return candidates.sort(rank).filter((row) => {
    const route = key(row);
    if (seen.has(route)) return false;
    seen.add(route);
    return true;
  });
}

export function computeOpportunities(snapshot: Snapshot, options: Options = {}): OpportunityResult {
  const settings: Required<Options> = {
    ...parseOpportunityParameters(options),
    minHealthFactor: options.minHealthFactor ?? 1.2,
  };
  if (
    !positive(settings.minLiquidityUsd) ||
    !positive(settings.debtSizeUsd) ||
    !finite(settings.targetLeverage) ||
    settings.targetLeverage <= 1 ||
    settings.targetLeverage > 20 ||
    !finite(settings.minHealthFactor) ||
    settings.minHealthFactor < 1.05
  ) {
    throw new RangeError(
      'Use positive liquidity/debt size, leverage above 1 and at most 20, and minimum health factor at least 1.05.',
    );
  }
  const loops: Opportunity[] = [];
  const carries: Opportunity[] = [];
  const excluded: Opportunity[] = [];
  const lenders = new Map<string, Market[]>();
  for (const market of snapshot.markets) {
    const key = `${market.chainId}:${market.asset.address.toLowerCase()}`;
    lenders.set(key, [...(lenders.get(key) || []), market]);
  }
  for (const borrow of snapshot.markets) {
    for (const collateral of borrow.collateral) {
      const cls = assetClass(borrow.chainId, collateral.asset);
      // Keep unknown-yield native assets in exclusions so an empty top five has an honest explanation.
      if (cls?.nativeYield || positive(collateral.asset.nativeApr) || fixedMaturity(collateral.asset)) {
        const opportunity = nativeLoop(snapshot, borrow, collateral, settings);
        (opportunity.eligible ? loops : excluded).push(opportunity);
      }
      // Screen only observed positive cross-protocol spreads; common liquidity and risk gates run below.
      if (
        !sameAsset(collateral.asset, borrow.asset) &&
        (!cls || cls.family !== assetClass(borrow.chainId, borrow.asset)?.family)
      )
        continue;
      for (const lend of lenders.get(`${borrow.chainId}:${borrow.asset.address.toLowerCase()}`) || []) {
        if (
          lend.protocol === borrow.protocol ||
          !validRate(lend.supplyApy) ||
          !validRate(borrow.borrowApy) ||
          lend.supplyApy <= borrow.borrowApy
        )
          continue;
        const opportunity = crossCarry(snapshot, borrow, lend, collateral, settings);
        (opportunity.eligible ? carries : excluded).push(opportunity);
      }
    }
  }
  return {
    loops: bestPerRoute(loops, (row) => row.id.slice(0, row.id.lastIndexOf(':'))).slice(0, 5),
    carry: bestPerRoute(carries, (row) => `${row.borrowMarketId}:${row.lendMarketId}`).slice(0, 10),
    excluded: excluded
      .sort((a, b) => b.borrowLiquidityUsd - a.borrowLiquidityUsd || a.id.localeCompare(b.id))
      .slice(0, 150),
    minLiquidityUsd: settings.minLiquidityUsd,
    targetLeverage: settings.targetLeverage,
    debtSizeUsd: settings.debtSizeUsd,
    minHealthFactor: settings.minHealthFactor,
    fetchedAt: snapshot.fetchedAt,
    methodology: [
      'All displayed rates are fractions internally. Convert provider supply/borrow APY with ln(1 + APY); native yield uses the source APR. ROE is a simple annualized run-rate, not compounded APY.',
      'Native loop: L = min(requested leverage, risk-constrained leverage); debt/equity = L - 1; collateral/equity = L. LTV ≤ 98% of protocol LTV and liquidation threshold / minimum health factor (default 1.2).',
      'Native loop ROE = L × (native APR + collateral lending APR) - (L - 1) × borrow APR. Morpho collateral has zero protocol lending income. An eligible loop must have positive incremental yield, including the post-size stress when known.',
      'Cross-protocol carry: collateral equity = debt / LTV; external lend = debt; assets/equity = 1 + LTV. ROE = collateral income + LTV × (lend APR - borrow APR). External receipts are not presumed recursively pledgeable.',
      `The scenario defaults to $5m debt and $5m liquidity, with manual dollar inputs allowed from $1. Current debt: $${settings.debtSizeUsd.toLocaleString('en-US')}; minimum existing borrow and external-lending exit liquidity: $${settings.minLiquidityUsd.toLocaleString('en-US')}. Debt must fit remaining borrow capacity and collateral supply caps and leave some borrow liquidity. External lending also needs deposit-cap headroom.`,
      'Post-size models use the Aave two-slope curve or Morpho AdaptiveCurveIRM at fixed current rate-at-target. Supply income is diluted by the added deposit and updated borrow rate with inferred current fee pass-through. Unsupported or inconsistent models return unknown.',
      'Aave borrow utilization uses virtual available liquidity plus debt. Supply dilution uses indexed total deposits as its distribution base and holds inferred pass-through constant; unbacked and reserve accounting are not independently read on-chain.',
      'Source for Aave model: https://github.com/aave/risk-v3/blob/main/liquidity-risk/borrow-interest-rate.md ; Morpho model: https://github.com/morpho-org/morpho-blue-irm/blob/main/src/adaptive-curve-irm/AdaptiveCurveIrm.sol .',
      'Rank known positive post-size ROE first, then current-rate candidates awaiting a model. Never fill five places with negative spreads. Each capacity is independent and overlaps with routes sharing liquidity.',
      `${excluded.length} candidate scenarios were excluded. The exclusion table shows at most 150, ordered by borrow liquidity; modes and routes may overlap.`,
      'Native relationships use an explicit chain/address allowlist. Unknown assets, missing native yield and PT/YT maturity strategies are excluded. Cross-platform loan/lend tokens require exact same-chain address identity.',
      'Research only: indexed snapshots are not block-pinned execution quotes. Swap/mint/redemption depth, fees, oracle basis, health-factor dynamics and entry/exit simulations still require verification. No bridge or remote collateral route is assumed.',
    ],
  };
}
