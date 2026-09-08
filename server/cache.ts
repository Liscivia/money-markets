import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CacheStore, Cached } from './store.js';
export type { Cached } from './store.js';

export class Cache implements CacheStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, saved_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS aggregates (timestamp INTEGER NOT NULL, protocol TEXT NOT NULL, supplied REAL NOT NULL, borrowed REAL NOT NULL, liquidity REAL NOT NULL, PRIMARY KEY(timestamp, protocol));`);
  }
  get<T>(key: string): Cached<T> | null {
    const row = this.db.prepare('SELECT value, saved_at FROM cache WHERE key=?').get(key);
    if (!row) return null;
    try {
      return { value: JSON.parse(String(row.value)) as T, savedAt: Number(row.saved_at) };
    } catch {
      return null;
    }
  }
  set(key: string, value: unknown, now = Date.now()) {
    this.db
      .prepare(
        'INSERT INTO cache(key,value,saved_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,saved_at=excluded.saved_at',
      )
      .run(key, JSON.stringify(value), now);
  }
  aggregate(timestamp: number, protocol: string, supplied: number, borrowed: number, liquidity: number) {
    this.db
      .prepare('INSERT OR REPLACE INTO aggregates VALUES(?,?,?,?,?)')
      .run(timestamp, protocol, supplied, borrowed, liquidity);
  }
  aggregates(since: number) {
    return this.db.prepare('SELECT * FROM aggregates WHERE timestamp>=? ORDER BY timestamp').all(since);
  }
  close() {
    this.db.close();
  }
}
