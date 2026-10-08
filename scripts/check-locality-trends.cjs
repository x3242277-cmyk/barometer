const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = process.cwd();
const source = fs.readFileSync('scripts/build-locality-trends.mjs', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/const ROOT = .*;/, 'const ROOT = taskRoot;');
function build(change) {
  const outputs = new Map();
  const context = vm.createContext({ taskRoot: root, path, console: { log() {} },
    readFileSync(file) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (change && /[\\/]elections[\\/](2019b|2020|2021)\.json$/.test(file)) change(data);
      return JSON.stringify(data);
    },
    writeFileSync(file, value) { outputs.set(path.basename(file), value); },
    statSync(file) { return { size: Buffer.byteLength(outputs.get(path.basename(file))) }; }
  });
  vm.runInContext(source, context);
  return JSON.parse(outputs.get('trends.json'));
}
const baseline = build(), actual = JSON.parse(fs.readFileSync('data/trends.json', 'utf8'));
assert.deepEqual(baseline, actual, 'generated locality data is stale');
for (const [i, id] of ['shas', 'utj'].entries()) {
  const votes = Object.values(actual.loc).reduce((s, l) => s + l.hf[i], 0);
  assert.ok(Math.abs(votes - actual.national.partyForecast[id].votes) < 1e-6);
  assert.ok(Math.abs(120 * votes / actual.national.projectedValid - actual.national.partyForecast[id].seats) < 1e-10);
}
const shifted = build(election => {
  const shas = 4 + election.parties.findIndex(p => p.id === 'shas');
  const utj = 4 + election.parties.findIndex(p => p.id === 'utj');
  for (const row of election.rows) {
    // Transfer earlier support within the Haredi group; 2022, electorate and turnout stay identical.
    const transfer = Math.floor(row[utj] * .1);
    row[shas] += transfer; row[utj] -= transfer;
  }
});
assert.ok(shifted.national.partyForecast.shas.seats < baseline.national.partyForecast.shas.seats, 'earlier Shas gains must lower its own extrapolated trend');
assert.ok(shifted.national.partyForecast.utj.seats > baseline.national.partyForecast.utj.seats, 'UTJ must respond to its own history');
assert.equal(shifted.national.eligible26, baseline.national.eligible26);
assert.equal(shifted.national.projectedValid, baseline.national.projectedValid);
const ratio = t => t.national.partyForecast.shas.seats / t.national.partyForecast.utj.seats;
assert.ok(Math.abs(ratio(shifted) - ratio(baseline)) > .01, 'a fixed split must not replace the party histories');
for (const loc of Object.values(actual.loc)) {
  assert.equal(loc.h.length, 8);
  assert.ok(loc.hf.every(v => Number.isFinite(v) && v >= 0));
  assert.ok(loc.hf[0] + loc.hf[1] <= loc.f[2] + 1);
}
console.log('Passed: locality histories, separate party trends, historical support perturbation, turnout and electorate isolation, national vote sums and generated data.');
