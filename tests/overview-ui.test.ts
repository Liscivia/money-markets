import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketTable } from '../src/components/MarketTable.js';
import { Overview } from '../src/pages/Overview.js';
import { Rates } from '../src/pages/Rates.js';
import { Opportunities } from '../src/pages/Looping.js';
import LiquidAssetComparison from '../src/components/LiquidAssetComparison.js';
import type { Market } from '../shared/types.js';

const rows = (['Aave', 'Morpho'] as const).map((protocol): Market => ({
  id: protocol,
  protocol,
  version: protocol === 'Aave' ? 'V3' : 'Blue',
  chainId: 1,
  chain: 'Ethereum',
  name: 'USDC',
  address: '0xmarket',
  asset: { address: '0xUSDC', symbol: 'USDC', decimals: 6, priceUsd: 1, nativeApr: null },
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
  fetchedAt: new Date().toISOString(),
  rateObservedAt: new Date().toISOString(),
  warnings: [],
  historyRef: {},
}));
const onHistory = () => {};
test('Overview keeps three capital cards and local table filters without the removed clutter', () => {
  const html = renderToStaticMarkup(
    createElement(Overview, { markets: rows, onHistory, navigate: () => {} }),
  );
  assert.ok(!html.includes('AVG. BORROW APY'));
  assert.equal((html.match(/<article class="capital-card/g) ?? []).length, 3);
  assert.equal((html.match(/class="metric-card/g) ?? []).length, 0);
  for (const title of ['Gross deposits', 'Outstanding debt', 'TVL']) {
    assert.ok(html.includes(`aria-label="${title}: definition and methodology"`));
    assert.ok(html.includes(`aria-label="${title} methodology" hidden=""`));
  }
  for (const removed of [
    'Unborrowed market cash',
    'Why Morpho TVL differs',
    'Open the accounting bridge',
    'HOVER ⓘ FOR THE METHODOLOGY',
    'Search assets or markets',
    'aria-label="Filter network"',
    'aria-label="Filter protocol"',
    'aria-label="Filter asset"',
  ])
    assert.ok(!html.includes(removed), removed);
  for (const label of [
    'Table asset filter',
    'Table protocol filter',
    'Table network filter',
    'Table minimum available liquidity in millions',
    'Table market search',
  ])
    assert.ok(html.includes(`aria-label="${label}"`));
  assert.ok(!html.includes('One snapshot.'));
});
test('One compact table pairs protocols, with a Borrow/Supply switch and accessible methodology', () => {
  const html = renderToStaticMarkup(createElement(LiquidAssetComparison, { markets: rows, onHistory }));
  assert.ok(html.includes('The rates on the assets that matter'));
  assert.equal((html.match(/class="benchmark-table"/g) ?? []).length, 1);
  assert.equal((html.match(/>USDC<\/strong>/g) ?? []).length, 1);
  assert.ok(html.includes('Lowest APY'));
  assert.ok(html.includes('Borrow costs'));
  assert.ok(html.includes('Supply yields'));
  assert.ok(html.includes('exactly the same markets'));
  assert.ok(html.includes('A single qualifying market makes average and extreme identical'));
  assert.ok(!html.includes('liquid-asset-card'));
  assert.ok(html.includes('aria-label="Asset rate comparison network"'));
  for (const title of ['Asset selection', 'Borrow average', 'Borrow lowest', 'Freshness and execution']) {
    assert.ok(html.includes(`aria-label="${title}: definition and methodology"`));
    assert.ok(html.includes(`aria-label="${title} methodology" hidden=""`));
  }
  assert.ok(html.includes('outstanding debt'));
  assert.ok(html.includes('not a guaranteed $5M execution quote'));
  assert.ok(html.includes('one hour old'));
  assert.ok(!html.includes('>—<'));
});

test('Collateral-only assets no longer create empty, misleading protocol comparisons', () => {
  const bigAsset = { ...rows[0].asset, symbol: 'WETH', address: '0xWETH' };
  const mixed = [
    ...rows,
    {
      ...rows[0],
      id: 'weth-aave',
      asset: bigAsset,
      totalSupplyUsd: 100e6,
      borrowingEnabled: false,
      borrowCapacityUsd: 0,
    },
    {
      ...rows[1],
      id: 'usdc-weth',
      collateral: [
        { asset: bigAsset, ltv: 0.8, liquidationThreshold: 0.85, supplyCapacityUsd: null, supplyApy: 0 },
      ],
    },
  ];
  const html = renderToStaticMarkup(createElement(LiquidAssetComparison, { markets: mixed, onHistory }));
  assert.equal((html.match(/>WETH<\/strong>/g) ?? []).length, 0);
  assert.equal((html.match(/>USDC<\/strong>/g) ?? []).length, 1);
  assert.ok(!html.includes('Average gap unavailable'));
});

test('Missing source data is disclosed once and never replaced by fabricated rates or a winning protocol', () => {
  const html = renderToStaticMarkup(
    createElement(LiquidAssetComparison, {
      markets: rows.map((m) => (m.protocol === 'Morpho' ? { ...m, rateObservedAt: null } : m)),
      onHistory,
    }),
  );
  assert.ok(html.includes('Partial source coverage:'));
  assert.ok(html.includes('Morpho USDC 0%'));
  assert.ok(html.includes('Awaiting source'));
  assert.ok(html.includes('Incomplete coverage'));
  assert.ok(!html.includes('bps on average'));
});
test('Explore table exposes all requested controls with accessible labels', () => {
  const html = renderToStaticMarkup(createElement(MarketTable, { markets: rows, onHistory }));
  for (const label of [
    'Table asset filter',
    'Table protocol filter',
    'Table network filter',
    'Table minimum available liquidity in millions',
    'Table market search',
  ])
    assert.ok(html.includes(`aria-label="${label}"`));
  assert.ok(html.includes('2 of 2 markets'));
  assert.ok(html.includes('Reset'));
});

test('Comparison controls are independent and each market dropdown contains only its selected protocol', () => {
  for (const initialMarket of ['', 'Morpho']) {
    const html = renderToStaticMarkup(createElement(Rates, { markets: rows, initialMarket }));
    for (const side of ['First', 'Second'])
      for (const field of ['protocol', 'network', 'debt asset', 'collateral asset'])
        assert.ok(html.includes(`aria-label="${side} market ${field} filter"`));
    for (const i of [0, 1]) {
      const expected = (initialMarket === 'Morpho' ? ['Morpho', 'Aave'] : ['Aave', 'Morpho'])[i];
      const options = html.match(
        new RegExp(`<select[^>]*id="market-${i}"[^>]*>([\\s\\S]*?)<\\/select>`),
      )?.[1];
      assert.ok(options);
      assert.ok(options.includes(`value="${expected}"`));
      assert.ok(!options.includes(`value="${expected === 'Aave' ? 'Morpho' : 'Aave'}"`));
    }
  }
});
test('Official-market links occur only in the comparison selectors, never below rates-over-time', () => {
  const linkable = rows.map((m) => ({
    ...m,
    address: m.protocol === 'Aave' ? '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' : `0x${'a'.repeat(64)}`,
    asset: { ...m.asset, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  }));
  const html = renderToStaticMarkup(createElement(Rates, { markets: linkable, initialMarket: '' }));
  assert.equal((html.match(/class="market-external-link"/g) ?? []).length, 2);
  assert.ok(!html.slice(html.indexOf('Rates over time')).includes('class="market-external-link"'));
});
test('Opportunity amount controls use $5M placeholders but accept smaller manual values', () => {
  const html = renderToStaticMarkup(createElement(Opportunities, { markets: rows, onHistory }));
  assert.equal((html.match(/placeholder="5000000"/g) ?? []).length, 2);
  assert.ok(!html.includes('min="5000000"'));
  for (const label of ['Debt size in dollars', 'Minimum liquidity in dollars']) {
    const input = html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))?.[0];
    assert.ok(input?.includes('min="1"'));
    assert.ok(input?.includes('step="any"'));
    assert.ok(input?.includes('value=""'));
  }
  assert.ok(html.includes('Requested loop leverage'));
  assert.ok(html.includes('health factor at least 1.20'));
  for (const title of ['Requested loop leverage', 'Debt to deploy', 'Minimum market liquidity']) {
    assert.ok(html.includes(`aria-label="${title}: definition and methodology"`));
  }
});
