import express from 'express';
import { apiAccess } from './security.js';

const routes = new Set([
  '/api/health',
  '/api/snapshot',
  '/api/history',
  '/api/opportunities',
  '/api/news',
  '/api/protocol-capital',
  '/api/protocol-history',
  '/api/competition-history',
  '/api/liquidity-benchmarks',
]);

/** Fixed-origin, authenticated proxy. No client-supplied hosts, cookies, headers or redirects are forwarded. */
export function createCollectorProxy(origin: string, token: string, fetcher: typeof fetch = fetch) {
  const base = new URL(origin);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  )
    throw new Error('Collector origin must be an HTTPS origin without credentials or a path');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Collector token is missing or invalid');
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.use('/api', apiAccess({ mode: 'public' }));
  app.use(async (req, res) => {
    const refresh = req.method === 'POST' && req.path === '/api/refresh';
    const path = refresh ? '/api/snapshot' : req.path;
    if (!routes.has(path)) {
      res.status(404).json({ error: 'Unknown API route' });
      return;
    }
    if (!refresh && !['GET', 'HEAD'].includes(req.method)) {
      res.status(405).json({ error: 'Read-only route' });
      return;
    }
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'refresh') url.searchParams.set(key, String(value));
    }
    try {
      const upstream = await fetcher(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(90_000),
        redirect: 'error',
      });
      if (!upstream.ok && ![400, 404, 429, 503].includes(upstream.status))
        throw new Error('Collector unavailable');
      if (!upstream.headers.get('content-type')?.includes('application/json'))
        throw new Error('Unexpected collector response');
      // Bounded streaming read, below Vercel's 4.5 MB response limit.
      const reader = upstream.body?.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      if (reader)
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 4_000_000) {
              await reader.cancel();
              throw new Error('Collector response too large');
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      const body = Buffer.concat(chunks).toString('utf8');
      JSON.parse(body);
      if ([429, 503].includes(upstream.status)) res.set('Retry-After', '60');
      res.status(upstream.status).type('json').send(body);
    } catch {
      res.set('Retry-After', '60').status(503).json({
        error: 'The data collector is temporarily unavailable. Saved data is retained; try again shortly.',
      });
    }
  });
  return app;
}
