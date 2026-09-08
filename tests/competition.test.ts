import test from 'node:test';
import assert from 'node:assert/strict';
import { daily, series, latestPoint, aaveAt } from '../server/competition.js';
test('TVL daily observations retain the latest observation without inventing gaps', () => {
  const points = daily([
    { date: 86401, totalLiquidityUSD: 12 },
    { date: 86409, totalLiquidityUSD: 15 },
    { date: 259201, totalLiquidityUSD: 30 },
  ]);
  assert.deepEqual(
    [...points!],
    [
      [86400, 15],
      [259200, 30],
    ],
  );
  assert.equal(points!.get(172800), undefined);
  assert.equal(daily(null), null);
});

test('Overview network names resolve to actual DefiLlama keys, not synthetic zero TVL', () => {
  const chainTvls = Object.fromEntries(
    ['Binance', 'xDai', 'zkSync Era', 'Hyperliquid L1', 'Tempo'].flatMap((name, i) => [
      [name, { tvl: [{ date: 1, totalLiquidityUSD: i + 1 }] }],
      [name + '-borrowed', { tvl: [{ date: 1, totalLiquidityUSD: i + 10 }] }],
    ]),
  );
  const raw = { name: 'Protocol', tvl: [], chainTvls } as Parameters<typeof series>[0];
  ['BSC', 'Gnosis', 'zkSync', 'HyperEVM', 'Tempo Mainnet'].forEach((name, i) => {
    assert.equal(series(raw, name)?.[0].totalLiquidityUSD, i + 1);
    assert.equal(series(raw, name, true)?.[0].totalLiquidityUSD, i + 10);
  });
  assert.equal(series(raw, 'Arc'), null);
  assert.equal(series(null, 'Ethereum'), null);
});
test('External latest-value checks retain observation time and do not turn missing data into zero', () => {
  assert.deepEqual(
    latestPoint([
      { date: 20, totalLiquidityUSD: 10 },
      { date: 10, totalLiquidityUSD: 20 },
      { date: 30, totalLiquidityUSD: NaN },
    ]),
    { date: 20, totalLiquidityUSD: 10 },
  );
  assert.equal(latestPoint(undefined), null);
});

test('A network reported only by V3 keeps its real value, without hiding failed sources or gaps', () => {
  const v3 = {
    name: 'V3',
    tvl: [],
    chainTvls: { Binance: { tvl: [{ date: 86400, totalLiquidityUSD: 100 }] } },
  };
  const v4 = {
    name: 'V4',
    tvl: [],
    chainTvls: { Ethereum: { tvl: [{ date: 86400, totalLiquidityUSD: 20 }] } },
  };
  const maps = [daily(series(v3, 'BSC')), daily(series(v4, 'BSC'))];
  assert.equal(aaveAt([v3, v4], maps, 'BSC', 86400), 100);
  assert.equal(aaveAt([v3, v4], maps, 'BSC', 172800), null);
  assert.equal(aaveAt([v3, null], maps, 'BSC', 86400), null);
  assert.equal(aaveAt([v3, v4], [null, null], 'Arc', 86400), null);
});
