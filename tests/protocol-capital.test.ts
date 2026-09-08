import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildProtocolCapital, protocolCapital, type RawProtocol } from '../server/competition.js';
import {
  capitalShares,
  indexedCapital,
  sumKnown,
  capitalHistoryStats,
  type CapitalHistoryPoint,
} from '../shared/protocol-capital.js';
import { ProtocolCapitalView } from '../src/components/ProtocolOverview.js';
import type { Market } from '../shared/types.js';

const at = 1788849299;
const point = (value: number, date = at) => ({ date, totalLiquidityUSD: value });
const source = (name: string, tvl: number, debt: number, chain = 'Ethereum'): RawProtocol => ({
  name,
  tvl: [point(tvl)],
  chainTvls: {
    borrowed: { tvl: [point(debt)] },
    [chain]: { tvl: [point(tvl)] },
    [chain + '-borrowed']: { tvl: [point(debt)] },
  },
});
const raw = [source('V3', 100e6, 50e6), source('V4', 20e6, 10e6), source('Blue', 80e6, 40e6)];
const row = (protocol: 'Aave' | 'Morpho', patch: Partial<Market> = {}): Market => ({
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
  fetchedAt: '2026-09-08T07:00:00Z',
  warnings: [],
  historyRef: {},
  ...patch,
});

test('Capital cards derive gross deposits from one source family, including Morpho collateral via TVL', () => {
  const [aave, morpho] = protocolCapital(raw, 'all');
  assert.equal(aave.tvlUsd, 120e6);
  assert.equal(aave.debtUsd, 60e6);
  assert.equal(aave.depositsUsd, 180e6);
  assert.equal(morpho.tvlUsd, 80e6);
  assert.equal(morpho.debtUsd, 40e6);
  assert.equal(morpho.depositsUsd, 120e6);
  assert.deepEqual(capitalShares([aave.depositsUsd, morpho.depositsUsd]), [0.6, 0.4]);
});
test('An unavailable component invalidates the combined protocol, not just the failed share', () => {
  for (const chain of ['all', 'Ethereum']) {
    const [aave, morpho] = protocolCapital([raw[0], null, raw[2]], chain);
    assert.equal(aave.depositsUsd, null);
    assert.equal(aave.tvlUsd, null);
    assert.equal(morpho.tvlUsd, 80e6);
    assert.equal(capitalShares([aave.tvlUsd, morpho.tvlUsd]), null);
  }
});
test('Unreported chains stay unknown and partial Aave coverage is disclosed', () => {
  const data = buildProtocolCapital([source('V3', 1e6, 2e6, 'Binance'), raw[1], raw[2]], 'BSC', 'now');
  assert.equal(data.protocols[0].depositsUsd, 3e6);
  assert.equal(data.protocols[1].tvlUsd, null);
  assert.equal(data.warnings.filter((w) => w.includes('not reported')).length, 2);
  assert.equal(data.networks.length, 1);
  assert.equal(protocolCapital(raw, 'Arc')[0].tvlUsd, null);
});
test('Gross deposits cannot combine mismatched TVL and debt observations', () => {
  const mismatch = structuredClone(raw);
  mismatch[2].chainTvls.borrowed.tvl![0].date -= 3600;
  const data = buildProtocolCapital(mismatch, 'all', 'now');
  assert.equal(data.protocols[1].depositsUsd, null);
  assert.equal(data.protocols[1].tvlUsd, 80e6);
  assert.ok(data.warnings.some((w) => w.includes('timestamps differ')));
});
test('Network bars exclude borrowed/other accounting buckets without dropping real hyphenated networks', () => {
  const copy = structuredClone(raw);
  copy[0].chainTvls.staking = { tvl: [point(900e6)] };
  copy[0].chainTvls['Ethereum-pool2'] = { tvl: [point(900e6)] };
  copy[0].chainTvls['Test-Network'] = { tvl: [point(10e6)] };
  copy[0].chainTvls['Test-Network-borrowed'] = { tvl: [point(5e6)] };
  const data = buildProtocolCapital(copy, 'all', 'now');
  assert.deepEqual(
    data.networks.map((n) => n.chain),
    ['Ethereum', 'Test-Network'],
  );
  const eth = data.networks[0].protocols;
  assert.equal(eth[0].depositsUsd, data.protocols[0].depositsUsd);
  assert.equal(eth[1].depositsUsd, data.protocols[1].depositsUsd);
});
test('Missing prices/collateral remain incomplete rather than pretending the API subtotal is TVL', () => {
  const rows = [
    row('Morpho', { segregatedCollateralUsd: 30e6 }),
    row('Morpho', { id: 'unpriced', segregatedCollateralUsd: null }),
  ];
  const summary = indexedCapital(rows, 'Morpho');
  assert.equal(summary.reportedCollateralUsd, 30e6);
  assert.equal(summary.missingCollateral, 1);
  assert.equal(summary.supplyUsd, 40e6);
  assert.equal(summary.cashUsd, 20e6);
  assert.equal(summary.heldAssetsSubtotalUsd, 50e6);
  assert.equal(indexedCapital([], 'Morpho').cashUsd, null);
});

