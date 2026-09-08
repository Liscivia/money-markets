import test from 'node:test';
import assert from 'node:assert/strict';
import { Cache } from '../server/cache.js';
import { plainText } from '../server/news.js';

test('SQLite cache replaces values atomically and preserves original freshness', () => {
  const cache = new Cache(':memory:');
  assert.equal(cache.get('unknown'), null);
  cache.set('snapshot', { markets: [1] }, 10);
  assert.deepEqual(cache.get('snapshot'), { value: { markets: [1] }, savedAt: 10 });
  cache.set('snapshot', { markets: [2] }, 20);
  assert.deepEqual(cache.get('snapshot'), { value: { markets: [2] }, savedAt: 20 });
  cache.close();
});
test('feed excerpts remove script/style and HTML without injecting markup', () => {
  assert.equal(
    plainText('<script>bad()</script><p>Supply &amp; borrow</p><style>hidden</style>'),
    'Supply & borrow',
  );
});
