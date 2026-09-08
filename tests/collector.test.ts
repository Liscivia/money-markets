import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cache } from '../server/cache.js';
import { MemoryCache } from '../server/store.js';
import { SNAPSHOT_KEY, createDataService } from '../server/service.js';
import {
  CollectorJobs,
  collectedSnapshot,
  collectorAccess,
  collectorReadService,
  MARKET_INTERVAL,
} from '../server/collector.js';
import { createCollectorProxy } from '../server/proxy.js';
import type { Market, Snapshot } from '../shared/types.js';

const now = Date.now();
const fetchedAt = new Date(now).toISOString();
const fixture = (time = fetchedAt): Snapshot => ({
  fetchedAt: time,
  markets: [
    {
      id: 'aave-usdc',
      protocol: 'Aave',
      fetchedAt: time,
      rateObservedAt: time,
      supplyApy: 0.03,
      borrowApy: 0.04,
    } as Market,
  ],
  providers: [{ protocol: 'Aave', status: 'live', fetchedAt: time, marketCount: 1, coverage: 'fixture' }],
});

test('SQLite archive survives reopen, keeps daily last source observations and excludes stale/missing timestamps', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'money-markets-test-'));
  let cache = new Cache(join(directory, 'test.sqlite'));
  try {
    cache.recordSnapshot(fixture());
    const stale = fixture();
    stale.markets[0].borrowApy = 0.99;
    stale.providers[0].status = 'stale';
    cache.recordSnapshot(stale);
    const missing = fixture();
    missing.markets[0].rateObservedAt = null;
    cache.recordSnapshot(missing);
    const older = Math.floor(now / 86400_000) * 86400 - 12 * 3600;
    cache.recordHistory({
      marketId: 'aave-usdc',
      fetchedAt,
      source: 'fixture',
      points: [
        { timestamp: older, supplyApy: null, borrowApy: 0.02 },
        { timestamp: older - 1, supplyApy: 0, borrowApy: 0 },
        { timestamp: NaN, supplyApy: 0, borrowApy: 0 },
      ],
    });
    await cache.backupTo(join(directory, 'backup.sqlite'));
    cache.close();
    cache = new Cache(join(directory, 'test.sqlite'));
    assert.equal(cache.marketHistory('aave-usdc', older - 86400).at(-1)!.borrowApy, 0.04);
    assert.equal(cache.marketHistory('aave-usdc', older - 86400)[0].borrowApy, 0.02);
    assert.deepEqual(cache.marketHistory('unknown', 0), []);
    const backup = new Cache(join(directory, 'backup.sqlite'));
    assert.deepEqual(backup.marketHistory('aave-usdc', 0), cache.marketHistory('aave-usdc', 0));
    backup.close();
  } finally {
    cache.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Scheduled reads do not fetch or restamp source data and stale providers leave rankings', async () => {
  const cache = new MemoryCache();
  let calls = 0,
    clock = now;
  const upstream = createDataService(cache, {
    fetchSnapshot: async () => {
      calls++;
      return fixture();
    },
  });
  const service = collectorReadService(upstream, cache, () => clock);
  await assert.rejects(service.getSnapshot(), /first scheduled/);
  cache.set(SNAPSHOT_KEY, fixture(), now);
  assert.equal((await service.getSnapshot(true)).providers[0].status, 'live');
  clock += 16 * 60_000;
  const stale = await service.getSnapshot(true);
  assert.equal(stale.providers[0].status, 'stale');
  assert.equal(stale.fetchedAt, fetchedAt);
  assert.equal(stale.markets[0].rateObservedAt, fetchedAt);
  assert.equal(calls, 0);
  assert.equal(
    cache.get<Snapshot>(SNAPSHOT_KEY)!.value.providers[0].status,
    'live',
    'Reading must not mutate the store',
  );
  const invalid = fixture();
  invalid.providers[0].fetchedAt = null;
  cache.set(SNAPSHOT_KEY, invalid);
  assert.equal(collectedSnapshot(cache, clock).providers[0].status, 'stale');
});

