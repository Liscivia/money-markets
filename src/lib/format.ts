export const usd = (v: number | null | undefined, compact = true) =>
  v == null || !Number.isFinite(v)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 2 : 0,
      }).format(v);
export const pct = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;
export const num = (v: number) => new Intl.NumberFormat('en-US').format(v);
export const date = (v: string | number, long = false) =>
  new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(long ? { year: 'numeric' } : {}),
  });
