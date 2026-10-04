import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTheMadadHtml } from "./themadad-source.mjs";
import { checkRemotePolls } from "../server/poll-check.mjs";

const firms = JSON.parse(readFileSync("data/pollsters.json", "utf8"));
const cfg = JSON.parse(readFileSync("scripts/config.json", "utf8"));
const firmBySource = Object.fromEntries(Object.entries(firms.sourceMap).map(([key, value]) => [key, value.firm]));
const row = {
  pollNumber: "735", publisher: "ערוץ 14", pollster: "שלמה פילבר", date: "2026-09-23",
  likud: "32", eisenkot: "22", shas: "11", avoda: "9", bennett: "7",
  israelBeitanu: "7", unifiedArabList: "7", utj: "7", smotrich: "7",
  otzma: "6", raam: "5"
};
const parse = rows => parseTheMadadHtml(`<script>const allPolls = ${JSON.stringify(rows)};</script>`, {
  year: 2026, from: Date.parse("2026-09-01"), firmBySource, trustSourceMap: cfg.madadTrustSourceMap
});
const result = parse([row, { ...row, pollNumber: "736", publisher: "ישראל היום", pollster: "דודי חסיד" }]);
assert.equal(result.polls.length, 2);
assert.deepEqual(result.polls.map(p => p.sourceId), ["channel_14", "israel_hayom"]);
assert.equal(result.polls[0].parties.reduce((n, p) => n + p.mandates, 0), 120);
assert.equal(result.polls[0].parties.find(p => p.id === "yashar")?.mandates, 22);
assert.throws(() => parse([{ ...row, likud: "31" }]), /119 במקום 120/);
assert.throws(() => parse([{ ...row, mysteryParty: "1" }]), /ערך מפלגה לא מוכר/);
const html = `<script>const allPolls = ${JSON.stringify([row])};</script>`;
const remote = await checkRemotePolls({
  now: Date.parse("2026-09-24T09:00:00Z"), timeoutMs: 1000,
  fetcher: async url => { assert.equal(url, "https://themadad.com/polls26/"); return new Response(html); }
});
assert.equal(remote.status, "complete");
assert.equal(remote.polls[0].sourceId, "channel_14");
console.log("Passed: alternate poll feed mapping, firm attribution and 120-seat validation.");
