# Deployment

## Vercel

Import `Liscivia/money-markets` into Vercel. The committed `vercel.json` supplies the Vite build, static output and single Express-backed API function. Node 22 is pinned in `package.json`. Public sources need no API keys. The production collector connection uses its own server-to-server token.

```sh
npm ci
npm test
npm run build
npx vercel link
npx vercel --prod
```

Connect the GitHub repository in the project's Git settings for automatic deployments from `main` and branch previews. Public production access and preview protection are separate Vercel settings. Do not make deployment logs or source files publicly readable just to publish the website.

The static UI is served from `dist/`. `/api/*` rewrites to `api/index.ts`, whose Express router retains the original API path. Hash-based navigation (`#overview`, `#rates`, `#opportunities`, `#news`) needs no SPA catch-all that could hide API errors.

Set `MONEY_MARKETS_COLLECTOR_URL` to the collector's HTTPS origin and `MONEY_MARKETS_COLLECTOR_TOKEN` as a **sensitive production environment variable**, then redeploy. Neither variable may have a `VITE_` prefix. The browser calls only Vercel; Vercel authenticates to Hostinger. Do not set these credentials on untrusted fork previews.

Without collector settings, the API uses temporary in-process caching and awaits public-source reads inside each request. Vercel itself runs no timers or SQLite. Functions allow 300 seconds; collector proxy requests time out at 90 seconds and never follow redirects. See [architecture](architecture.md) for cache and rate-limit boundaries.

Reference: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [function limits](https://vercel.com/docs/functions/limitations), [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite).

## Hostinger collector

Requires an x86-64 Linux VPS with systemd, OpenSSL, curl, tar, and Caddy. The installer pins a separate Node 22.23.0 distribution under this app's directory and verifies its SHA-256 against the official release checksum; it does not reuse or alter another service's runtime. No Docker, Cloudflare resource or paid database is required. The production setup uses the VPS's existing DNS hostname, which must resolve publicly to that server. Caddy obtains and renews HTTPS certificates; ports 80/443 must be available. Never proxy existing private trading or analytics endpoints.

The service is `money-markets-collector.service`, listening only on `127.0.0.1:3102`. Application releases live in `/opt/money-markets/releases/<commit>`, with a `current` symlink. State and backups live in `/var/lib/money-markets`; the dedicated token lives at `/etc/money-markets/token` (root-owned, readable only by the service group). The service cannot write application code or read the existing analytics/Hermes trees. It has an 896 MiB hard memory ceiling and a half-CPU quota. Large DefiLlama responses are parsed sequentially and compacted before caching; the ceiling allows transient parsing overhead, not a target memory allocation.

For each reviewed commit, create `git archive --format=tar.gz --output=<archive> <commit>`, copy the archive and `deploy/hostinger/install-release.sh` over SSH, then run the installer with the exact 40-character commit and archive path. It refuses to overwrite a release, runs offline tests/typechecking as the unprivileged user, switches only this app's symlink, and restarts only this app. It never uploads `.env*`, `.data/`, local caches or Vercel credentials.

For the first HTTPS setup, install Caddy and use `deploy/hostinger/Caddyfile`. Set `MONEY_MARKETS_HOST=<existing-vps-hostname>` in `/etc/money-markets/edge.env`; install `deploy/hostinger/caddy-collector.conf` as a Caddy systemd drop-in. Validate the Caddyfile before restarting Caddy. The configuration serves only this collector's `/api/*`; every API request requires the separate bearer token. Nothing else on the VPS is exposed by this proxy.

Collection cadence: markets every 10 minutes, governance hourly, protocol capital and history backfills every 24 hours from the last due run. The scheduler checks every 30 seconds; it is owned by the systemd-supervised process, not a Vercel request or separate cron tree. Job state survives restarts. History backfill and source timestamp semantics are documented in [architecture](architecture.md).

### Operations and recovery

- Check `systemctl status money-markets-collector` and `journalctl -u money-markets-collector --since '1 hour ago'`. Logs contain job outcomes, never tokens or raw source payloads.
- `/api/health` on Vercel reports `storage: sqlite`, release identity, provider ages, archive coverage and each job's last success. A healthy process is not proof that sources are fresh; inspect provider statuses and overdue jobs too.
- Daily backups use [SQLite's online backup mechanism](https://nodejs.org/api/sqlite.html#sqlitebackupsourcedb-path-options), not a raw copy of a live WAL database. Keep 14 dated backups. **Backups are on the same VPS**; off-host replication is not configured.
- To roll back code, point only `/opt/money-markets/current` to a previously tested release and restart this service. Keep the database and token in place. Current migrations only add tables; never remove a database as part of a deployment.
- For disaster restore, stop only this service, preserve the existing database **and its WAL/SHM files** in a dated recovery directory, restore a known-good backup to `/var/lib/money-markets/money-markets.sqlite`, set its ownership to `money-markets`, and restart. Verify archive counts and source freshness before declaring recovery complete.
- Rotate the collector token in its private file and the sensitive Vercel environment setting, restart the collector, and redeploy Vercel as one coordinated operation. Do not print token values or put them on command lines.

Reference: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## Verify the public deployment

Run live-source checks against the production URL:

```sh
MONEY_MARKETS_URL=https://your-production-domain.vercel.app npm run test:smoke
```

In PowerShell:

```powershell
$env:MONEY_MARKETS_URL = 'https://your-production-domain.vercel.app'
npm run test:smoke
```

The smoke check requires real market data, both protocols' USDC histories, valid opportunity sizing, public governance items and correct error responses. It performs no blockchain transactions. Upstream outages can legitimately fail a live check; offline tests do not silently replace those checks.

`GET /api/health` verifies that the API loaded, not that every source is live. Check `/api/snapshot` provider statuses too. The normalized snapshot must remain below Vercel's 4.5 MB response limit; the smoke check guards a conservative 4 MB budget. If coverage grows beyond it, introduce pagination or a deduplicated transport before increasing the universe.

## Local use

Node.js 22.17+ on the 22.x line and npm are required. Run `npm ci`, then `npm run dev`, and open `http://localhost:3100`. `npm run build` followed by `npm start` serves the compiled frontend. Windows users can run `start-local.cmd`.

Set `PORT` to choose a different local port. The server remains bound to loopback. SQLite caches stay in `.data/`, and all local environment files, Vercel credentials/project metadata, logs, databases and build artifacts are ignored by Git and excluded from uploads. Never copy `.env.local` or `.vercel/` into documentation or commits.
