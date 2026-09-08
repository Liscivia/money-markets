import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { createApp } from '../server/app.js';
import { createDataService, SNAPSHOT_KEY } from '../server/service.js';
import { MemoryCache } from '../server/store.js';
import type { Market, Snapshot } from '../shared/types.js';

const market: Market = {
  id: 'test-usdc',
  protocol: 'Aave',
  version: 'V3',
  chainId: 1,
  chain: 'Ethereum',
  name: 'Ethereum Core',
  address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  asset: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    decimals: 6,
    priceUsd: 1,
    nativeApr: null,
  },
  collateral: [],
  supplyApy: 0.03,
  borrowApy: 0.04,
  supplyRewardApr: 0,
  borrowRewardApr: 0,
  totalSupplyUsd: 20e6,
  totalBorrowUsd: 10e6,
  liquidityUsd: 10e6,
  borrowCapacityUsd: 10e6,
  supplyCapacityUsd: null,
  utilization: 0.5,
  lltv: null,
  listed: true,
  isFrozen: false,
  isPaused: false,
  borrowingEnabled: true,
  sourceUrl: '',
  fetchedAt: '2026-09-08T12:00:00Z',
  rateObservedAt: '2026-09-08T12:00:00Z',
  warnings: [],
  historyRef: {},
};
const snapshot: Snapshot = {
  markets: [market],
  fetchedAt: market.fetchedAt,
  providers: [
    {
      protocol: 'Aave',
      status: 'live',
      fetchedAt: market.fetchedAt,
      marketCount: 1,
      coverage: 'Test fixture',
    },
  ],
};

test('Vercel preserves API paths without injecting a named capture into query parameters', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites, [{ source: '/api/(.*)', destination: '/api' }]);
  assert.equal(config.functions['api/index.ts'].maxDuration, 300);
  assert.equal(config.outputDirectory, 'dist');
});

test('Ephemeral store preserves timestamps, returns isolated values, and bounds LRU entries', () => {
  const cache = new MemoryCache(2, 1000);
  cache.set('a', { n: 1 }, 10);
  cache.set('b', { n: 2 }, 20);
  const a = cache.get<{ n: number }>('a')!;
  a.value.n = 999;
  assert.equal(cache.get<{ n: number }>('a')!.value.n, 1);
  assert.equal(cache.get('a')!.savedAt, 10);
  cache.set('c', { n: 3 });
  assert.equal(cache.get('b'), null);
  cache.set('huge', 'x'.repeat(2000));
  assert.equal(cache.get('huge'), null);
  assert.deepEqual(cache.aggregates(), []);
  cache.close();
  assert.equal(cache.get('a'), null);
});

test('Service has no startup fetch, coalesces cold requests, and cools manual refreshes', async () => {
  let calls = 0,
    clock = 1_000_000;
  const service = createDataService(
    new MemoryCache(),
    {
      fetchSnapshot: async () => {
        calls++;
        return structuredClone(snapshot);
      },
    },
    () => clock,
  );
  assert.equal(calls, 0);
  const results = await Promise.all([
    service.getSnapshot(),
    service.getSnapshot(),
    service.getSnapshot(true),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0].markets.length, 1);
  await service.getSnapshot(true);
  assert.equal(calls, 1);
  clock += 60_001;
  await service.getSnapshot(true);
  assert.equal(calls, 2);
  assert.equal((await service.getSnapshot()).markets[0].rateObservedAt, market.rateObservedAt);
});

test('Expired snapshots refresh within the request and outages remain visibly stale', async () => {
  const cache = new MemoryCache();
  cache.set(SNAPSHOT_KEY, snapshot, 0);
  let calls = 0,
    failing = false,
    clock = 1_000_000;
  const service = createDataService(
    cache,
    {
      fetchSnapshot: async () => {
        calls++;
        if (failing) throw new Error('unavailable');
        return structuredClone(snapshot);
      },
    },
    () => clock,
  );
  assert.equal((await service.getSnapshot()).providers[0].status, 'live');
  assert.equal(calls, 1);
  clock += 300_001;
  failing = true;
  const stale = await service.getSnapshot();
  assert.equal(stale.providers[0].status, 'stale');
  assert.equal(stale.markets[0].rateObservedAt, market.rateObservedAt);
  await service.getSnapshot(true);
  assert.equal(calls, 2, 'Failed refresh should not be immediately retried');
});

