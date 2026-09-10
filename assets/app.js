/* ============================================================
   ברומטר — לוגיקת האתר
   ============================================================ */
"use strict";

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" }[c]));
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const sd  = a => Math.sqrt(avg(a.map(v => (v - avg(a)) ** 2)));
const r1  = v => Math.round(v * 10) / 10;
const pct = v => `${r1(v)}%`;
const fmt = n => new Intl.NumberFormat("he-IL").format(Math.round(n));
const heDate = iso => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("he-IL", { day:"2-digit", month:"2-digit", year:"numeric" }); };

const BLOCS = {
  Right:   { he: "ימין",  short: "ימין",  color: "#17457F" },
  Left:    { he: "מרכז–שמאל",  short: "מרכז–שמאל",  color: "#C0392B" },
  Haredi:  { he: "חרדים", short: "חרדים", color: "#5B4B8A" },
  Arabs:   { he: "ערבים", short: "ערבים", color: "#2E8467" },
  Unknown: { he: "לא משויך", short: "אחר", color: "#96A0AB" }
};
const BLOC_ORDER = ["Right", "Arabs", "Left", "Unknown"];
const HAREDI_PARTIES = new Set(["shas", "yahadut_hatora", "utj", "mifleget_hazibur_haharedi"]);
const LEGACY_BLOCS = { Coalition: "Right", Opposition: "Left", Arabs: "Arabs", Unknown: "Unknown" };
const HIST_PARTY_HE = {
  /* הכנסת ה־25 */
  likud:"הליכוד", yesh_atid:"יש עתיד", national_unity:"המחנה הממלכתי", shas:"ש״ס", labor:"העבודה",
  utj:"יהדות התורה", yisrael_beiteinu:"ישראל ביתנו", religious_zionism:"הציונות הדתית",
  hadash_taal:"חד״ש–תע״ל", meretz:"מרצ", raam:"רע״מ",
  /* הכנסת ה־24 — מזהי המפלגות שונים, ולכן הם נפרדים */
  yeshatid:"יש עתיד", saar:"תקווה חדשה", yamina:"ימינה", reshima:"הרשימה המשותפת",
  ndi:"ישראל ביתנו", yahadut:"יהדות התורה", haavoda:"העבודה", kahollavan:"כחול לבן",
  zionut_datit:"הציונות הדתית", zelica:"הכלכלית"
};
const COUNTERFACTUAL = { likud:31, yesh_atid:23, national_unity:12, shas:11, labor:5, utj:7,
  yisrael_beiteinu:5, religious_zionism:13, hadash_taal:4, meretz:4, raam:5 };
/* כלל התצוגה: כל סקרי שנת הבחירות, אך לכל היותר MAX_PER_OUTLET האחרונים לכל
   כלי תקשורת. אותו כלל בדיוק ב-scripts/update-polls.mjs, כדי שסקר חדש ידחק את
   החמישי של אותו ערוץ גם אם רק הארכיון התעדכן. */
const ELECTION_YEAR = 2026;
const MAX_PER_OUTLET = 4;
/* לא מציגים סקרים מלפני התאריך הזה — לפניו מערכת הבחירות עוד לא הייתה
   באותו מבנה רשימות, וסקר ישן יחיד של ערוץ עיוות את ההשוואה. */
const POLLS_FROM = Date.parse("2026-08-01");
const ELECTION_TIMELINE = {
  pollsOpen: "2026-10-27T07:00:00+02:00",
  exitPolls: "2026-10-27T22:00:00+02:00"
};

const S = { hist:null, cur:null, firms:null, regions:null, demo:null,
            stats:[], counterStats:[], series:[], mode:"scenario", scen:"actual",
            homeView:"bars", homeHistory:"current", focusParty:"", compareIds:null, trendParty:"", pollView:"cards", avgDays:7, avgWeight:"simple", cardPoll:{}, view:"home", selectedLoc:0, demoOverrides:{}, live:null, liveTimer:null, countdownTimer:null,
            calibrations:[], elections:[], calibYear:2022, leaders:{}, anecTimer:null };

/* ---------- SVG building blocks ---------- */
function hemicycleLayout(total, rows = 4) {
  const radii = []; for (let i = 0; i < rows; i++) radii.push(0.60 + 0.40 * i / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map(r => Math.max(1, Math.round(total * r / sum)));
  let diff = total - counts.reduce((a, b) => a + b, 0), i = rows - 1;
  while (diff !== 0) { counts[i] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1; i = (i - 1 + rows) % rows; }
  const pts = [];
  radii.forEach((r, ri) => {
    const n = counts[ri], pad = 0.055;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? .5 : pad + (1 - 2 * pad) * k / (n - 1);
      pts.push({ r, ang: Math.PI * t, ri });
    }
  });
  return pts.sort((a, b) => a.ang - b.ang || a.r - b.r);
}

function hemicycleSVG(items, opts = {}) {
  // items: [{color, count, label}] filled right→left
  const total = items.reduce((s, it) => s + it.count, 0) || 120;
  const pts = hemicycleLayout(total, opts.rows || 4);
  const W = 640, H = 350, cx = W / 2, cy = H - 28, R = 250;
  const seq = [];
  items.forEach(it => { for (let k = 0; k < it.count; k++) seq.push(it); });
  const dots = pts.map((p, idx) => {
    const it = seq[idx] || { color: "#ccc", label: "" };
    const x = cx + Math.cos(p.ang) * R * p.r, y = cy - Math.sin(p.ang) * R * p.r;
    return `<circle class="hemi-seat" data-k="${esc(it.key || "")}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.1" fill="${it.color}"><title>${esc(it.label)}</title></circle>`;
  }).join("");
  const mid = opts.center || "";
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || "התפלגות המנדטים")}">
    ${dots}
    <g class="hemi-center">${mid}</g>
  </svg>`;
}

function gaugeSVG(value, max = 120, opts = {}) {
  const W = 520, H = 300, cx = W / 2, cy = 258, R = 198;
  const ang = v => Math.PI * (1 - clamp(v, 0, max) / max);
  const pt = (a, r) => [cx + Math.cos(a) * r, cy - Math.sin(a) * r];
  const arc = (from, to, r, w, col) => {
    const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="butt"/>`;
  };
  const a61 = ang(61), av = ang(value);
  const ticks = [0, 20, 40, 60, 80, 100, 120].map(v => {
    const a = ang(v), [x1, y1] = pt(a, R + 3), [x2, y2] = pt(a, R - 7);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#fff" stroke-width="1.8" opacity=".75"/>`;
  }).join("");
  const [e0x, e0y] = pt(Math.PI, R + 22), [e1x, e1y] = pt(0, R + 22);
  const [t1x, t1y] = pt(a61, R + 17), [t2x, t2y] = pt(a61, R - 20);
  const [b61x, b61y] = pt(a61, R + 30);
  const [nx, ny] = pt(av, 112);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="מד הגושים: ${Math.round(value)} מנדטים לימין ולחרדים">
    ${arc(Math.PI, a61, R, 16, "#C0392B")}
    ${arc(a61, 0, R, 16, "#17457F")}
    ${ticks}
    <text x="${e0x.toFixed(1)}" y="${(e0y + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="#6C7885" font-weight="700">0</text>
    <text x="${e1x.toFixed(1)}" y="${(e1y + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="#6C7885" font-weight="700">120</text>
    <path d="M${t1x.toFixed(1)} ${t1y.toFixed(1)}L${t2x.toFixed(1)} ${t2y.toFixed(1)}" stroke="#141A21" stroke-width="3"/>
    <g transform="translate(${b61x.toFixed(1)} ${(b61y - 12).toFixed(1)})">
      <rect x="-27" y="-13" width="54" height="21" rx="6" fill="#141A21"/>
      <text x="0" y="2" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff" direction="ltr">61 · רוב</text>
    </g>
    <text x="${cx}" y="${(cy - 138).toFixed(1)}" text-anchor="middle" font-size="62" font-weight="900" fill="#12345C" font-family="IBM Plex Sans Hebrew, Assistant, sans-serif" letter-spacing="-0.02em">${Math.round(value)}</text>
    <text x="${cx}" y="${(cy - 114).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#6C7885">${esc(opts.caption || "מנדטים לגוש הימני–חרדי")}</text>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#141A21" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="13" fill="#141A21"/><circle cx="${cx}" cy="${cy}" r="5" fill="#F6F4EF"/>
  </svg>`;
}

function blocBarHTML(parts, total = 120) {
  const seg = parts.filter(p => p.count > 0).map(p =>
    `<span style="flex:0 0 ${(100 * p.count / total).toFixed(2)}%;background:${p.color}" title="${esc(p.label)}">${p.count >= 6 ? p.count : ""}</span>`).join("");
  return seg + `<span class="mark61" style="inset-inline-start:${(100 * 61 / total).toFixed(2)}%"></span>`;
}

function largestRemainder(values, target = 120) {
  const pos = Object.entries(values).filter(([, v]) => v > 0.001);
  const out = Object.fromEntries(pos.map(([k, v]) => [k, Math.floor(v)]));
  let left = target - Object.values(out).reduce((s, v) => s + v, 0);
  pos.sort((a, b) => (b[1] % 1) - (a[1] % 1));
  for (let i = 0; i < left; i++) out[pos[i % pos.length][0]] += 1;
  return out;
}

function baderOfer(votes, pairs, seats = 120) {
  const groups = {}, member = {}, used = new Set();
  pairs.forEach(([a, b], i) => {
    if (votes[a] == null || votes[b] == null) return;
    groups["g" + i] = votes[a] + votes[b]; member["g" + i] = [a, b]; used.add(a); used.add(b);
  });
  Object.keys(votes).forEach(k => { if (!used.has(k)) { groups[k] = votes[k]; member[k] = [k]; } });
  const dhondt = (v, n) => {
    const res = Object.fromEntries(Object.keys(v).map(k => [k, 0]));
    for (let s = 0; s < n; s++) {
      let best = null, bq = -1;
      for (const k in v) { const q = v[k] / (res[k] + 1); if (q > bq) { bq = q; best = k; } }
      res[best] += 1;
    }
    return res;
  };
  const G = dhondt(groups, seats), final = {};
  Object.entries(G).forEach(([g, s]) => {
    const ms = member[g];
    if (ms.length === 1) final[ms[0]] = s;
    else Object.assign(final, dhondt({ [ms[0]]: votes[ms[0]], [ms[1]]: votes[ms[1]] }, s));
  });
  return final;
}

/* ============================================================
   1. כיול היסטורי — ציון אמינות לכל מכון
   ============================================================ */
/* חלוקת הגושים אינה קבועה בקוד: כל מערכת בחירות מגדירה אותה בקובץ הנתונים
   שלה, תחת "blocs". כך אפשר לכייל על כנסות שונות בלי לגעת בנוסחה. */
const BLOCS_2022 = {
  netanyahu: ["likud", "shas", "utj", "religious_zionism"],
  outgoing:  ["yesh_atid", "national_unity", "labor", "yisrael_beiteinu", "meretz", "raam"],
  outside:   ["hadash_taal"]
};
const BLOC_LABELS = { netanyahu: "גוש נתניהו", outgoing: "הגוש היריב", outside: "מחוץ לגושים" };

function histBlocs(p, defs = BLOCS_2022) {
  return Object.fromEntries(Object.entries(defs).map(([k, ids]) =>
    [k, ids.reduce((s, id) => s + (p[id] || 0), 0)]));
}

function scoreFirms(data, actual = data.actual) {
  const defs = data.blocs || BLOCS_2022;
  const keys = Object.keys(actual), aB = histBlocs(actual, defs);
  /* סקר בלי שם מכון במקור אינו נכנס לציון — אי אפשר לזקוף אותו לאיש. */
  const scored = data.polls.filter(p => p.firm);
  const grouped = scored.reduce((m, p) => { (m[p.firm] ||= []).push(p); return m; }, {});
  return Object.entries(grouped).map(([firm, polls]) => {
    const blocs = polls.map(p => histBlocs(p.p, defs));
    const bm = { netanyahu: avg(blocs.map(b => b.netanyahu)), outgoing: avg(blocs.map(b => b.outgoing)), outside: avg(blocs.map(b => b.outside)) };
    const blocAbs = Object.keys(aB).reduce((s, k) => s + Math.abs(bm[k] - aB[k]), 0);
    const partyMae = avg(polls.flatMap(p => keys.map(k => Math.abs(p.p[k] - actual[k]))));
    /* עקביות: 65% יציבות גוש נתניהו לאורך החודש, 35% יציבות המפלגות (ממוצע
       סטיות התקן של כל רשימה בסקרי המכון). סטיית תקן של מפלגה בודדת קטנה
       בערך פי שניים מזו של הגוש, ולכן המקדם כפול — כך שני המדדים באותו סולם. */
    const consSd = sd(blocs.map(b => b.netanyahu));
    const partySd = avg(keys.map(k => sd(polls.map(p => p.p[k] || 0))));
    const blocScore = clamp(100 - 10 * (blocAbs / 3));
    const partyScore = clamp(100 - 15 * partyMae);
    const stability = clamp(100 - 25 * consSd);
    const partyStability = clamp(100 - 50 * partySd);
    const consistencyScore = .65 * stability + .35 * partyStability;
    const score = .6 * blocScore + .3 * partyScore + .1 * consistencyScore;
    return { firm, polls, n: polls.length, blocMean: bm, blocAbs, partyMae, blocScore, partyScore, consistencyScore, stability, partyStability, score };
  }).sort((a, b) => b.score - a.score);
}

/* מיזוג הכיולים של כמה מערכות בחירות לציון אחד למכון.
   כל מערכת נספרת במשקל שווה — מכון עם 12 סקרים בכנסת 25 ו-4 בכנסת 24 מקבל
   את ממוצע שני הציונים, ולא ממוצע משוקלל לפי כמות. זה נגזר מאותו כלל שלפיו
   אין באתר רכיב שמתגמל כמות פרסומים. מכון שהופיע רק במערכת אחת מקבל את
   הציון שלה, ומסומן ככזה. */
function combineCalibrations(elections) {
  const byFirm = new Map();
  elections.forEach(({ year, election, stats }) => stats.forEach(st => {
    if (!byFirm.has(st.firm)) byFirm.set(st.firm, []);
    byFirm.get(st.firm).push({ year, election, ...st });
  }));
  return [...byFirm.entries()].map(([firm, runs]) => {
    const mean = k => avg(runs.map(r => r[k]));
    const latest = runs.slice().sort((a, b) => b.year - a.year)[0];
    return {
      ...latest,
      firm,
      elections: runs.slice().sort((a, b) => b.year - a.year),
      n: runs.reduce((t, r) => t + r.n, 0),
      blocScore: mean("blocScore"), partyScore: mean("partyScore"),
      consistencyScore: mean("consistencyScore"), stability: mean("stability"),
      partyStability: mean("partyStability"), blocAbs: mean("blocAbs"), partyMae: mean("partyMae"),
      score: mean("score")
    };
  }).sort((a, b) => b.score - a.score);
}

/* ============================================================
   2. חלון 8 יום + סדרות
   ============================================================ */
/* איחוד רשימות: זהות התאחדה עם הציונות הדתית באמצע ספטמבר 2026. סקרים
   שמדדו "זהות" בנפרד (או תחת המזהה zionut_datit_zehut) מנורמלים לרשימה
   המאוחדת, כדי שסקרי טרום-האיחוד לא ייחשבו כאילו הרשימה קיבלה 0. */
const normId = id => (id === "zionut_datit_zehut" || id === "zehut") ? "zionut_datit" : id;

/* רשימות שאינן מוצגות כלל בתמונת המצב הראשית (למשל רשימה שאינה רצה כמקשה אחת). */
const HIDE_FROM_HOME = new Set(["hadash_taal"]);
/* אחוז החסימה — 3.25% מהקולות הכשרים ≈ 3.9 מנדטים. רשימה מתחתיו אינה נכנסת
   לחלוקת המושבים; קולותיה אינם משוקללים לתחזית. */
const THRESHOLD_MANDATES = 120 * 0.0325;
/* רשימה שמתחת לאחוז החסימה תוצג עם 0 מנדטים ואחוז התמיכה שלה, אם היא נמדדת
   מעל הסף הזה. מתחתיו — היא נשמטת מהתצוגה. */
const SHOW_BELOW_MIN = 1;

/* "היום 09:00" / "אתמול 21:00" / "04.09.2026" — לפי מה שיש ב-generatedAt.
   הקובץ מתעדכן בכל הרצה של סקריפט הסקרים, ואיתו התחזית. */
const humanUpdate = iso => {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso || "");
  const hasTime = /T\d\d:/.test(String(iso));
  if (!hasTime) return heDate(iso);
  const now = new Date(), yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const day = x => x.toDateString();
  const t = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  if (day(d) === day(now)) return `היום ${t}`;
  if (day(d) === day(yest)) return `אתמול ${t}`;
  return `${heDate(iso)} ${t}`;
};

/* שיוך גוש שנקבע ידנית באתר, מעל למה שמופיע בנתוני הסקר הגולמיים */
/* שיוך גוש שנקבע ידנית באתר, מעל למה שמופיע בנתוני הסקר הגולמיים.
   רע״ם נספרת בגוש השמאל; המפלגות החרדיות נספרות בגוש הימין. הפילוח הפנימי
   של גוש הימין נשאר רק במודל הדמוגרפי, שם הוא נגזר מ-HAREDI_PARTIES. */
const ALIGN_OVERRIDE = { ofer_vinter_party: "Right", noam: "Right", raam: "Left", bait_zioni: "Left" };
function alignOf(party = {}) {
  const id = normId(party.id || "");
  if (HAREDI_PARTIES.has(id)) return "Right";
  if (ALIGN_OVERRIDE[id]) return ALIGN_OVERRIDE[id];
  return LEGACY_BLOCS[party.alignment] || party.alignment || "Unknown";
}

function parsePollDate(p) {
  if (p.dateTimestamp) return p.dateTimestamp;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(p.date || "");
  return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}`) : 0;
}

