import { createApp } from '../server/app.js';
import { createDataService } from '../server/service.js';
import { MemoryCache } from '../server/store.js';
import { createCollectorProxy } from '../server/proxy.js';

// One warm-instance cache shared by every API route. No filesystem or background timers.
const collectorUrl = process.env.MONEY_MARKETS_COLLECTOR_URL;
export default collectorUrl
  ? createCollectorProxy(collectorUrl.trim(), process.env.MONEY_MARKETS_COLLECTOR_TOKEN?.trim() ?? '')
  : createApp(createDataService(new MemoryCache()), { mode: 'public' });
