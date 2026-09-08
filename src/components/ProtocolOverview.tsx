import { ArrowUpRight } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CAPITAL_LABELS,
  CAPITAL_METRICS,
  capitalShares,
  sumKnown,
  type CapitalMetric,
  type ProtocolCapitalSnapshot,
} from '../../shared/protocol-capital';
import type { Market } from '../../shared/types';
import CompetitionHistory from './CompetitionHistory';
import InfoTile from './InfoTile';

const protocols = ['Aave', 'Morpho'] as const;
const colors = { Aave: '#b4a0ff', Morpho: '#69e4d3' };
export const capitalMoney = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(value);
const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' UTC'
    : 'Unavailable';
const chartStyle = { background: '#20252e', border: '1px solid #39404c', borderRadius: 10, color: '#edf0f6' };
const definitions: Record<
  CapitalMetric,
  { subtitle: string; meaning: string; formula: string; caveat: string }
> = {
  depositsUsd: {
    subtitle: 'Including collateral · standardized proxy',
    meaning:
      'A common gross-capital measure for comparing pooled Aave with isolated Morpho markets. Both include borrower collateral, rather than comparing Aave reserve deposits with only Morpho loan deposits.',
    formula:
      'Gross deposits = DefiLlama TVL + outstanding debt, calculated per deployment at matching source timestamps, then summed.',
    caveat:
      'This is a derived proxy, not an exact ledger of supplier claims or unique investor capital. It inherits the adapter’s exclusions and can contain recursively deposited or receipt-token capital. It is not withdrawable cash.',
  },
  debtUsd: {
    subtitle: 'Capital currently owed by borrowers',
    meaning:
      'The USD value of outstanding loans. This compares actual borrowing activity, independent of how collateral is supplied.',
    formula:
      'Aave = reported V3 debt + V4 debt. Morpho = reported Blue debt. All values use DefiLlama’s borrowed series.',
    caveat:
      'Accrued interest is reflected according to the adapter. Token/lender exclusions, valuations and deployment coverage can differ from the live market APIs. Debt is not TVL or unused capacity.',
  },
  tvlUsd: {
    subtitle: 'DefiLlama · outstanding loans excluded',
    meaning:
      'The USD value retained by the protocol under DefiLlama’s accounting. Collateral held by the protocol is included; outstanding loan assets are excluded.',
    formula:
      'Aave = V3 underlying aToken balances + V4 underlying hub balances, after adapter exclusions. Morpho = Blue contract token balances (cash + collateral) + idle vault cash, after exclusions and de-duplication.',
    caveat:
      'Morpho borrower collateral is not lendable loan cash. Do not use TVL as the $5M liquidity test. These are Aave V3 + V4 and Morpho Blue, not their parent pages including legacy products.',
  },
};

function SourceTimes({ data, metric }: { data: ProtocolCapitalSnapshot | null; metric: CapitalMetric }) {
  return (
    <div className="info-sources">
      <strong>Source observations</strong>
      {data ? (
        data.protocols
          .flatMap((p) => p.components)
          .map((c) => (
            <div key={c.slug}>
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {c.label} <ArrowUpRight size={11} />
              </a>
              <span>
                {!c.available
                  ? 'Source unavailable'
                  : !c.reported
                    ? 'Network not reported'
                    : metric === 'depositsUsd'
                      ? `TVL ${when(c.tvlObservedAt)} · debt ${when(c.debtObservedAt)}`
                      : when(metric === 'tvlUsd' ? c.tvlObservedAt : c.debtObservedAt)}
              </span>
            </div>
          ))
      ) : (
        <p>Waiting for source observations. Unknown values are never shown as zero.</p>
      )}
    </div>
  );
}

