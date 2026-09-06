#!/usr/bin/env node
/**
 * הבארומטר — עדכון אוטומטי של סקרי 14 הימים האחרונים
 * ---------------------------------------------------
 *   node scripts/update-polls.mjs                # שליפה מהמקור שב-config.json
 *   node scripts/update-polls.mjs --file raw.json  # מקובץ מקומי (לבדיקה)
 *   node scripts/update-polls.mjs --dry           # בלי לכתוב, רק דיווח
 *
 * הסקריפט לא מוחק סקרים ישנים מההיסטוריה: הוא שומר את כל מה שנשלף
 * ב-data/polls-archive.json, ומייצר את current-polls.json כחלון נע.
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
const FILE = argOf("--file");

const log = (...a) => console.log("·", ...a);
const die = m => { console.error("✗", m); process.exit(1); };

/* ---------- 1. שליפה ----------
   skarim.org הוא אתר Next.js. הנתונים יושבים ב-<script id="__NEXT_DATA__">
   שבתוך ה-HTML, תחת props.pageProps.landing.initialPolls — עשרת הסקרים
   האחרונים. שולפים בקשה אחת של דף הבית ומחלצים אותם. אין תלות ב-buildId. */
async function fetchRaw() {
  if (FILE) { log("קורא מקובץ מקומי:", FILE); return JSON.parse(await readFile(FILE, "utf8")); }
  log("שולף מ:", cfg.sourceUrl);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), cfg.requestTimeoutMs ?? 20000);
  try {
    const res = await fetch(cfg.sourceUrl, { signal: ctl.signal, headers: { "User-Agent": cfg.userAgent, Accept: "text/html" } });
    if (!res.ok) die(`המקור החזיר ${res.status} ${res.statusText}`);
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) die("לא נמצא __NEXT_DATA__ בעמוד skarim.org — ייתכן שהמבנה השתנה.");
    return JSON.parse(m[1]);
  } catch (e) {
    die(`השליפה נכשלה: ${e.message}\n   בדקו את sourceUrl ב-scripts/config.json, או הריצו עם --file.`);
  } finally { clearTimeout(t); }
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

/* ---------- 4. מיזוג עם הארכיון ---------- */
async function main() {
  const raw = await fetchRaw();
  const incoming = pickArray(raw).map(normalize);
  log(`נשלפו ${incoming.length} סקרים`);

  const archPath = path.join(ROOT, "data/polls-archive.json");
  const archive = existsSync(archPath) ? JSON.parse(await readFile(archPath, "utf8")) : { polls: [] };
  const byId = new Map(archive.polls.map(p => [p.id, p]));
  let added = 0;
  incoming.forEach(p => { if (!byId.has(p.id)) added += 1; byId.set(p.id, p); });
  const all = [...byId.values()].sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  log(`חדשים: ${added} · בארכיון סה״כ: ${all.length}`);

  const days = cfg.windowDays ?? 14;
  const anchor = Math.max(Date.now(), ...all.map(p => p.dateTimestamp));
  const from = anchor - days * 864e5;
  const win = all.filter(p => p.dateTimestamp >= from);
  log(`בחלון ${days} הימים: ${win.length} סקרים`);

  const problems = validate(win);
  if (problems.length) { console.warn("\n⚠ אזהרות:"); problems.forEach(x => console.warn("   -", x)); console.warn(""); }
  if (!win.length) die("החלון ריק — לא נכתב קובץ. בדקו את המקור.");

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    window: { from: new Date(from).toISOString().slice(0, 10), to: new Date(anchor).toISOString().slice(0, 10) },
    polls: win
  };

  if (DRY) { log("--dry: לא נכתב דבר."); return; }
  await mkdir(path.join(ROOT, "data"), { recursive: true });
  await writeFile(path.join(ROOT, cfg.outFile), JSON.stringify(out, null, 2), "utf8");
  await writeFile(archPath, JSON.stringify({ updatedAt: out.generatedAt, polls: all }, null, 2), "utf8");
  log(`נכתב ${cfg.outFile} ו-data/polls-archive.json ✓`);
}

await main();