test('A real upstream global-versus-chain residual is disclosed, not silently rebased or ignored', () => {
  const copy = structuredClone(raw);
  copy[2].chainTvls.Ethereum.tvl![0].totalLiquidityUSD += 32e6;
  const data = buildProtocolCapital(copy, 'all', 'now');
  assert.equal(data.protocols[1].tvlUsd, 80e6);
  assert.equal(data.networks[0].protocols[1].tvlUsd, 112e6);
  assert.equal(
    data.networkReconciliation.find((r) => r.protocol === 'Morpho' && r.metric === 'tvlUsd')?.differenceUsd,
    32e6,
  );
  assert.equal(data.warnings.filter((w) => w.includes('source reconciliation')).length, 1);
  assert.ok(data.warnings.some((w) => w.includes('above its global series')));
});
test('Indexed Aave cash de-duplicates hubs and never adds collateral options or replaces cash with deposits minus debt', () => {
  const rows = [
    row('Aave', { liquidityGroupId: 'hub', liquidityGroupUsd: 12e6 }),
    row('Aave', { id: 'spoke2', liquidityGroupId: 'hub', liquidityGroupUsd: 12e6 }),
  ];
  const summary = indexedCapital(rows, 'Aave');
  assert.equal(summary.cashUsd, 12e6);
  assert.equal(summary.reportedCollateralUsd, 0);
  assert.equal(summary.supplyUsd, 40e6);
  assert.equal(summary.debtUsd, 20e6);
});
test('No synthetic shares for zero/missing/invalid denominators', () => {
  for (const values of [
    [null, 10],
    [0, 0],
    [NaN, 10],
    [-1, 10],
  ])
    assert.equal(capitalShares(values), null);
  assert.deepEqual(capitalShares([0, 10]), [0, 1]);
  assert.equal(sumKnown([]), null);
});
test('API diagnostics retain reported cash and residual without adding overview panels', () => {
  const market = row('Morpho', { liquidityUsd: 9.9e6, segregatedCollateralUsd: 30e6 });
  const result = indexedCapital([market], 'Morpho');
  assert.equal(result.cashUsd, 9.9e6);
  assert.equal(result.loanCashResidualUsd, 100000);
  const html = renderToStaticMarkup(
    createElement(ProtocolCapitalView, { data: null, chain: 'all', metric: 'tvlUsd', onMetric: () => {} }),
  );
  assert.ok(!html.includes('API loan-book residual'));
  assert.ok(!html.includes('$100.00K'));
});
test('History growth reports its actual observed window and preserves a zero ending balance', () => {
  const point = (timestamp: number, value: number | null): CapitalHistoryPoint => ({
    timestamp,
    aaveTvl: value,
    morphoTvl: null,
    aaveBorrowed: null,
    morphoBorrowed: null,
    aaveDeposits: null,
    morphoDeposits: null,
  });
  const [aave, morpho] = capitalHistoryStats(
    [point(100, null), point(200, 10), point(300, 0), point(400, null)],
    'tvlUsd',
  );
  assert.equal(aave.firstAt, 200);
  assert.equal(aave.lastAt, 300);
  assert.equal(aave.latest, 0);
  assert.equal(aave.change, -100);
  assert.equal(morpho.latest, null);
  assert.equal(morpho.change, null);
});
test('Rendered capital cards use source totals and keep individual methodology tiles', () => {
  const html = renderToStaticMarkup(
    createElement(ProtocolCapitalView, {
      data: buildProtocolCapital(raw, 'all', 'now'),
      chain: 'all',
      metric: 'depositsUsd',
      onMetric: () => {},
    }),
  );
  const cards = html.match(/<article class="capital-card[\s\S]*?<\/article>/g)!;
  assert.equal(cards.length, 3);
  assert.ok(cards[0].includes('$180.00M'));
  assert.ok(cards[0].includes('$120.00M'));
  assert.ok(cards[0].includes('60.0%'));
  assert.ok(cards[0].includes('40.0%'));
  for (const card of cards) {
    assert.ok(card.includes('Aave'));
    assert.ok(card.includes('Morpho'));
    assert.ok(card.includes('aria-expanded="false"'));
    assert.ok(card.includes('aria-controls='));
    assert.ok(card.includes('role="dialog"'));
  }
  assert.ok(html.includes('Gross deposits share'));
  assert.ok(html.includes('Gross deposits by network'));
  assert.ok(html.includes('Gross deposits over time'));
  assert.ok(html.includes('standardized proxy'));
  assert.ok(!html.includes('capital-reconciliation'));
});

test('Overview removes reconciliation warnings and the bridge, without changing source totals', () => {
  const copy = structuredClone(raw);
  copy[2].chainTvls.Ethereum.tvl![0].totalLiquidityUSD += 32e6;
  const data = buildProtocolCapital(copy, 'all', 'now');
  assert.ok(data.warnings.some((w) => w.includes('source reconciliation')));
  const html = renderToStaticMarkup(
    createElement(ProtocolCapitalView, { data, chain: 'all', metric: 'tvlUsd', onMetric: () => {} }),
  );
  for (const removed of [
    'capital-warning',
    'capital-reconciliation',
    'accounting-bridge',
    'Unborrowed market cash',
    'source reconciliation',
    'API loan deposits',
    'API loan cash',
    'Reported collateral',
    'Indexed held-assets subtotal',
  ])
    assert.ok(!html.includes(removed), removed);
  assert.equal(data.protocols[1].tvlUsd, 80e6);
  assert.equal(data.networks[0].protocols[1].tvlUsd, 112e6);
  assert.ok(html.includes('$80.00M'));
});

test('Actual source failures remain visible and do not turn missing values into zero', () => {
  const html = renderToStaticMarkup(
    createElement(ProtocolCapitalView, {
      data: null,
      chain: 'all',
      metric: 'tvlUsd',
      onMetric: () => {},
      error: 'Protocol totals unavailable',
    }),
  );
  assert.ok(html.includes('Protocol totals unavailable'));
  assert.ok(html.includes('class="notice error" role="status"'));
  assert.ok(!html.includes('$0'));
});
test('All three chart modes share their metric label and do not fabricate loading values', () => {
  for (const [metric, label] of [
    ['tvlUsd', 'TVL'],
    ['debtUsd', 'Outstanding debt'],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(ProtocolCapitalView, {
        data: null,
        chain: 'Arc',
        metric,
        onMetric: () => {},
        loading: false,
      }),
    );
    assert.ok(html.includes(`${label} share`));
    assert.ok(html.includes(`${label} by network`));
    assert.ok(html.includes(`${label} over time`));
    assert.ok(html.includes('Two complete values are required'));
    assert.ok(!html.includes('$0'));
  }
});
