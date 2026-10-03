#!/usr/bin/env node
/**
 * שומר צילום של התחזית הנוכחית ב-data/forecast-history.json בכל עדכון סקרים.
 * עמוד הבית משווה את שני הצילומים האחרונים כדי להציג חיווי שינוי (▲/▼) לכל מפלגה.
 *
 * פעם בשבוע (השבוע מתחיל ביום ראשון, שעון ישראל) נשמרת גם תחזית שבועית תחת
 * weekly — תחזית הברומטר של העדכון הראשון בשבוע, במנדטים לפי כללי הבחירות.
 * היא מוצגת בעמוד "כל הסקרים" לצד הסקרים, ואינה נכנסת לשום חישוב.
 *
 *   node scripts/record-forecast.mjs
 *   node scripts/record-forecast.mjs --backfill-weekly   # משחזר שבועות קודמים מהארכיון
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
const FILE = path.join(ROOT, "data", "forecast-history.json");

/* יום ראשון של השבוע (שעון ישראל) כ-YYYY-MM-DD */
const israelDay = ts => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
export function weekKey(ts) {
  const day = Date.parse(israelDay(ts) + "T00:00:00Z");
  return new Date(day - new Date(day).getUTCDay() * 864e5).toISOString().slice(0, 10);
}

/* מריץ את המנוע על סט סקרים. now — הזמן שהמנוע "חושב" שהוא עכשיו (לשחזור שבועות
   קודמים: חלון 8 הימים של התחזית נספר ממנו). select — האם לבחור את סקרי התצוגה
   (לכל היותר 4 לכל ערוץ) מתוך הסט, כמו שהאתר עושה; current-polls.json כבר בחור. */
function runEngine(polls, { now = Date.now(), select = false } = {}) {
  const RealDate = Date;
  class EngineDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const ctx = vm.createContext({ console, Intl, Date: EngineDate, module: {}, window: undefined, document: undefined });
  for (const name of ["scenario", "app"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "assets", name + ".js"), "utf8"), ctx);
  }
  /* אותן מערכות כיול כמו בדפדפן (2022, 2021, 2020) — כדי שהמשקלים ותיקון
     הטעות הקבועה בתחזית הברומטר יהיו בצילום זהים למה שהאתר מציג */
  ctx.fx = { polls, select, hist: read("historical-polls"), hist2021: read("historical-polls-2021"), hist2020: read("historical-polls-2020"), firms: read("pollsters") };
  return JSON.parse(vm.runInContext(`
    S.hist = fx.hist; S.firms = fx.firms;
    S.cur = { polls: fx.select ? selectDisplayPolls(fx.polls) : fx.polls };
    S.elections = [[2022, fx.hist], [2021, fx.hist2021], [2020, fx.hist2020]].map(([year, data]) => ({ year, data, stats: scoreFirms(data) }));
    S.stats = combineCalibrations(S.elections);
    S.house = houseEffects(S.elections);
    S.houseIndustry = houseIndustry(S.house);
    S.forecastPolls = recentForForecast(S.cur.polls);
    S.series = buildSeries(S.forecastPolls);
    S.seriesScenario = buildSeries(S.forecastPolls.map(correctWithinBlocs));
    if (!S.forecastPolls.length) throw new Error("NO_POLLS");
    /* חד״ש–תע״ל מוסתרת כי היא רצה בתוך הרשימה המשותפת. בשבועות ששוחזרו מלפני
       האיחוד, כשהסקרים עוד מדדו אותה לבד, היא נספרת — אחרת הרשימות הערביות נעלמות. */
    const __joint = S.forecastPolls.some(p => p.parties.some(x => normId(x.id) === "reshima_meshutefet" && x.mandates > 0));
    const __hide = __joint ? HIDE_FROM_HOME : new Set();
    const __fsc = forecast("scenario", __hide), __fw = forecast("weighted", __hide);
    /* רשימות מתחת לאחוז החסימה (באחוזים) — כדי שגם תחזית ארכיון תציג אותן. */
    const __belowPct = b => Object.fromEntries(Object.entries(b).map(([id, v]) => [id, Math.round(v * 100) / 100]));
    JSON.stringify({
      scenario: largestRemainder(__fsc.parties),
      weighted: largestRemainder(__fw.parties),
      below: { scenario: __belowPct(__fsc.below), weighted: __belowPct(__fw.below) },
      polls: S.forecastPolls.length,
      firms: S.series.length,
      seats: allocateSeats(__fsc.parties)
    })
  `, ctx));
}

