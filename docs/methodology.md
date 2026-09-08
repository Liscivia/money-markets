# Methodology

This document describes the implemented screen, not a recommendation or an executable strategy. Question-mark tiles inside the app explain the same rules at the point of use.

## Protocol capital

The capital cards compare DefiLlama's **Aave V3 + V4** components with **Morpho Blue**, across reported networks. Parent-protocol pages may include other products and are not interchangeable with this scope.

| Metric                     | Calculation and interpretation                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gross deposits             | TVL + outstanding debt, per component at matching timestamps. A standardized gross-capital proxy, not unique investor money or an exact supplier ledger.       |
| Outstanding debt           | DefiLlama's borrowed series: capital currently owed by borrowers.                                                                                              |
| TVL                        | DefiLlama's held-asset measure, with outstanding loans excluded. It includes held collateral and inherits adapter exclusions.                                  |
| Available market liquidity | Official market API cash, separate from TVL. Caps, collateral rules and paused markets can reduce what is borrowable. Shared Aave V4 hub cash is counted once. |

The cards and historical capital chart share one accounting basis. Missing components remain unknown. Per-chain sums can differ from a source's global total; the app does not reweight chains to force agreement. USD-value changes are not deposit flows or investment returns.

Morpho's loan-side deposits contain outstanding loans but exclude segregated borrower collateral. Its TVL includes held collateral and excludes outstanding loans. This explains why the two quantities can differ substantially. Vault wrapper balances are not added on top of their underlying lending markets.

## Asset rate comparisons

Compare **Aave V3 and Morpho Blue** on the same network and exact loan-token contract. Aave V4 remains in Explore and protocol capital, but is excluded from this benchmark until its borrower-specific premiums are comparable.

- Rank up to six shared assets by combined outstanding debt, with at least $5M in size-qualified loans on each protocol.
- Each contributing market needs at least $5M supplied and $1M borrowed, so near-idle collateral inventories do not dominate the list.
- The default $5M available-cash filter applies before both the average and the extreme. Disable it to inspect the broader active book. Cash is not a guarantee of an executable $5M trade.
- Borrow average = `sum(borrow APY × debt) / sum(debt)`.
- Supply average = `sum(supply APY × deposits) / sum(deposits)`.
- Lowest/highest = the minimum/maximum in **exactly the same eligible population**. One eligible market legitimately makes the average and extreme equal.
- Sources must have been retrieved within 15 minutes and carry an original rate observation no older than one hour. The benchmark is latest-reported, not block-synchronized. Below 80% balance-weighted coverage on either protocol, no winner is named.

These are organic market APYs. Native staking/asset yield, incentives and vault-level yields are separate. Differences reflect utilization, collateral mix, risk, fees and market segmentation as well as rate policy; they do not isolate a causal policy effect or imply equal risk.

## Native-yield loops

A loop borrows against a yield-bearing asset, acquires more of it and posts that asset again. For equity `E`, debt `D`, collateral `C` and leverage `L`:

```text
C = L × E
D = (L − 1) × E
E = D / (L − 1)
ROE = L × (native APR + eligible collateral lending APR)
      − (L − 1) × borrow APR
```

Market APYs are converted with `log(1 + APY)` before combining annualized cash flows. The result is a **simple annualized return on equity**, not compounded APY or realized performance. Where available, a second estimate applies the requested debt size to the current rate curve. Unknown curve impact stays unknown.

Applied LTV is the lowest of:

```text
1 − 1 / requested leverage
98% × protocol maximum LTV
liquidation threshold / minimum health factor (default 1.20)
95% screen LTV ceiling
```

Applied leverage is `1 / (1 − applied LTV)`. This is a risk-buffer cap, not a profit-maximizing leverage choice. For example, a 95% liquidation threshold and HF 1.20 imply at most 4.80×, even if 10× was requested.

The default scenario is $5M debt and $5M minimum market liquidity. Both dollar inputs accept $1 to $1B; a blank retains the $5M default. Debt must fit borrow cash/caps, and posted collateral must fit eligible supply headroom. The screen excludes stale providers and uses stricter Morpho rate/valuation checks than the overview benchmark.

## Cross-protocol carry

Carry posts separately funded collateral, borrows an asset and supplies that exact asset to another protocol on the same chain. It is **not** a recursive loop: receipt tokens are not assumed to be re-pledgeable.

```text
Equity = posted collateral = debt / applied LTV
External lending = debt
Gross assets = posted collateral + external lending
Gross asset leverage = 1 + applied LTV
```

Collateral exposure means only the posted collateral, not the borrowed asset lent elsewhere. The UI now shows these balances separately. Each route is an independent scenario; capacities across routes sharing a reserve cannot be added together.

## Limits of the screen

No wallet, transaction simulation, collateral-swap quote, public-allocator reallocation, redemption stress test or full exit-liquidity proof is performed. Rate curves can change after the trade; an immediate size adjustment is not a forecast. Native-yield sources may not publish their own observation timestamp. Rewards, gas, slippage, fees, liquidation losses and future rate movements are excluded from the displayed return.

Positive modeled carry is a research lead, not proof that a route can be executed profitably at the indicated size. See the [dated verification records](archive/) for what was checked at earlier snapshots.

## Source references

- [Aave documentation](https://aave.com/docs) and [Aave SDK](https://github.com/aave/aave-sdk)
- [Morpho documentation](https://docs.morpho.org/) and [adaptive interest rate model](https://docs.morpho.org/developers/contracts/irm/)
- DefiLlama adapters: [Aave V3](https://github.com/DefiLlama/DefiLlama-Adapters/tree/main/projects/aave-v3), [Aave balance accounting](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/helper/aave.js), [Morpho Blue](https://github.com/DefiLlama/DefiLlama-Adapters/tree/main/projects/morpho-blue)
