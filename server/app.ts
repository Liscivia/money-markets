import express from 'express';
import { computeOpportunities } from './opportunities.js';
import { apiAccess, type AccessPolicy } from './security.js';
import { HttpError, integerParameter, chainParameter } from './errors.js';
import type { DataService } from './service.js';
import { marketUrl } from '../shared/market-links.js';
import { parseOpportunityParameters } from '../shared/opportunity-inputs.js';
import type { Snapshot } from '../shared/types.js';

function linkedSnapshot(snapshot: Snapshot): Snapshot {
  return { ...snapshot, markets: snapshot.markets.map((m) => ({ ...m, sourceUrl: marketUrl(m) ?? '' })) };
}

export function createApp(service: DataService, access: AccessPolicy) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.use('/api', apiAccess(access));

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      service: 'money-markets',
      sourceObservationsVersion: 2,
      storage: access.mode === 'public' ? 'ephemeral' : 'sqlite',
    }),
  );
  app.get('/api/liquidity-benchmarks', async (_req, res) => {
    res.json(await service.liquidityBenchmarks());
  });
  app.get('/api/protocol-capital', async (req, res) => {
    res.json(await service.protocolCapital(chainParameter(req.query.chain)));
  });
  app.get('/api/snapshot', async (_req, res) => {
    res.json(linkedSnapshot(await service.getSnapshot()));
  });
  app.post('/api/refresh', async (_req, res) => {
    res.json(linkedSnapshot(await service.getSnapshot(true)));
  });
  app.get('/api/history', async (req, res) => {
    const days = integerParameter(req.query.days, 30, 1, 365);
    if (typeof req.query.marketId !== 'string' || !req.query.marketId || req.query.marketId.length > 300)
      throw new HttpError(400, 'A marketId is required');
    const snapshot = await service.getSnapshot();
    const market = snapshot.markets.find((m) => m.id === req.query.marketId);
    if (!market) throw new HttpError(404, 'Market not present in current universe');
    res.json(await service.history(market, days));
  });
  app.get('/api/opportunities', async (req, res) => {
    let options;
    try {
      options = parseOpportunityParameters(req.query);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid parameters');
    }
    const snapshot = await service.getSnapshot();
    const liveProtocols = new Set(
      snapshot.providers.filter((p) => p.status === 'live').map((p) => p.protocol),
    );
    const result = computeOpportunities(
      { ...snapshot, markets: snapshot.markets.filter((m) => liveProtocols.has(m.protocol)) },
      options,
    );
    if (liveProtocols.size < snapshot.providers.length)
      result.methodology.push('Stale or unavailable provider data is excluded from opportunity rankings.');
    res.json(result);
  });
  app.get('/api/news', async (req, res) => {
    res.json(await service.news(req.query.refresh === '1'));
  });
  app.get('/api/competition-history', (req, res) => {
    const days = integerParameter(req.query.days, 30, 1, 365);
    res.json({
      points: service.observations(Date.now() - days * 86400_000),
      persistent: access.mode === 'local',
      source:
        access.mode === 'local'
          ? 'Local hourly observations since this app first ran; no backfilled or synthetic protocol totals.'
          : 'Hourly local observations are not persisted on Vercel. Use /api/protocol-history for sourced historical capital data.',
    });
  });
  app.get('/api/protocol-history', async (req, res) => {
    res.json(
      await service.protocolHistory(
        integerParameter(req.query.days, 90, 1, 365),
        chainParameter(req.query.chain),
      ),
    );
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof HttpError) {
      if (error.status === 429 || error.status === 503) res.set('Retry-After', '60');
      res.status(error.status).json({ error: error.message });
      return;
    }
    // Internal errors/paths are never returned to the public client.
    console.error('Money Markets API request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(502).json({ error: 'Data source unavailable; try refreshing shortly.' });
  });
  return app;
}
