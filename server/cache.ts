import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CacheStore, Cached } from './store.js';
import type { HistoryPoint, MarketHistory, Snapshot } from '../shared/types.js';
export type { Cached } from './store.js';

export class Cache implements CacheStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, saved_at INTEGER NOT NULL);
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS aggregates (timestamp INTEGER NOT NULL, protocol TEXT NOT NULL, supplied REAL NOT NULL, borrowed REAL NOT NULL, liquidity REAL NOT NULL, PRIMARY KEY(timestamp, protocol));
      CREATE TABLE IF NOT EXISTS daily_rates (
        market_id TEXT NOT NULL, day INTEGER NOT NULL, observed_at INTEGER NOT NULL,
        point TEXT NOT NULL, PRIMARY KEY(market_id, day)
      );`);
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
  private savePoints(marketId: string, points: HistoryPoint[]) {
    const statement = this.db.prepare(`INSERT INTO daily_rates VALUES(?,?,?,?)
      ON CONFLICT(market_id,day) DO UPDATE SET observed_at=excluded.observed_at, point=excluded.point
      WHERE excluded.observed_at >= daily_rates.observed_at`);
    for (const point of points) {
      if (
        !Number.isFinite(point.timestamp) ||
        point.timestamp <= 0 ||
        point.timestamp > Date.now() / 1000 + 300 ||
        (point.supplyApy === null && point.borrowApy === null) ||
        [point.supplyApy, point.borrowApy].some((v) => v !== null && (!Number.isFinite(v) || v < 0))
      )
        continue;
      statement.run(
        marketId,
        Math.floor(point.timestamp / 86400) * 86400,
        point.timestamp,
        JSON.stringify(point),
      );
    }
  }
  recordSnapshot(snapshot: Snapshot) {
    const live = new Set(snapshot.providers.filter((p) => p.status === 'live').map((p) => p.protocol));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const market of snapshot.markets) {
        const observed = Date.parse(market.rateObservedAt ?? '');
        const fetched = Date.parse(market.fetchedAt);
        if (
          !live.has(market.protocol) ||
          !Number.isFinite(observed) ||
          !Number.isFinite(fetched) ||
          fetched - observed > 3600_000 ||
          observed > fetched + 300_000
        )
          continue;
        this.savePoints(market.id, [
          { timestamp: observed / 1000, supplyApy: market.supplyApy, borrowApy: market.borrowApy },
        ]);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  recordHistory(history: MarketHistory) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.savePoints(history.marketId, history.points);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  marketHistory(marketId: string, since: number): HistoryPoint[] {
    return this.db
      .prepare('SELECT point FROM daily_rates WHERE market_id=? AND day>=? AND observed_at>=? ORDER BY day')
      .all(marketId, Math.floor(since / 86400) * 86400, since)
      .map((row) => JSON.parse(String(row.point)) as HistoryPoint);
  }
  archiveStats() {
    return this.db
      .prepare(
        'SELECT COUNT(*) AS dailyPoints, COUNT(DISTINCT market_id) AS markets, MIN(observed_at) AS firstObservation, MAX(observed_at) AS lastObservation FROM daily_rates',
      )
      .get();
  }
  /** SQLite's online backup includes committed WAL data; never copy only the live .sqlite file. */
  async backupTo(path: string) {
    await backup(this.db, path);
  }
  maintain(now = Date.now()) {
    // Only reproducible response caches expire. Keep actual source observations.
    this.db.prepare("DELETE FROM cache WHERE key LIKE 'history:%' AND saved_at < ?").run(now - 7 * 86400_000);
    this.db.exec('PRAGMA optimize');
  }
  close() {
    this.db.close();
  }
}
