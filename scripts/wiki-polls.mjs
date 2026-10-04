/**
 * הבארומטר — שליפת סקרי מנדטים מוויקיפדיה
 * ----------------------------------------
 * מאז 23.09.2026 skarim.org מציב "Vercel Security Checkpoint" (אתגר JavaScript,
 * תשובה 429 עם x-vercel-mitigated: challenge) לכל בקשה אוטומטית לדפי הסקרים,
 * ולכן המקור הוחלף לטבלת "Seat projections" בדף הוויקיפדיה האנגלי של סקרי
 * הבחירות. ויקיפדיה מספקת את קוד הדף דרך ה-API הרשמי שלה, בלי הגבלה כזו.
 *
 * בסקשן של השנה יש כמה טבלאות — טבלה חדשה נפתחת בכל פעם שמערך המפלגות
 * משתנה (איחוד, פרישה). לכל טבלה כותרת משלה, ולכן העמודות ממופות לפי
 * הקישור שבכותרת (למשל [[Likud]]) ולא לפי מיקום.
 *
 * המיפוי מוויקיפדיה למזהים שלנו (שנשארו המזהים של skarim.org, כדי שכל
 * הארכיון והאתר ימשיכו לעבוד כמו שהם) נמצא ב-scripts/config.json תחת
 * "wikipedia". עמודה חדשה שלא מופיעה שם ויש בה מנדטים — עוצרת את הריצה
 * עם הודעה ברורה, כדי שמפלגה לא תיעלם בשקט מהתחזית.
 */

const API = "https://en.wikipedia.org/w/api.php";

/* ---------- כלי עזר לוויקיטקסט ---------- */

/* מסיר תבנית {{name|...}} כולל תבניות מקוננות בתוכה (efn מכיל קישורים ותבניות). */
function removeTemplate(text, name) {
  const re = new RegExp(`\\{\\{\\s*${name}\\s*[|}]`, "gi");
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index;
    for (; i < text.length - 1; i++) {
      if (text[i] === "{" && text[i + 1] === "{") { depth++; i++; }
      else if (text[i] === "}" && text[i + 1] === "}") { depth--; i++; if (!depth) { i++; break; } }
    }
    out += text.slice(last, m.index);
    last = i;
    re.lastIndex = i;
  }
  return out + text.slice(last);
}

