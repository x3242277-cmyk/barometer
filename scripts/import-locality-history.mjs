#!/usr/bin/env node
/**
 * הבארומטר — תוצאות האמת לפי יישוב, 2015–2022, מסווגות לגושים
 * -------------------------------------------------------------
 *   node scripts/import-locality-history.mjs              # מוריד את ששת הקבצים הרשמיים
 *   node scripts/import-locality-history.mjs --dir <תיקייה> # קורא k20.csv … k25.csv מקומיים
 *
 * פלט: data/locality-history.json — לכל יישוב (לפי סמל יישוב של הלמ״ס, שיציב
 * בין מערכות בחירות) את בעלי זכות הבחירה, המצביעים, הכשרים והקולות לכל גוש
 * בכל אחת משש מערכות הבחירות, ועוד ניתוח ארצי: חלוקת המנדטים, פירוק השינוי
 * לדמוגרפיה / אחוז הצבעה / תזוזה, ומדד פריכות.
 *
 * כלל הגושים: כל רשימה נספרת לפי ההמלצה שלה לנשיא אחרי אותן בחירות — מי
 * שהמליץ על נתניהו בגוש הימין, כל השאר בגוש המתנגדים, והרשימות הערביות
 * בנפרד. חריג אחד: ימינה של בנט ב־2021 נספרת בימין, כי מצביעיה הצביעו לה
 * כמפלגת ימין. רשימות שלא עברו את אחוז החסימה משויכות לגוש הטבעי שלהן.
 *
 * בדיקת שפיות: סכום הקולות מכל היישובים, עם הסכמי העודפים של אותן בחירות,
 * חייב לשחזר בדיוק את המנדטים הרשמיים — אחרת הסקריפט נעצר.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argOf = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DIR = argOf("--dir");
const log = (...a) => console.log("·", ...a);
const fmtK = n => `${Math.round(n / 1000)} אלף`;
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" };

/* R = גוש נתניהו, L = המתנגדים, A = הרשימות הערביות. אות → [מזהה, שם, גוש] */
const ELECTIONS = [
  { id: "2015", knesset: 20, date: "2015-03-17", label: "2015",
    url: "https://data.gov.il/dataset/26f9fa06-fcd7-4173-8df5-65797b63e857/resource/929b50c6-f455-4be2-b438-ec6af01421f2/download/expc-5.csv",
    lists: { "מחל": ["likud", "הליכוד", "R"], "אמת": ["zionist_union", "המחנה הציוני", "L"], "ודעם": ["joint_list", "הרשימה המשותפת", "A"],
      "פה": ["yesh_atid", "יש עתיד", "L"], "כ": ["kulanu", "כולנו", "R"], "טב": ["jewish_home", "הבית היהודי", "R"], "שס": ["shas", "ש״ס", "R"],
      "ל": ["yisrael_beiteinu", "ישראל ביתנו", "R"], "ג": ["utj", "יהדות התורה", "R"], "מרצ": ["meretz", "מרצ", "L"], "קץ": ["yachad", "יחד", "R"] },
    agreements: [["מחל", "טב"], ["אמת", "מרצ"], ["שס", "ג"], ["כ", "ל"]],
    seats: { "מחל": 30, "אמת": 24, "ודעם": 13, "פה": 11, "כ": 10, "טב": 8, "שס": 7, "ל": 6, "ג": 6, "מרצ": 5 } },
  { id: "2019a", knesset: 21, date: "2019-04-09", label: "אפריל 2019", url: "https://media21.bechirot.gov.il/files/expc.csv",
    lists: { "מחל": ["likud", "הליכוד", "R"], "פה": ["blue_white", "כחול לבן", "L"], "שס": ["shas", "ש״ס", "R"], "ג": ["utj", "יהדות התורה", "R"],
      "ום": ["hadash_taal", "חד״ש–תע״ל", "A"], "אמת": ["labor", "העבודה", "L"], "ל": ["yisrael_beiteinu", "ישראל ביתנו", "R"],
      "טב": ["urwp", "איחוד מפלגות הימין", "R"], "מרצ": ["meretz", "מרצ", "L"], "כ": ["kulanu", "כולנו", "R"], "דעם": ["raam_balad", "רע״מ–בל״ד", "A"],
      "נ": ["new_right", "הימין החדש", "R"], "ז": ["zehut", "זהות", "R"], "נר": ["gesher", "גשר", "L"] },
    agreements: [["מחל", "טב"], ["אמת", "מרצ"], ["שס", "ג"]],
    seats: { "מחל": 35, "פה": 35, "שס": 8, "ג": 8, "ום": 6, "אמת": 6, "ל": 5, "טב": 5, "מרצ": 4, "כ": 4, "דעם": 4 } },
  { id: "2019b", knesset: 22, date: "2019-09-17", label: "ספטמבר 2019", url: "https://media22.bechirot.gov.il/files/expc.csv",
    lists: { "פה": ["blue_white", "כחול לבן", "L"], "מחל": ["likud", "הליכוד", "R"], "ודעם": ["joint_list", "הרשימה המשותפת", "A"], "שס": ["shas", "ש״ס", "R"],
      "ל": ["yisrael_beiteinu", "ישראל ביתנו", "L"], "ג": ["utj", "יהדות התורה", "R"], "טב": ["yamina", "ימינה", "R"],
      "אמת": ["labor_gesher", "העבודה–גשר", "L"], "מרצ": ["democratic_union", "המחנה הדמוקרטי", "L"], "כף": ["otzma", "עוצמה יהודית", "R"] },
    agreements: [["טב", "מחל"], ["מרצ", "אמת"], ["ג", "שס"], ["פה", "ל"]],
    seats: { "פה": 33, "מחל": 32, "ודעם": 13, "שס": 9, "ל": 8, "ג": 7, "טב": 7, "אמת": 6, "מרצ": 5 } },
  { id: "2020", knesset: 23, date: "2020-03-02", label: "2020", url: "https://media23.bechirot.gov.il/files/expc.csv",
    lists: { "מחל": ["likud", "הליכוד", "R"], "פה": ["blue_white", "כחול לבן", "L"], "ודעם": ["joint_list", "הרשימה המשותפת", "A"], "שס": ["shas", "ש״ס", "R"],
      "ג": ["utj", "יהדות התורה", "R"], "אמת": ["labor_gesher_meretz", "העבודה–גשר–מרצ", "L"], "ל": ["yisrael_beiteinu", "ישראל ביתנו", "L"],
      "טב": ["yamina", "ימינה", "R"], "נץ": ["otzma", "עוצמה יהודית", "R"] },
    agreements: [["מחל", "טב"], ["פה", "אמת"], ["ג", "שס"]],
    seats: { "מחל": 36, "פה": 33, "ודעם": 15, "שס": 9, "ג": 7, "אמת": 7, "ל": 7, "טב": 6 } },
  { id: "2021", knesset: 24, date: "2021-03-23", label: "2021", url: "https://media24.bechirot.gov.il/files/expc.csv",
    lists: { "מחל": ["likud", "הליכוד", "R"], "פה": ["yesh_atid", "יש עתיד", "L"], "שס": ["shas", "ש״ס", "R"], "כן": ["blue_white", "כחול לבן", "L"],
      "ב": ["yamina", "ימינה", "R"], "אמת": ["labor", "העבודה", "L"], "ג": ["utj", "יהדות התורה", "R"], "ל": ["yisrael_beiteinu", "ישראל ביתנו", "L"],
      "ט": ["religious_zionism", "הציונות הדתית", "R"], "ודעם": ["joint_list", "הרשימה המשותפת", "A"], "ת": ["new_hope", "תקווה חדשה", "L"],
      "מרצ": ["meretz", "מרצ", "L"], "עם": ["raam", "רע״מ", "A"] },
    agreements: [["ב", "ת"], ["פה", "ל"], ["שס", "ג"], ["מחל", "ט"], ["כן", "מרצ"]],
    seats: { "מחל": 30, "פה": 17, "שס": 9, "כן": 8, "ב": 7, "אמת": 7, "ג": 7, "ל": 7, "ט": 6, "ודעם": 6, "ת": 6, "מרצ": 6, "עם": 4 } },
  { id: "2022", knesset: 25, date: "2022-11-01", label: "2022", url: "https://media25.bechirot.gov.il/files/expc.csv",
    lists: { "מחל": ["likud", "הליכוד", "R"], "פה": ["yesh_atid", "יש עתיד", "L"], "ט": ["religious_zionism", "הציונות הדתית–עוצמה יהודית", "R"],
      "כן": ["national_unity", "המחנה הממלכתי", "L"], "שס": ["shas", "ש״ס", "R"], "ג": ["utj", "יהדות התורה", "R"], "ל": ["yisrael_beiteinu", "ישראל ביתנו", "L"],
      "עם": ["raam", "רע״מ", "A"], "ום": ["hadash_taal", "חד״ש–תע״ל", "A"], "אמת": ["labor", "העבודה", "L"], "מרצ": ["meretz", "מרצ", "L"],
      "ד": ["balad", "בל״ד", "A"], "ב": ["jewish_home", "הבית היהודי", "R"] },
    agreements: [["אמת", "מרצ"], ["מחל", "ט"], ["כן", "פה"], ["שס", "ג"]],
    seats: { "מחל": 32, "פה": 24, "ט": 14, "כן": 12, "שס": 11, "ג": 7, "ל": 6, "עם": 5, "ום": 5, "אמת": 4 } }
];
const THRESHOLD = 0.0325;
const CAMPS = ["R", "L", "A", "O"];
const EXTERNAL = "מעטפות חיצוניות";

