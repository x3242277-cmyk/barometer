#!/usr/bin/env node
/**
 * הבארומטר — עדכון סקרי שנת הבחירות
 * ----------------------------------
 *   node scripts/update-polls.mjs                       # סקרי RECENT_DAYS הימים האחרונים מוויקיפדיה
 *   node scripts/update-polls.mjs --full                # כל סקרי השנה שבוויקיפדיה
 *   node scripts/update-polls.mjs --file page.wikitext  # מקוד דף שמור (לבדיקה, בלי רשת)
 *   node scripts/update-polls.mjs --dry                 # בלי לכתוב, רק דיווח
 *
 * המקור: טבלת "Seat projections" בדף הוויקיפדיה של סקרי הבחירות (ראו
 * scripts/wiki-polls.mjs). עד 23.09.2026 המקור היה skarim.org, ומאז הוא חוסם
 * בקשות אוטומטיות — הסקרים שנאספו משם נשארים בארכיון כמו שהם.
 *
 * כלל התצוגה: כל סקרי שנת הבחירות שבמאגר, אבל לכל היותר maxPerOutlet
 * הסקרים האחרונים לכל כלי תקשורת. סקר חדש של ערוץ דוחק את החמישי שלו
 * מהתצוגה — ולא מוחק אותו: הארכיון ב-data/polls-archive.json שומר הכול.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWikiPolls, fetchWikitext } from "./wiki-polls.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(path.join(ROOT, "scripts/config.json"), "utf8"));
const args = process.argv.slice(2);
const argOf = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry");
const FULL = args.includes("--full");
const FILE = argOf("--file");
const YEAR = Number(argOf("--year")) || cfg.year || new Date().getFullYear();
const MAX_PER_OUTLET = Number(cfg.maxPerOutlet) || 4;
/* רצפת תאריך לתצוגה. אותו ערך נמצא גם ב-POLLS_FROM שב-assets/app.js. */
const FROM = cfg.from ? Date.parse(cfg.from) : -Infinity;
const WIKI = cfg.wikipedia;
const PAGE_URL = `https://en.wikipedia.org/wiki/${encodeURIComponent(WIKI.page.replace(/ /g, "_"))}`;

const log = (...a) => console.log("·", ...a);
const die = m => { console.error("✗", m); process.exit(1); };

/* חלון הסריקה בריצה רגילה. מספיק גדול כדי לתפוס תיקונים שעורכי ויקיפדיה
   מכניסים לסקרים מהימים האחרונים, וכדי לכסות כמה ימים של תקלות ברצף. */
const RECENT_DAYS = Number(cfg.recentDays) || 21;

/* ---------- 1. שליפה ---------- */
async function fetchWikiPolls() {
  let wikitext;
  if (FILE) { log("קורא קוד דף מקובץ מקומי:", FILE); wikitext = await readFile(FILE, "utf8"); }
  else {
    log("שולף מוויקיפדיה:", WIKI.page);
    const page = await fetchWikitext({ page: WIKI.page, userAgent: WIKI.userAgent });
    wikitext = page.wikitext;
    log(`גרסת דף ${page.revid}`);
  }
  const floor = FULL ? Date.UTC(YEAR, 0, 1) : Date.now() - RECENT_DAYS * 864e5;
  const { polls, skipped } = parseWikiPolls(wikitext, { year: YEAR, floor, parties: WIKI.parties, outlets: WIKI.outlets, pageUrl: PAGE_URL });
  log(`בוויקיפדיה ${polls.length} סקרים ${FULL ? `משנת ${YEAR}` : `מ-${RECENT_DAYS} הימים האחרונים`}`);
  skipped.forEach(s => console.warn(`   ! דולג: ${s}`));
  return polls;
}

/* ---------- 2. נרמול ----------
   שמות המפלגות, הלוגואים, השיוך לגוש ולוגו הערוץ נלקחים מהסקר האחרון בארכיון
   שמכיל אותם, כך שסקר מוויקיפדיה נראה באתר בדיוק כמו סקר שהגיע מ-skarim. */
