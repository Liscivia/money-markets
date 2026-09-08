import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collateralCap, groupCollateral } from '../shared/market-details.js';
import { comparisonFilters, comparisonOptions, filterComparisonMarkets } from '../shared/comparison.js';
import MarketDetails from '../src/components/MarketDetails.js';
import type { CollateralDetail, Market } from '../shared/types.js';

const asset = {
  address: '0x0000000000000000000000000000000000000011',
  symbol: 'wstETH',
  decimals: 18,
  priceUsd: 3000,
  nativeApr: null,
};
const detail: CollateralDetail = {
  asset,
  mode: 'Standard',
  ltv: 0.8,
  liquidationThreshold: 0.85,
  supplyCap: collateralCap(1000, 2000, 3000, true),
  supplyHeadroomUsd: 3e6,
  newSupplyEnabled: true,
  restrictions: [],
};
const market: Market = {
  protocol: 'Aave',
  version: 'V3',
  asset: { ...asset, symbol: 'WETH' },
  chain: 'Ethereum',
  chainId: 1,
  id: 'aave',
  name: 'Core',
  address: '0xpool',
  collateral: [],
  collateralDetails: [detail],
  liquidityUsd: 6e6,
  borrowCapacityUsd: 4e6,
  totalSupplyUsd: 12e6,
  utilization: 0.75,
  borrowingEnabled: true,
  fetchedAt: '2026-09-08T08:00:00Z',
  rateModel: { kind: 'aave-kink', optimalUtilization: 0.9, baseApr: 0, slope1: 0.04, slope2: 0.5 },
  supplyApy: 0.03,
  borrowApy: 0.04,
  supplyRewardApr: 0,
  borrowRewardApr: 0,
  totalBorrowUsd: 9e6,
  supplyCapacityUsd: null,
  lltv: null,
  listed: true,
  isFrozen: false,
  isPaused: false,
  sourceUrl: '',
  warnings: [],
  historyRef: {},
};

test('Caps distinguish uncapped, zero, missing and reached values without clamping reported usage', () => {
  assert.equal(collateralCap(100, 0, 1, true).status, 'uncapped');
  assert.equal(collateralCap(100, 0, 1, false).status, 'capped');
  assert.equal(collateralCap(100, 0, 1, false).limitUsd, 0);
  assert.equal(collateralCap(100, null, 1, true).status, 'unknown');
  assert.equal(collateralCap(100, 200, null, true).limitUsd, null);
  assert.equal(collateralCap(100, 200, null, true).usedRatio, 0.5);
  assert.equal(collateralCap(210, 200, 1, true).usedRatio, 1.05);
  assert.equal(collateralCap(100, NaN, 1, true).status, 'unknown');
});
test('Collateral assets group by exact address while preserving alternative risk modes', () => {
  const emode = { ...detail, mode: 'eMode 1: ETH', ltv: 0.95, liquidationThreshold: 0.97 };
  const groups = groupCollateral([detail, emode, emode, { ...detail, asset: { ...asset, address: '0x22' } }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].details.length, 2);
});
test('Rate explorer renders the requested facts and cap usage separately from collateralization and utilization', () => {
  const html = renderToStaticMarkup(createElement(MarketDetails, { market }));
  for (const text of [
    'Debt asset',
    'Enabled collateral',
    'Available liquidity',
    'Utilization',
    'wstETH',
    'WETH',
    '$6.00M',
    '$4.00M',
    'LTV 80% / liq. 85%',
    '$3.00M / $6.00M',
    '50% used',
    '75%',
    '/ 100%',
    '90%',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-label="Collateral limits and caps: definition and methodology"'));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(html.includes('role="region"'));
});
test('Additional modes stay inspectable, and unknown caps never imply unlimited supply', () => {
  const html = renderToStaticMarkup(
    createElement(MarketDetails, {
      market: {
        ...market,
        collateralDetails: [
          { ...detail, supplyCap: collateralCap(null, null, null, true), newSupplyEnabled: false },
          { ...detail, mode: 'eMode 1: ETH', ltv: 0.95, liquidationThreshold: 0.97 },
        ],
      },
    }),
  );
  assert.ok(html.includes('1 additional mode'));
  assert.ok(html.includes('LTV 95% / liq. 97%'));
  assert.ok(html.includes('Supply cap: not reported'));
  assert.ok(html.includes('New supply blocked / unverified'));
});
test('Morpho and V4 show their actual LLTV/factor without inventing separate entry LTVs', () => {
  const d = {
    ...detail,
    ltv: null,
    liquidationThreshold: 0.86,
    supplyCap: collateralCap(1000, 0, 3000, true),
  };
  const morpho = renderToStaticMarkup(
    createElement(MarketDetails, {
      market: {
        ...market,
        protocol: 'Morpho',
        version: 'Blue',
        collateralDetails: [{ ...d, mode: 'Isolated market' }],
      },
    }),
  );
  assert.ok(morpho.includes('LLTV 86%'));
  assert.ok(morpho.includes('No protocol collateral cap'));
  assert.ok(!morpho.includes('LTV 86% / liq. 86%'));
  const v4 = renderToStaticMarkup(
    createElement(MarketDetails, {
      market: { ...market, version: 'V4', collateralDetails: [{ ...d, mode: 'Spoke' }] },
    }),
  );
  assert.ok(v4.includes('Collateral factor 86%'));
  assert.ok(v4.includes('Shared hub cash'));
});
test('Collateral filtering follows displayed configuration without widening opportunity collateral', () => {
  const filters = { ...comparisonFilters('Aave'), collateralAsset: '1:' + asset.address };
  assert.equal(filterComparisonMarkets([market], filters).length, 1);
  assert.equal(comparisonOptions([market], filters).collateralAssets.length, 1);
  assert.equal(market.collateral.length, 0);
});
test('A missing old snapshot and an explicitly empty collateral list have distinct messages', () => {
  const old = renderToStaticMarkup(
    createElement(MarketDetails, { market: { ...market, collateralDetails: undefined } }),
  );
  const empty = renderToStaticMarkup(
    createElement(MarketDetails, {
      market: { ...market, collateralDetails: [], borrowApy: null, borrowingEnabled: false },
    }),
  );
  assert.ok(old.includes('not in this cached snapshot'));
  assert.ok(empty.includes('no borrowing leg'));
});
