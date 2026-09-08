import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  Clock3,
  LineChart as LineChartIcon,
  LoaderCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_OPPORTUNITY_PARAMETERS, parseOpportunityParameters } from '../../shared/opportunity-inputs';
import type { Market, Opportunity, OpportunityResult } from '../../shared/types';
import InfoTile from '../components/InfoTile';
import {
  LeverageInfo,
  leverageLimitLabel,
  OpportunityBreakdown,
  OpportunityLabel,
} from '../components/OpportunityInsights';

import { Empty, ErrorNotice, Loading, MarketLink, ProtocolBadge } from '../components/ui';
import { api } from '../lib/api';
import { pct, usd } from '../lib/format';

export function Opportunities({
  markets,
  onHistory,
}: {
  markets: Market[];
  onHistory: (id: string) => void;
}) {
  const [leverage, setLeverage] = useState('3');
  const [size, setSize] = useState('');
  const [minimum, setMinimum] = useState('');
  const [result, setResult] = useState<OpportunityResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  let parametersChanged = false;
  if (result) {
    try {
      const draft = parseOpportunityParameters({
        targetLeverage: leverage,
        debtSizeUsd: size.trim() || undefined,
        minLiquidityUsd: minimum.trim() || undefined,
      });
      parametersChanged =
        draft.targetLeverage !== result.targetLeverage ||
        draft.debtSizeUsd !== result.debtSizeUsd ||
        draft.minLiquidityUsd !== result.minLiquidityUsd;
    } catch {
      parametersChanged = true;
    }
  }
  async function load() {
    let parameters;
    try {
      parameters = parseOpportunityParameters({
        targetLeverage: leverage,
        debtSizeUsd: size.trim() || undefined,
        minLiquidityUsd: minimum.trim() || undefined,
      });
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    const { targetLeverage: lev, debtSizeUsd: debt, minLiquidityUsd: min } = parameters;
    setLoading(true);
    setError('');
    try {
      setResult(
        await api<OpportunityResult>(
          `/api/opportunities?minLiquidityUsd=${min}&targetLeverage=${lev}&debtSizeUsd=${debt}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="looping-page">
      <div className="opportunity-banner">
        <div className="banner-icon">
          <ShieldCheck size={23} />
        </div>
        <div>
          <strong>Organic returns. Explicit risk limits.</strong>
          <p>
            Native yield and lending interest minus borrowing costs. No incentives, points, gas or fees. The
            screen keeps health factor at least 1.20; this can cap your requested leverage.
          </p>
        </div>
        <span className="tag mint">RESEARCH SCREEN</span>
      </div>
      <form
        className="panel opportunity-controls"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <div className="control-heading">
          <SlidersHorizontal size={17} />
          <span>YOUR PARAMETERS</span>
        </div>
        <div className="opportunity-field">
          <div className="opportunity-label">
            <label htmlFor="loop-target">Requested loop leverage</label>
            <InfoTile title="Requested loop leverage">
              <p>
                Total loop collateral / your equity. A 3× loop means $3 of collateral and $2 of debt per $1 of
                equity. The debt input stays fixed, so higher leverage means less equity required.
              </p>
              <p>
                This is an upper bound, not an optimizer. Applied leverage respects the protocol LTV buffer
                and minimum health factor of 1.20. Cross-protocol carry is not recursively levered.
              </p>
            </InfoTile>
          </div>
          <div className="number-input">
            <input
              id="loop-target"
              aria-label="Target leverage"
              type="number"
              min="1.1"
              max="20"
              step="0.1"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
            />
            <span>×</span>
          </div>
        </div>
        <div className="opportunity-field">
          <div className="opportunity-label">
            <label htmlFor="loop-debt">Debt to deploy</label>
            <InfoTile title="Debt to deploy">
              <p>
                The amount you plan to borrow, not your own deposit. The card calculates the equity and
                collateral needed at its applied leverage. Blank uses $5M; custom amounts from $1 are allowed.
              </p>
            </InfoTile>
          </div>
          <div className="number-input">
            <span>$</span>
            <input
              id="loop-debt"
              aria-label="Debt size in dollars"
              type="number"
              min="1"
              max="1000000000"
              step="any"
              placeholder={String(DEFAULT_OPPORTUNITY_PARAMETERS.debtSizeUsd)}
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          </div>
        </div>
        <div className="opportunity-field">
          <div className="opportunity-label">
            <label htmlFor="loop-liquidity">Minimum market liquidity</label>
            <InfoTile title="Minimum market liquidity">
              <p>
                Minimum existing unborrowed cash at the borrowing venue, and at the external lending
                destination for carry. This filters markets; it does not change your debt size. Borrow caps
                and collateral supply caps are checked separately.
              </p>
              <p>Cash and cap headroom are not proof of swap liquidity or guaranteed exit capacity.</p>
            </InfoTile>
          </div>
          <div className="number-input">
            <span>$</span>
            <input
              id="loop-liquidity"
              aria-label="Minimum liquidity in dollars"
              type="number"
              min="1"
              max="1000000000"
              step="any"
              placeholder={String(DEFAULT_OPPORTUNITY_PARAMETERS.minLiquidityUsd)}
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
          </div>
        </div>
        <button className="button primary" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}
          {loading ? 'Scanning…' : 'Scan opportunities'}
        </button>
      </form>
      <p className="opportunity-default-note">
        Blank dollar fields use $5M. Both fields accept custom amounts from $1. Lowering the liquidity filter
        does not automatically lower your debt size.
      </p>
      {parametersChanged && (
        <div className="opportunity-pending" role="status">
          Parameters changed — showing the last scan ({result!.targetLeverage}× requested,{' '}
          {usd(result!.debtSizeUsd)} debt). Click Scan opportunities to apply.
        </div>
      )}
      {error && <ErrorNotice error={error} />}
      {loading && !result && (
        <div className="panel">
          <Loading text="Screening markets and native asset yields…" />
        </div>
      )}
      {result && (
        <>
          <div className="opportunity-meta">
            <span>
              <Clock3 size={13} />
              Screened {new Date(result.fetchedAt).toLocaleTimeString()} · {usd(result.debtSizeUsd)} debt ·{' '}
              {result.targetLeverage}× requested · HF ≥ {result.minHealthFactor.toFixed(2)} ·{' '}
              {usd(result.minLiquidityUsd)} minimum liquidity
            </span>
            <span>
              {result.loops.length} qualifying loops · {result.carry.length} carry routes
            </span>
          </div>
          <div className="section-heading">
            <div>
              <div className="eyebrow">NATIVE YIELD + FINANCING</div>
              <h2>
                Top native-yield loops <span className="count-badge">{Math.min(result.loops.length, 5)}</span>
                <InfoTile title="Native-yield loops">
                  <p>
                    Borrow against a yield-bearing asset, buy more of that collateral, and redeposit it.
                    Unlike cross-protocol carry, the borrowed capital also becomes collateral, enabling
                    recursive leverage.
                  </p>
                  <p>
                    Ranked by annual return on your equity after the selected debt size. Fully modeled
                    candidates come first; current-rate-only candidates follow. Every modeled route must still
                    have a positive incremental spread.
                  </p>
                </InfoTile>
              </h2>
              <p>
                Borrow → buy more yield-bearing collateral → redeposit. Ranked by return at your debt size;
                current-rate-only candidates come last.
              </p>
            </div>
          </div>
          {!result.loops.length ? (
            <section className="panel">
              <Empty
                title="No loops clear this screen"
                detail="No supported route currently meets the liquidity, positive-spread, size and collateral-risk requirements. Check the excluded routes below; the screen never pads the list with unprofitable loops."
              />
            </section>
          ) : (
            <div className="loop-list">
              {result.loops.slice(0, 5).map((op, i) => (
                <div className="panel loop-card" key={op.id}>
                  <div className="loop-card-main">
                    <span className="loop-rank">0{i + 1}</span>
                    <div className="loop-identity">
                      <div>
                        <strong>{op.collateralSymbol}</strong>
                        <span className="loop-label">NATIVE LOOP</span>
                      </div>
                      <span>
                        Borrow {op.debtSymbol} on {op.borrowProtocol} · {op.chain}
                      </span>
                      <div className="loop-route">
                        <ProtocolBadge protocol={op.borrowProtocol} small />
                        <ArrowRight size={12} />
                        <span>{op.collateralSymbol} native yield</span>
                      </div>
                    </div>
                    <div className="loop-rate">
                      <OpportunityLabel
                        title={
                          op.modeledNetReturnOnEquity === null
                            ? 'Current-rate return'
                            : 'Annual return at your size'
                        }
                      >
                        <p>
                          Simple annualized return on your own equity, after borrowing interest. Not
                          compounded APY; excludes incentives, gas, slippage and fees.{' '}
                          {op.modeledNetReturnOnEquity === null
                            ? 'Size impact is not fully modeled, so this is a current-rate candidate only.'
                            : `Includes the immediate rate impact of adding ${usd(result.debtSizeUsd)} of debt and the collateral deposit.`}
                        </p>
                      </OpportunityLabel>
                      <strong>{pct(op.modeledNetReturnOnEquity ?? op.netReturnOnEquity)}</strong>
                      <small>
                        {op.modeledNetReturnOnEquity == null
                          ? 'Size impact not fully modeled'
                          : `${pct(op.netReturnOnEquity)} at current rates`}
                      </small>
                      <small>
                        Holding {op.collateralSymbol}: {pct(op.nativeApr)} · loop adds{' '}
                        {(op.modeledNetReturnOnEquity ?? op.netReturnOnEquity) >= op.nativeApr ? '+' : ''}
                        {(
                          ((op.modeledNetReturnOnEquity ?? op.netReturnOnEquity) - op.nativeApr) *
                          100
                        ).toFixed(2)}{' '}
                        pp
                      </small>
                    </div>
                    <div className="loop-stat">
                      <LeverageInfo op={op} />
                      <b>{op.leverage.toFixed(2)}×</b>
                      <small>{leverageLimitLabel(op)}</small>
                      <small>
                        {op.leveragePolicy.requested.toFixed(1)}× requested · HF {op.healthFactor.toFixed(2)}
                      </small>
                    </div>
                    <div className="loop-stat">
                      <OpportunityLabel title="Debt capacity">
                        <p>
                          Indicative maximum debt allowed by indexed borrow cash, borrow-cap headroom and
                          collateral supply-cap headroom at the applied LTV. Not the size at which the
                          displayed return remains profitable. Swap depth and execution are not verified;
                          routes may share the same capacity.
                        </p>
                      </OpportunityLabel>
                      <b>{usd(op.capacityUsd)}</b>
                      <small>{usd(op.equityUsd)} equity needed</small>
                    </div>
                    <button
                      aria-label={`Expand ${op.title}`}
                      aria-expanded={expanded === op.id}
                      className={`icon-button expand-button ${expanded === op.id ? 'expanded' : ''}`}
                      onClick={() => setExpanded(expanded === op.id ? null : op.id)}
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                  {expanded === op.id && (
                    <OpportunityDetail op={op} markets={markets} onHistory={onHistory} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="section-heading carry-heading">
            <div>
              <div className="eyebrow">BORROW HERE. SUPPLY THERE.</div>
              <h2>
                Cross-protocol carry <span className="carry-kind">NOT A LOOP</span>
                <InfoTile title="Cross-protocol carry">
                  <p>
                    Post separate collateral, borrow a token on one protocol and lend that exact token on the
                    other, on the same network. “Same asset” means the borrowed and lent token match, not that
                    collateral and debt match.
                  </p>
                  <p>
                    The lending receipt is not assumed to be reusable as collateral. Gross assets / equity is
                    1 + LTV, generally below 2×; this is not a 3× or 10× recursive loop.
                  </p>
                </InfoTile>
              </h2>
              <p>
                Separate collateral → borrow a token → lend that same token elsewhere. Lending receipts are
                not re-pledged.
              </p>
            </div>
          </div>
          <section className="panel market-panel">
            <div className="table-scroll">
              <table className="carry-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Borrow APR</th>
                    <th>Lending APR</th>
                    <th>Spot spread</th>
                    <th>Current return</th>
                    <th>
                      <OpportunityLabel title="Return at your size">
                        <p>
                          Annual financing-net return on separately posted equity, including its collateral
                          income plus LTV × the external lending spread. Accounts for borrow-rate impact and
                          lending dilution where modeled. Excludes incentives and execution costs.
                        </p>
                      </OpportunityLabel>
                    </th>
                    <th>Debt capacity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.carry.map((op) => (
                    <tr key={op.id}>
                      <td>
                        <strong>
                          {op.debtSymbol} <span className="muted">/ {op.chain}</span>
                        </strong>
                        <div className="carry-route">
                          <ProtocolBadge small protocol={op.borrowProtocol} />
                          <ArrowRight size={12} />
                          <ProtocolBadge small protocol={op.lendProtocol} />
                        </div>
                        <small>
                          {op.collateralSymbol} collateral · {op.leverage.toFixed(2)}× · HF{' '}
                          {op.healthFactor.toFixed(2)}
                        </small>
                      </td>
                      <td>{pct(op.borrowApr)}</td>
                      <td>{pct(op.lendingApr)}</td>
                      <td className="positive">{pct(op.spreadApr)}</td>
                      <td className="positive">
                        <strong>{pct(op.netReturnOnEquity)}</strong>
                      </td>
                      <td>
                        <strong>
                          {op.modeledNetReturnOnEquity === null
                            ? 'Not modeled'
                            : pct(op.modeledNetReturnOnEquity)}
                        </strong>
                        <small>{usd(op.equityUsd)} equity needed</small>
                      </td>
                      <td>{usd(op.capacityUsd)}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`View ${op.title} details`}
                          aria-expanded={expanded === op.id}
                          onClick={() => setExpanded(expanded === op.id ? null : op.id)}
                        >
                          <ChevronDown size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.carry.length && (
              <Empty
                title="No cross-protocol carry routes qualify"
                detail="The screen requires sufficient capacity and a positive spread at the requested size."
              />
            )}
            {result.carry
              .filter((op) => op.id === expanded)
              .map((op) => (
                <OpportunityDetail key={op.id} op={op} markets={markets} onHistory={onHistory} />
              ))}
          </section>
          <div className="notice">
            <CircleHelp size={17} />
            <span>
              Returns are simple annualized estimates, not compounded APY. Available capacity is modeled;
              exchange-route depth, gas, fees, slippage and incentives are not included.
            </span>
          </div>
          <section className="panel screening-notes">
            <div className="section-heading">
              <h2>Screening notes</h2>
              <button className="text-button" onClick={() => setShowExcluded(!showExcluded)}>
                {showExcluded ? 'Hide' : 'Show'} excluded routes ({result.excluded.length})
                <ChevronDown size={14} />
              </button>
            </div>
            <details className="screening-methodology">
              <summary>Calculation methodology and coverage</summary>
              <ul>
                {result.methodology.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </details>
            {showExcluded && (
              <div className="excluded-list">
                {result.excluded.length ? (
                  result.excluded.map((op) => (
                    <div key={op.id}>
                      <strong>{op.title}</strong>
                      <small>
                        {op.chain} · {op.borrowProtocol}
                      </small>
                      <p>{op.exclusionReasons.join(' · ')}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">No additional excluded routes were returned.</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function OpportunityDetail({
  op,
  markets,
  onHistory,
}: {
  op: Opportunity;
  markets: Market[];
  onHistory: (id: string) => void;
}) {
  const market = markets.find((m) => m.id === op.borrowMarketId);
  const lendMarket = markets.find((m) => m.id === op.lendMarketId);
  return (
    <OpportunityBreakdown
      op={op}
      actions={
        <>
          <button className="button secondary" onClick={() => onHistory(op.borrowMarketId)}>
            <LineChartIcon size={14} />
            Borrow rate history
          </button>
          {market && <MarketLink market={market} label="Open borrow market" />}
          {lendMarket && (
            <button className="button secondary" onClick={() => onHistory(lendMarket.id)}>
              <LineChartIcon size={14} />
              Lending rate history
            </button>
          )}
          {lendMarket && <MarketLink market={lendMarket} label="Open lend market" />}
        </>
      }
    />
  );
}
