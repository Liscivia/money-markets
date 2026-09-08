import type { RequestHandler } from 'express';

export interface AccessPolicy {
  mode: 'local' | 'public';
  port?: number;
}
const queryKeys = new Set([
  'marketId',
  'days',
  'chain',
  'refresh',
  'minLiquidityUsd',
  'debtSizeUsd',
  'targetLeverage',
]);

/** No credentials, arbitrary upstream URLs, reflected CORS, or public write APIs. */
export function apiAccess(policy: AccessPolicy): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (Object.entries(req.query).some(([key, value]) => !queryKeys.has(key) || typeof value !== 'string')) {
      res.status(400).json({ error: 'Unknown or repeated query parameter' });
      return;
    }
    if (policy.mode === 'local' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(req.hostname)) {
      res.status(403).json({ error: 'Localhost access only' });
      return;
    }
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      res.set('Allow', 'GET, HEAD, POST').status(405).json({ error: 'Method not allowed' });
      return;
    }
    if (req.method === 'POST') {
      const expected =
        policy.mode === 'public'
          ? [`https://${req.get('host')}`]
          : [`http://localhost:${policy.port}`, `http://127.0.0.1:${policy.port}`];
      if (
        (req.headers.origin && !expected.includes(req.headers.origin)) ||
        req.headers['sec-fetch-site'] === 'cross-site'
      ) {
        res.status(403).json({ error: 'Same-origin request required' });
        return;
      }
    }
    next();
  };
}
