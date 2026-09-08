import type { HistoryPoint, MarketHistory, Snapshot } from '../shared/types.js';

/** Cache contract shared by the local SQLite store and ephemeral hosted store. */
export interface Cached<T> {
  value: T;
  savedAt: number;
}

export interface CacheStore {
  get<T>(key: string): Cached<T> | null;
  set(key: string, value: unknown, now?: number): void;
  aggregate(timestamp: number, protocol: string, supplied: number, borrowed: number, liquidity: number): void;
  aggregates(since: number): unknown[];
  recordSnapshot?(snapshot: Snapshot): void;
  recordHistory?(history: MarketHistory): void;
  marketHistory?(marketId: string, since: number): HistoryPoint[];
  close(): void;
}

/** Bounded, instance-local LRU. Never claims persistence across Vercel invocations. */
export class MemoryCache implements CacheStore {
  private entries = new Map<string, { json: string; savedAt: number; bytes: number }>();
  private bytes = 0;

  constructor(
    private maxEntries = 128,
    private maxBytes = 64 * 1024 * 1024,
  ) {}

  get<T>(key: string): Cached<T> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { value: JSON.parse(entry.json) as T, savedAt: entry.savedAt };
  }

  set(key: string, value: unknown, now = Date.now()): void {
    const json = JSON.stringify(value);
    const bytes = Buffer.byteLength(json);
    const previous = this.entries.get(key);
    if (previous) {
      this.bytes -= previous.bytes;
      this.entries.delete(key);
    }
    if (bytes > this.maxBytes) return;
    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { json, bytes, savedAt: now });
    this.bytes += bytes;
  }

  // Hourly observations need durable storage. Do not manufacture a hosted series.
  aggregate(): void {}
  aggregates(): unknown[] {
    return [];
  }
  close(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}
