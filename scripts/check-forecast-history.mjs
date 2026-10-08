import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runEngine } from './record-forecast.mjs';
const read = name => JSON.parse(fs.readFileSync(`data/${name}.json`, 'utf8'));
const history = read('forecast-history'), current = read('current-polls'), archive = read('polls-archive');
const version = 'haredi-locality-parties-turnout-raam-polls-v4-no-anchor';
assert.ok(history.snapshots.length > 0 && history.snapshots.length <= 40);
assert.ok(history.weekly.length >= 8);
for (const item of [...history.snapshots, ...history.weekly]) assert.equal(item.modelVersion, version);
for (const snap of history.snapshots) {
  if (snap.recalculatedAt) {
    assert.ok(Number.isFinite(Date.parse(snap.recalculatedAt)));
    assert.ok(['repository', 'archive'].includes(snap.pollSetSource));
  }
  for (const seats of Object.values(snap.seats)) {
    assert.equal(Object.values(seats).reduce((a, b) => a + b, 0), 120);
    assert.ok(Object.values(seats).every(n => Number.isInteger(n) && n >= 0));
  }
}
for (const week of history.weekly) assert.equal(Object.values(week.seats).reduce((a, b) => a + b, 0), 120);
const git = args => execFileSync('git', ['-c', `safe.directory=${process.cwd().replace(/\\/g, '/')}`, ...args], { encoding: 'utf8' });
const selected = [history.snapshots[0], history.snapshots[19], history.snapshots.at(-1)];
const byTime = new Map([[current.generatedAt, current]]);
for (const hash of git(['log', '--format=%H', '--', 'data/current-polls.json']).trim().split(/\s+/)) {
  const data = JSON.parse(git(['show', `${hash}:data/current-polls.json`]));
  if (!byTime.has(data.generatedAt)) byTime.set(data.generatedAt, data);
  if (selected.every(s => byTime.has(s.updatedAt))) break;
}
for (const snap of selected) {
  const now = Date.parse(snap.updatedAt), original = byTime.get(snap.updatedAt);
  const polls = original?.polls || archive.polls.filter(p => p.dateTimestamp <= now && (!p.publishedAt || (typeof p.publishedAt === 'number' ? p.publishedAt : Date.parse(p.publishedAt)) <= now));
  const result = runEngine(polls, { now, select: !original });
  assert.deepEqual(snap.seats.scenario, result.seats, `historical forecast differs at ${snap.updatedAt}`);
  assert.deepEqual(snap.seats.weighted, result.seatsWeighted);
  assert.equal(snap.polls, result.polls);
  const future = structuredClone(polls[0]);
  future.id = 'future-poll-for-test'; future.dateTimestamp = now + 864e5; future.publishedAt = now + 864e5;
  assert.deepEqual(runEngine([...polls, future], { now, select: !original }).seats, result.seats, 'future polls changed an earlier forecast');
}
console.log(`Passed: all ${history.snapshots.length} snapshots and ${history.weekly.length} weekly forecasts use the current model, total 120 seats, and match original dated poll sets without future polls.`);
