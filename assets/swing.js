/* ============================================================
   ברומטר — המפה המתנדנדת: תוצאות האמת לפי יישוב, 2015–2022
   ------------------------------------------------------------
   הנתונים: data/locality-history.json (scripts/import-locality-history.mjs).
   כל יישוב: [בעלי זכות, מצביעים, כשרים, גוש נתניהו, המתנגדים, ערבים,
   אחרות, חרדים, ישראל ביתנו, הרשימה המובילה] לכל אחת משש מערכות הבחירות,
   ותא גאוגרפי למפה בסגנון 270toWin.
   עטוף בפונקציה כדי לא להתנגש בשמות הגלובליים של app.js.
   ============================================================ */
(() => {
"use strict";

const I = { elig: 0, voted: 1, valid: 2, R: 3, L: 4, A: 5, O: 6, H: 7, Y: 8, top: 9 };
const CAMP = {
  R: { he: "גוש נתניהו", color: "#3A81DB" },
  L: { he: "המתנגדים", color: "#D65548" },
  A: { he: "הרשימות הערביות", color: "#328F70" }
};
/* דירוג בסגנון 270toWin, לפי הפער בנקודות בין הגוש המוביל ביישוב לגוש השני */
const RATINGS = [
  { key: "safe", he: "בטוח", min: 30 },
  { key: "likely", he: "סביר", min: 15 },
  { key: "leans", he: "נוטה", min: 7 },
  { key: "tilt", he: "נטייה קלה", min: 2 },
  { key: "tossup", he: "צמוד", min: 0 }
];
/* כמו ב־270toWin: בטוח = הגוון הכהה, וככל שהפער קטן הגוון מתבהר ומאפיר, עד אפור ביישובים הצמודים */
const PALETTE = {
  R: { safe: "#1B4F96", likely: "#3A81DB", leans: "#93BAEC", tilt: "#B3BDCB" },
  L: { safe: "#9E2B25", likely: "#D65548", leans: "#EFA299", tilt: "#CDB5B2" },
  A: { safe: "#18614A", likely: "#328F70", leans: "#8CC6AD", tilt: "#B3C4BC" },
  tossup: "#A9A9A6", none: "#ECE9E3"
};
const MIN_TABLE_VOTES = 5000;
const SCN_STEP = 2.5;
const SW = { data: null, sel: "2022", mode: "lead", base: "prev", sort: "close", loc: null, calcGroup: "close", calcPts: 0, shifts: new Map(), paths: null };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const fmt = n => new Intl.NumberFormat("he-IL").format(Math.round(n));
const r1 = v => Math.round(v * 10) / 10;
const signed = (v, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const kVotes = n => n >= 1e6 ? `${r1(n / 1e6)} מיליון` : n >= 1e4 ? `${fmt(Math.round(n / 1000))} אלף` : fmt(n);
const textOn = hex => { const n = parseInt(hex.slice(1), 16), l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > .62 ? "#1A2230" : "#fff"; };

/* ---------- נתונים, כולל תרחיש המשתמש ---------- */
const electionIds = () => SW.data.elections.map(e => e.id);
const electionOf = id => SW.data.elections.find(e => e.id === id);
const labelOf = id => electionOf(id)?.label || id;
/* היחידות במפה, בטבלה ובתרחיש הן ~70 האזורים (כל אחד כ־1% מהקולות). יישובים
   שאינם באף אזור — מעטפות חיצוניות ויישובים בלי קואורדינטות — נספרים בפס
   המנדטים בלבד. החיפוש הוא לפי יישוב, ומסמן את האזור שלו. */
const units = () => SW.data.regions;
const locByCode = code => SW.data.regions.find(l => l.code === code);
const barUnits = () => [...SW.data.regions, ...SW.data.localities.filter(l => l.region == null)];

/* תוצאת יישוב בבחירות id, אחרי התזוזה שהמשתמש הגדיר לו (רק בבחירות המוצגות) */
function result(l, id = SW.sel) {
  const x = l.e[id]; if (!x) return null;
  const p = id === SW.sel ? SW.shifts.get(l.code) || 0 : 0;
  if (!p || !x[I.valid]) return x;
  const y = x.slice(), k = x[I.valid] * Math.abs(p) / 100;
  if (p > 0) {                                     // ימינה: הקולות באים מהמתנגדים ומהערבים באופן יחסי
    const pool = x[I.L] + x[I.A], m = Math.min(k, pool);
    if (pool) { y[I.L] -= m * x[I.L] / pool; y[I.A] -= m * x[I.A] / pool; y[I.R] += m; }
  } else {
    const m = Math.min(k, x[I.R]), pool = x[I.L] + x[I.A] || 1;
    y[I.R] -= m; y[I.L] += m * (x[I.L] || (x[I.A] ? 0 : 1)) / pool; y[I.A] += m * x[I.A] / pool;
  }
  return y;
}
const shares = x => x && x[I.valid] ? { R: x[I.R] / x[I.valid] * 100, L: x[I.L] / x[I.valid] * 100, A: x[I.A] / x[I.valid] * 100 } : null;
function lead(x) {
  const s = shares(x); if (!s) return null;
  const [[c1, v1], [, v2]] = Object.entries(s).sort((a, b) => b[1] - a[1]);
  const margin = v1 - v2;
  return { camp: c1, margin, rating: RATINGS.find(r => margin >= r.min) };
}
const ratingColor = ld => !ld ? PALETTE.none : ld.rating.key === "tossup" ? PALETTE.tossup : PALETTE[ld.camp][ld.rating.key];
const ratingLabel = ld => !ld ? "" : ld.rating.key === "tossup" ? "צמוד" : `${ld.rating.he} ${CAMP[ld.camp].he}`;
const majorityMargin = x => x && x[I.valid] ? (x[I.R] - x[I.L] - x[I.A]) / x[I.valid] * 100 : null;
const ybRight = id => electionOf(id).lists.find(l => l.id === "yisrael_beiteinu")?.camp === "R";
/* נתח הימין "הטהור" — בלי ישראל ביתנו בשנים שבהן נספרה בימין — מודד תזוזה של מצביעים ולא של מפלגה */
const coreR = (x, id) => (x[I.R] - (ybRight(id) ? x[I.Y] : 0)) / x[I.valid] * 100;
const sector = l => { const x = l.e["2022"]; if (!x || !x[I.valid]) return "none"; if (x[I.H] / x[I.valid] > .6) return "haredi"; if (x[I.A] / x[I.valid] > .6) return "arab"; return "jewish"; };
const seatQuota = id => electionOf(id).valid / 120;

function baseFor(id) { const ids = electionIds(), i = ids.indexOf(id); return SW.base === "prev" ? ids[Math.max(0, i - 1)] : SW.base; }
function shiftOf(l, id = SW.sel) {
  const b = baseFor(id); if (b === id) return null;
  const x = result(l, id), y = l.e[b]; if (!x?.[I.valid] || !y?.[I.valid]) return null;
  return x[I.R] / x[I.valid] * 100 - y[I.R] / y[I.valid] * 100;
}
function shiftColor(d) {
  if (d == null) return PALETTE.none;
  const a = Math.abs(d); if (a < 1) return "#D9D4C8";
  const k = a >= 10 ? "safe" : a >= 6 ? "likely" : a >= 3 ? "leans" : "tilt";
  return PALETTE[d > 0 ? "R" : "L"][k];
}
const cellColor = l => SW.mode === "shift" ? shiftColor(shiftOf(l)) : ratingColor(lead(result(l)));

/* ---------- חלוקת מנדטים (באדר-עופר של app.js) אחרי תזוזה ---------- */
/* delta = שינוי בקולות של כל גוש ברמה הארצית; מתחלק בין רשימות הגוש באופן יחסי */
function seatsWith(id, delta = { R: 0, L: 0, A: 0 }) {
  const e = electionOf(id);
  const campSum = c => e.lists.filter(l => l.camp === c).reduce((s, l) => s + l.votes, 0);
  const sums = { R: campSum("R"), L: campSum("L"), A: campSum("A") };
  const votes = Object.fromEntries(e.lists.map(l => [l.id, l.votes + (sums[l.camp] && delta[l.camp] ? delta[l.camp] * l.votes / sums[l.camp] : 0)]));
  const passing = Object.fromEntries(Object.entries(votes).filter(([, n]) => n / e.valid >= .0325));
  const pairs = e.agreements.filter(([a, b]) => passing[a] != null && passing[b] != null);
  const camp = Object.fromEntries(e.lists.map(l => [l.id, l.camp]));
  return Object.entries(baderOfer(passing, pairs, 120)).reduce((b, [lid, n]) => (b[camp[lid]] = (b[camp[lid]] || 0) + n, b), { R: 0, L: 0, A: 0 });
}
function scenarioDelta() {
  const d = { R: 0, L: 0, A: 0 };
  for (const code of SW.shifts.keys()) {
    const l = locByCode(code), x = l?.e[SW.sel], y = l && result(l); if (!x || !y) continue;
    d.R += y[I.R] - x[I.R]; d.L += y[I.L] - x[I.L]; d.A += y[I.A] - x[I.A];
  }
  return d;
}

/* ---------- 1. הפס העליון: 120 מנדטים, 61 לרוב ---------- */
/* כל גוש מקבל את המנדטים שלו בפועל, מחולקים לפי סוג היישובים שמהם הגיעו
   הקולות: יישובים שבהם הגוש מוביל בבטחה, בסבירות, בנטייה, בנטייה קלה,
   יישובים צמודים, ויישובים שבהם מוביל גוש אחר. */
const BUCKETS = ["safe", "likely", "leans", "tilt", "tossup", "other"];
function barModel() {
  const seats = seatsWith(SW.sel, scenarioDelta());
  const votes = { R: {}, L: {}, A: {} };
  for (const l of barUnits()) {
    const x = result(l); if (!x?.[I.valid]) continue;
    const ld = lead(x);
    for (const c of ["R", "L", "A"]) {
      const b = ld.rating.key === "tossup" ? "tossup" : ld.camp === c ? ld.rating.key : "other";
      votes[c][b] = (votes[c][b] || 0) + x[I[c]];
    }
  }
  const segs = {};
  for (const c of ["R", "L", "A"]) {
    const tot = BUCKETS.reduce((s, b) => s + (votes[c][b] || 0), 0) || 1;
    segs[c] = BUCKETS.map(b => ({ b, seats: seats[c] * (votes[c][b] || 0) / tot })).filter(s => s.seats > .05);
  }
  return { seats, segs };
}
function segColor(c, b) {
  if (b === "tossup") return PALETTE.tossup;
  if (b === "other") return `repeating-linear-gradient(135deg, ${PALETTE[c].tilt} 0 4px, #F3F0EA 4px 7px)`;
  return PALETTE[c][b];
}
const BUCKET_HE = { safe: "בטוח", likely: "סביר", leans: "נוטה", tilt: "נטייה קלה", tossup: "צמוד", other: "באזורים שבהם מוביל גוש אחר" };
function barHTML() {
  const { seats, segs } = barModel();
  const seg = (c, s) => `<span class="sw-bar-seg" style="width:${s.seats / 120 * 100}%;background:${segColor(c, s.b)};color:${s.b === "other" ? "#1A2230" : textOn(s.b === "tossup" ? PALETTE.tossup : PALETTE[c][s.b])}" title="${esc(CAMP[c].he)} · ${esc(BUCKET_HE[s.b])}: ${r1(s.seats)} מנדטים">${s.seats >= 3.5 ? Math.round(s.seats) : ""}</span>`;
  const left = [...segs.A.map(s => seg("A", s)), ...[...segs.L].reverse().map(s => seg("L", s))];
  const n = SW.shifts.size, e = electionOf(SW.sel);
  const official = e.blocSeats;
  const changed = n && (seats.R !== official.R || seats.L !== official.L || seats.A !== official.A);
  return `<div class="sw-bar-head">
      <div class="sw-bar-side r"><span class="sw-bar-name" style="color:${CAMP.R.color}">${esc(CAMP.R.he)}</span><b style="color:${CAMP.R.color}">${seats.R}</b></div>
      <div class="sw-bar-mid">61 לרוב</div>
      <div class="sw-bar-side l"><span class="sw-bar-sub"><b style="color:${CAMP.A.color}">${seats.A}</b> ערבים +</span><b style="color:${CAMP.L.color}">${seats.L}</b><span class="sw-bar-name" style="color:${CAMP.L.color}">${esc(CAMP.L.he)}</span></div>
    </div>
    <div class="sw-bar" role="img" aria-label="${esc(CAMP.R.he)} ${seats.R} מנדטים, ${esc(CAMP.L.he)} ${seats.L}, הרשימות הערביות ${seats.A}. 61 לרוב.">
      ${segs.R.map(s => seg("R", s)).join("")}${left.join("")}
      <span class="sw-bar-mark" aria-hidden="true"><i>▼</i><i>▲</i></span>
    </div>
    <p class="sw-bar-foot">${n ? `<b>תרחיש:</b> ${n === 1 ? "אזור אחד הוזז" : `${n} אזורים הוזזו`}${changed ? ` · בפועל היו לגוש ${official.R} מנדטים` : " · המנדטים לא השתנו"} · <button type="button" class="sw-link" data-scn-reset>איפוס התרחיש</button>` : `${esc(e.label)} · תוצאות האמת. בתוך כל גוש: מנדטים מאזורים שבהם הוא מוביל בבטחה (כהה) ← בפער קטן (בהיר) ← אזורים צמודים (אפור) ← אזורים שבהם מוביל גוש אחר (מפוספס).`}</p>`;
}

/* ---------- 2. המפה ---------- */
/* המפה גאוגרפית (scripts/import-locality-history.mjs): כל אזור בצורתו ובגודלו
   האמיתיים, כמו המדינות ב־270toWin, ובתוכו המשקל שלו במנדטים. גוש דן, שבו
   ערים גדולות בשטח קטן, מקבל חלון מוגדל. היחידות — עשיריות ק״מ, צפון למעלה. */
const decode = e => { let x = 0, y = 0, s = ""; for (let i = 0; i < e.length; i += 2) { x += e[i]; y += e[i + 1]; s += (i ? "L" : "M") + x + " " + y; } return s + "Z"; };
const ringArea = e => { let x = 0, y = 0, px = 0, py = 0, a = 0; for (let i = 0; i < e.length; i += 2) { x += e[i]; y += e[i + 1]; if (i) a += px * y - x * py; px = x; py = y; } return Math.abs(a) / 2; };
function buildPaths() {
  if (SW.paths) return SW.paths;
  SW.paths = units().map(l => ({ l, d: l.shape.rings.map(decode).join(""), cx: l.shape.label[0], cy: l.shape.label[1],
    size: Math.sqrt(l.shape.rings.reduce((t, e) => t + ringArea(e), 0)) }));
  return SW.paths;
}
/* שמות קצרים לתוויות, כמו הקיצורים של המדינות ב־270toWin */
const SHORT = {
  "תל אביב־יפו": "ת״א", "ראשון לציון": "ראשל״צ", "פתח תקווה": "פ״ת", "רמת גן": "ר״ג", "בני ברק": "ב״ב", "כפר סבא": "כ״ס",
  "רמת השרון": "רמה״ש", "קרית אונו": "ק׳ אונו", "יהוד־מונוסון": "יהוד", "גבעת שמואל": "ג׳ שמואל", "מודיעין־מכבים־רעות": "מודיעין",
  "מודיעין עילית": "מודיעין ע׳", "באר שבע": "ב״ש", "פרדס חנה־כרכור": "פרדס חנה"
};
const shortName = l => SHORT[l.lead] || l.lead;
const KX10 = 111.32 * Math.cos(31.5 * Math.PI / 180) * 10, KY10 = 110.57 * 10;
const lonLatBox = (lo0, lo1, la0, la1) => [(lo0 - 34) * KX10, -(la1 - 29) * KY10, (lo1 - 34) * KX10, -(la0 - 29) * KY10];
/* [מזהה, תווית, תיבת תצוגה (null = כל הארץ), הגדלה ביחס למפה הראשית] */
const MAPS = { main: ["sw-map-main", "", null, 1180, "#sw-main"], dan: ["sw-map-dan", "גוש דן, השרון והשפלה", lonLatBox(34.7, 35.02, 31.86, 32.24), 520, "#sw-dan"] };
function mapSVG(key) {
  const [id, label, vb, maxH, host] = MAPS[key], M = SW.data.meta.map;
  const [x0, y0, x1, y1] = vb || M.bbox, pad = vb ? 0 : 8;
  /* פיקסלים ליחידת מפה, לפי הגודל שבו המפה תוצג בפועל */
  const hostW = Math.max(200, ($(host)?.clientWidth || 600) - 12), ppu = Math.min(hostW / (x1 - x0 + 2 * pad), maxH / (y1 - y0 + 2 * pad));
  const water = M.water.map(decode).join("");
  const q = seatQuota(SW.sel);
  const cells = buildPaths();
  const inView = p => p.cx >= x0 && p.cx <= x1 && p.cy >= y0 && p.cy <= y1;
  /* תוויות: שם קצר ומשקל במנדטים, כמו מדינה ומספר האלקטורים. גודל הגופן לפי
     גודל האזור; אזור קטן מדי לתווית במפה הראשית מקבל אותה בחלון המוגדל. */
  /* מניעת התנגשויות: קודם האזורים הכבדים; תווית שחופפת לתווית שכבר הוצבה לא מוצגת */
  const placed = [];
  const labels = cells.filter(inView).sort((a, b) => (result(b.l)?.[I.valid] || 0) - (result(a.l)?.[I.valid] || 0)).map(p => {
    const x = result(p.l); if (!x?.[I.valid]) return "";
    /* גודל הגופן על המסך: כחמישית מגודל האזור, בין 11 ל־20 פיקסלים. ppu = פיקסלים
       ליחידת מפה, נמדד מגודל המכל. אזור שקטן מדי לתווית
       קריאה נשאר בלי תווית — ובחלון המוגדל היא מופיעה. */
    const n = x[I.valid] / q, px = p.size * .2 * ppu;
    if (px < 9) return "";
    const fs = Math.min(20, Math.max(11, px)) / ppu;
    const w = Math.max(shortName(p.l).length * .55, 2.2) * fs, h = 2.3 * fs, bx = [p.cx - w / 2, p.cy - h / 2, p.cx + w / 2, p.cy + h / 2];
    if (placed.some(o => bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1])) return "";
    placed.push(bx);
    const col = textOn(cellColor(p.l));
    return '<text x="' + p.cx + '" y="' + p.cy + '" fill="' + col + '" font-size="' + fs.toFixed(1) + '" class="sw-lbl">' +
      '<tspan x="' + p.cx + '" dy="-.2em" class="sw-lbl-name">' + esc(shortName(p.l)) + '</tspan><tspan x="' + p.cx + '" dy="1.1em">' + n.toFixed(1) + '</tspan></text>';
  }).join("");
  const paths = cells.map(p => '<path d="' + p.d + '" data-code="' + p.l.code + '" fill="' + cellColor(p.l) + '" class="sw-cell' +
    (SW.shifts.has(p.l.code) ? " scn" : "") + (p.l.code === SW.loc ? " sel" : "") + '"/>').join("");
  return '<svg id="' + id + '" class="sw-svg" viewBox="' + (x0 - pad) + " " + (y0 - pad) + " " + (x1 - x0 + 2 * pad) + " " + (y1 - y0 + 2 * pad) +
    '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="מפת האזורים' + (label ? " · " + esc(label) : "") + '">' +
    "<g>" + paths + '</g><path d="' + water + '" class="sw-water"/><g class="sw-labels">' + labels + "</g></svg>" +
    (label ? '<span class="sw-inset-label">' + esc(label) + "</span>" : "");
}
function drawMaps() {
  $("#sw-bar").innerHTML = barHTML();
  $("#sw-main").innerHTML = mapSVG("main");
  $("#sw-dan").innerHTML = mapSVG("dan");
  $("#sw-boxes").innerHTML = boxesHTML();
  $("#sw-legend").innerHTML = legendHTML();
}
/* כמו הריבועים של המדינות הקטנות ב־270toWin: הערים הגדולות, עם המשקל שלהן במנדטים */
function boxesHTML() {
  const q = seatQuota(SW.sel);
  return units().filter(l => l.e[SW.sel]?.[I.valid]).sort((a, b) => b.e[SW.sel][I.valid] - a.e[SW.sel][I.valid]).slice(0, 18)
    .map(l => { const c = cellColor(l); return `<button type="button" class="sw-box${l.code === SW.loc ? " sel" : ""}${SW.shifts.has(l.code) ? " scn" : ""}" data-code="${l.code}" style="background:${c};color:${textOn(c)}"><span>${esc(l.name)}</span><b>${(l.e[SW.sel][I.valid] / q).toFixed(1)}</b></button>`; }).join("");
}
function legendHTML() {
  if (SW.mode === "shift") {
    const steps = [[-10, "10+ שמאלה"], [-6, "6–10"], [-3, "3–6"], [-1.5, "1–3"], [0, "פחות מ־1"], [1.5, "1–3"], [3, "3–6"], [6, "6–10"], [10, "10+ ימינה"]];
    return `<p class="sw-leg-title">שינוי בנתח ${esc(CAMP.R.he)}: ${esc(labelOf(baseFor(SW.sel)))} ← ${esc(labelOf(SW.sel))} (נקודות)</p><div class="sw-leg-row">` +
      steps.map(([d, t]) => `<span class="sw-leg"><i style="background:${shiftColor(d)}"></i>${t}</span>`).join("") + `</div>`;
  }
  const row = c => `<div class="sw-pal-row"><span class="sw-pal-name" style="color:${CAMP[c].color}">${esc(CAMP[c].he)}</span>${["safe", "likely", "leans", "tilt"].map(k => `<i style="background:${PALETTE[c][k]}" title="${RATINGS.find(r => r.key === k).he}"></i>`).join("")}</div>`;
  return `<p class="sw-leg-title">צבע האזור</p><div class="sw-pal-head"><span></span>${["safe", "likely", "leans", "tilt"].map(k => `<span>${RATINGS.find(r => r.key === k).he}</span>`).join("")}</div>
    ${row("R")}${row("L")}${row("A")}
    <div class="sw-pal-row"><span class="sw-pal-name">צמוד</span><i style="background:${PALETTE.tossup}"></i><small>פער של פחות מ־2 נק׳</small></div>
    <p class="sw-leg-note">בטוח: פער של 30 נק׳ ומעלה · סביר: 15–30 · נוטה: 7–15 · נטייה קלה: 2–7. המספרים על המפה — משקל האזור במנדטים (קולות כשרים חלקי מחיר מנדט).</p>`;
}

/* ---------- טולטיפ ובחירת יישוב ---------- */
function tipHTML(l) {
  const x = result(l); if (!x) return `<b>${esc(l.name)}</b><br>לא השתתף בבחירות האלה`;
  const s = shares(x), ld = lead(x), d = shiftOf(l), p = SW.shifts.get(l.code);
  return `<b>${esc(l.name)}</b> · ${esc(labelOf(SW.sel))}${p ? ` · תרחיש ${signed(p)}` : ""}<br>${fmt(x[I.valid])} קולות · ${r1(x[I.valid] / seatQuota(SW.sel))} מנדטים<br>` +
    `<span style="color:${CAMP.R.color}">■</span> ${r1(s.R)}% · <span style="color:${CAMP.L.color}">■</span> ${r1(s.L)}% · <span style="color:${CAMP.A.color}">■</span> ${r1(s.A)}%<br>` +
    (SW.mode === "shift" && d != null ? `שינוי מ${esc(labelOf(baseFor(SW.sel)))}: ${signed(d)} נק׳` : `${esc(ratingLabel(ld))} · פער ${r1(ld.margin)} נק׳`);
}
function sparkSVG(l) {
  const ids = electionIds(), W = 310, H = 118, P = 32;
  const x = i => P + i * (W - 2 * P) / (ids.length - 1), y = v => H - P - v / 100 * (H - 2 * P);
  const line = c => ids.map((id, i) => l.e[id]?.[I.valid] ? [x(i), y(shares(result(l, id))[c])] : null).filter(Boolean);
  const path = pts => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const grid = [0, 50, 100].map(v => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" class="sw-grid"/><text x="${P - 4}" y="${y(v) + 4}" text-anchor="end" class="sw-ax">${v}%</text>`).join("");
  const labels = ids.map((id, i) => `<text x="${x(i)}" y="${H - 4}" text-anchor="middle" class="sw-ax">${esc({ "2019a": "4/19", "2019b": "9/19" }[id] || id)}</text>`).join("");
  const lines = ["L", "A", "R"].map(c => { const p = line(c); return `<path d="${path(p)}" stroke="${CAMP[c].color}" fill="none" stroke-width="2.4"/>` + p.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="2.6" fill="${CAMP[c].color}"/>`).join(""); }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="sw-spark" direction="ltr" role="img" aria-label="נתח כל גוש ב${esc(l.name)} לאורך שש מערכות הבחירות">${grid}${labels}${lines}</svg>`;
}
function membersHTML(l) {
  if (!l.members || l.members.length < 2) return "";
  const byCode = new Map(SW.data.localities.map(x => [x.code, x]));
  const list = l.members.map(c => byCode.get(c)).filter(Boolean);
  const top = list.slice(0, 10).map(x => { const y = x.e[SW.sel]; return y?.[I.valid] ? esc(x.name) + " <small>(" + r1(y[I.R] / y[I.valid] * 100) + "% ימין)</small>" : esc(x.name); });
  return '<p class="sw-members"><b>' + list.length + " יישובים באזור:</b> " + top.join(" · ") + (list.length > 10 ? " ועוד " + (list.length - 10) : "") + "</p>";
}
function detailHTML(l) {
  if (!l) return '<p class="sec-note">לחצו על אזור במפה או על אחד הריבועים כדי לראות את ההיסטוריה שלו ולהזיז אותו בתרחיש.</p>';
  const rows = electionIds().map(id => {
    const x = result(l, id); if (!x?.[I.valid]) return `<tr><td>${esc(labelOf(id))}</td><td colspan="4">—</td></tr>`;
    const s = shares(x);
    return `<tr${id === SW.sel ? ' class="on"' : ""}><td>${esc(labelOf(id))}</td><td>${fmt(x[I.valid])}</td><td style="color:${CAMP.R.color}">${r1(s.R)}%</td><td style="color:${CAMP.L.color}">${r1(s.L)}%</td><td style="color:${CAMP.A.color}">${r1(s.A)}%</td></tr>`;
  }).join("");
  const x = result(l), ld = lead(x), p = SW.shifts.get(l.code) || 0, mt = metrics(l);
  return `<h3 class="sw-loc-name">${esc(l.name)}</h3>
    ${ld ? `<p class="sw-loc-rating"><i style="background:${ratingColor(ld)}"></i>${esc(ratingLabel(ld))} ב${esc(labelOf(SW.sel))} · פער ${r1(ld.margin)} נק׳ · ${r1(x[I.valid] / seatQuota(SW.sel))} מנדטים</p>` : ""}
    ${x ? `<div class="sw-scn" role="group" aria-label="תרחיש לאזור">
      <button type="button" data-scn="${-SCN_STEP}">שמאלה ${SCN_STEP}</button>
      <span class="sw-scn-val">${p ? `${signed(p)} נק׳` : "תוצאת אמת"}</span>
      <button type="button" data-scn="${SCN_STEP}">ימינה ${SCN_STEP}</button>
      ${p ? `<button type="button" class="sw-link" data-scn="0">איפוס</button>` : ""}
    </div>` : ""}
    ${membersHTML(l)}
    ${sparkSVG(l)}
    <table class="sw-loc-table"><thead><tr><th>בחירות</th><th>קולות</th><th>ימין</th><th>מתנגדים</th><th>ערבים</th></tr></thead><tbody>${rows}</tbody></table>
    ${mt ? `<p class="sec-note">תנודתיות: ${r1(mt.vol)} נק׳ (סטיית התקן של נתח הימין לאורך שש הבחירות, בלי ישראל ביתנו) · כ־${fmt(mt.movable)} קולות בתנועה.</p>` : ""}`;
}
function selectLoc(code, scroll) {
  SW.loc = code;
  $("#sw-detail").innerHTML = detailHTML(locByCode(code));
  $$(".sw-cell.sel, .sw-box.sel").forEach(el => el.classList.remove("sel"));
  $$(`.sw-cell[data-code="${code}"], .sw-box[data-code="${code}"]`).forEach(el => { el.classList.add("sel"); if (el.tagName === "path") el.parentNode.appendChild(el); });
  $$("#sw-table [data-code]").forEach(r => r.classList.toggle("sel", Number(r.dataset.code) === code));
  if (scroll) $("#sw-2").scrollIntoView({ behavior: "smooth", block: "start" });
}
function setShift(code, v) {
  if (v === 0) SW.shifts.delete(code);
  else SW.shifts.set(code, Math.max(-30, Math.min(30, (SW.shifts.get(code) || 0) + v)));
  if (SW.shifts.get(code) === 0) SW.shifts.delete(code);
  drawMaps(); selectLoc(code, false);
}

/* ---------- מדדי נדנדה לכל יישוב ---------- */
function metrics(l) {
  const ids = electionIds();
  if (!ids.every(id => l.e[id]?.[I.valid] > 0)) return null;
  const core = ids.map(id => coreR(l.e[id], id));
  const m = core.reduce((a, b) => a + b) / core.length;
  const vol = Math.sqrt(core.reduce((a, b) => a + (b - m) ** 2, 0) / core.length);
  const meanValid = ids.reduce((s, id) => s + l.e[id][I.valid], 0) / ids.length;
  const x = l.e["2022"], rs = id => l.e[id][I.R] / l.e[id][I.valid] * 100;
  return { vol, movable: vol / 100 * meanValid, margin: majorityMargin(x), since15: rs("2022") - rs("2015"), since19: rs("2022") - rs("2019b"), valid: x[I.valid] };
}

/* ---------- 3. טבלת הערים המתנדנדות ---------- */
const SORTS = {
  close: { he: "הכי צמודים", note: "האזורים עם הפער הקטן ביותר בין גוש נתניהו לכל השאר ב־2022.", f: () => true, by: (a, b) => Math.abs(a.margin) - Math.abs(b.margin) },
  movable: { he: "הכי הרבה קולות בתנועה", note: "תנודתיות נתח הימין (בלי ישראל ביתנו) כפול מספר הקולות — כמה קולות האזור מזיז בפועל בין בחירות לבחירות.", f: () => true, by: (a, b) => b.movable - a.movable },
  right: { he: "זזו ימינה מאז 9/2019", note: "השינוי בנתח גוש נתניהו מספטמבר 2019 (מאז הגושים יציבים) עד 2022.", f: () => true, by: (a, b) => b.since19 - a.since19 },
  left: { he: "זזו שמאלה מאז 9/2019", note: "השינוי בנתח גוש נתניהו מספטמבר 2019 עד 2022.", f: () => true, by: (a, b) => a.since19 - b.since19 }
};
function tableRows() {
  return units().filter(l => (l.e["2022"]?.[I.valid] || 0) >= MIN_TABLE_VOTES)
    .map(l => ({ l, ...metrics(l) })).filter(r => r.vol != null);
}
function tableHTML() {
  const s = SORTS[SW.sort];
  const rows = tableRows().filter(s.f).sort(s.by).slice(0, 25);
  const chip = v => { const a = Math.abs(v), c = a < 2 ? PALETTE.tossup : PALETTE[v > 0 ? "R" : "L"][a >= 30 ? "safe" : a >= 15 ? "likely" : a >= 7 ? "leans" : "tilt"]; return `<span class="sw-margin" style="background:${c};color:${textOn(c)}">${signed(v)}</span>`; };
  const delta = v => `<span class="sw-delta ${v > 0 ? "r" : "l"}">${signed(v)}</span>`;
  return `<p class="sec-note">${esc(s.note)}</p>
  <div class="tablewrap" tabindex="0" role="region" aria-label="האזורים המתנדנדים"><table id="sw-table">
    <thead><tr><th>#</th><th>אזור</th><th>קולות 2022</th><th title="גוש נתניהו פחות כל השאר, בנקודות">פער 2022</th><th>מאז 2015</th><th>מאז 9/2019</th><th>תנודתיות</th><th>קולות בתנועה</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-code="${r.l.code}" tabindex="0"${r.l.code === SW.loc ? ' class="sel"' : ""}><td>${i + 1}</td><td>${esc(r.l.name)}</td><td>${fmt(r.valid)}</td><td>${chip(r.margin)}</td><td>${delta(r.since15)}</td><td>${delta(r.since19)}</td><td>${r1(r.vol)}</td><td>${fmt(r.movable)}</td></tr>`).join("")}</tbody>
  </table></div>
  <p class="sec-note">"מאז 2015" בערים דוברות רוסית (אשדוד, אשקלון, כרמיאל, נוף הגליל) כולל את ישראל ביתנו שעברה צד ב־2019 — לא רק מצביעים שזזו.</p>`;
}

/* ---------- 4. מחשבון: כמה תזוזה צריך ---------- */
const GROUPS = {
  close: { he: "האזורים הצמודים", note: "האזורים שבהם הפער ב־2022 קטן מ־15 נקודות", pick: r => Math.abs(r.margin) < 15 },
  movable: { he: "15 האזורים עם הכי הרבה קולות בתנועה", note: "לפי התנודתיות לאורך שש מערכות הבחירות", top: 15 },
  jewish: { he: "כל האזורים היהודיים שאינם חרדיים", note: "האזורים שבהם הרשימות הערביות והחרדיות מתחת ל־60%" }
};
function groupRows(key) {
  const g = GROUPS[key], rows = tableRows();
  if (g.top) return rows.sort((a, b) => b.movable - a.movable).slice(0, g.top);
  if (key === "jewish") return units().filter(l => l.e["2022"]?.[I.valid] && sector(l) === "jewish").map(l => ({ l, valid: l.e["2022"][I.valid] }));
  return rows.filter(g.pick);
}
function calcHTML() {
  const rows = groupRows(SW.calcGroup), total = rows.reduce((s, r) => s + r.valid, 0);
  const moved = total * SW.calcPts / 100;           // נקודה אחת בנתח = אחוז אחד מהמצביעים שעוברים צד
  const b = seatsWith("2022", { R: moved, L: -moved, A: 0 });
  const need = electionOf("2022").fragility.votesToFlip;
  return `<div class="sw-calc-out">
      <div class="sw-calc-big"><span style="color:${CAMP.R.color}">${b.R}</span><small>${esc(CAMP.R.he)}</small></div>
      <div class="sw-calc-big"><span style="color:${CAMP.L.color}">${b.L}</span><small>${esc(CAMP.L.he)}</small></div>
      <div class="sw-calc-big"><span style="color:${CAMP.A.color}">${b.A}</span><small>הרשימות הערביות</small></div>
    </div>
    <p class="sw-calc-text">${rows.length} יישובים · ${kVotes(total)} קולות ב־2022. תזוזה של ${signed(SW.calcPts)} נקודות בנתח גוש נתניהו בהם = כ־${fmt(Math.abs(moved))} מצביעים שעוברים צד.
      <b>כדי שגוש נתניהו יאבד את הרוב של 2022 מספיקה בהם תזוזה של כ־${r1(need / total * 100)} נקודות שמאלה</b> (${kVotes(need)} מצביעים).</p>`;
}

/* ---------- 5. האם הדמוגרפיה ניצחה ---------- */
function sectorStats() {
  const out = {};
  for (const l of SW.data.localities) {
    const s = l.code === 99999 ? "external" : sector(l); if (s === "none") continue;
    for (const id of ["2015", "2022"]) {
      const x = l.e[id]; if (!x) continue;
      const a = (out[s] ??= {})[id] ??= { elig: 0, valid: 0, R: 0, H: 0 };
      a.elig += x[I.elig]; a.valid += x[I.valid]; a.R += x[I.R]; a.H += x[I.H];
    }
  }
  return out;
}
function waterfallHTML(d, title) {
  const parts = [["דמוגרפיה בין יישובים", d.demography, "יישובים שגדלו מהר יותר — משקלם עלה"], ["אחוז ההצבעה", d.turnout, "מי יצא להצביע ומי נשאר בבית"],
    ["ליברמן עבר צד", d.realignment, "ישראל ביתנו — אותם מצביעים, גוש אחר"], ["מצביעים שזזו", d.voterShift, "שינוי ההצבעה בתוך היישובים, כולל שינוי אוכלוסייה בתוך עיר"]];
  const max = Math.max(...parts.map(p => Math.abs(p[1])), 1);
  return `<div class="sw-wf"><p class="sw-wf-title">${esc(title)}: <b>${d.start}%</b> ← <b>${d.end}%</b> (${signed(d.end - d.start)} נק׳)</p>
    ${parts.map(([t, v, n]) => `<div class="sw-wf-row"><span class="sw-wf-label">${esc(t)}<small>${esc(n)}</small></span>
      <span class="sw-wf-track"><i class="${v >= 0 ? "pos" : "neg"}" style="width:${Math.abs(v) / max * 50}%"></i></span><span class="sw-wf-num ${v >= 0 ? "r" : "l"}">${signed(v, 2)}</span></div>`).join("")}</div>`;
}
function demographyHTML() {
  const D = SW.data.decomposition, st = sectorStats(), E = SW.data.elections;
  const g = (s, k) => (st[s]["2022"][k] / st[s]["2015"][k] - 1) * 100;
  const hv = id => E.find(e => e.id === id).lists.filter(l => l.id === "shas" || l.id === "utj").reduce((s, l) => s + l.votes, 0);
  const vv = id => electionOf(id).valid;
  const years = (Date.parse(electionOf("2022").date) - Date.parse(electionOf("2015").date)) / 3.156e10;
  const hGrow = hv("2022") - hv("2015"), hTowns = st.haredi["2022"].H - st.haredi["2015"].H;
  const card = (s, title) => `<div class="card pad sw-sector"><p class="kicker">${title}</p>
    <p class="sw-sector-num">${signed(g(s, "elig"))}%</p><p class="sec-note">בעלי זכות בחירה, 2015 ← 2022</p>
    <p class="sw-sector-sub">קולות כשרים ${signed(g(s, "valid"))}% · גוש נתניהו ${signed((st[s]["2022"].R - st[s]["2015"].R) / 1000, 0)} אלף קולות</p></div>`;
  const f22 = electionOf("2022").fragility, f21 = electionOf("2021").fragility, meretz = f22.nearThreshold.find(n => n.id === "meretz");
  return `${waterfallHTML(D.since2019b, "מספטמבר 2019 (מאז הגושים יציבים) עד 2022 — נתח גוש נתניהו מהקולות הכשרים")}
    ${waterfallHTML(D.total, "מ־2015 עד 2022")}
    <div class="grid g3 sw-sectors">${card("haredi", "ערים ויישובים חרדיים")}${card("jewish", "יישובים יהודיים אחרים")}${card("arab", "יישובים ערביים ודרוזיים")}</div>
    <p class="sec-note">המפלגות החרדיות (ש״ס ויהדות התורה) בכל הארץ: ${fmt(hv("2015"))} קולות ב־2015 (${r1(hv("2015") / vv("2015") * 100)}%) ← ${fmt(hv("2022"))} ב־2022 (${r1(hv("2022") / vv("2022") * 100)}%). מתוך הגידול של ${kVotes(hGrow)} קולות, רק ${kVotes(hTowns)} הגיעו מהיישובים החרדיים עצמם.</p>
    <div class="takeaway sw-verdict"><p><b>המסקנה, לפי הנתונים:</b> הדמוגרפיה דוחפת ימינה, אבל לאט. בין יישובים היא הוסיפה לגוש נתניהו רק ${D.since2019b.demography} נק׳ מאז 2019. רוב הגידול בקולות החרדיים קורה בתוך ערים מעורבות, ולכן הוא נספר בשורת "מצביעים שזזו". הנתח של המפלגות החרדיות עלה בכ־${r1((hv("2022") / vv("2022") - hv("2015") / vv("2015")) * 100 / years)} נק׳ בשנה — פחות מהתנודה הרגילה בין מערכת בחירות אחת לבאה.</p>
      <p>והתוצאה עדיין פריכה: ב־2022 הרוב עמד על ${kVotes(f22.votesToFlip)} מצביעים שעוברים צד (${f22.pctOfValid}% מהקולות)${meretz ? `, ו־${fmt(meretz.votesShort)} קולות למרצ היו מורידים את הגוש ל־${meretz.rightSeatsIfPassed}` : ""}. ב־2021 חסרו לגוש ${kVotes(f21.votesToFlip)} מצביעים בלבד כדי להגיע ל־61. הדמוגרפיה לבדה עוד לא מכריעה — אחוז החסימה, אחוז ההצבעה והערים הצמודות מכריעים.</p></div>`;
}

/* ---------- הרכבת העמוד ---------- */
function stripHTML() {
  return SW.data.elections.map(e => {
    const s = e.blocSeats, f = e.fragility;
    const seg = (c, n) => n ? `<span class="sw-seg" style="width:${n / 120 * 100}%;background:${CAMP[c].color}">${n >= 6 ? n : ""}</span>` : "";
    const verdict = f.direction === "lose"
      ? `רוב של ${s.R - 60} · <b>${kVotes(f.votesToFlip)}</b> מצביעים שעוברים צד (${f.pctOfValid}%) מפילים אותו`
      : `חסרו ${61 - s.R} · <b>${kVotes(f.votesToFlip)}</b> מצביעים (${f.pctOfValid}%) היו משלימים ל־61`;
    const near = f.nearThreshold.map(n => `<span class="sw-chip">${esc(n.name)} ${n.pct}% — חסרו ${fmt(n.votesShort)} קולות; אילו עברה: ${n.rightSeatsIfPassed} לגוש</span>`).join("");
    return `<button type="button" class="sw-strip-row${e.id === SW.sel ? " on" : ""}" data-election="${e.id}" aria-pressed="${e.id === SW.sel}">
      <span class="sw-strip-label">${esc(e.label)}</span>
      <span class="sw-strip-bar" aria-hidden="true">${seg("R", s.R)}${seg("L", s.L)}${seg("A", s.A)}<i class="sw-61"></i></span>
      <span class="sw-strip-num" style="color:${CAMP.R.color}">${s.R}</span>
      <span class="sw-strip-note">${verdict}${near ? `<span class="sw-chips">${near}</span>` : ""}</span>
    </button>`;
  }).join("");
}
function shell() {
  const ids = electionIds();
  return `
  <section class="dstep" id="sw-2"><div class="dstep-num" aria-hidden="true">1</div><div class="dstep-body">
    <div class="dstep-head"><p class="kicker">המפה</p><h2>120 מנדטים. 61 לרוב. מאיפה הם מגיעים?</h2>
      <p class="sec-note">הארץ מחולקת לכ־70 אזורים, בכל אחד כ־1% מהקולות — בערך מנדט. עיר גדולה היא אזור בפני עצמה; יישובים קטנים מתאחדים עם שכניהם, ובעדיפות עם שכנים שמצביעים דומה. כל אזור צבוע לפי הגוש שמוביל בו ולפי גודל הפער, והמספר בתוכו הוא המשקל שלו במנדטים. הפס למעלה מראה את המנדטים של כל גוש, מחולקים לפי סוג האזורים שמהם הגיעו הקולות. לחצו על אזור והזיזו אותו ימינה או שמאלה — המנדטים יחושבו מחדש בבאדר־עופר.</p></div>
    <div class="sw-controls">
      <div class="sw-seg-group" role="group" aria-label="בחירות">${ids.map(id => `<button type="button" data-sw-election="${id}" aria-pressed="${id === SW.sel}">${esc(labelOf(id))}</button>`).join("")}</div>
      <div class="sw-seg-group" role="group" aria-label="תצוגה"><button type="button" data-sw-mode="lead" aria-pressed="true">מי מוביל</button><button type="button" data-sw-mode="shift" aria-pressed="false">לאן זזו</button></div>
      <label class="sw-base" hidden><span>לעומת</span><select id="sw-base"><option value="prev">הבחירות הקודמות</option><option value="2015">2015</option><option value="2019b">ספטמבר 2019</option></select></label>
      <label class="sw-search"><span>חיפוש יישוב</span><input id="sw-q" type="search" list="sw-names" placeholder="שם היישוב" autocomplete="off"><datalist id="sw-names">${SW.data.localities.filter(l => l.code !== 99999).map(l => `<option value="${esc(l.name)}">`).join("")}</datalist></label>
    </div>
    <div class="sw-board">
      <div class="sw-barbox" id="sw-bar"></div>
      <div class="sw-stage">
        <div class="sw-main" id="sw-main"></div>
        <div class="sw-side">
          <div class="sw-dan" id="sw-dan"></div>
          <aside class="sw-detail" id="sw-detail" aria-live="polite"></aside>
          <div class="sw-boxes" id="sw-boxes"></div>
          <div class="sw-legend" id="sw-legend"></div>
        </div>
      </div>
    </div>
    <div class="sw-tip" id="sw-tip" hidden></div>
  </div></section>

  <section class="dstep" id="sw-1"><div class="dstep-num" aria-hidden="true">2</div><div class="dstep-body">
    <div class="dstep-head"><p class="kicker">שש מערכות בחירות</p><h2>כמה רחוק היה המנדט ה־61?</h2>
      <p class="sec-note">המנדטים של כל גוש כפי שחולקו בפועל — משוחזרים מקובצי ועדת הבחירות, כולל הסכמי העודפים. הקו — 61. לחצו על שורה כדי להציג את הבחירות האלה במפה.</p></div>
    <div class="sw-strip" id="sw-strip">${stripHTML()}</div>
  </div></section>

  <section class="dstep" id="sw-3"><div class="dstep-num" aria-hidden="true">3</div><div class="dstep-body">
    <div class="dstep-head"><p class="kicker">הערים המתנדנדות</p><h2>איפה נמצאים הקולות שזזים</h2>
      <p class="sec-note">בשיטה היחסית אין "לנצח" ביישוב — כל קול נספר ארצית. לכן יישוב מתנדנד הוא יישוב שיש בו הרבה מצביעים שזזים בין הגושים, לא בהכרח יישוב שבו הגושים שקולים.</p></div>
    <div class="sw-seg-group" role="group" aria-label="מיון">${Object.entries(SORTS).map(([k, s]) => `<button type="button" data-sw-sort="${k}" aria-pressed="${k === SW.sort}">${esc(s.he)}</button>`).join("")}</div>
    <div id="sw-table-box">${tableHTML()}</div>
  </div></section>

  <section class="dstep" id="sw-4"><div class="dstep-num" aria-hidden="true">4</div><div class="dstep-body">
    <div class="dstep-head"><p class="kicker">כמה התוצאה פריכה</p><h2>מה היה קורה אילו קבוצת ערים שלמה זזה?</h2>
      <p class="sec-note">מזיזים את נתח גוש נתניהו בקבוצת יישובים על בסיס תוצאות 2022, ומחלקים מחדש את 120 המנדטים בבאדר-עופר עם הסכמי העודפים של 2022. הקולות עוברים באופן יחסי בין הרשימות של כל גוש.</p></div>
    <div class="sw-calc-controls">
      <label><span>קבוצת היישובים</span><select id="sw-group">${Object.entries(GROUPS).map(([k, g]) => `<option value="${k}">${esc(g.he)}</option>`).join("")}</select></label>
      <label class="sw-range"><span>תזוזה בנתח גוש נתניהו: <b id="sw-pts">0</b> נק׳</span><input id="sw-slider" type="range" min="-8" max="8" step="0.5" value="0"></label>
    </div>
    <p class="sec-note" id="sw-group-note">${esc(GROUPS[SW.calcGroup].note)}</p>
    <div id="sw-calc">${calcHTML()}</div>
  </div></section>

  <section class="dstep" id="sw-5"><div class="dstep-num" aria-hidden="true">5</div><div class="dstep-body">
    <div class="dstep-head"><p class="kicker">דמוגרפיה או תזוזה?</p><h2>האם הדמוגרפיה כבר ניצחה?</h2>
      <p class="sec-note">פירוק השינוי בנתח גוש נתניהו לארבעה חלקים: שינוי במשקל היישובים (דמוגרפיה בין יישובים), אחוז ההצבעה, ליברמן שעבר צד, ומה שנשאר — מצביעים שזזו בתוך היישובים.</p></div>
    ${demographyHTML()}
  </div></section>
  <p class="sec-note sw-source">מקור: ${esc(SW.data.meta.source)}. ${esc(SW.data.meta.blocRule)} יישובים בלי קואורדינטות (בעיקר שבטים בדואיים) ו״מעטפות חיצוניות״ נספרים בסיכומים ובפס המנדטים, אבל לא מופיעים במפה.</p>`;
}

function syncButtons() {
  $$("[data-sw-election]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.swElection === SW.sel)));
  $$("[data-election]").forEach(b => { b.classList.toggle("on", b.dataset.election === SW.sel); b.setAttribute("aria-pressed", String(b.dataset.election === SW.sel)); });
  $$("[data-sw-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.swMode === SW.mode)));
  $$("[data-sw-sort]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.swSort === SW.sort)));
  $(".sw-base").hidden = SW.mode !== "shift";
}
function refresh() {
  syncButtons(); drawMaps();
  if (SW.loc != null) selectLoc(SW.loc, false);
}
function wire() {
  const root = $("#sw-root"), tip = $("#sw-tip");
  root.addEventListener("click", e => {
    const el = e.target.closest("[data-election],[data-sw-election],[data-sw-mode],[data-sw-sort],[data-scn],[data-scn-reset],[data-code]");
    if (!el) return;
    if (el.dataset.election || el.dataset.swElection) {
      SW.sel = el.dataset.election || el.dataset.swElection; SW.shifts.clear(); refresh();
      if (el.dataset.election) $("#sw-2").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    else if (el.dataset.swMode) { SW.mode = el.dataset.swMode; refresh(); }
    else if (el.dataset.swSort) { SW.sort = el.dataset.swSort; $("#sw-table-box").innerHTML = tableHTML(); syncButtons(); }
    else if (el.hasAttribute("data-scn-reset")) { SW.shifts.clear(); refresh(); }
    else if (el.dataset.scn != null && SW.loc != null) setShift(SW.loc, Number(el.dataset.scn));
    else if (el.dataset.code) selectLoc(Number(el.dataset.code), !!el.closest("#sw-table"));
  });
  root.addEventListener("keydown", e => { const r = e.target.closest?.("#sw-table [data-code]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectLoc(Number(r.dataset.code), true); } });
  /* טולטיפ צף מעל התאים */
  root.addEventListener("mousemove", e => {
    const c = e.target.closest?.(".sw-cell");
    if (!c) { tip.hidden = true; return; }
    tip.innerHTML = tipHTML(locByCode(Number(c.dataset.code)));
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - w / 2)) + "px";
    tip.style.top = (e.clientY - h - 14 < 8 ? e.clientY + 18 : e.clientY - h - 14) + "px";
  });
  root.addEventListener("mouseleave", () => { tip.hidden = true; });
  $("#sw-base").addEventListener("change", e => { SW.base = e.target.value; refresh(); });
  $("#sw-q").addEventListener("change", e => { const l = SW.data.localities.find(x => x.name === e.target.value.trim()); if (l?.region != null) selectLoc(l.region, false); });
  $("#sw-group").addEventListener("change", e => { SW.calcGroup = e.target.value; $("#sw-group-note").textContent = GROUPS[SW.calcGroup].note; $("#sw-calc").innerHTML = calcHTML(); });
  $("#sw-slider").addEventListener("input", e => { SW.calcPts = Number(e.target.value); $("#sw-pts").textContent = signed(SW.calcPts); $("#sw-calc").innerHTML = calcHTML(); });
}

async function loadData() {
  const inline = window.__BAROMETER_DATA__?.["data/locality-history.json"];
  if (inline) return inline;
  const r = await fetch("data/locality-history.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("data/locality-history.json");
  return r.json();
}

window.renderSwing = async function renderSwing() {
  const root = $("#sw-root"); if (!root || SW.data || SW.loading) return;
  SW.loading = true;
  try {
    SW.data = await loadData();
  } catch (e) {
    SW.loading = false;
    root.innerHTML = `<p class="sec-note">לא הצלחנו לטעון את נתוני היישובים.</p>`; console.error(e); return;
  }
  root.innerHTML = shell();
  wire();
  syncButtons();
  drawMaps();
  const rishon = units().find(l => l.name === "ראשון לציון");
  if (rishon) selectLoc(rishon.code, false); else $("#sw-detail").innerHTML = detailHTML(null);
};
/* הקובץ הזה עשוי להיטען אחרי שהאתר כבר הציג את העמוד (למשל כשנכנסים ישר
   ל־#/swing והקובץ עוד יורד) — לכן בונים את העמוד גם כאן, וגם בכל מעבר עמוד. */
const renderIfShown = () => { if ($("#view-swing")?.classList.contains("on")) window.renderSwing(); };
document.addEventListener("barometer:view", renderIfShown);
renderIfShown();
})();
