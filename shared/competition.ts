import type { CapitalHistoryPoint } from './protocol-capital.js';

export interface CompetitionHistory {
  points: CapitalHistoryPoint[];
  fetchedAt: string;
  source: string;
  coverage: string;
  warnings: string[];
}