const outletKey = p => p.channelHebrewName || p.sourceId || p.id;

function selectDisplayPolls(polls, year = ELECTION_YEAR, maxPerOutlet = MAX_PER_OUTLET) {
  const seen = new Map();
  return polls
    .filter(p => parsePollDate(p) >= POLLS_FROM && new Date(parsePollDate(p)).getFullYear() === year)
    .sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0))
    .filter(p => {
      const n = (seen.get(outletKey(p)) || 0) + 1;
      seen.set(outletKey(p), n);
      return n <= maxPerOutlet;
    });
}

function inWindow(polls, generatedAt) {
  const kept = selectDisplayPolls(polls);
  const use = kept.length ? kept : polls;
  return { polls: use, from: Math.min(...use.map(parsePollDate)), to: Math.max(...use.map(parsePollDate)) };
}

const FIRM_FALLBACK_COLOR = "#64707C";
const firmColor = sourceId => firmOf(sourceId).meta.color || FIRM_FALLBACK_COLOR;

function firmOf(sourceId) {
  const m = S.firms.sourceMap[sourceId];
  if (!m) return { firm: sourceId, outlet: sourceId, meta: { he: sourceId, short: "?", calibrated: false, color: FIRM_FALLBACK_COLOR } };
  return { ...m, meta: S.firms.firms.find(f => f.id === m.firm) || { he: m.firm, short: "?", calibrated: false } };
}

/* התחזית (וגם "משוקלל אמינות") משתמשת רק בסקרים מ-8 הימים האחרונים —
   מגמות זזות מהר, וגם חלון של שבועיים כבר גורר סקרים מלפני איחודי רשימות
   (זהות/הציונות הדתית) שמעוותים את הממוצע. עמוד "סקרים והשוואה" ממשיך
   להציג את כל החלון (S.cur.polls). אם 8 הימים האחרונים דלים מדי (פחות מ-3
   מכונים), נשמר כל החלון — עדיף על תחזית שנשענת על סקר בודד. */
const FORECAST_MAX_AGE_DAYS = 8;
function recentForForecast(polls) {
  const cutoff = Date.now() - FORECAST_MAX_AGE_DAYS * 864e5;
  const recent = polls.filter(p => parsePollDate(p) >= cutoff);
  return new Set(recent.map(p => firmOf(p.sourceId).firm)).size >= 3 ? recent : polls;
}

function buildSeries(polls) {
  const g = new Map();
  polls.forEach(p => {
    const f = firmOf(p.sourceId);
    if (!g.has(f.firm)) g.set(f.firm, { key: f.firm, meta: f.meta, polls: [] });
    g.get(f.firm).polls.push(p);
  });
  return [...g.values()].map(grp => {
    const ids = [...new Set(grp.polls.flatMap(p => p.parties.map(x => normId(x.id))))];
    const parties = Object.fromEntries(ids.map(id => [id, avg(grp.polls.map(p =>
      p.parties.filter(x => normId(x.id) === id).reduce((s, x) => s + x.mandates, 0)))]));
    const blocs = Object.fromEntries(Object.keys(BLOCS).map(al => [al, avg(grp.polls.map(p =>
      p.parties.filter(x => alignOf(x) === al).reduce((s, x) => s + x.mandates, 0)))]));
    return { ...grp, parties, blocs };
  });
}

const calibrationId = meta => meta?.calibrationFirm || meta?.id;
const firmScore = meta => meta?.calibrated ? (S.stats.find(s => s.firm === calibrationId(meta))?.score ?? 70) : 70;

/* ============================================================
   3. מודל התחזית
   ============================================================ */
const FLOORS = { shas: 10.4, yahadut_hatora: 7.8 };

function structuralFix(raw) {
  const p = { ...raw };
  const shasBefore = p.shas || 0, utjBefore = p.yahadut_hatora || 0;
  p.shas = Math.max(shasBefore, FLOORS.shas);
  p.yahadut_hatora = Math.max(utjBefore, FLOORS.yahadut_hatora);
  const added = (p.shas - shasBefore) + (p.yahadut_hatora - utjBefore);
  const donors = ["likud", "ozma_yehudit", "zionut_datit", "ofer_vinter_party", "noam"].filter(id => (p[id] || 0) > 0);
  const tot = donors.reduce((s, id) => s + p[id], 0);
  if (tot > 0) donors.forEach(id => { p[id] = Math.max(0, p[id] - added * p[id] / tot); });
  return { parties: p, shasBefore, utjBefore, added, donors };
}

function forecast(mode, exclude) {
  const skip = exclude || new Set();
  const allIds = [...new Set(S.series.flatMap(s => Object.keys(s.parties)))];
  const w = s => mode !== "simple" ? firmScore(s.meta) / 100 : 1;
  const W = S.series.reduce((sum, s) => sum + w(s), 0);
  const rawFull = Object.fromEntries(allIds.map(id => [id, S.series.reduce((sum, s) => sum + (s.parties[id] || 0) * w(s), 0) / W]));
  const visible = allIds.filter(id => !skip.has(id));
  /* אחוז החסימה: רשימה מתחת ל-3.25% אינה משוקללת לחלוקת המושבים. */
  const below = visible.filter(id => rawFull[id] > 0 && rawFull[id] < THRESHOLD_MANDATES);
  const eligible = visible.filter(id => rawFull[id] >= THRESHOLD_MANDATES);
  const raw = Object.fromEntries(eligible.map(id => [id, rawFull[id]]));
  const belowShare = Object.fromEntries(below
    .filter(id => rawFull[id] >= SHOW_BELOW_MIN)
    .sort((a, b) => rawFull[b] - rawFull[a])
    .map(id => [id, rawFull[id] / 120 * 100]));
  const fix = { parties: { ...raw }, added: 0 };
  const blocs = Object.fromEntries(Object.keys(BLOCS).map(al => [al, S.series.reduce((sum, s) => sum + s.blocs[al] * w(s), 0) / W]));
  [...skip, ...below].forEach(id => {
    const al = partyMeta(id).alignment;
    if (blocs[al] != null) blocs[al] = Math.max(0, blocs[al] - (rawFull[id] || 0));
  });
  if (mode === 'scenario') {
    const scenario = scenarioForecast(raw, S.scenarioOptions);
    return { raw, rawFull, parties: scenario.parties, blocs, fix, scenario, below: belowShare };
  }
  return { raw, rawFull, parties: fix.parties, blocs, fix, below: belowShare };
}

function partyMeta(id) {
  const rows = S.cur.polls.flatMap(p => p.parties.filter(x => normId(x.id) === id));
  const last = rows.at(-1) || { name: id, logoUrl: "" };
  if (ALIGN_OVERRIDE[id]) return { name: last.name, logo: last.logoUrl, alignment: ALIGN_OVERRIDE[id] };
  const al = [...new Set(rows.filter(x => x.mandates > 0).map(x => alignOf(x)))];
  return { name: last.name, logo: last.logoUrl, alignment: al.length === 1 ? al[0] : "Unknown" };
}

function countdownParts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds };
}

function renderElectionTimer() {
  const box = $("#election-countdown");
  if (!box) return;
  const now = Date.now();
  const open = Date.parse(ELECTION_TIMELINE.pollsOpen);
  const exit = Date.parse(ELECTION_TIMELINE.exitPolls);
  let target = open, title = "עד פתיחת הקלפיות", sub = "בחירות 2026", live = false;
  if (now >= open && now < exit) {
    target = exit; title = "עד סגירת הקלפיות ופרסום המדגמים"; sub = "הקלפיות פתוחות"; live = true;
  } else if (now >= exit) {
    title = "הקלפיות נסגרו"; sub = "עוברים למדגמים ולתוצאות האמת"; live = true;
  }
  const t = countdownParts(Math.max(0, target - now));
  const pad = n => String(n).padStart(2, "0");
  const narrow = (typeof window !== "undefined" ? window.innerWidth : 1200) < 560;
  const full = now >= exit
    ? [["00", "ימים"], ["00", "שעות"], ["00", "דקות"], ["00", "שניות"]]
    : [[t.days, "ימים"], [pad(t.hours), "שעות"], [pad(t.minutes), "דקות"], [pad(t.seconds), "שניות"]];
  const cells = narrow ? full.slice(0, 2) : full;
  box.classList.toggle("is-live", live);
  box.innerHTML = `<div class="cd-head">
      <p class="kicker">${live ? '<span class="cd-dot"></span>' : ""}שעון בחירות</p>
      <h3>${esc(title)}</h3><span>${esc(sub)}</span></div>
    <div class="countdown-cells">${cells.map(([n, l], idx) =>
      `${idx ? '<i class="cd-sep">:</i>' : ""}<b><span class="num">${n}</span><em>${esc(l)}</em></b>`).join("")}</div>`;
}

/* ============================================================
   4. עמוד הבית — קיר המנדטים
   ============================================================ */
/* שם המנהיג/ה שמוצג מתחת לשם הרשימה בכרטיס. */
const PARTY_LEADER = {
  likud: "בנימין נתניהו", shas: "אריה דרעי", yahadut_hatora: "יעקב אשר",
  ozma_yehudit: "איתמר בן גביר", zionut_datit: "בצלאל סמוטריץ׳", ofer_vinter_party: "עופר וינטר",
  yashar: "גדי איזנקוט", beyahad: "נפתלי בנט · יאיר לפיד", hademokratim: "יאיר גולן",
  ndi: "אביגדור ליברמן", raam: "מנסור עבאס", reshima_meshutefet: "איימן עודה", hadash_taal: "איימן עודה",
  hendel_zeliha_party: "יועז הנדל · ירון זליכה", kahollavan: "בני גנץ", noam: "אבי מעוז"
};

/* כותרת עמוד הבית נגזרת מהמספרים לפי כלל קבוע — לא נכתבת ידנית בכל עדכון. */
function homeHeadline(est, seats, blocTot) {
  const R = blocTot.Right || 0, L = blocTot.Left || 0;
  const lead = R >= L ? "גוש הימין" : "מרכז־שמאל";
  const other = R >= L ? "מרכז־שמאל" : "גוש הימין";
  const hi = Math.max(R, L), lo = Math.min(R, L), gap = 61 - hi, margin = Math.abs(R - L);
  const edge = Object.entries(est.below || {}).filter(([, p]) => p >= 3.0 && p < 3.25).map(([id]) => partyMeta(id).name);
  const top = Object.entries(seats).sort((a, b) => b[1] - a[1])[0];
  if (edge.length) return {
    h: `${edge.join(" ו")} <em>על הסף</em>, ואיתה כל התמונה`,
    s: "כמה אלפי קולות מעלה או מטה, וחלוקת כל 120 המנדטים משתנה."
  };
  if (hi >= 61) return { h: `${lead} <em>עם רוב של ${hi}</em>`, s: "רוב בכנסת ה־26 בכוחות הגוש עצמו." };
  if (margin <= 3) return {
    h: `המרוץ צמוד: <em>${lead} ${hi} מול ${other} ${lo}</em>`,
    s: "אף גוש לא מגיע ל־61 בכוחות עצמו."
  };
  if (top && top[1] >= 25) return {
    h: `<em>${esc(partyMeta(top[0]).name)}</em> — המפלגה הגדולה, ${top[1]} מנדטים`,
    s: `${lead} מוביל, ${gap === 1 ? "מנדט אחד" : gap + " מנדטים"} מרוב של 61.`
  };
  return {
    h: `${lead} מוביל, <em>${gap === 1 ? "מנדט אחד מ־61" : gap + " מנדטים מ־61"}</em>`,
    s: top ? `${esc(partyMeta(top[0]).name)} הגדולה, ${top[1]} מנדטים.` : ""
  };
}

