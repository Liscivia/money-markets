# Security

Money Markets is a public-data research dashboard, not a wallet or trading system. It cannot sign or submit transactions and does not collect wallet keys, account credentials or user portfolios.

The application uses fixed upstream hosts, validated query parameters, same-origin refresh checks, bounded hosted caches, coalesced fetches and sanitized HTTP errors. The local server remains loopback-only. Production responses set a content security policy and basic browser security headers. Request coalescing and cooldowns are instance-local; they do not replace Vercel's firewall or account usage controls.

The repository excludes local environment files, Vercel authentication metadata, databases and logs. No deployment credentials belong in source control or client-side `VITE_*` variables. Dependency checks and tests run in CI, but passing them is not an independent security or economic audit.

Do not report vulnerabilities, credentials or exploitable details in a public issue. Use GitHub's private vulnerability reporting when enabled on this repository. Source failures, inaccurate financial assumptions, stale data and insufficient exit liquidity can all make a displayed opportunity unusable; see [methodology](docs/methodology.md).
