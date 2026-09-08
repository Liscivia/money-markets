import {
  ArrowDownUp,
  ChevronDown,
  CircleHelp,
  Clock3,
  LineChart as LineChartIcon,
  Search,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  comparisonFilters,
  filterComparisonMarkets,
  selectedComparisonMarket,
  type ComparisonFilters as ComparisonFilterState,
} from '../../shared/comparison';
import { alignHistory } from '../../shared/history';
import type { Market, MarketHistory } from '../../shared/types';
import ComparisonFilters from '../components/ComparisonFilters';
import MarketDetails from '../components/MarketDetails';

import { ChartTip, Empty, ErrorNotice, Loading, MarketLink, Metric } from '../components/ui';
import { api } from '../lib/api';
import { date, num, pct, usd } from '../lib/format';
import { COLORS } from '../lib/navigation';

export function Rates({ markets, initialMarket }: { markets: Market[]; initialMarket: string }) {
  const defaultA =
    markets.find((m) => m.id === initialMarket) ??
    [...markets]
      .filter((m) => m.protocol === 'Aave' && m.asset.symbol === 'USDC')
      .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd)[0] ??
    markets[0];
  function counterpart(m?: Market) {
    return (
      markets
        .filter(
          (n) =>
            n.protocol !== m?.protocol &&
            n.chainId === m?.chainId &&
            n.asset.address.toLowerCase() === m?.asset.address.toLowerCase(),
        )
        .sort((a, b) => b.totalBorrowUsd - a.totalBorrowUsd)[0] ??
      markets.find((n) => n.protocol !== m?.protocol)
    );
  }
  const [preferredA, setA] = useState(defaultA?.id ?? '');
  const [preferredB, setB] = useState(counterpart(defaultA)?.id ?? '');
  const [days, setDays] = useState(30);
  const [rate, setRate] = useState<'borrowApy' | 'supplyApy'>('borrowApy');
  const [histories, setHistories] = useState<(MarketHistory | null)[]>([null, null]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<[ComparisonFilterState, ComparisonFilterState]>([
    comparisonFilters(defaultA?.protocol ?? 'Aave'),
    comparisonFilters(counterpart(defaultA)?.protocol ?? 'Morpho'),
  ]);
  const filteredMarkets = useMemo(
    () => filters.map((filter) => filterComparisonMarkets(markets, filter)),
    [markets, filters],
  );
  const marketA = selectedComparisonMarket(filteredMarkets[0], preferredA);
  const marketB = selectedComparisonMarket(filteredMarkets[1], preferredB);
  const a = marketA?.id ?? '',
    b = marketB?.id ?? '';
  function updateFilters(index: number, value: ComparisonFilterState) {
    setFilters((previous) => (index === 0 ? [value, previous[1]] : [previous[0], value]));
  }
  useEffect(() => {
    if (initialMarket) {
      const first = markets.find((m) => m.id === initialMarket);
      if (!first) return;
      const second = counterpart(first);
      setA(initialMarket);
      setB(second?.id ?? '');
      setFilters([
        comparisonFilters(first.protocol),
        comparisonFilters(second?.protocol ?? (first.protocol === 'Aave' ? 'Morpho' : 'Aave')),
      ]);
    }
  }, [initialMarket]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setHistories([null, null]);
    setErrors([]);
    Promise.allSettled(
      [a, b].map((id) =>
        id
          ? api<MarketHistory>(`/api/history?marketId=${encodeURIComponent(id)}&days=${days}`)
          : Promise.resolve(null),
      ),
    ).then((results) => {
      if (!active) return;
      setHistories(results.map((r) => (r.status === 'fulfilled' ? r.value : null)));
      setErrors(
        results
          .map((r, i) =>
            r.status === 'rejected'
              ? `${i === 0 ? 'First' : 'Second'} market: ${r.reason?.message ?? 'History unavailable'}`
              : '',
          )
          .filter(Boolean),
      );
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [a, b, days]);
  const comparison = useMemo(() => alignHistory(histories, rate), [histories, rate]);
  const chart = comparison.chart;
  const aligned = chart.filter((p) => p.A != null && p.B != null);
  const meanGap = aligned.length ? aligned.reduce((s, p) => s + p.A! - p.B!, 0) / aligned.length : null;
  const persistence = aligned.length
    ? aligned.filter((p) => (rate === 'borrowApy' ? p.B! < p.A! : p.B! > p.A!)).length / aligned.length
    : null;
  const marketOptions = (index: number) => {
    return filteredMarkets[index].map((m) => (
      <option value={m.id} key={m.id}>
        {m.protocol} {m.version} · {m.asset.symbol} · {m.chain} ·{' '}
        {m.protocol === 'Morpho' ? `${m.collateral[0]?.asset.symbol ?? '?'} / ${pct(m.lltv, 0)}` : m.name} ·{' '}
        {usd(m.totalSupplyUsd)} · #{m.id.slice(-8)}
      </option>
    ));
  };
  const names = [marketA, marketB].map(
    (m, i) => `${i === 0 ? 'A' : 'B'} · ${m?.protocol ?? 'Market'} ${m?.asset.symbol ?? ''}`,
  );
  return (
    <>
      <div className="panel rate-picker">
        <div className="section-heading">
          <div>
            <h2>Build a comparison</h2>
            <p>Choose any two markets. Matching assets and networks gives the cleanest comparison.</p>
          </div>
          <span className="tag">EXACT MARKET COMPARISON</span>
        </div>
        <div className="market-selectors">
          {[0, 1].map((i) => {
            const m = i === 0 ? marketA : marketB;
            return (
              <div className="market-selector" key={i}>
                <span
                  className="comparison-letter"
                  style={{
                    background: `${COLORS[filters[i].protocol]}18`,
                    color: COLORS[filters[i].protocol],
                  }}
                >
                  {i === 0 ? 'A' : 'B'}
                </span>
                <div>
                  <label htmlFor={`market-${i}`}>{i === 0 ? 'FIRST MARKET' : 'COMPARE WITH'}</label>
                  <ComparisonFilters
                    markets={markets}
                    filters={filters[i]}
                    index={i}
                    onChange={(value) => updateFilters(i, value)}
                  />
                  <div className="market-search-row">
                    <Search size={13} />
                    <input
                      aria-label={`Search ${i === 0 ? 'first' : 'second'} market`}
                      placeholder="Narrow by market name, version or ID…"
                      value={filters[i].search}
                      onChange={(e) => updateFilters(i, { ...filters[i], search: e.target.value })}
                    />
                    <small>{num(filteredMarkets[i].length)}</small>
                  </div>
                  <div className="market-select-control">
                    <select
                      id={`market-${i}`}
                      value={i === 0 ? a : b}
                      disabled={!filteredMarkets[i].length}
                      onChange={(e) => (i === 0 ? setA(e.target.value) : setB(e.target.value))}
                    >
                      {!filteredMarkets[i].length && <option value="">No matching markets</option>}
                      {marketOptions(i)}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </div>
                  {m ? (
                    <MarketDetails market={m} />
                  ) : (
                    <span>No markets match these filters. Broaden or reset this selection.</span>
                  )}
                  {m && (
                    <span className="selected-market-id" title={m.id}>
                      {m.version} · Market #{m.id.slice(-8)}
                    </span>
                  )}
                  {m && <MarketLink market={m} />}
                </div>
              </div>
            );
          })}
        </div>
        {marketA &&
          marketB &&
          (marketA.chainId !== marketB.chainId ||
            marketA.asset.address.toLowerCase() !== marketB.asset.address.toLowerCase()) && (
            <div className="notice">
              <CircleHelp size={15} />
              <span>
                These markets have different assets or networks. The rate difference alone does not describe
                an executable spread.
              </span>
            </div>
          )}
      </div>
      <div className="metrics-grid rate-metrics">
        <Metric
          label="FIRST MARKET · CURRENT"
          value={pct(marketA?.[rate])}
          detail={`${marketA?.protocol ?? '—'} · ${marketA?.asset.symbol ?? ''} · ${rate === 'borrowApy' ? 'borrow' : 'supply'} APY`}
          icon={LineChartIcon}
        />
        <Metric
          label="SECOND MARKET · CURRENT"
          value={pct(marketB?.[rate])}
          detail={`${marketB?.protocol ?? '—'} · ${marketB?.asset.symbol ?? ''} · ${rate === 'borrowApy' ? 'borrow' : 'supply'} APY`}
          icon={LineChartIcon}
          accent
        />
        <Metric
          label="AVERAGE HISTORICAL GAP"
          value={meanGap == null ? '—' : `${(meanGap * 10000).toFixed(0)} bps`}
          detail={`A minus B · ${aligned.length} aligned ${comparison.label} observations`}
          icon={ArrowDownUp}
        />
        <Metric
          label="SECOND MARKET ADVANTAGE"
          value={pct(persistence, 0)}
          detail={`${comparison.intervalDays === 1 ? 'Days' : 'Intervals'} B had ${rate === 'borrowApy' ? 'lower borrow' : 'higher supply'} APY`}
          icon={Clock3}
        />
      </div>
      <section className="panel history-panel">
        <div className="section-heading">
          <div>
            <h2>Rates over time</h2>
            <p>
              Organic APY · last observation per UTC{' '}
              {comparison.label === 'daily' ? 'day' : `${comparison.intervalDays}-day interval`}
            </p>
          </div>
          <div className="chart-controls">
            <div className="segmented">
              <button className={rate === 'borrowApy' ? 'active' : ''} onClick={() => setRate('borrowApy')}>
                Borrow
              </button>
              <button className={rate === 'supplyApy' ? 'active' : ''} onClick={() => setRate('supplyApy')}>
                Supply
              </button>
            </div>
            <div className="period-select">
              {[7, 30, 90, 365].map((d) => (
                <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>
                  {d === 365 ? '1Y' : `${d}D`}
                </button>
              ))}
            </div>
          </div>
        </div>
        {errors.map((e) => (
          <ErrorNotice key={e} error={e} />
        ))}
        {busy ? (
          <Loading text="Retrieving historical observations…" />
        ) : !chart.length ? (
          <Empty
            title="No historical observations available"
            detail="Try another period or market. Missing data is never replaced with a generated series."
          />
        ) : (
          <div className="history-chart">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chart} margin={{ left: -8, right: 18, top: 15, bottom: 8 }}>
                <CartesianGrid stroke="#2b303b" vertical={false} strokeDasharray="3 5" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => date(v)}
                  tick={{ fill: '#8f98aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={35}
                />
                <YAxis
                  tickFormatter={(v) => pct(v, 1)}
                  tick={{ fill: '#8f98aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip labelFormatter={(v) => date(Number(v), true)} content={<ChartTip percent />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 24 }} />
                <Line
                  type="linear"
                  dataKey="A"
                  name={names[0]}
                  stroke={COLORS.Aave}
                  strokeWidth={2.5}
                  dot={chart.length < 3 ? { r: 4 } : false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
                <Line
                  type="linear"
                  dataKey="B"
                  name={names[1]}
                  stroke={COLORS.Morpho}
                  strokeWidth={2.5}
                  dot={chart.length < 3 ? { r: 4 } : false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="history-source-grid">
          {histories.map((h, i) => (
            <div key={i}>
              <span className="source-heading">
                <span style={{ color: i === 0 ? COLORS.Aave : COLORS.Morpho }}>●</span> {names[i]}
              </span>
              <p>
                {h
                  ? `${h.points.length} observations · ${h.source}`
                  : busy
                    ? 'Fetching source…'
                    : 'No source data returned'}
              </p>
              {h &&
                (() => {
                  const daily = chart
                    .map((point) => (i === 0 ? point.A : point.B))
                    .filter((value): value is number => value != null);
                  if (!daily.length) return null;
                  return (
                    <div className="history-period-stats">
                      <span>
                        Period mean <b>{pct(daily.reduce((sum, value) => sum + value, 0) / daily.length)}</b>
                      </span>
                      <span>
                        Low <b>{pct(Math.min(...daily))}</b>
                      </span>
                      <span>
                        High <b>{pct(Math.max(...daily))}</b>
                      </span>
                    </div>
                  );
                })()}
              {h?.warning && <p className="warn-text">{h.warning}</p>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
