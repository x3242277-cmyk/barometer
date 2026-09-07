#!/usr/bin/env node
/**
 * הבארומטר — עדכון סקרי שנת הבחירות
 * ----------------------------------
 *   node scripts/update-polls.mjs                  # דף הבית + סייטמאפ של RECENT_DAYS האחרונים
 *   node scripts/update-polls.mjs --full           # דף הבית + סייטמאפ של כל סקרי השנה
 *   node scripts/update-polls.mjs --file raw.json  # מקובץ מקומי (לבדיקה)
 *   node scripts/update-polls.mjs --dry            # בלי לכתוב, רק דיווח
 *
 * כלל התצוגה: כל סקרי שנת הבחירות שבמאגר, אבל לכל היותר maxPerOutlet
 * הסקרים האחרונים לכל כלי תקשורת. סקר חדש של ערוץ דוחק את החמישי שלו
 * מהתצוגה — ולא מוחק אותו: הארכיון ב-data/polls-archive.json שומר הכול.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const log = (...a) => console.log("·", ...a);
const die = m => { console.error("✗", m); process.exit(1); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, accept = "text/html") {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), cfg.requestTimeoutMs ?? 20000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": cfg.userAgent, Accept: accept } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

const nextData = html => {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("לא נמצא __NEXT_DATA__ — ייתכן שמבנה skarim.org השתנה.");
  return JSON.parse(m[1]);
};

/* חלון ברירת המחדל לסריקת הסייטמאפ בריצה יומית. מספיק גדול כדי לכסות
   כמה ימים של תקלות בוט ברצף, קטן מספיק שהסריקה תישאר זולה. --full מתעלם
   ממנו וסורק את כל השנה. */
const RECENT_DAYS = Number(cfg.recentDays) || 21;

/* ---------- 1. שליפה ----------
   דף הבית (props.pageProps.landing.initialPolls) מחזיר סקר אחד בלבד לכל
   ערוץ. אם ערוץ פרסם שני סקרים מאז הריצה הקודמת, הישן נופל ממנו ואבוד —
   ולכן זה לא מקור אמת. הסייטמאפ הוא כן: הוא מונה כל דף סקר. הריצה היומית
   מושכת את שניהם — דף הבית לזריזות, והסייטמאפ (חלון RECENT_DAYS) כרשת
   ביטחון שתופסת כל מה שדף הבית פספס. */
async function fetchLatest() {
  if (FILE) { log("קורא מקובץ מקומי:", FILE); return JSON.parse(await readFile(FILE, "utf8")); }
  log("שולף מ:", cfg.sourceUrl);
  return nextData(await get(cfg.sourceUrl));
}

/* הסלאג הוא <ערוץ>-<שנה>-<חודש>-<יום>, ולכן אפשר לבחור מתוכו את הסקרים
   שנרצה עוד לפני שמורידים ולו דף אחד. */
const parseSlug = url => {
  const m = /\/polls\/(.+)-(\d{4})-(\d{2})-(\d{2})\/?$/.exec(url);
  return m ? { url, outlet: m[1], year: +m[2], ts: Date.parse(`${m[2]}-${m[3]}-${m[4]}`) } : null;
};

async function fetchFromSitemap(knownUrls, recentDays) {
  log("סורק את סייטמאפ הסקרים:", cfg.sitemapUrl);
  const xml = await get(cfg.sitemapUrl, "application/xml");
  let all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => parseSlug(m[1])).filter(x => x && x.year === YEAR);
  if (recentDays != null) {
    const floor = Date.now() - recentDays * 864e5;
    all = all.filter(x => x.ts >= floor);
  }
  all.sort((a, b) => b.ts - a.ts);
  log(`בסייטמאפ ${all.length} סקרים ${recentDays != null ? `מ-${recentDays} הימים האחרונים` : `משנת ${YEAR}`}`);

  /* כל דף שעדיין לא במאגר. סקרים ישנים נשמרו בלי sourceUrl, ולכן בריצה
     הראשונה אחרי המעבר לסייטמאפ הם ייסרקו שוב — המיזוג לפי id מבטיח שזה
     לא יוצר כפילות, וזו עלות חד-פעמית. */
  const todo = all.filter(x => !knownUrls.has(x.url));
  log(`${todo.length} עדיין לא במאגר`);

  const out = [];
  for (const [i, x] of todo.entries()) {
    try {
      const poll = nextData(await get(x.url)).props?.pageProps?.data?.poll;
      if (poll?.parties?.length) out.push({ ...poll, sourceUrl: x.url });
      else console.warn(`   ! ${x.url}: אין מפלגות בדף`);
    } catch (e) { console.warn(`   ! ${x.url}: ${e.message}`); }
    if (i % 10 === 9) log(`   ${i + 1}/${todo.length}`);
    if (cfg.requestDelayMs) await sleep(cfg.requestDelayMs);
  }
  return out;
}

