import { createApp } from '../server/app.js';
import { createDataService } from '../server/service.js';
import { MemoryCache } from '../server/store.js';

// One warm-instance cache shared by every API route. No filesystem or background timers.
export default createApp(createDataService(new MemoryCache()), { mode: 'public' });