test('Slow jobs coalesce, other jobs proceed, durable due times survive restart, failures retain last success', async () => {
  const cache = new MemoryCache();
  let clock = now,
    calls = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const jobs = new CollectorJobs(cache, () => clock);
  const one = jobs.run('markets', MARKET_INTERVAL, async () => {
    calls++;
    await gate;
  });
  const two = jobs.run('markets', MARKET_INTERVAL, async () => {
    calls++;
  });
  await jobs.run('news', 3600_000, async () => {});
  assert.equal(jobs.states().news!.status, 'ok');
  release();
  await Promise.all([one, two]);
  assert.equal(calls, 1);
  const restarted = new CollectorJobs(cache, () => clock);
  await restarted.run('markets', MARKET_INTERVAL, async () => {
    calls++;
  });
  assert.equal(calls, 1);
  clock += MARKET_INTERVAL + 1;
  await restarted.run('markets', MARKET_INTERVAL, async () => {
    calls++;
    throw new Error('fail');
  });
  assert.equal(restarted.states().markets!.lastSuccessAt, now);
  assert.equal(restarted.states().markets!.status, 'error');
  await restarted.run('markets', MARKET_INTERVAL, async () => {
    calls++;
  });
  assert.equal(calls, 2);
});

test('An interrupted daily job resumes after restart instead of waiting a full day', async () => {
  const cache = new MemoryCache();
  cache.set('collector:job:capital', {
    status: 'running',
    attemptedAt: now - 1000,
    finishedAt: null,
    lastSuccessAt: null,
  });
  let calls = 0;
  const jobs = new CollectorJobs(cache, () => now);
  await jobs.run('capital', 86400_000, async () => {
    calls++;
  });
  assert.equal(calls, 1);
  assert.equal(jobs.states().capital!.status, 'ok');
});

async function withServer(app: express.Express, work: (origin: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const token = 'a'.repeat(64);
test('Collector requires its own token, is read-only, and bounds authenticated requests', async () => {
  const app = express();
  app.use(collectorAccess(token));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  await withServer(app, async (origin) => {
    assert.equal((await fetch(origin + '/api/health')).status, 401);
    assert.equal(
      (await fetch(origin + '/api/health', { headers: { Authorization: 'Bearer wrong' } })).status,
      401,
    );
    assert.equal(
      (await fetch(origin + '/api/health', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }))
        .status,
      405,
    );
    for (let i = 0; i < 300; i++)
      assert.equal(
        (await fetch(origin + '/api/health', { headers: { Authorization: `Bearer ${token}` } })).status,
        200,
      );
    assert.equal(
      (await fetch(origin + '/api/health', { headers: { Authorization: `Bearer ${token}` } })).status,
      429,
    );
  });
});

test('Vercel proxy has a fixed HTTPS destination, private token and a refresh that cannot start collection', async () => {
  assert.throws(() => createCollectorProxy('http://collector.example', token));
  assert.throws(() => createCollectorProxy('https://collector.example/private', token));
  const requests: { url: string; method?: string }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    requests.push({ url: String(url), method: options?.method });
    assert.equal((options!.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.equal(options!.redirect, 'error');
    return Response.json({ ok: true, storage: 'sqlite' });
  };
  await withServer(createCollectorProxy('https://collector.example', token, fetcher), async (origin) => {
    const response = await fetch(origin + '/api/health');
    assert.equal((await response.json()).storage, 'sqlite');
    assert.equal(response.headers.get('authorization'), null);
    assert.equal((await fetch(origin + '/api/refresh', { method: 'POST' })).status, 200);
    assert.equal(requests.at(-1)!.url, 'https://collector.example/api/snapshot');
    assert.equal((await fetch(origin + '/api/news?refresh=1')).status, 200);
    assert.equal(requests.at(-1)!.url, 'https://collector.example/api/news');
    assert.equal((await fetch(origin + '/api/health?url=https://evil.example')).status, 400);
    assert.equal((await fetch(origin + '/api/unknown')).status, 404);
    assert.equal(
      (await fetch(origin + '/api/refresh', { method: 'POST', headers: { Origin: 'https://evil.example' } }))
        .status,
      403,
    );
    assert.equal(requests.length, 3);
  });
});

test('Collector outages, redirects and oversized responses become bounded sanitized failures', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('PRIVATE TOKEN');
    },
    async () => Response.redirect('https://evil.example'),
    async () => Response.json({ value: 'x'.repeat(4_000_001) }),
  ])
    await withServer(createCollectorProxy('https://collector.example', token, fetcher), async (origin) => {
      const response = await fetch(origin + '/api/snapshot');
      assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes('PRIVATE TOKEN'));
    });
});
