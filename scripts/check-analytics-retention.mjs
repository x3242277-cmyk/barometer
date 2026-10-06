import assert from 'node:assert/strict';
import { pruneUsage } from '../server/analytics-retention.mjs';

const now = Date.parse('2026-10-06T12:00:00Z');
const keys = new Set([
  'visits/2026-06-01/old',
  'visits/2026-07-08/boundary',
  'visits/2026-10-06/fresh',
  'other/2026-06-01/untouched',
]);
const store = {
  list() { return { async *[Symbol.asyncIterator]() {
    yield { blobs: [...keys].filter(key => key.startsWith('visits/')).map(key => ({ key })) };
  } }; },
  async delete(key) { keys.delete(key); },
};

const result = await pruneUsage(store, now);
assert.equal(result.removed, 1);
assert.deepEqual(result.fresh.map(blob => blob.key), ['visits/2026-07-08/boundary', 'visits/2026-10-06/fresh']);
assert(keys.has('other/2026-06-01/untouched'));
const cleanup = await pruneUsage(store, now, false);
assert.equal(cleanup.removed, 0);
assert.deepEqual(cleanup.fresh, []);
console.log('Passed: expired analytics records are removed; recent records and unrelated data remain.');
