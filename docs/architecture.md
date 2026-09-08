# Architecture

Money Markets is a read-only React dashboard with an Express data API. There are no wallets, accounts, signing keys, transaction routes, or user portfolios.

## Layout

```text
api/index.ts          Vercel function entrypoint
server/
  app.ts              HTTP routes and response handling
  security.ts         Local/public access rules and query validation
  service.ts          Refresh, request coalescing, caches and fallback
  providers.ts        Official Aave/Morpho reads and normalization
  opportunities.ts    Loop/carry screening and size-impact calculations
  competition.ts      DefiLlama accounting and historical series
  news.ts             Official governance feeds
  store.ts            Cache contract and bounded in-memory implementation
  cache.ts            Local SQLite implementation
  index.ts            Local-only listener, Vite and refresh lifecycle
shared/               Transport types and pure calculation/filtering logic
src/
  App.tsx             App shell, navigation and snapshot lifecycle
  pages/              Overview, Rate explorer, Looping and Intelligence
  components/         Tables, charts, controls and methodology popovers
  lib/                API client, formatting and navigation definitions
tests/                Offline economic, UI-rendering and hosting regressions
scripts/              Explicit live-data smoke and reconciliation checks
docs/                 Current methodology and deployment documentation
docs/archive/         Dated evidence, not current market data or requirements
```

The browser imports shared types/calculations, never server implementation. The hosted handler imports neither the SQLite store nor the local listener. Tests do not fetch live upstream data; live-source checks are separate opt-in scripts.

## Request flow

1. The UI calls a same-origin `/api/*` endpoint.
2. Routes validate inputs and call the data service.
3. The service reuses a fresh cache or awaits a coalesced upstream request.
4. Providers normalize observations while retaining source timestamps.
5. Pure shared functions calculate comparisons; the opportunity engine applies separate, stricter risk and sizing gates.

The same HTTP app and economic implementation run locally and on Vercel. There is no second hosted calculation engine.

## Cache behavior

| Data                      | Normal reuse                        | Manual refresh                       |
| ------------------------- | ----------------------------------- | ------------------------------------ |
| Market snapshot           | 5 minutes                           | At most once per minute per instance |
| Market rate history       | 1 hour; empty results 1 minute      | No forced public bypass              |
| Governance feeds          | 15 minutes                          | At most once per minute per instance |
| DefiLlama capital/history | One shared raw-source cache, 1 hour | No forced public bypass              |

Concurrent snapshot/news requests share work. At most eight different market histories may be loading in one instance. Failure cooldowns prevent immediate cold-start retry storms. These are instance-local protections, **not a distributed rate limiter**; Vercel's firewall and usage controls remain the deployment-level boundary.

**Local:** SQLite under `.data/` caches source responses and records hourly lending-book observations while the server is running. Separate ports use separate databases. The server only listens on `127.0.0.1`.

**Vercel:** a bounded, 128-entry / 64 MiB memory cache is reused while an instance stays warm. No background polling, filesystem persistence, or paid database is required. Cold starts refetch public sources. Local hourly observations are explicitly unavailable; the dashboard's historical charts continue using actual provider and DefiLlama history. No private local database is uploaded.

Cached source data is labeled stale after a failed refresh and cannot silently re-enter fresh opportunity rankings. Unknown inputs are not fabricated into markets or returns. Provider response schemas and timestamps remain external dependencies.
