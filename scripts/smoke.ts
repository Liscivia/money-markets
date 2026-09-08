import assert from 'node:assert/strict';
import type { Snapshot, MarketHistory, OpportunityResult, NewsResult } from '../shared/types.js';
const base = process.env.MONEY_MARKETS_URL ?? 'http://localhost:3100';
async function get<T>(path: string): Promise<T> {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(280_000) });
  assert.equal(
    response.status,
    200,
    `${path}: ${await response
      .clone()
      .text()
      .then((s) => s.slice(0, 400))}`,
  );
  const payload = await response.text();
  if (path === '/api/snapshot')
    assert(
      Buffer.byteLength(payload) < 4_000_000,
      'Snapshot is approaching the hosted response limit; paginate or deduplicate the transport',
    );
  return JSON.parse(payload) as T;
}
const page = await fetch(base, { signal: AbortSignal.timeout(30_000) });
assert.equal(page.status, 200, 'Website is not publicly accessible');
assert.match(await page.text(), /Money Markets/);
const health = await get<{ ok: boolean }>('/api/health');
assert.equal(health.ok, true);
const snapshot = await get<Snapshot>('/api/snapshot');
assert(snapshot.markets.length > 0, 'No actual market data');
assert.equal(
  new Set(snapshot.markets.map((m) => m.id)).size,
  snapshot.markets.length,
  'Duplicate market identity',
);
for (const market of snapshot.markets) {
  assert(Number.isFinite(market.totalSupplyUsd) && market.totalSupplyUsd >= 0, `Invalid supply ${market.id}`);
  assert(
    Number.isFinite(market.borrowCapacityUsd) && market.borrowCapacityUsd >= 0,
    `Invalid capacity ${market.id}`,
  );
  assert(
    market.borrowApy === null || (Number.isFinite(market.borrowApy) && market.borrowApy >= 0),
    `Invalid borrow ${market.id}`,
  );
  assert(
    market.supplyApy === null || (Number.isFinite(market.supplyApy) && market.supplyApy >= 0),
    `Invalid supply rate ${market.id}`,
  );
}
console.log(
  'Snapshot:',
  snapshot.providers.map((p) => `${p.protocol} ${p.marketCount} ${p.status}`).join('; '),
);
for (const protocol of ['Aave', 'Morpho'] as const) {
  const candidates = snapshot.markets
    .filter((m) => m.protocol === protocol && m.asset.symbol === 'USDC' && m.chainId === 1)
    .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd);
  assert(candidates.length, `No Ethereum USDC ${protocol} market`);
  const history = await get<MarketHistory>(
    `/api/history?marketId=${encodeURIComponent(candidates[0].id)}&days=30`,
  );
  assert(history.points.length > 1, `${protocol} no historical data: ${history.warning}`);
  assert(
    history.points.every((p) => Number.isFinite(p.timestamp)),
    `${protocol} timestamp malformed`,
  );
  console.log(`${protocol} 30d history:`, history.points.length, 'points');
}
const opportunities = await get<OpportunityResult>('/api/opportunities');
for (const opportunity of [...opportunities.loops, ...opportunities.carry]) {
  assert(opportunity.eligible, 'Excluded row in qualified opportunities');
  assert(opportunity.borrowLiquidityUsd >= 5_000_000, 'Below liquidity floor');
  assert(opportunity.capacityUsd >= 5_000_000, 'Below scenario debt capacity');
  assert(Number.isFinite(opportunity.netReturnOnEquity), 'Invalid return');
  assert(opportunity.healthFactor >= 1.2 - 1e-9, 'Insufficient health factor');
}
console.log(
  'Opportunities:',
  opportunities.loops.length,
  'loops,',
  opportunities.carry.length,
  'carry,',
  opportunities.excluded.length,
  'excluded',
);
const news = await get<NewsResult>('/api/news');
assert(news.items.length, 'No governance items');
assert(
  news.items.every(
    (n) => n.url.startsWith('https://governance.aave.com/') || n.url.startsWith('https://forum.morpho.org/'),
  ),
  'Unknown feed URL',
);
console.log('News:', news.items.length, 'items');
const smaller = await get<OpportunityResult>('/api/opportunities?minLiquidityUsd=100000&debtSizeUsd=25000');
assert.equal(smaller.minLiquidityUsd, 100000);
assert.equal(smaller.debtSizeUsd, 25000);
for (const opportunity of [...smaller.loops, ...smaller.carry]) {
  assert(opportunity.borrowLiquidityUsd >= 100000, 'Below custom liquidity threshold');
  assert(opportunity.capacityUsd >= 25000, 'Below custom scenario size');
}
assert.equal((await fetch(base + '/api/opportunities?minLiquidityUsd=0')).status, 400);
assert.equal((await fetch(base + '/api/history?marketId=invalid')).status, 404);
assert.equal(
  (await fetch(base + '/api/refresh', { method: 'POST', headers: { Origin: 'https://untrusted.example' } }))
    .status,
  403,
);
console.log('Smoke checks passed.');
