import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { marketUrl } from '../../shared/market-links';
import {
  comparisonAssets,
  comparisonNetworks,
  defaultComparisonChain,
  quoteAccess,
  rateQuote,
  type RateQuote,
  type RateSide,
} from '../../shared/overview';
import type { Market, Protocol } from '../../shared/types';
import InfoTile from './InfoTile';

const money = (n: number | null) =>
  n === null || !Number.isFinite(n)
    ? 'Not reported'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(n);
export const ratePercent = (n: number | null) =>
  n === null ? 'Unavailable' : n > 0 && n < 0.0001 ? '<0.01%' : `${(n * 100).toFixed(2)}%`;
const colors = { Aave: '#b4a0ff', Morpho: '#69e4d3' };
const protocols = ['Aave', 'Morpho'] as const;
const clock = (n: number) =>
  new Date(n).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
type AssetRow = ReturnType<typeof comparisonAssets>[number];

function RateHelp({ side, best = false }: { side: RateSide; best?: boolean }) {
  const name = side === 'borrowApy' ? 'Borrow' : 'Supply';
  return (
    <InfoTile title={`${name} ${best ? (side === 'borrowApy' ? 'lowest' : 'highest') : 'average'}`}>
      <p>
        {best
          ? `${side === 'borrowApy' ? 'Lowest borrow' : 'Highest supply'} APY in exactly the same markets used for the average.`
          : `Market APYs weighted by ${side === 'borrowApy' ? 'outstanding debt' : 'supplied loan assets'}. Bigger lending books matter more. An average across markets, not over time.`}
      </p>
      <p>
        Each market needs $5M supplied and $1M borrowed. The cash filter applies to average and extreme alike.
        Source observations up to 1h old are included; older or unknown observations are excluded.
      </p>
      <p>
        {best
          ? 'Cash beneath the rate belongs to that one market. Caps, access and collateral still matter. A benchmark, not a guaranteed $5M execution quote.'
          : 'Aave V3 and Morpho Blue, on the same network. V4 remains in Explore; its collateral-specific borrow premiums are not comparable here.'}
      </p>
    </InfoTile>
  );
}

