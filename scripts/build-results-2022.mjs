#!/usr/bin/env node
/**
 * בונה את data/results-2022.json — הנתונים של לוח "בחירות 2022" (#/map).
 *
 *   node scripts/build-results-2022.mjs                 # הורדה מוועדת הבחירות ומהלמ״ס
 *   node scripts/build-results-2022.mjs --dir <תיקייה>   # k25.csv ו-bycode2022.xlsx מקומיים
 *
 * לכל יישוב: הקולות לכל רשימה (קובץ תוצאות האמת של ועדת הבחירות לכנסת ה־25),
 * ומהלמ״ס — מחוז, אזור טבעי (ביהודה ושומרון: נפה) ודת היישוב. האוכלוסייה:
 *   ערים מעורבות — דת יישוב 4 בקובץ הלמ״ס;
 *   בדואים — שבטים (דת 3), וכן יישובים לא־יהודיים בנפת באר שבע;
 *   ערבים ודרוזים — שאר היישובים הלא־יהודיים (דת 2);
 *   חרדים — יישובים יהודיים שבהם ש״ס ויהדות התורה יחד קיבלו לפחות מחצית הקולות;
 *   יהודים — שאר היישובים היהודיים.
 * הסכום הארצי כולל את המעטפות החיצוניות (חיילים, נציגויות ועוד), כמו התוצאה הרשמית;
 * בטבלת היישובים הן אינן מופיעות.
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCbsRows, NATURAL } from "./lib/cbs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DIR = (i => i >= 0 ? args[i + 1] : null)(args.indexOf("--dir"));
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" };
const RESULTS_URL = "https://media25.bechirot.gov.il/files/expc.csv";
const log = (...a) => console.log("·", ...a);

/* אות הרשימה בקובץ → מזהה, שם, שם קצר לגרף, גוש. הגושים כמו בשאר האתר: R גוש הימין והחרדים
   (ארבע הרשימות), L מרכז–שמאל, A הרשימות הערביות — L+A הן שמונה הרשימות האחרות;
   הבית היהודי, שלא הייתה חלק מאף גוש, ב-O עם שאר הרשימות. */
const LISTS = {
  "מחל": ["likud", "הליכוד", "הליכוד", "R"],
  "פה": ["yesh_atid", "יש עתיד", "יש עתיד", "L"],
  "ט": ["religious_zionism", "הציונות הדתית–עוצמה יהודית", "הצ״ד–עוצמה", "R"],
  "כן": ["national_unity", "המחנה הממלכתי", "המחנה הממלכתי", "L"],
  "שס": ["shas", "ש״ס", "ש״ס", "R"],
  "ג": ["utj", "יהדות התורה", "יהדות התורה", "R"],
  "ל": ["yisrael_beiteinu", "ישראל ביתנו", "ישראל ביתנו", "L"],
  "עם": ["raam", "רע״מ", "רע״מ", "A"],
  "ום": ["hadash_taal", "חד״ש–תע״ל", "חד״ש–תע״ל", "A"],
  "אמת": ["labor", "העבודה", "העבודה", "L"],
  "מרצ": ["meretz", "מרצ", "מרצ", "L"],
  "ד": ["balad", "בל״ד", "בל״ד", "A"],
  "ב": ["jewish_home", "הבית היהודי", "הבית היהודי", "O"]
};
const SECTORS = { jewish: "יהודים", haredi: "חרדים", arab: "ערבים ודרוזים", bedouin: "בדואים", mixed: "ערים מעורבות" };
const EXTERNAL = 99999;

