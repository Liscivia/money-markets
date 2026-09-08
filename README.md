# Money Markets

### Aave vs. Morpho. One research desk.

Compare lending markets, follow the rate spread, and understand the economics behind loops and carry—using public source data, with the methodology beside the numbers.

[![CI](https://github.com/Liscivia/money-markets/actions/workflows/ci.yml/badge.svg)](https://github.com/Liscivia/money-markets/actions/workflows/ci.yml)
![Node.js 22](https://img.shields.io/badge/Node.js-22-43853d)
![React + TypeScript](https://img.shields.io/badge/React-TypeScript-69e4d3)

### [Open the live dashboard →](https://money-markets.vercel.app)

[Methodology](docs/methodology.md) · [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Contributing](CONTRIBUTING.md)

## The dashboard

| View              | What you can learn                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**      | Compare Aave and Morpho gross deposits, debt and TVL; follow historical capital share; inspect the most meaningful shared lending assets.                                           |
| **Rate explorer** | Put two markets side by side, compare supply/borrow histories, and inspect debt assets, collateral rules, caps, utilization and official market links.                              |
| **Looping**       | Screen native-yield loops and cross-protocol carry with configurable debt, liquidity and leverage. See equity, collateral, size-adjusted returns and the reason leverage is capped. |
| **Intelligence**  | Follow both protocols' public governance discussions, with filters, dates, excerpts and original source links.                                                                      |

Borrow averages are **debt-weighted**; supply averages are **deposit-weighted**. Lowest/highest quotes use the same eligible markets as their corresponding average. Exact asset and network identity, liquidity filters, source timestamps and coverage checks keep thin or mismatched markets from silently dominating a comparison.

No wallet connection. No API keys. No transaction execution.

## Quick start

Use **Node.js 22.17+ on the 22.x line** and npm.

```sh
git clone https://github.com/Liscivia/money-markets.git
cd money-markets
npm ci
npm run dev
```

Open [localhost:3100](http://localhost:3100). On Windows, `start-local.cmd` is also available. Set `PORT` for a different local port.

For a compiled frontend:

```sh
npm run build
npm start
```

An internet connection is required for live sources. Source failures appear as missing/stale data, not demo markets.

## Reading the numbers

- **Gross deposits ≠ TVL ≠ available liquidity.** Protocol capital uses DefiLlama's Aave V3 + V4 and Morpho Blue components. Gross deposits is the standardized proxy `TVL + debt`, not unique investor money.
- **Rate benchmarks and opportunity screens have different jobs.** Benchmarks describe the meaningful lending book. Looping adds stricter collateral, freshness, cash, cap and sizing checks.
- **Loop returns are annualized ROE, not compounded APY.** The model combines native yield, eligible lending interest and borrowing cost. Incentives, fees, gas, slippage and liquidation losses are excluded.
- **Requested leverage is a ceiling, not a promise.** Applied leverage respects protocol LTV and a health-factor buffer. Cross-protocol carry has separately funded collateral and is not assumed to be recursively loopable.
- **Liquidity is not execution proof.** A market's debt capacity does not establish conversion depth, profitable capacity or a reliable exit.

The default looping scenario uses **$5M debt and $5M minimum liquidity**. Both amounts can be lowered manually. Hover, focus or tap the question-mark tiles for the calculation behind each figure.

Read the [full methodology](docs/methodology.md) before interpreting an opportunity as actionable.

## Public data sources

| Source                                                                                          | Used for                                                        |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Aave V3 API](https://api.v3.aave.com/graphql) · [Aave V4 API](https://api.v4.aave.com/graphql) | Reserves, rates, balances, collateral configuration and history |
| [Morpho API](https://api.morpho.org/graphql)                                                    | Listed Blue markets, historical rates and native-yield metadata |
| [DefiLlama](https://defillama.com/protocols/Lending)                                            | Comparable protocol capital and historical series               |
| [Aave governance](https://governance.aave.com) · [Morpho governance](https://forum.morpho.org)  | Public discussion feeds                                         |

The market universe is discovered on refresh. Coverage is not every product ever deployed by either protocol: legacy products, unlisted markets and some networks are excluded. Aave V4 is included in capital and Explore, but not the direct rate benchmark or borrowing-opportunity screen. Source timestamps and scope are shown in the app.

## Project structure

```text
src/pages/       The four dashboard views
src/components/  Charts, tables, controls and explainers
src/lib/         API client, formatting and navigation
shared/          Types and pure comparison/accounting logic
server/          Source adapters, API service and opportunity engine
api/             Vercel entrypoint
tests/           Economic, UI and hosting regressions
scripts/         Live-data checks
docs/            Methodology, architecture and deployment
```

The same Express API runs locally and on Vercel. Locally, SQLite preserves caches and hourly observations under `.data/`. Vercel uses a bounded temporary cache; it does not upload or persist your local database. Historical charts still read actual upstream history. See [hosting details](docs/deployment.md).

## Development

```sh
npm test
npm run build
npm run format:check
```

`npm run format` applies the shared formatting rules. GitHub Actions checks formatting, offline tests, the production build and dependency advisories.

For a running app, `npm run test:smoke` checks real market data, histories, looping parameters and governance feeds. Set `MONEY_MARKETS_URL` to test a deployment instead of localhost. `npm run check:overview` performs the more detailed live liquidity cross-check.

## Scope and safety

This is an independent research tool, not an official Aave or Morpho product, investment advice, an audited execution engine or a guarantee of returns. Live rates, oracle behavior, liquidity and protocol rules can change. A positive spread is a lead to investigate, not proof that a trade can be executed or exited profitably.

[Security policy](SECURITY.md) · [Dated verification records](docs/archive/)