function ProtocolBreakdown({
  protocol,
  rows,
  side,
  onHistory,
}: {
  protocol: Protocol;
  rows: Market[];
  side: RateSide;
  onHistory: (id: string) => void;
}) {
  const avg = rateQuote(rows, side, 'average'),
    best = rateQuote(rows, side, 'best');
  const [showAll, setShowAll] = useState(false);
  const ordered = [...avg.markets].sort((a, b) => b.totalBorrowUsd - a.totalBorrowUsd);
  const visible = showAll
    ? ordered
    : [
        ...new Map(
          [...ordered.slice(0, 4), ...(best.representative ? [best.representative] : [])].map((m) => [
            m.id,
            m,
          ]),
        ).values(),
      ];
  return (
    <div className="benchmark-book">
      <div className="benchmark-book-title">
        <strong style={{ color: colors[protocol] }}>
          {protocol} {protocol === 'Aave' ? 'V3' : 'Blue'}
        </strong>
        <span>
          {avg.count} {avg.count === 1 ? 'market' : 'markets'} · {Math.round(avg.coverage * 100)}% book
          coverage
        </span>
      </div>
      <div className="benchmark-book-stats">
        <div>
          <small>Borrowed</small>
          <strong>{money(avg.borrowed)}</strong>
        </div>
        <div>
          <small>Supplied</small>
          <strong>{money(avg.supplied)}</strong>
        </div>
        <div>
          <small>Utilization</small>
          <strong>{ratePercent(avg.utilization)}</strong>
        </div>
      </div>
      <p className="benchmark-policy">
        {protocol === 'Aave'
          ? 'Collateral shares a reserve. Governance sets its rate curve, caps and risk parameters.'
          : 'Each collateral / LLTV has its own lending market. Adaptive rates respond to that market’s utilization.'}
      </p>
      {avg.count > 0 && (
        <p className="benchmark-observed">
          Observed: {clock(avg.oldest!)}
          {avg.newest! - avg.oldest! >= 60_000 ? `–${clock(avg.newest!)}` : ''} UTC · {ratePercent(avg.low)}–
          {ratePercent(avg.high)} APY range
        </p>
      )}
      <div className="benchmark-market-list">
        {visible.map((m) => {
          const isBest = m.id === best.representative?.id,
            url = marketUrl(m),
            access = quoteAccess(m, side);
          return (
            <div className="benchmark-market" key={m.id}>
              <div>
                <button
                  type="button"
                  onClick={() => onHistory(m.id)}
                  aria-label={`Explore ${protocol} ${m.name}`}
                  className="benchmark-history"
                >
                  {m.name}
                  {m.protocol === 'Morpho' && m.lltv !== null ? ` · ${(m.lltv * 100).toFixed(1)}% LLTV` : ''}
                  <ArrowUpRight size={12} />
                </button>
                <small>
                  {money(m.totalBorrowUsd)} debt · {money(m.liquidityUsd)} cash{access ? ` · ${access}` : ''}
                </small>
              </div>
              <div className="benchmark-market-rate">
                <strong>{ratePercent(m[side])}</strong>
                <small>{isBest ? (side === 'borrowApy' ? 'Lowest' : 'Highest') : ''}</small>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${protocol} ${m.name} market`}
                  >
                    Open market ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {ordered.length > visible.length && (
        <button type="button" className="benchmark-more" onClick={() => setShowAll(true)}>
          Show all {ordered.length} markets
        </button>
      )}
      {showAll && ordered.length > 4 && (
        <button type="button" className="benchmark-more" onClick={() => setShowAll(false)}>
          Show fewer markets
        </button>
      )}
      {avg.excluded.length > 0 && (
        <p className="benchmark-observed">
          Excluded: {avg.excluded.map((e) => `${e.count} ${e.reason.toLowerCase()}`).join('; ')}.
        </p>
      )}
    </div>
  );
}

function QuoteCell({
  quote,
  best,
  protocol,
  side,
}: {
  quote: RateQuote;
  best?: boolean;
  protocol: Protocol;
  side: RateSide;
}) {
  const restriction = best && quote.representative ? quoteAccess(quote.representative, side) : null;
  return (
    <td className={`benchmark-number ${best ? 'benchmark-extreme' : ''}`}>
      {quote.rate === null ? (
        <span className="benchmark-unavailable">Awaiting source</span>
      ) : (
        <>
          <strong style={best ? { color: colors[protocol] } : undefined}>{ratePercent(quote.rate)}</strong>
          <small>
            {best
              ? `${money(quote.representative.liquidityUsd)} cash`
              : `${quote.count} ${quote.count === 1 ? 'market' : 'markets'}`}
          </small>
          {restriction && /Restricted|Closed|disabled/.test(restriction) && (
            <small className="benchmark-restricted">{restriction}</small>
          )}
        </>
      )}
    </td>
  );
}

function ComparisonRow({
  asset,
  side,
  open,
  onToggle,
  onHistory,
}: {
  asset: AssetRow;
  side: RateSide;
  open: boolean;
  onToggle: () => void;
  onHistory: (id: string) => void;
}) {
  const values = protocols.map((protocol) => ({
    protocol,
    rows: asset.markets.filter((m) => m.protocol === protocol),
  }));
  const quotes = values.map((v) => ({
    average: rateQuote(v.rows, side, 'average'),
    best: rateQuote(v.rows, side, 'best'),
  }));
  const comparable = quotes.every((q) => q.average.rate !== null && q.average.coverage >= 0.8);
  const gap = comparable ? quotes[0].average.rate! - quotes[1].average.rate! : null;
  const winner = gap !== null && (side === 'borrowApy' ? gap > 0 : gap < 0) ? 'Morpho' : 'Aave';
  return (
    <Fragment>
      <tr className={open ? 'benchmark-selected' : ''}>
        <th scope="row">
          <button
            type="button"
            className="benchmark-asset"
            aria-label={`Inspect ${asset.symbol} markets`}
            aria-expanded={open}
            onClick={onToggle}
          >
            <span className="asset-symbol">{asset.symbol.slice(0, 2)}</span>
            <span>
              <strong>{asset.symbol}</strong>
              <small>{money(asset.borrowed)} borrowed</small>
            </span>
            <ChevronDown size={14} className={open ? 'rotated' : ''} />
          </button>
        </th>
        {quotes.map((q, i) => (
          <Fragment key={protocols[i]}>
            <QuoteCell quote={q.average} protocol={protocols[i]} side={side} />
            <QuoteCell quote={q.best} protocol={protocols[i]} side={side} best />
          </Fragment>
        ))}
        <td className="benchmark-gap">
          {gap === null ? (
            <small>Incomplete coverage</small>
          ) : Math.abs(gap) < 0.00005 ? (
            <span>Within 1 bp</span>
          ) : (
            <>
              <strong style={{ color: colors[winner] }}>
                {winner} {side === 'borrowApy' ? 'cheaper' : 'higher'}
              </strong>
              <small>{Math.abs(gap * 10_000).toFixed(0)} bps on average</small>
            </>
          )}
        </td>
      </tr>
      {open && (
        <tr className="benchmark-detail-row">
          <td colSpan={6}>
            <div className="benchmark-detail-title">
              <strong>Inside {asset.symbol}</strong>
              <span>Balances, utilization and collateral mix.</span>
              <InfoTile title="How to read the comparison">
                <p>
                  Utilization is included debt ÷ included supply. The APY range is the lowest to highest
                  included quote. Coverage is included balance ÷ balance in all size-qualified markets.
                </p>
                <p>
                  Rates reflect demand, collateral risk, fees and each rate model—not policy alone. This is
                  not a risk-matched comparison.
                </p>
                <p>
                  <a
                    href="https://aave.com/docs/aave-v3/smart-contracts/interest-rate-strategy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Aave: configured utilization curve ↗
                  </a>
                  <br />
                  <a
                    href="https://docs.morpho.org/developers/contracts/irm/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Morpho: adaptive model and 90% target ↗
                  </a>
                </p>
              </InfoTile>
            </div>
            <div className="benchmark-books">
              {values.map((v) => (
                <ProtocolBreakdown
                  key={`${asset.key}:${v.protocol}:${side}`}
                  {...v}
                  side={side}
                  onHistory={onHistory}
                />
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function LiquidAssetComparison({
  markets,
  onHistory,
}: {
  markets: Market[];
  onHistory: (id: string) => void;
}) {
  const [liquidOnly, setLiquidOnly] = useState(true);
  const networks = useMemo(
    () =>
      comparisonNetworks(markets)
        .map((n) => ({
          ...n,
          allAssets: comparisonAssets(markets, 6, n.id),
          assets: comparisonAssets(markets, 6, n.id, liquidOnly ? 5e6 : 0),
        }))
        .filter((n) => n.allAssets.length),
    [markets, liquidOnly],
  );
  const [selectedChain, setSelectedChain] = useState(() => defaultComparisonChain(markets));
  const [side, setSide] = useState<RateSide>('borrowApy');
  const [expanded, setExpanded] = useState<string | null>(null);
  const network = networks.find((n) => n.id === selectedChain) ?? networks[0],
    assets = network?.assets ?? [];
  const omitted =
    network?.allAssets.filter((a) => !assets.some((b) => b.key === a.key)).map((a) => a.symbol) ?? [];
  const summaries = assets.flatMap((a) =>
    protocols.map((p) => ({
      asset: a.symbol,
      protocol: p,
      quote: rateQuote(
        a.markets.filter((m) => m.protocol === p),
        side,
        'average',
      ),
    })),
  );
  const delayed = summaries.filter((s) => s.quote.coverage < 0.95),
    oldest = summaries.flatMap((s) => (s.quote.oldest === null ? [] : [s.quote.oldest]));
  return (
    <section className="panel benchmark-panel liquid-comparisons" aria-label="Key asset rate comparison">
      <div className="benchmark-heading">
        <div>
          <h2>The rates on the assets that matter</h2>
          <p>Same asset. Same network. Meaningful lending markets on both protocols.</p>
        </div>
        <label className="rate-network-select">
          Network
          <select
            aria-label="Asset rate comparison network"
            value={network?.id ?? ''}
            onChange={(e) => {
              setSelectedChain(Number(e.target.value));
              setExpanded(null);
            }}
          >
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} · {n.assets.length} {n.assets.length === 1 ? 'asset' : 'assets'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="benchmark-toolbar">
        <div className="benchmark-tabs" role="group" aria-label="Compare rate side">
          <button type="button" aria-pressed={side === 'borrowApy'} onClick={() => setSide('borrowApy')}>
            Borrow costs
          </button>
          <button type="button" aria-pressed={side === 'supplyApy'} onClick={() => setSide('supplyApy')}>
            Supply yields
          </button>
        </div>
        <label className="benchmark-cash-filter">
          <input
            type="checkbox"
            aria-label="Only markets with at least $5M cash"
            checked={liquidOnly}
            onChange={(e) => {
              setLiquidOnly(e.target.checked);
              setExpanded(null);
            }}
          />
          $5M+ cash per market
        </label>
        <div className="benchmark-selection">
          {assets.length} shared assets{omitted.length ? ` · ${omitted.length} below cash cutoff` : ''}
          <InfoTile title="Asset selection">
            <p>
              Up to six assets with at least $5M of meaningful outstanding loans on each protocol. Ranked by
              combined debt in the selected books—not collateral deposits.
            </p>
            <p>
              Same token address and network. Aggregate Aave V3 pools and Morpho Blue collateral-specific
              markets; never merge unrelated tokens, networks, native staking yield or vault allocations.
            </p>
            <p>
              Each contributing market needs $5M supplied and $1M borrowed. The default cash filter also
              requires $5M cash per market, on both protocols. It applies equally to averages and extremes.
            </p>
            {omitted.length > 0 && (
              <p>
                {omitted.join(', ')}: insufficient cash-qualified borrowing on one protocol. Turn the cash
                filter off to compare its broader lending book.
              </p>
            )}
          </InfoTile>
        </div>
      </div>
      <div className="benchmark-context">
        <span>
          {side === 'borrowApy' ? 'Lower APY is cheaper.' : 'Higher APY earns more.'} Compare the average
          first. Click an asset to inspect its markets.
        </span>
        <InfoTile title="Freshness and execution">
          <p>
            Latest reported API quotes, not synchronized live execution prices. Original source observations
            may be up to one hour old; retrieval must be within 15 minutes. Unknown or older observations are
            excluded.
          </p>
          <p>
            Click an asset for timestamps, coverage and actual markets. Gaps are withheld below 80% balance
            coverage on either side. Cash is not borrow capacity or a guaranteed fill.
          </p>
          <p>
            Opportunity rankings retain their separate 15-minute freshness and default $5M liquidity/capacity
            checks.
          </p>
        </InfoTile>
      </div>
      {delayed.length > 0 && (
        <p className="benchmark-quality" role="status">
          Partial source coverage:{' '}
          {delayed.map((s) => `${s.protocol} ${s.asset} ${Math.round(s.quote.coverage * 100)}%`).join(' · ')}.
          Open an asset for the excluded observations.
        </p>
      )}
      <p className="benchmark-mobile-hint">Swipe the table → to compare both protocols.</p>
      {!assets.length ? (
        <div className="empty-state">
          <h3>No shared lending benchmark available</h3>
          <p>
            No asset meets the current size filters on both protocols.
            {liquidOnly ? ' Try turning off the cash filter.' : ''} Individual markets remain available in
            Explore.
          </p>
        </div>
      ) : (
        <div className="benchmark-table-scroll" tabIndex={0} aria-label="Rate comparison table">
          <table className="benchmark-table">
            <thead>
              <tr>
                <th rowSpan={2} scope="col">
                  Asset / compared debt
                </th>
                <th colSpan={2} scope="colgroup" className="benchmark-aave">
                  Aave V3
                </th>
                <th colSpan={2} scope="colgroup" className="benchmark-morpho">
                  Morpho Blue
                </th>
                <th rowSpan={2} scope="col">
                  Average advantage
                </th>
              </tr>
              <tr>
                {protocols.map((p) => (
                  <Fragment key={p}>
                    <th scope="col">
                      <span>
                        Average APY
                        <RateHelp side={side} />
                      </span>
                    </th>
                    <th scope="col">
                      <span>
                        {side === 'borrowApy' ? 'Lowest APY' : 'Highest APY'}
                        <RateHelp side={side} best />
                      </span>
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <ComparisonRow
                  key={asset.key}
                  asset={asset}
                  side={side}
                  open={expanded === asset.key}
                  onToggle={() => setExpanded(expanded === asset.key ? null : asset.key)}
                  onHistory={onHistory}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="benchmark-footer">
        <p>
          A single qualifying market makes average and extreme identical. Aave often has one dominant pool;
          Morpho splits lending by collateral.
        </p>
        <p>
          Latest reported · observations ≤1h old{' '}
          {oldest.length ? `(oldest ${clock(Math.min(...oldest))} UTC)` : ''} · organic APY, without rewards,
          native yield or risk adjustment.
        </p>
      </div>
    </section>
  );
}
