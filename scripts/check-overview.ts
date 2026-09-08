import { totalLiquidity } from '../shared/metrics.js';
import { comparisonAssets, rateQuote } from '../shared/overview.js';
import { fetchLiquidityBenchmarks, fetchProtocolCapital, fetchCompetition } from '../server/competition.js';
import { indexedCapital } from '../shared/protocol-capital.js';
import type { Snapshot } from '../shared/types.js';

// Public source cross-check. The target may be local or the deployed dashboard.
const base = process.env.MONEY_MARKETS_URL ?? 'http://localhost:3100';
const snapshotResponse = await fetch(base + '/api/snapshot', { signal: AbortSignal.timeout(280_000) });
if (!snapshotResponse.ok) throw Error('Dashboard snapshot unavailable');
const snapshot = (await snapshotResponse.json()) as Snapshot;
const response = await fetch('https://yields.llama.fi/pools', { signal: AbortSignal.timeout(25_000) });
if (!response.ok) throw Error(`DefiLlama pools: HTTP ${response.status}`);
type LlamaPool = {
  project: string;
  chain: string;
  underlyingTokens?: string[];
  poolMeta: string | null;
  tvlUsd: number;
  pool: string;
};
const pools = ((await response.json()) as { data: LlamaPool[] }).data;
const aliases: Record<string, string> = { BSC: 'Binance', Gnosis: 'xDai', zkSync: 'zkSync Era' };
const matched = snapshot.markets
  .filter((m) => m.protocol === 'Aave' && m.version === 'V3')
  .flatMap((m) => {
    const meta =
      m.name === 'Ethereum Lido'
        ? 'Prime Instance'
        : m.name === 'Ethereum Horizon'
          ? 'Aave Horizon Market'
          : m.name === 'Ethereum Ether Fi'
            ? 'Legacy'
            : null;
    const candidates = pools.filter(
      (p) =>
        p.project === 'aave-v3' &&
        p.chain === (aliases[m.chain] ?? m.chain) &&
        p.underlyingTokens?.length === 1 &&
        p.underlyingTokens[0].toLowerCase() === m.asset.address.toLowerCase() &&
        p.poolMeta === meta,
    );
    if (candidates.length !== 1) return []; // Never merge ambiguous pools sharing a ticker.
    const match = candidates[0];
    return [
      {
        marketId: m.id,
        chain: m.chain,
        asset: m.asset.symbol,
        poolName: m.name,
        apiCashUsd: m.liquidityUsd,
        llamaCashUsd: match.tvlUsd,
        deviationPercent: match.tvlUsd > 0 ? 100 * (m.liquidityUsd / match.tvlUsd - 1) : null,
        llamaPool: match.pool,
      },
    ];
  });
const groups = [
  { protocol: 'Aave', version: 'V3' },
  { protocol: 'Aave', version: 'V4' },
  { protocol: 'Morpho', version: 'Blue' },
];
const capital = await fetchProtocolCapital();
const history = await fetchCompetition(30);
const last = history.points.at(-1);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      snapshotAt: snapshot.fetchedAt,
      providers: snapshot.providers,
      totals: groups.map((g) => {
        const rows = snapshot.markets.filter((m) => m.protocol === g.protocol && m.version === g.version);
        return {
          ...g,
          count: rows.length,
          suppliedUsd: rows.reduce((s, m) => s + m.totalSupplyUsd, 0),
          debtUsd: rows.reduce((s, m) => s + m.totalBorrowUsd, 0),
          cashUsd: totalLiquidity(rows),
          sharedGroups: new Set(rows.map((m) => m.liquidityGroupId).filter(Boolean)).size,
        };
      }),
      defiLlama: await fetchLiquidityBenchmarks(),
      capitalComparison: capital.protocols,
      capitalChartCheck: capital.protocols.map((p) => ({
        protocol: p.protocol,
        grossIdentityResidualUsd:
          p.depositsUsd === null || p.tvlUsd === null || p.debtUsd === null
            ? null
            : p.depositsUsd - p.tvlUsd - p.debtUsd,
        networkTvlSumUsd: capital.networks.reduce(
          (s, n) => s + (n.protocols.find((row) => row.protocol === p.protocol)?.tvlUsd ?? 0),
          0,
        ),
        lastHistoryTvlUsd: p.protocol === 'Aave' ? last?.aaveTvl : last?.morphoTvl,
        lastHistoryDepositsUsd: p.protocol === 'Aave' ? last?.aaveDeposits : last?.morphoDeposits,
      })),
      indexedAccountingBridge: indexedCapital(snapshot.markets, 'Morpho'),
      reserveCheck: {
        matched: matched.length,
        cashUsd: matched.reduce((s, m) => s + m.apiCashUsd, 0),
        llamaCashUsd: matched.reduce((s, m) => s + m.llamaCashUsd, 0),
        largeDifferences: matched.filter(
          (m) => m.apiCashUsd >= 5e6 && m.deviationPercent !== null && Math.abs(m.deviationPercent) > 5,
        ),
        largest: [...matched].sort((a, b) => b.apiCashUsd - a.apiCashUsd).slice(0, 10),
        caveat:
          'Aave reserve matches use protocol, chain, underlying address and pool metadata. Not block-synchronous; differences are reported, not asserted to be errors. Morpho yield pools are not treated as exact Blue market IDs.',
      },
      liquidAssets: comparisonAssets(snapshot.markets).map((row) => ({
        key: row.key,
        symbol: row.symbol,
        chain: row.chain,
        liquidityUsd: row.liquidity,
        rates: (['Aave', 'Morpho'] as const).map((protocol) => ({
          protocol,
          borrowAvg: rateQuote(
            row.markets.filter((m) => m.protocol === protocol),
            'borrowApy',
            'average',
          ).rate,
          borrowLowest: rateQuote(
            row.markets.filter((m) => m.protocol === protocol),
            'borrowApy',
            'best',
          ).rate,
          supplyAvg: rateQuote(
            row.markets.filter((m) => m.protocol === protocol),
            'supplyApy',
            'average',
          ).rate,
          supplyHighest: rateQuote(
            row.markets.filter((m) => m.protocol === protocol),
            'supplyApy',
            'best',
          ).rate,
        })),
      })),
    },
    null,
    2,
  ),
);
