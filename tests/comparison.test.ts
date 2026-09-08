import assert from 'node:assert/strict';
import test from 'node:test';
import type { Market } from '../shared/types.js';
import {
  comparisonFilters,
  comparisonOptions,
  comparisonAssetKey,
  filterComparisonMarkets,
  selectedComparisonMarket,
  updateComparisonFilter,
} from '../shared/comparison.js';

const market = (
  id: string,
  protocol: 'Aave' | 'Morpho',
  chainId = 1,
  address = '0xDebt',
  collateralAddress = '0xCollateral',
) =>
  ({
    id,
    protocol,
    version: protocol === 'Aave' ? 'V3' : 'Blue',
    chainId,
    chain: chainId === 1 ? 'Ethereum' : 'Base',
    name: 'Core',
    address: '0xpool',
    asset: { symbol: 'USDC', address },
    collateral: [{ asset: { symbol: 'wstETH', address: collateralAddress } }],
    totalSupplyUsd: 1e7,
  }) as Market;
const markets = [
  market('aave', 'Aave'),
  market('morpho', 'Morpho'),
  market('base', 'Aave', 8453),
  market('other-debt', 'Aave', 1, '0xOther'),
  market('other-collateral', 'Aave', 1, '0xDebt', '0xOtherCol'),
];

test('Comparison protocol is strict, including when the prior selection belongs to the other protocol', () => {
  for (const protocol of ['Aave', 'Morpho'] as const) {
    const matches = filterComparisonMarkets(markets, comparisonFilters(protocol));
    assert.ok(matches.length);
    assert.ok(matches.every((m) => m.protocol === protocol));
    assert.equal(
      selectedComparisonMarket(matches, protocol === 'Aave' ? 'morpho' : 'aave')?.protocol,
      protocol,
    );
  }
});
test('Network, debt asset and collateral filters intersect using exact addresses, not just tickers', () => {
  const filters = {
    ...comparisonFilters('Aave'),
    network: '1',
    debtAsset: comparisonAssetKey(1, markets[0].asset),
    collateralAsset: comparisonAssetKey(1, markets[0].collateral[0].asset),
  };
  assert.deepEqual(
    filterComparisonMarkets(markets, filters).map((m) => m.id),
    ['aave'],
  );
  assert.deepEqual(filterComparisonMarkets(markets, { ...filters, network: '8453' }), []);
});
test('Empty matches stay empty, never reintroducing a nonmatching selected market', () => {
  const matches = filterComparisonMarkets(markets, {
    ...comparisonFilters('Aave'),
    search: 'no-such-market',
  });
  assert.deepEqual(matches, []);
  assert.equal(selectedComparisonMarket(matches, 'aave'), undefined);
});
test('Facet choices belong to the selected protocol/network and duplicate collateral modes are deduplicated', () => {
  const morpho = comparisonOptions(markets, comparisonFilters('Morpho'));
  assert.deepEqual(
    morpho.networks.map((n) => n.value),
    ['1'],
  );
  assert.equal(morpho.debtAssets.length, 1);
  const options = comparisonOptions(markets, { ...comparisonFilters('Aave'), network: '1' });
  assert.equal(options.debtAssets.length, 2);
  assert.equal(options.collateralAssets.length, 2);
  assert.ok(options.debtAssets.every((a) => a.value.startsWith('1:')));
});
test('Changing protocol or network clears incompatible token filters without changing the other card', () => {
  const first = {
    ...comparisonFilters('Aave'),
    network: '8453',
    debtAsset: '8453:0xdebt',
    collateralAsset: '8453:0xcollateral',
    search: 'test',
  };
  const second = comparisonFilters('Morpho');
  assert.deepEqual(updateComparisonFilter(first, 'protocol', 'Morpho'), comparisonFilters('Morpho'));
  const next = updateComparisonFilter(first, 'network', '1');
  assert.equal(next.debtAsset, 'all');
  assert.equal(next.collateralAsset, 'all');
  assert.equal(first.network, '8453');
  assert.deepEqual(second, comparisonFilters('Morpho'));
});
