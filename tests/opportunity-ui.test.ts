import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { Opportunity } from '../shared/types.js';
import { LeverageInfo, OpportunityBreakdown } from '../src/components/OpportunityInsights.js';
import { NAV } from '../src/lib/navigation.js';

const loop: Opportunity = {
  id: 'test-loop',
  type: 'native-loop',
  title: 'wstETH / WETH',
  chainId: 1,
  chain: 'Ethereum',
  borrowMarketId: 'test',
  borrowProtocol: 'Aave',
  lendProtocol: 'Native',
  collateralSymbol: 'wstETH',
  debtSymbol: 'WETH',
  nativeApr: 0.04,
  lendingApr: 0,
  borrowApr: 0.02,
  spreadApr: 0.02,
  leverage: 4.8,
  targetLtv: 0.95 / 1.2,
  liquidationThreshold: 0.95,
  healthFactor: 1.2,
  grossReturnOnEquity: 0.192,
  netReturnOnEquity: 0.116,
  borrowLiquidityUsd: 20e6,
  capacityUsd: 20e6,
  equityUsd: 5e6 / 3.8,
  exposureUsd: 5e6 + 5e6 / 3.8,
  collateralUsd: 5e6 + 5e6 / 3.8,
  debtUsd: 5e6,
  externalSupplyUsd: 0,
  collateralLendingApr: 0,
  modeledLendingApr: 0,
  leveragePolicy: {
    requested: 10,
    minHealthFactor: 1.2,
    protocolMaxLtv: 0.93,
    collateralMode: 'ETH eMode',
    limitingFactor: 'health-factor',
  },
  modeledBorrowApr: 0.021,
  modeledNetReturnOnEquity: 0.1122,
  assumptions: ['Source and modeling limitations'],
  eligible: true,
  exclusionReasons: [],
};

test('Loop details reconcile equity plus debt to posted collateral and explain the binding cap', () => {
  const html = renderToStaticMarkup(createElement(OpportunityBreakdown, { op: loop }));
  for (const text of [
    'Your equity',
    'Borrowed capital',
    'Total posted collateral',
    '$1.32M',
    '$5M',
    '$6.32M',
    '10.00× requested → 4.80× applied',
    'HF 1.20 buffer',
    'Borrow APR at size',
    'Incremental spread',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Collateral exposure'));
  assert.ok(html.includes('aria-label="Applied leverage: definition and methodology"'));
  assert.ok(html.includes('not a profitability ceiling'));
  assert.ok(html.includes('98% of the protocol limit'));
});

test('Carry details never label separately lent capital as posted collateral or recursive leverage', () => {
  const carry: Opportunity = {
    ...loop,
    type: 'same-asset-carry',
    lendProtocol: 'Morpho',
    lendMarketId: 'lend',
    debtSymbol: 'USDC',
    collateralSymbol: 'sUSDe',
    leverage: 1.8,
    targetLtv: 0.8,
    equityUsd: 6.25e6,
    collateralUsd: 6.25e6,
    externalSupplyUsd: 5e6,
    exposureUsd: 11.25e6,
  };
  const html = renderToStaticMarkup(createElement(OpportunityBreakdown, { op: carry }));
  for (const text of [
    'Borrowed and lent elsewhere',
    'Total gross assets',
    'Posted collateral: $6.25M',
    'External lending: $5M',
    '$11.25M',
    'Separate collateral, no recursive leverage',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Total posted collateral'));
  const leverage = renderToStaticMarkup(createElement(LeverageInfo, { op: carry }));
  assert.ok(leverage.includes('1 + LTV = 1.80×'));
});

test('Unknown size impact remains explicit and assumptions are collapsed without approval ticks', () => {
  const html = renderToStaticMarkup(
    createElement(OpportunityBreakdown, {
      op: { ...loop, modeledBorrowApr: null, modeledNetReturnOnEquity: null, modeledLendingApr: null },
    }),
  );
  assert.ok(html.includes('Not modeled'));
  assert.ok(html.includes('<details><summary>Model assumptions and sources'));
  assert.ok(!html.includes('lucide-check'));
});

test('Looping navigation keeps the existing route and removes the marketing label', () => {
  const source = ['../src/lib/navigation.ts', '../src/pages/Looping.tsx']
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');
  assert.equal(NAV.find((item) => item.id === 'opportunities')?.label, 'Looping');
  assert.ok(!source.includes('FIND EDGE'));
  assert.ok(!source.includes('Find your next edge.'));
  assert.ok(source.includes('Parameters changed — showing the last scan'));
});
