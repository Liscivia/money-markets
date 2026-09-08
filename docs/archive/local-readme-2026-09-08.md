# Archived local README — 2026-09-08

Preserved for provenance before the public-hosting refactor. Hosting details and file paths below may be superseded; use the current root README and docs instead.

# Money Markets

A local research desk for Aave and Morpho: lending-market competition, historical rate comparisons, native-yield loops, cross-platform carry, and public governance intelligence.

## Run locally

Requires Node.js 22.17 or newer and npm. From this folder:

```powershell
npm install
npm run dev
```

Open **http://localhost:3100**. On Windows, `start-local.cmd` installs missing dependencies and starts the app. The server binds to `127.0.0.1` only. Set `PORT` to choose a different local port. Public-data queries require internet access; no API keys or wallet connection are required.

For a compiled frontend:

```powershell
npm run build
npm start
```

## What the app provides

- **Overview:** three Aave-versus-Morpho cards: gross deposits, outstanding debt, and TVL. Each retains its hover/focus/tap methodology tile with formula, scope, caveats and observation timestamps. Gross deposits is a **standardized proxy: DefiLlama TVL + debt**, not an exact supplier-claims ledger or unique investor capital. All three cards and current/historical capital charts cover all networks using DefiLlama's Aave V3 + V4 versus Morpho Blue; one metric toggle drives all charts. Unknown source values stay unknown, and gross deposits is withheld when a component's TVL/debt timestamps differ. Source diagnostics remain in the API; the overview omits the cash card, reconciliation panel/warnings, global search/filter bar and hover badge. Actual source failures still show an error.
- **Lending benchmark:** one compact Aave V3 / Morpho Blue table, with Borrow costs / Supply yields and a network selector. Up to six shared assets ranked by combined outstanding debt, with at least $5M meaningful debt on each protocol. Each contributing market needs $5M supplied and $1M borrowed. The default cash filter requires $5M cash in each market and applies before grouping to BOTH average and extreme; switch it off for the broader active book. Borrow averages are debt-weighted, supply averages are deposit-weighted. Lowest/Highest uses exactly the same population, so it cannot contradict the average because of different liquidity gates. One Aave reserve often legitimately makes these equal. Large collateral-only inventories do not displace meaningful lending assets. Exact token and network identities are preserved.
  Click an asset for the underlying pools / collateral-specific markets, APY range, loan balances, utilization, source timestamps, coverage, restrictions, official market links and rate-history navigation. V4 stays in Explore and capital comparisons; both benchmark rate sides exclude it until full borrower premiums can be compared. Question-mark hover/focus/tap tiles explain selection, weighting, cash filtering and scope.
  **Freshness:** this is a latest-reported research benchmark, not a synchronized or executable quote. Original source observations can be up to one hour old, with API retrieval within 15 minutes. Unknown/older observations and critical risks are excluded; source timestamps are preserved, never restamped. Stale collateral valuation does not invalidate a loan-asset APY/weight, but still blocks opportunity screening. Coverage is balance-weighted over size-qualified books; comparisons with under 80% coverage on either protocol do not name a winner. A source outage never silently swaps an important asset for a smaller one. Native yield, incentives and vault wrappers are excluded. Opportunity freshness, collateral and capacity checks are unchanged.
- **Rate explorer:** two independently selectable markets, each with strict protocol, network, debt-asset and collateral-asset filters plus text search. Token filters match exact chain/address identity. Only matching markets appear; an empty result does not retain a mismatched prior selection. Supply and borrow histories, selectable lookbacks, source metadata and statistics remain available. The official-market link appears once per selected market, above the chart.
  Each selector also shows the debt asset, available cash and screened borrow headroom, utilization out of 100% with the known rate-model target/kink, and a complete scrollable collateral configuration list. Aave V3 shows max LTV / liquidation threshold, matching eMode alternatives, supply-cap usage (used / limit and percentage), available new-supply room, and eligible isolation debt ceilings. Frozen/capped/permissioned configurations carry restrictions. Aave V4 shows its collateral factor and same-spoke supply caps/headroom; Morpho Blue shows its one collateral, LLTV and absence of a direct protocol collateral amount cap (not vault allocation caps). Missing cap data is explicitly unknown. This display and its collateral filter use a separate configuration list; they do not widen the conservative opportunity collateral allowlist.
- **Looping:** native-yield loop candidates and separately collateralized cross-protocol carry (explicitly not recursive loops). The existing `#opportunities` link remains compatible. Default scenario: $5m debt, $5m minimum liquidity, requested 3x gross exposure. Blank dollar inputs retain $5m placeholders; manual amounts from $1 to $1bn are accepted. Changing inputs marks results as pending until Scan is pressed. Cards lead with size-adjusted annual return on equity when modeled, with current-rate return and native holding yield alongside; incentives and execution costs are excluded. Applied leverage reports its binding limit: the requested target, 98% of protocol LTV, liquidation threshold / minimum health factor (1.20), or 95% screen LTV. This is not profit-maximizing leverage. A 10x request is capped at 4.29x for a 92% liquidation threshold or 4.80x for 95% at HF 1.20. Expanded positions separate equity, debt, posted collateral and external lending; carry gross assets must not be labeled collateral. Debt capacity is a mechanical ceiling, not profitable or executable capacity. Overview benchmarks remain separate from sizing checks.
- **Intelligence:** public Aave and Morpho governance topics, publication dates, source links, excerpts, and topic categories.

