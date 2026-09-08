import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cache } from './cache.js';
import { createApp } from './app.js';
import { createDataService, SNAPSHOT_TTL } from './service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3100);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer from 1024 to 65535');
// Separate preview ports never overwrite another running app's persistent cache.
const cache = new Cache(
  resolve(root, '.data', port === 3100 ? 'money-markets.sqlite' : `money-markets-${port}.sqlite`),
);
const service = createDataService(cache);
const app = createApp(service, { mode: 'local', port });

if (process.argv.includes('--production')) {
  app.use(express.static(resolve(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist', 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const refresh = () =>
  void service.getSnapshot().catch(() => console.error('Market refresh unavailable; cached data retained.'));
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Money Markets — http://localhost:${port}`);
  refresh();
});
const timer = setInterval(refresh, SNAPSHOT_TTL);
timer.unref();
function shutdown() {
  clearInterval(timer);
  server.close(() => {
    cache.close();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
