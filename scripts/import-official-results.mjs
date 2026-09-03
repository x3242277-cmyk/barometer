#!/usr/bin/env node
/**
 * הבארומטר — ייבוא תוצאות האמת הרשמיות של הכנסת ה־25 לפי יישובים
 * ----------------------------------------------------------------
 * הסקריפט הזה רץ אצלכם במחשב (ולא בדפדפן), ולכן הוא יכול להוריד ישירות
 * את הקובץ הרשמי. אחרי הרצה, עמוד "פילוח אזורי" מציג את כל היישובים.
 *
 *   node scripts/import-official-results.mjs --url  "<כתובת ה-CSV הרשמי>"
 *   node scripts/import-official-results.mjs --file expb.csv
 *
 * מאיפה משיגים את הקובץ:
 *   1. data.gov.il → מאגר "תוצאות האמת של הבחירות לכנסת ה־25 לפי יישובים"
 *   2. votes25.bechirot.gov.il → "הורדת קובץ תוצאות"
 * שמרו את ה-CSV ליד הפרויקט והריצו עם ‎--file.
 *
 * הקובץ הרשמי מקודד לרוב ב-windows-1255. הסקריפט מזהה ומתרגם אוטומטית.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argOf = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const die = m => { console.error("✗", m); process.exit(1); };
const log = (...a) => console.log("·", ...a);

/* אותיות הרשימות בבחירות לכנסת ה־25 */
const LETTERS = {
  "מחל": "likud", "פה": "yesh_atid", "ט": "religious_zionism", "כן": "national_unity",
  "שס": "shas", "ג": "utj", "ל": "yisrael_beiteinu", "עם": "raam", "ום": "hadash_taal",
  "אמת": "labor", "מרצ": "meretz", "ד": "balad", "ב": "jewish_home"
};
const NAMES = {
  likud: "הליכוד", yesh_atid: "יש עתיד", religious_zionism: "הציונות הדתית–עוצמה יהודית",
  national_unity: "המחנה הממלכתי", shas: "ש״ס", utj: "יהדות התורה", yisrael_beiteinu: "ישראל ביתנו",
  raam: "רע״מ", hadash_taal: "חד״ש–תע״ל", labor: "העבודה", meretz: "מרצ", balad: "בל״ד", jewish_home: "הבית היהודי"
};

/* ---------- קריאה ופענוח ---------- */
async function loadCsv() {
  const url = argOf("--url"), file = argOf("--file");
  if (!url && !file) die("חסר ‎--url או ‎--file. ראו את ההסבר בראש הקובץ.");
  let buf;
  if (file) { log("קורא", file); buf = await readFile(path.resolve(file)); }
  else {
    log("מוריד", url);
    const res = await fetch(url, { headers: { "User-Agent": "Barometer/1.0" } });
    if (!res.ok) die(`ההורדה נכשלה: ${res.status} ${res.statusText}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  // זיהוי קידוד: אם יש הרבה בתים בטווח 0xE0–0xFA זה כנראה windows-1255
  const utf8 = buf.toString("utf8");
  if (utf8.includes("�")) { log("מפענח windows-1255"); return new TextDecoder("windows-1255").decode(buf); }
  return utf8;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}

const num = v => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

/* ---------- הרצה ---------- */
const text = await loadCsv();
const rows = parseCsv(text);
if (rows.length < 2) die("הקובץ ריק או לא נקרא כראוי.");
const header = rows[0].map(h => String(h).trim());
log(`${rows.length - 1} שורות, ${header.length} עמודות`);

const findCol = (...cands) => header.findIndex(h => cands.some(c => h.replace(/\s+/g, "") === c.replace(/\s+/g, "")));
const iName = findCol("שם ישוב", "שם היישוב", "שם_ישוב");
const iCode = findCol("סמל ישוב", "סמל_ישוב", "סמל היישוב");
const iBzb  = findCol("בזב");
const iVote = findCol("מצביעים");
const iOk   = findCol("כשרים");
if (iName < 0) die("לא נמצאה עמודת 'שם ישוב'. ודאו שזהו קובץ התוצאות לפי יישובים.");

const letterCols = header.map((h, i) => ({ h: h.trim(), i })).filter(x => LETTERS[x.h]);
log(`זוהו ${letterCols.length} רשימות מתוך ${Object.keys(LETTERS).length}`);
if (!letterCols.length) die("לא זוהתה אף עמודת רשימה. בדקו את מבנה הקובץ.");

const localities = rows.slice(1).map(r => {
  const valid = iOk >= 0 ? num(r[iOk]) : letterCols.reduce((s, c) => s + num(r[c.i]), 0);
  const votes = Object.fromEntries(letterCols.map(c => [LETTERS[c.h], num(r[c.i])]));
  const parties = Object.entries(votes)
    .map(([id, v]) => ({ id, name: NAMES[id], votes: v, pct: valid ? +(100 * v / valid).toFixed(2) : 0 }))
    .filter(p => p.votes > 0).sort((a, b) => b.votes - a.votes);
  return {
    name: String(r[iName]).trim(),
    code: iCode >= 0 ? num(r[iCode]) : null,
    eligible: iBzb >= 0 ? num(r[iBzb]) : null,
    voted: iVote >= 0 ? num(r[iVote]) : null,
    valid,
    turnout: iBzb >= 0 && iVote >= 0 && num(r[iBzb]) ? +(100 * num(r[iVote]) / num(r[iBzb])).toFixed(1) : null,
    parties
  };
}).filter(l => l.name && l.valid > 0).sort((a, b) => b.valid - a.valid);

log(`עובדו ${localities.length} יישובים · סה״כ ${localities.reduce((s, l) => s + l.valid, 0).toLocaleString("he-IL")} קולות כשרים`);

/* עדכון regions.json: מילוי הנקודות שכבר יש להן קואורדינטות + טבלה מלאה */
const rp = path.join(ROOT, "data/regions.json");
const regions = JSON.parse(await readFile(rp, "utf8"));
const byName = new Map(localities.map(l => [l.name.replace(/[\s–—-]/g, ""), l]));
let matched = 0;
regions.localities.forEach(loc => {
  const hit = byName.get(loc.name.replace(/[\s–—-]/g, ""));
  if (!hit) return;
  matched += 1;
  loc.parties = hit.parties.slice(0, 6).map(p => ({ id: p.id, name: p.name, pct: p.pct }));
  loc.turnout = hit.turnout ?? loc.turnout;
  loc.turnoutOnly = false;
  loc.src = "official";
});
regions.sources.official = { name: "ועדת הבחירות המרכזית — תוצאות אמת לפי יישובים", url: "https://votes25.bechirot.gov.il/cityresults" };
regions.localitiesFull = localities.map(l => ({
  name: l.name, valid: l.valid, turnout: l.turnout,
  top: l.parties.slice(0, 4).map(p => ({ id: p.id, name: p.name, pct: p.pct }))
}));
regions.meta.importedAt = new Date().toISOString().slice(0, 10);
await writeFile(rp, JSON.stringify(regions, null, 2), "utf8");
log(`עודכנו ${matched} נקודות על המפה, ונוספה טבלה מלאה של ${localities.length} יישובים ✓`);