/* מפצל לפי מפריד ברמה העליונה — לא בתוך {{...}} ולא בתוך [[...]]. */
function splitTop(s, sep) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; i++; continue; }
    if (two === "}}" || two === "]]") { depth = Math.max(0, depth - 1); i++; continue; }
    if (!depth && s.startsWith(sep, i)) { parts.push(s.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  parts.push(s.slice(start));
  return parts;
}

/* תא בוויקיטקסט: "attrs |value" או "value". */
function parseCell(raw) {
  const parts = splitTop(raw, "|");
  const attrs = parts.length > 1 ? parts[0] : "";
  /* בלי "|" עדיין ייתכנו מאפיינים צמודים לתבנית: "colspan=2{{N/A}}", "rowspan=2 {{Opdrts|...}}". */
  const value = parts.length > 1 ? parts.slice(1).join("|").trim()
    : parts[0].replace(/^\s*(?:(?:colspan|rowspan|style|class)\s*=\s*(?:"[^"]*"|[^\s{|]+)\s*)+/i, "").trim();
  const span = n => Number((new RegExp(`${n}\\s*=\\s*"?(\\d+)`, "i").exec(attrs || raw) || [])[1]) || 1;
  return { attrs, value, raw, colspan: span("colspan"), rowspan: span("rowspan") };
}

/* שורת טבלה → תאים. כל תא מתחיל ב-"|" (או "!") בתחילת שורה, ואפשר גם כמה תאים בשורה עם "||". */
function rowCells(block, marker) {
  const cells = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(marker)) {
      splitTop(line.slice(1), marker + marker).forEach(c => cells.push(c));
    } else if (cells.length) {
      cells[cells.length - 1] += "\n" + line;
    }
  }
  return cells.map(parseCell);
}

const firstLink = s => (/\[\[([^\]|#]+)/.exec(s) || [])[1]?.trim() || null;
const plain = s => s.replace(/\u0001\d+\u0001/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\{\{[^{}]*\}\}/g, "").replace(/<[^>]+>/g, "").replace(/'{2,}/g, "").trim();

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/* {{Opdrts||27|Sep|2026}} או {{Opdrts|23|24|Sep|2026}} או {{Opdrts|30|Aug|2|Sep|2026}} —
   תמיד לוקחים את יום הסיום: שלושת הפרמטרים האחרונים הם יום, חודש, שנה. */
function parseDate(s) {
  const m = /\{\{\s*Opdrts\s*\|([^{}]*)\}\}/i.exec(s);
  if (!m) return null;
  const p = m[1].split("|").map(x => x.trim()).filter(x => x && !x.includes("="));
  if (p.length < 3) return null;
  const [d, mon, y] = p.slice(-3);
  const month = MONTHS[mon.slice(0, 3).toLowerCase()];
  if (month == null || !/^\d+$/.test(d) || !/^\d{4}$/.test(y)) return null;
  return Date.UTC(+y, month, +d);
}

/* ערך מנדטים בתא. אחוז בסוגריים / N/A = מתחת לאחוז החסימה או לא נסקר = 0.
   כל דבר אחר (למשל "Not stated") → null, והשורה כולה נפסלת. */
function parseSeats(value) {
  const v = value.replace(/'{2,}/g, "").trim();
  if (/^\d+$/.test(v)) return +v;
  if (!v || /^\{\{\s*N\/A\s*\}\}$/i.test(v) || /^\{\{\s*small\s*\|[^{}]*%[^{}]*\}\}$/i.test(v) || /^[<(]?[\d.]*%\)?$/.test(v) || /^[–—-]$/.test(v)) return 0;
  return null;
}

/* ---------- ניתוח הטבלאות ---------- */

/**
 * מחזיר { polls, skipped } — polls בצורה המנורמלת של update-polls.mjs.
 * @param {string} wikitext   קוד הדף
 * @param {object} opts
 *   year      — השנה (הסקשן "=== 2026 ===")
 *   floor     — timestamp; שורות לפניו לא נקראות בכלל
 *   parties   — מיפוי קישור-כותרת → מזהה מפלגה (או null = להתעלם)
 *   outlets   — מיפוי קישור-מפרסם → sourceId
 *   pageUrl   — כתובת הדף, לגיבוי כשאין קישור לכתבה
 */
export function parseWikiPolls(wikitext, { year, floor = -Infinity, parties, outlets, pageUrl }) {
  const start = wikitext.search(new RegExp(`^===\\s*${year}\\s*===\\s*$`, "m"));
  if (start < 0) throw new Error(`לא נמצא סקשן "=== ${year} ===" בדף ויקיפדיה — ייתכן שמבנה הדף השתנה.`);
  const rest = wikitext.slice(wikitext.indexOf("\n", start) + 1);
  const end = rest.search(/^={2,3}[^=]/m);            // הסקשן הבא ברמה 2–3 (שנה קודמת)
  let section = end >= 0 ? rest.slice(0, end) : rest;

  /* הערות שוליים ו-<ref> יכולים להשתרע על כמה שורות ולהכיל "|" — מוציאים
     אותם לפני פיצול לשורות. מה-ref הראשון של המפרסם שומרים את קישור הכתבה. */
  const refs = [];
  section = section
    .replace(/<ref[^>/]*\/>/gi, "")
    .replace(/<ref[^>]*>([\s\S]*?)<\/ref>/gi, (_, body) => `\u0001${refs.push(body) - 1}\u0001`);
  for (const t of ["efn", "efn-lr", "refn", "notetag"]) section = removeTemplate(section, t);
  section = section.replace(/<!--[\s\S]*?-->/g, "");

  const polls = [], skipped = [], unknownParties = new Set(), unknownOutlets = new Set();
  const tables = section.split(/^\{\|/m).slice(1).map(t => t.split(/^\|\}/m)[0]);

  for (const table of tables) {
    const rows = table.split(/^\|-.*$/m);
    const header = rowCells(rows[0].split("\n").filter(l => l.startsWith("!")).join("\n"), "!");
    const slots = [];
    header.forEach(h => {
      const label = firstLink(h.value) || plain(h.value);
      for (let k = 0; k < h.colspan; k++) slots.push({ label, first: k === 0 });
    });
    const col = name => slots.findIndex(s => new RegExp(name, "i").test(s.label));
    const iDate = 0, iFirm = col("^Polling firm"), iPub = col("^Publisher"), iSample = col("^Sample");
    const iOthers = col("^Others$");
    if (iFirm < 0 || iPub < 0 || iOthers < 0) continue; // לא טבלת מנדטים
    const partyFrom = Math.max(iFirm, iPub, iSample) + 1;

    for (const row of rows.slice(1)) {
      const cells = rowCells(row, "|");
      if (!cells.length) continue;
      const ts = parseDate(cells[0].raw);
      if (ts == null) continue;                          // שורת המשך של rowspan (תרחיש חלופי) — לא סקר ראשי
      if (cells.some(c => c.colspan > 4)) continue;       // שורת אירוע ("הוועדה פסלה את...")
      if (ts < floor) continue;

      const flat = [];
      cells.forEach(c => { for (let k = 0; k < c.colspan; k++) flat.push({ ...c, first: k === 0 }); });

      const pubCell = flat[iPub]?.value ?? "";
      const pubKey = firstLink(pubCell) || plain(pubCell);
      const firm = plain(flat[iFirm]?.value ?? "");
      const dateStr = new Date(ts).toISOString().slice(0, 10);
      const where = `${dateStr} · ${firm} · ${pubKey}`;
      const sourceId = outlets[pubKey];
      if (!sourceId) { unknownOutlets.add(pubKey); skipped.push(`${where}: מפרסם לא ממופה`); continue; }

      const seats = new Map();
      let bad = null;
      for (let i = partyFrom; i < iOthers; i++) {
        const cell = flat[i];
        if (!cell || !cell.first) continue;               // תא ממוזג (colspan=2) נספר פעם אחת
        const label = slots[i]?.label;
        const n = parseSeats(cell.value);
        if (n == null) { bad = `ערך לא מספרי בעמודה ${label}: "${cell.value}"`; break; }
        if (!(label in parties)) { if (n > 0) unknownParties.add(label); continue; }
        const id = parties[label];
        if (id) seats.set(id, (seats.get(id) || 0) + n);
      }
      if (bad) { skipped.push(`${where}: ${bad}`); continue; }
      const sum = [...seats.values()].reduce((a, b) => a + b, 0);
      if (sum !== 120) { skipped.push(`${where}: סכום ${sum} ולא 120`); continue; }

      const refIdx = /\u0001(\d+)\u0001/.exec(pubCell)?.[1];
      const articleUrl = refIdx != null ? (/\burl\s*=\s*(https?:\/\/[^\s|}]+)/i.exec(refs[+refIdx]) || [])[1] : null;

      polls.push({ ts, dateStr, sourceId, firm, sourceUrl: articleUrl || pageUrl, seats });
    }
  }

  if (unknownParties.size)
    throw new Error(`בוויקיפדיה יש עמודות מפלגה שלא ממופות ויש בהן מנדטים: ${[...unknownParties].join(", ")}. ` +
      `יש להוסיף אותן ל-wikipedia.parties ב-scripts/config.json (מזהה מפלגה, או null כדי להתעלם).`);
  if (unknownOutlets.size) console.warn(`   ! מפרסמים לא ממופים בוויקיפדיה (דולגו): ${[...unknownOutlets].join(", ")}`);
  return { polls, skipped };
}

/* ---------- שליפה ---------- */

export async function fetchWikitext({ page, userAgent, timeoutMs = 30000 }) {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext|revid&format=json&formatversion=2&redirects=1`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": userAgent, "Api-User-Agent": userAgent } });
      if (res.ok) {
        const j = await res.json();
        if (j.error) throw new Error(`Wikipedia API: ${j.error.code} — ${j.error.info}`);
        return { wikitext: j.parse.wikitext, revid: j.parse.revid, title: j.parse.title };
      }
      if (attempt >= 3 || (res.status !== 429 && res.status < 500)) throw new Error(`Wikipedia API: ${res.status} ${res.statusText}`);
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  } finally { clearTimeout(t); }
}
