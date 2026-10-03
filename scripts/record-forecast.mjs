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
  /* אותן מערכות כיול כמו בדפדפן (2022, 2021, 2020) — כדי שהמשקלים ותיקון
     הטעות הקבועה בתחזית הברומטר יהיו בצילום זהים למה שהאתר מציג */
  const hist2021 = read("historical-polls-2021");
  const hist2020 = read("historical-polls-2020");

  const ctx = vm.createContext({ console, Intl, Date, module: {}, window: undefined, document: undefined });
  for (const name of ["scenario", "app"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "assets", name + ".js"), "utf8"), ctx);
  }
  ctx.fx = { current, hist, hist2021, hist2020, firms };
  const result = JSON.parse(vm.runInContext(`
    S.cur = fx.current; S.hist = fx.hist; S.firms = fx.firms;
    S.elections = [[2022, fx.hist], [2021, fx.hist2021], [2020, fx.hist2020]].map(([year, data]) => ({ year, data, stats: scoreFirms(data) }));
    S.stats = combineCalibrations(S.elections);
    S.house = houseEffects(S.elections);
    S.houseIndustry = houseIndustry(S.house);
    S.forecastPolls = recentForForecast(S.cur.polls);
    S.series = buildSeries(S.forecastPolls);
    S.seriesScenario = buildSeries(S.forecastPolls.map(correctWithinBlocs));
    const __fsc = forecast("scenario", HIDE_FROM_HOME), __fw = forecast("weighted", HIDE_FROM_HOME);
    /* רשימות מתחת לאחוז החסימה (באחוזים) — כדי שגם תחזית ארכיון תציג אותן. */
    const __belowPct = b => Object.fromEntries(Object.entries(b).map(([id, v]) => [id, Math.round(v * 100) / 100]));
    JSON.stringify({
      scenario: largestRemainder(__fsc.parties),
      weighted: largestRemainder(__fw.parties),
      below: { scenario: __belowPct(__fsc.below), weighted: __belowPct(__fw.below) },
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