/* שינוי מול העדכון הקודם ששמור ב-forecast-history.json. */
function homeDelta(id) {
  if (S.homeHistory !== "current") return null;
  const hist = S.forecastHistory;
  if (!hist || !Array.isArray(hist.snapshots) || hist.snapshots.length < 2) return null;
  const snaps = hist.snapshots.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const key = S.mode === "weighted" ? "weighted" : "scenario";
  const now = (snaps[0][key] || snaps[0].parties || {})[id];
  const prev = (snaps[1][key] || snaps[1].parties || {})[id];
  if (now == null || prev == null) return null;
  const d = Math.round(now) - Math.round(prev);
  if (!d) return null;
  return { cls: d > 0 ? "up" : "down", txt: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}`, prev: Math.round(prev) };
}

function homeCard(id, seats, est) {
  const m = partyMeta(id);
  const color = BLOCS[m.alignment] ? BLOCS[m.alignment].color : "#64707C";
  const photo = (S.leaders && S.leaders[normId(id)]) || LEADER_PLACEHOLDER;
  const leader = PARTY_LEADER[normId(id)] || "";
  const belowPct = est.below && est.below[id];
  const isBelow = seats[id] == null && belowPct != null;
  const d = isBelow ? null : homeDelta(id);
  const aria = isBelow
    ? `${m.name}, מתחת לאחוז החסימה, כ־${r1(belowPct)}%`
    : `${m.name}, ${seats[id] || 0} מנדטים${d ? `, ${d.cls === "up" ? "עלייה" : "ירידה"} של ${Math.abs(seats[id] - d.prev)} מהעדכון הקודם` : ""}`;
  return `<button type="button" class="hcard${isBelow ? " is-below" : ""}" style="--bc:${color}" data-focus-party="${esc(id)}" aria-label="${esc(aria)}. מעבר לסקרים">
    <span class="hcard-photo"><img src="${esc(photo)}" alt="" width="720" height="900" onerror="this.onerror=null;this.src='${LEADER_PLACEHOLDER}'"></span>
    <span class="hcard-body">
      <span class="hcard-seatline"><span class="hcard-seat num">${isBelow ? 0 : (seats[id] || 0)}</span>${d ? `<span class="hcard-delta ${d.cls}" title="בעדכון הקודם: ${d.prev}">${d.txt}</span>` : ""}${isBelow ? `<span class="hcard-pct num" title="מתחת לאחוז החסימה">${r1(belowPct)}%</span>` : ""}</span>
      <span class="hcard-name">${esc(m.name)}</span>
      ${leader ? `<span class="hcard-leader">${esc(leader)}</span>` : ""}
    </span>
  </button>`;
}

function buildHomePrintSheet(est, seats, blocTot) {
  const box = $("#home-printsheet");
  if (!box) return;
  const bl = { Right: "ימין", Left: "מרכז־שמאל", Arabs: "ערבים", Unknown: "אחר" };
  const rows = Object.keys(seats).map(id => ({ id, seats: seats[id] }))
    .concat(Object.entries(est.below || {}).map(([id, pct]) => ({ id, below: pct })))
    .filter(r => (r.seats || 0) > 0 || r.below != null)
    .sort((a, b) => (b.seats || 0) - (a.seats || 0) || (b.below || 0) - (a.below || 0));
  const LA = (blocTot.Left || 0) + (blocTot.Arabs || 0) + (blocTot.Unknown || 0);
  const shownAt = S.homeHistory === "current" ? S.cur.generatedAt : S.homeHistory;
  box.innerHTML = `<h2>לוח המנדטים · ${S.mode === "weighted" ? "משוקלל אמינות" : "תחזית הברומטר"} · ${heDate(shownAt)}</h2>
    <table><thead><tr><th>מפלגה</th><th>מנהיג/ה</th><th>גוש</th><th class="n">מנדטים</th></tr></thead><tbody>${
      rows.map(r => `<tr><th scope="row">${esc(partyMeta(r.id).name)}</th><td>${esc(PARTY_LEADER[normId(r.id)] || "—")}</td><td>${esc(bl[partyMeta(r.id).alignment] || "—")}</td><td class="n">${r.below != null ? `0 (כ־${r1(r.below)}%)` : r.seats}</td></tr>`).join("")
    }</tbody></table>
    <p class="pfoot">סיכום גושים: גוש הימין ${blocTot.Right || 0} · מרכז־שמאל והרשימות הערביות ${LA} · דרוש 61 לרוב. החלוקה לפי שיוך הרשימות ואינה תחזית להרכב קואליציה.</p>`;
}

function renderHome() {
  renderElectionTimer();
  const history = (S.forecastHistory?.snapshots || []).slice().sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const dayKey = value => new Date(value).toLocaleDateString('en-CA', {timeZone:'Asia/Jerusalem'});
  const currentDay = dayKey(S.cur.generatedAt);
  const byDay = new Map();
  history.forEach(s => {
    const key = dayKey(s.updatedAt), age = Math.round((Date.parse(currentDay) - Date.parse(key)) / 864e5);
    if (age >= 1 && age <= 10 && !byDay.has(key)) byDay.set(key, s);
  });
  const historySelect = $('#home-history'), choices = [...byDay.values()];
  historySelect.innerHTML = `<option value="current">העדכון הנוכחי</option>` + choices.map(s => {
    const daysAgo = Math.round((Date.parse(currentDay) - Date.parse(dayKey(s.updatedAt))) / 864e5);
    const label = daysAgo === 1 ? 'אתמול' : daysAgo === 2 ? 'שלשום' : new Date(s.updatedAt).toLocaleDateString('he-IL',{timeZone:'Asia/Jerusalem',day:'numeric',month:'numeric'});
    return `<option value="${esc(s.updatedAt)}">${label} · ${new Date(s.updatedAt).toLocaleTimeString('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'})}</option>`;
  }).join('');
  if (S.homeHistory !== 'current' && !history.some(s => s.updatedAt === S.homeHistory)) S.homeHistory = 'current';
  historySelect.value = S.homeHistory;
  const snapshot = S.homeHistory === 'current' ? null : history.find(s => s.updatedAt === S.homeHistory);
  const snapshotSeats = snapshot?.[S.mode === 'weighted' ? 'weighted' : 'scenario'];
  const est = snapshotSeats ? { parties:{...snapshotSeats}, rawFull:{...snapshotSeats}, below:{} } : forecast(S.mode, HIDE_FROM_HOME);
  const seats = snapshotSeats ? {...snapshotSeats} : largestRemainder(est.parties);
  const belowEntries = Object.entries(est.below || {});
  $('#home-eyebrow').textContent = snapshot
    ? `תחזית ארכיון · ${heDate(snapshot.updatedAt)} · ${snapshot.polls || '—'} סקרים`
    : 'תחזית הברומטר · הכנסת ה־26 · הצבעה ב־27 באוקטובר';

  const blocTot = {};
  Object.entries(seats).forEach(([id, n]) => {
    const al = partyMeta(id).alignment;
    blocTot[al] = (blocTot[al] || 0) + n;
  });
  const R = blocTot.Right || 0;
  const LA = (blocTot.Left || 0) + (blocTot.Arabs || 0) + (blocTot.Unknown || 0);

  const hd = homeHeadline(est, seats, blocTot);
  $("#verdict-head").innerHTML = hd.h;
  $("#verdict-lede").textContent = hd.s;

  const leadKey = R >= (blocTot.Left || 0) ? "Right" : "Left";
  const rd = [["Right", "גוש הימין"], ["Left", "מרכז־שמאל"], ["Arabs", "הרשימות הערביות"]];
  $("#home-readout").innerHTML = rd.map(([k, label]) =>
    `<div class="rd${k === leadKey ? " lead" : ""}" style="--dot:${BLOCS[k].color}"><span class="rd-lbl"><i></i>${esc(label)}</span><b class="num">${blocTot[k] || 0}</b></div>`
  ).join("") + `<div class="rd-need"><b class="num">61</b><span>דרוש לרוב</span></div>`;

  $('[data-tally="Right"]').textContent = R;
  $('[data-tally="LeftArabs"]').textContent = LA;

  /* כל מפלגה בשורת הגוש שלה, מהמנדטים הרבים למעטים; רשימות מתחת לסף בסוף. */
  const preRound = id => est.parties[id] != null ? est.parties[id] : (est.rawFull ? est.rawFull[id] || 0 : 0);
  const entries = Object.entries(seats).filter(([, n]) => n > 0).map(([id, n]) => ({ id, key: n * 100 + preRound(id) }))
    .concat(belowEntries.map(([id, pct]) => ({ id, key: -1000 + pct })));
  const rowOf = id => partyMeta(id).alignment === "Right" ? "right" : "left";
  const byRow = { right: [], left: [] };
  entries.sort((a, b) => b.key - a.key).forEach(e => byRow[rowOf(e.id)].push(e.id));
  $("#cards-right").innerHTML = byRow.right.map(id => homeCard(id, seats, est)).join("");
  $("#cards-left").innerHTML = byRow.left.map(id => homeCard(id, seats, est)).join("");

  buildHomePrintSheet(est, seats, blocTot);
}

const initials = n => String(n || "").replace(/^ה/, "").replace(/["'׳״!.]/g, "").trim().slice(0, 2);

function logoBox(meta, size = 34) {
  if (meta?.logo) return `<span class="orglogo" style="width:${size}px;height:${size}px" title="${esc(meta.he || "")}"><img src="${esc(meta.logo)}" alt="" onerror="var p=this.parentNode;this.remove();p.textContent='${esc(meta.short || "")}'"></span>`;
  return `<span class="orglogo" style="width:${size}px;height:${size}px" title="${esc(meta?.he || "")}">${esc(meta?.short || "—")}</span>`;
}
function outletLogo(name) {
  const l = S.firms.outletLogos[name];
  return l ? `<span class="orglogo" title="${esc(name)}"><img src="${esc(l)}" alt="" onerror="var p=this.parentNode;this.remove();p.textContent='${esc((name||"").slice(0,3))}'"></span>`
           : `<span class="orglogo" title="${esc(name)}">${esc((name || "").slice(0, 3))}</span>`;
}

function outletIconStrip(outlets = []) {
  return `<div class="outlet-icons" aria-label="ערוצי פרסום">${outlets.map(name => {
    const l = S.firms.outletLogos[name];
    return `<span title="${esc(name)}">${l
      ? `<img src="${esc(l)}" alt="${esc(name)}" loading="lazy" onerror="this.parentNode.textContent='${esc((name || '').slice(0, 3))}'">`
      : esc((name || "").slice(0, 3))}</span>`;
  }).join("")}</div>`;
}

/* איור מקום שמור לתמונת מנהיג — קווי עיפרון מינימליים, מוחלף בכל כרטיס שיש לו תמונה ב-data/leaders.json */
const LEADER_PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g fill="none" stroke="#94A0AD" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="48" cy="34" r="16.5"/><path d="M18.5 84c1.8-15.6 12.8-24.6 29.5-24.6S75.7 68.4 77.5 84"/><path d="M39 75c2.6 3.6 6 5.4 9 5.4s6.4-1.8 9-5.4" opacity=".5"/></g></svg>`);

function resultRowHTML({ meta, value, color, sub = "", tag = "", id = "", cls = "" }) {
  const photo = (S.leaders && S.leaders[normId(id)]) || "";
  const img = photo || LEADER_PLACEHOLDER;
  /* הכרטיס כולו הוא הכפתור — לחיצה עליו עוברת לנתוני המפלגה בסקרים. */
  return `<button type="button" class="rcard ${photo ? "has-photo" : "is-placeholder"}${cls ? " " + cls : ""}" style="--c:${color}" data-focus-party="${esc(id)}" aria-label="${esc(meta.name)}, ${r1(value)} מנדטים. מעבר לנתוני המפלגה בסקרים">
    <span class="rcard-face" style="--c:${color}"><img src="${esc(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${LEADER_PLACEHOLDER}';this.closest('.rcard').classList.replace('has-photo','is-placeholder')"><b>${esc(initials(meta.name))}</b></span>
    <b class="rcard-num num">${r1(value)}</b>
    <strong title="${esc(meta.name)}">${esc(meta.name)}</strong>
    ${sub ? `<small>${esc(sub)}</small>` : ""}
    ${tag ? `<span class="tagfix">${esc(tag)}</span>` : ""}
  </button>`;
}

/* ============================================================
   5. עמוד סקרי 2026
   ============================================================ */
/* מפלגה נכנסת לבורר "סינון לפי מפלגה" רק אם נמדדה מעל אחוז החסימה בלפחות
   ארבעה סקרים מהשבוע האחרון — כך רשימה שהופיעה בסקר בודד לא ממלאת את
   הבורר. שבוע דל בסקרים שבו אף מפלגה לא עומדת בתנאי → נופלים לכלל הרך
   (הופיעה עם מנדט כלשהו בחלון התצוגה). */
const RECENT_WINDOW_DAYS = 7, RECENT_MIN_POLLS = 4;
function topPartyIds(limit = 11) {
  const totals = {};
  S.cur.polls.forEach(p => p.parties.forEach(x => { const id = normId(x.id); totals[id] = (totals[id] || 0) + x.mandates; }));
  const ranked = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const newest = Math.max(0, ...S.cur.polls.map(parsePollDate));
  const recent = S.cur.polls.filter(p => newest - parsePollDate(p) <= RECENT_WINDOW_DAYS * 864e5);
  const seatsOf = (p, id) => p.parties.filter(x => normId(x.id) === id).reduce((s, x) => s + x.mandates, 0);
  const passingPolls = id => recent.reduce((n, p) => n + (seatsOf(p, id) >= THRESHOLD_MANDATES ? 1 : 0), 0);
  const solid = ranked.filter(id => passingPolls(id) >= RECENT_MIN_POLLS);
  return (solid.length ? solid : ranked).slice(0, limit);
}

function renderPolls() {
  const polls = [...S.cur.polls].sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0));
  const fSel = $("#poll-firm"), oSel = $("#poll-outlet");
  if (fSel.options.length === 1) {
    [...new Set(polls.map(p => firmOf(p.sourceId).firm))].forEach(f => {
      const m = S.firms.firms.find(x => x.id === f);
      fSel.insertAdjacentHTML("beforeend", `<option value="${esc(f)}">${esc(m ? m.he : f)}</option>`);
    });
    [...new Set(polls.map(p => p.channelHebrewName))].forEach(o =>
      oSel.insertAdjacentHTML("beforeend", `<option value="${esc(o)}">${esc(o)}</option>`));
  }
  const ff = fSel.value, oo = oSel.value;
  const rows = polls.filter(p => (ff === "all" || firmOf(p.sourceId).firm === ff) && (oo === "all" || p.channelHebrewName === oo));

  // stats
  const days = Math.max(1, Math.round((Math.max(...polls.map(parsePollDate)) - Math.min(...polls.map(parsePollDate))) / 864e5) + 1);
  $("#polls-stats").innerHTML = [
    [polls.length, "סקרים בחלון"],
    [new Set(polls.map(p => firmOf(p.sourceId).firm)).size, "מכונים שונים"],
    [new Set(polls.map(p => p.channelHebrewName)).size, "כלי תקשורת"],
    [days, "ימים מכוסים"]
  ].map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");

  renderPollCards(rows, polls);
  renderPartyProfile(rows);
  renderFirmCards();
}

const shortName = n => n.replace(/^ה/, "").replace(/!.*/, "").replace(/\s*עם.*/, "").trim().slice(0, 12);

