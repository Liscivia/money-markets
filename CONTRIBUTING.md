# Contributing

Use Node 22 and the committed npm lockfile.

```sh
npm ci
npm test
npm run build
npm run format:check
```

Keep UI in `src/`, HTTP/source integration in `server/`, transport types and pure calculations in `shared/`, and regressions in `tests/`. `api/index.ts` must remain free of local filesystem requirements, listeners and background refresh timers.

Economic changes need explicit fixtures for both valid and rejected cases, plus an update to [methodology](docs/methodology.md). Preserve chain/address identity, original observation times, unknown values, collateral constraints and the distinction between liquidity, TVL and borrow capacity. Never add made-up fallback markets to make a live-data test pass.

Run `npm run test:smoke` against a running app when changing API behavior. It reads live sources and is intentionally separate from deterministic CI. Do not commit caches, credentials, local databases or generated artifacts. Report suspected vulnerabilities privately; do not place secrets or exploitable production details in a public issue.