async function loadResults() {
  let buf;
  if (DIR) buf = await readFile(path.join(DIR, "k25.csv"));
  else {
    const res = await fetch(RESULTS_URL, { headers: UA });
    if (!res.ok) throw new Error(`תוצאות 2022: ההורדה נכשלה (${res.status})`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  let text = buf.toString("utf8");
  if (text.includes("�")) text = new TextDecoder("windows-1255").decode(buf);
  text = text.replace(/^﻿/, "");
  if (/<html/i.test(text.slice(0, 500))) throw new Error("התקבל דף HTML במקום CSV (חסימה ברשת?)");
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(",").map(s => s.trim()), col = n => head.indexOf(n);
  const iValid = col("כשרים");
  const letters = head.slice(iValid + 1).map((L, j) => [L, iValid + 1 + j]).filter(([L]) => L);
  return lines.slice(1).map(l => {
    const c = l.split(",");
    const code = Number(c[col("סמל ישוב")]) || 0;
    return {
      code: code || EXTERNAL, name: (c[col("שם ישוב")] || "").trim(),
      eligible: Number(c[col("בזב")]) || 0, voted: Number(c[col("מצביעים")]) || 0, valid: Number(c[iValid]) || 0,
      votes: Object.fromEntries(letters.map(([L, j]) => [L, Number(c[j]) || 0]))
    };
  });
}

const rows = await loadResults();
const { rows: cbsRows, H } = await loadCbsRows({ file: DIR && path.join(DIR, "bycode2022.xlsx"), headers: UA });
const cbs = new Map(cbsRows.map(r => [Number(r[H("סמל יישוב")]), {
  name: String(r[H("שם יישוב")] || "").trim().replace(/\s*-\s*/g, "-").replace(/\s{2,}/g, " "),
  district: r[H("שם מחוז")] || "", nr: Number(r[H("אזור טבעי")]) || 0, nafa: r[H("שם נפה")] || "", rel: Number(r[H("דת יישוב")]) || 0
}]));
const history = JSON.parse(await readFile(path.join(ROOT, "data/locality-history.json"), "utf8"));
const coord = new Map(history.localities.filter(l => l.lon != null).map(l => [l.code, [l.lon, l.lat]]));
/* האזורים של המפה המתנדנדת (scripts/import-locality-history.mjs): כל יישוב לאזור שלו.
   שבטים בדואיים בלי אזור (אין להם שטח במפה) — לאזור הבדואי הגדול ביותר. */
const areaOf = new Map();
history.regions.forEach((g, gi) => g.members.forEach(c => areaOf.set(c, gi)));
const bedouinArea = history.regions.map((g, gi) => ({ gi, v: g.e["2022"]?.[2] || 0, g })).filter(x => /בדואים/.test(x.g.name)).sort((a, b) => b.v - a.v)[0]?.gi;

/* הרשימות: 13 הרשימות הידועות לפי סדר הקולות הארצי, ואז "אחרות" */
const nationalVotes = {};
for (const r of rows) for (const [L, v] of Object.entries(r.votes)) nationalVotes[L] = (nationalVotes[L] || 0) + v;
const known = Object.keys(LISTS).filter(L => nationalVotes[L] != null).sort((a, b) => nationalVotes[b] - nationalVotes[a]);
const regionsJson = JSON.parse(await readFile(path.join(ROOT, "data/regions.json"), "utf8"));
const seatsOf = id => regionsJson.national.parties.find(p => p.id === id)?.seats || 0;
const parties = known.map(L => ({ id: LISTS[L][0], name: LISTS[L][1], short: LISTS[L][2], camp: LISTS[L][3],
  color: regionsJson.partyColors[LISTS[L][0]] || "#96A0AB", seats: seatsOf(LISTS[L][0]) }));
parties.push({ id: "other", name: "רשימות אחרות", short: "אחרות", camp: "O", color: regionsJson.partyColors.other || "#96A0AB", seats: 0 });
const vec = votes => {
  const v = known.map(L => votes[L] || 0);
  v.push(Object.entries(votes).filter(([L]) => !LISTS[L]).reduce((t, [, n]) => t + n, 0));
  return v;
};

const districts = [], regions = [];
const idx = (list, name) => { let i = list.indexOf(name); if (i < 0) { list.push(name); i = list.length - 1; } return i; };
const iShas = parties.findIndex(p => p.id === "shas"), iUtj = parties.findIndex(p => p.id === "utj");
const localities = [], missing = [];
const national = { eligible: 0, voted: 0, valid: 0, votes: vec({}) };
for (const r of rows) {
  const v = vec(r.votes);
  national.eligible += r.eligible; national.voted += r.voted; national.valid += r.valid;
  v.forEach((n, i) => national.votes[i] += n);
  if (r.code === EXTERNAL) continue;
  const info = cbs.get(r.code);
  if (!info) { missing.push(r.name); continue; }
  const district = info.district || "לא ידוע";
  const region = NATURAL[info.nr] || (info.nafa ? `נפת ${info.nafa}` : district);
  const haredi = r.valid ? (v[iShas] + v[iUtj]) / r.valid : 0;
  const sector = info.rel === 4 ? "mixed" : info.rel === 3 ? "bedouin"
    : info.rel === 2 ? (/באר שבע/.test(info.nafa) ? "bedouin" : "arab")
    : haredi >= .5 ? "haredi" : "jewish";
  const [x, y] = coord.get(r.code) || [null, null];
  /* השם מקובץ הלמ״ס — בקובץ ועדת הבחירות המקפים והגרשיים נמחקו ("אום אלפחם") */
  localities.push({ c: r.code, n: info.name || r.name, d: idx(districts, district), r: idx(regions, region), s: sector,
    e: r.eligible, t: r.voted, v: r.valid, p: v, x, y, g: areaOf.get(r.code) ?? (sector === "bedouin" ? bedouinArea : null) });
}
if (missing.length) console.warn(`   ! ${missing.length} יישובים בלי רשומה בקובץ הלמ״ס (לא נכללו): ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`);
/* בדיקת שפיות מול התוצאה הרשמית שבאתר */
const off = Math.abs(national.valid - regionsJson.national.valid);
if (off > 0) throw new Error(`סך הקולות הכשרים ${national.valid} שונה מהתוצאה הרשמית ${regionsJson.national.valid}`);

const unplaced = localities.filter(l => l.g == null);
if (unplaced.length) console.warn(`   ! ${unplaced.length} יישובים בלי אזור במפה: ${unplaced.slice(0, 6).map(l => l.n).join(", ")}`);
/* אזורי המפה: שם, צורה (יחידות של עשירית ק״מ, צפון למעלה) והמחוז של רוב הקולות בו */
const areas = history.regions.map((g, gi) => {
  const byD = {};
  localities.filter(l => l.g === gi).forEach(l => byD[l.d] = (byD[l.d] || 0) + l.v);
  const d = Number(Object.entries(byD).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1);
  return { name: g.name.replace(/־/g, "-").replace(/\s+/g, " "), lead: g.lead, d, shape: g.shape };
});
/* אזור → מחוז (לבורר האזורים, מקובץ לפי מחוז) */
const regionDistrict = regions.map((_, ri) => localities.find(l => l.r === ri).d);
localities.sort((a, b) => b.v - a.v);
const out = {
  meta: {
    title: "תוצאות האמת לפי יישוב · הבחירות לכנסת ה־25 (1.11.2022)",
    sources: [
      { name: "ועדת הבחירות המרכזית — תוצאות לפי יישובים", url: RESULTS_URL },
      { name: "הלמ״ס — קובץ היישובים 2022 (מחוז, אזור טבעי, דת יישוב)", url: "https://data.gov.il/dataset/citiesandsettelments" }
    ],
    sectorRule: "ערים מעורבות ובדואים — לפי קובץ הלמ״ס (בדואים: גם יישובים לא־יהודיים בנפת באר שבע); חרדים — יישוב יהודי שבו ש״ס ויהדות התורה יחד קיבלו לפחות מחצית הקולות.",
    camps: { R: "גוש הימין והחרדים", L: "מרכז–שמאל", A: "הרשימות הערביות", O: "אחרות" },
    generatedAt: new Date().toISOString()
  },
  parties, sectors: SECTORS, districts, regions, regionDistrict, national, localities,
  areas, map: { bbox: history.meta.map.bbox, water: history.meta.map.water, units: history.meta.map.units }
};
await writeFile(path.join(ROOT, "data/results-2022.json"), JSON.stringify(out), "utf8");
/* קיבוץ המפה נעשה בשלב נפרד: אזורים טבעיים, ובתוכם כל שטח ליישוב הקרוב.
   כך קבוצה קטנה לא יכולה להיצבע בשם של אזור מרוחק בגלל דמיון בהצבעה. */
const PY = process.platform === "win32" ? "python" : "python3";
execFileSync(PY, [path.join(ROOT, "scripts/refine-results-2022-areas.py")], { stdio: "inherit" });
/* הצורה האמיתית של הערים והמועצות המקומיות (OpenStreetMap), והתבליט של המפה */
execFileSync(PY, [path.join(ROOT, "scripts/add-locality-shapes.py")], { stdio: "inherit" });
execFileSync(PY, [path.join(ROOT, "scripts/build-terrain.py")], { stdio: "inherit" });
log(`${localities.length} יישובים · ${districts.length} מחוזות · ${regions.length} אזורים · ${fmtN(national.valid)} קולות כשרים ✓`);
function fmtN(n) { return new Intl.NumberFormat("he-IL").format(n); }
