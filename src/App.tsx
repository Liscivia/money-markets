import {
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Menu,
  RefreshCw,
  Waves,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '../shared/types';

import { Empty, ErrorNotice, Loading, ProtocolBadge } from './components/ui';
import { api } from './lib/api';
import { date, num } from './lib/format';
import { NAV, type View } from './lib/navigation';
import { Intelligence } from './pages/Intelligence';
import { Opportunities } from './pages/Looping';
import { Overview } from './pages/Overview';
import { Rates } from './pages/Rates';

export default function App() {
  const [view, setView] = useState<View>(() => {
    const hash = window.location.hash.slice(1);
    return NAV.some((n) => n.id === hash) ? (hash as View) : 'overview';
  });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState('');
  const [methodology, setMethodology] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  async function load(refresh = false) {
    setRefreshing(true);
    setError('');
    try {
      const incoming = await api<Snapshot>(
        refresh ? '/api/refresh' : '/api/snapshot',
        refresh ? { method: 'POST' } : undefined,
      );
      setSnapshot((previous) =>
        previous?.fetchedAt === incoming.fetchedAt &&
        JSON.stringify(previous.providers) === JSON.stringify(incoming.providers)
          ? previous
          : incoming,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const fn = () => {
      const next = window.location.hash.slice(1);
      if (NAV.some((n) => n.id === next)) setView(next as View);
    };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => {
    if (!methodology) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('.modal button')?.focus(),
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMethodology(false);
      if (event.key !== 'Tab') return;
      const elements = [
        ...document.querySelectorAll<HTMLElement>(
          '.modal button, .modal a[href], .modal input, .modal select',
        ),
      ];
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [methodology]);
  function navigate(v: View) {
    setView(v);
    window.location.hash = v;
    setMobileNav(false);
  }
  function openHistory(id: string) {
    setSelectedHistory(id);
    navigate('rates');
  }
  const markets = snapshot?.markets ?? [];
  const chains = useMemo(() => [...new Set(markets.map((m) => m.chain))].sort(), [markets]);
  const allLive = snapshot?.providers.every((p) => p.status === 'live');
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <a className="brand" href="#overview" onClick={() => navigate('overview')}>
          <span className="brand-mark">
            <Waves size={25} />
          </span>
          <span>
            money<span className="brand-light">markets</span>
            <small>THE LENDING LANDSCAPE</small>
          </span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <div className="sidebar-label">FOLLOWING</div>
          <div className="follow-protocol">
            <ProtocolBadge protocol="Aave" />
            <span>V3 + V4</span>
          </div>
          <div className="follow-protocol">
            <ProtocolBadge protocol="Morpho" />
            <span>Blue</span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <div>
              <span className="status-dot" />
              Research dashboard
            </div>
            <p>Public data. Your research.</p>
          </div>
          <button className="methodology-link" onClick={() => setMethodology(true)}>
            <CircleHelp size={17} />
            Data & methodology
            <ArrowUpRight size={15} />
          </button>
          <span className="sidebar-version">MONEY MARKETS / 01</span>
        </div>
      </aside>
      {mobileNav && (
        <button className="nav-overlay" aria-label="Close navigation" onClick={() => setMobileNav(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className={`feed-status ${allLive ? 'live' : 'pending'}`}>
              <span className="status-dot" />
              {snapshot ? (allLive ? 'Sources connected' : 'Partial coverage') : 'Connecting sources'}
            </span>
            <button
              className={`icon-button refresh ${refreshing ? 'is-refreshing' : ''}`}
              onClick={() => void load(true)}
              disabled={refreshing}
              aria-label="Refresh market data"
              title="Refresh market data"
            >
              <RefreshCw size={16} />
            </button>
            <span className="avatar">MM</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">AAVE × MORPHO</div>
              <h1>
                {view === 'overview'
                  ? 'The lending landscape.'
                  : view === 'rates'
                    ? 'Follow the spread.'
                    : view === 'opportunities'
                      ? 'Looping'
                      : 'The story behind the rates.'}
              </h1>
              <p>
                {view === 'overview'
                  ? 'Two protocols. One clear picture of where capital moves.'
                  : view === 'rates'
                    ? 'Compare historical supply and borrow rates, market by market.'
                    : view === 'opportunities'
                      ? 'Find organic looping returns, understand the leverage limits, and compare funding routes.'
                      : 'Governance decisions, market updates, and what comes next.'}
              </p>
            </div>
            <button className="button secondary methodology-desktop" onClick={() => setMethodology(true)}>
              <CircleHelp size={15} />
              How to read this
            </button>
          </div>
          {error && <ErrorNotice error={error} retry={() => void load()} />}
          {snapshot && view !== 'news' && (
            <div className="source-strip">
              <span>
                <Clock3 size={13} />
                Snapshot{' '}
                {new Date(snapshot.fetchedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {date(snapshot.fetchedAt)}
              </span>
              <span>
                {num(markets.length)} indexed markets
                <span className="strip-divider">/</span>
                {chains.length} networks
              </span>
              {snapshot.providers
                .filter((p) => p.status !== 'live')
                .map((p) => (
                  <span className="warn-text" key={p.protocol}>
                    {p.protocol}: {p.status}
                    {p.detail ? ` · ${p.detail}` : ''}
                  </span>
                ))}
            </div>
          )}
          {!snapshot && view !== 'news' ? (
            refreshing ? (
              <>
                <div className="metrics-grid skeleton-grid">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="metric-card skeleton">
                      <span />
                      <b />
                      <span />
                    </div>
                  ))}
                </div>
                <div className="panel">
                  <Loading />
                </div>
              </>
            ) : (
              <Empty title="Market data is unavailable" detail="Refresh to reconnect to the public APIs." />
            )
          ) : null}
          {snapshot && view === 'overview' && (
            <Overview markets={markets} onHistory={openHistory} navigate={navigate} />
          )}
          {snapshot && view === 'rates' && <Rates markets={markets} initialMarket={selectedHistory} />}
          {snapshot && view === 'opportunities' && (
            <Opportunities markets={markets} onHistory={openHistory} />
          )}
          {view === 'news' && <Intelligence />}
          <footer>
            <span>Built for a clearer view of onchain credit.</span>
            <button className="text-button" onClick={() => setMethodology(true)}>
              Sources & methodology <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {methodology && (
        <div className="modal-backdrop" onClick={() => setMethodology(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="methodology-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <div className="eyebrow">RESEARCH NOTES</div>
                <h2 id="methodology-title">Understand the numbers.</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setMethodology(false)}
                aria-label="Close methodology"
              >
                <X size={22} />
              </button>
            </div>
            <div className="methodology-content">
              <h3>Public sources, visible coverage</h3>
              <p>
                Aave and Morpho public APIs provide the current market snapshot and historical series.
                Coverage reflects the markets returned by those sources, not every deployment ever created.
                Source errors and cached data are labeled. Missing historical observations remain gaps.
              </p>
              <h3>Comparable rates</h3>
              <p>
                Market rates are the organic supply and borrow APYs returned by the protocol API. Borrow
                averages are debt-weighted; supply averages are deposit-weighted. Average and Lowest/Highest
                use exactly the same books: at least $5M supplied and $1M borrowed, with source observations
                up to one hour old and API retrieval within 15 minutes. These are latest-reported benchmarks,
                not execution quotes. Up to six shared assets are ranked by combined debt, with at least $5M
                borrowed on each protocol. The benchmark uses Aave V3 versus Morpho Blue on one network; V4
                remains in Explore until full borrow premiums are modeled. Source timestamps, coverage,
                collateral and access restrictions are available in the asset breakdown. Opportunity freshness
                and sizing checks are separate. Incentives are shown separately and are not added into these
                averages. Supply includes borrowed capital and is not protocol TVL. The live lending book
                excludes Morpho's separately held collateral. Available liquidity is deduplicated when Aave V4
                spokes share one hub.
              </p>
              <h3>Comparable protocol capital</h3>
              <p>
                Overview gross deposits, debt, TVL and capital charts use DefiLlama's Aave V3 + V4 and Morpho
                Blue series. Gross deposits is a standardized proxy: TVL plus outstanding debt, including
                collateral and inheriting source exclusions. It is not the lending-book balance or unique
                investor capital. The cards' info tiles contain formulas, coverage and source timestamps.
                Protocol-wide comparisons include all networks and assets; Explore filters apply only to the
                market table.
              </p>
              <h3>Market structure matters</h3>
              <p>
                Aave pools contain multiple collateral reserves; Morpho markets are isolated collateral / debt
                pairs. Market counts describe coverage and are not comparable measures of adoption. Underlying
                assets are matched by chain and contract address, never ticker alone. Morpho vault allocations
                may overlap these markets and are not added a second time.
              </p>
              <h3>Loops and carry</h3>
              <p>
                Opportunity returns are simple annualized return on equity, not compounded APY. Native-yield
                loops apply the native yield to total collateral exposure and borrowing cost to debt. Carry
                requires separately funded collateral: equity is debt divided by target LTV, and asset
                leverage is 1 + LTV. Its ROE includes collateral income plus LTV times the lending / borrowing
                spread. Loop leverage is constrained by collateral parameters and a health-factor buffer.
              </p>
              <p>
                The default screen requires at least $5M of available borrow liquidity and models $5M of debt.
                Capacity also considers configured caps and destination liquidity where available. A spot
                spread is not a fillable quote. Size-adjusted borrowing costs appear only where a supported
                rate model is available. Fees, slippage, rewards, gas and liquidation losses are excluded;
                conversion route depth is not verified.
              </p>
              <h3>Governance intelligence</h3>
              <p>
                Headlines come from public official governance feeds. A discussion or proposal is not an
                enacted protocol change. Follow the source to verify the latest status.
              </p>
              {snapshot?.providers.map((p) => (
                <div className="coverage-note" key={p.protocol}>
                  <ProtocolBadge protocol={p.protocol} />
                  <p>{p.coverage}</p>
                </div>
              ))}
              <div className="source-links">
                <a href="https://docs.morpho.org/" target="_blank" rel="noreferrer">
                  Morpho documentation <ExternalLink size={13} />
                </a>
                <a href="https://aave.com/docs" target="_blank" rel="noreferrer">
                  Aave documentation <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