function renderFirmCards() {
  const active = [...new Set(S.cur.polls.map(p => firmOf(p.sourceId).firm))];
  $("#firm-cards").innerHTML = S.firms.firms.filter(f => active.includes(f.id)).map(f => {
    const st = S.stats.find(s => s.firm === f.id);
    return `<article class="card pad firm-card" data-firm="${esc(f.id)}" role="button" tabindex="0" style="border-top:4px solid ${f.calibrated ? "#17457F" : "#5B4B8A"}">
      <div style="display:flex;align-items:center;gap:12px">
        ${logoBox(f, 46)}
        <div style="min-width:0"><h3 style="font-size:1.05rem">${esc(f.he)}</h3>
          <div style="color:var(--ink-3);font-size:.76rem">${esc(f.lead)}</div></div>
        <div style="margin-inline-start:auto;text-align:end">
          <b style="font-family:var(--serif);font-size:1.7rem;font-weight:900;color:${f.calibrated ? "var(--navy)" : "#5B4B8A"};line-height:1">${r1(firmScore(f))}</b>
          <div style="color:var(--ink-3);font-size:.66rem">${f.calibrated ? "ציון אמינות" : "משקל ניטרלי"}</div></div>
      </div>
      <p style="margin:12px 0 10px;color:var(--ink-2);font-size:.86rem">${esc(f.about)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span style="color:var(--ink-3);font-size:.74rem;font-weight:700">מפרסם ב־</span>
        ${f.outlets.map(o => `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border:1px solid var(--rule);border-radius:100px;font-size:.76rem;font-weight:600">${outletLogo(o)}${esc(o)}</span>`).join("")}
      </div></article>`;
  }).join("");
}

function renderCalibrationStrip() {
  const tracks = S.calibrations?.length ? S.calibrations : [
    { year: 2022, election: "הכנסת ה־25", status: "active", polls: S.hist?.polls?.length || 0, note: "הציון הנוכחי מחושב ממנו" },
    { year: 2021, election: "הכנסת ה־24", status: "pending", polls: 0, note: "ייכנס לציון אחרי טעינת ארכיון מלא" }
  ];
  $("#calibration-strip").innerHTML = tracks.map(t => {
    const active = t.status === "active";
    return `<article class="${active ? "active" : "pending"}">
      <span>${active ? "פעיל במדד" : "בהכנה"}</span>
      <b>${esc(t.election)}</b>
      <em>${esc(String(t.year))}</em>
      <p>${active ? `${fmt(t.polls)} סקרי כיול` : esc(t.note || "ממתין לנתונים מלאים")}</p>
    </article>`;
  }).join("");
}

/* ============================================================
   6. עמוד מדד אמינות המכונים
   ============================================================ */
const curElection = () => S.elections.find(e => e.year === S.calibYear) || S.elections[0];
/* התרחיש ההיפותטי (מרצ עוברת את החסימה) שייך לכנסת ה־25 בלבד. */
const counterfactualAvailable = () => S.calibYear === 2022;
const scenActual = () => (S.scen === "counterfactual" && counterfactualAvailable())
  ? COUNTERFACTUAL : curElection().data.actual;
const curBlocDefs = () => curElection().data.blocs || BLOCS_2022;
/* שם הגוש: אם הוא רשימה אחת, מוצג שמה; אחרת התווית הכללית. */
const blocLabel = (key, ids) => ids.length === 1 ? (HIST_PARTY_HE[ids[0]] || ids[0]) : BLOC_LABELS[key];

function renderCalibSwitch() {
  $("#calib-switch").innerHTML = S.elections.map(e =>
    `<button type="button" data-calib="${e.year}" aria-pressed="${e.year === S.calibYear}">${esc(e.election)} · ${e.year}</button>`).join("");
  const e = curElection(), missing = e.data.polls.filter(p => !p.firm).length;
  $("#calib-note").textContent = `${e.data.polls.length} סקרים בחלון ${e.data.window.from} – ${e.data.window.to}`
    + (missing ? `, מהם ${missing} בלי שם מכון במקור — הם מוצגים בארכיון אך אינם נכנסים לציון.` : ".");
}

function render2022() {
  const stats = (S.scen === "counterfactual" && counterfactualAvailable()) ? S.counterStats : S.stats;
  const el = curElection(), defs = curBlocDefs();
  const target = scenActual(), tb = histBlocs(target, defs);

  renderCalibrationStrip();
  renderCalibSwitch();

  /* מתג התרחיש ההיפותטי קיים רק לכנסת ה־25 */
  $("#scen-switch").hidden = !counterfactualAvailable();
  $("#scen-title").textContent = counterfactualAvailable()
    ? "התוצאה שהייתה, והתוצאה שכמעט הייתה" : `תוצאות האמת · ${el.election}`;
  $("#bias-note").textContent = `ממוצע ${el.data.polls.length} הסקרים בחלון מול התוצאה בפועל. השוואה היסטורית בלבד; אינה משנה את נתוני הסקרים הנוכחיים.`;
  $("#arch-title").textContent = `${el.data.polls.length} הסקרים, אחד־אחד`;

  const colors = { netanyahu: "#17457F", outgoing: "#C0392B", outside: "#2E8467" };
  $("#scen-cards").innerHTML = Object.entries(defs).map(([k, ids]) =>
    ({ t: blocLabel(k, ids), v: tb[k], c: colors[k] || "#96A0AB" })
  ).map(x => `<div class="card pad" style="border-top:4px solid ${x.c}">
      <p class="kicker" style="color:${x.c}">${esc(x.t)}</p>
      <b style="display:block;font-family:var(--serif);font-size:3rem;font-weight:900;line-height:1;margin-top:6px">${x.v}</b>
      <span style="color:var(--ink-3);font-size:.8rem">מנדטים</span></div>`).join("");

  const w = S.regions.wasted;
  $("#scen-explain").innerHTML = !counterfactualAvailable()
    ? `<p style="margin:0 0 6px"><b>${esc(el.election)}, ${esc(el.data.meta?.electionDate || "")}.</b> ${esc(Object.entries(defs).map(([k, ids]) => `${blocLabel(k, ids)} ${tb[k]}`).join(" · "))}.</p>
       <p style="margin:0">ימינה נספרת כאן בגוש היריב — שם היא הרכיבה בפועל את הממשלה שקמה אחרי הבחירות. הרשימה המשותפת ורע״ם עמדו מחוץ לשני הגושים בזמן הסקרים.</p>`
    : S.scen === "counterfactual"
    ? `<p style="margin:0 0 6px"><b>התרחיש שכמעט קרה.</b> מרצ קיבלה ${fmt(w.meretz)} קולות — ${fmt(w.meretzGap)} קולות בלבד מתחת לאחוז החסימה. אילו עברה, הדירוג כולו מחושב כאן מחדש מול התוצאה ההיפותטית.</p>
       <p style="margin:0">שימו לב מה קורה לציונים: מכון שהראה למרצ 4–5 מנדטים ״טעה״ מול המציאות, אך היה מדויק מול התרחיש הזה. זה בדיוק ההבדל בין למדוד את מצב הרוח לבין לחזות את התוצאה.</p>`
    : `<p style="margin:0 0 6px"><b>הפער בין הגושים היה ${fmt(w.blocGap)} קולות בלבד</b> — ${fmt(w.blocNetanyahu)} לגוש נתניהו מול ${fmt(w.blocChange)} לגוש השני. ובכל זאת נפער הפרש של 8 מנדטים.</p>
       <p style="margin:0">הסיבה: ${fmt(w.total)} קולות ירדו לטמיון כשמרצ (${fmt(w.meretz)}) ובל״ד (${fmt(w.balad)}) לא עברו את אחוז החסימה — יותר משבעה מנדטים בחישוב גולמי. אף סקר לא ״טעה״ בגושים; הם פשוט לא יכלו לתמחר את אחוז החסימה.</p>`;

  // ranking
  const comps = [["blocScore", "דיוק בגושים", "#17457F"], ["partyScore", "דיוק במפלגות", "#B8862B"], ["consistencyScore", "עקביות", "#5B4B8A"]];
  $("#rank-list").innerHTML = stats.map(it => {
    const m = S.firms.firms.find(f => f.id === it.firm) || { he: it.firm, short: "?" };
    return `<article class="rank" data-firm="${esc(it.firm)}" role="button" tabindex="0" aria-label="${esc(m.he)} — פירוט הציון">
      ${logoBox(m, 52)}
      <div style="min-width:0"><strong style="display:block">${esc(m.he)}</strong>
        <span style="color:var(--ink-3);font-size:.75rem">${it.n} סקרי כיול</span>
        <span class="calib-runs">${(it.elections || []).map(r =>
          `<b title="${esc(r.election)}: ציון ${r1(r.score)} מתוך ${r.n} סקרים">${r.year}׳ <em>${r1(r.score)}</em></b>`).join("")}${
          (it.elections || []).length === 1 ? '<i>מערכת אחת בלבד</i>' : ""}</span>
        ${outletIconStrip(m.outlets || [])}</div>
      <div class="meters">${comps.map(([k, l, c]) => `<div class="meter" style="--c:${c}"><span>${l}<b>${r1(it[k])}</b></span><i style="--v:${clamp(it[k])}%"></i></div>`).join("")}</div>
      <div class="final"><b class="num">${r1(it.score)}</b><span>ציון סופי</span></div>
    </article>`;
  }).join("");

  /* מכונים פעילים בתחזית שאין להם סדרת כיול משלהם מ-2022 — כדי שהעמוד
     יכסה כל מכון שמזין את החישוב, לא רק את שבעת המכוילים. */
  const rankedIds = new Set(stats.map(s => s.firm));
  const extras = [...new Set(S.cur.polls.map(p => firmOf(p.sourceId).firm))]
    .map(id => S.firms.firms.find(f => f.id === id))
    .filter(f => f && !rankedIds.has(f.id))
    .sort((a, b) => firmScore(b) - firmScore(a));
  if (extras.length) $("#rank-list").insertAdjacentHTML("beforeend",
    `<p class="sec-note" style="margin:20px 0 6px">מכונים פעילים ללא סדרת כיול משלהם מ־2022:</p>` +
    extras.map(f => {
      const src = f.calibrationFirm && rankedIds.has(f.calibrationFirm)
        ? `יורש את ציון ${esc(S.firms.firms.find(x => x.id === f.calibrationFirm)?.he || f.calibrationFirm)}`
        : "אין סדרת כיול · משקל ניטרלי";
      return `<article class="rank rank-nocalib" data-firm="${esc(f.id)}" role="button" tabindex="0" aria-label="${esc(f.he)} — פירוט הציון">
        ${logoBox(f, 52)}
        <div style="min-width:0"><strong style="display:block">${esc(f.he)}</strong>
          <span style="color:var(--ink-3);font-size:.75rem">${src}</span>
          ${outletIconStrip(f.outlets || [])}</div>
        <div class="final"><b class="num">${r1(firmScore(f))}</b><span>${f.calibrated ? "ציון בשימוש" : "משקל ניטרלי"}</span></div>
      </article>`;
    }).join(""));

  // bias table
  const keys = Object.keys(el.data.actual);
  const biasRows = keys.map(k => {
    const mean = avg(el.data.polls.map(p => p.p[k]));
    return { k, mean, act: target[k], d: target[k] - mean };
  }).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const biasHTML = `<thead><tr><th>מפלגה</th><th class="n">ממוצע ${el.data.polls.length} הסקרים</th><th class="n">${S.scen === "counterfactual" ? "בתרחיש" : "בפועל"}</th><th class="n">פער</th></tr></thead><tbody>${
    biasRows.map(r => `<tr><td>${esc(HIST_PARTY_HE[r.k])}</td><td class="n">${r1(r.mean)}</td><td class="n">${r.act}</td>
      <td class="n"><span dir="ltr" class="chip ${Math.abs(r.d) >= 1 ? (r.d > 0 ? "good" : "bad") : ""}">${r.d > 0 ? "+" : ""}${r.d.toFixed(1)}</span></td></tr>`).join("")}</tbody>`;
  $("#bias-table").innerHTML = biasHTML;
  const mb = $("#method-bias"); if (mb) mb.innerHTML = biasHTML;
  const har = $("#m-har-poll");
  if (har) har.textContent = r1(avg(S.hist.polls.map(p => p.p.shas + p.p.utj)));

  renderArchive();
}

function renderArchive() {
  const el = curElection(), defs = curBlocDefs();
  const sel = $("#arch-firm");
  /* רשימת המכונים נבנית מחדש בכל החלפת מערכת — לכל כנסת מכונים אחרים. */
  const firmsHere = [...new Set(el.data.polls.map(p => p.firm).filter(Boolean))]
    .map(f => ({ f, n: el.data.polls.filter(p => p.firm === f).length }))
    .sort((a, b) => b.n - a.n);
  const wanted = "all|" + firmsHere.map(x => x.f).join("|");
  if (sel.dataset.built !== wanted) {
    const keep = sel.value;
    sel.innerHTML = `<option value="all">כל המכונים</option>` + firmsHere.map(({ f, n }) => {
      const m = S.firms.firms.find(x => x.id === f);
      return `<option value="${esc(f)}">${esc(m ? m.he : f)} (${n})</option>`;
    }).join("");
    sel.dataset.built = wanted;
    sel.value = firmsHere.some(x => x.f === keep) ? keep : "all";
  }
  const ff = sel.value, q = $("#arch-q").value.trim().toLowerCase();
  const target = scenActual(), keys = Object.keys(el.data.actual);
  const rows = el.data.polls.map((p, i) => ({ p, i })).filter(({ p }) => {
    const m = S.firms.firms.find(f => f.id === p.firm);
    return (ff === "all" || p.firm === ff) && (!q || `${p.date} ${p.firm} ${m ? m.he : ""} ${p.publisher}`.toLowerCase().includes(q));
  });
  $("#arch-count").textContent = `${rows.length} מתוך ${el.data.polls.length} סקרים`;
  const blocCols = Object.entries(defs);
  $("#arch-table").innerHTML = `<thead><tr><th>תאריך</th><th>מכון ופרסום</th>${
    blocCols.map(([k, ids]) => `<th class="n">${esc(blocLabel(k, ids))}</th>`).join("")
  }<th class="n">שגיאת מפלגות</th><th></th></tr></thead><tbody>${
    rows.map(({ p, i }) => {
      const b = histBlocs(p.p, defs), tb = histBlocs(target, defs);
      const mae = avg(keys.map(k => Math.abs(p.p[k] - target[k])));
      const m = S.firms.firms.find(f => f.id === p.firm) || { he: p.firm || "ללא שיוך מכון", short: "?" };
      const dev = Math.abs(b.netanyahu - tb.netanyahu);
      return `<tr${p.firm ? "" : ' class="unattributed"'}><td style="white-space:nowrap">${esc(p.date.slice(5))}</td>
        <td><div class="orgcell">${outletLogo(p.publisher)}<div><strong>${esc(m.he)}</strong><span>${esc(p.publisher)}${p.firm ? "" : " · לא נכנס לציון"}</span></div></div></td>
        ${blocCols.map(([k]) => k === "netanyahu"
          ? `<td class="n"><span class="chip ${dev <= 1 ? "good" : dev >= 3 ? "bad" : ""}">${b[k]}</span></td>`
          : `<td class="n"><span class="chip">${b[k]}</span></td>`).join("")}
        <td class="n"><span class="chip ${mae < 1 ? "good" : mae > 1.6 ? "bad" : ""}">${r1(mae)}</span></td>
        <td><button class="btn ghost" style="padding:5px 12px;font-size:.78rem" type="button" data-poll="${i}">מפלגות</button></td></tr>`;
    }).join("") || `<tr><td colspan="${blocCols.length + 4}" class="empty">לא נמצאו סקרים.</td></tr>`}</tbody>`;
}

/* באנר פירוט למכון: מה הוא חזה בחודש הכיול, מה יצא בפועל, ולמה הציון. */
function openFirm(firmId) {
  const meta = S.firms.firms.find(f => f.id === firmId) || { id: firmId, he: firmId, short: "?" };
  const calibId = calibrationId(meta);
  const st = S.stats.find(x => x.firm === calibId);
  const heir = meta.calibrationFirm && meta.calibrationFirm !== meta.id
    ? S.firms.firms.find(f => f.id === meta.calibrationFirm) : null;
  const dlg = $("#dlg");
  dlg.classList.add("wide");

  const head = `<div class="fd-head">${logoBox(meta, 56)}
      <div><h2>${esc(meta.he)}</h2><p>${esc(meta.lead || "")}${meta.outlets?.length ? " · מפרסם ב־" + esc(meta.outlets.join(", ")) : ""}</p></div>
      <div class="fd-score"><b class="num">${r1(firmScore(meta))}</b><span>${meta.calibrated ? "ציון אמינות" : "משקל ניטרלי"}</span></div>
    </div>
    <p class="fd-about">${esc(meta.about || "")}</p>`;

  if (!meta.calibrated || !st) {
    $("#dlg-body").innerHTML = head + `<div class="notice" style="margin-top:14px"><span class="ic">i</span><p style="margin:0">
      למכון הזה אין סדרת סקרים בחודש הכיול של הכנסת ה־25, ולכן אי אפשר למדוד אותו מול תוצאות האמת. הוא נכנס לתחזית במשקל ניטרלי של 70 מתוך 100 — לא עונש ולא פרס, פשוט חוסר נתונים. ברגע שתהיה תוצאת בחירות חדשה, הוא יכויל כמו כולם.</p></div>`;
    dlg.showModal();
    return;
  }

  const heirNote = heir ? `<div class="notice warm" style="margin-top:12px"><span class="ic">↻</span><p style="margin:0">
      <b>${esc(meta.he)}</b> נמדד לפי סדרת הכיול של <b>${esc(heir.he)}</b> — אותו סוקר ואותה שיטה, תחת שם חדש. הפירוט למטה הוא של ${esc(heir.he)} ב־2022.</p></div>` : "";

  const comps = [
    ["blocScore", "דיוק בגושים", "60%", "#17457F"],
    ["partyScore", "דיוק במפלגות", "30%", "#B8862B"],
    ["consistencyScore", "עקביות", "10%", "#5B4B8A"]
  ];
  const scoreStrip = `<div class="fd-comps">${comps.map(([k, l, w, c]) =>
      `<div style="--c:${c}"><span>${l} <em>${w}</em></span><b class="num">${r1(st[k])}</b><i><u style="width:${clamp(st[k])}%"></u></i></div>`).join("")}
    <div class="fd-final"><span>ציון סופי</span><b class="num">${r1(st.score)}</b><small>0.6×${r1(st.blocScore)} + 0.3×${r1(st.partyScore)} + 0.1×${r1(st.consistencyScore)}</small></div>
  </div>`;

  /* פירוט לכל מערכת בחירות שהמכון כויל עליה (כיום: הכנסת ה־25 בלבד) */
  const runs = (st.elections || []).filter(r => S.elections.some(e => e.year === r.year));
  const sections = runs.map(run => {
    const el = S.elections.find(e => e.year === run.year);
    const actual = el.data.actual, defs = el.data.blocs || BLOCS_2022, aB = histBlocs(actual, defs);
    const polls = run.polls.slice().sort((a, b) => a.date.localeCompare(b.date));
    const keys = Object.keys(actual);
    const pAvg = Object.fromEntries(keys.map(k => [k, avg(polls.map(p => p.p[k]))]));
    /* לכנסת ה-25 נוספת עמודה "אילו מרצ עברה": כמה מהפער הוא בכלל אחוז החסימה */
    const cf = run.year === 2022 ? COUNTERFACTUAL : null, cfB = cf ? histBlocs(cf, defs) : null;
    const gap = (d, bad) => `<span dir="ltr" class="chip ${Math.abs(d) <= 1 ? "good" : Math.abs(d) >= bad ? "bad" : ""}">${d > 0 ? "+" : ""}${r1(d)}</span>`;
    const blocRows = Object.entries(defs).map(([k, ids]) => {
      const d = run.blocMean[k] - aB[k];
      return `<tr class="fd-bloc"><th>${esc(blocLabel(k, ids))}</th><td class="n">${r1(run.blocMean[k])}</td><td class="n">${aB[k]}</td><td class="n">${gap(d, 3)}</td>${
        cf ? `<td class="n fd-cf">${cfB[k]}</td><td class="n fd-cf">${gap(run.blocMean[k] - cfB[k], 3)}</td>` : ""}</tr>`;
    }).join("");
    const partyRows = keys.sort((a, b) => actual[b] - actual[a]).map(k => {
      const d = pAvg[k] - actual[k];
      return `<tr><th>${esc(HIST_PARTY_HE[k] || k)}</th><td class="n">${r1(pAvg[k])}</td><td class="n">${actual[k]}</td><td class="n">${gap(d, 2)}</td>${
        cf ? `<td class="n fd-cf">${cf[k]}</td><td class="n fd-cf">${gap(pAvg[k] - cf[k], 2)}</td>` : ""}</tr>`;
    }).join("");
    const cfStat = cf ? S.counterStats.find(x => x.firm === run.firm) : null;
    const worst = keys.map(k => ({ k, d: pAvg[k] - actual[k] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    const nb = run.blocMean.netanyahu - aB.netanyahu;
    const why = [
      `<b>גושים (${r1(run.blocScore)}):</b> סכום הפערים המוחלטים בשלושת הגושים הוא ${r1(run.blocAbs)} מנדטים — ${nb === 0 ? "גוש נתניהו נחזה במדויק" : `גוש נתניהו ${nb > 0 ? "הוערך ביתר" : "הוערך בחסר"} ב־${r1(Math.abs(nb))} מנדטים בממוצע`}. כל מנדט פער ממוצע לגוש מוריד 10 נקודות.`,
      `<b>מפלגות (${r1(run.partyScore)}):</b> הטעות הממוצעת לרשימה היא ${r1(run.partyMae)} מנדטים (15 נקודות לכל מנדט). הפספוס הגדול ביותר: ${esc(HIST_PARTY_HE[worst.k] || worst.k)}, ${worst.d > 0 ? "יותר מדי" : "פחות מדי"} ב־${r1(Math.abs(worst.d))}.`,
      `<b>עקביות (${r1(run.consistencyScore)}):</b> גוש נתניהו זז בין הסקרים בסטיית תקן של ${r1(100 - run.stability > 0 ? (100 - run.stability) / 25 : 0)} מנדטים (יציבות ${r1(run.stability)}), והרשימות בממוצע ${r1(run.partyStability != null ? (100 - run.partyStability) / 50 : 0)} מנדטים (יציבות ${r1(run.partyStability ?? 0)}). 65% לגוש, 35% למפלגות.`
    ];
    const pollList = polls.map(p => {
      const b = histBlocs(p.p, defs), dev = Math.abs(b.netanyahu - aB.netanyahu);
      const mae = avg(keys.map(k => Math.abs(p.p[k] - actual[k])));
      return `<tr><td style="white-space:nowrap">${esc(p.date.slice(5))}</td><td>${esc(p.publisher || "")}</td>
        <td class="n"><span class="chip ${dev <= 1 ? "good" : dev >= 3 ? "bad" : ""}">${b.netanyahu}</span></td><td class="n"><span class="chip ${mae < 1 ? "good" : mae > 1.6 ? "bad" : ""}">${r1(mae)}</span></td></tr>`;
    }).join("");
    return `<section class="fd-sec">
      <h3>${esc(el.election)} · ${run.n} סקרים בחודש שלפני הבחירות · ציון ${r1(run.score)}</h3>
      <div class="fd-why">${why.map(t => `<p>${t}</p>`).join("")}</div>
      <div class="fd-tables">
        <div class="tablewrap"><table><caption>ממוצע הסקרים של המכון מול התוצאה${cfStat ? ` · אילו מרצ הייתה עוברת, ציון המכון היה <b>${r1(cfStat.score)}</b> במקום ${r1(run.score)}` : ""}</caption>
          <thead><tr><th>רשימה / גוש</th><th class="n">המכון</th><th class="n">בפועל</th><th class="n">פער</th>${cf ? `<th class="n fd-cf">אילו מרצ עברה</th><th class="n fd-cf">פער</th>` : ""}</tr></thead>
          <tbody>${blocRows}${partyRows}</tbody></table></div>
        <div class="tablewrap"><table><caption>הסקרים, אחד־אחד</caption>
          <thead><tr><th>תאריך</th><th>פרסום</th><th class="n">גוש נתניהו (${aB.netanyahu})</th><th class="n">טעות/רשימה</th></tr></thead>
          <tbody>${pollList}</tbody></table></div>
      </div>
    </section>`;
  }).join("");

  $("#dlg-body").innerHTML = head + heirNote + scoreStrip + sections;
  dlg.showModal();
  dlg.scrollTop = 0;
}

function openPoll(i) {
  const el = curElection();
  const p = el.data.polls[i], m = S.firms.firms.find(f => f.id === p.firm) || { he: p.firm || "ללא שיוך מכון" };
  const target = scenActual();
  $("#dlg").classList.remove("wide");
  $("#dlg-body").innerHTML = `<h2 style="font-size:1.6rem">${esc(m.he)} · ${esc(p.publisher)}</h2>
    <p style="color:var(--ink-3);font-size:.82rem;margin:6px 0 0">${esc(p.date)} · ${esc(el.election)} · מול ${(S.scen === "counterfactual" && counterfactualAvailable()) ? "תרחיש מרצ עוברת" : "תוצאת האמת"}${p.source ? ` · <a href="${esc(p.source)}" target="_blank" rel="noopener">המקור</a>` : ""}</p>
    <div class="dgrid">${Object.keys(target).map(k => {
      const d = p.p[k] - target[k];
      return `<div><span>${esc(HIST_PARTY_HE[k])}</span><b>${p.p[k]} <span style="color:var(--ink-3)">→ ${target[k]}</span> <span dir="ltr" class="chip ${Math.abs(d) <= 1 ? "good" : "bad"}">${d > 0 ? "+" : ""}${d}</span></b></div>`;
    }).join("")}</div>`;
  $("#dlg").showModal();
}

/* ============================================================
   6.5 כמה עברו צד — תזוזת הגושים מול תוצאת 2022
   ============================================================ */
/* המדידה נעשית בחלקי קולות, לא במנדטים: מפלגה שלא עברה את אחוז החסימה אבל
   קיבלה לפחות 1.5% (מרצ ובל״ד ב-2022; רשימה קטנה בסקרים של היום) עדיין
   מייצגת מצביעים ששייכים לגוש — הם רק לא תורגמו למנדטים. רשימה מתחת
   ל-1.5% מוצאת מהחישוב משני הצדדים. */
const CROSS_MIN_SHARE = 1.5;
function renderCrossover() {
  const nat = S.regions.national, valid = nat.valid;
  const defs = S.hist.blocs || BLOCS_2022;
  const rightIds2022 = new Set(defs.netanyahu);
  const counted2022 = nat.parties.filter(p => p.pct >= CROSS_MIN_SHARE);
  const tot2022 = counted2022.reduce((t, p) => t + p.votes, 0);
  const right2022 = counted2022.filter(p => rightIds2022.has(p.id)).reduce((t, p) => t + p.votes, 0);
  const rightShare0 = 100 * right2022 / tot2022;
  const below2022 = counted2022.filter(p => !p.seats);
  const kv = v => fmt(Math.round(Math.abs(v) / 1000) * 1000);
  const votersOf = pp => Math.abs(pp) / 100 * tot2022;               // נקודות אחוז → מצביעים (על בסיס 2022)

  /* חלק הימין בכל מכון: כל רשימה עם ממוצע של 1.5% ומעלה נספרת, גם מתחת לסף. */
  const shareOf = s => {
    const ids = Object.keys(s.parties).filter(id => 100 * s.parties[id] / 120 >= CROSS_MIN_SHARE);
    const tot = ids.reduce((t, id) => t + s.parties[id], 0) || 1;
    const right = ids.filter(id => partyMeta(id).alignment === "Right").reduce((t, id) => t + s.parties[id], 0);
    const below = ids.filter(id => s.parties[id] < THRESHOLD_MANDATES);
    return { share: 100 * right / tot, below };
  };
  const wOf = s => firmScore(s.meta) / 100;
  const rows = S.series.map(s => {
    const x = shareOf(s);
    const delta = x.share - rightShare0;                              // נקודות אחוז; שלילי = הימין הצטמק
    return { meta: s.meta, series: s, share: x.share, delta, voters: votersOf(delta), n: s.polls.length, below: x.below };
  }).sort((a, b) => a.delta - b.delta);

  $("#crossover-intro").textContent =
    "בבחירות 2022 קיבל גוש הימין " + r1(rightShare0) + "% מהקולות (בספירה שכוללת גם רשימות שלא עברו את אחוז החסימה אך קיבלו 1.5% ומעלה). כל מכון מצייר היום חלוקה אחרת, וכל חלוקה כזאת אומרת שכמות מסוימת של מצביעים עברה מצד לצד. כאן מתורגם כל מכון למספר אחד: כמה מצביעים, נטו, חצו את קו הגוש מאז 2022.";

  $("#crossover-baseline").innerHTML =
    `<div class="crossbar">` +
    `<span style="flex:0 0 ${rightShare0.toFixed(1)}%;background:${BLOCS.Right.color}">גוש הימין · ${r1(rightShare0)}% · ${fmt(right2022)} קולות</span>` +
    `<span style="flex:1 1 auto;background:${BLOCS.Left.color}">כל השאר · ${r1(100 - rightShare0)}% · ${fmt(tot2022 - right2022)} קולות</span>` +
    `</div>` +
    `<p class="sec-note" style="margin-top:8px;max-width:none">גוש הימין 2022 = הליכוד, ש״ס, יהדות התורה והציונות הדתית (כולל עוצמה יהודית). בצד השני נספרות גם ${below2022.map(p => `${p.name} (${p.pct}%)`).join(" ו")} שלא עברו את אחוז החסימה — ${fmt(below2022.reduce((t, p) => t + p.votes, 0))} קולות. רשימות מתחת ל־1.5% אינן נספרות. סה״כ ${fmt(tot2022)} קולות נספרים מתוך ${fmt(valid)} כשרים.</p>`;

  if (!rows.length) {
    $("#crossover-note").textContent = "אין סקרים בחלון הנוכחי.";
    $("#crossover-chart").innerHTML = "";
    $("#crossover-verdict").textContent = "";
    return;
  }

  const totW = S.series.reduce((t, s) => t + wOf(s), 0) || 1;
  const shareAvg = S.series.reduce((t, s) => t + shareOf(s).share * wOf(s), 0) / totW;
  const deltaAvg = shareAvg - rightShare0;
  const votersAvg = votersOf(deltaAvg);

  $("#crossover-note").textContent =
    `ממוצע המכונים, משוקלל לפי אמינות: הימין ב־${r1(shareAvg)}% — כ־${kv(votersAvg)} מצביעים ${deltaAvg <= 0 ? "עזבו את" : "הצטרפו ל"}גוש הימין נטו. רשימה שממוצע המכון נותן לה 1.5% ומעלה נספרת לגוש שלה גם אם היא מתחת לאחוז החסימה.`;

  /* ציר: עיגול לכפולה נוחה של 100 אלף */
  const maxV = Math.max(...rows.map(r => r.voters), votersAvg, 100000);
  const axisMax = Math.ceil(maxV * 1.28 / 100000) * 100000;          // מרווח לתווית מעבר לקצה הסרגל
  const step = axisMax >= 800000 ? 200000 : 100000;
  const ticks = [];
  for (let v = -axisMax; v <= axisMax; v += step) ticks.push(v);
  /* כיוון הציר תואם לפס 2022 שמעליו: הימין בצד ימין, כל השאר משמאל — מי
     שעזב את הימין נע שמאלה, מי שהצטרף נע ימינה. */
  const pos = v => 50 - 50 * v / axisMax;                            // אחוז מהקצה הימני
  const tickHtml = ticks.map(v => `<span dir="ltr" style="inset-inline-start:${pos(v).toFixed(2)}%" class="${v ? "" : "zero"}">${v ? (v > 0 ? "+" : "−") + Math.abs(v) / 1000 + "K" : "2022"}</span>`).join("");

  $("#crossover-chart").innerHTML =
    `<div class="cross-summary">
      <div><span>גוש הימין ב־2022</span><b class="num">${r1(rightShare0)}%</b></div>
      <div class="arrow" aria-hidden="true">←</div>
      <div><span>ממוצע המכונים היום</span><b class="num">${r1(shareAvg)}%</b></div>
      <div class="cross-summary-out ${deltaAvg <= 0 ? "left" : "join"}"><span>${deltaAvg <= 0 ? "עזבו את גוש הימין" : "הצטרפו לגוש הימין"}</span><b class="num">≈ ${kv(votersAvg)}</b><em>${r1(Math.abs(deltaAvg))} נקודות אחוז</em></div>
    </div>
    <div class="cross-legend"><span><i style="background:${BLOCS.Left.color}"></i>עזבו את הימין</span><span><i style="background:${BLOCS.Right.color}"></i>הצטרפו לימין</span><span><i class="avg"></i>ממוצע המכונים</span><span class="cross-legend-share">משמאל לכל סרגל: חלק הימין היום</span></div>
    <div class="cross-grid">
      <div class="cross-axis" aria-hidden="true">${tickHtml}</div>
      ${rows.map(r => {
        const shrank = r.delta <= 0;
        const w = 50 * r.voters / axisMax;
        const belowNote = r.below.map(id => `${partyMeta(id).name} ${r1(100 * r.series.parties[id] / 120)}%`);
        return `<div class="crossrow" title="${esc(r.meta.he)}: הימין ב־${r1(r.share)}% היום מול ${r1(rightShare0)}% ב־2022${belowNote.length ? " · מתחת לסף אך נספר: " + esc(belowNote.join(", ")) : ""}">
          <span class="crossrow-firm">${logoBox(r.meta, 26)}<span><b>${esc(r.meta.he || r.meta.firm || r.meta.id)}</b><em>${r.n} סקרים${r.meta.calibrated ? "" : " · משקל ניטרלי"}</em></span></span>
          <span class="crossrow-track">
            <i class="crossrow-avg" style="inset-inline-start:${pos(deltaAvg <= 0 ? -votersAvg : votersAvg).toFixed(2)}%"></i>
            <i class="crossrow-fill ${shrank ? "shrank" : "grew"}" style="width:${w.toFixed(2)}%;background:${shrank ? BLOCS.Left.color : BLOCS.Right.color}"><b dir="ltr">${Math.abs(r.delta) < 0.05 ? "0" : (shrank ? "−" : "+") + kv(r.voters)}</b></i>
          </span>
          <span class="crossrow-share num"><span dir="ltr">${r1(r.share)}%</span><small dir="ltr">${Math.abs(r.delta) < 0.05 ? "0" : (shrank ? "−" : "+") + kv(r.voters)}</small></span>
        </div>`;
      }).join("")}
    </div>`;

  const wild = rows.reduce((a, b) => Math.abs(b.delta) > Math.abs(a.delta) ? b : a);
  const calm = rows.reduce((a, b) => Math.abs(b.delta) < Math.abs(a.delta) ? b : a);
  const spanV = Math.max(...rows.map(r => r.delta)) - Math.min(...rows.map(r => r.delta));
  const signed = r => Math.abs(r.delta) < 0.05 ? "כמעט בלי שינוי"
    : `כ־${kv(r.voters)} ${r.delta < 0 ? "עזבו את גוש הימין" : "הצטרפו לגוש הימין"}`;
  const wildScale = scaleOf(wild.voters);
  const closer = spanV >= 5
    ? `פער של כ־<b>${kv(votersOf(spanV))}</b> מצביעים בין המכונים — על אותה אוכלוסייה, באותו שבוע. הם לא יכולים כולם לצדוק, ורק הבחירות יגידו מי הפריז.`
    : `הפער בין המכונים צר (כ־${kv(votersOf(spanV))} מצביעים): גם הזהירים מסכימים שמאזן הגושים זז מ־2022.`;
  $("#crossover-verdict").innerHTML =
    `ההערכה הדרמטית ביותר היא של <b>${esc(wild.meta.he || wild.meta.firm)}</b> — ${signed(wild)} ` +
    `(${wildScale ? wildScale + ", " : ""}${r1(Math.abs(wild.delta))} נקודות אחוז). ` +
    `הרגועה ביותר, <b>${esc(calm.meta.he || calm.meta.firm)}</b> — ${signed(calm)}. ` +
    `${closer} מספר כזה של בני אדם שמחליפים גוש בתוך קדנציה אחת הוא טלטלה נדירה — ולא לכל מכון שמצייר אותה יש אותה סבירות.`;
}

/* ============================================================
   7. עמוד פילוח אזורי + מפה
   ============================================================ */
function project(lon, lat, box) {
  // simple equirectangular fitted to the data bounds
  const { minLon, maxLon, minLat, maxLat, W, H, pad } = box;
  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const w = (maxLon - minLon) * k, h = (maxLat - minLat);
  const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
  const x = pad + ((lon - minLon) * k) * s + ((W - 2 * pad) - w * s) / 2;
  const y = pad + (maxLat - lat) * s;
  return [x, y];
}

function renderRegions() {
  const R = S.regions, N = R.national;
  $("#nat-stats").innerHTML = [
    [fmt(N.eligible), "בעלי זכות בחירה"],
    [pct(N.turnout), "אחוז הצבעה ארצי"],
    [fmt(N.valid), "קולות כשרים"],
    [N.threshold + "%", "אחוז החסימה"]
  ].map(([n, l]) => `<div><b class="num" style="font-size:1.7rem">${n}</b><span>${esc(l)}</span></div>`).join("");

  // ---- map ----
  const lats = R.geo.outline.map(p => p[1]), lons = R.geo.outline.map(p => p[0]);
  const box = { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats), W: 460, H: 690, pad: 22 };
  const path = pts => pts.map((p, i) => { const [x, y] = project(p[0], p[1], box); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("") + "Z";
  const lead = loc => loc.parties && loc.parties.length ? loc.parties[0] : null;
  const dots = R.localities.map((loc, i) => {
    const [x, y] = project(loc.lon, loc.lat, box);
    const l = lead(loc);
    const col = l ? (R.partyColors[l.id] || "#96A0AB") : "#96A0AB";
    const rr = l ? 8.5 : 6.5;
    const east = loc.side !== "w";                 // east = label to the right of the dot
    const lx = x + (east ? rr + 6 : -(rr + 6));
    const ly = y + 3 + (loc.ldy || 0);
    return `<g class="locdot${i === S.selectedLoc ? " sel" : ""}" data-loc="${i}" tabindex="0" role="button" aria-label="${esc(loc.name)}">
        <circle class="h" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15"/>
        <circle class="core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr}" fill="${col}" fill-opacity="${l ? .92 : .42}" stroke="#fff" stroke-width="1.7"/>
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${east ? "start" : "end"}">${esc(loc.name)}</text>
      </g>`;
  }).join("");
  $("#map-svg").innerHTML = `<svg viewBox="0 0 ${box.W} ${box.H}" role="img" aria-label="מפת יישובים עם תוצאות אמת">
      <defs><filter id="mapShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0B2740" flood-opacity=".18"/></filter></defs>
      <rect width="${box.W}" height="${box.H}" fill="#DCE7EE" rx="12"/>
      <path class="landmass" d="${path(R.geo.outline)}" filter="url(#mapShadow)"/>
      <path class="greenline" d="${path(R.geo.greenline)}"/>
      ${dots}
    </svg>`;
  const used = [...new Set(R.localities.map(l => lead(l)?.id).filter(Boolean))];
  $("#map-legend").innerHTML = used.map(id => {
    const nm = R.national.parties.find(p => p.id === id)?.name || id;
    return `<span style="--c:${R.partyColors[id] || "#96A0AB"}"><i></i>${esc(nm)}</span>`;
  }).join("") + `<span style="--c:#96A0AB"><i></i>אחוז הצבעה בלבד</span><span style="color:var(--ink-3)">— — הקו הירוק</span>`;
  renderLocDetail();

  // ---- sectors ----
  $("#sector-cards").innerHTML = R.sectors.map(s => `<article class="sector" style="--c:${s.color}">
      <h3>${esc(s.name)}</h3>
      <div class="turnout"><b class="num">${pct(s.turnout)}</b><span>אחוז הצבעה${s.turnoutPrev ? ` · לעומת ${pct(s.turnoutPrev)} ב־2021` : ""}</span></div>
      <p style="margin:0 0 14px;color:var(--ink-2);font-size:.88rem">${esc(s.desc)}</p>
      <div class="lbars">${s.parties.map(p => `<div class="lbar" style="--c:${R.partyColors[p.id] || "#96A0AB"}">
          <span>${esc(p.name)}</span><i><b style="--w:${clamp(p.pct * 2.4)}%"></b></i><span class="v">${pct(p.pct)}</span></div>`).join("")}</div>
      ${s.extra ? `<p style="margin:12px 0 0;color:var(--ink-3);font-size:.79rem">${esc(s.extra)}</p>` : ""}
      <span class="src">מקור: <a href="${esc(s.source.url)}" target="_blank" rel="noopener">${esc(s.source.name)} ↗</a></span>
    </article>`).join("");

  // ---- clusters ----
  $("#clusters-title").textContent = R.clusters.title;
  $("#clusters-desc").textContent = R.clusters.desc;
  $("#clusters-note").innerHTML = `${esc(R.clusters.note)} <a href="${esc(R.clusters.source.url)}" target="_blank" rel="noopener" style="color:var(--navy)">${esc(R.clusters.source.name)} ↗</a>`;
  $("#cluster-cards").innerHTML = R.clusters.groups.map(g => `<article class="sector" style="--c:${g.color}">
      <h3 style="font-size:1rem">${esc(g.name)}</h3>
      <div class="lbars" style="margin-top:12px">${g.parties.map(p => `<div class="lbar" style="--c:${R.partyColors[p.id] || "#96A0AB"}">
        <span>${esc(p.name)}</span><i><b style="--w:${clamp(p.pct * 2.4)}%"></b></i><span class="v">${pct(p.pct)}</span></div>`).join("")}</div>
    </article>`).join("");

  // ---- full locality table (מופיע רק אחרי הרצת סקריפט הייבוא הרשמי) ----
  const fullBox = $("#full-localities");
  if (R.localitiesFull && R.localitiesFull.length) {
    fullBox.hidden = false;
    const draw = () => {
      const q = $("#loc-q").value.trim();
      const rows = R.localitiesFull.filter(l => !q || l.name.includes(q)).slice(0, 400);
      $("#loc-count").textContent = `${rows.length} מתוך ${R.localitiesFull.length} יישובים`;
      $("#loc-table").innerHTML = `<thead><tr><th>יישוב</th><th class="n">קולות כשרים</th><th class="n">אחוז הצבעה</th><th>ארבע הרשימות המובילות</th></tr></thead><tbody>${
        rows.map(l => `<tr><td><strong>${esc(l.name)}</strong></td><td class="n">${fmt(l.valid)}</td>
          <td class="n">${l.turnout ? pct(l.turnout) : "—"}</td>
          <td><div style="display:flex;flex-wrap:wrap;gap:6px">${l.top.map(t => `<span class="chip" style="border-color:${R.partyColors[t.id] || "#ccc"}">${esc(t.name)} ${pct(t.pct)}</span>`).join("")}</div></td></tr>`).join("")
        || `<tr><td colspan="4" class="empty">לא נמצא יישוב בשם הזה.</td></tr>`}</tbody>`;
    };
    if (!fullBox.dataset.wired) { $("#loc-q").addEventListener("input", draw); fullBox.dataset.wired = "1"; }
    draw();
  }

  // ---- religiosity ----
  $("#relig-title").textContent = R.religiosity.title;
  $("#relig-cards").innerHTML = R.religiosity.rows.map(row => `<article class="sector" style="--c:${row.color}">
      <h3 style="font-size:1.02rem">${esc(row.group)}</h3>
      <div class="lbars" style="margin-top:12px">${row.items.map(it => `<div class="lbar" style="--c:${row.color}">
        <span style="font-size:.78rem">${esc(it.name)}</span><i><b style="--w:${clamp(it.pct)}%"></b></i><span class="v">${pct(it.pct)}</span></div>`).join("")}</div>
      ${row.note ? `<p style="margin:12px 0 0;color:var(--ink-3);font-size:.76rem">${esc(row.note)}</p>` : ""}
    </article>`).join("");
}

