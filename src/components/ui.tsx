import { CircleHelp, ExternalLink, LoaderCircle, Search, Wallet } from 'lucide-react';
import { marketUrl } from '../../shared/market-links';
import type { Market } from '../../shared/types';

import { pct, usd } from '../lib/format';

export function ProtocolBadge({ protocol, small = false }: { protocol: string; small?: boolean }) {
  return (
    <span className={`protocol-badge ${protocol.toLowerCase()} ${small ? 'small' : ''}`}>
      <span className="protocol-dot" />
      {protocol}
    </span>
  );
}
export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="notice error">
      <CircleHelp size={17} />
      <span>{error}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state">
      <Search size={28} />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
    </div>
  );
}
export function Loading({ text = 'Reading public market data…' }: { text?: string }) {
  return (
    <div className="loading">
      <LoaderCircle size={25} className="spin" />
      <span>{text}</span>
      <small>Live sources can take a moment. No sample data is shown.</small>
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  icon: typeof Wallet;
  accent?: boolean;
}) {
  return (
    <div className={`metric-card ${accent ? 'accent' : ''}`}>
      <div className="metric-label">
        {label}
        <Icon size={17} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
export function ChartTip({
  active,
  payload,
  label,
  percent = false,
}: {
  active?: boolean;
  payload?: readonly {
    dataKey?: string | number;
    name?: string | number;
    color?: string;
    value?: number | null;
  }[];
  label?: string | number;
  percent?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((p, i) => (
        <div key={`${p.dataKey}-${i}`}>
          <span style={{ color: p.color }}>{p.name}</span>
          <b>{percent ? pct(p.value) : usd(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function MarketLink({
  market,
  label = 'Open market',
  compact = false,
}: {
  market: Market;
  label?: string;
  compact?: boolean;
}) {
  const href = marketUrl(market);
  if (!href)
    return (
      <span
        className="market-link-unavailable"
        title={
          market.chainId === 5042 && market.protocol === 'Morpho'
            ? 'Arc is listed in the Morpho API, but the official app currently returns Not Found for its markets.'
            : 'No verified official route for this market'
        }
      >
        Official app link unavailable
      </span>
    );
  return (
    <a
      className={compact ? 'table-action icon-button' : 'market-external-link'}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${market.protocol} ${market.version} · ${market.chain} · ${market.name} · ${market.asset.symbol}`}
      aria-label={`${label}: ${market.protocol} ${market.asset.symbol}, ${market.name}, ${market.chain}`}
    >
      {!compact && label}
      <ExternalLink size={compact ? 16 : 12} />
    </a>
  );
}
