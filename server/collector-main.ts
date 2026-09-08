import express from 'express';
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Cache } from './cache.js';
import { createApp } from './app.js';
import { createDataService, SNAPSHOT_KEY } from './service.js';
import { refreshScheduledCompetition, useScheduledCompetition } from './competition.js';
import {
  CollectorJobs,
  collectorAccess,
  collectorReadService,
  collectedSnapshot,
  DAILY_INTERVAL,
  MARKET_INTERVAL,
  NEWS_INTERVAL,
} from './collector.js';
import type { Snapshot } from '../shared/types.js';

const port = Number(process.env.COLLECTOR_PORT ?? 3102);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid collector port');
const stateDir = resolve(process.env.COLLECTOR_STATE_DIR ?? '.data/collector');
const releaseDirectory = basename(realpathSync(process.cwd()));
const release =
  process.env.COLLECTOR_RELEASE ??
  (/^[a-f0-9]{40}$/.test(releaseDirectory) ? releaseDirectory : 'development');
const tokenPath = process.env.COLLECTOR_TOKEN_FILE;
if (!tokenPath) throw new Error('COLLECTOR_TOKEN_FILE is required');
const token = readFileSync(tokenPath, 'utf8').trim();
const cache = new Cache(join(stateDir, 'money-markets.sqlite'));
const producer = createDataService(cache);
const service = collectorReadService(producer, cache);
const jobs = new CollectorJobs(cache);
useScheduledCompetition(cache);

const app = express();
app.disable('x-powered-by');
app.use(collectorAccess(token));
app.use(
  createApp(
    service,
    { mode: 'public' },
    {
      storage: 'sqlite',
      health: () => {
        const snapshot = cache.get<Snapshot>(SNAPSHOT_KEY);
        return {
          collector: {
            release,
            marketIntervalMinutes: MARKET_INTERVAL / 60_000,
            newsIntervalMinutes: NEWS_INTERVAL / 60_000,
            snapshotFetchedAt: snapshot?.value.fetchedAt ?? null,
            providers: snapshot
              ? collectedSnapshot(cache).providers.map(({ protocol, status, fetchedAt, marketCount }) => ({
                  protocol,
                  status,
                  fetchedAt,
                  marketCount,
                }))
              : [],
            archive: cache.archiveStats(),
            jobs: jobs.states(),
          },
        };
      },
    },
  ),
);

async function warmHistories() {
  const snapshot = collectedSnapshot(cache);
  const live = new Set(snapshot.providers.filter((p) => p.status === 'live').map((p) => p.protocol));
  if (!live.size) throw new Error('No fresh markets for backfill');
  const queue = (['Aave', 'Morpho'] as const).flatMap((protocol) =>
    snapshot.markets
      .filter((m) => m.protocol === protocol && live.has(protocol) && m.listed && m.totalSupplyUsd >= 5e6)
      .sort((a, b) => b.totalBorrowUsd - a.totalBorrowUsd || b.totalSupplyUsd - a.totalSupplyUsd)
      .slice(0, 20),
  );
  let failures = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (queue.length) {
        const market = queue.shift()!;
        const key = `collector:backfilled:${market.id}`;
        try {
          const history = await producer.history(market, cache.get(key) ? 7 : 365);
          if (!history.points.length || history.warning) {
            failures++;
            continue;
          }
          cache.set(key, { fetchedAt: history.fetchedAt });
        } catch {
          failures++;
        }
      }
    }),
  );
  if (failures) throw new Error('Some market histories were unavailable');
}

async function dailyBackup() {
  cache.maintain();
  const directory = join(stateDir, 'backups');
  mkdirSync(directory, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const target = join(directory, `money-markets-${date}.sqlite`);
  const pending = `${target}.pending`;
  await cache.backupTo(pending);
  renameSync(pending, target);
  // Only this collector's dated backup files are eligible for retention cleanup.
  const backups = readdirSync(directory)
    .filter((name) => /^money-markets-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
    .sort();
  for (const expired of backups.slice(0, -14)) unlinkSync(join(directory, expired));
}

let stopping = false;
function tick() {
  if (stopping) return;
  void jobs.run('markets', MARKET_INTERVAL, async () => {
    const snapshot = await producer.getSnapshot(true);
    if (snapshot.providers.some((p) => p.status !== 'live')) {
      cache.set(SNAPSHOT_KEY, snapshot);
      throw new Error('Partial market collection');
    }
  });
  void jobs.run('news', NEWS_INTERVAL, async () => {
    const news = await producer.news(true);
    if (news.sources.some((s) => s.status !== 'live')) throw new Error('Partial news collection');
  });
  void jobs.run(
    'capital',
    DAILY_INTERVAL,
    async () => {
      const capital = await refreshScheduledCompetition();
      if (capital.warnings.length) throw new Error('Partial capital collection');
    },
    NEWS_INTERVAL,
  );
  if (cache.get(SNAPSHOT_KEY)) void jobs.run('history', DAILY_INTERVAL, warmHistories, NEWS_INTERVAL);
  // First backup follows initial collection and backfill, so it is useful immediately.
  if (jobs.states().history?.finishedAt) void jobs.run('backup', DAILY_INTERVAL, dailyBackup);
}
const server = app.listen(port, '127.0.0.1', () => {
  console.log(
    JSON.stringify({
      service: 'money-markets-collector',
      port,
      release,
    }),
  );
  tick();
});
server.requestTimeout = 100_000;
server.headersTimeout = 15_000;
const timer = setInterval(tick, 30_000);
function shutdown() {
  stopping = true;
  clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
