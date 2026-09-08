# Deployment

## Vercel

Import `Liscivia/money-markets` into Vercel. The committed `vercel.json` supplies the Vite build, static output and single Express-backed API function. Node 22 is pinned in `package.json`; no API keys or database credentials are required.

```sh
npm ci
npm test
npm run build
npx vercel link
npx vercel --prod
```

Connect the GitHub repository in the project's Git settings for automatic deployments from `main` and branch previews. Public production access and preview protection are separate Vercel settings. Do not make deployment logs or source files publicly readable just to publish the website.

The static UI is served from `dist/`. `/api/*` rewrites to `api/index.ts`, whose Express router retains the original API path. Hash-based navigation (`#overview`, `#rates`, `#opportunities`, `#news`) needs no SPA catch-all that could hide API errors.

Functions may run for up to 300 seconds to accommodate cold public-data collection. Refreshes finish within the request, and the memory cache is **not durable**. There is no cron job or continuously running collector on Vercel. Real source histories remain available; local hourly observations are not copied to the cloud. See [architecture](architecture.md) for cache and rate-limit boundaries.

Reference: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [function limits](https://vercel.com/docs/functions/limitations), [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite).

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
