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

/* skarim.org מחזיר מדי פעם 429 (ריבוי בקשות) — כנראה סף רגיש שמריצות
   ה-CI פוגעות בו לפעמים, לא תקלה קבועה. בלי ניסיון חוזר, 429 בודד באמצע
   הריצה (כולל בבקשה הראשונה, לפני שיש בכלל מרווח בין בקשות) הפיל את כל
   העדכון היומי — וכשגם החלון החיצוני שמפעיל את ה-workflow לא בהכרח נופל
   שוב בשעות הנכונות, זה יכול להשאיר את האתר תקוע על נתונים ישנים ימים.
   3 ניסיונות עם נסיגה מעריכית, מכבדים Retry-After כשהוא קיים. */
async function get(url, accept = "text/html") {
  /* 3 ניסיונות מהירים (שניות בודדות) לא שרדו חסימת 429 אמיתית שנצפתה
     בפועל ב-CI — היא נמשכת יותר מכמה שניות. זו הרצה ברקע שרצה בלאו הכי
     רק כמה פעמים ביום, אז שווה לשלם עוד כמה דקות בשביל לצאת מחלון חסימה
     קצר-בינוני במקום להפיל את כל הריצה. */
  const maxAttempts = cfg.maxRetries ?? 6;
  const baseDelayMs = cfg.retryBaseMs ?? 5000;
  for (let attempt = 1; ; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), cfg.requestTimeoutMs ?? 20000);
    let res;
    try {
      res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": cfg.userAgent, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8", Accept: accept } });
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      clearTimeout(t);
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    } finally { clearTimeout(t); }
    if (res.ok) return await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxAttempts) throw new Error(`${res.status} ${res.statusText}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** (attempt - 1);
    log(`${res.status} מ-${url} — ניסיון ${attempt}/${maxAttempts}, מנסה שוב בעוד ${Math.round(delay / 1000)}ש׳`);
    await sleep(delay);
  }
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
  const failed = [];
  for (const [i, x] of todo.entries()) {
    try {
      const poll = nextData(await get(x.url)).props?.pageProps?.data?.poll;
      if (poll?.parties?.length) out.push({ ...poll, sourceUrl: x.url });
      else { failed.push(x.url); console.warn(`   ! ${x.url}: אין מפלגות בדף`); }
    } catch (e) { failed.push(x.url); console.warn(`   ! ${x.url}: ${e.message}`); }
    if (i % 10 === 9) log(`   ${i + 1}/${todo.length}`);
    if (cfg.requestDelayMs) await sleep(cfg.requestDelayMs);
  }
  return { polls: out, failed };
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

  /* דף הבית הוא קיצור-דרך למהירות בלבד — לא מקור אמת (ראו הערה ליד
     fetchLatest) — אז כישלון בו לא צריך להפיל את כל הריצה. הוא גם מקור
     ה-429 בפועל בכל הריצות שנכשלו: זו עמוד ה-SSR הכבד, וסביר שהוא נתקל
     בהגבלת קצב לפני שהסייטמאפ (קובץ סטטי קליל) נתקל בה בכלל. אם הוא
     חסום — ממשיכים עם הסייטמאפ בלבד, שמכסה חלון של RECENT_DAYS ולכן
     תופס בפועל הכל, רק קצת יותר לאט. */
  let incoming = [];
  try {
    incoming = pickArray(await fetchLatest()).map(normalize);
    log(`נשלפו ${incoming.length} סקרים מדף הבית`);
  } catch (e) {
    if (FILE) throw e;
    log(`דף הבית לא זמין (${e.message}) — ממשיכים עם הסייטמאפ בלבד`);
  }

  const known = new Set(archive.polls.map(p => p.sourceUrl).filter(Boolean));
  const scan = FILE ? { polls: [], failed: [] } : await fetchFromSitemap(known, FULL ? null : RECENT_DAYS);
  const fromSitemap = scan.polls.map(normalize);
  log(`נשלפו ${fromSitemap.length} סקרים מהסייטמאפ`);
  incoming.push(...fromSitemap);

  const covered = new Set(incoming.map(p => p.sourceUrl).filter(Boolean));
  const missing = scan.failed.filter(url => !covered.has(url));
  if (missing.length) throw new Error(`לא הושלם איסוף של ${missing.length} סקרים: ${missing.join(', ')}. הנתונים הקודמים נשמרו; נדרש ניסיון חוזר.`);
  const incomingProblems = validate(incoming);
  if (incomingProblems.length) throw new Error(incomingProblems.join('\n'));
  let added = 0;
  incoming.forEach(p => {
    const samePoll = [...byId.values()].find(old => old.sourceId === p.sourceId && old.dateTimestamp === p.dateTimestamp);
    if (!byId.has(p.id) && !samePoll) added += 1;
    if (samePoll && samePoll.id !== p.id) byId.delete(samePoll.id);
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
