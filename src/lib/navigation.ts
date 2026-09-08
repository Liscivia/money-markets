import { Layers3, LineChart as LineChartIcon, Newspaper, Zap } from 'lucide-react';
export const COLORS = { Aave: '#b4a0ff', Morpho: '#69e4d3' };
export const NAV = [
  { id: 'overview', label: 'Overview', icon: Layers3 },
  { id: 'rates', label: 'Rate explorer', icon: LineChartIcon },
  { id: 'opportunities', label: 'Looping', icon: Zap },
  { id: 'news', label: 'Intelligence', icon: Newspaper },
] as const;
export type View = (typeof NAV)[number]['id'];
