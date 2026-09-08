import { ArrowUpRight, BarChart3, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CompetitionHistory as Data } from '../../shared/competition';
import {
  CAPITAL_LABELS,
  CAPITAL_METRICS,
  HISTORY_KEYS,
  capitalHistoryStats,
  type CapitalMetric,
} from '../../shared/protocol-capital';
import InfoTile from './InfoTile';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
const day = (value: number | null) =>
  value === null
    ? 'unavailable'
    : new Date(value * 1000).toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

export default function CompetitionHistory({
  chain = 'all',
  metric,
  onMetric,
  sourceFetchedAt = null,
}: {
  chain?: string;
  metric: CapitalMetric;
  onMetric: (metric: CapitalMetric) => void;
  sourceFetchedAt?: string | null;
}) {
  const [days, setDays] = useState(90);
  const [result, setResult] = useState<{
    chain: string;
    days: number;
    sourceFetchedAt: string | null;
    data: Data;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const data =
    result?.chain === chain && result.days === days && result.sourceFetchedAt === sourceFetchedAt
      ? result.data
      : null;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/protocol-history?days=' + days + '&chain=' + encodeURIComponent(chain), {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'History unavailable');
        return d as Data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ chain, days, sourceFetchedAt, data });
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setResult(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, chain, sourceFetchedAt]);
  const stats = useMemo(() => capitalHistoryStats(data?.points ?? [], metric), [data, metric]);
  return (
    <section className="panel competition-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE COMPETITIVE RACE</div>
          <h2>
            <BarChart3 size={19} />
            {CAPITAL_LABELS[metric]} over time{' '}
            <InfoTile title="Capital history">
              <p>
                Daily observed DefiLlama values on the same accounting basis as the cards and current charts.
              </p>
              <div className="info-formula">
                Gross deposits = TVL + debt. Aave = reported V3 + V4 components. Morpho = Blue. Values are
                aligned to UTC observation days.
              </div>
              <p>
                Changes use the first and last available points, with their actual dates below. They are USD
                value changes, not deposit flows, returns or price-adjusted growth. Missing active
                observations remain gaps; no forward filling.
              </p>
              <p>
                {chain === 'all' ? 'All networks' : chain}. Both protocols, all source-reported assets. Source
                retrieval: {data?.fetchedAt ?? 'pending'}.
              </p>
            </InfoTile>
          </h2>
          <p>{chain === 'all' ? 'All networks' : chain} · Aave V3 + V4 / Morpho Blue · DefiLlama</p>
        </div>
        <div className="capital-history-controls">
          <select
            aria-label="Protocol growth metric"
            value={metric}
            onChange={(e) => onMetric(e.target.value as CapitalMetric)}
          >
            {CAPITAL_METRICS.map((key) => (
              <option key={key} value={key}>
                {CAPITAL_LABELS[key]}
              </option>
            ))}
          </select>
          <div className="capital-metric-toggle">
            {[30, 90, 365].map((d) => (
              <button
                key={d}
                aria-label={'Capital history ' + d + ' days'}
                aria-pressed={days === d}
                onClick={() => setDays(d)}
              >
                {d === 365 ? '1Y' : d + 'D'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="capital-history-stats">
        {stats.map((s) => (
          <div key={s.protocol}>
            <span className={'history-protocol ' + s.protocol}>
              {s.protocol === 'aave' ? 'Aave' : 'Morpho'}
            </span>
            <div>
              <strong>{s.latest === null ? '—' : money(s.latest)}</strong>
              {s.change !== null && (
                <span className={s.change >= 0 ? 'positive' : 'negative'}>
                  {s.change >= 0 ? '+' : ''}
                  {s.change.toFixed(1)}%
                </span>
              )}
            </div>
            <small>
              {s.lastAt === null
                ? 'No observations'
                : day(s.firstAt) + ' → ' + day(s.lastAt) + ' · observed window'}
            </small>
          </div>
        ))}
      </div>
      {loading ? (
        <div className="capital-chart-empty">
          <LoaderCircle size={22} /> Loading observed protocol history…
        </div>
      ) : error ? (
        <div role="status" className="capital-chart-empty warn-text">
          {error}
        </div>
      ) : (
        data && (
          <div className="capital-history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.points} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#2b303b" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(t) =>
                    new Date(Number(t) * 1000).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                  axisLine={false}
                  tickLine={false}
                  minTickGap={50}
                  tick={{ fill: '#8f98aa', fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={money}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                  tick={{ fill: '#8f98aa', fontSize: 11 }}
                />
                <Tooltip
                  labelFormatter={(v) => day(Number(v))}
                  formatter={(v, name) => [
                    v == null ? 'No observation' : money(Number(v)),
                    String(name).startsWith('aave') ? 'Aave V3 + V4' : 'Morpho Blue',
                  ]}
                  contentStyle={{
                    background: '#20252e',
                    border: '1px solid #39404c',
                    borderRadius: 9,
                    color: '#edf0f6',
                  }}
                />
                <Area
                  type="linear"
                  dataKey={'morpho' + HISTORY_KEYS[metric]}
                  stroke="#69e4d3"
                  fill="#69e4d3"
                  fillOpacity={0.035}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey={'aave' + HISTORY_KEYS[metric]}
                  stroke="#b4a0ff"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      )}
      {data?.warnings.map((w) => (
        <p key={w} className="capital-warning">
          {w}
        </p>
      ))}
      <div className="capital-history-footer">
        <span>
          {data?.coverage ?? 'Historical observations from DefiLlama.'} Missing observations remain gaps. USD
          growth includes asset price movements.
        </span>
        <a href="https://defillama.com/protocols/Lending" target="_blank" rel="noopener noreferrer">
          DefiLlama
          <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}