function renderLocDetail() {
  const R = S.regions, loc = R.localities[S.selectedLoc];
  if (!loc) return;
  const src = R.sources[loc.src] || { name: "—", url: "#" };
  $("#loc-detail").innerHTML = `<p class="kicker">${esc(loc.region)} · ${esc(loc.sector)}</p>
    <h3>${esc(loc.name)}</h3>
    <p class="lmeta">${loc.turnout ? `אחוז הצבעה ${pct(loc.turnout)}` : "תוצאות הכנסת ה־25"}</p>
    ${loc.parties && loc.parties.length ? `<div class="lbars">${loc.parties.map(p => `<div class="lbar" style="--c:${R.partyColors[p.id] || "#96A0AB"}">
        <span>${esc(p.name)}</span><i><b style="--w:${clamp(p.pct * 2.2)}%"></b></i><span class="v">${pct(p.pct)}</span></div>`).join("")}</div>`
      : `<p style="color:var(--ink-2);font-size:.88rem;margin:0">למקור שברשותנו יש עבור יישוב זה נתון אחוז הצבעה בלבד, ולא פילוח מפלגתי. הפילוח יושלם אוטומטית בהרצת סקריפט הייבוא הרשמי.</p>`}
    ${loc.note ? `<p style="margin:12px 0 0;color:var(--ink-3);font-size:.78rem">${esc(loc.note)}</p>` : ""}
    <span class="src">מקור: <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)} ↗</a></span>`;
  $$("#map-svg .locdot").forEach((g, i) => g.classList.toggle("sel", i === S.selectedLoc));
}