/* ---------- 2. נרמול ---------- */
function pickArray(raw) {
  if (Array.isArray(raw)) return raw;
  const nested = raw?.props?.pageProps?.landing?.initialPolls;
  if (Array.isArray(nested)) return nested;
  for (const k of ["polls", "data", "items", "results"]) if (Array.isArray(raw?.[k])) return raw[k];
  die("לא נמצא מערך סקרים בתשובת המקור (props.pageProps.landing.initialPolls).");
}

const ALIGNMENTS = new Set(["Coalition", "Opposition", "Arabs", "Unknown"]);
/* מיזוג מזהים לצורת קנון אחת (הרשימה שרצה משתנה שם לפי מערכת בחירות) */
const ID_ALIAS = { zionut_datit_zehut: "zionut_datit" };
const canonId = id => ID_ALIAS[id] || id;
const parseHeDate = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || "")); return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}`) : 0; };

function normalize(p) {
  const parties = (p.parties ?? p.results ?? []).map(x => ({
    id: canonId(String(x.id ?? x.partyId ?? "").trim()),
    name: String(x.name ?? x.hebrewName ?? x.id ?? "").trim(),
    logoUrl: x.imageUrl ?? x.logoUrl ?? x.logo ?? "",
    mandates: Number(x.mandates ?? x.seats ?? 0) || 0,
    alignment: ALIGNMENTS.has(x.alignment) ? x.alignment : "Unknown"
  })).filter(x => x.id);

  const ts = Number(p.dateTimestamp) || parseHeDate(p.date) || Date.parse(p.date) || 0;
  return {
    id: String(p.id ?? `${ts}`),
    date: p.date ?? new Date(ts).toLocaleDateString("he-IL"),
    dateTimestamp: ts,
    publishedAt: Number(p.publishedAt) || ts,
    channel: p.channel ?? p.channelLogoUrl ?? p.channelLogo ?? "",
    channelHebrewName: p.channelHebrewName ?? p.channelName ?? "",
    sourceId: p.sourceId ?? p.source ?? "",
    sourceUrl: p.sourceUrl ?? "",
    parties
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

  const incoming = pickArray(await fetchLatest()).map(normalize);
  log(`נשלפו ${incoming.length} סקרים מדף הבית`);

  const known = new Set(archive.polls.map(p => p.sourceUrl).filter(Boolean));
  const fromSitemap = (await fetchFromSitemap(known, FULL ? null : RECENT_DAYS)).map(normalize);
  log(`נשלפו ${fromSitemap.length} סקרים מהסייטמאפ`);
  incoming.push(...fromSitemap);

  let added = 0;
  incoming.forEach(p => {
    if (!byId.has(p.id)) added += 1;
    byId.set(p.id, { ...byId.get(p.id), ...p });
  });
  const all = [...byId.values()].sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  log(`חדשים: ${added} · בארכיון סה״כ: ${all.length}`);

  const shown = selectDisplayPolls(all, { year: YEAR, maxPerOutlet: MAX_PER_OUTLET, from: FROM });
  const outlets = new Set(shown.map(p => p.channelHebrewName));
  log(`בתצוגה: ${shown.length} סקרים · ${outlets.size} כלי תקשורת · עד ${MAX_PER_OUTLET} לכל אחד`);
  if (!FULL && all.filter(p => p.dateTimestamp >= FROM).length < outlets.size * MAX_PER_OUTLET)
    log(`רמז: הריצו פעם אחת עם --full כדי למלא את הארכיון מכל סקרי ${YEAR}.`);

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
