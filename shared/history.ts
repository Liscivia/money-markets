import type { MarketHistory } from './types.js';
const DAY = 86_400_000;
const millis = (value: number) => (value < 1e12 ? value * 1000 : value);

/** Align to the coarser observed cadence. Never forward-fill absent source observations. */
export function alignHistory(histories: (MarketHistory | null)[], rate: 'supplyApy' | 'borrowApy') {
  const cadences = histories.map((h) => {
    const timestamps = (h?.points ?? [])
      .filter((p) => p[rate] !== null)
      .map((p) => millis(p.timestamp))
      .sort((a, b) => a - b);
    const gaps = timestamps
      .slice(1)
      .map((t, i) => t - timestamps[i])
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] / DAY : 1;
  });
  const coarse = Math.max(1, ...cadences);
  const intervalDays = coarse < 2 ? 1 : coarse <= 10 ? 7 : coarse <= 21 ? 14 : 31;
  const interval = intervalDays * DAY;
  const map = new Map<number, { timestamp: number; A: number | null; B: number | null }>();
  histories.forEach((history, index) => {
    for (const point of [...(history?.points ?? [])].sort((a, b) => a.timestamp - b.timestamp)) {
      const time = Math.floor(millis(point.timestamp) / interval) * interval;
      const row = map.get(time) ?? { timestamp: time, A: null, B: null };
      if (point[rate] !== null) row[index === 0 ? 'A' : 'B'] = point[rate];
      map.set(time, row);
    }
  });
  const observed = [...map.keys()].sort((a, b) => a - b);
  if (observed.length)
    for (let time = observed[0]; time <= observed.at(-1)!; time += interval) {
      if (!map.has(time)) map.set(time, { timestamp: time, A: null, B: null });
    }
  return {
    chart: [...map.values()].sort((a, b) => a.timestamp - b.timestamp),
    intervalDays,
    label: intervalDays === 1 ? 'daily' : `${intervalDays}-day`,
  };
}
