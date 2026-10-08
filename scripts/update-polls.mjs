#!/usr/bin/env node
/**
 * הבארומטר — עדכון סקרי שנת הבחירות
 * ----------------------------------
 *   node scripts/update-polls.mjs                       # סקרי RECENT_DAYS הימים האחרונים מהמדד (ויקיפדיה אם המדד לא זמין)
 *   node scripts/update-polls.mjs --full                # כל סקרי השנה
 *   node scripts/update-polls.mjs --wiki                # ויקיפדיה בלבד
 *   node scripts/update-polls.mjs --madad-file p.html   # מ-HTML שמור של המדד (לבדיקה, בלי רשת)
 *   node scripts/update-polls.mjs --file page.wikitext  # מקוד דף ויקיפדיה שמור (לבדיקה, בלי רשת)
 *   node scripts/update-polls.mjs --dry                 # בלי לכתוב, רק דיווח
 *
 * המקור הראשי: מאגר הסקרים של המדד (themadad.com/polls26, ראו
 * scripts/themadad-source.mjs) — מתעדכן מהר יותר מוויקיפדיה. אם הוא לא זמין,
 * הגיבוי הוא טבלת "Seat projections" בדף הוויקיפדיה (scripts/wiki-polls.mjs).
 * עד 23.09.2026 המקור היה skarim.org, ומאז הוא חוסם בקשות אוטומטיות — הסקרים
 * שנאספו משם נשארים בארכיון כמו שהם.
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
import { parseTheMadadHtml, THE_MADAD_URL } from "./themadad-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(await readFile(path.join(ROOT, "scripts/config.json"), "utf8"));
const args = process.argv.slice(2);
const argOf = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry");
const FULL = args.includes("--full");
const FILE = argOf("--file");
const MADAD_FILE = argOf("--madad-file");
/* --file הוא קוד דף ויקיפדיה, ולכן הוא מדלג על המדד */
const WIKI_ONLY = args.includes("--wiki") || Boolean(FILE);
const YEAR = Number(argOf("--year")) || cfg.year || new Date().getFullYear();
const MAX_PER_OUTLET = Number(cfg.maxPerOutlet) || 4;
/* רצפת תאריך לתצוגה. אותו ערך נמצא גם ב-POLLS_FROM שב-assets/app.js. */
const FROM = cfg.from ? Date.parse(cfg.from) : -Infinity;
const WIKI = cfg.wikipedia;
const PAGE_URL = `https://en.wikipedia.org/wiki/${encodeURIComponent(WIKI.page.replace(/ /g, "_"))}`;

const log = (...a) => console.log("·", ...a);
const die = m => { console.error("✗", m); process.exit(1); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* שליפה עם ניסיונות חוזרים: 429/5xx או תקלת רשת — עד 4 ניסיונות, בהשהיה
   מעריכית (מכבדים Retry-After). ריצה ברקע, אז עדיף לחכות דקה מלהיכשל. */
async function get(url) {
  const maxAttempts = cfg.maxRetries ?? 4, baseDelayMs = cfg.retryBaseMs ?? 5000;
  for (let attempt = 1; ; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), cfg.requestTimeoutMs ?? 20000);
    let res;
    try {
      res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": cfg.userAgent, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8", Accept: "text/html" } });
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    } finally { clearTimeout(t); }
    if (res.ok) return await res.text();
    if (!(res.status === 429 || res.status >= 500) || attempt >= maxAttempts) throw new Error(`${res.status} ${res.statusText}`);
    const retryAfter = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** (attempt - 1);
    log(`${res.status} מ-${url} — ניסיון ${attempt}/${maxAttempts}, מנסה שוב בעוד ${Math.round(delay / 1000)}ש׳`);
    await sleep(delay);
  }
}

/* חלון הסריקה בריצה רגילה. מספיק גדול כדי לתפוס תיקונים שעורכי ויקיפדיה
   מכניסים לסקרים מהימים האחרונים, וכדי לכסות כמה ימים של תקלות ברצף. */
const RECENT_DAYS = Number(cfg.recentDays) || 21;

/* ---------- 1. שליפה ---------- */
/* המדד: מערך allPolls שבתוך העמוד. שיוך המכון נבדק מול data/pollsters.json —
   סקר שהמכון שלו לא תואם לא נכנס (שינוי שיוך דורש החלטה, לא ניחוש).
   madadTrustSourceMap: ערוצים שבהם השיוך שלנו גובר על השם שבמדד. */