test('Failed cold starts do not fabricate data or immediately flood the provider', async () => {
  let calls = 0;
  const service = createDataService(new MemoryCache(), {
    fetchSnapshot: async () => {
      calls++;
      throw new Error('upstream');
    },
  });
  await assert.rejects(service.getSnapshot());
  await assert.rejects(service.getSnapshot(), /temporarily unavailable/);
  assert.equal(calls, 1);
});

test('One history request is shared and different in-flight histories are bounded', async () => {
  let release!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = createDataService(new MemoryCache(), {
    fetchHistory: async () => {
      calls++;
      await gate;
      return {
        marketId: market.id,
        points: [],
        fetchedAt: market.fetchedAt,
        source: 'fixture',
        resolution: 'daily',
      };
    },
  });
  const requests = Array.from({ length: 8 }, (_, i) => service.history(market, i + 1));
  const same = service.history(market, 1);
  await assert.rejects(service.history(market, 9), /Too many history/);
  release();
  await Promise.all([...requests, same]);
  assert.equal(calls, 8);
  await service.history(market, 1);
  assert.equal(calls, 8, 'Empty histories should briefly cache');
});

async function httpApp(mode: 'public' | 'local', work: (base: string) => Promise<void>, fail = false) {
  const service = createDataService(new MemoryCache(), {
    fetchSnapshot: async () => {
      if (fail) throw new Error('PRIVATE_INTERNAL_PATH');
      return structuredClone(snapshot);
    },
  });
  const server = createApp(service, { mode, port: 3100 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await work(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Node fetch rewrites Host; use a real HTTP request to test host validation.
function hostRequest(url: string, host: string, origin?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: origin ? 'POST' : 'GET', headers: { Host: host, ...(origin ? { Origin: origin } : {}) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers as Record<string, string>,
            }),
          ),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('Public API serves its Vercel host, keeps API 404s JSON, and discloses ephemeral storage', async () => {
  await httpApp('public', async (base) => {
    const health = await hostRequest(base + '/api/health', 'money-markets.vercel.app');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).storage, 'ephemeral');
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    const missing = await fetch(base + '/api/not-a-route');
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type')!, /application\/json/);
    const observations = await fetch(base + '/api/competition-history').then((r) => r.json());
    assert.equal(observations.persistent, false);
    assert.deepEqual(observations.points, []);
  });
});

test('Public refresh rejects cross-origin requests and permits its exact HTTPS origin', async () => {
  await httpApp('public', async (base) => {
    assert.equal(
      (await hostRequest(base + '/api/refresh', 'money-markets.vercel.app', 'https://untrusted.example'))
        .status,
      403,
    );
    assert.equal(
      (
        await hostRequest(
          base + '/api/refresh',
          'money-markets.vercel.app',
          'https://money-markets.vercel.app.evil.example',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await hostRequest(
          base + '/api/refresh',
          'money-markets.vercel.app',
          'https://money-markets.vercel.app',
        )
      ).status,
      200,
    );
    assert.equal((await fetch(base + '/api/snapshot')).headers.get('access-control-allow-origin'), null);
  });
});

test('Local preview retains its host guard', async () => {
  await httpApp('local', async (base) => {
    assert.equal((await hostRequest(base + '/api/health', 'untrusted.example')).status, 403);
    assert.equal((await fetch(base + '/api/health')).status, 200);
  });
});

test('Bad query inputs return 400 before reading sources; unknown markets remain 404', async () => {
  await httpApp('public', async (base) => {
    for (const path of [
      '/api/history?days=1.5&marketId=x',
      '/api/history?days=NaN&marketId=x',
      '/api/history?days=1&days=2&marketId=x',
      '/api/protocol-capital?chain[]=x',
      '/api/opportunities?minLiquidityUsd=0',
      '/api/protocol-history?days=99999',
    ]) {
      assert.equal((await fetch(base + path)).status, 400, path);
    }
    assert.equal((await fetch(base + '/api/history?marketId=unknown')).status, 404);
    assert.equal((await fetch(base + '/api/snapshot', { method: 'DELETE' })).status, 405);
  });
});

test('Unexpected server errors never disclose paths or raw messages', async () => {
  await httpApp(
    'public',
    async (base) => {
      const result = await fetch(base + '/api/snapshot');
      assert.equal(result.status, 502);
      assert.ok(!(await result.text()).includes('PRIVATE_INTERNAL_PATH'));
    },
    true,
  );
});
