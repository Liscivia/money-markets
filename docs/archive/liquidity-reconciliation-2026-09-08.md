# Overview liquidity reconciliation — 2026-09-08

Historical audit trail, including superseded display definitions below. Amounts are dated observations, not current figures. See [methodology](../methodology.md) for the current calculation contract.

## Follow-up correction: comparable protocol capital (07:45–08:03 UTC)

The original definition note was not sufficient: the headline "lending deposits", supplied-capital donut, network supply chart, and protocol debt/deposits ratio compared different economic objects. Aave reserve deposits already contain collateral deposits; Morpho `supplyAssetsUsd` contains only the loan side. That biased the apparent capital share toward Aave. Those aggregate displays have been replaced, not merely renamed.

### New accounting contract

- Gross deposits is a standardized **proxy**, computed as DefiLlama TVL plus DefiLlama outstanding debt, per deployment at matching TVL/debt timestamps, then summed. It includes held collateral on both sides and inherits all adapter exclusions. It is not unique investor capital, executable cash, or a precise ledger of supplier claims. Receipt-token/recursive positions can remain in gross accounting.
- Debt and TVL come from the same `aave-v3`, `aave-v4`, and `morpho-blue` source responses. Aave V2 and other legacy products are not included; the parent `morpho` page is not the Blue component page.
- The cards, donut, network bars and historical chart share this accounting contract. A common Deposits / Debt / TVL toggle controls all three charts. Global cards and daily-history endpoints were checked to match exactly at their latest observation.
- Restart verification caught an independent history-cache TTL serving a different Aave V4 observation than the cards. Protocol history now reuses the same cached raw source as the cards; its SQLite copy is fallback-only. The frontend history refreshes when that shared source changes. Market-specific rate-history caching is unchanged.
- Global and network source totals are not assumed equal. Per-chain bars retain each reported chain value; cards/history retain the source's aggregate series. At this check Morpho's reported network TVLs summed to **$9,662,397,740**, while its global TVL was **$9,629,985,120**, a **$32,412,620 (0.337%) source residual**. This is present inside one DefiLlama response at matching observation timestamps, not caused by the app adding the borrowed bucket or using another refresh. The adapter/API residual was not fully attributed. A dynamic warning exposes it; no chain is reweighted to force equality. Aave's analogous difference was only $11 of per-chain integer rounding in the 08:00 retrieval.
- Only the network filter applies to protocol-wide comparisons. Protocol/asset/search filters still apply to the separate live lending book below. Unreported networks are unknown, not proof of no deployment; a failed component makes its combined protocol total unknown. Individual source times appear in every card's info tile. Historical growth labels use actual first/last observed dates and describe USD value changes, not flows or returns.
- API cash remains independent: Aave V3 actual available liquidity (supply-only fallback as documented), unique V4 hub cash, and Morpho immediate loan cash. No segregated collateral is added to cash, rate weights, market supply, curve sizing or opportunity capacity.

At the 08:00 source retrieval (Aave V3 06:34:59, V4 06:33:47, Morpho 06:35:59 UTC observations):

| Standardized measure | Aave V3 + V4 | Morpho Blue |
|---|---:|---:|
| Gross deposits proxy | $30,407,246,976 | $14,502,858,335 |
| Outstanding debt | $12,599,286,632 | $4,872,873,215 |
| TVL | $17,807,960,344 | $9,629,985,120 |

The new gross-capital share is about 67.7% Aave / 32.3% Morpho for this defined pair, not the roughly 85.4% / 14.6% produced by the former mixed API-supply comparison. These percentages describe different accounting; they are not a historical jump in market share.

### Direct Morpho accounting bridge

GraphQL introspection confirmed `MarketState.collateralAssets` and `collateralAssetsUsd`. The snapshot now stores `segregatedCollateralUsd` separately. A missing valuation remains null unless the asset is absent (idle market) or the underlying collateral amount is explicitly zero.

At the 07:57:44 UTC official Morpho API snapshot, 613 listed markets reported:

- Loan supply: **$5,388,216,248.24**.
- Outstanding debt: **$4,780,115,357.77**.
- Immediate loan cash: **$608,100,890.47**; supply minus debt reconciles to cash within $0.01.
- Valued segregated collateral: **$8,516,863,936.01**.
- Indexed held-assets subtotal (cash + reported collateral): **$9,124,964,826.48**.
- **34 markets** had collateral with unknown USD valuation. Another 35 null collateral-USD responses were idle/no-collateral markets, correctly represented as zero, not unpriced collateral.

The ~$9.125B subtotal is deliberately **not called reconstructed TVL**. The residual to DefiLlama also involves coverage, idle vault cash, de-duplication of receipt tokens, exclusions and asynchronous valuation. No unexplained residual is labeled additional lendable liquidity.

A subsequent 08:06:01 API snapshot had a **$27,878.86** supply-minus-debt-minus-cash USD residual across its reported fields (the earlier snapshot reconciled). This is another reason not to assume the USD fields always satisfy the token accounting identity. The bridge now exposes this residual dynamically and continues to use the API's reported cash; it does not force an identity by changing liquidity. The exact upstream valuation discrepancy was not attributed.

### Other figures checked

The renewed Aave reserve-level match found 174 unique reserve matches: API cash **$16.6870B**, DefiLlama yield-pool cash **$16.6415B** (~0.27% difference at different observation times). Largest ten reserves differed by less than 1%. Three >5% individual differences were independently checked through pinned underlying `balanceOf(aToken)` calls:

| Reserve | Block | On-chain cash at API USD price | Fresh API cash | Difference |
|---|---:|---:|---:|---:|
| Base WETH | 51,032,555 | $30,369,132.07 | $30,369,132.03 | ~$0.04 |
| Monad USDC | 102,986,324 | $12,123,467.45 | $12,123,467.45 | Zero |
| Mantle FBTC | 100,362,070 | $8,561,006.44 | $8,561,006.44 | Zero |

