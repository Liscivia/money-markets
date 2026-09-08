export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function integerParameter(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw new HttpError(400, 'Expected an integer parameter');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new HttpError(400, `Parameter must be between ${min} and ${max}`);
  return parsed;
}

export function chainParameter(value: unknown): string {
  if (value === undefined) return 'all';
  if (typeof value !== 'string' || !/^[\w .()-]{1,80}$/.test(value))
    throw new HttpError(400, 'Invalid chain');
  return value;
}
