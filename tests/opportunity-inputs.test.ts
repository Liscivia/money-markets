import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_OPPORTUNITY_PARAMETERS, parseOpportunityParameters } from '../shared/opportunity-inputs.js';

test('Omitted opportunity amounts still default to $5M', () => {
  assert.deepEqual(parseOpportunityParameters({}), DEFAULT_OPPORTUNITY_PARAMETERS);
});
test('Explicit smaller dollar values pass unchanged without clamping either input', () => {
  assert.deepEqual(
    parseOpportunityParameters({ minLiquidityUsd: '100000', debtSizeUsd: '25000', targetLeverage: '2' }),
    { minLiquidityUsd: 100000, debtSizeUsd: 25000, targetLeverage: 2 },
  );
  assert.equal(parseOpportunityParameters({ minLiquidityUsd: '1' }).minLiquidityUsd, 1);
  assert.equal(parseOpportunityParameters({ minLiquidityUsd: '1' }).debtSizeUsd, 5_000_000);
  assert.equal(parseOpportunityParameters({ debtSizeUsd: '1234.5' }).debtSizeUsd, 1234.5);
});
test('Zero, negative, nonfinite, empty API values, duplicate params and out-of-range values fail', () => {
  for (const value of ['0', '-1', NaN, Infinity, 'not-a-number', '', null, ['1', '2'], '1000000001']) {
    assert.throws(() => parseOpportunityParameters({ minLiquidityUsd: value }), RangeError);
    assert.throws(() => parseOpportunityParameters({ debtSizeUsd: value }), RangeError);
  }
  assert.throws(() => parseOpportunityParameters({ targetLeverage: 1 }), RangeError);
});
