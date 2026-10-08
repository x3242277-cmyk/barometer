#!/usr/bin/env node
/**
 * שומר צילום של התחזית הנוכחית ב-data/forecast-history.json בכל עדכון סקרים.
 * עמוד הבית משווה את שני הצילומים האחרונים כדי להציג חיווי שינוי (▲/▼) לכל מפלגה.
 *
 * פעם בשבוע — במוצאי שבת ב־20:00 (שעון ישראל) — נשמרת גם תחזית שבועית תחת
 * weekly: תחזית הברומטר, במנדטים לפי כללי הבחירות. העדכון הראשון אחרי השעה
 * הזו (ריצת 21:00 של הבוט) שומר אותה, עם התאריך של השבת.
 * היא מוצגת בעמוד "כל הסקרים" לצד הסקרים, ואינה נכנסת לשום חישוב.
 *
 *   node scripts/record-forecast.mjs
 *   node scripts/record-forecast.mjs --backfill-weekly   # משחזר שבועות קודמים מהארכיון
 *   node scripts/record-forecast.mjs --rebuild-weekly    # מוחק ומשחזר את כל השבועות
 *   node scripts/record-forecast.mjs --rebuild-snapshots # מחשב מחדש את כל הצילומים במנוע הנוכחי
 *                                                         (הסקרים של כל צילום — מהיסטוריית git)
 *
 * בכל צילום: scenario/weighted — שארית גדולה (לשחזור הממוצע הגולמי), ו־seats —
 * המנדטים לפי כללי הבחירות, כמו שהאתר מציג. בלי seats הגרף ועמוד הבית ערבבו
 * את שתי השיטות (שארית גדולה 58 מול כללי הבחירות 60, 04.10.2026).
 *
 * מריץ את מנוע התחזית האמיתי (assets/app.js) ב-sandbox, כדי שהמספרים יהיו
 * זהים למה שהדפדפן מחשב.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, "data", name + ".json"), "utf8"));
const FILE = path.join(ROOT, "data", "forecast-history.json");

const israelDay = ts => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
const israelHour = ts => Number(new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false })) % 24;
/* השעה hh:00 שעון ישראל בתאריך YYYY-MM-DD, כחותמת זמן (קיץ UTC+3, חורף UTC+2) */
export function israelTime(day, hh) {
  const guess = Date.parse(`${day}T${String(hh).padStart(2, "0")}:00:00Z`);
  return guess - ((israelHour(guess) - hh + 24) % 24) * 36e5;
}
/* השבוע של התחזית השבועית: התאריך של מוצאי השבת האחרון שבו כבר הגיעה 20:00 */
export function weekKey(ts) {
  const day = israelDay(ts), dow = new Date(day + "T00:00:00Z").getUTCDay();      // 6 = שבת
  let back = (dow + 1) % 7;                                                          // ימים מאז השבת
  if (back === 0 && israelHour(ts) < 20) back = 7;
  return new Date(Date.parse(day + "T00:00:00Z") - back * 864e5).toISOString().slice(0, 10);
}

/* מריץ את המנוע על סט סקרים. now — הזמן שהמנוע "חושב" שהוא עכשיו (לשחזור שבועות
   קודמים: חלון 8 הימים של התחזית נספר ממנו). select — האם לבחור את סקרי התצוגה
   (לכל היותר 4 לכל ערוץ) מתוך הסט, כמו שהאתר עושה; current-polls.json כבר בחור. */
export function runEngine(polls, { now = Date.now(), select = false } = {}) {
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
  ctx.fx = { polls, select, hist: read("historical-polls"), hist2021: read("historical-polls-2021"), hist2020: read("historical-polls-2020"), firms: read("pollsters"), demo: read("demographics"), haredi: read("haredi"), trends: read("trends") };
  return JSON.parse(vm.runInContext(`
    S.hist = fx.hist; S.firms = fx.firms;
    /* התוספת הדמוגרפית היא ממוצע שני המודלים — אותם נתונים כמו בדפדפן */
    S.demo = fx.demo; S.haredi = fx.haredi; S.trendsNat = fx.trends.national;
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
      modelVersion: "haredi-locality-parties-turnout-raam-polls-v4-no-anchor",
      scenario: largestRemainder(__fsc.parties),
      weighted: largestRemainder(__fw.parties),
      below: { scenario: __belowPct(__fsc.below), weighted: __belowPct(__fw.below) },
      polls: S.forecastPolls.length,
      firms: S.series.length,
      seats: allocateSeats(__fsc.parties),
      seatsWeighted: allocateSeats(__fw.parties)
    })
  `, ctx));
}