These checks support retaining the actual API reserve cash instead of substituting older yield-pool snapshots. Prices in this test came from the Aave API; it is not an independent oracle audit. Underlying balances were 12,251.227496031255 WETH, 12,124,993.746247 USDC, and 109.39435234 FBTC respectively. No transactions were sent.

Rate-history normalization was reviewed (fractional APYs, UTC alignment, no filling across missing observations); live Aave and Morpho 30-day histories, native loops/carry, small manual opportunity sizes and public news endpoints passed smoke checks. The capital correction does not alter rate or opportunity arithmetic. All rendered-control/accounting regression tests and the build are run separately. This remains a research dashboard, not a claim that every price or executable route has been audited.

Implementation: `shared/protocol-capital.ts`, `server/competition.ts`, `src/ProtocolOverview.tsx`, `src/InfoTile.tsx`, and the protocol-capital regression tests. Re-run `npm run check:overview` for current sources. The historical initial pass follows below for provenance.

Read-only checks conducted around 07:00–07:20 UTC. These are observations, not a permanent equality assertion; run `npm run check:overview` for a new comparison. No wallet or transaction was used.

## Definitions and coverage

- API lending deposits include outstanding loans. Aave deposits also include reserves used only as collateral. Morpho loan deposits do not include segregated collateral.
- API unborrowed liquidity uses Aave V3 `borrowInfo.availableLiquidity.usd` (deposit balance for reserves with no borrow leg), Aave V4 hub-asset `availableLiquidity`, and Morpho `state.liquidityAssetsUsd`.
- Shared V4 cash is deduplicated by hub-asset ID. A spoke does not own the hub's entire balance. Borrow capacity separately applies caps, credit lines and status.
- Do not replace actual reserve cash with deposits minus debt: deficits and other accounting items can make them differ. In the checked snapshot all 613 Morpho rows reconciled to supply minus borrow (aggregate residual below $0.01).
- DefiLlama Aave V3 reads aToken underlying balances with token/lender exclusions; its pool set differs (for example, Horizon is not part of the same V3 adapter configuration). V4 reads underlying hub balances. Morpho TVL includes collateral and idle vault balances as well as additional deployments/exclusions. TVL is not the app's borrowing-liquidity gate.

Sources: [Aave V3 coverage](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/aave-v3/index.js), [Aave balance methodology](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/helper/aave.js), [Morpho methodology](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/morpho-blue/index.js).

## Protocol-scale comparison

Approximate observations from the first live pass; sources were not block-synchronous.

| Coverage | API deposits | API debt | API unborrowed cash | DefiLlama TVL | DefiLlama debt |
|---|---:|---:|---:|---:|---:|
| Aave V3, 309 reserves | $30.918B | $12.536B | $18.175B | $17.476B | $12.388B |
| Aave V4, 82 spoke reserves | $626.570M | $234.795M | $387.655M | $389.541M | $235.478M |
| Morpho Blue, 613 listed markets | $5.385B | $4.778B | $607.324M | $9.663B | $4.877B |

The Morpho TVL-versus-cash gap is not missing loan liquidity: the definitions and deployment coverage differ. Other residuals were not all decomposed into individual exclusions; the source check explicitly does not label these totals as exact matches. The app now exposes current figures and source observation timestamps together.

Live source endpoints: [Aave V3](https://api.llama.fi/protocol/aave-v3), [Aave V4](https://api.llama.fi/protocol/aave-v4), [Morpho Blue](https://api.llama.fi/protocol/morpho-blue).

## Reserve-level and on-chain checks

174 Aave V3 rows matched uniquely against [DefiLlama yields](https://yields.llama.fi/pools) using protocol, chain, underlying token address and instance metadata. At 07:16 UTC, matched API cash was $16.642479B versus $16.691796B on DefiLlama, a roughly -0.30% difference. The largest ten reserves had differences below 0.55%. Ambiguous/unmatched rows were not represented as verified matches.

Two liquid-reserve outliers were investigated against current underlying `balanceOf(aToken)` on public RPCs:

| Reserve | Pin | On-chain token cash | API token cash | Result |
|---|---:|---:|---:|---|
| Ethereum USDG | block 25,931,107 | 5,509,191.150702 | 5,509,191.150702 | Exact token balance match |
| Arbitrum USDC (native) | block 502,947,552 | 32,441,587.980227 | 32,441,547.033972 | $40.95 difference, about 0.00013% |

USDG aToken: `0x7c0477d085ECb607CF8429f3eC91Ae5E1e460F4F`. USDC aToken: `0x724dc807b04555b71ed48a6896b6F41593b8C637`.

The larger DefiLlama differences used older 06:01:10 UTC yield observations ($2.801033M USDG; $29.603459M USDC), versus the API's 07:17:33 UTC snapshot. Current balance reads support retaining the API values. USD values in these RPC comparisons use the API's oracle price; USD pricing was not independently audited for every asset.

## Display corrections

- Historical chain aliases now resolve BSC → Binance, Gnosis → xDai, zkSync → zkSync Era, HyperEVM → Hyperliquid L1, and Tempo Mainnet → Tempo. Unmapped history is unknown, not zero. Old incorrectly keyed cached histories are bypassed.
- The single aggregate borrow-rate KPI was removed. Top asset banners rank unique reserve liquidity, not outstanding debt. Average and best-rate modes share the same asset list and liquidity/cap eligibility rules.
- The $5M screen can show fewer than six matched assets; it never fills remaining slots with illiquid markets. Four pairs qualified during verification: Ethereum WETH, Ethereum USDT, Base USDC, Ethereum USDC.