/* ============================================================
   8. עמוד התחזית היבשה
   ============================================================ */
function demoParams() {
  const out = {};
  S.demo.sectors.forEach(s => {
    out[s.id] = {
      growth: S.demoOverrides[s.id]?.growth ?? s.growth,
      turnout: S.demoOverrides[s.id]?.turnout ?? s.turnout
    };
  });
  return out;
}

function runDemoModel(years) {
  const D = S.demo, P = years === 0 ? Object.fromEntries(S.demo.sectors.map(s=>[s.id,{growth:s.growth,turnout:s.turnout}])) : demoParams();
  const base = Object.fromEntries(D.sectors.map(s => [s.id, s.turnout]));
  const votes = {};
  D.parties2022.forEach(p => {
    let f = 0;
    for (const [sec, wgt] of Object.entries(p.mix)) {
      const g = Math.pow(1 + P[sec].growth, years);
      f += wgt * g * (P[sec].turnout / base[sec]);
    }
    votes[p.id] = p.votes * f;
  });
  const otherScale = avg(D.sectors.map(s => Math.pow(1 + P[s.id].growth, years)));
  const totalValid = Object.values(votes).reduce((a, b) => a + b, 0) + D.meta.otherVotes2022 * otherScale;
  const thr = totalValid * D.meta.threshold;
  const passing = Object.fromEntries(Object.entries(votes).filter(([, v]) => v >= thr));
  const pairs = D.surplusAgreements.filter(([a, b]) => passing[a] != null && passing[b] != null);
  const seats = baderOfer(passing, pairs, 120);
  const camp = Object.fromEntries(D.parties2022.map(p => [p.id, p.camp]));
  const campVotes = {};
  Object.entries(votes).forEach(([id, v]) => { campVotes[camp[id]] = (campVotes[camp[id]] || 0) + v; });
  const campTotal = Object.values(campVotes).reduce((a, b) => a + b, 0);
  return { votes, totalValid, thr, passing, seats, campVotes, campTotal,
           failed: Object.keys(votes).filter(k => !(k in passing)) };
}

/* חלוקת 120 מנדטים פרופורציונלית בין ארבעת הגושים — שארית גדולה, בלי אחוז חסימה */
const blocSeats = m => largestRemainder(Object.fromEntries(
  Object.entries(m.campVotes).map(([c, v]) => [c, v / m.campTotal * 120])), 120);

const BLOC_LABEL = { right: "ימין", center: "שמאל", haredi: "חרדים", arab: "ערבים" };

function renderDemography() {
  renderDemoControls();
  renderDemoComparison();
  const P=demoParams();
  $('#demo-sectors').innerHTML=`<div class="tablewrap card"><table><caption>בעלי זכות בחירה ושיעורי השתתפות · הנחות המודל</caption><tr><th>קבוצה</th><th>2022</th><th>2026 בתרחיש</th><th>גידול שנתי</th><th>הצבעה</th></tr>${S.demo.sectors.map(s=>`<tr><th>${esc(s.name)}</th><td>${fmt(s.eligible2022)}</td><td>${fmt(s.eligible2022*Math.pow(1+P[s.id].growth,S.demo.meta.years))}</td><td>${pct(P[s.id].growth*100)}</td><td>${pct(P[s.id].turnout*100)}</td></tr>`).join('')}</table></div>`;
}

function renderDemoControls() {
  const D = S.demo, P = demoParams();
  $("#demo-controls").innerHTML = D.sectors.map(s => {
    const g = P[s.id].growth, t = P[s.id].turnout;
    const size2022 = s.eligible2022, size2026 = Math.round(size2022 * Math.pow(1 + g, D.meta.years));
    return `<article class="card pad" style="border-top:4px solid ${s.color}">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
        <h3 style="font-size:1.05rem">${esc(s.name)}</h3>
        <span style="color:var(--ink-3);font-size:.76rem">${fmt(size2022)} → <b style="color:${s.color}">${fmt(size2026)}</b></span></div>
      <label style="display:block;margin-top:14px">
        <span style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--ink-2);font-weight:600">גידול שנתי<b class="num">${(g * 100).toFixed(1)}%</b></span>
        <input type="range" min="-1" max="6" step="0.1" value="${(g * 100).toFixed(1)}" data-sec="${s.id}" data-kind="growth" style="width:100%;accent-color:${s.color}"></label>
      <label style="display:block;margin-top:10px">
        <span style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--ink-2);font-weight:600">אחוז הצבעה<b class="num">${(t * 100).toFixed(0)}%</b></span>
        <input type="range" min="35" max="95" step="1" value="${(t * 100).toFixed(0)}" data-sec="${s.id}" data-kind="turnout" style="width:100%;accent-color:${s.color}"></label>
      <p style="margin:12px 0 0;color:var(--ink-3);font-size:.78rem">${esc(s.turnoutNote ? s.turnoutNote + " " : "")}${esc(s.growthNote)}</p>
      <span class="src">מקור: <a href="${esc(D.sources[s.src].url)}" target="_blank" rel="noopener">${esc(D.sources[s.src].name)} ↗</a></span>
    </article>`;
  }).join("");
}

/* ============================================================
   9. איור הכנסת (וקטורי, מקורי)
   ============================================================ */
const KNESSET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 460" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
<g fill="none" stroke="currentColor" stroke-linecap="square">
<g stroke-width="2" opacity=".55"><path d="M120 452h1360M170 436h1260M220 420h1160M270 404h1060"/></g>
<g stroke-width="2.6"><path d="M330 404V196h940v208"/><path d="M300 196h1000v-26H300z"/><path d="M318 170l40-38h884l40 38"/></g>
<g stroke-width="2.2" opacity=".9"><path d="M372 404V214M424 404V214M476 404V214M528 404V214M580 404V214M632 404V214M684 404V214M736 404V214M788 404V214M840 404V214M892 404V214M944 404V214M996 404V214M1048 404V214M1100 404V214M1152 404V214M1204 404V214"/></g>
<path d="M330 214h940" stroke-width="2.2" opacity=".7"/>
<g stroke-width="1.4" opacity=".45"><path d="M560 404V236h480v168M560 236h480M560 290h480M560 344h480"/><path d="M640 404V236M720 404V236M800 404V236M880 404V236M960 404V236"/></g>
<g stroke-width="2.2" opacity=".8"><path d="M330 404V268H196v136M196 268l30-24h104M1270 404V268h134v136M1404 268l-30-24h-104"/></g>
<g stroke-width="2" opacity=".65"><path d="M250 244V96M1350 244V96"/><path d="M250 106h54v30h-54M1350 106h-54v30h54"/></g>
<g stroke-width="1" opacity=".25"><path d="M0 404h196M1404 404h196M0 452h120M1480 452h120"/></g>
</g></svg>`;

/* ============================================================
   10. מקורות
   ============================================================ */
function renderSources() {
  const list = [
    ["ועדת הבחירות המרכזית — תוצאות הכנסת ה־25", "https://votes25.bechirot.gov.il/"],
    ["IFES Election Guide — התוצאות הרשמיות המלאות", "https://www.electionguide.org/elections/id/3970/"],
    ["המכון הישראלי לדמוקרטיה — המגזר הערבי בבחירות 2022", "https://en.idi.org.il/articles/47986"],
    ["המכון הישראלי לדמוקרטיה — הצבעה לפי הגדרה דתית", "https://www.idi.org.il/articles/64803"],
    ["המכון הישראלי לדמוקרטיה — חרדים בישראל 2050", "https://en.idi.org.il/articles/63385"],
    ["מרכז טאוב — ישראל 2025: צומת דמוגרפי", "https://www.taubcenter.org.il/en/research/snr-2025-demography/"],
    ["מועצת יש״ע — תוצאות ביהודה, שומרון ובקעת הירדן", "https://myesha.org.il/?CategoryID=251&ArticleID=10295"],
    ["דבר — תוצאות הבחירות לפי מצב כלכלי", "https://www.davar1.co.il/407506/"],
    ["וואלה — תוצאות אמת לפי יישובים", "https://elections.walla.co.il/item/3538147"],
    ["Times of Israel — ניתוח פערי הקולות בין הגושים", "https://www.timesofisrael.com/netanyahu-won-8-seat-majority-over-his-opponents-despite-near-parity-in-raw-votes/"]
  ];
  const html = list.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener"><span>${esc(n)}</span><span aria-hidden="true">↗</span></a>`).join("");
  $("#footer-sources").innerHTML = html;
  $("#method-sources").innerHTML = list.map(([n, u]) =>
    `<a class="card pad" href="${esc(u)}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;justify-content:space-between;gap:14px;align-items:center">
      <span style="font-size:.9rem;font-weight:600">${esc(n)}</span><span aria-hidden="true" style="color:var(--navy)">↗</span></a>`).join("");
}

/* ============================================================
   11. ליל הבחירות — מדגם ותוצאות אמת
   ============================================================ */
