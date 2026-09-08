export const DEFAULT_OPPORTUNITY_PARAMETERS = {
  minLiquidityUsd: 5_000_000,
  targetLeverage: 3,
  debtSizeUsd: 5_000_000,
};
export const MIN_OPPORTUNITY_USD = 1;
export const MAX_OPPORTUNITY_USD = 1_000_000_000;

/** Shared UI/API validation: $5M is a default, never an enforced minimum. */
export function parseOpportunityParameters(input: {
  minLiquidityUsd?: unknown;
  targetLeverage?: unknown;
  debtSizeUsd?: unknown;
}) {
  function number(value: unknown, fallback: number, min: number, max: number, label: string): number {
    if (value === undefined) return fallback;
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'string' && !value.trim())
    )
      throw new RangeError(`${label} must be a number.`);
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max)
      throw new RangeError(
        `${label} must be between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`,
      );
    return n;
  }
  return {
    minLiquidityUsd: number(
      input.minLiquidityUsd,
      DEFAULT_OPPORTUNITY_PARAMETERS.minLiquidityUsd,
      MIN_OPPORTUNITY_USD,
      MAX_OPPORTUNITY_USD,
      'Minimum liquidity ($)',
    ),
    debtSizeUsd: number(
      input.debtSizeUsd,
      DEFAULT_OPPORTUNITY_PARAMETERS.debtSizeUsd,
      MIN_OPPORTUNITY_USD,
      MAX_OPPORTUNITY_USD,
      'Debt size ($)',
    ),
    targetLeverage: number(
      input.targetLeverage,
      DEFAULT_OPPORTUNITY_PARAMETERS.targetLeverage,
      1.1,
      20,
      'Target leverage',
    ),
  };
}