const heDate = ts => { const d = new Date(ts); return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`; };

function makeNormalizer(archivePolls) {
  const newestFirst = [...archivePolls].sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  const partyInfo = new Map(), outletInfo = new Map();
  for (const p of newestFirst) {
    if (!outletInfo.has(p.sourceId) || (!outletInfo.get(p.sourceId).channel && p.channel))
      outletInfo.set(p.sourceId, { channel: p.channel || outletInfo.get(p.sourceId)?.channel || "", channelHebrewName: p.channelHebrewName });
    for (const x of p.parties) if (!partyInfo.has(x.id)) partyInfo.set(x.id, x);
  }
  return w => {
    const outlet = outletInfo.get(w.sourceId) || { channel: "", channelHebrewName: w.sourceId };
    const parties = [...w.seats].map(([id, mandates]) => {
      const info = partyInfo.get(id);
      return { id, name: info?.name || id, logoUrl: info?.logoUrl || "", mandates, alignment: info?.alignment || "Unknown" };
    }).sort((a, b) => b.mandates - a.mandates);
    return {
      id: `wiki-${w.sourceId}-${w.dateStr}`,
      date: heDate(w.ts),
      dateTimestamp: w.ts,
      publishedAt: w.ts,
      channel: outlet.channel,
      channelHebrewName: outlet.channelHebrewName,
      sourceId: w.sourceId,
      sourceUrl: w.sourceUrl,
      pollster: w.firm,
      parties
    };
  };
}

/* ---------- 3. אימות ---------- */
function validate(polls) {
  const problems = [];
  polls.forEach(p => {
    const sum = p.parties.reduce((s, x) => s + x.mandates, 0);
    if (!p.sourceId) problems.push(`סקר ${p.id}: אין sourceId — לא ניתן לשייך אותו למכון, והוא לא ייכנס לתחזית.`);
    if (!p.parties.length) problems.push(`סקר ${p.id}: אין מפלגות.`);
    else if (sum !== 120) problems.push(`סקר ${p.id} (${p.channelHebrewName}): סכום המנדטים ${sum} ולא 120.`);
    if (!p.dateTimestamp) problems.push(`סקר ${p.id}: תאריך לא תקין.`);
  });
  return problems;
}

/* ---------- 4. כלל התצוגה ----------
   אותו כלל בדיוק רץ גם בדפדפן (selectDisplayPolls ב-assets/app.js), כדי שסקר
   שנוסף לארכיון בלי הרצה של הסקריפט ידחק את הישן גם בתצוגה. */
export function selectDisplayPolls(polls, { year, maxPerOutlet, from = -Infinity }) {
  const seen = new Map();
  return polls
    .filter(p => p.dateTimestamp >= from && new Date(p.dateTimestamp).getFullYear() === year)
    .sort((a, b) => b.dateTimestamp - a.dateTimestamp || (b.publishedAt || 0) - (a.publishedAt || 0))
    .filter(p => {
      const key = p.channelHebrewName || p.sourceId;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      return n <= maxPerOutlet;
    });
}

/* ---------- 5. מיזוג עם הארכיון ---------- */
async function main() {
  const archPath = path.join(ROOT, "data/polls-archive.json");
  const archive = existsSync(archPath) ? JSON.parse(await readFile(archPath, "utf8")) : { polls: [] };
  const byId = new Map(archive.polls.map(p => [p.id, p]));

  /* ויקיפדיה רושמת את תאריך סיום העבודה בשטח, ו-skarim את תאריך הפרסום —
     לרוב יום-יומיים אחריו. לכן אותו סקר מופיע בשני המקורות בתאריכים שונים,
     ואי אפשר לזהות כפילות לפי תאריך. הכלל: מכל ערוץ לוקחים מוויקיפדיה רק
     סקרים שאחרי הסקר האחרון שכבר יש לנו ממקור אחר (skarim או הזנה ידנית).
     סקר שנערך אחרי פרסום של סקר אחר הוא בהכרח סקר חדש. */
  const latestOther = new Map();
  for (const p of archive.polls) if (!String(p.id).startsWith("wiki-"))
    latestOther.set(p.sourceId, Math.max(latestOther.get(p.sourceId) ?? -Infinity, p.dateTimestamp));

  const normalize = makeNormalizer(archive.polls);
  const incoming = [], ids = new Set();
  let covered = 0;
  for (const w of await fetchWikiPolls()) {
    if (w.ts <= (latestOther.get(w.sourceId) ?? -Infinity)) { covered++; continue; }
    const p = normalize(w);
    for (let n = 2; ids.has(p.id); n++) p.id = `wiki-${w.sourceId}-${w.dateStr}-${n}`; // שני סקרים של אותו ערוץ באותו יום
    ids.add(p.id);
    incoming.push(p);
  }
  if (covered) log(`${covered} מהם כבר במאגר ממקור קודם — דולגו`);

  const incomingProblems = validate(incoming);
  if (incomingProblems.length) throw new Error(incomingProblems.join("\n"));

  /* סקר מוויקיפדיה שכבר במאגר מתעדכן — עורכים מתקנים לפעמים מספרים. */
  let added = 0, changed = 0;
  for (const p of incoming) {
    const old = byId.get(p.id);
    if (!old) added++;
    else if (JSON.stringify(old.parties) !== JSON.stringify(p.parties)) changed++;
    byId.set(p.id, { ...old, ...p });
  }
  const all = [...byId.values()].sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  log(`חדשים: ${added} · תוקנו: ${changed} · בארכיון סה״כ: ${all.length}`);

  const shown = selectDisplayPolls(all, { year: YEAR, maxPerOutlet: MAX_PER_OUTLET, from: FROM });
  const outlets = new Set(shown.map(p => p.channelHebrewName));
  log(`בתצוגה: ${shown.length} סקרים · ${outlets.size} כלי תקשורת · עד ${MAX_PER_OUTLET} לכל אחד`);

  const problems = validate(shown);
  if (problems.length) { console.warn("\n⚠ אזהרות:"); problems.forEach(x => console.warn("   -", x)); console.warn(""); }
  if (!shown.length) die("אין סקרים לתצוגה — לא נכתב קובץ. בדקו את המקור.");

  const out = {
    generatedAt: new Date().toISOString(),
    selection: { from: cfg.from || null, year: YEAR, maxPerOutlet: MAX_PER_OUTLET, outlets: outlets.size },
    polls: shown
  };

  if (DRY) { log("--dry: לא נכתב דבר."); return; }
  await mkdir(path.join(ROOT, "data"), { recursive: true });
  await writeFile(path.join(ROOT, cfg.outFile), JSON.stringify(out, null, 2), "utf8");
  await writeFile(archPath, JSON.stringify({ updatedAt: out.generatedAt, polls: all }, null, 2), "utf8");
  log(`נכתב ${cfg.outFile} ו-data/polls-archive.json ✓`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("update-polls.mjs")) await main();