async function refreshLiveResults(force = false) {
  if (!force && !["live", "results"].includes(S.view)) return;
  try {
    if (window.__BAROMETER_DATA__) {
      S.live = window.__BAROMETER_DATA__["data/live-results.json"] || { status: "waiting", events: [] };
    } else {
      const res = await fetch(`data/live-results.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("data/live-results.json");
      S.live = await res.json();
    }
    if (S.view === "live") renderLiveResults();
    if (S.view === "results") renderOfficialResults();
  } catch (e) {
    S.live = S.live || { status: "waiting", sourceName: "טרם חובר מקור נתונים", events: [] };
    if (S.view === "live") renderLiveResults();
    if (S.view === "results") renderOfficialResults();
  }
}

function livePartyMeta(row = {}) {
  const id = normId(row.id || "");
  const alignment = alignOf({ id, alignment: row.alignment });
  if (row.name) return { name: row.name, logo: row.logoUrl || "", alignment };
  const fromPolls = S.cur?.polls?.flatMap(p => p.parties || []).find(p => normId(p.id) === id);
  if (fromPolls) return { name: fromPolls.name, logo: fromPolls.logoUrl, alignment: alignOf(fromPolls) };
  return { name: row.id || "לא ידוע", logo: "", alignment };
}

function liveSource() {
  const live = S.live || {};
  const actual = live.actual || {};
  const sample = live.sample || {};
  if ((actual.parties || []).length) return { kind: "actual", he: "תוצאות אמת", data: actual, parties: actual.parties || [] };
  if ((sample.parties || []).length) return { kind: "sample", he: "מדגם", data: sample, parties: sample.parties || [] };
  return { kind: "waiting", he: "ממתינים לנתונים", data: {}, parties: [] };
}

function liveBlocCounts(parties) {
  const counts = Object.fromEntries(Object.keys(BLOCS).map(k => [k, 0]));
  parties.forEach(p => {
    const m = livePartyMeta(p);
    const n = Number(p.mandates ?? p.seats ?? 0);
    counts[m.alignment || "Unknown"] += isFinite(n) ? n : 0;
  });
  return counts;
}

function renderLiveResults() {
  const live = S.live || {};
  const src = liveSource();
  const parties = src.parties;
  const hasData = parties.length > 0;
  const counted = Number(live.actual?.countedPct ?? live.counting?.countedPct ?? 0);
  const updated = live.updatedAt || src.data.updatedAt || src.data.publishedAt || live.generatedAt;
  const sourceName = live.sourceName || src.data.sourceName || "טרם חובר מקור נתונים";

  $("#live-status").innerHTML = `
    <div class="live-phase ${esc(src.kind)}"><span></span><b>${esc(src.he)}</b><em>${hasData ? "נתונים פעילים" : "מצב המתנה"}</em></div>
    <div><b>${updated ? heDate(updated) : "—"}</b><span>עדכון אחרון</span></div>
    <div><b>${counted ? pct(counted) : "—"}</b><span>קלפיות/קולות שנספרו</span></div>
    <div><b>${esc(sourceName)}</b><span>מקור נתונים</span></div>`;

  $("#live-main-title").textContent = hasData ? src.he : "הדף מוכן לרגע המדגם";
  $("#live-main-note").textContent = hasData
    ? (src.kind === "actual" ? "החלוקה מתעדכנת לפי הספירה בפועל." : "תמונת המנדטים הראשונה של הערב.")
    : "ברגע ש־data/live-results.json יתמלא, התרשימים והטבלאות יופיעו כאן.";

  if (!hasData) {
    $("#live-hemi").innerHTML = `<div class="live-empty"><b>אין עדיין נתוני מדגם או אמת</b><span>המסגרת מוכנה לחיבור מקור.</span></div>`;
    $("#live-blocbar").innerHTML = "";
    $("#live-legend").innerHTML = "";
    $("#live-party-rows").innerHTML = `<div class="empty">ברגע שיוזנו מפלגות, תופיע כאן טבלת המנדטים והקולות.</div>`;
  } else {
    const rows = parties
      .map(p => ({ ...p, mandates: Number(p.mandates ?? p.seats ?? 0), meta: livePartyMeta(p) }))
      .sort((a, b) => b.mandates - a.mandates);
    const blocSeats = liveBlocCounts(rows);
    const order = BLOC_ORDER.filter(k => blocSeats[k] > 0);
    const items = [];
    order.forEach(al => rows.filter(p => p.meta.alignment === al).forEach(p =>
      items.push({ color: BLOCS[al].color, count: Math.round(p.mandates), key: p.id, label: `${p.meta.name} · ${p.mandates}` })));
    $("#live-hemi").innerHTML = hemicycleSVG(items, { aria: "מפת המנדטים בליל הבחירות" });
    $("#live-blocbar").innerHTML = blocBarHTML(order.map(k => ({ count: blocSeats[k], color: BLOCS[k].color, label: `${BLOCS[k].he}: ${blocSeats[k]}` })));
    $("#live-legend").innerHTML = order.map(k =>
      `<span style="display:inline-flex;align-items:center;gap:8px;font-size:.83rem"><i style="width:11px;height:11px;border-radius:3px;background:${BLOCS[k].color}"></i><b class="num">${r1(blocSeats[k])}</b> ${esc(BLOCS[k].he)}</span>`).join("");
    $("#live-party-rows").innerHTML = rows.map(p => {
      const col = BLOCS[p.meta.alignment]?.color || BLOCS.Unknown.color;
      const votes = p.votes != null ? `${fmt(p.votes)} קולות` : (p.pct != null ? pct(p.pct) : "מדגם מנדטים");
      const pctText = p.pct != null && p.votes != null ? ` · ${pct(p.pct)}` : "";
      return resultRowHTML({ meta: p.meta, value: p.mandates, color: col, sub: votes + pctText, id: p.id });
    }).join("");
  }

  const valid = live.actual?.validVotes ?? live.counting?.validVotes;
  const invalid = live.actual?.invalidVotes ?? live.counting?.invalidVotes;
  const traffic = live.traffic || {};
  $("#live-clock").innerHTML = `
    <div class="live-big">${updated ? heDate(updated) : "—"}</div>
    <p>${esc(live.statusText || (hasData ? "הנתונים האחרונים נטענו מהקובץ המתעדכן." : "ממתינים לפרסום המדגם או לחיבור מקור נתונים."))}</p>`;
  $("#live-counting").innerHTML = `
    <div class="live-meter"><i style="--w:${clamp(counted)}%"></i></div>
    <div class="calcline"><span>שיעור ספירה</span><b class="num">${counted ? pct(counted) : "—"}</b></div>
    <div class="calcline"><span>קולות כשרים</span><b class="num">${valid != null ? fmt(valid) : "—"}</b></div>
    <div class="calcline"><span>קולות פסולים</span><b class="num">${invalid != null ? fmt(invalid) : "—"}</b></div>`;
  $("#live-traffic").innerHTML = `
    <div class="calcline"><span>צופים עכשיו</span><b class="num">${traffic.activeViewers != null ? fmt(traffic.activeViewers) : "—"}</b></div>
    <div class="calcline"><span>צפיות היום</span><b class="num">${traffic.todayViews != null ? fmt(traffic.todayViews) : "—"}</b></div>
    <p style="margin:12px 0 0;color:var(--ink-3);font-size:.82rem">מקור: ${esc(traffic.sourceName || "טרם חובר שירות אנליטיקה")}</p>`;

  const events = live.events || [];
  $("#live-feed").innerHTML = events.length ? events.map(ev =>
    `<article><time>${esc(ev.time || "")}</time><div><b>${esc(ev.title || "")}</b><p>${esc(ev.text || "")}</p></div></article>`).join("")
    : `<div class="empty">עדיין אין אירועים בציר הזמן.</div>`;
}

function renderOfficialResults() {
  const live = S.live || {};
  const actual = live.actual || {};
  const parties = actual.parties || [];
  const counted = Number(actual.countedPct ?? live.counting?.countedPct ?? 0);
  const updated = actual.updatedAt || live.updatedAt;
  const sourceName = actual.sourceName || live.sourceName || "טרם חובר מקור נתונים";
  const valid = actual.validVotes ?? live.counting?.validVotes;
  const invalid = actual.invalidVotes ?? live.counting?.invalidVotes;

  $("#results-status").innerHTML = `
    <div class="live-phase actual"><span></span><b>תוצאות אמת</b><em>${parties.length ? "ספירה פעילה" : "ממתינים לספירה"}</em></div>
    <div><b>${updated ? heDate(updated) : "—"}</b><span>עדכון אחרון</span></div>
    <div><b>${counted ? pct(counted) : "—"}</b><span>קלפיות/קולות שנספרו</span></div>
    <div><b>${esc(sourceName)}</b><span>מקור נתונים</span></div>`;

  $("#results-title").textContent = parties.length ? "חלוקת המנדטים בספירה" : "ממתינים לתוצאות אמת";
  $("#results-note").textContent = parties.length ? "רק נתוני אמת מהקובץ המתעדכן, ללא מדגמים." : "כאשר יגיעו תוצאות אמת, הן יופיעו כאן.";
  $("#results-counting").innerHTML = `
    <div class="live-meter"><i style="--w:${clamp(counted)}%"></i></div>
    <div class="calcline"><span>שיעור ספירה</span><b class="num">${counted ? pct(counted) : "—"}</b></div>
    <div class="calcline"><span>קולות כשרים</span><b class="num">${valid != null ? fmt(valid) : "—"}</b></div>
    <div class="calcline"><span>קולות פסולים</span><b class="num">${invalid != null ? fmt(invalid) : "—"}</b></div>`;

  if (!parties.length) {
    $("#results-hemi").innerHTML = `<div class="live-empty"><b>אין עדיין תוצאות אמת</b><span>הדף יופעל כשנתוני הספירה ייכנסו.</span></div>`;
    $("#results-blocbar").innerHTML = "";
    $("#results-legend").innerHTML = "";
    $("#results-party-rows").innerHTML = `<div class="empty">טרם התקבלו נתוני מפלגות מהספירה הרשמית.</div>`;
    return;
  }

  const rows = parties
    .map(p => ({ ...p, mandates: Number(p.mandates ?? p.seats ?? 0), meta: livePartyMeta(p) }))
    .sort((a, b) => b.mandates - a.mandates);
  const blocSeats = liveBlocCounts(rows);
  const order = BLOC_ORDER.filter(k => blocSeats[k] > 0);
  const items = [];
  order.forEach(al => rows.filter(p => p.meta.alignment === al).forEach(p =>
    items.push({ color: BLOCS[al].color, count: Math.round(p.mandates), key: p.id, label: `${p.meta.name} · ${p.mandates}` })));
  $("#results-hemi").innerHTML = hemicycleSVG(items, { aria: "מפת תוצאות האמת" });
  $("#results-blocbar").innerHTML = blocBarHTML(order.map(k => ({ count: blocSeats[k], color: BLOCS[k].color, label: `${BLOCS[k].he}: ${blocSeats[k]}` })));
  $("#results-legend").innerHTML = order.map(k =>
    `<span style="display:inline-flex;align-items:center;gap:8px;font-size:.83rem"><i style="width:11px;height:11px;border-radius:3px;background:${BLOCS[k].color}"></i><b class="num">${r1(blocSeats[k])}</b> ${esc(BLOCS[k].he)}</span>`).join("");
  $("#results-party-rows").innerHTML = rows.map(p => {
    const col = BLOCS[p.meta.alignment]?.color || BLOCS.Unknown.color;
    const votes = p.votes != null ? `${fmt(p.votes)} קולות` : "אין עדיין קולות";
    const pctText = p.pct != null ? ` · ${pct(p.pct)}` : "";
    return resultRowHTML({ meta: p.meta, value: p.mandates, color: col, sub: votes + pctText, id: p.id });
  }).join("");
}

/* ============================================================
   12. ניתוב וכרטיסיות
   ============================================================ */
const VIEWS = { home:"", polls:"polls", e2022:"2022", crossover:"crossover", live:"live", results:"results", haredi:"haredi", regions:"regions", demography:"demography", method:"method" };
const rendered = {};

function show(view) {
  if (!VIEWS.hasOwnProperty(view)) view = "home";
  S.view = view;
  $$(".view").forEach(v => v.classList.toggle("on", v.id === "view-" + view));
  $$(".tab").forEach(t => t.setAttribute("aria-current", t.dataset.view === view ? "page" : "false"));
  if (view === "haredi" && rendered[view]) renderHaredi();
  if (view === "polls" && rendered[view]) renderPolls();
  if (!rendered[view]) {
    try {
      if (view === "home") renderHome();
      if (view === "polls") renderPolls();
      if (view === "e2022") render2022();
      if (view === "crossover") renderCrossover();
      if (view === "live") renderLiveResults();
      if (view === "results") renderOfficialResults();
      if (view === "haredi") renderHaredi();
      if (view === "regions") renderRegions();
      if (view === "demography") renderDemography();
      if (view === "method") render2022();
      rendered[view] = true;
    } catch (e) { console.error(e); }
  }
  if (view === "live" || view === "results") refreshLiveResults(true);
  const t = { home:"התחזית", polls:"הסקרים האחרונים", e2022:"מדד אמינות המכונים", crossover:"כמה עברו צד", live:"ליל הבחירות", results:"תוצאות אמת", haredi:"בנק הקולות החרדי", regions:"פילוח אזורי", demography:"התחזית היבשה", method:"מתודולוגיה" }[view];
  document.title = `${t} · ברומטר`;
  window.scrollTo({ top: 0, behavior: rendered[view] ? "auto" : "auto" });
}

function routeFromHash() {
  const h = (location.hash || "#/").replace(/^#\/?/, "");
  const view = Object.keys(VIEWS).find(k => VIEWS[k] === h) || "home";
  show(view);
}

/* ============================================================
   13. אירועים
   ============================================================ */
function syncMastheadHeight() {
  const m = $(".masthead");
  if (m) document.documentElement.style.setProperty("--masthead-h", m.offsetHeight + "px");
}

function wire() {
  wireExploration();
  window.addEventListener("hashchange", routeFromHash);
  const mh = $(".masthead");
  if (mh && window.ResizeObserver) new ResizeObserver(syncMastheadHeight).observe(mh);
  syncMastheadHeight();
  window.addEventListener("resize", syncMastheadHeight);

  $$("[data-mode]").forEach(b => b.addEventListener("click", () => {
    S.mode = b.dataset.mode;
    $$("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderHome();
  }));
  $("#home-history").addEventListener("change", e => { S.homeHistory = e.target.value; renderHome(); });

  $$("[data-scen]").forEach(b => b.addEventListener("click", () => {
    S.scen = b.dataset.scen;
    $$("[data-scen]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    render2022();
  }));

  $$("[data-pollview]").forEach(b => b.addEventListener("click", () => {
    S.pollView = b.dataset.pollview;
    $$("[data-pollview]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#polls-cards").hidden = S.pollView !== "cards";
    $("#polls-compare").hidden = S.pollView !== "compare";
    $("#polls-average").hidden = S.pollView !== "average";
  }));

  ["#poll-firm", "#poll-outlet"].forEach(s => $(s).addEventListener("change", renderPolls));
  $("#calib-switch").addEventListener("click", e => {
    const b = e.target.closest("[data-calib]");
    if (!b) return;
    S.calibYear = Number(b.dataset.calib);
    if (!counterfactualAvailable()) S.scen = "actual";
    render2022();
  });
  $("#arch-firm").addEventListener("change", renderArchive);
  $("#arch-q").addEventListener("input", renderArchive);

  $("#arch-table").addEventListener("click", e => {
    const b = e.target.closest("[data-poll]"); if (b) openPoll(Number(b.dataset.poll));
  });
  document.addEventListener("click", e => {
    const f = e.target.closest("[data-firm]");
    if (f && !e.target.closest("a")) openFirm(f.dataset.firm);
  });
  document.addEventListener("keydown", e => {
    const f = e.target.closest?.("[data-firm][role=button]");
    if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openFirm(f.dataset.firm); }
  });
  $("#dlg .dclose").addEventListener("click", () => $("#dlg").close());
  $("#dlg").addEventListener("click", e => { if (e.target === $("#dlg")) $("#dlg").close(); });

  $("#map-svg").addEventListener("click", e => {
    const g = e.target.closest("[data-loc]"); if (!g) return;
    S.selectedLoc = Number(g.dataset.loc); renderLocDetail();
  });
  $("#map-svg").addEventListener("keydown", e => {
    const g = e.target.closest("[data-loc]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); S.selectedLoc = Number(g.dataset.loc); renderLocDetail(); }
  });

  $("#demo-controls").addEventListener("change", e => {
    const el = e.target; if (!el.dataset.sec) return;
    const sec = el.dataset.sec, kind = el.dataset.kind, v = Number(el.value);
    S.demoOverrides[sec] ||= {};
    S.demoOverrides[sec][kind] = kind === "growth" ? v / 100 : v / 100;
    renderDemography();
    $(`#demo-controls [data-sec="${CSS.escape(sec)}"][data-kind="${CSS.escape(kind)}"]`)?.focus();
  });
  $("#demo-reset").addEventListener("click", () => { S.demoOverrides = {}; renderDemography(); });

  $("#print-btn")?.addEventListener("click", () => window.print());

  /* סוגר את תפריט "עוד" אחרי בחירת לשונית */
  $(".nav-more")?.addEventListener("click", e => {
    if (e.target.closest(".nav-menu .tab")) $(".nav-more").open = false;
  });
}

/* ============================================================
   14. אתחול
   ============================================================ */

/* קובצי ה-data מתעדכנים פעמיים ביום מהבוט, אבל ה-URL שלהם קבוע — הם לא
   מקבלים חותמת ?v= כמו שאר הנכסים. GitHub Pages מגיש אותם עם
   max-age=600, ולשונית שנשארה פתוחה לא מושכת אותם שוב כלל. התוצאה היא
   שסקר חדש כבר עלה לאתר אבל הגולש עדיין רואה את הקודם.
   cache: "no-cache" מאלץ אימות מול השרת בכל טעינה — לא מדובר בהורדה
   מחדש: אם הקובץ לא השתנה חוזר 304 ריק והמטמון המקומי משמש כרגיל. */
async function loadJSONOptional(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function boot() {
  try {
    const [hist, cur, firms, regions, demo, haredi, hist2021] = await Promise.all(
      ["data/historical-polls.json", "data/current-polls.json", "data/pollsters.json", "data/regions.json", "data/demographics.json", "data/haredi.json"]
        .map(u => (window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u]) : fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u); return r.json(); })))
        .concat(window.__BAROMETER_DATA__ ? [Promise.resolve(window.__BAROMETER_DATA__["data/historical-polls-2021.json"] || null)] : [loadJSONOptional("data/historical-polls-2021.json")]));
    const leaders = window.__BAROMETER_DATA__ ? (window.__BAROMETER_DATA__["data/leaders.json"] || null) : await loadJSONOptional("data/leaders.json");
    const forecastHistory = window.__BAROMETER_DATA__ ? (window.__BAROMETER_DATA__["data/forecast-history.json"] || null) : await loadJSONOptional("data/forecast-history.json");
    Object.assign(S, { hist, firms, regions, demo, haredi, leaders: leaders?.photos || {}, forecastHistory });
    /* מערכות הבחירות שהמדד מכויל עליהן. הראשונה היא ברירת המחדל של עמוד הדיוק. */
    S.elections = [
      { year: 2022, election: "הכנסת ה־25", data: hist, stats: scoreFirms(hist) },
      ...(hist2021?.polls?.length ? [{ year: 2021, election: hist2021.meta?.election || "הכנסת ה־24", data: hist2021, stats: scoreFirms(hist2021) }] : [])
    ];
    S.calibYear = S.elections[0].year;
    S.calibrations = S.elections.map(e => {
      const attributed = e.data.polls.filter(p => p.firm).length;
      const missing = e.data.polls.length - attributed;
      return { year: e.year, election: e.election, status: e.year === 2021 ? 'pending' : "active", polls: attributed,
        note: missing ? `${attributed} מתוך ${e.data.polls.length} סקרים משויכים למכון` : "כל הסקרים משויכים למכון" };
    });
    const win = inWindow(cur.polls, cur.generatedAt);
    S.cur = { ...cur, polls: win.polls };
    // 2021 attribution was disputed; keep the archive visible but quarantine its weights until official reconciliation.
    S.stats = combineCalibrations(S.elections.filter(e=>e.year!==2021));
    S.counterStats = scoreFirms(hist, COUNTERFACTUAL);
    S.forecastPolls = recentForForecast(S.cur.polls);
    S.series = buildSeries(S.forecastPolls);

    $("#hero-art").innerHTML = KNESSET_SVG;
    $("#stamp-updated").textContent = `עודכן ${heDate(cur.generatedAt)}`;

    renderSources();
    wire();
    await refreshLiveResults(true);
    renderElectionTimer();
    S.countdownTimer = setInterval(() => { if (!document.hidden) renderElectionTimer(); }, 1000);
    S.liveTimer = setInterval(refreshLiveResults, 60000);
    scheduleAnec();
    routeFromHash();
  } catch (err) {
    console.error(err);
    $("#main").insertAdjacentHTML("afterbegin",
      `<div class="wrap"><div class="errbox"><b>לא הצלחנו לטעון את נתוני הסקרים.</b><br>ודאו שהאתר מוגש משרת (לא פתיחת קובץ ישירה) ורעננו את הדף.</div></div>`);
  }
}

