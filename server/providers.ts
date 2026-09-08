import type {
  Asset,
  CollateralOption,
  CollateralDetail,
  HistoryPoint,
  Market,
  MarketHistory,
  ProviderStatus,
  Snapshot,
} from '../shared/types.js';
import { aaveV3MarketUrl, aaveV4MarketUrl, morphoMarketUrl } from '../shared/market-links.js';
import { collateralCap } from '../shared/market-details.js';

export const AAVE_API = 'https://api.v3.aave.com/graphql';
export const AAVE_V4_API = 'https://api.v4.aave.com/graphql';
export const MORPHO_API = 'https://api.morpho.org/graphql';
const DAY = 86_400;
type Raw = Record<string, any>;
const upstreamCooldowns = new Map<string, number>();
class UpstreamError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Public, unauthenticated reads. A GraphQL error never silently becomes a zero rate. */
async function graphql(endpoint: string, query: string, variables: Raw = {}): Promise<Raw> {
  const cooldown = upstreamCooldowns.get(endpoint) ?? 0;
  if (cooldown > Date.now())
    throw new UpstreamError(
      `Rate limited by ${new URL(endpoint).hostname}; retry after ${new Date(cooldown).toISOString()}`,
      false,
    );
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const seconds =
          header && Number.isFinite(Number(header))
            ? Number(header)
            : header
              ? (Date.parse(header) - Date.now()) / 1_000
              : 60;
        const retryAt =
          Date.now() + Math.max(1, Math.min(3_600, Number.isFinite(seconds) ? seconds : 60)) * 1_000;
        upstreamCooldowns.set(endpoint, retryAt);
        throw new UpstreamError(
          `HTTP 429 from ${new URL(endpoint).hostname}; retry after ${new Date(retryAt).toISOString()}`,
          false,
        );
      }
      if (!response.ok)
        throw new UpstreamError(
          `HTTP ${response.status} from ${new URL(endpoint).hostname}`,
          response.status >= 500 || response.status === 408,
        );
      const body = (await response.json()) as Raw;
      if (body.errors?.length)
        throw new UpstreamError(
          body.errors
            .map((e: Raw) => e.message)
            .join('; ')
            .slice(0, 500),
          false,
        );
      if (!body.data) throw new Error('Upstream returned no GraphQL data');
      return body.data;
    } catch (error) {
      failure = error;
      if (error instanceof UpstreamError && !error.retryable) throw error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw failure;
}

async function concurrentMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        output[index] = await fn(items[index]);
      }
    }),
  );
  return output;
}

export function numeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
const amount = (value: unknown) => Math.max(0, numeric(value) ?? 0);
const percent = (value: Raw | undefined | null) => numeric(value?.value);
const assetKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

export function supplyCapacity(reserve: Raw): number | null {
  if (reserve.isFrozen || reserve.isPaused || reserve.supplyInfo.supplyCapReached) return 0;
  const capTokens = numeric(reserve.supplyInfo.supplyCap?.amount?.value);
  if (capTokens === 0) return null; // Aave's zero cap explicitly means uncapped.
  const price = numeric(reserve.usdExchangeRate);
  const supplied = numeric(reserve.supplyInfo.total?.value);
  if (capTokens === null || price === null || supplied === null) return 0;
  return Math.max(0, capTokens - supplied) * price;
}

const AAVE_RESERVES = `query MarketSnapshot($chainIds: [ChainId!]!) {
  markets(request: { chainIds: $chainIds }) {
    name address chain { name chainId }
    reserves(request: { reserveType: BOTH, orderBy: { tokenName: ASC } }) {
      underlyingToken { address symbol decimals }
      usdExchangeRate size { usd amount { value } }
      supplyInfo {
        apy { value } maxLTV { value } liquidationThreshold { value } canBeCollateral
        supplyCap { usd amount { value } } supplyCapReached total { value }
      }
      borrowInfo {
        apy { value } total { usd amount { value } } availableLiquidity { usd }
        utilizationRate { value } borrowingState borrowCap { usd amount { value } } borrowCapReached
        baseVariableBorrowRate { value } variableRateSlope1 { value } variableRateSlope2 { value } optimalUsageRate { value }
      }
      isFrozen isPaused
      isolationModeConfig { canBeCollateral canBeBorrowed debtCeiling { usd } totalBorrows { usd } }
      eModeInfo { categoryId label maxLTV { value } liquidationThreshold { value } canBeCollateral canBeBorrowed hasLtvZero }
      incentives {
        __typename
        ... on AaveSupplyIncentive { extraSupplyApr { value } }
        ... on AaveBorrowIncentive { borrowAprDiscount { value } }
        ... on MeritSupplyIncentive { extraSupplyApr { value } }
        ... on MeritBorrowIncentive { borrowAprDiscount { value } }
        ... on MerklSupplyIncentive { extraSupplyApr { value } startDate endDate }
        ... on MerklBorrowIncentive { borrowAprDiscount { value } startDate endDate }
      }
    }
  }
}`;

function aaveAsset(reserve: Raw): Asset {
  return { ...reserve.underlyingToken, priceUsd: numeric(reserve.usdExchangeRate), nativeApr: null };
}