## Data and interpretation

The provider coverage and freshness are shown in the app. The market catalog comes from the official public APIs at `https://api.v3.aave.com/graphql`, `https://api.v4.aave.com/graphql`, and `https://api.morpho.org/graphql`. The initial verified universe includes 309 Aave V3 reserves, 82 Aave V4 spoke reserves, and 613 listed Morpho Blue markets; the catalog is rediscovered on refresh. Aave V2/non-EVM and Morpho unlisted/Midnight/optimizer markets are excluded. Aave V4 lending comparisons are included, while V4 opportunity borrowing is excluded until its borrower-specific collateral premium is modeled. Shared V4 hub liquidity is counted once in totals. The app does not manufacture history when an upstream service does not return it. Morpho's Blue lending-market supply is distinct from segregated borrower collateral; its supply should not be labeled total protocol TVL. Vault wrappers are not added to underlying markets because that would count the same deposits twice.

Market rates are annual percentage yields as returned by each provider. Native asset yield is kept separate from market supply interest and incentive rewards. Opportunity calculations convert market APY into an annualized rate with `log(1 + APY)` before combining cash flows. The resulting leveraged return is a **simple annualized return on equity**, not a demonstrated compound APY or historical performance.

For a native-yield loop, gross exposure `A = L × E`, debt `D = (L − 1) × E`, and current annualized return on equity is `L × asset yield − (L − 1) × borrow rate`. Collateral market supply interest is included only where it is actually earned. A target leverage is a scenario, not an optimization proof. Liquidity and caps are checked against the scenario debt and collateral amounts. The health factor floor defaults to 1.2.

Cross-platform lending carry uses separately posted collateral. Lending receipts are never assumed to be accepted as collateral by another protocol. Its equity and gross exposure therefore use different accounting from a recursive native-yield loop. Opportunities are grouped by chain and use actual token addresses; a shared ticker alone does not establish a usable route.

Size simulations use the current rate curve when available. Missing curve information is reported as unknown. Morpho's adaptive curve can subsequently change with time. Estimated market capacity excludes unverified public-allocator reallocations. No swap or redemption quote, transaction simulation, oracle stress test, or full exit liquidity proof is performed; the app is a screening tool and does not submit transactions. A $5m borrowing facility does not by itself establish $5m of conversion/exit depth. Rewards, gas, conversion costs, and future rate movements are not guaranteed return.

## Persistence and refresh

SQLite data is stored in `.data/money-markets.sqlite`, including snapshots, cached histories, cached news, and hourly aggregate observations collected while the server runs. Snapshot refreshes run every five minutes; the browser checks for updates every minute. History is cached for one hour and feeds for fifteen minutes; explicit feed refresh bypasses that TTL. Simultaneous identical requests share the same work. If a source fails, existing cached data remains visible with a stale indication. Partial fresh source data is replaced by the entire previous source snapshot without duplicating market totals. Stale providers, Morpho states older than fifteen minutes, missing/older-than-one-hour Morpho valuations, and critical market flags are excluded from opportunity rankings. Native-yield APIs do not expose an observation timestamp, so their independent freshness is not proven. Hourly aggregates begin when the app first runs; the competitive historical chart uses actual DefiLlama history.

## Checks

```powershell
npm test
npm run build
npm run check:overview
```

The economic tests cover liquidity and cap gates, collateral eligibility, leverage/equity arithmetic, APY conversion, rate-curve sizing, and route separation. Overview tests also cover filter composition, weighting, shared liquidity, best-rate selection, exact asset identity and rendered controls. API failures are represented as errors or stale data rather than synthetic fallback markets. `check:overview` requires the local server and internet; it reads current API/DefiLlama values without modifying the cache directly. See [the liquidity reconciliation](docs/liquidity-reconciliation-2026-09-08.md) for the initial cross-check and independent balance reads.

## Public sources

- [Morpho market API and rate history](https://docs.morpho.org/developers/api/morpho/)
- [Morpho interest rate model](https://docs.morpho.org/developers/contracts/irm/)
- [Aave V3 SDK](https://github.com/aave/aave-sdk)
- [Aave V4 SDK](https://github.com/aave/aave-v4-sdk)
- [Aave protocol subgraphs and rate conventions](https://github.com/aave/protocol-subgraphs)
- [Aave governance](https://governance.aave.com)
- [Morpho governance](https://forum.morpho.org)