const weeklyEntry = (week, ts, r) => ({ week, date: israelDay(ts), recordedAt: new Date(ts).toISOString(), polls: r.polls, firms: r.firms, seats: r.seats });

export function recordForecast() {
  const current = read("current-polls");
  const { seats, ...result } = runEngine(current.polls);

  const history = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { snapshots: [] };
  if (!history.snapshots.some(s => s.updatedAt === current.generatedAt)) {
    history.snapshots.push({ updatedAt: current.generatedAt, recordedAt: new Date().toISOString(), ...result });
  }
  /* שומרים את 40 הצילומים האחרונים — מספיק להצגת מגמה, בלי לנפח את הקובץ. */
  history.snapshots = history.snapshots
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-40);
  /* התחזית השבועית — רק אם עוד לא נשמרה תחזית לשבוע הזה. נשמרת לתמיד. */
  history.weekly ||= [];
  const week = weekKey(Date.now());
  if (!history.weekly.some(w => w.week === week)) {
    history.weekly.push(weeklyEntry(week, Date.now(), { ...result, seats }));
  }
  history.weekly.sort((a, b) => a.week.localeCompare(b.week));
  fs.writeFileSync(FILE, JSON.stringify(history, null, 2) + "\n");
  return history;
}

const JOINT_PARTS = new Set(["hadash_taal", "balad"]);
function asJointList(p) {
  if (!p.parties.some(x => JOINT_PARTS.has(x.id))) return p;
  const joint = p.parties.filter(x => x.id === "reshima_meshutefet" || JOINT_PARTS.has(x.id)).reduce((t, x) => t + x.mandates, 0);
  const base = p.parties.find(x => x.id === "reshima_meshutefet") || p.parties.find(x => x.id === "hadash_taal");
  return { ...p, parties: [...p.parties.filter(x => x.id !== "reshima_meshutefet" && !JOINT_PARTS.has(x.id)), { ...base, id: "reshima_meshutefet", name: "הרשימה המשותפת", mandates: joint }] };
}

/* שחזור שבועות שעברו: לכל יום ראשון מאז תחילת חלון הסקרים — הסקרים שבארכיון עד
   סוף השבוע הקודם (שבת), והמנוע רץ כאילו השעה 09:00 באותו יום ראשון. */
export function backfillWeekly() {
  const archive = read("polls-archive").polls;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/config.json"), "utf8"));
  const history = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { snapshots: [] };
  history.weekly ||= [];
  const thisWeek = weekKey(Date.now());
  let sunday = Date.parse(weekKey(Date.parse(cfg.from || "2026-08-01")) + "T00:00:00Z");
  const added = [];
  for (; new Date(sunday).toISOString().slice(0, 10) < thisWeek; sunday += 7 * 864e5) {
    const week = new Date(sunday).toISOString().slice(0, 10);
    if (history.weekly.some(w => w.week === week)) continue;
    /* בחודש אוגוסט חלק מהמכונים עוד מדדו את חד״ש–תע״ל ובל״ד לבד ואחרים את
       הרשימה המשותפת. בשחזור הן נספרות כרשימה אחת, כמו שהן רצות היום. */
    const polls = archive.filter(p => p.dateTimestamp < sunday).map(asJointList);
    const at = sunday + 6 * 3600e3;                       // 09:00 שעון ישראל
    let r;
    try { r = runEngine(polls, { now: at, select: true }); }
    catch (e) { if (String(e.message).includes("NO_POLLS")) continue; throw e; }
    if (r.firms < 3) continue;                            // שבוע עם פחות משלושה מכונים — לא תחזית
    history.weekly.push(weeklyEntry(week, at, r));
    added.push(week);
  }
  history.weekly.sort((a, b) => a.week.localeCompare(b.week));
  fs.writeFileSync(FILE, JSON.stringify(history, null, 2) + "\n");
  return added;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--backfill-weekly")) {
    const added = backfillWeekly();
    console.log(`· שוחזרו ${added.length} שבועות: ${added.join(", ") || "—"}`);
  }
  const h = recordForecast();
  console.log(`· data/forecast-history.json — ${h.snapshots.length} צילומים · ${h.weekly.length} תחזיות שבועיות`);
}
