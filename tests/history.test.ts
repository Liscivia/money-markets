import test from 'node:test';
import assert from 'node:assert/strict';
import { alignHistory } from '../shared/history.js';
import type { MarketHistory } from '../shared/types.js';
const history = (days: number[], rate: number): MarketHistory => ({
  marketId: 'test',
  source: 'test',
  fetchedAt: 'test',
  points: days.map((d) => ({ timestamp: d * 86400, supplyApy: rate, borrowApy: rate })),
});
test('weekly source is compared at weekly cadence against daily data, with no artificial daily gaps', () => {
  const r = alignHistory(
    [
      history([0, 7, 14, 21], 0.03),
      history(
        Array.from({ length: 22 }, (_, i) => i),
        0.04,
      ),
    ],
    'borrowApy',
  );
  assert.equal(r.intervalDays, 7);
  assert.equal(r.chart.length, 4);
  assert(r.chart.every((p) => p.A === 0.03 && p.B === 0.04));
});
test('genuinely missing source intervals stay null and are never filled from the other source', () => {
  const r = alignHistory([history([0, 7, 21, 28], 0.03), history([0, 7, 14, 21, 28], 0.04)], 'supplyApy');
  assert.equal(r.intervalDays, 7);
  assert.deepEqual(r.chart[2], { timestamp: 14 * 86400_000, A: null, B: 0.04 });
});
test('hourly versus daily histories retain last observed rates per UTC day', () => {
  const a = history([0, 0.25, 0.5, 1], 0.03);
  a.points[2].borrowApy = 0.05;
  const r = alignHistory([a, history([0, 1], 0.04)], 'borrowApy');
  assert.equal(r.intervalDays, 1);
  assert.equal(r.chart[0].A, 0.05);
});
