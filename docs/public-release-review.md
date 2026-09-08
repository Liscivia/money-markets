# Public release review — 2026-09-08

Scope: repository organization, public-hosting safety and regression checks for the existing dashboard. This is not an independent smart-contract, oracle, strategy-execution or economic audit.

## Changes made

- Split the large UI entrypoint into four pages, reusable components and shared client utilities. Move offline regressions into `tests/` and archive dated investigation records separately from current documentation.
- Extract HTTP routing and the data service from the local listener. Vercel imports no local SQLite dependency, starts no listener and relies on no background polling.
- Preserve local SQLite caches; use bounded, explicitly temporary memory storage on Vercel. Real provider/DefiLlama histories remain available; no synthetic or imported local observation series is presented as durable cloud history.
- Await hosted refreshes, coalesce concurrent work, bound history concurrency and throttle manual refresh attempts per instance. Preserve original source timestamps and stale-provider exclusion from opportunity rankings.
- Validate queries before source reads, preserve JSON API errors, hide unexpected internal error messages, reject cross-origin refreshes and retain the local host guard.
- Set production browser security headers. Exclude environment files, local credentials, logs, caches and databases from Git and deployment uploads. Pin CI actions to verified commits and use a read-only workflow token.
- Add formatting, architecture/methodology/deployment documentation and an explicit live-source smoke check, including a conservative response-size budget.

## Verification

The production URL is [money-markets.vercel.app](https://money-markets.vercel.app). A live HTTP smoke check confirmed 391 Aave reserves/spokes and 613 Morpho markets, both providers live; both Ethereum USDC historical series; four loop candidates and one carry route; and 60 governance items. These counts describe this check only, not permanent coverage or future profitable opportunities.

The first hosted check caught a named Vercel rewrite parameter being injected into API queries. The route was corrected and a configuration regression added; the subsequent public smoke check passed. Public API health, unknown-route JSON 404s, cross-origin rejection and manually reduced sizing were also checked. Dependency audit reported zero known advisories at review time.

## Remaining boundaries

- Hosted caching/cooldowns are instance-local, not durable storage or a distributed abuse limiter. Cold starts refetch sources and traffic is subject to Vercel account limits.
- Upstream APIs, governance availability and original observation quality remain external dependencies. A healthy HTTP endpoint is not proof that every source is live.
- The snapshot is below the hosted payload limit at release, but expanding coverage may require pagination or a deduplicated transport.
- This release did not independently re-audit every economic assumption or execute trades. Existing economic regressions remain in place; see [methodology](methodology.md) for excluded costs, incentives, liquidation and exit risks.
