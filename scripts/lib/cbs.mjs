/* ============================================================
   קובץ היישובים של הלמ״ס (bycode2022.xlsx) — קריאה בלי ספריות.
   משותף ל-import-locality-history.mjs ול-build-results-2022.mjs.
   XLSX הוא ZIP של קובצי XML.
   ============================================================ */
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

export function unzip(buf) {
  let eocd = buf.length - 22; while (eocd > 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd <= 0) throw new Error("קובץ הלמ״ס אינו XLSX תקין");
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString();
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28), data = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    files[name] = method === 8 ? inflateRawSync(data) : data;
    p += 46 + nl + xl + cl;
  }
  return files;
}
export const xmlText = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export function xlsxRows(buf) {
  const files = unzip(buf);
  const ss = [...(files["xl/sharedStrings.xml"] || "").toString().matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join("")));
  const sheet = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const col = ref => { let c = 0; for (const ch of ref.replace(/\d+/g, "")) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
  return [...files[sheet].toString().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(r => {
    const row = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c[3] || "") || [])[1];
      row[col(c[1])] = /t="s"/.test(c[2]) ? ss[+v] : v != null ? xmlText(v) : "";
    }
    return row;
  });
}
export const CBS_URL = "https://data.gov.il/dataset/d9b1e04c-426f-4e32-ba40-a1ad9d8748a7/resource/199b15db-3bcb-470e-ba03-73364737e352/download/bycode2022.xlsx";

/* שורות הקובץ: מקובץ מקומי אם ניתן, אחרת הורדה. מחזיר { head, rows, H } */
export async function loadCbsRows({ file, headers } = {}) {
  let buf;
  try { buf = await readFile(file); } catch {
    const res = await fetch(CBS_URL, { headers });
    if (!res.ok) throw new Error(`קובץ הלמ״ס: ההורדה נכשלה (${res.status})`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const rows = xlsxRows(buf), head = rows[0];
  return { head, rows: rows.slice(1), H: n => head.indexOf(n) };
}

/* שמות האזורים הטבעיים (קודי הלמ״ס) */
export const NATURAL = {
  111: "הרי יהודה", 112: "שפלת יהודה", 211: "עמק החולה", 212: "הגליל העליון המזרחי", 213: "אזור חצור", 214: "הגליל העליון",
  221: "הכנרות", 222: "הגליל התחתון המזרחי", 231: "עמק בית שאן", 232: "עמק חרוד", 233: "רמת כוכב", 234: "עמק יזרעאל",
  235: "אזור יקנעם", 236: "רמת מנשה", 237: "הרי נצרת–תירען", 241: "שפרעם ובקעת נטופה", 242: "אזור כרמיאל", 243: "אזור יחיעם",
  244: "אזור אילון", 245: "אזור נהריה", 246: "אזור עכו", 291: "החרמון", 292: "הגולן הצפוני", 293: "הגולן התיכון",
  294: "הגולן הדרומי", 311: "אזור חיפה", 321: "חוף הכרמל", 322: "אזור זכרון יעקב", 323: "הר אלכסנדר", 324: "אזור חדרה",
  411: "מערב השרון", 412: "מזרח השרון", 421: "דרום השרון", 422: "אזור פתח תקווה", 431: "אזור מודיעין", 432: "אזור רמלה",
  441: "אזור רחובות", 442: "אזור ראשון לציון", 511: "אזור תל אביב", 512: "אזור רמת גן", 513: "אזור חולון",
  611: "אזור מלאכי", 612: "לכיש", 613: "אזור אשדוד", 614: "אזור אשקלון", 621: "אזור גרר", 622: "הבשור",
  623: "אזור באר שבע", 624: "ים המלח", 625: "הערבה", 626: "הר הנגב", 627: "הר הנגב הדרומי"
};
