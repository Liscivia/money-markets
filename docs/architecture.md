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
  collector-main.ts   Hostinger listener and scheduled collection/backup lifecycle
  collector.ts        Persistent job cadence, read-only views, auth and freshness
  proxy.ts            Fixed-origin authenticated Vercel-to-collector transport
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

In the production deployment, Vercel forwards these validated reads over HTTPS to the Hostinger collector, which runs the same HTTP app and economic implementation. There is no second calculation engine. A deployment without collector settings retains direct upstream reads.

## Cache behavior

| Data                      | Normal reuse                        | Manual refresh                       |
| ------------------------- | ----------------------------------- | ------------------------------------ |
| Market snapshot           | 5 minutes                           | At most once per minute per instance |
| Market rate history       | 1 hour; empty results 1 minute      | No forced public bypass              |
| Governance feeds          | 15 minutes                          | At most once per minute per instance |
| DefiLlama capital/history | One shared raw-source cache, 1 hour | No forced public bypass              |

Concurrent snapshot/news requests share work. At most eight different market histories may be loading in one instance. Failure cooldowns prevent immediate cold-start retry storms. These are instance-local protections, **not a distributed rate limiter**; Vercel's firewall and usage controls remain the deployment-level boundary.

**Local:** SQLite under `.data/` caches source responses and records hourly lending-book observations while the server is running. Separate ports use separate databases. The server only listens on `127.0.0.1`.

**Production collector:** one isolated Node service, loopback listener, dedicated unprivileged user, SQLite WAL outside immutable release directories. Markets run every 10 minutes, news hourly, and DefiLlama capital plus history backfills daily. Jobs have independent single-flight guards and persisted attempt/success times: a slow backfill cannot delay market collection. Failed markets retry after a minute; failed daily source jobs retry after an hour. Public refresh buttons read the saved snapshot and cannot force collection.

The daily archive keeps the last actual rate observation per market/UTC day, not a daily average or invented intraday history. Live-provider observations require a known rate-state timestamp within one hour of fetch time. Daily backfills prioritize the 20 largest debt markets per protocol with at least $5M supplied: one year initially, then a seven-day overlap. Other market histories are fetched on demand, coalesced with at most eight in-flight requests, and also archived. Normal history responses retain source resolution; archived daily observations provide an explicitly labeled outage fallback.

Capital cards and all network histories derive from one durable DefiLlama raw generation. An incomplete refresh retains the previous complete generation and discloses the failure. Market provider fetches older than 15 minutes become stale and cannot enter looping rankings. Source rate timestamps have their own existing stricter opportunity checks; collecting does not re-date them.

Daily SQLite online backups include committed WAL data and atomically replace the day's backup. Retention is 14 dated files on the same VPS; this is **not off-host disaster recovery**. Source observations are not pruned; reproducible history response caches older than seven days are cleaned up. The database never enters Git or Vercel uploads.

**Vercel production:** static UI plus a fixed-origin authenticated HTTPS proxy. It forwards neither browser credentials nor arbitrary headers/URLs, refuses upstream redirects, bounds decoded responses to 4 MB, and reports collector outages as 503. Hostinger accepts only authenticated GET/HEAD, with a global 300 requests/minute ceiling. Tokens are server-side only. Health reports real collector storage, source freshness, job states, release identity and archive coverage.

**Vercel without collector settings:** a bounded 128-entry / 64 MiB warm-instance cache; no background polling or filesystem persistence. Cold starts refetch public sources, and local hourly observations are explicitly unavailable.

Cached source data is labeled stale after a failed refresh and cannot silently re-enter fresh opportunity rankings. Unknown inputs are not fabricated into markets or returns. Provider response schemas and timestamps remain external dependencies.