export function aaveCollateralDetails(pool: Raw, debt: Raw): CollateralDetail[] {
  if (!debt.borrowInfo) return [];
  return (pool.reserves as Raw[]).flatMap((candidate) => {
    const cap = collateralCap(
      numeric(candidate.supplyInfo.total?.value),
      numeric(candidate.supplyInfo.supplyCap?.amount?.value),
      numeric(candidate.usdExchangeRate),
      true,
    );
    const headroom = supplyCapacity(candidate);
    const restrictions: string[] = [];
    if (candidate.isPaused) restrictions.push('Paused collateral reserve.');
    if (candidate.isFrozen) restrictions.push('Frozen: no new collateral supply.');
    if (candidate.supplyInfo.supplyCapReached || (cap.usedRatio !== null && cap.usedRatio >= 1))
      restrictions.push('Supply cap reached: no new collateral supply.');
    if (/horizon/i.test(pool.name))
      restrictions.push('Permissioned market; wallet eligibility is not verified.');
    const common = {
      asset: aaveAsset(candidate),
      supplyCap: cap,
      supplyHeadroomUsd: cap.status === 'unknown' ? null : headroom,
      newSupplyEnabled: !candidate.isPaused && !candidate.isFrozen && (headroom === null || headroom > 0),
      restrictions,
    };
    if (candidate.isolationModeConfig?.canBeCollateral) {
      if (
        !debt.isolationModeConfig?.canBeBorrowed ||
        !candidate.supplyInfo.canBeCollateral ||
        !(percent(candidate.supplyInfo.maxLTV)! > 0)
      )
        return [];
      return [
        {
          ...common,
          mode: 'Isolation',
          ltv: percent(candidate.supplyInfo.maxLTV),
          liquidationThreshold: percent(candidate.supplyInfo.liquidationThreshold),
          isolationDebt: {
            usedUsd: numeric(candidate.isolationModeConfig.totalBorrows?.usd),
            ceilingUsd: numeric(candidate.isolationModeConfig.debtCeiling?.usd),
          },
          restrictions: [
            ...restrictions,
            'Only this collateral may be enabled; shared isolation debt ceiling applies. Excluded from opportunity screening.',
          ],
        },
      ];
    }
    const details: CollateralDetail[] = [];
    if (candidate.supplyInfo.canBeCollateral && percent(candidate.supplyInfo.maxLTV)! > 0)
      details.push({
        ...common,
        mode: 'Standard',
        ltv: percent(candidate.supplyInfo.maxLTV),
        liquidationThreshold: percent(candidate.supplyInfo.liquidationThreshold),
      });
    for (const mode of candidate.eModeInfo ?? []) {
      if (!mode.canBeCollateral || mode.hasLtvZero || !(percent(mode.maxLTV)! > 0)) continue;
      if (!(debt.eModeInfo ?? []).some((m: Raw) => m.categoryId === mode.categoryId && m.canBeBorrowed))
        continue;
      details.push({
        ...common,
        mode: `eMode ${mode.categoryId}: ${mode.label}`,
        ltv: percent(mode.maxLTV),
        liquidationThreshold: percent(mode.liquidationThreshold),
      });
    }
    return details;
  });
}

