import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCache } from '../server/store.js';
import {
  fetchProtocolCapital,
  fetchCompetition,
  useScheduledCompetition,
  refreshScheduledCompetition,
} from '../server/competition.js';

test('Collector capital survives restart, shares its generation with history and retains timestamps on partial failures', async () => {
  const originalFetch = globalThis.fetch;
  const at = Date.now() - 3600_000;
  const day = Math.floor(at / 86400_000) * 86400;
  const rows = [100, 20, 80].map((amount) => ({
    name: 'Fixture',
    tvl: [{ date: day, totalLiquidityUSD: amount }],
    chainTvls: { borrowed: { tvl: [{ date: day, totalLiquidityUSD: amount / 2 }] } },
  }));
  const cache = new MemoryCache();
  cache.set('defillama:raw-capital-v2', { at, rows, warnings: [] });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Offline');
  };
  try {
    useScheduledCompetition(cache);
    const capital = await fetchProtocolCapital('all');
    const history = await fetchCompetition(7, 'all');
    assert.equal(calls, 0, 'Ordinary reads must use saved capital, not poll');
    assert.equal(capital.fetchedAt, new Date(at).toISOString());
    assert.equal(history.fetchedAt, capital.fetchedAt);
    assert.equal(capital.protocols.find((p) => p.protocol === 'Aave')!.tvlUsd, 120);
    await assert.rejects(refreshScheduledCompetition(), /Incomplete capital refresh/);
    assert.equal(calls, 3);
    useScheduledCompetition(cache); // Simulate process restart loading durable generation.
    const retained = await fetchProtocolCapital('all');
    assert.equal(retained.fetchedAt, capital.fetchedAt);
    assert.equal(retained.protocols.find((p) => p.protocol === 'Morpho')!.tvlUsd, 80);
    assert.ok(retained.warnings.some((warning) => warning.includes('Retaining')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