function ComparisonCard({
  title,
  subtitle,
  values,
  children,
}: {
  title: string;
  subtitle: string;
  values: (number | null)[];
  children: ReactNode;
}) {
  const shares = capitalShares(values);
  return (
    <article className="capital-card">
      <div className="capital-card-title">
        <h3>{title}</h3>
        <InfoTile title={title}>{children}</InfoTile>
      </div>
      <p className="capital-card-subtitle">{subtitle}</p>
      <div className="capital-card-values">
        {protocols.map((protocol, i) => (
          <div key={protocol}>
            <span>
              <i style={{ background: colors[protocol] }} />
              {protocol}
            </span>
            <strong style={{ color: colors[protocol] }}>{capitalMoney(values[i])}</strong>
          </div>
        ))}
      </div>
      {shares ? (
        <>
          <div className="capital-share-track" aria-hidden="true">
            {shares.map((share, i) => (
              <span
                key={protocols[i]}
                style={{ background: colors[protocols[i]], width: `${share * 100}%` }}
              />
            ))}
          </div>
          <div className="capital-share-label">
            <span>Aave {(shares[0] * 100).toFixed(1)}%</span>
            <span>Morpho {(shares[1] * 100).toFixed(1)}%</span>
          </div>
        </>
      ) : (
        <p className="capital-incomplete">Share unavailable without two complete values</p>
      )}
      <small className="capital-card-source">DefiLlama basis · share of these two protocols</small>
    </article>
  );
}

