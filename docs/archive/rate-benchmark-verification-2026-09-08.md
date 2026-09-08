# Rate benchmark verification — 2026-09-08

Historical verification record. For the current implementation and hosting behavior, see [methodology](../methodology.md) and [architecture](../architecture.md).

## Running local version

Verified at `http://localhost:3101/#overview`. The older process on port 3100 was left untouched. The corrected process uses its own `money-markets-3101.sqlite` cache and the versioned `snapshot:source-observations-v2` key. Its health response includes `sourceObservationsVersion: 2`.

At the final check, both providers were live: 391 Aave reserves/spokes and 613 Morpho markets. All 613 Morpho rows carried original `rateObservedAt` values. The old process on 3100 omitted this field, making the previous frontend reject every Morpho quote.

## Calculation contract

- Compare exact loan-token address on one network. Use Aave V3 and Morpho Blue consistently for both borrowing and supplying; V4 stays in capital comparisons and Explore.
- Rank up to six shared assets by actual debt. Each protocol needs $5M in size-qualified loans. Each market needs $5M supplied and $1M borrowed, excluding near-idle collateral inventories and dust.
- The default $5M cash filter is applied per market, before grouping and before BOTH averages and extremes. It can be disabled for the broader active book. It does not imply $5M executable capacity or unrestricted access.
- Borrow average = sum(APY × debt) / sum(debt). Supply average = sum(APY × supply) / sum(supply). Lowest/Highest are the min/max of the identical contributing population.
- Original observations up to one hour old may enter this explicitly latest-reported benchmark. Retrieval must be within 15 minutes. Source age is never replaced with retrieval time. Unknown/older observations are excluded. Source coverage is balance-weighted; below 80% on either protocol, the advantage is withheld.
- The API updates different markets at different times. A brief partial-coverage state was correctly displayed around the hourly observation rollover, then cleared after the next source refresh. These are not block-synchronized rates or execution promises.
- Permissioned/closed books may describe existing balances; their restrictions remain visible. Opportunity screening retains all existing freshness, valuation, collateral, capacity and sizing gates.

## Verification performed

- 107 automated tests passed; production build and TypeScript check passed. The existing large-bundle warning remains non-blocking.
- 56 live arithmetic comparisons across Ethereum, Base and Monad, with the cash filter on/off and both rate sides: independently recomputed weighted sums and extrema; verified min ≤ average ≤ max and per-market cash thresholds.
- Real browser: Borrow/Supply switch, cash filter, Ethereum/Base network changes, USDC expansion, hover/click methodology, Escape dismissal, and rate-history navigation.
- Default Ethereum showed WETH, USDT, USDC and RLUSD, all with Aave and Morpho rates and complete qualifying-book coverage at the final check. Broader-book mode also showed PYUSD. No fabricated zero or dash rates appeared in this populated view.
- Followed the Aave USDC link: Ethereum Core V3, USDC, 4.39% borrow / 3.70% supply at inspection; correct underlying address and reserve URL.
- Followed the Morpho liquid supply extreme: USDC against PT-reUSD-10DEC2026, 91.5% LLTV, market `0x1e9d614631a7df0ec07fb05b2c8cb2491575fd1a63a33bf187a6afb295a4fc64`. Official page distinguishes its 6h headline from the instantaneous quote used here. Values change between requests.
- Inspected screenshots at desktop and small widths. The table intentionally scrolls horizontally on phones, with a visible hint. Methodology popovers stay in the viewport. No app browser-console errors were observed.

Primary methodology references are linked inside the asset breakdown: [Aave rate strategy](https://aave.com/docs/aave-v3/smart-contracts/interest-rate-strategy), [Morpho adaptive IRM](https://docs.morpho.org/developers/contracts/irm/), and [Morpho data/API semantics](https://docs.morpho.org/developers/borrow/tutorials/get-data/). Rates reflect utilization, collateral mix and fees as well as protocol parameters; the comparison does not establish policy causality or equal risk.