if (typeof module !== "undefined" && module.exports)
  module.exports = { scoreFirms, combineCalibrations, histBlocs, buildSeries, forecast, largestRemainder, baderOfer, histBlocs, structuralFix, COUNTERFACTUAL };
if (typeof document !== "undefined") boot();

/* ============================================================
   15. אנקדוטות — עובדות שנגזרות מהנתונים עצמם
   ============================================================ */
const SCALE = [
  { n: 1452350, t: "כל האוכלוסייה החרדית בישראל" },
  { n: 480000,  t: "כל תושבי תל אביב–יפו" },
  { n: 290000,  t: "כל תושבי חיפה" },
  { n: 232000,  t: "כל תושבי אשדוד" },
  { n: 215000,  t: "כל תושבי באר שבע" },
  { n: 213000,  t: "כל תושבי בני ברק" },
  { n: 170000,  t: "כל תושבי רמת גן" },
  { n: 110000,  t: "כל תושבי כפר סבא" },
  { n: 100000,  t: "כל תושבי הרצליה" },
  { n: 62000,   t: "כל תושבי נהריה" },
  { n: 31700,   t: "אצטדיון טדי מלא" },
  { n: 30800,   t: "אצטדיון סמי עופר מלא" }
];
const scaleOf = v => {
  const hit = SCALE.filter(x => x.n <= v * 1.12 && x.n >= v * .88).sort((a, b) => Math.abs(a.n - v) - Math.abs(b.n - v))[0];
  if (hit) return `בערך ${hit.t}`;
  const big = SCALE.filter(x => x.n < v).sort((a, b) => b.n - a.n)[0];
  return big ? `פי ${(v / big.n).toFixed(1)} מ${big.t}` : "";
};

const seatCost = () => S.regions.national.valid / 120;
const votesOf = seats => seats * seatCost();

function buildAnecdotes() {
  return topPartyIds(Infinity).map(id => {
    const polls = S.cur.polls.filter(p => p.parties.some(x => normId(x.id) === id));
    const values = polls.map(p => p.parties.filter(x => normId(x.id) === id).reduce((n,x)=>n+x.mandates,0));
    return { title: partyMeta(id).name,
      text: `טווח של <b>${Math.min(...values)}–${Math.max(...values)} מנדטים</b> ב־${polls.length} סקרים בחלון הנוכחי. הפער בין סקרים אינו מעיד כשלעצמו על שינוי בהצבעה.`,
      meta: "מקור: הסקרים במאגר · כל המפלגות מוצגות לפי אותו כלל" };
  });
}

function scheduleAnec() { clearInterval(S.anecTimer); }

function renderAnecdote() {
  if (!S.anecdotes) S.anecdotes = buildAnecdotes();
  const list = S.anecdotes;
  if (!list.length) { $("#anecdote").hidden = true; return; }
  if (S.anecIdx == null) S.anecIdx = Math.floor(Date.now() / 864e5 / 3) % list.length;
  const i = ((S.anecIdx % list.length) + list.length) % list.length;
  const a = list[i];
  $("#anec-title").textContent = a.title;
  $("#anec-text").innerHTML = a.text;
  $("#anec-meta").textContent = a.meta;
  $("#anec-count").textContent = `${i + 1} / ${list.length}`;
}

/* ============================================================
   16. עמוד בנק הקולות החרדי
   ============================================================ */
function harediState() {
  const H = S.haredi, D = S.demo;
  const sec = D.sectors.find(x => x.id === "haredi");
  const years = D.meta.years;
  const eligible2026 = sec.eligible2022 * Math.pow(1 + (S.harGrowth ?? sec.growth * 100) / 100, years);
  const turnout = (S.harTurnout ?? H.turnout.harediCities2022) / 100;
  const loyalty = (S.harLoyalty ?? H.loyalty[0].harediLists) / 100;
  const model = runDemoModel(years);
  const cost = model.totalValid / 120;
  const cast = eligible2026 * turnout;
  const toHaredi = cast * loyalty;
  const seatsFromSector = toHaredi / cost;
  const shasMix = D.parties2022.find(p => p.id === "shas").mix;
  const shasOutside = (model.votes.shas * (1 - shasMix.haredi)) / cost;
  return { H, sec, eligible2026, turnout, loyalty, cost, cast, toHaredi, seatsFromSector, shasOutside, total: seatsFromSector + shasOutside, model };
}

function renderHaredi() {
  const st = harediState(), H = S.haredi;

  /* עמודי היסוד */
  $("#haredi-pillars").innerHTML = [
    { c: "#5B4B8A", big: fmt(H.population.size), unit: "חרדים בישראל",
      p: `<b>${H.population.shareOfPopulation}%</b> מהאוכלוסייה ו־<b>${H.population.shareOfJews}%</b> מהיהודים — לעומת ${H.population.shareOfJews2009}% ב־2009. גדלה ב־<b>${H.population.growth}%</b> בשנה, פי ${(H.population.growth / H.population.growthNonHarediJews).toFixed(1)} מהיהודים הלא־חרדים. גיל חציוני ${H.population.medianAge} מול ${H.population.medianAgeOtherJews}.`,
      s: H.population.src },
    { c: "#17457F", big: pct(H.turnout.harediCities2022), unit: "שיעור הצבעה",
      p: `בערים החרדיות (${H.turnout.cities.join(", ")}), לעומת ${pct(H.turnout.national2022)} ארצי ו־${pct(H.turnout.arab2022)} ביישובים הערביים. ב־2021 נמדד ${pct(H.turnout.harediCities2021)}. אלה נתונים משתי מערכות בחירות.`,
      s: H.turnout.src },
    { c: "#B8862B", big: pct(H.loyalty[0].harediLists), unit: "מצביעים לרשימות החרדיות",
      p: `מכלל המצביעים החרדים ב־2022. רק ${pct(H.loyalty[0].religiousZionism)} הצביעו לציונות הדתית. ב־2021 המספר היה אפילו גבוה יותר — ${pct(H.loyalty[1].harediLists)}, מתוכם ${pct(H.loyalty[1].utj)} לג׳ ו־${pct(H.loyalty[1].shas)} לש״ס.`,
      s: H.loyalty[0].src }
  ].map(x => `<article class="pillar" style="--c:${x.c}">
      <div class="big"><b class="num">${x.big}</b><span>${esc(x.unit)}</span></div>
      <p>${x.p}</p>
      <span class="src">מקור: <a href="${esc(H.sources[x.s].url)}" target="_blank" rel="noopener">${esc(H.sources[x.s].name)} ↗</a></span>
    </article>`).join("");

  /* מחשבון */
  $("#haredi-calc").innerHTML = `
    <p class="kicker">החישוב, שקוף</p>
    <h3 style="margin:4px 0 14px">מהאוכלוסייה אל המנדט</h3>
    <div class="calcline"><span>בעלי זכות בחירה חרדים ב־${S.demo.meta.targetYear}</span><b class="num">${fmt(st.eligible2026)}</b></div>
    <div class="calcline"><span>× שיעור הצבעה</span><b class="num">${pct(st.turnout * 100)}</b></div>
    <div class="calcline"><span>= קולות שהוטלו</span><b class="num">${fmt(st.cast)}</b></div>
    <div class="calcline"><span>× נאמנות לרשימות החרדיות</span><b class="num">${pct(st.loyalty * 100)}</b></div>
    <div class="calcline"><span>= קולות לש״ס ולג׳ מהמגזר</span><b class="num">${fmt(st.toHaredi)}</b></div>
    <div class="calcline"><span>÷ מחיר מנדט (${fmt(st.cost)})</span><b class="num">${r1(st.seatsFromSector)} מנדטים</b></div>
    <div class="calcline"><span>+ מצביעי ש״ס שאינם חרדים (מסורתיים ודתיים)</span><b class="num">${r1(st.shasOutside)} מנדטים</b></div>
    <div class="calcout"><b class="num">${r1(st.total)}</b><span>מנדטים לש״ס וליהדות התורה — לפני שהסתכלנו על סקר אחד</span></div>
    <label class="slider"><span>גידול שנתי של בעלי זכות הבחירה<b>${r1(S.harGrowth ?? st.sec.growth*100)}%</b></span><input id="har-growth" type="range" min="0" max="6" step="0.1" value="${S.harGrowth ?? st.sec.growth*100}"></label><label class="slider"><span>שיעור הצבעה במגזר<b class="num">${pct(st.turnout * 100)}</b></span>
      <input type="range" min="45" max="95" step="0.5" value="${(st.turnout * 100).toFixed(1)}" id="har-turnout" style="accent-color:#17457F"></label>
    <label class="slider"><span>נאמנות לרשימות החרדיות<b class="num">${pct(st.loyalty * 100)}</b></span>
      <input type="range" min="55" max="95" step="0.5" value="${(st.loyalty * 100).toFixed(1)}" id="har-loyalty" style="accent-color:#B8862B"></label>
    <button class="btn ghost" type="button" id="har-reset" style="margin-top:14px">חזרה לערכים שנמדדו</button>`;

  /* מה היה צריך לקרות */
  const est = forecast(S.mode);
  const pollSum = (est.raw.shas || 0) + (est.raw.yahadut_hatora || 0);
  const needSector = Math.max(0, pollSum - st.shasOutside);
  const needTurnout = 100 * (needSector * st.cost) / (st.eligible2026 * st.loyalty);
  const needLoyalty = 100 * (needSector * st.cost) / (st.eligible2026 * st.turnout);
  const floors = H.meta.floors.shas + H.meta.floors.utj;
  const modelSum = (st.model.seats.shas || 0) + (st.model.seats.utj || 0);
  $("#haredi-verdict").innerHTML = `<p class="kicker">השוואת הנחות</p><h3>תרחיש דמוגרפי מול ממוצע הסקרים</h3><p>ממוצע הסקרים לש״ס וליהדות התורה: <b>${r1(pollSum)}</b> מנדטים. התרחיש לפי ההנחות שנבחרו: <b>${r1(st.total)}</b> מנדטים.</p><p class="sec-note">אלה שתי שיטות שונות עם הנחות ואי־ודאות שונות. הפער אינו מוכיח איזו מהן מדויקת יותר. תחזית הברומטר בעמוד הראשי היא הנחה נפרדת; המחשבון כאן אינו מוכיח רצפת מנדטים.</p>`;

  /* היסטוריה */
  renderHaredHistory();

  /* למה מפספסים */
  $("#haredi-why").innerHTML = `<h3>שלוש מגבלות, לא אג׳נדה</h3>
    <div class="grid" style="gap:12px;margin-top:14px">
      <div><b>1. מדגם קטן מדי.</b> <span style="color:var(--ink-2)">סקר טלוויזיה טיפוסי דוגם כ־${H.polling.sampleSize} נשאלים. טעות הדגימה שלו עולה על ${H.polling.marginOfError}% — גדולה מאחוז החסימה עצמו (${H.polling.threshold}%).</span></div>
      <div><b>2. הנדגם לא עונה.</b> <span style="color:var(--ink-2)">חרדים מחוברים פחות לתקשורת הכללית ונענים פחות לסקרים, במיוחד לסקרי אינטרנט. אותה בעיה בדיוק קיימת מול בוחרים ערבים ועולים מברית המועצות לשעבר.</span></div>
      <div><b>3. השקלול מגדיל את השגיאה.</b> <span style="color:var(--ink-2)">המכונים מתקנים תת־ייצוג במשקלות דמוגרפיים. כשמכפילים קומץ נשאלים במקדם גבוה, כל אחד מהם מזיז את התוצאה הרבה יותר ממה שהוא אמור.</span></div>
    </div>
    <span class="src">מקור: <a href="${esc(H.sources[H.polling.src].url)}" target="_blank" rel="noopener">${esc(H.sources[H.polling.src].name)} ↗</a></span>`;

  const keys = ["shas", "utj"];
  $("#haredi-gap").innerHTML = keys.map(k => {
    const mean = avg(S.hist.polls.map(p => p.p[k])), act = S.hist.actual[k];
    return `<div class="lbar" style="--c:${k === "shas" ? "#4A4A4A" : "#5B4B8A"}">
      <span>${k === "shas" ? "ש״ס" : "יהדות התורה"}</span>
      <i><b style="--w:${clamp(mean / 12 * 100)}%"></b></i>
      <span class="v" dir="ltr">${r1(mean)} → ${act}</span></div>`;
  }).join("") + `<p style="margin:10px 0 0;color:var(--ink-2);font-size:.85rem">ממוצע ${S.hist.polls.length} סקרי הכיול מול התוצאה בפועל. ש״ס פוספסה ב־<b>${r1(11 - avg(S.hist.polls.map(p => p.p.shas)))}</b> מנדטים; ג׳ נמדדה במדויק. הפער ההיסטורי אינו מוכיח מה תהיה הטעות בבחירות הבאות.</p>`;

  $("#haredi-sources").innerHTML = Object.values(H.sources).map(x =>
    `<a class="card pad" href="${esc(x.url)}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;justify-content:space-between;gap:14px;align-items:center">
      <span style="font-size:.9rem;font-weight:600">${esc(x.name)}</span><span aria-hidden="true" style="color:var(--navy)">↗</span></a>`).join("");

  /* wiring */
  const wire = (id, key) => $(id).addEventListener("change", e => { S[key] = Number(e.target.value); renderHaredi(); $(id)?.focus(); });
  wire("#har-growth", "harGrowth"); wire("#har-turnout", "harTurnout"); wire("#har-loyalty", "harLoyalty");
  $("#har-reset").addEventListener("click", () => { S.harGrowth = null; S.harTurnout = null; S.harLoyalty = null; renderHaredi(); });
}

function renderHaredHistory() {
  const H = S.haredi, rows = H.history.shas.map((x, i) => ({ y: x.y, shasV: x.v, shasS: x.s, utjV: H.history.utj[i].v, utjS: H.history.utj[i].s }));
  const W = 900, Hh = 310, m = { t: 34, r: 28, b: 42, l: 74 };
  const maxV = 470000;
  const x = i => m.l + (W - m.l - m.r) * i / (rows.length - 1);
  const y = v => m.t + (Hh - m.t - m.b) * (1 - v / maxV);
  const grid = [100000, 200000, 300000, 400000].map(v =>
    `<line x1="${m.l}" y1="${y(v)}" x2="${W - m.r}" y2="${y(v)}" stroke="#E4DFD4"/>
     <text x="${m.l - 10}" y="${y(v) + 4}" font-size="11" fill="#6C7885" font-weight="600" text-anchor="end" direction="ltr">${v / 1000}k</text>`).join("");
  const line = (key, col) => {
    const d = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[key]).toFixed(1)}`).join("");
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round"/>` +
      rows.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r[key]).toFixed(1)}" r="4.5" fill="#fff" stroke="${col}" stroke-width="2.4"/>`).join("");
  };
  const seats = (key, col, dy) => rows.map((r, i) =>
    `<text x="${x(i).toFixed(1)}" y="${(y(r[key.replace("V", "V")]) + dy).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${col}">${r[key.replace("V", "S")]}</text>`).join("");
  const xlab = rows.map((r, i) => `<text x="${x(i).toFixed(1)}" y="${Hh - 12}" text-anchor="middle" font-size="10.5" fill="#6C7885">${esc(r.y)}</text>`).join("");
  $("#haredi-history").innerHTML = `<svg class="histchart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="קולות ומנדטים של ש״ס ויהדות התורה לאורך השנים">
      ${grid}${line("shasV", "#4A4A4A")}${line("utjV", "#5B4B8A")}
      ${seats("shasV", "#4A4A4A", -12)}${seats("utjV", "#5B4B8A", 20)}${xlab}
    </svg>
    <div class="legend" style="margin-top:8px">
      <span style="display:inline-flex;align-items:center;gap:8px;font-size:.83rem"><i style="width:11px;height:11px;border-radius:3px;background:#4A4A4A"></i>ש״ס — קולות</span>
      <span style="display:inline-flex;align-items:center;gap:8px;font-size:.83rem"><i style="width:11px;height:11px;border-radius:3px;background:#5B4B8A"></i>יהדות התורה — קולות</span>
      <span style="color:var(--ink-3);font-size:.79rem">המספרים שליד הנקודות הם המנדטים בפועל</span>
    </div>`;

  $("#haredi-table").innerHTML = `<thead><tr><th>מערכת בחירות</th><th class="n">ש״ס — קולות</th><th class="n">מנדטים</th><th class="n">ג׳ — קולות</th><th class="n">מנדטים</th><th class="n">סה״כ הגוש</th></tr></thead><tbody>${
    rows.map(r => `<tr><td><strong>${esc(r.y)}</strong></td>
      <td class="n">${fmt(r.shasV)}</td><td class="n"><span class="chip">${r.shasS}</span></td>
      <td class="n">${fmt(r.utjV)}</td><td class="n"><span class="chip">${r.utjS}</span></td>
      <td class="n"><span class="chip ${r.shasS + r.utjS >= 16 ? "good" : ""}">${r.shasS + r.utjS}</span></td></tr>`).join("")}</tbody>`;
}