async function fetchMadadPolls() {
  const firms = JSON.parse(await readFile(path.join(ROOT, "data/pollsters.json"), "utf8"));
  const firmBySource = Object.fromEntries(Object.entries(firms.sourceMap).map(([source, info]) => [source, info.firm]));
  const url = cfg.alternateUrl || THE_MADAD_URL;
  log(MADAD_FILE ? `קורא את עמוד המדד מקובץ ${MADAD_FILE}` : `שולף מהמדד: ${url}`);
  const html = MADAD_FILE ? await readFile(MADAD_FILE, "utf8") : await get(url);
  const { polls, skipped } = parseTheMadadHtml(html, {
    year: YEAR, from: FROM, recentDays: FULL ? null : RECENT_DAYS, firmBySource, trustSourceMap: cfg.madadTrustSourceMap || []
  });
  log(`במדד ${polls.length} סקרים ${FULL ? `משנת ${YEAR}` : `מ-${RECENT_DAYS} הימים האחרונים`}`);
  skipped.forEach(s => console.warn(`   ! דולג: ${s}`));
  return polls.map(p => ({
    id: p.id, ts: p.dateTimestamp, dateStr: new Date(p.dateTimestamp).toISOString().slice(0, 10),
    sourceId: p.sourceId, sourceUrl: p.sourceUrl, firm: p.pollster,
    seats: new Map(p.parties.map(x => [x.id, x.mandates])), fallback: Object.fromEntries(p.parties.map(x => [x.id, x]))
  }));
}

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
   שמכיל אותם, כך שסקר מהמדד או מוויקיפדיה נראה באתר בדיוק כמו סקר שהגיע מ-skarim.
   רשימה שאין לה עדיין סקר בארכיון מקבלת את השם והשיוך שהמקור עצמו נותן. */
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
      const info = partyInfo.get(id), own = w.fallback?.[id];
      return { id, name: info?.name || own?.name || id, logoUrl: info?.logoUrl || "", mandates, alignment: id === "raam" ? "Arabs" : info?.alignment || own?.alignment || "Unknown" };
    }).sort((a, b) => b.mandates - a.mandates);
    return {
      id: w.id || `wiki-${w.sourceId}-${w.dateStr}`,
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

/* ---------- 5. כפילויות ----------
   אותו סקר מגיע לפעמים מכמה מקורות (skarim, הזנה ידנית, ויקיפדיה, המדד),
   ולא תמיד באותו תאריך: ויקיפדיה רושמת את סיום העבודה בשטח, האחרים את יום
   הפרסום. סקר מהמדד הוא כפילות של סקר שבמאגר כשזה אותו ערוץ ו —
   (א) אותו תאריך, או (ב) יום אחד הבדל ומספרים זהים לגמרי.
   לא מרחיבים מעבר לזה: ערוץ 14 פרסם סקרים שונים בהפרש שלושה ימים שנבדלו
   במנדט אחד בלבד. רשומה קיימת נשמרת (היא מקשרת לכתבה המקורית). */
const seatVector = p => p.parties.reduce((m, x) => {
  const id = x.id === "zehut" ? "zionut_datit" : x.id;   // זהות אוחדה עם הציונות הדתית
  if (x.mandates > 0) m[id] = (m[id] || 0) + x.mandates;
  return m;
}, {});
const sameSeats = (a, b) => {
  const A = seatVector(a), B = seatVector(b);
  return [...new Set([...Object.keys(A), ...Object.keys(B)])].every(k => (A[k] || 0) === (B[k] || 0));
};
const DAY = 864e5;
function dedupeAgainstArchive(polls, archivePolls) {
  let dup = 0;
  const out = polls.filter(p => {
    if (archivePolls.some(o => o.id === p.id)) return true;            // אותו סקר מהמדד — עדכון
    const twin = archivePolls.find(o => o.sourceId === p.sourceId && !String(o.id).startsWith("themadad-") && (
      Math.round((o.dateTimestamp - p.dateTimestamp) / DAY) === 0 ||
      (Math.abs(o.dateTimestamp - p.dateTimestamp) <= 1.5 * DAY && sameSeats(o, p))));
    if (twin) dup++;
    return !twin;
  });
  if (dup) log(`${dup} מהם כבר במאגר ממקור אחר — דולגו`);
  return out;
}

/* ויקיפדיה (גיבוי): מכל ערוץ לוקחים רק סקרים שאחרי הסקר האחרון שכבר יש לנו
   ממקור אחר — סקר שנערך אחרי פרסום של סקר אחר הוא בהכרח סקר חדש. */
async function wikiIncoming(archivePolls, normalize) {
  const latestOther = new Map();
  for (const p of archivePolls) if (!String(p.id).startsWith("wiki-"))
    latestOther.set(p.sourceId, Math.max(latestOther.get(p.sourceId) ?? -Infinity, p.dateTimestamp));
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
  return incoming;
}

/* ---------- 6. מיזוג עם הארכיון ---------- */
async function main() {
  const archPath = path.join(ROOT, "data/polls-archive.json");
  const archive = existsSync(archPath) ? JSON.parse(await readFile(archPath, "utf8")) : { polls: [] };
  const byId = new Map(archive.polls.map(p => [p.id, p]));

  const normalize = makeNormalizer(archive.polls);
  let incoming = [], source = "המדד";
  if (!WIKI_ONLY) {
    try {
      incoming = dedupeAgainstArchive((await fetchMadadPolls()).map(normalize), archive.polls);
    } catch (e) {
      if (MADAD_FILE) throw e;
      log(`המדד לא זמין (${e.message}) — עובר לוויקיפדיה`);
      source = null;
    }
  }
  if (WIKI_ONLY || !source) { source = "ויקיפדיה"; incoming = await wikiIncoming(archive.polls, normalize); }

  /* סקר שנמחק בניהול האתר לא מיובא שוב מהמקור (archive.deleted, נכתב בסנכרון מהאתר החי) */
  const deletedIds = new Set((archive.deleted || []).map(d => d.id));
  incoming = incoming.filter(p => !deletedIds.has(p.id));

  const incomingProblems = validate(incoming);
  if (incomingProblems.length) throw new Error(incomingProblems.join("\n"));

  /* סקר שכבר במאגר באותו מזהה מתעדכן — המקורות מתקנים לפעמים מספרים. */
  let added = 0, changed = 0;
  for (const p of incoming) {
    const old = byId.get(p.id);
    if (!old) added++;
    else if (JSON.stringify(old.parties) !== JSON.stringify(p.parties)) changed++;
    byId.set(p.id, { ...old, ...p });
  }
  log(`מקור: ${source}`);
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
  await writeFile(archPath, JSON.stringify({ updatedAt: out.generatedAt, polls: all, ...(archive.deleted ? { deleted: archive.deleted } : {}) }, null, 2), "utf8");
  log(`נכתב ${cfg.outFile} ו-data/polls-archive.json ✓`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("update-polls.mjs")) await main();