/** Exported pure view keeps accounting/empty states independently testable. */
export function ProtocolCapitalView({
  data,
  chain,
  metric,
  onMetric,
  error = '',
  loading = false,
}: {
  data: ProtocolCapitalSnapshot | null;
  chain: string;
  metric: CapitalMetric;
  onMetric: (metric: CapitalMetric) => void;
  error?: string;
  loading?: boolean;
}) {
  const scope = chain === 'all' ? 'All networks' : chain;
  const values = protocols.map((p) => data?.protocols.find((row) => row.protocol === p)?.[metric] ?? null);
  const shares = capitalShares(values),
    total = sumKnown(values);
  const chartRows = protocols.map((name, i) => ({ name, value: values[i] }));
  const networks = [...(data?.networks ?? [])]
    .map((row) => ({
      chain: row.chain,
      Aave: row.protocols.find((p) => p.protocol === 'Aave')?.[metric] ?? null,
      Morpho: row.protocols.find((p) => p.protocol === 'Morpho')?.[metric] ?? null,
    }))
    .sort((a, b) => (b.Aave ?? 0) + (b.Morpho ?? 0) - ((a.Aave ?? 0) + (a.Morpho ?? 0)))
    .slice(0, 6);
  return (
    <>
      <div className="section-heading protocol-capital-heading">
        <div>
          <span className="eyebrow">THE COMPETITIVE RACE</span>
          <h2>Aave vs. Morpho</h2>
          <p>{scope} · Aave V3 + V4 / Morpho Blue</p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="status">
          {error}. API balances are not substituted for missing DefiLlama totals.
        </p>
      )}
      {loading && (
        <p className="capital-loading" role="status">
          Reading comparable protocol totals…
        </p>
      )}
      <div className="capital-cards-grid">
        {CAPITAL_METRICS.map((key) => (
          <ComparisonCard
            key={key}
            title={CAPITAL_LABELS[key]}
            subtitle={definitions[key].subtitle}
            values={protocols.map((p) => data?.protocols.find((row) => row.protocol === p)?.[key] ?? null)}
          >
            <p>{definitions[key].meaning}</p>
            <div className="info-formula">{definitions[key].formula}</div>
            <p>{definitions[key].caveat}</p>
            <p>
              <b>Scope:</b> {scope}. Both protocols, all source-reported assets. Missing data stays unknown.
              Aave components may have different observation times.
            </p>
            <SourceTimes data={data} metric={key} />
          </ComparisonCard>
        ))}
      </div>
      <div className="capital-chart-controls">
        <div>
          <h2>How the two compare</h2>
          <p>One metric drives both current charts and the history below.</p>
        </div>
        <div className="capital-metric-toggle" role="group" aria-label="Capital chart metric">
          {CAPITAL_METRICS.map((key) => (
            <button key={key} aria-pressed={metric === key} onClick={() => onMetric(key)}>
              {CAPITAL_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
      <div className="charts-grid capital-charts">
        <section className="panel distribution-panel">
          <div className="section-heading">
            <div>
              <h2>{CAPITAL_LABELS[metric]} share</h2>
              <p>{scope} · share of these two protocols</p>
            </div>
          </div>
          {shares ? (
            <div className="distribution-content">
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={chartRows}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={94}
                      paddingAngle={3}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      {protocols.map((p) => (
                        <Cell key={p} fill={colors[p]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => capitalMoney(Number(value))} contentStyle={chartStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <span>{CAPITAL_LABELS[metric].toUpperCase()}</span>
                  <strong>{capitalMoney(total)}</strong>
                </div>
              </div>
              <div className="protocol-legend">
                {protocols.map((p, i) => (
                  <div key={p}>
                    <div>
                      <span className={`protocol-badge ${p.toLowerCase()}`}>
                        <span className="protocol-dot" />
                        {p}
                      </span>
                      <strong>{(shares[i] * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="legend-track">
                      <span style={{ background: colors[p], width: `${shares[i] * 100}%` }} />
                    </div>
                    <small>{capitalMoney(values[i])} · DefiLlama basis</small>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="capital-chart-empty">
              {loading
                ? 'Loading source observations…'
                : 'Two complete values are required to compare shares.'}
            </div>
          )}
        </section>
        <section className="panel chain-panel">
          <div className="section-heading">
            <div>
              <h2>{CAPITAL_LABELS[metric]} by network</h2>
              <p>
                {chain === 'all' ? 'Top six by combined reported value' : scope} · same basis as the cards
              </p>
            </div>
            <div className="inline-legend">
              <span>
                <i className="aave-bg" />
                Aave
              </span>
              <span>
                <i className="morpho-bg" />
                Morpho
              </span>
            </div>
          </div>
          {networks.length && networks.some((n) => n.Aave !== null || n.Morpho !== null) ? (
            <div className="chart-area">
              <ResponsiveContainer width="100%" height={245}>
                <BarChart data={networks} barGap={3} margin={{ left: 0, right: 2, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="#2b303b" vertical={false} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="chain"
                    tick={{ fill: '#8f98aa', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={12}
                  />
                  <YAxis
                    tickFormatter={capitalMoney}
                    tick={{ fill: '#788294', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={65}
                  />
                  <Tooltip
                    filterNull={false}
                    cursor={{ fill: '#ffffff04' }}
                    formatter={(value, name) => [capitalMoney(value == null ? null : Number(value)), name]}
                    contentStyle={chartStyle}
                  />
                  <Bar
                    dataKey="Aave"
                    fill={colors.Aave}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="Morpho"
                    fill={colors.Morpho}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="capital-chart-empty">
              {loading ? 'Loading networks…' : 'No reported observations for this selection.'}
            </div>
          )}
          <p className="capital-chart-note">
            An absent bar means zero or no reported data; hover for the value (— = unknown). Partial
            deployment coverage is not a complete ecosystem total. Network bars use reported chain values,
            which can differ from global totals.
          </p>
        </section>
      </div>
      <CompetitionHistory
        chain={chain}
        metric={metric}
        onMetric={onMetric}
        sourceFetchedAt={data?.fetchedAt ?? null}
      />
    </>
  );
}

export default function ProtocolOverview({ markets, chain }: { markets: Market[]; chain: string }) {
  const [metric, setMetric] = useState<CapitalMetric>('depositsUsd');
  const [result, setResult] = useState<ProtocolCapitalSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Refetch when the API snapshot refreshes so observation age stays visible.
  const snapshotAt = useMemo(
    () =>
      markets
        .map((m) => m.fetchedAt)
        .sort()
        .at(-1),
    [markets],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/protocol-capital?chain=${encodeURIComponent(chain)}`, { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw Error(value.error ?? 'Protocol totals unavailable');
        return value as ProtocolCapitalSnapshot;
      })
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
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
  }, [chain, snapshotAt]);
  // Never flash a previous network's values under a newly selected heading.
  const data = result?.chain === chain ? result : null;
  return (
    <ProtocolCapitalView
      data={data}
      chain={chain}
      metric={metric}
      onMetric={setMetric}
      error={error}
      loading={loading}
    />
  );
}