/* ---------- באדר-עופר: אותה פונקציה שהאתר משתמש בה ---------- */
const ctx = vm.createContext({ console, Intl, Date, module: { exports: {} }, window: undefined, document: undefined });
for (const f of ["scenario", "app"]) vm.runInContext(await readFile(path.join(ROOT, "assets", f + ".js"), "utf8"), ctx);
const baderOfer = vm.runInContext("baderOfer", ctx);
function allocate(totals, e) {
  const valid = Object.values(totals).reduce((a, b) => a + b, 0);
  const passing = Object.fromEntries(Object.entries(totals).filter(([, v]) => v / valid >= THRESHOLD));
  const pairs = e.agreements.filter(([a, b]) => passing[a] != null && passing[b] != null);
  return baderOfer(passing, pairs, 120);
}
const campOf = (e, letter) => e.lists[letter]?.[2] || "O";
const blocSeats = (seats, e) => Object.entries(seats).reduce((b, [L, n]) => (b[campOf(e, L)] += n, b), { R: 0, L: 0, A: 0, O: 0 });

/* ---------- קריאה ---------- */
async function loadCsv(e) {
  let buf;
  if (DIR) buf = await readFile(path.join(DIR, `k${e.knesset}.csv`));
  else {
    const res = await fetch(e.url, { headers: UA });
    if (!res.ok) throw new Error(`${e.label}: ההורדה נכשלה (${res.status})`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  let text = buf.toString("utf8");
  if (text.includes("�")) text = new TextDecoder("windows-1255").decode(buf);
  text = text.replace(/^﻿/, "");
  if (/<html/i.test(text.slice(0, 500))) throw new Error(`${e.label}: התקבל דף HTML במקום CSV (חסימה ברשת?)`);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const head = lines[0].split(",").map(s => s.trim());
  const col = n => head.indexOf(n);
  const iValid = col("כשרים");
  const letters = head.slice(iValid + 1).map((L, j) => [L, iValid + 1 + j]).filter(([L]) => L);
  return lines.slice(1).map(l => {
    const c = l.split(",");
    const code = Number(c[col("סמל ישוב")]) || 0;
    const name = (c[col("שם ישוב")] || "").trim() || (code === 0 ? EXTERNAL : "");
    const votes = Object.fromEntries(letters.map(([L, j]) => [L, Number(c[j]) || 0]));
    return { code: name === EXTERNAL ? 99999 : code, name, eligible: Number(c[col("בזב")]) || 0, voted: Number(c[col("מצביעים")]) || 0, valid: Number(c[iValid]) || 0, votes };
  });
}

/* ---------- עיבוד ---------- */
const coords = JSON.parse(await readFile(path.join(ROOT, "data/locality-coords.json"), "utf8"));
const norm = s => s.replace(/[\s\-–־'"״׳()]/g, "");
const coordsNorm = new Map(Object.entries(coords).map(([k, v]) => [norm(k), [k, v]]));

const locs = new Map();      // code → { code, name, names:Set, e:{} }
const national = [];
for (const e of ELECTIONS) {
  const rows = await loadCsv(e);
  const totals = {};
  let eligible = 0, voted = 0, valid = 0;
  for (const r of rows) {
    eligible += r.eligible; voted += r.voted; valid += r.valid;
    for (const [L, v] of Object.entries(r.votes)) totals[L] = (totals[L] || 0) + v;
    const b = { R: 0, L: 0, A: 0, O: 0 };
    let top = null;
    for (const [L, v] of Object.entries(r.votes)) { b[campOf(e, L)] += v; if (!top || v > r.votes[top]) top = L; }
    if (!locs.has(r.code)) locs.set(r.code, { code: r.code, name: r.name, names: new Set(), e: {} });
    const loc = locs.get(r.code);
    loc.name = r.name; loc.names.add(r.name);                    // השם העדכני ביותר גובר
    const byId = id => Object.entries(r.votes).reduce((n, [L, v]) => n + (e.lists[L]?.[0] === id ? v : 0), 0);
    loc.e[e.id] = [r.eligible, r.voted, r.valid, b.R, b.L, b.A, b.O, byId("shas") + byId("utj"), byId("yisrael_beiteinu"), e.lists[top]?.[0] || "other"];
  }
  /* שחזור המנדטים הרשמיים */
  const seats = allocate(totals, e);
  const bad = Object.keys({ ...seats, ...e.seats }).filter(L => (seats[L] || 0) !== (e.seats[L] || 0));
  if (bad.length) throw new Error(`${e.label}: חלוקת המנדטים לא משחזרת את התוצאה הרשמית (${bad.map(L => `${L}: ${seats[L] || 0}≠${e.seats[L] || 0}`).join(", ")})`);
  const bv = { R: 0, L: 0, A: 0, O: 0 };
  for (const [L, v] of Object.entries(totals)) bv[campOf(e, L)] += v;
  const wasted = { R: 0, L: 0, A: 0, O: 0 };
  for (const [L, v] of Object.entries(totals)) if (v / valid < THRESHOLD) wasted[campOf(e, L)] += v;
  national.push({
    id: e.id, knesset: e.knesset, date: e.date, label: e.label, eligible, voted, valid, turnout: +(voted / eligible * 100).toFixed(2),
    blocVotes: bv, blocSeats: blocSeats(seats, e), wasted,
    lists: Object.entries(totals).filter(([L, v]) => e.lists[L] || v / valid >= 0.01).sort((a, b) => b[1] - a[1])
      .map(([L, v]) => ({ letter: L, id: e.lists[L]?.[0] || L, name: e.lists[L]?.[1] || L, camp: campOf(e, L), votes: v, pct: +(v / valid * 100).toFixed(2), seats: seats[L] || 0 })),
    agreements: e.agreements.map(p => p.map(L => e.lists[L][0]))
  });
  log(`${e.label}: ${rows.length} שורות · ימין ${bv.R.toLocaleString()} (${blocSeats(seats, e).R} מנדטים) · מנדטים משוחזרים ✓`);
}

/* ---------- פריכות: כמה קולות מפרידים מהמנדט ה־61 ---------- */
function fragility(e, nat) {
  const totals = Object.fromEntries(nat.lists.map(l => [l.letter, l.votes]));
  const rSeats = nat.blocSeats.R;
  const from = rSeats >= 61 ? "R" : "L", to = rSeats >= 61 ? "L" : "R";
  const fromIds = Object.keys(totals).filter(L => campOf(e, L) === from), toIds = Object.keys(totals).filter(L => campOf(e, L) === to);
  const fromSum = fromIds.reduce((s, L) => s + totals[L], 0), toSum = toIds.reduce((s, L) => s + totals[L], 0);
  const flipped = v => {
    const t = { ...totals };
    fromIds.forEach(L => { t[L] -= v * totals[L] / fromSum; });
    toIds.forEach(L => { t[L] += v * totals[L] / toSum; });
    const r = blocSeats(allocate(t, e), e).R;
    return rSeats >= 61 ? r < 61 : r >= 61;
  };
  let lo = 0, hi = 1;
  while (!flipped(hi) && hi < nat.valid / 4) hi *= 2;
  for (let step = 0; step < 30 && hi - lo > 50; step++) { const mid = (lo + hi) / 2; flipped(mid) ? hi = mid : lo = mid; }
  /* רשימות קרובות לרף: כמה חסר להן, ומה היה קורה אילו עברו */
  const nearThreshold = Object.entries(totals).filter(([L, v]) => v / nat.valid < THRESHOLD && v / nat.valid > 0.015 && e.lists[L])
    .map(([L, v]) => {
      const need = Math.ceil(THRESHOLD * nat.valid - v) + 1;
      const t = { ...totals, [L]: v + need };
      /* הקולות החסרים מגיעים מאותו גוש — הרשימה עוברת, סך הקולות לא משתנה */
      const donors = Object.keys(totals).filter(x => x !== L && campOf(e, x) === campOf(e, L) && totals[x] / nat.valid >= THRESHOLD);
      const dSum = donors.reduce((s, x) => s + totals[x], 0);
      donors.forEach(x => { t[x] -= need * totals[x] / dSum; });
      return { id: e.lists[L][0], name: e.lists[L][1], camp: campOf(e, L), pct: +(v / nat.valid * 100).toFixed(2), votesShort: need, rightSeatsIfPassed: blocSeats(allocate(t, e), e).R };
    });
  return { rightSeats: rSeats, direction: rSeats >= 61 ? "lose" : "gain", votesToFlip: Math.round(hi), pctOfValid: +(hi / nat.valid * 100).toFixed(2), nearThreshold };
}
national.forEach((n, i) => { n.fragility = fragility(ELECTIONS[i], n); });

/* ---------- פירוק השינוי: דמוגרפיה, אחוז הצבעה, תזוזה ----------
   נתח הימין הארצי = ממוצע משוקלל של נתח הימין בכל יישוב. מחליפים רכיב אחד
   בכל פעם: (1) בעלי זכות הבחירה של השנה המאוחרת, באחוז ההצבעה ובהצבעה של
   השנה המוקדמת — זו הדמוגרפיה; (2) גם אחוז ההצבעה המאוחר; (3) הכול מאוחר.
   יישובים שלא קיימים בשתי השנים (יישובים חדשים) נספרים בדמוגרפיה. */
function decompose(a, b) {
  const share = (rows) => { let w = 0, r = 0; for (const [W, R] of rows) { w += W; r += W * R; } return r / w * 100; };
  const both = [...locs.values()].filter(l => l.e[a] && l.e[b] && l.e[a][2] > 0);
  const onlyB = [...locs.values()].filter(l => !l.e[a] && l.e[b]);
  const sR = x => x[3] / x[2];
  const turnout = x => x[0] ? x[2] / x[0] : 0;
  const start = share(both.map(l => [l.e[a][2], sR(l.e[a])]));
  const pop = share([...both.map(l => [l.e[b][0] * turnout(l.e[a]) || l.e[b][2], sR(l.e[a])]), ...onlyB.map(l => [l.e[b][2], sR(l.e[b])])]);
  const turn = share([...both.map(l => [l.e[b][2], sR(l.e[a])]), ...onlyB.map(l => [l.e[b][2], sR(l.e[b])])]);
  const end = share([...both.map(l => [l.e[b][2], sR(l.e[b])]), ...onlyB.map(l => [l.e[b][2], sR(l.e[b])])]);
  const r2 = x => +x.toFixed(2);
  /* ישראל ביתנו החליפה צד בין אפריל לספטמבר 2019. את ההשפעה של זה (מפלגה
     שעברה צד, בלי שאף מצביע זז) מפרידים מהתזוזה של המצביעים עצמם. */
  const ybCamp = id => ELECTIONS.find(e => e.id === id).lists["ל"][2];
  let realign = 0;
  if (ybCamp(a) !== ybCamp(b)) {
    const rows = [...both, ...onlyB].map(l => l.e[b]);
    const yb = rows.reduce((n, x) => n + x[8], 0) / rows.reduce((n, x) => n + x[2], 0) * 100;
    realign = ybCamp(a) === "R" ? -yb : yb;
  }
  return { from: a, to: b, start: r2(start), end: r2(end), demography: r2(pop - start), turnout: r2(turn - pop), realignment: r2(realign), voterShift: r2(end - turn - realign) };
}
const ids = ELECTIONS.map(e => e.id);
const decomposition = { steps: ids.slice(1).map((b, i) => decompose(ids[i], b)), total: decompose(ids[0], ids.at(-1)), since2019b: decompose("2019b", "2022") };

/* ---------- פלט ---------- */
/* בקבצים הרשמיים (וגם בקובץ הקואורדינטות, שנבנה מהם) המקפים נמחקו:
   "תל אביב  יפו", "מודיעיןמכביםרעות". מתקנים לתצוגה את השמות שנפגעו. */
const DISPLAY = {
  "מודיעיןמכביםרעות": "מודיעין־מכבים־רעות", "יהודמונוסון": "יהוד־מונוסון", "מעלותתרשיחא": "מעלות־תרשיחא",
  "פרדס חנהכרכור": "פרדס חנה־כרכור", "קדימהצורן": "קדימה־צורן", "בנימינהגבעת עדה": "בנימינה־גבעת עדה",
  "גדיידהמכר": "ג׳דיידה־מכר", "אום אלפחם": "אום אל־פחם", "באקה אלגרביה": "באקה אל־גרבייה",
  "מגד אלכרום": "מג׳ד אל־כרום", "דאלית אלכרמל": "דאלית אל־כרמל", "דייר אלאסד": "דייר אל־אסד"
};
const displayName = n => DISPLAY[n] || n.replace(/\s{2,}/g, "־");

/* ---------- ~100 אזורים על מפה גאוגרפית אמיתית (בסגנון 270toWin) ----------
   במקום 1,200 נקודות קטנות: הארץ מחולקת לכ־100 אזורים, בכל אחד כ־1% מהקולות
   (כ־47 אלף, בערך מנדט). יישוב גדול מהסף — תל אביב, ירושלים, חיפה... — הוא
   אזור בפני עצמו. היישובים הקטנים מתאחדים עם שכניהם הגאוגרפיים, ובין שני
   שכנים אפשריים מעדיפים את זה שמצביע דומה (כדי לא לערבב סתם כפר ערבי עם
   קיבוץ). המפה עצמה גאוגרפית: כל אזור בצורתו ובגודלו האמיתיים.
   השיטה: רשת של 250 מטר על היבשה (ישראל, הגולן, יהודה ושומרון; בלי עזה,
   הכנרת וים המלח). כל פיקסל שייך ליישוב הקרוב אליו, ודרכו לאזור. הגבולות
   נעקבים מהרשת, ומפושטים קטע־קטע — כל גבול משותף מפושט פעם אחת לשני הצדדים,
   כך שאין חורים או חפיפות בין אזורים. */
const KXM = 111.32 * Math.cos(31.5 * Math.PI / 180), KYM = 110.57;
const toKm = ([lon, lat]) => [(lon - 34) * KXM, (lat - 29) * KYM];
const REGIONS = Number(process.env.MAP_REGIONS) || 100;
const PX = 0.25;                                       // ק״מ
const SIMILARITY = Number(process.env.MAP_SIMILARITY) || 5;   // כמה להעדיף שכן שמצביע דומה

/* מסכת יבשה בשיטת קווי סריקה: פנים המצולע לפי כלל זוגי־אי־זוגי */
function rasterize(land, water) {
  const all = land.flat(), X0 = Math.min(...all.map(p => p[0])) - PX, Y0 = Math.min(...all.map(p => p[1])) - PX;
  const GW = Math.ceil((Math.max(...all.map(p => p[0])) - X0) / PX) + 2, GH = Math.ceil((Math.max(...all.map(p => p[1])) - Y0) / PX) + 2;
  const mask = new Uint8Array(GW * GH);
  const fill = (poly, val) => {
    for (let gy = 0; gy < GH; gy++) {
      const y = Y0 + (gy + .5) * PX, xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil((xs[k] - X0) / PX - .5)), b = Math.min(GW - 1, Math.floor((xs[k + 1] - X0) / PX - .5));
        for (let gx = a; gx <= b; gx++) mask[gy * GW + gx] = val;
      }
    }
  };
  land.forEach(p => fill(p, 1));
  water.forEach(p => fill(p, 0));
  return { mask, GW, GH, X0, Y0 };
}
/* כל פיקסל יבשה — ליישוב הקרוב ביותר (חיפוש בדליים של 5 ק״מ) */
function nearestOwner(R, sites) {
  const B = 5, bx = new Map(), key = (i, j) => i * 100000 + j;
  sites.forEach((s, i) => { const k = key(Math.floor(s.x / B), Math.floor(s.y / B)); if (!bx.has(k)) bx.set(k, []); bx.get(k).push(i); });
  const own = new Int32Array(R.GW * R.GH).fill(-1);
  for (let gy = 0; gy < R.GH; gy++) for (let gx = 0; gx < R.GW; gx++) {
    const idx = gy * R.GW + gx; if (!R.mask[idx]) continue;
    const x = R.X0 + (gx + .5) * PX, y = R.Y0 + (gy + .5) * PX, ci = Math.floor(x / B), cj = Math.floor(y / B);
    let best = Infinity, bi = -1;
    for (let r = 0; r < 60; r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        for (const s of bx.get(key(i, j)) || []) { const d = (sites[s].x - x) ** 2 + (sites[s].y - y) ** 2; if (d < best) { best = d; bi = s; } }
      }
      if (bi >= 0 && (r * B) ** 2 > best) break;
    }
    own[idx] = bi;
  }
  return own;
}
function buildRegions(sites, own, R) {
  /* היעד לאזור: 1% מהקולות — בערך מנדט. עיר גדולה מהסף היא אזור בפני עצמה */
  const n = sites.length, T = sites.reduce((s, t) => s + t.w, 0) / REGIONS;
  /* שכנות בין יישובים — פיקסלים צמודים של יישובים שונים; אורך הגבול בפיקסלים */
  const adj = Array.from({ length: n }, () => new Map());
  for (let gy = 0; gy < R.GH; gy++) for (let gx = 0; gx < R.GW; gx++) {
    const a = own[gy * R.GW + gx]; if (a < 0) continue;
    for (const k of [gx + 1 < R.GW ? gy * R.GW + gx + 1 : -1, gy + 1 < R.GH ? (gy + 1) * R.GW + gx : -1]) {
      if (k < 0) continue; const b = own[k]; if (b < 0 || b === a) continue;
      adj[a].set(b, (adj[a].get(b) || 0) + 1); adj[b].set(a, (adj[b].get(a) || 0) + 1);
    }
  }
  /* אשכולות: יישוב גדול — אזור נעול משלו; הקטנים מתאחדים */
  const cl = sites.map((s, i) => ({ id: i, members: [i], w: s.w, x: s.x * s.w, y: s.y * s.w, r: s.r * s.w, a: s.a * s.w, locked: s.w >= .75 * T, alive: true }));
  const of = Int32Array.from({ length: n }, (_, i) => i);
  const cx = c => c.x / c.w, cy = c => c.y / c.w;
  const neighbors = c => { const m = new Map(); for (const i of c.members) for (const [j, len] of adj[i]) { const d = of[j]; if (d !== c.id) m.set(d, (m.get(d) || 0) + len); } return m; };
  const cost = (c, d, len) => Math.hypot(cx(c) - cx(d), cy(c) - cy(d)) * (1 + SIMILARITY * (Math.abs(c.r / c.w - d.r / d.w) + Math.abs(c.a / c.w - d.a / d.w))) / Math.sqrt(1 + len * PX);
  const merge = (c, d) => {
    for (const i of d.members) { of[i] = c.id; c.members.push(i); }
    c.w += d.w; c.x += d.x; c.y += d.y; c.r += d.r; c.a += d.a; d.alive = false;
  };
  for (const cap of [1.3, 1.6, 3]) {
    for (;;) {
      const open = cl.filter(c => c.alive && !c.locked && c.w < .7 * T).sort((a, b) => a.w - b.w);
      let done = false;
      for (const c of open) {
        let best = null;
        for (const [d, len] of neighbors(c)) { const D = cl[d]; if (D.locked || D.w + c.w > cap * T) continue; const k = cost(c, D, len); if (!best || k < best.k) best = { D, k }; }
        if (best) { if (best.D.w >= c.w) merge(best.D, c); else merge(c, best.D); done = true; break; }
      }
      if (!done) break;
    }
  }
  /* שאריות קטנות מאוד בלי שכן פנוי (למשל כלואות בין ערים גדולות) — לאשכול הקרוב */
  for (const c of cl.filter(c => c.alive && !c.locked && c.w < .3 * T)) {
    const D = cl.filter(d => d.alive && d !== c && !d.locked).sort((a, b) => Math.hypot(cx(a) - cx(c), cy(a) - cy(c)) - Math.hypot(cx(b) - cx(c), cy(b) - cy(c)))[0];
    if (D) merge(D, c);
  }
  return cl.filter(c => c.alive).map(c => c.members);
}
/* מעקב גבולות על הרשת, ופישוט קטע־קטע (דגלאס־פוקר) בין צמתים משותפים */
function traceRegions(label, R, K, tol) {
  const { GW, GH } = R, L = (gx, gy) => (gx < 0 || gy < 0 || gx >= GW || gy >= GH) ? -1 : label[gy * GW + gx];
  const vid = (x, y) => y * (GW + 1) + x, vx = v => v % (GW + 1), vy = v => Math.floor(v / (GW + 1));
  const junction = v => { const x = vx(v), y = vy(v); return new Set([L(x - 1, y - 1), L(x, y - 1), L(x - 1, y), L(x, y)]).size >= 3; };
  const dp = (pts, t) => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], ll = Math.hypot(dx, dy);
    let md = 0, mi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = ll ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / ll : Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
      if (d > md) { md = d; mi = i; }
    }
    return md > t ? [...dp(pts.slice(0, mi + 1), t).slice(0, -1), ...dp(pts.slice(mi), t)] : [a, b];
  };
  const arcCache = new Map();
  /* verts: מזהי קודקודים. כיוון קנוני, כדי ששני הצדדים של גבול משותף יקבלו בדיוק אותו קטע מפושט */
  const simplifyArc = verts => {
    const f = verts[0], l = verts[verts.length - 1];
    const rev = f > l || (f === l && verts[1] > verts[verts.length - 2]);
    const canon = rev ? verts.slice().reverse() : verts;
    const key = canon.join(",");
    let s = arcCache.get(key);
    if (!s) {
      const pts = canon.map(v => [vx(v), vy(v)]);
      if (canon[0] === canon[canon.length - 1] && pts.length > 4) {
        const h = Math.floor(pts.length / 2);
        s = [...dp(pts.slice(0, h + 1), tol).slice(0, -1), ...dp(pts.slice(h), tol)];
      } else s = dp(pts, tol);
      arcCache.set(key, s);
    }
    return rev ? s.slice().reverse() : s;
  };
  const out = [];
  for (let r = 0; r < K; r++) {
    /* צלעות מכוונות, האזור משמאלן */
    const next = new Map();
    const add = (a, b) => { if (!next.has(a)) next.set(a, []); next.get(a).push(b); };
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      if (label[gy * GW + gx] !== r) continue;
      if (L(gx, gy - 1) !== r) add(vid(gx, gy), vid(gx + 1, gy));
      if (L(gx + 1, gy) !== r) add(vid(gx + 1, gy), vid(gx + 1, gy + 1));
      if (L(gx, gy + 1) !== r) add(vid(gx + 1, gy + 1), vid(gx, gy + 1));
      if (L(gx - 1, gy) !== r) add(vid(gx, gy + 1), vid(gx, gy));
    }
    const rings = [];
    for (const start of [...next.keys()]) {
      while (next.get(start)?.length) {
        const loop = [start];
        let cur = next.get(start).pop();
        while (cur !== start) { loop.push(cur); const nx = next.get(cur); if (!nx?.length) break; cur = nx.pop(); }
        if (loop.length < 4) continue;
        /* חיתוך הלולאה בצמתים לקטעים, ופישוט כל קטע */
        const first = loop.findIndex(junction);
        let pts;
        if (first < 0) pts = simplifyArc([...loop, loop[0]]).slice(0, -1);
        else {
          const rot = [...loop.slice(first), ...loop.slice(0, first)];
          const cuts = rot.map((v, i) => junction(v) ? i : -1).filter(i => i >= 0);
          pts = [];
          cuts.forEach((c, k) => {
            const end = k + 1 < cuts.length ? cuts[k + 1] : rot.length;
            pts.push(...simplifyArc([...rot.slice(c, end), rot[end % rot.length]]).slice(0, -1));
          });
        }
        if (pts.length >= 3) rings.push(pts.map(([x, y]) => [R.X0 + x * PX, R.Y0 + y * PX]));
      }
    }
    out.push(rings);
  }
  return out;
}
/* נקודת תווית: הפיקסל של האזור הרחוק ביותר מהגבול שלו (מרחק מנהטן, שני מעברים) */
function labelPoints(label, R, K) {
  const { GW, GH } = R, dist = new Float32Array(GW * GH);
  const same = (i, j) => j >= 0 && j < label.length && label[j] === label[i];
  for (let i = 0; i < dist.length; i++) dist[i] = label[i] < 0 ? 0 : 1e9;
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const i = gy * GW + gx; if (label[i] < 0) continue;
    const up = gy && same(i, i - GW) ? dist[i - GW] + 1 : 0, lf = gx && same(i, i - 1) ? dist[i - 1] + 1 : 0;
    dist[i] = Math.min(dist[i], up, lf);
  }
  for (let gy = GH - 1; gy >= 0; gy--) for (let gx = GW - 1; gx >= 0; gx--) {
    const i = gy * GW + gx; if (label[i] < 0) continue;
    const dn = gy < GH - 1 && same(i, i + GW) ? dist[i + GW] + 1 : 0, rt = gx < GW - 1 && same(i, i + 1) ? dist[i + 1] + 1 : 0;
    dist[i] = Math.min(dist[i], dn, rt);
  }
  const best = Array.from({ length: K }, () => ({ d: -1, x: 0, y: 0 }));
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const i = gy * GW + gx, r = label[i];
    if (r >= 0 && dist[i] > best[r].d) best[r] = { d: dist[i], x: R.X0 + (gx + .5) * PX, y: R.Y0 + (gy + .5) * PX };
  }
  return best.map(b => [b.x, b.y]);
}
/* קידוד דחוס: עשיריות ק״מ, צפון למעלה (y הפוך), נקודה ראשונה במלואה והשאר הפרשים */
const q10 = ([x, y]) => [Math.round(x * 10), Math.round(-y * 10)];
const encodeRing = r => { const Q = r.map(q10); return Q.flatMap(([x, y], i) => i ? [x - Q[i - 1][0], y - Q[i - 1][1]] : [x, y]); };
let noCoords = 0;
const localities = [...locs.values()].sort((a, b) => (b.e["2022"]?.[2] || 0) - (a.e["2022"]?.[2] || 0)).map(l => {
  /* בקובץ הרשמי חסרים מקפים ("מודיעיןמכביםרעות"), ולכן השם המוצג נלקח
     מקובץ הקואורדינטות כשיש התאמה. */
  let hit = null;
  for (const n of [l.name, ...l.names]) { hit = coords[n] ? [n, coords[n]] : coordsNorm.get(norm(n)); if (hit) break; }
  if (!hit && l.code !== 99999) noCoords++;
  const [raw, xy] = hit || [l.name, null];
  return { code: l.code, name: displayName(raw), lon: xy ? +xy[0].toFixed(4) : null, lat: xy ? +xy[1].toFixed(4) : null, e: l.e };
});
/* ---------- בניית האזורים והמפה ---------- */
const geo = JSON.parse(await readFile(path.join(ROOT, "data/regions.json"), "utf8")).geo;
const weightOf = l => l.e["2022"]?.[2] || Object.values(l.e).reduce((s, x) => s + x[2], 0) / Object.keys(l.e).length || 1;
const sites = localities.filter(l => l.lat != null).map(l => {
  const [x, y] = toKm([l.lon, l.lat]), z = l.e["2022"] || Object.values(l.e).at(-1);
  return { code: l.code, x, y, w: Math.max(weightOf(l), 50), r: z[2] ? z[3] / z[2] : 0, a: z[2] ? z[5] / z[2] : 0 };
});
const landKm = [geo.israel, geo.westbank].map(p => p.map(toKm));
const waterKm = [geo.kinneret, geo.deadsea].map(p => p.map(toKm));
const R = rasterize(landKm, waterKm);
const own = nearestOwner(R, sites);
const groups = buildRegions(sites, own, R);
/* סדר קבוע: לפי מספר הקולות, הגדול ראשון */
groups.sort((a, b) => b.reduce((s, i) => s + sites[i].w, 0) - a.reduce((s, i) => s + sites[i].w, 0));
const regionOf = new Int32Array(sites.length);
groups.forEach((g, r) => g.forEach(i => { regionOf[i] = r; }));
const label = new Int32Array(own.length).fill(-1);
for (let k = 0; k < own.length; k++) if (own[k] >= 0) label[k] = regionOf[own[k]];
const shapes = traceRegions(label, R, groups.length, 1.2);     // סבולת פישוט: 1.2 פיקסלים = 300 מטר
const labels = labelPoints(label, R, groups.length);
const byCode = new Map(localities.map(l => [l.code, l]));
const regions = groups.map((g, r) => {
  const members = g.map(i => byCode.get(sites[i].code)).sort((a, b) => weightOf(b) - weightOf(a));
  const e = {};
  for (const l of members) for (const [id, x] of Object.entries(l.e)) {
    const y = e[id] ??= [0, 0, 0, 0, 0, 0, 0, 0, 0, ""];
    for (let k = 0; k < 9; k++) y[k] += x[k];
  }
  const main = members[0].name;
  return {
    code: 1000000 + r, name: members.length === 1 ? main : `${main} והסביבה`, lead: main,
    members: members.map(l => l.code), e,
    shape: { rings: shapes[r].map(encodeRing), label: q10(labels[r]) }
  };
});
const siteIndex = new Map(sites.map((s, i) => [s.code, i]));
localities.forEach(l => { const i = siteIndex.get(l.code); if (i != null) l.region = 1000000 + regionOf[i]; });
const sizes = regions.map(g => g.e["2022"]?.[2] || 0).sort((a, b) => a - b);
log(`אזורים: ${regions.length} · ${regions.filter(g => g.members.length === 1).length} ערים שהן אזור בפני עצמן · קולות לאזור (2022): חציון ${fmtK(sizes[sizes.length >> 1])}, טווח ${fmtK(sizes[0])}–${fmtK(sizes.at(-1))}`);
const allLand = landKm.flat().map(q10);
const mapsMeta = {
  bbox: [Math.min(...allLand.map(p => p[0])), Math.min(...allLand.map(p => p[1])), Math.max(...allLand.map(p => p[0])), Math.max(...allLand.map(p => p[1]))],
  water: waterKm.map(encodeRing),
  units: "עשיריות ק״מ, צפון למעלה"
};
const out = {
  meta: {
    title: "תוצאות האמת לפי יישוב · 2015–2022",
    source: "ועדת הבחירות המרכזית — קובצי תוצאות האמת לפי יישובים (data.gov.il, mediaXX.bechirot.gov.il)",
    generatedAt: new Date().toISOString(),
    blocRule: "כל רשימה לפי ההמלצה שלה לנשיא אחרי אותן בחירות: מי שהמליץ על נתניהו — ימין; השאר — מתנגדים; הרשימות הערביות בנפרד. ימינה ב־2021 נספרת בימין (מצביעיה הצביעו לה כמפלגת ימין). רשימות שלא עברו את אחוז החסימה — לפי הגוש הטבעי שלהן.",
    fields: ["eligible", "voted", "valid", "R", "L", "A", "O", "haredi", "yisraelBeiteinu", "top"],
    camps: { R: "גוש נתניהו", L: "המתנגדים", A: "הרשימות הערביות", O: "אחרות" },
    map: mapsMeta
  },
  elections: national,
  decomposition,
  regions,
  localities
};
await writeFile(path.join(ROOT, "data/locality-history.json"), JSON.stringify(out) + "\n", "utf8");
log(`נכתב data/locality-history.json · ${localities.length} יישובים · ${noCoords} בלי קואורדינטות`);