/** Each row is one reserve, so its pool's other collateral is not added to its supply total. */
export function normalizeAavePool(pool: Raw, fetchedAt: string): Market[] {
  return pool.reserves.map((reserve: Raw): Market => {
    const borrow = reserve.borrowInfo;
    const permissioned = /horizon/i.test(pool.name);
    const active = !reserve.isFrozen && !reserve.isPaused;
    const borrowingEnabled = active && !permissioned && borrow?.borrowingState === 'ENABLED';
    const liquidityUsd = amount(borrow?.availableLiquidity?.usd ?? reserve.size.usd);
    const borrowCapTokens = numeric(borrow?.borrowCap?.amount?.value);
    const borrowedTokens = numeric(borrow?.total?.amount?.value);
    const price = numeric(reserve.usdExchangeRate);
    const capRoom =
      borrowCapTokens === 0
        ? liquidityUsd
        : borrowCapTokens !== null && borrowedTokens !== null && price !== null
          ? Math.max(0, borrowCapTokens - borrowedTokens) * price
          : 0;
    const collateral: CollateralOption[] = [];
    if (borrowingEnabled)
      for (const candidate of pool.reserves as Raw[]) {
        // Isolation debt ceiling and borrower eligibility require a separate model.
        if (candidate.isFrozen || candidate.isPaused || candidate.isolationModeConfig?.canBeCollateral)
          continue;
        const common = {
          asset: aaveAsset(candidate),
          supplyCapacityUsd: supplyCapacity(candidate),
          supplyApy: percent(candidate.supplyInfo.apy) ?? 0,
        };
        if (candidate.supplyInfo.canBeCollateral && amount(candidate.supplyInfo.maxLTV.value) > 0) {
          collateral.push({
            ...common,
            ltv: amount(candidate.supplyInfo.maxLTV.value),
            liquidationThreshold: amount(candidate.supplyInfo.liquidationThreshold.value),
            mode: 'Standard',
          });
        }
        for (const mode of candidate.eModeInfo as Raw[]) {
          if (!mode.canBeCollateral || mode.hasLtvZero || !(percent(mode.maxLTV)! > 0)) continue;
          if (
            !reserve.eModeInfo.some(
              (debtMode: Raw) => debtMode.categoryId === mode.categoryId && debtMode.canBeBorrowed,
            )
          )
            continue;
          collateral.push({
            ...common,
            ltv: amount(mode.maxLTV.value),
            liquidationThreshold: amount(mode.liquidationThreshold.value),
            mode: `eMode ${mode.categoryId}: ${mode.label}`,
          });
        }
      }
    const incentives = (reserve.incentives as Raw[]).filter(
      (i) => !i.startDate || (Date.parse(i.startDate) <= Date.now() && Date.parse(i.endDate) > Date.now()),
    );
    const warnings: string[] = [];
    if (permissioned)
      warnings.push(
        'Permissioned Horizon market: borrower eligibility is not verified; excluded from opportunity screening.',
      );
    if (reserve.isolationModeConfig?.canBeCollateral)
      warnings.push(
        'Isolation collateral: excluded from loop collateral options until debt-ceiling eligibility is modeled.',
      );
    if (incentives.length)
      warnings.push(
        'Displayed reward APR is indicative; campaign eligibility and points are not included in loop returns.',
      );
    if (reserve.isFrozen) warnings.push('Reserve frozen: new supply and borrowing unavailable.');
    if (reserve.isPaused) warnings.push('Reserve paused.');
    if (price === null || price <= 0) warnings.push('USD price unavailable.');
    const modelValues = borrow && [
      percent(borrow.optimalUsageRate),
      percent(borrow.baseVariableBorrowRate),
      percent(borrow.variableRateSlope1),
      percent(borrow.variableRateSlope2),
    ];
    return {
      id: `aave:${pool.chain.chainId}:${pool.address.toLowerCase()}:${reserve.underlyingToken.address.toLowerCase()}`,
      protocol: 'Aave',
      version: 'V3',
      chainId: pool.chain.chainId,
      chain: pool.chain.name,
      name: pool.name.replace(/^AaveV3/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
      address: pool.address,
      asset: aaveAsset(reserve),
      collateral,
      collateralDetails: aaveCollateralDetails(pool, reserve),
      supplyApy: percent(reserve.supplyInfo.apy),
      borrowApy: percent(borrow?.apy),
      supplyRewardApr: incentives.reduce((n, i) => n + amount(i.extraSupplyApr?.value), 0),
      borrowRewardApr: incentives.reduce((n, i) => n + amount(i.borrowAprDiscount?.value), 0),
      totalSupplyUsd: amount(reserve.size.usd),
      totalBorrowUsd: amount(borrow?.total?.usd),
      liquidityUsd,
      borrowCapacityUsd: borrowingEnabled && !borrow.borrowCapReached ? Math.min(liquidityUsd, capRoom) : 0,
      supplyCapacityUsd: supplyCapacity(reserve),
      utilization: amount(borrow?.utilizationRate?.value),
      lltv: null,
      listed: true,
      isFrozen: reserve.isFrozen,
      isPaused: reserve.isPaused,
      borrowingEnabled,
      sourceUrl: aaveV3MarketUrl(pool.chain.chainId, pool.address, reserve.underlyingToken.address) ?? '',
      fetchedAt,
      warnings,
      ...(modelValues?.every((v: number | null) => v !== null)
        ? {
            rateModel: {
              kind: 'aave-kink' as const,
              optimalUtilization: modelValues[0]!,
              baseApr: modelValues[1]!,
              slope1: modelValues[2]!,
              slope2: modelValues[3]!,
            },
          }
        : {}),
      historyRef: {
        pool: pool.address,
        underlyingToken: reserve.underlyingToken.address,
        chainId: pool.chain.chainId,
      },
    };
  });
}

async function fetchAave(): Promise<{ markets: Market[]; provider: ProviderStatus }> {
  const fetchedAt = new Date().toISOString();
  const { chains } = await graphql(AAVE_API, '{ chains(filter: MAINNET_ONLY) { name chainId } }');
  // Aave accepts the full chain-ID list. One batch avoids 21 per-chain requests
  // and the rate-limit bursts those produce during refresh + history browsing.
  const pools = (
    await graphql(AAVE_API, AAVE_RESERVES, { chainIds: chains.map((chain: Raw) => chain.chainId) })
  ).markets as Raw[];
  const markets = pools.flatMap((pool) => normalizeAavePool(pool, fetchedAt));
  if (!markets.length) throw new Error('Aave returned no markets');
  return {
    markets,
    provider: {
      protocol: 'Aave',
      status: 'live',
      fetchedAt,
      marketCount: markets.length,
      coverage: `Aave V3: ${pools.length} pools across ${new Set(markets.map((m) => m.chainId)).size}/${chains.length} API mainnet chains. V2 and V4 are not included.`,
      detail:
        'Direct public Aave V3 API. Protocol APYs exclude incentives and native asset yield. Isolated collateral and permissioned borrowing excluded from screening.',
    },
  };
}

const AAVE_V4_RESERVES = `query ReserveSnapshot($chains: [ChainId!]!) {
  reserves(request: { query: { chainIds: $chains }, filter: ALL, orderBy: { assetName: ASC } }) {
    id onChainId chain { name chainId } spoke { id name address }
    canBorrow canSupply canUseAsCollateral status { frozen paused active }
    settings { collateralFactor { value } collateralRisk { value } collateral borrowable suppliable supplyCap { amount { value } exchange { value } } }
    asset {
      id hub { id name } underlying { address info { symbol decimals } }
      summary { availableLiquidity { exchange { value } } utilizationRate { value } }
    }
    summary {
      supplied { amount { value } exchange { value } exchangeRate { value } } borrowed { exchange { value } }
      suppliable { exchange { value } } borrowable { exchange { value } }
      supplyApy { value } borrowApy { value } underlyingApy { value }
    }
  }
}`;

function aaveV4Asset(reserve: Raw): Asset {
  const nativeApy = percent(reserve.summary.underlyingApy);
  return {
    address: reserve.asset.underlying.address,
    symbol: reserve.asset.underlying.info.symbol,
    decimals: reserve.asset.underlying.info.decimals,
    priceUsd: numeric(reserve.summary.supplied.exchangeRate.value),
    nativeApr: nativeApy === null ? null : Math.log1p(nativeApy),
    ...(nativeApy === null
      ? {}
      : {
          nativeYieldSource:
            'Aave V4 price-source underlying APY, converted with ln(1 + APY) to annualized log return',
        }),
  };
}

export function normalizeAaveV4(reserves: Raw[], fetchedAt: string): Market[] {
  return reserves.map((reserve): Market => {
    const status = reserve.status;
    const enabled = status.active && !status.paused && !status.frozen;
    const summary = reserve.summary;
    const hubLiquidity = amount(reserve.asset.summary.availableLiquidity.exchange.value);
    const collateral: CollateralOption[] =
      enabled && reserve.canBorrow
        ? reserves
            .filter(
              (candidate) =>
                candidate.spoke.id === reserve.spoke.id &&
                candidate.canUseAsCollateral &&
                candidate.canSupply &&
                candidate.status.active &&
                !candidate.status.paused &&
                !candidate.status.frozen,
            )
            .map((candidate) => ({
              asset: aaveV4Asset(candidate),
              ltv: amount(candidate.settings.collateralFactor.value),
              liquidationThreshold: amount(candidate.settings.collateralFactor.value),
              supplyCapacityUsd: amount(candidate.summary.suppliable.exchange.value),
              supplyApy: percent(candidate.summary.supplyApy) ?? 0,
              mode: 'Spoke; additional collateral risk premium applies',
            }))
        : [];
    return {
      id: `aave-v4:${reserve.id}`,
      protocol: 'Aave',
      version: 'V4',
      chainId: reserve.chain.chainId,
      chain: reserve.chain.name,
      name: `${reserve.asset.hub.name} / ${reserve.spoke.name}`,
      address: reserve.spoke.address,
      asset: aaveV4Asset(reserve),
      collateral,
      collateralDetails:
        (reserve.settings.borrowable ?? reserve.canBorrow)
          ? reserves
              .filter(
                (candidate) =>
                  candidate.spoke.id === reserve.spoke.id &&
                  (candidate.settings.collateral ?? candidate.canUseAsCollateral) &&
                  amount(candidate.settings.collateralFactor.value) > 0,
              )
              .map((candidate) => ({
                asset: aaveV4Asset(candidate),
                mode: 'Spoke',
                ltv: null,
                liquidationThreshold: percent(candidate.settings.collateralFactor),
                supplyCap: collateralCap(
                  numeric(candidate.summary.supplied.amount?.value),
                  numeric(candidate.settings.supplyCap?.amount?.value),
                  numeric(candidate.summary.supplied.exchangeRate.value),
                  false,
                ),
                supplyHeadroomUsd: numeric(candidate.summary.suppliable.exchange.value),
                newSupplyEnabled:
                  candidate.canSupply &&
                  candidate.status.active &&
                  !candidate.status.paused &&
                  !candidate.status.frozen &&
                  amount(candidate.summary.suppliable.exchange.value) > 0,
                restrictions: [
                  'Collateral factor determines the health-factor limit; borrower-specific risk premium applies.',
                  ...(!candidate.status.active || candidate.status.paused
                    ? ['Collateral reserve inactive or paused.']
                    : []),
                  ...(candidate.status.frozen ? ['Frozen: no new collateral supply.'] : []),
                  ...(!candidate.canSupply || amount(candidate.summary.suppliable.exchange.value) === 0
                    ? ['No new supply headroom reported.']
                    : []),
                ],
              }))
          : [],
      supplyApy: percent(summary.supplyApy),
      borrowApy: reserve.canBorrow ? percent(summary.borrowApy) : null,
      supplyRewardApr: 0,
      borrowRewardApr: 0,
      totalSupplyUsd: amount(summary.supplied.exchange.value),
      totalBorrowUsd: amount(summary.borrowed.exchange.value),
      liquidityUsd: hubLiquidity,
      liquidityGroupId: `aave-v4-hub-asset:${reserve.asset.id}`,
      liquidityGroupUsd: hubLiquidity,
      borrowCapacityUsd:
        enabled && reserve.canBorrow ? Math.min(hubLiquidity, amount(summary.borrowable.exchange.value)) : 0,
      supplyCapacityUsd: enabled && reserve.canSupply ? amount(summary.suppliable.exchange.value) : 0,
      utilization: amount(reserve.asset.summary.utilizationRate.value),
      lltv: null,
      listed: true,
      isFrozen: status.frozen,
      isPaused: status.paused,
      borrowingEnabled: enabled && reserve.canBorrow,
      sourceUrl: aaveV4MarketUrl(reserve.id) ?? '',
      fetchedAt,
      warnings: [
        'V4 borrow APY is the shared rate before borrower-specific collateral risk premium. V4 borrowing excluded from opportunity rankings.',
        'Available liquidity is shared by this hub asset across spokes; aggregate KPIs count it once. Borrow capacity also respects this spoke credit line.',
        'V4 reward rates are not normalized into reward APR; protocol rates exclude incentives.',
      ],
      historyRef: { reserveId: reserve.id, chainId: reserve.chain.chainId },
    };
  });
}

async function fetchAaveV4(): Promise<{ markets: Market[]; coverage: string }> {
  const { chains } = await graphql(
    AAVE_V4_API,
    '{ chains(request: { query: { filter: MAINNET_ONLY } }) { name chainId } }',
  );
  const { reserves } = await graphql(AAVE_V4_API, AAVE_V4_RESERVES, {
    chains: chains.map((chain: Raw) => chain.chainId),
  });
  const markets = normalizeAaveV4(reserves, new Date().toISOString());
  return {
    markets,
    coverage: `V4: ${markets.length} spoke reserves across ${new Set(markets.map((m) => m.chainId)).size} populated / ${chains.length} API mainnet chains, ${new Set(reserves.map((r: Raw) => r.asset.hub.id)).size} hubs; hub liquidity counted once.`,
  };
}

const MORPHO_ASSET = 'address symbol decimals price { usd timestamp } yield { apr lookback }';
const MORPHO_MARKETS = `query MarketSnapshot($skip: Int!, $first: Int!) {
  markets(first: $first, skip: $skip, where: { listed: true }, orderBy: UniqueKey, orderDirection: Asc) {
    pageInfo { countTotal count }
    items {
      marketId chain { id network } lltv listed irmAddress
      loanAsset { ${MORPHO_ASSET} } collateralAsset { ${MORPHO_ASSET} }
      state {
        timestamp supplyApy borrowApy supplyAssetsUsd borrowAssetsUsd liquidityAssetsUsd collateralAssets collateralAssetsUsd utilization apyAtTarget
        rewards { supplyApr borrowApr }
      }
      warnings { type level }
    }
  }
}`;

// Official deployment registry: https://docs.morpho.org/developers/contracts/addresses/
// Unrecognized/new IRMs get no size-impact model instead of an assumed curve.
const ADAPTIVE_IRMS = new Set([
  '1:0x870ac11d48b15db9a138cf899d20f13f79ba00bc',
  '8453:0x46415998764c29ab2a25cbea6254146d50d22687',
  '42161:0x66f30587fb8d4206918deb78eca7d5ebbafd06da',
  '999:0xd4a426f010986dcad727e8dd6eed44ca4a9b7483',
  '143:0x09475a3d6ea8c314c592b1a3799bde044e2f400f',
  '747474:0x4f708c0ae7ded3d74736594c2109c2e3c065b428',
  '137:0xe675a2161d4a6e2de2eed70ac98eebf257fbf0b0',
  '4663:0x2bd3d5965b26b51814ac95127b2b80dd6ccc0fa1',
  '10:0x8cd70a8f399428456b29546bc5dbe10ab6a06ef6',
  '5042:0xf02615d094fc02fc031c35fe705e175aa4653f20',
  '988:0x41e846fc8108b8527c1d4edb4c9564e56442940f',
  '130:0x9a6061d51743b31d2c3be75d83781fa423f53f0e',
  '4217:0x112fd4042e442c3c12c67ad23587b0afe36eb74e',
]);

function morphoAsset(raw: Raw): Asset {
  return {
    address: raw.address,
    symbol: raw.symbol,
    decimals: raw.decimals,
    priceUsd: numeric(raw.price?.usd),
    nativeApr: numeric(raw.yield?.apr),
    ...(raw.yield
      ? {
          nativeYieldSource: 'Morpho asset.yield (trailing exchange-rate APR)',
          nativeYieldLookbackSeconds: raw.yield.lookback,
        }
      : {}),
  };
}

export function normalizeMorpho(raw: Raw, fetchedAt: string): Market {
  const state = raw.state;
  const observedAt = numeric(state?.timestamp);
  const lltv = (numeric(raw.lltv) ?? 0) / 1e18;
  const warnings = raw.warnings.map((w: Raw) => `${w.level}: ${w.type}`);
  if (!state) warnings.push('Current market state unavailable.');
  if (state && Date.now() / 1000 - Number(state.timestamp) > 900)
    warnings.push('STALE_STATE: API market state is more than 15 minutes old.');
  // Indexed balances can be fresh while their USD valuation is stale. The
  // one-hour research freshness policy applies independently to both assets.
  for (const [role, asset] of [
    ['Loan', raw.loanAsset],
    ['Collateral', raw.collateralAsset],
  ] as const) {
    if (!asset) continue;
    const timestamp = numeric(asset.price?.timestamp);
    if (timestamp === null || Date.now() / 1000 - timestamp > 3_600) {
      warnings.push(
        `STALE_PRICE: ${role} asset ${asset.symbol} USD price ${timestamp === null ? 'has no timestamp' : 'is more than one hour old'}; excluded from opportunity screening.`,
      );
    }
  }
  if (state?.liquidityAssetsUsd == null) warnings.push('USD liquidity unavailable.');
  if (!raw.collateralAsset || lltv === 0) warnings.push('Idle market: no borrowing collateral.');
  const borrowingEnabled = Boolean(
    state &&
    raw.collateralAsset &&
    lltv > 0 &&
    !warnings.some((w: string) => /STALE_STATE|STALE_PRICE|RED:|CRITICAL:/i.test(w)),
  );
  const baseApr = numeric(state?.apyAtTarget);
  return {
    id: `morpho:${raw.chain.id}:${raw.marketId.toLowerCase()}`,
    protocol: 'Morpho',
    version: 'Blue',
    chainId: raw.chain.id,
    chain: raw.chain.network,
    name: `${raw.collateralAsset?.symbol ?? 'Idle'} / ${raw.loanAsset.symbol}`,
    address: raw.marketId,
    asset: morphoAsset(raw.loanAsset),
    collateral:
      raw.collateralAsset && lltv > 0
        ? [
            {
              asset: morphoAsset(raw.collateralAsset),
              ltv: lltv,
              liquidationThreshold: lltv,
              supplyCapacityUsd: null,
              supplyApy: 0,
              mode: 'Isolated',
            },
          ]
        : [],
    collateralDetails:
      raw.collateralAsset && lltv > 0
        ? [
            {
              asset: morphoAsset(raw.collateralAsset),
              mode: 'Isolated market',
              ltv: null,
              liquidationThreshold: lltv,
              supplyCap: {
                ...collateralCap(
                  numeric(state?.collateralAssets) === null
                    ? null
                    : Number(state.collateralAssets) / 10 ** raw.collateralAsset.decimals,
                  0,
                  numeric(raw.collateralAsset.price?.usd),
                  true,
                ),
                usedUsd: numeric(state?.collateralAssetsUsd),
              },
              supplyHeadroomUsd: null,
              newSupplyEnabled: Boolean(state),
              restrictions: [
                'No protocol collateral amount cap. Vault allocation caps are separate and do not cap direct Blue collateral deposits.',
              ],
            },
          ]
        : [],
    supplyApy: numeric(state?.supplyApy),
    borrowApy: numeric(state?.borrowApy),
    supplyRewardApr: (state?.rewards ?? []).reduce((n: number, r: Raw) => n + amount(r.supplyApr), 0),
    borrowRewardApr: (state?.rewards ?? []).reduce((n: number, r: Raw) => n + amount(r.borrowApr), 0),
    totalSupplyUsd: amount(state?.supplyAssetsUsd),
    totalBorrowUsd: amount(state?.borrowAssetsUsd),
    liquidityUsd: amount(state?.liquidityAssetsUsd),
    segregatedCollateralUsd:
      !raw.collateralAsset || (state?.collateralAssets != null && String(state.collateralAssets) === '0')
        ? 0
        : numeric(state?.collateralAssetsUsd),
    borrowCapacityUsd: borrowingEnabled ? amount(state?.liquidityAssetsUsd) : 0,
    supplyCapacityUsd: state ? null : 0,
    utilization: amount(state?.utilization),
    lltv,
    listed: raw.listed,
    isFrozen: false,
    isPaused: false,
    borrowingEnabled,
    sourceUrl: morphoMarketUrl(raw.chain.id, raw.marketId) ?? '',
    fetchedAt,
    warnings,
    rateObservedAt:
      observedAt !== null && Number.isFinite(new Date(observedAt * 1000).getTime())
        ? new Date(observedAt * 1000).toISOString()
        : null,
    ...(baseApr !== null && ADAPTIVE_IRMS.has(`${raw.chain.id}:${raw.irmAddress.toLowerCase()}`)
      ? {
          rateModel: {
            kind: 'morpho-adaptive' as const,
            optimalUtilization: 0.9,
            baseApr: Math.log1p(baseApr),
            slope1: 0,
            slope2: 0,
          },
        }
      : {}),
    historyRef: { marketId: raw.marketId, chainId: raw.chain.id },
  };
}

async function fetchMorpho(): Promise<{ markets: Market[]; provider: ProviderStatus }> {
  const fetchedAt = new Date().toISOString();
  const first = 100;
  const initial = (await graphql(MORPHO_API, MORPHO_MARKETS, { skip: 0, first })).markets;
  const count = initial.pageInfo.countTotal;
  const offsets = Array.from(
    { length: Math.max(0, Math.ceil(count / first) - 1) },
    (_, i) => (i + 1) * first,
  );
  const pages = await concurrentMap(
    offsets,
    3,
    async (skip) => (await graphql(MORPHO_API, MORPHO_MARKETS, { skip, first })).markets.items,
  );
  const unique = new Map<string, Raw>();
  for (const raw of [initial.items, ...pages].flat()) unique.set(`${raw.chain.id}:${raw.marketId}`, raw);
  const markets = [...unique.values()].map((raw) => normalizeMorpho(raw, fetchedAt));
  const missing = Math.max(0, count - markets.length);
  return {
    markets,
    provider: {
      protocol: 'Morpho',
      status: missing ? 'error' : 'live',
      fetchedAt,
      marketCount: markets.length,
      coverage: `Morpho Blue: ${markets.length}/${count} listed markets across ${new Set(markets.map((m) => m.chainId)).size} API networks; all pages fetched. Unlisted markets, optimizer and fixed-rate Midnight excluded. Vault allocations are not added again.`,
      detail: missing
        ? `Pagination changed during retrieval: ${missing} markets missing. Refresh required.`
        : 'Immediate market liquidity only; Public Allocator shared liquidity is excluded to avoid double counting. Collateral native yield is separate from loan-token supply APY.',
    },
  };
}

async function enrichAaveNativeYield(markets: Market[]): Promise<void> {
  const known = new Map<string, Asset>();
  // V4 also publishes price-source native yield. Use it only as a fallback for
  // other Aave reserves; Morpho's trailing APR takes precedence when available.
  for (const market of markets.filter((m) => m.version === 'V4')) {
    if (market.asset.nativeApr !== null && market.asset.nativeApr > 0)
      known.set(assetKey(market.chainId, market.asset.address), market.asset);
  }
  for (const market of markets.filter((m) => m.protocol === 'Morpho')) {
    for (const asset of [market.asset, ...market.collateral.map((c) => c.asset)]) {
      if (asset.nativeApr !== null) known.set(assetKey(market.chainId, asset.address), asset);
    }
  }
  const aave = markets.filter((m) => m.protocol === 'Aave');
  const addresses = [
    ...new Set(
      aave.filter((m) => !known.has(assetKey(m.chainId, m.asset.address))).map((m) => m.asset.address),
    ),
  ];
  // Query by address AND preserve chain identity when attaching data. Never match by symbol.
  const chunks = Array.from({ length: Math.ceil(addresses.length / 60) }, (_, i) =>
    addresses.slice(i * 60, (i + 1) * 60),
  );
  await concurrentMap(chunks, 3, async (addressList) => {
    try {
      const data = await graphql(
        MORPHO_API,
        `query NativeYields($addresses: [String!]) { assets(first: 1000, where: { address_in: $addresses }) { items { chain { id } ${MORPHO_ASSET} } } }`,
        { addresses: addressList },
      );
      for (const raw of data.assets.items)
        if (raw.yield) known.set(assetKey(raw.chain.id, raw.address), morphoAsset(raw));
    } catch {
      /* Optional enrichment: missing native yield stays null and cannot create a loop. */
    }
  });
  for (const market of aave.filter((m) => m.version !== 'V4'))
    for (const asset of [market.asset, ...market.collateral.map((c) => c.asset)]) {
      const source = known.get(assetKey(market.chainId, asset.address));
      if (!source) continue;
      asset.nativeApr = source.nativeApr;
      asset.nativeYieldSource = source.nativeYieldSource;
      asset.nativeYieldLookbackSeconds = source.nativeYieldLookbackSeconds;
    }
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const [results, v4] = await Promise.all([
    Promise.allSettled([fetchAave(), fetchMorpho()]),
    fetchAaveV4()
      .then((value) => ({ value, error: null as string | null }))
      .catch((error) => ({ value: null, error: error instanceof Error ? error.message : String(error) })),
  ]);
  const markets: Market[] = [];
  const providers: ProviderStatus[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      markets.push(...result.value.markets);
      providers.push(result.value.provider);
    } else
      providers.push({
        protocol: index === 0 ? 'Aave' : 'Morpho',
        status: 'error',
        fetchedAt: null,
        marketCount: 0,
        coverage: 'Provider unavailable',
        detail: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
  }
  const aave = providers.find((provider) => provider.protocol === 'Aave')!;
  if (v4.value) {
    markets.push(...v4.value.markets);
    aave.marketCount += v4.value.markets.length;
    aave.coverage =
      aave.coverage.replace('V2 and V4 are not included.', '') +
      ` ${v4.value.coverage} V2 and non-EVM deployments excluded.`;
    aave.detail = `${aave.detail ?? ''} V4 collateral risk premium is not modeled; V4 included in comparisons but excluded as an opportunity borrowing venue.`;
  } else {
    aave.status = 'error';
    aave.detail = `${aave.detail ?? ''} V4 unavailable: ${v4.error}. V3 rows remain usable; Aave total coverage is partial.`;
  }
  // Chain identity is numeric. Prefer Aave's V3 mainnet display name, then the
  // first other provider name, so Arbitrum/Arbitrum One never become two rows.
  const chainNames = new Map<number, string>();
  for (const market of markets)
    if (!chainNames.has(market.chainId)) chainNames.set(market.chainId, market.chain);
  for (const market of markets) market.chain = chainNames.get(market.chainId)!;
  await enrichAaveNativeYield(markets);
  return {
    markets: markets.sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd),
    providers,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchHistory(market: Market, days: number): Promise<MarketHistory> {
  const boundedDays = Math.min(365, Math.max(1, Math.floor(days)));
  const end = Math.floor(Date.now() / 1000);
  const start = end - boundedDays * DAY;
  const points = new Map<number, HistoryPoint>();
  const get = (timestamp: number) => {
    if (!points.has(timestamp)) points.set(timestamp, { timestamp, supplyApy: null, borrowApy: null });
    return points.get(timestamp)!;
  };
  if (market.protocol === 'Morpho') {
    const data = await graphql(
      MORPHO_API,
      `
        query MarketHistory($marketId: String!, $chainId: Int!, $options: TimeseriesOptions) {
          marketById(marketId: $marketId, chainId: $chainId) {
            historicalState {
              supplyApy(options: $options) {
                x
                y
              }
              borrowApy(options: $options) {
                x
                y
              }
              supplyAssetsUsd(options: $options) {
                x
                y
              }
              borrowAssetsUsd(options: $options) {
                x
                y
              }
              utilization(options: $options) {
                x
                y
              }
            }
          }
        }
      `,
      {
        marketId: market.historyRef.marketId,
        chainId: market.chainId,
        options: { startTimestamp: start, endTimestamp: end, interval: boundedDays <= 7 ? 'HOUR' : 'DAY' },
      },
    );
    const history = data.marketById.historicalState;
    if (history)
      for (const [source, destination] of Object.entries({
        supplyApy: 'supplyApy',
        borrowApy: 'borrowApy',
        supplyAssetsUsd: 'totalSupplyUsd',
        borrowAssetsUsd: 'totalBorrowUsd',
        utilization: 'utilization',
      })) {
        for (const sample of history[source] ?? []) {
          const timestamp = numeric(sample.x);
          if (timestamp !== null && timestamp >= start && timestamp <= end)
            (get(timestamp) as unknown as Raw)[destination] = numeric(sample.y);
        }
      }
  } else if (market.version === 'V4') {
    const window =
      boundedDays <= 1
        ? 'LAST_DAY'
        : boundedDays <= 7
          ? 'LAST_WEEK'
          : boundedDays <= 30
            ? 'LAST_MONTH'
            : boundedDays <= 180
              ? 'LAST_SIX_MONTHS'
              : 'LAST_YEAR';
    const request = { reserve: market.historyRef.reserveId, window, includeRewards: false };
    const query = `query RateHistory($supply: SupplyApyHistoryRequest!${market.borrowApy === null ? '' : ', $borrow: BorrowApyHistoryRequest!'}) {
      supplyApyHistory(request: $supply) { date avgRate { value } }
      ${market.borrowApy === null ? '' : 'borrowApyHistory(request: $borrow) { date avgRate { value } }'}
    }`;
    const data = await graphql(AAVE_V4_API, query, {
      supply: request,
      ...(market.borrowApy === null ? {} : { borrow: request }),
    });
    for (const [source, destination] of [
      ['supplyApyHistory', 'supplyApy'],
      ['borrowApyHistory', 'borrowApy'],
    ]) {
      for (const sample of data[source] ?? []) {
        const timestamp = Date.parse(sample.date) / 1000;
        if (Number.isFinite(timestamp) && timestamp >= start && timestamp <= end)
          (get(timestamp) as unknown as Raw)[destination] = percent(sample.avgRate);
      }
    }
  } else {
    const window =
      boundedDays <= 1
        ? 'LAST_DAY'
        : boundedDays <= 7
          ? 'LAST_WEEK'
          : boundedDays <= 30
            ? 'LAST_MONTH'
            : boundedDays <= 180
              ? 'LAST_SIX_MONTHS'
              : 'LAST_YEAR';
    const request = {
      market: market.historyRef.pool,
      underlyingToken: market.historyRef.underlyingToken,
      chainId: market.chainId,
      window,
    };
    // Supply-only reserves have no borrow series, so avoid requesting one.
    const query = `query RateHistory($supply: SupplyAPYHistoryRequest!${market.borrowApy === null ? '' : ', $borrow: BorrowAPYHistoryRequest!'}) {
      supplyAPYHistory(request: $supply) { date avgRate { value } }
      ${market.borrowApy === null ? '' : 'borrowAPYHistory(request: $borrow) { date avgRate { value } }'}
    }`;
    const data = await graphql(AAVE_API, query, {
      supply: request,
      ...(market.borrowApy === null ? {} : { borrow: request }),
    });
    for (const [source, destination] of [
      ['supplyAPYHistory', 'supplyApy'],
      ['borrowAPYHistory', 'borrowApy'],
    ]) {
      for (const sample of data[source] ?? []) {
        const timestamp = Date.parse(sample.date) / 1000;
        if (Number.isFinite(timestamp) && timestamp >= start && timestamp <= end)
          (get(timestamp) as unknown as Raw)[destination] = percent(sample.avgRate);
      }
    }
  }
  const sorted = [...points.values()].sort((a, b) => a.timestamp - b.timestamp);
  return {
    marketId: market.id,
    points: sorted,
    source: market.protocol === 'Morpho' ? MORPHO_API : market.version === 'V4' ? AAVE_V4_API : AAVE_API,
    fetchedAt: new Date().toISOString(),
    ...(sorted.length
      ? {}
      : { warning: 'The protocol API returned no historical samples for this market and window.' }),
  };
}
