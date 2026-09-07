#!/usr/bin/env node
/**
 * שומר צילום של התחזית הנוכחית ב-data/forecast-history.json בכל עדכון סקרים.
 * עמוד הבית משווה את שני הצילומים האחרונים כדי להציג חיווי שינוי (▲/▼) לכל מפלגה.
 *
 *   node scripts/record-forecast.mjs
 *
 * מריץ את מנוע התחזית האמיתי (assets/app.js) ב-sandbox, כדי שהמספרים יהיו
 * זהים למה שהדפדפן מחשב.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, "data", name + ".json"), "utf8"));

export function recordForecast() {
  const current = read("current-polls");
  const hist = read("historical-polls");
  const firms = read("pollsters");

  const ctx = vm.createContext({ console, Intl, Date, module: {}, window: undefined, document: undefined });
  for (const name of ["scenario", "app"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "assets", name + ".js"), "utf8"), ctx);
  }
  ctx.fx = { current, hist, firms };
  const result = JSON.parse(vm.runInContext(`
    S.cur = fx.current; S.hist = fx.hist; S.firms = fx.firms;
    S.stats = combineCalibrations([{ year: 2022, election: "הכנסת ה־25", stats: scoreFirms(S.hist) }]);
    S.forecastPolls = recentForForecast(S.cur.polls);
    S.series = buildSeries(S.forecastPolls);
    JSON.stringify({
      scenario: largestRemainder(forecast("scenario", HIDE_FROM_HOME).parties),
      weighted: largestRemainder(forecast("weighted", HIDE_FROM_HOME).parties),
      polls: S.forecastPolls.length,
      firms: S.series.length
    })
  `, ctx));

  const file = path.join(ROOT, "data", "forecast-history.json");
  const history = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { snapshots: [] };
  if (!history.snapshots.some(s => s.updatedAt === current.generatedAt)) {
    history.snapshots.push({ updatedAt: current.generatedAt, recordedAt: new Date().toISOString(), ...result });
  }
  /* שומרים את 40 הצילומים האחרונים — מספיק להצגת מגמה, בלי לנפח את הקובץ. */
  history.snapshots = history.snapshots
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-40);
  fs.writeFileSync(file, JSON.stringify(history, null, 2) + "\n");
  return history;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const h = recordForecast();
  console.log(`· data/forecast-history.json — ${h.snapshots.length} צילומים`);
}