const weeklyEntry = (week, ts, r) => ({ week, date: week, time: "20:00", recordedAt: new Date(ts).toISOString(), modelVersion: r.modelVersion, polls: r.polls, firms: r.firms, seats: r.seats });
/* צילום: שארית גדולה + המנדטים לפי כללי הבחירות לשני הבסיסים */
const snapshotOf = ({ seats, seatsWeighted, ...rest }) => ({ ...rest, seats: { scenario: seats, weighted: seatsWeighted } });

export function recordForecast() {
  const current = read("current-polls");
  const r = runEngine(current.polls), result = snapshotOf(r), seats = r.seats;

  const history = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { snapshots: [] };
  const existing = history.snapshots.findIndex(s => s.updatedAt === current.generatedAt);
  if (existing < 0) {
    history.snapshots.push({ updatedAt: current.generatedAt, recordedAt: new Date().toISOString(), ...result });
  } else if (history.snapshots[existing].modelVersion !== result.modelVersion) {
    history.snapshots[existing] = { updatedAt: current.generatedAt, recordedAt: new Date().toISOString(), ...result };
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

/* שחזור שבועות שעברו: לכל מוצאי שבת מאז תחילת חלון הסקרים — הסקרים שבארכיון עד
   אותה שבת, והמנוע רץ כאילו השעה 20:00 באותו מוצאי שבת. */
export function backfillWeekly({ rebuild = false } = {}) {
  const archive = read("polls-archive").polls;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/config.json"), "utf8"));
  const history = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { snapshots: [] };
  if (rebuild) history.weekly = [];
  history.weekly ||= [];
  const from = Date.parse(cfg.from || "2026-08-01");
  let sat = from + ((6 - new Date(from).getUTCDay() + 7) % 7) * 864e5;              // השבת הראשונה
  const added = [];
  for (; israelTime(new Date(sat).toISOString().slice(0, 10), 20) <= Date.now(); sat += 7 * 864e5) {
    const week = new Date(sat).toISOString().slice(0, 10);
    if (history.weekly.some(w => w.week === week)) continue;
    /* בחודש אוגוסט חלק מהמכונים עוד מדדו את חד״ש–תע״ל ובל״ד לבד ואחרים את
       הרשימה המשותפת. בשחזור הן נספרות כרשימה אחת, כמו שהן רצות היום. */
    const polls = archive.filter(p => p.dateTimestamp < sat + 864e5).map(asJointList);
    const at = israelTime(week, 20);
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

/* לכל צילום משתמשים בסקרים שנשמרו בזמן העדכון. אם הקובץ אינו בהיסטוריית Git,
   משחזרים מהארכיון עד זמן הצילום. אף צילום אינו נשאר עם גרסת מודל קודמת. */
export function rebuildSnapshots() {
  const history = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const git = args => execFileSync("git", ["-c", `safe.directory=${ROOT.replace(/\\/g, "/")}`, ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 1e9 });
  const byTime = new Map();
  for (const h of git(["log", "--format=%H", "--", "data/current-polls.json"]).trim().split(/\s+/)) {
    try { const cur = JSON.parse(git(["show", `${h}:data/current-polls.json`])); if (!byTime.has(cur.generatedAt)) byTime.set(cur.generatedAt, cur); } catch { /* קומיט בלי הקובץ */ }
  }
  const current = read("current-polls"), archive = read("polls-archive").polls;
  byTime.set(current.generatedAt, current);
  const recalculatedAt = new Date().toISOString();
  let done = 0;
  history.snapshots = history.snapshots.map(snap => {
    const cur = byTime.get(snap.updatedAt);
    const now = Date.parse(snap.updatedAt);
    if (!Number.isFinite(now)) throw new Error(`Invalid forecast timestamp: ${snap.updatedAt}`);
    const polls = cur?.polls || archive.filter(p => p.dateTimestamp <= now && (!p.publishedAt || (typeof p.publishedAt === "number" ? p.publishedAt : Date.parse(p.publishedAt)) <= now));
    const result = snapshotOf(runEngine(polls, { now, select: !cur }));
    done++;
    return { updatedAt: snap.updatedAt, recordedAt: snap.recordedAt, recalculatedAt, pollSetSource: cur ? "repository" : "archive", ...result };
  });
  fs.writeFileSync(FILE, JSON.stringify(history, null, 2) + "\n");
  return [done, history.snapshots.length];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--rebuild-snapshots")) {
    const [done, all] = rebuildSnapshots();
    console.log(`· חושבו מחדש ${done} מתוך ${all} צילומים`);
  }
  if (process.argv.includes("--backfill-weekly") || process.argv.includes("--rebuild-weekly")) {
    const added = backfillWeekly({ rebuild: process.argv.includes("--rebuild-weekly") });
    console.log(`· שוחזרו ${added.length} שבועות: ${added.join(", ") || "—"}`);
  }
  const h = recordForecast();
  console.log(`· data/forecast-history.json — ${h.snapshots.length} צילומים · ${h.weekly.length} תחזיות שבועיות`);
}
