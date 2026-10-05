/* ============================================================
   הברומטר — לוגיקת האתר
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
/* בוחר טקסט לבן או כהה, לפי מה שנותן ניגודיות טובה יותר על רקע בצבע נתון —
   כדי שתגי מספרים על רקע צבע המפלגה (למשל .ptile-num) יישארו קריאים גם
   למפלגות בגוון בהיר וגם בגוון כהה. */
const textOnColor = hex => {
  const h = hex.replace("#", ""), n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  const cr = (l1, l2) => (l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05));
  return cr(lum, 1) >= 4.5 || cr(lum, 1) > cr(lum, 0) ? "#fff" : "#141A21";
};
const fmt = n => new Intl.NumberFormat("he-IL").format(Math.round(n));
const heDate = iso => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("he-IL", { day:"2-digit", month:"2-digit", year:"numeric" }); };

/* צבעי הגושים כוילו לקרוא גם כטקסט על הרקע הבהיר וגם כרקע עם טקסט לבן
   (--paper וגם white); כל גוון נבחר כך שטקסט לבן עליו עובר 4.5:1. */
const BLOCS = {
  Right:   { he: "ימין",  short: "ימין",  color: "#2563B0" },
  Left:    { he: "מרכז–שמאל",  short: "מרכז–שמאל",  color: "#C0392B" },
  Haredi:  { he: "חרדים", short: "חרדים", color: "#6A5A9C" },
  Arabs:   { he: "ערבים", short: "ערבים", color: "#2A7A5E" },
  Unknown: { he: "לא משויך", short: "אחר", color: "#6B7580" }
};
/* בפס RTL הקטע הראשון במערך נופל בקצה הימני — לכן "לא משויך" באמצע,
   4th מהצד השמאלי אבל 2nd מהימין, ולא בקצה החיצוני. */
const BLOC_ORDER = ["Right", "Unknown", "Arabs", "Left"];
const HAREDI_PARTIES = new Set(["shas", "yahadut_hatora", "utj", "mifleget_hazibur_haharedi"]);
const LEGACY_BLOCS = { Coalition: "Right", Opposition: "Left", Arabs: "Arabs", Unknown: "Unknown" };
const HIST_PARTY_HE = {
  /* הכנסת ה־25 */
  likud:"הליכוד", yesh_atid:"יש עתיד", national_unity:"המחנה הממלכתי", shas:"ש״ס", labor:"העבודה",
  utj:"יהדות התורה", yisrael_beiteinu:"ישראל ביתנו", religious_zionism:"הציונות הדתית",
  hadash_taal:"חד״ש–תע״ל", meretz:"מרצ", raam:"רע״מ",
  /* הכנסת ה־22–24 (מוויקיפדיה העברית) */
  yamina:"ימינה", new_hope:"תקווה חדשה", joint_list:"הרשימה המשותפת", blue_white:"כחול לבן",
  otzma:"עוצמה יהודית", labor_gesher_meretz:"העבודה–גשר–מרצ"
};
/* דרגת אמינות לפי הציון המשוקלל של כל המערכות */
/* מכונים שמופיעים בארכיון הכיול אך אינם רשומים ב-pollsters.json */
const FIRM_HE_FALLBACK = {};
const GRADES = [["high", "אמינות גבוהה", 80], ["mid", "אמינות טובה", 75], ["low", "אמינות בינונית", -1]];
const gradeOf = score => { const g = GRADES.find(([, , min]) => score >= min); return { key: g[0], label: g[1] }; };
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
            homeView:"bars", homeHistory:"current", focusParty:"", compareIds:null, trendParty:"", pollView:"cards", avgDays:7, avgWeight:"simple", cardPoll:{}, view:"home", demoOverrides:{}, live:null, liveTimer:null, countdownTimer:null,
            calibrations:[], elections:[], calibKey:"2022", leaders:{}, anecTimer:null };

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
    if (votes[a] == null || votes[b] == null || used.has(a) || used.has(b)) return;
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

/* כללי הבחירות שמופעלים על התחזית בשלב האחרון: אחוז החסימה, 120 מנדטים
   בשיטת באדר-עופר, והסכמי העודפים. ההסכמים ל־2026 טרם נחתמו — עד הגשת
   הרשימות מניחים את הזוגות שחזרו על עצמם במערכות האחרונות. */
const ELECTION_RULES = {
  threshold: 0.0325, seats: 120,
  surplusAgreements: [["likud", "zionut_datit"], ["shas", "yahadut_hatora"], ["raam", "hadash_taal"]],
  agreementsStatus: "הנחה עד הגשת הרשימות — הזוגות שחתמו לקראת בחירות 2022; הסכם חדש יתווסף כשייחתם"
};
/* values = אומדני מנדטים (או קולות) לכל רשימה; ההקצאה אינה תלויה בסולם.
   רשימה מתחת לאחוז החסימה מושמטת וקולותיה לא נספרים; השאר — באדר-עופר. */
function allocateSeats(values, total = ELECTION_RULES.seats) {
  const votes = Object.fromEntries(Object.entries(values).filter(([, v]) => Number.isFinite(v) && v > 0.001));
  const sum = Object.values(votes).reduce((a, b) => a + b, 0);
  if (!sum) return {};
  const passing = Object.fromEntries(Object.entries(votes).filter(([, v]) => v / sum >= ELECTION_RULES.threshold));
  if (!Object.keys(passing).length) return {};
  const pairs = ELECTION_RULES.surplusAgreements.filter(([a, b]) => passing[a] != null && passing[b] != null);
  return baderOfer(passing, pairs, total);
}
/* ההסכמים שבאמת פועלים בתחזית הנוכחית (שני הצדדים עוברים את הסף) */
function activeAgreements(values) {
  const ids = new Set(Object.keys(values || {}));
  return ELECTION_RULES.surplusAgreements.filter(([a, b]) => ids.has(a) && ids.has(b));
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
const BLOC_LABELS = { netanyahu: "גוש הימין והחרדים", outgoing: "מרכז–שמאל", outside: "מחוץ לגושים" };

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
    /* עקביות: 65% יציבות גוש הימין והחרדים לאורך החודש, 35% יציבות המפלגות (ממוצע
       סטיות התקן של כל רשימה בסקרי המכון). סטיית תקן של מפלגה בודדת קטנה
       בערך פי שניים מזו של הגוש, ולכן המקדם כפול — כך שני המדדים באותו סולם. */
    const consSd = sd(blocs.map(b => b.netanyahu));
    const partySd = avg(keys.map(k => sd(polls.map(p => p.p[k] || 0))));
    const blocScore = clamp(100 - 10 * (blocAbs / 3));
    const partyScore = clamp(100 - 15 * partyMae);
    const stability = clamp(100 - 25 * consSd);
    const partyStability = clamp(100 - 50 * partySd);
    /* עם פחות מ-3 סקרים אין ממה למדוד עקביות אמיתית — סטיית תקן של מדגם
       יחיד היא 0 מתמטית, וזה נותן ציון עקביות מושלם בלי הצדקה. פחות מ-3
       סקרים מקבל רק נתח יחסי מציון העקביות (1 סקר → שליש, 2 → שני-שליש);
       דיוק בגושים ובמפלגות (90% מהציון) לא מושפע — דיוק חשוב גם ממדגם קטן. */
    const sampleConfidence = Math.min(1, polls.length / 3);
    const consistencyScore = (.65 * stability + .35 * partyStability) * sampleConfidence;
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
  elections.forEach(({ year, key, short, election, stats }) => stats.forEach(st => {
    if (!byFirm.has(st.firm)) byFirm.set(st.firm, []);
    byFirm.get(st.firm).push({ year, key, short, election, ...st });
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
const SHOW_BELOW_MIN = 2;

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
/* שם שהאתר קובע לרשימה, מעל לשם שמופיע בנתוני הסקר הגולמיים — כדי שרענון נתונים לא ידרוס אותו */
const NAME_OVERRIDE = { hendel_zeliha_party: "המילואימניקים/הכלכלית", zionut_datit: "הציונות הדתית/זהות" };
/* תחזית הברומטר השבועית (forecast-history.json → weekly) מוצגת בעמוד "כל הסקרים"
   כמו סקר, תחת המקור הזה. היא לעולם לא נכנסת לתחזית, לממוצעים או לכיול. */
const BAROMETER_SOURCE = "barometer", BAROMETER_OUTLET = "תחזית הברומטר";
/* צבע לפי משפחת המפלגה, לא לפי הגוש: רע״מ היא מפלגה ערבית (ירוק) שנספרת בגוש
   המרכז־שמאל לצורך חשבון הקואליציה. */
const PARTY_COLOR_OVERRIDE = { raam: BLOCS.Arabs.color };
const partyColor = (id, alignment) => PARTY_COLOR_OVERRIDE[normId(id)] || (BLOCS[alignment] ? BLOCS[alignment].color : "#64707C");
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
  if (sourceId === BAROMETER_SOURCE) return { firm: BAROMETER_SOURCE, outlet: BAROMETER_OUTLET, meta: { id: BAROMETER_SOURCE, he: "הברומטר", short: "ה", calibrated: false, color: "#B8862B" } };
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
/* התחזיות השבועיות (כל מוצאי שבת ב־20:00) כ"סקרים" — באותו מבנה של סקר, לתצוגה בלבד */
function barometerWeeklyPolls() {
  return (S.forecastHistory?.weekly || []).map(w => {
    const [y, m, d] = w.date.split("-");
    const ts = Date.parse(w.date + "T00:00:00Z");
    return { id: `${BAROMETER_SOURCE}-${w.week}`, barometer: true, date: `${d}.${m}.${y}`, time: w.time || "", dateTimestamp: ts, publishedAt: Date.parse(w.recordedAt) || ts,
      channelHebrewName: BAROMETER_OUTLET, sourceId: BAROMETER_SOURCE, pollster: "הברומטר",
      parties: Object.entries(w.seats || {}).map(([id, mandates]) => ({ id, name: partyMeta(id).name, logoUrl: "", mandates, alignment: partyMeta(id).alignment })) };
  }).sort((a, b) => b.dateTimestamp - a.dateTimestamp);
}

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
/* משקל בממוצע המשוקלל: לא רציף לפי הציון (בפועל תמיד בטווח צר, 70–85 —
   כמעט בלי הבדל אמיתי בין המכונים), אלא לפי הדרגה שהציון נופל בה: אמינות
   גבוהה 45%, טובה 35%, בינונית 20%. כך פער אמיתי בין דרגות משפיע בפועל
   על הממוצע המשוקלל, לא רק על הציון המוצג. הציון עצמו (firmScore) ממשיך
   להיות רציף — הוא רק לתצוגה ולקביעת הדרגה, לא לחישוב המשקל. */
const TIER_WEIGHT = { high: 0.45, mid: 0.35, low: 0.20 };
const firmWeight = meta => TIER_WEIGHT[gradeOf(firmScore(meta)).key];

/* טעות קבועה של מכון ברשימה מסוימת: בכל מערכת כיול — ממוצע סקרי המכון פחות
   התוצאה בפועל, לכל רשימה של 2026 שיש לה מקבילה במערכות הקודמות. הטעות נחשבת
   "קבועה" רק אם הופיעה בשתי מערכות לפחות, תמיד באותו כיוון, ובממוצע של מנדט
   ומעלה. הציונות הדתית ועוצמה יהודית רצו יחד ב־2021 וב־2022, ולכן נמדדות יחד. */
const HOUSE_GROUPS = {
  likud: { he: "ליכוד", members: ["likud"], ids: { all: ["likud"] } },
  shas:  { he: "ש״ס", members: ["shas"], ids: { all: ["shas"] } },
  utj:   { he: "יהדות התורה", members: ["yahadut_hatora"], ids: { all: ["utj"] } },
  ndi:   { he: "ישראל ביתנו", members: ["ndi"], ids: { all: ["yisrael_beiteinu"] } },
  raam:  { he: "רע״ם", members: ["raam"], ids: { 2021: ["raam"], 2022: ["raam"] } },
  rz:    { he: "צ״ד ועוצמה", members: ["zionut_datit", "ozma_yehudit"], together: "הציונות הדתית ועוצמה יהודית יחד", ids: { 2021: ["religious_zionism"], 2022: ["religious_zionism"] } },
  joint: { he: "המשותפת", members: ["reshima_meshutefet"], ids: { 2021: ["joint_list"], 2022: ["hadash_taal"] } }
};
const HOUSE_MIN_SEATS = 1;
function houseEffects(elections) {
  const sumOf = (p, ids) => ids.reduce((t, id) => t + (p[id] || 0), 0);
  const runs = {};
  elections.forEach(({ year, data }) => {
    const byFirm = data.polls.filter(p => p.firm).reduce((m, p) => { (m[p.firm] ||= []).push(p); return m; }, {});
    const blocIds = (data.blocs || BLOCS_2022).netanyahu;
    Object.entries(byFirm).forEach(([firm, polls]) => {
      const r = runs[firm] ||= { bloc: [] };
      r.bloc.push({ year, err: avg(polls.map(p => sumOf(p.p, blocIds))) - sumOf(data.actual, blocIds) });
      Object.entries(HOUSE_GROUPS).forEach(([g, def]) => {
        const ids = def.ids.all || def.ids[year];
        if (ids) (r[g] ||= []).push({ year, err: avg(polls.map(p => sumOf(p.p, ids))) - sumOf(data.actual, ids) });
      });
    });
  });
  const pack = list => {
    const errs = list.map(x => x.err), mean = avg(errs);
    const consistent = errs.length >= 2 && (errs.every(e => e > 0) || errs.every(e => e < 0)) && Math.abs(mean) >= HOUSE_MIN_SEATS;
    return { runs: list.slice().sort((a, b) => a.year - b.year), mean, consistent };
  };
  return Object.fromEntries(Object.entries(runs).map(([firm, r]) => [firm, {
    bloc: pack(r.bloc),
    groups: Object.fromEntries(Object.keys(HOUSE_GROUPS).filter(g => r[g]).map(g => [g, pack(r[g])]))
  }]));
}
/* נתוני הטעות הקבועה של המכון (לפי מכון הכיול שלו), אם יש לו היסטוריה */
const houseOf = meta => (meta?.calibrated && S.house?.[calibrationId(meta)]) || null;
/* הטעות הממוצעת של הענף בכל קבוצה — ממוצע הטעויות של כל המכונים שסקרו אותה */
function houseIndustry(house) {
  return Object.fromEntries(Object.keys(HOUSE_GROUPS).map(g => {
    const means = Object.values(house || {}).map(h => h.groups[g]?.mean).filter(Number.isFinite);
    return [g, means.length ? avg(means) : 0];
  }));
}
/* תיקון הטעות הקבועה: לכל מכון ולכל קבוצה — הטעות הממוצעת שלו בהיפוך, בחלק
   יחסי לכמות ההיסטוריה (n/(n+1): מערכת אחת → חצי, שתיים → שני שלישים, שלוש →
   שלושה רבעים). מכון בלי היסטוריה בקבוצה מקבל חצי מהטעות הממוצעת של הענף.
   חיובי = מוסיפים מנדטים. */
function houseCorrection(meta) {
  const own = houseOf(meta)?.groups || {};
  return Object.fromEntries(Object.keys(HOUSE_GROUPS).map(g => {
    const n = own[g]?.runs.length;
    return [g, n ? -own[g].mean * n / (n + 1) : -(S.houseIndustry?.[g] || 0) * 0.5];
  }));
}
/* תחזית הברומטר: התיקון מדייק רק את החלוקה בתוך כל גוש. כל קבוצה מקבלת את
   התיקון שלה (בקבוצה של שתי רשימות — לפי הגודל שלהן בסקר), ואז רשימות הגוש
   מתכווצות או מתרחבות יחד בחזרה לסכום הגוש בסקר עצמו — כך שסך הגושים לא
   משתנה. ש״ס, יהדות התורה ורע״ם מקובעות בתחזית (FIXED_SEATS), ולכן אינן
   מתוקנות ואינן משתתפות בחלוקה מחדש. */
const isFixedSeat = id => typeof FIXED_SEATS !== "undefined" && id in FIXED_SEATS;
function correctWithinBlocs(p) {
  const c = houseCorrection(firmOf(p.sourceId).meta);
  const parties = p.parties.map(x => ({ ...x }));
  const free = parties.filter(x => x.mandates > 0 && !isFixedSeat(normId(x.id)));
  const blocSum = () => free.reduce((m, x) => { const b = alignOf(x); m[b] = (m[b] || 0) + x.mandates; return m; }, {});
  const before = blocSum();
  Object.entries(HOUSE_GROUPS).forEach(([g, def]) => {
    if (def.members.some(isFixedSeat)) return;
    const inGroup = free.filter(x => def.members.includes(normId(x.id)));
    const tot = inGroup.reduce((t, x) => t + x.mandates, 0);
    if (tot) inGroup.forEach(x => { x.mandates = Math.max(0, x.mandates + c[g] * x.mandates / tot); });
  });
  const after = blocSum();
  free.forEach(x => { const b = alignOf(x); if (after[b] > 0) x.mandates *= before[b] / after[b]; });
  return { ...p, parties };
}
/* מה התיקון עושה בפועל לרשימות: ההפרש בין שתי חלוקות (סדרה או סקר, לפני ואחרי),
   משינוי של 0.3 מנדט ומעלה, מהגדול לקטן. ה-HTML עוטף כל מספר ב-dir="ltr", כדי
   שהסימן יישאר לפני המספר בתוך טקסט מימין לשמאל. */
function houseShiftList(fromParties, toParties) {
  const ids = [...new Set([...Object.keys(fromParties), ...Object.keys(toParties)])];
  return ids.map(id => [id, (toParties[id] || 0) - (fromParties[id] || 0)])
    .filter(([, d]) => Math.abs(d) >= 0.3).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([id, d]) => [partyMeta(id).name, `${d > 0 ? "+" : "−"}${r1(Math.abs(d))}`]);
}
const houseShiftHTML = list => list.map(([n, v]) => `${esc(n)} <span dir="ltr">${v}</span>`).join(" · ");
/* "נמוך ב־1.7" / "גבוה ב־1.2" — והסבר מלא לתיבת הרמז */
const houseShort = h => `${h.mean < 0 ? "נמוך" : "גבוה"} ב־${r1(Math.abs(h.mean))}`;
const houseExplain = (h, what) => `${what}: בכל ${h.runs.length} מערכות הבחירות שבהן המכון סקר, הוא העריך ${h.mean < 0 ? "בחסר" : "ביתר"} — ` +
  h.runs.map(r => `${r.year}: ${r.err > 0 ? "+" : "−"}${r1(Math.abs(r.err))}`).join(", ") +
  `. בממוצע ${r1(Math.abs(h.mean))} מנדטים ${h.mean < 0 ? "פחות" : "יותר"} מהתוצאה, בסקרי החודש שלפני הבחירות.`;

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
  /* תחזית הברומטר מחושבת מהסקרים אחרי תיקון הטעות הקבועה בתוך כל גוש (correctWithinBlocs) */
  const series = mode === "scenario" && S.seriesScenario ? S.seriesScenario : S.series;
  const allIds = [...new Set(series.flatMap(s => Object.keys(s.parties)))];
  const w = s => mode !== "simple" ? firmWeight(s.meta) : 1;
  const W = series.reduce((sum, s) => sum + w(s), 0);
  const rawFull = Object.fromEntries(allIds.map(id => [id, series.reduce((sum, s) => sum + (s.parties[id] || 0) * w(s), 0) / W]));
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
  const blocs = Object.fromEntries(Object.keys(BLOCS).map(al => [al, series.reduce((sum, s) => sum + s.blocs[al] * w(s), 0) / W]));
  [...skip, ...below].forEach(id => {
    const al = partyMeta(id).alignment;
    if (blocs[al] != null) blocs[al] = Math.max(0, blocs[al] - (rawFull[id] || 0));
  });
  if (mode === 'scenario') {
    /* התוספת הדמוגרפית נקבעת מממוצע שני המודלים שלא מסתכלים על סקרים — הדמוגרפי
       והגיאוגרפי — לשינוי חלק הימין והחרדים עד 2026, מעוגל לרבע מנדט (modelDrift).
       ערך שהוגדר ידנית ב־S.scenarioOptions.demographic גובר, ובלי אף מודל נשארת ברירת המחדל. */
    const opts = { ...(S.scenarioOptions || {}), rawFull };
    const drift = modelDrift();
    if (opts.demographic == null) opts.demographic = drift ? drift.seats : DEMO_FALLBACK;
    const scenario = scenarioForecast(raw, opts);
    return { raw, rawFull, parties: scenario.parties, blocs, fix, scenario, below: belowShare, drift };
  }
  return { raw, rawFull, parties: fix.parties, blocs, fix, below: belowShare };
}

/* אומדן המודל הדמוגרפי (בלי סקרים) לשינוי כוח הימין והחרדים עד 2026 — בנקודות
   אחוז (demoDriftPoints) ובמנדטים (demoDriftSeats). אומדן המודל הגיאוגרפי לאותו שינוי
   (geoDriftPoints/Seats) בא מ־data/trends.json. ממוצע שניהם הוא התוספת הדמוגרפית של
   תחזית הברומטר (modelDrift). */
const DEMO_FALLBACK = 2;      // רק כשאין אף מודל טעון
function demoDriftPoints() {
  if (!S.demo) return null;
  const m0 = runDemoModel(0), m1 = runDemoModel(S.demo.meta.years), sh = (m, c) => 100 * (m.campVotes[c] || 0) / m.campTotal;
  return (sh(m1, "right") + sh(m1, "haredi")) - (sh(m0, "right") + sh(m0, "haredi"));
}
function demoDriftSeats() {
  const pts = demoDriftPoints();
  return pts == null ? null : pts / 100 * 120;
}
/* המודל הגיאוגרפי: חלק הימין והחרדים (מתוך ארבע הקבוצות) ב־2026 פחות 2022 —
   2022 היא התחזית פחות שלושת הצעדים (דמוגרפיה, הצבעה, מגמה) */
function geoRightPoints(n) {
  const right = a => 100 * (a[0] + a[1]) / (a[0] + a[1] + a[2] + a[3]);
  const f0 = n.f26.map((x, i) => x - n.steps.demography[i] - n.steps.turnout[i] - n.steps.trend[i]);
  return { start: right(f0), end: right(n.f26) };
}
function geoDriftPoints() {
  const n = S.trendsNat; if (!n?.f26 || !n.steps) return null;
  const g = geoRightPoints(n);
  return g.end - g.start;
}
function geoDriftSeats() {
  const pts = geoDriftPoints();
  return pts == null ? null : pts / 100 * 120;
}
function modelDrift() {
  const demographic = demoDriftSeats(), geographic = geoDriftSeats();
  const parts = [demographic, geographic].filter(x => x != null);
  if (!parts.length) return null;
  const mean = parts.reduce((t, x) => t + x, 0) / parts.length;
  return { demographic, geographic, mean, seats: Math.round(mean * 4) / 4 };
}

function partyMeta(id) {
  const rows = S.cur.polls.flatMap(p => p.parties.filter(x => normId(x.id) === id));
  const last = rows.at(-1) || { name: id, logoUrl: "" };
  const name = NAME_OVERRIDE[id] || last.name;
  if (ALIGN_OVERRIDE[id]) return { name, logo: last.logoUrl, alignment: ALIGN_OVERRIDE[id] };
  const al = [...new Set(rows.filter(x => x.mandates > 0).map(x => alignOf(x)))];
  return { name, logo: last.logoUrl, alignment: al.length === 1 ? al[0] : "Unknown" };
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
  ozma_yehudit: "איתמר בן גביר", zionut_datit: "בצלאל סמוטריץ׳ · משה פייגלין", ofer_vinter_party: "עופר וינטר",
  yashar: "גדי איזנקוט", beyahad: "נפתלי בנט · יאיר לפיד", hademokratim: "יאיר גולן",
  ndi: "אביגדור ליברמן", raam: "מנסור עבאס", reshima_meshutefet: "יוסף ג׳בארין", hadash_taal: "איימן עודה",
  hendel_zeliha_party: "יועז הנדל · ירון זליכה", kahollavan: "בני גנץ", noam: "אבי מעוז"
};

/* כותרת עמוד הבית נגזרת מהמספרים לפי כלל קבוע — לא נכתבת ידנית בכל עדכון. */
function homeHeadline(est, seats, blocTot) {
  const R = blocTot.Right || 0, L = blocTot.Left || 0, A = blocTot.Arabs || 0;
  const lead = R >= L ? "גוש הימין והחרדים" : "גוש מרכז־שמאל", hi = Math.max(R, L);
  const edge = Object.entries(est.below || {}).filter(([, p]) => p >= 3.0 && p < 3.25).map(([id]) => partyMeta(id).name);
  const top = Object.entries(seats).sort((a, b) => b[1] - a[1])[0];
  if (edge.length) return {
    h: `${edge.join(" ו")} <em>על הסף</em>, ואיתה כל התמונה`,
    s: "כמה אלפי קולות מעלה או מטה, וחלוקת כל 120 המנדטים משתנה."
  };
  if (hi >= 61) return { h: `${lead}: <em>${hi} מנדטים</em>`, s: "מעל 61 — רוב בכנסת ה־26 בכוחות הגוש עצמו." };
  return {
    h: `אף גוש לא מגיע ל־61: <em>ימין וחרדים ${R} · מרכז־שמאל ${L}${A ? ` · ערבים ${A}` : ""}</em>`,
    s: top ? `${esc(partyMeta(top[0]).name)} היא המפלגה הגדולה, ${top[1]} מנדטים. הרשימות הערביות אינן משויכות לגוש.` : "הרשימות הערביות אינן משויכות לגוש."
  };
}

/* שינוי מול העדכון הקודם ששמור ב-forecast-history.json. */
function homeDelta(id) {
  if (S.homeHistory !== "current") return null;
  const hist = S.forecastHistory;
  if (!hist || !Array.isArray(hist.snapshots) || hist.snapshots.length < 2) return null;
  const snaps = hist.snapshots.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const key = S.mode === "weighted" ? "weighted" : "scenario";
  /* לפי כללי הבחירות (seats), כמו המספרים שבכרטיסים */
  const now = (snaps[0].seats?.[key] || snaps[0][key] || snaps[0].parties || {})[id];
  const prev = (snaps[1].seats?.[key] || snaps[1][key] || snaps[1].parties || {})[id];
  if (now == null || prev == null) return null;
  const d = Math.round(now) - Math.round(prev);
  if (!d) return null;
  return { cls: d > 0 ? "up" : "down", txt: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}`, prev: Math.round(prev) };
}

function homeCard(id, seats, est, maxSeats = 30) {
  const m = partyMeta(id);
  const color = partyColor(id, m.alignment);
  const photo = (S.leaders && S.leaders[normId(id)]) || LEADER_PLACEHOLDER;
  const leader = PARTY_LEADER[normId(id)] || "";
  const belowPct = est.below && est.below[id];
  const isBelow = seats[id] == null && belowPct != null;
  const d = isBelow ? null : homeDelta(id);
  const n = isBelow ? 0 : (seats[id] || 0);
  const aria = isBelow
    ? `${m.name}, מתחת לאחוז החסימה, כ־${r1(belowPct)}%`
    : `${m.name}, ${n} מנדטים${d ? `, ${d.cls === "up" ? "עלייה" : "ירידה"} של ${Math.abs(n - d.prev)} מהעדכון הקודם` : ""}`;
  return `<button type="button" class="hcard${isBelow ? " is-below" : ""}" style="--bc:${color}" data-focus-party="${esc(id)}" aria-label="${esc(aria)}. מעבר לסקרים">
    <span class="hcard-photo"><img src="${esc(photo)}"${leaderSrcset(photo, "64px")} alt="" width="720" height="900" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${LEADER_PLACEHOLDER}'"></span>
    <span class="hcard-body">
      <span class="hcard-name">${esc(m.name)}</span>
      ${leader ? `<span class="hcard-leader">${esc(leader)}</span>` : ""}
      <span class="hcard-track" aria-hidden="true"><span style="width:${isBelow ? 0 : Math.max(4, 100 * n / maxSeats)}%"></span></span>
    </span>
    <span class="hcard-seatline"><span class="hcard-seat num">${n}</span>${d ? `<span class="hcard-delta ${d.cls}" title="בעדכון הקודם: ${d.prev}">${d.txt}</span>` : ""}${isBelow ? `<span class="hcard-pct num" title="מתחת לאחוז החסימה">${r1(belowPct)}%</span>` : ""}</span>
  </button>`;
}

/* Presentation only: the same rounded mandate totals used in the party rows. */
/* צבע לכל מפלגה — ארבע משפחות בלבד: גוני כחול לימין, שחור/אפור־כהה לחרדים,
   גוני אדום למרכז־שמאל, גוני ירוק לרשימות הערביות; אפור לרשימה שאינה משויכת. */
const PARTY_COLORS = {
  likud:"#1F4E8C", zionut_datit:"#0C2E5C", ozma_yehudit:"#3E5F8F", noam:"#6B84A8", ofer_vinter_party:"#8FA5C2", shas:"#1B1D21", yahadut_hatora:"#4A4F57",
  hademokratim:"#8E1F17", yashar:"#B5362B", beyahad:"#C9584A", ndi:"#D97A6C", kahollavan:"#E39C90", bait_zioni:"#A8433A", hendel_zeliha_party:"#8A939C",
  reshima_meshutefet:"#1F5A3F", hadash_taal:"#1F5A3F", raam:"#3F8A5E"
};
/* סדר על הקשת, מימין לשמאל: הימין והחרדים בקצה הימני, באמצע הרשימות שאינן
   משויכות (אפור) והרשימות הערביות (ירוק), המרכז־שמאל בקצה השמאלי. */
const SPECTRUM = ["ozma_yehudit", "noam", "zionut_datit", "likud", "ofer_vinter_party", "shas", "yahadut_hatora", "hendel_zeliha_party", "reshima_meshutefet", "hadash_taal", "raam", "ndi", "kahollavan", "bait_zioni", "yashar", "beyahad", "hademokratim"];
const partyHue = id => PARTY_COLORS[normId(id)] || partyColor(id, partyMeta(id).alignment);
/* צד בלוח המנדטים (לפי גוש): רע״מ משויכת ידנית ל-Left (ALIGN_OVERRIDE) ולכן
   נשארת במרכז־שמאל; הרשימות הערביות ללא שיוך ידני (הרשימה המשותפת) עוברות
   לעמודה האמצעית, יחד עם הרשימות שאינן משויכות לגוש כלל. */
const sideOf = id => { const al = partyMeta(id).alignment; return al === "Right" ? "right" : (al === "Unknown" || al === "Arabs") ? "mid" : "left"; };
/* צד על הקשת (לפי משפחה): הרשימות הערביות — כולל רע״מ — והלא־משויכות באמצע */
const ARAB_FAMILY = new Set(["raam", "hadash_taal", "reshima_meshutefet", "balad"]);
const arcSideOf = id => { const al = partyMeta(id).alignment; return al === "Right" ? "right" : (al === "Unknown" || al === "Arabs" || ARAB_FAMILY.has(normId(id))) ? "mid" : "left"; };

/* מפת המנדטים: קשת צפופה צבועה לפי מפלגה, סכומי הגושים מעל (רשימה שאינה
   משויכת לגוש — באמצע), שורת המפלגות מתחת (מנדטים · שם · שינוי מהעדכון הקודם),
   ופס שיעור הקולות. */
function renderHomeHemicycle(seats, blocTot, est) {
  const box = $("#home-hemicycle");
  if (!box) return;
  const ids = Object.keys(seats).filter(id => seats[id] > 0);
  const rank = id => { const i = SPECTRUM.indexOf(normId(id)); if (i >= 0) return i; const sd = arcSideOf(id); return (sd === "right" ? 4 : sd === "mid" ? 9 : 13) + .5; };
  ids.sort((a, b) => rank(a) - rank(b));
  const items = ids.map(id => ({ key: id, color: partyHue(id), count: seats[id], label: `${partyMeta(id).name}: ${seats[id]}` }));
  const R = blocTot.Right || 0, U = blocTot.Unknown || 0, LA = (blocTot.Left || 0) + (blocTot.Arabs || 0), total = R + U + LA;
  const side = { right: ids.filter(id => arcSideOf(id) === "right"), mid: ids.filter(id => arcSideOf(id) === "mid"), left: ids.filter(id => arcSideOf(id) === "left") };
  /* שיעור הקולות המשוער לפי המודל הנבחר (תחזית הברומטר או משוקלל אמינות),
     אבל לא כאילו הן 100% מהמצביעים: מי שמתחת לאחוז החסימה מקבל נתח אמיתי
     משלו (shAllBelow, מהממוצע הגולמי — הוא לא בכלל בתוך est.parties), ו-
     ימין/ערבים/שמאל מצטמצמים יחד ביחס קבוע (scale) כדי שהארבעה יסתכמו
     ל-100% בלי לספור פעמיים. היחס הפנימי בין ימין/ערבים/שמאל עדיין לפי
     est.parties — רק הגודל הכולל שלהם מצטמצם. */
  const parties = est?.parties || {}, rawFull = est?.rawFull || {};
  const belowIds = Object.keys(rawFull).filter(id => parties[id] == null && rawFull[id] > 0);
  const partiesSum = Object.values(parties).reduce((t, v) => t + (v > 0 ? v : 0), 0) || 1;
  const scenarioShareOf = al => 100 * Object.entries(parties)
    .filter(([id, v]) => v > 0 && partyMeta(id).alignment === al)
    .reduce((t, [, v]) => t + v, 0) / partiesSum;
  const sumV = Object.values(rawFull).reduce((t, v) => t + (v > 0 ? v : 0), 0) || 1;
  const shBelow = 100 * belowIds.reduce((t, id) => t + (rawFull[id] > 0 ? rawFull[id] : 0), 0) / sumV;
  const scale = (100 - shBelow) / 100;
  const shR = scenarioShareOf("Right") * scale, shL = scenarioShareOf("Left") * scale, shA = scenarioShareOf("Arabs") * scale;
  const wasted = belowIds.filter(id => 100 * rawFull[id] / sumV >= 0.5).sort((a, b) => rawFull[b] - rawFull[a]).map(id => `${partyMeta(id).name} ${r1(100 * rawFull[id] / sumV)}%`);
  const rows = 5, pts = hemicycleLayout(total, rows);
  const W = 640, H = 330, cx = W / 2, cy = H - 14, Rr = 300;
  const seq = []; items.forEach(it => { for (let k = 0; k < it.count; k++) seq.push(it); });
  const dots = pts.map((p, idx) => { const it = seq[idx] || { color: "#D9DFE9", label: "" }; const x = cx + Math.cos(p.ang) * Rr * p.r, y = cy - Math.sin(p.ang) * Rr * p.r;
    return `<circle class="seat" data-k="${esc(it.key || "")}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="${it.color}"><title>${esc(it.label)}</title></circle>`; }).join("");
  const partyRow = list => list.map(id => { const d = homeDelta(id); return `<div class="sm-party" style="--c:${partyHue(id)}" title="${esc(partyMeta(id).name)}"><b class="num">${seats[id]}</b><i class="sm-swatch"></i><span class="sm-name">${esc(partyMeta(id).name)}</span><small class="${d ? d.cls : ""}">${d ? `${d.txt.startsWith("▲") ? "+" : "−"}${Math.abs(seats[id] - d.prev)}` : ""}</small></div>`; }).join("");
  const midTop = U ? `<div class="sm-bloc mid"><b class="num">${U}</b><span>לא משויכות לגוש</span></div>` : "";
  const midBar = U ? `<span style="width:${100 * U / total}%;background:${BLOCS.Unknown.color}"></span>` : "";
  box.innerHTML = `<div class="seatmap">
    <div class="sm-top"><div class="sm-bloc right"><b class="num">${R}</b><span>גוש הימין והחרדים</span></div>${midTop}<div class="sm-bloc left"><b class="num">${LA}</b><span>מרכז־שמאל והרשימות הערביות</span></div></div>
    <div class="sm-bar" role="img" aria-label="גוש הימין ${R}${U ? `, לא משויכות ${U}` : ""}, מרכז־שמאל והרשימות הערביות ${LA}"><span style="width:${100 * R / total}%;background:${BLOCS.Right.color}"></span>${midBar}<span style="width:${100 * LA / total}%;background:${BLOCS.Left.color}"></span><i class="sm-61" style="inset-inline-start:${100 * 61 / 120}%" title="61 — רוב"></i><i class="sm-61 end" style="inset-inline-end:${100 * 61 / 120}%"></i></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`חלוקת ${total} המנדטים. ${items.map(i => i.label).join("; ")}`)}">${dots}
      <text x="${cx}" y="${cy - 38}" text-anchor="middle" class="hemicycle-total">${total}</text><text x="${cx}" y="${cy - 12}" text-anchor="middle" class="hemicycle-caption">מנדטים</text></svg>
    <div class="sm-parties"><div class="sm-side">${partyRow(side.right)}</div>${side.mid.length ? `<div class="sm-side mid">${partyRow(side.mid)}</div>` : ""}<div class="sm-side">${partyRow(side.left)}</div></div>
    <div class="sm-votes">
      <div class="sm-votes-labels" aria-hidden="true">
        <span style="flex:0 0 ${shR}%">${r1(shR)}%</span>${shBelow > 0.05 ? `<span style="flex:0 0 ${shBelow}%">${r1(shBelow)}%</span>` : ""}${shA > 0.05 ? `<span style="flex:0 0 ${shA}%">${r1(shA)}%</span>` : ""}<span style="flex:0 0 ${shL}%">${r1(shL)}%</span>
      </div>
      <div class="sm-bar thin" role="img" aria-label="ימין וחרדים ${r1(shR)} אחוז, מתחת לאחוז החסימה ${r1(shBelow)} אחוז, הרשימות הערביות ${r1(shA)} אחוז, מרכז־שמאל ${r1(shL)} אחוז">
        <span style="width:${shR}%;background:${BLOCS.Right.color}"></span>${shBelow > 0.05 ? `<span style="width:${shBelow}%;background:${BLOCS.Unknown.color}" title="מתחת לאחוז החסימה: ${r1(shBelow)}%${wasted.length ? ` (${esc(wasted.join(", "))})` : ""}"></span>` : ""}${shA > 0.05 ? `<span style="width:${shA}%;background:${BLOCS.Arabs.color}"></span>` : ""}<span style="width:${shL}%;background:${BLOCS.Left.color}"></span>
      </div>
      ${wasted.length ? `<p class="sm-votes-foot">${r1(shBelow)}% מתחת לאחוז החסימה — ${esc(wasted.join(", "))}</p>` : ""}
  </div></div>`;
  const modeLabel = $("#home-model-label");
  if (modeLabel) modeLabel.textContent = S.mode === "weighted" ? "משוקלל אמינות" : "תחזית הברומטר";
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

/* The opening scoreboard uses the same 120-seat scale as the forecast. */
function renderCoverGauges(blocTot) {
  const host = $("#cover-gauges");
  if (!host) return;
  const right = blocTot.Right || 0, left = (blocTot.Left || 0) + (blocTot.Arabs || 0);
  const other = Math.max(0, 120 - right - left);
  const share = seats => (clamp(seats, 0, 120) / 120 * 100).toFixed(2);
  host.setAttribute("aria-label", `תחזית המנדטים: גוש הימין והחרדים ${right}, מרכז־שמאל והרשימות הערביות ${left}${other ? `, לא משויך ${other}` : ""}. נדרשים 61 מנדטים לרוב. החלוקה לגושים אינה הרכב קואליציה.`);
  host.innerHTML = `<div class="cover-score-head"><span>תחזית הברומטר</span><span>120 מנדטים</span></div>
    <div class="cover-score-pair">
      <div class="cover-score cover-score--right"><strong>${right}</strong><span><i></i>גוש הימין והחרדים</span></div>
      <div class="cover-score cover-score--left"><strong>${left}</strong><span><i></i>מרכז־שמאל והרשימות הערביות</span></div>
    </div>
    <div class="cover-score-scale" aria-hidden="true">
      <div class="cover-score-bar"><span class="cover-score-fill--right" style="width:${share(right)}%"></span>${other ? `<span class="cover-score-fill--other" style="width:${share(other)}%"></span>` : ""}<span class="cover-score-fill--left" style="width:${share(left)}%"></span></div>
      <span class="cover-score-majority" style="inset-inline-start:${share(61)}%"><b>61</b> הרף לרוב</span>
    </div>
    ${other ? `<p class="cover-score-other">${other} מנדטים ללא שיוך לגוש</p>` : ""}
    <p class="cover-score-note">חלוקה לגושים · אינה תחזית להרכב קואליציה</p>`;
}

function renderHome() {
  renderDiscovery();
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
  /* צילום ארכיון שומר מנדטים ואת אחוזי הרשימות שמתחת לסף. מהם משחזרים את
     rawFull: הרשימות מתחת לסף בנתח שלהן, ושאר המנדטים מצטמצמים כך שהכול
     מסתכם ל-120 — כמו בממוצע הגולמי של התחזית החיה. */
  const snapshotBelow = snapshot?.below?.[S.mode === 'weighted' ? 'weighted' : 'scenario'] || {};
  const belowSeats = Object.values(snapshotBelow).reduce((t, p) => t + p * 1.2, 0), seatScale = (120 - belowSeats) / 120;
  const est = snapshotSeats
    ? { parties:{...snapshotSeats}, below:{...snapshotBelow},
        rawFull:{ ...Object.fromEntries(Object.entries(snapshotSeats).map(([id, n]) => [id, n * seatScale])),
                  ...Object.fromEntries(Object.entries(snapshotBelow).map(([id, p]) => [id, p * 1.2])) } }
    : forecast(S.mode, HIDE_FROM_HOME);
  const seats = snapshotSeats ? {...(snapshot.seats?.[S.mode === 'weighted' ? 'weighted' : 'scenario'] || snapshotSeats)} : allocateSeats(est.parties);
  const belowEntries = Object.entries(est.below || {});
  $('#home-eyebrow').textContent = snapshot
    ? `תחזית ארכיון · ${heDate(snapshot.updatedAt)} · ${snapshot.polls || '—'} סקרים`
    : 'תחזית הברומטר · הכנסת ה־26 · הצבעה ב־27 באוקטובר';
  const coverUpdated = $('#cover-updated');
  if (coverUpdated) coverUpdated.textContent = `מעודכן ${humanUpdate(S.cur.generatedAt)}`;

  const blocTot = {};
  Object.entries(seats).forEach(([id, n]) => {
    const al = partyMeta(id).alignment;
    blocTot[al] = (blocTot[al] || 0) + n;
  });
  const R = blocTot.Right || 0, U = blocTot.Unknown || 0;
  const LA = (blocTot.Left || 0) + (blocTot.Arabs || 0);

  const coverSeats = snapshot || S.mode !== "scenario"
    ? allocateSeats(forecast("scenario", HIDE_FROM_HOME).parties)
    : seats;
  const coverBlocs = {};
  Object.entries(coverSeats).forEach(([id, n]) => {
    const alignment = partyMeta(id).alignment;
    coverBlocs[alignment] = (coverBlocs[alignment] || 0) + n;
  });
  renderCoverGauges(coverBlocs);
  renderHomeHemicycle(seats, blocTot, est);
  renderHomePipeline();

  const leadKey = R >= (blocTot.Left || 0) ? "Right" : "Left";
  const rd = [["Right", "גוש הימין"], ["Left", "מרכז־שמאל"], ["Arabs", "הרשימות הערביות"]];
  $("#home-readout").innerHTML = rd.map(([k, label]) =>
    `<div class="rd${k === leadKey ? " lead" : ""}" style="--dot:${BLOCS[k].color}"><span class="rd-lbl"><i></i>${esc(label)}</span><b class="num">${blocTot[k] || 0}</b></div>`
  ).join("") + `<div class="rd-need"><b class="num">61</b><span>דרוש לרוב</span></div>`;

  const faces = $("#hero-faces");
  if (faces) faces.innerHTML = Object.entries(seats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => {
    const m = partyMeta(id), photo = (S.leaders && S.leaders[normId(id)]) || LEADER_PLACEHOLDER;
    return `<span class="face" style="--bc:${partyColor(id, m.alignment)}" title="${esc(m.name)}"><img src="${esc(photo)}"${leaderSrcset(photo, "52px")} alt=""></span>`;
  }).join("");
  $('[data-tally="Right"]').textContent = R;
  $('[data-tally="Mid"]').textContent = U;
  $('[data-tally="LeftArabs"]').textContent = LA;

  /* כל מפלגה בשורת הגוש שלה, מהמנדטים הרבים למעטים; רשימות מתחת לסף בסוף. */
  const preRound = id => est.parties[id] != null ? est.parties[id] : (est.rawFull ? est.rawFull[id] || 0 : 0);
  const entries = Object.entries(seats).filter(([, n]) => n > 0).map(([id, n]) => ({ id, key: n * 100 + preRound(id) }))
    .concat(belowEntries.map(([id, pct]) => ({ id, key: -1000 + pct })));
  /* עמודות הגוש: כל מפלגה בעמודת הגוש שלה, מהמנדטים הרבים למעטים; רשימות מתחת לסף בסוף.
     רשימה שאינה משויכת לגוש (למשל הנדל–זליכה) — בעמודה אמצעית משלה. */
  const byRow = { right: [], mid: [], left: [] };
  entries.sort((a, b) => b.key - a.key).forEach(e => byRow[sideOf(e.id)].push(e.id));
  const maxSeats = Math.max(1, ...Object.values(seats));
  $("#cards-right").innerHTML = byRow.right.map(id => homeCard(id, seats, est, maxSeats)).join("");
  $("#cards-mid").innerHTML = byRow.mid.map(id => homeCard(id, seats, est, maxSeats)).join("");
  $("#cards-left").innerHTML = byRow.left.map(id => homeCard(id, seats, est, maxSeats)).join("");
  $(".wall").classList.toggle("has-mid", byRow.mid.length > 0);

  renderWallPoster(seats, est, blocTot, belowEntries);
  buildHomePrintSheet(est, seats, blocTot);
  const electionHeadline = $("#election-headline");
  if (electionHeadline) electionHeadline.innerHTML = homeHeadline(est, seats, blocTot).h;
  window.renderElectionTools?.(seats, est, blocTot);
}

/* פריסת "פוסטר" כמו בגרפיקת הסקרים בטלוויזיה (כאן חדשות): כל הרשימות ברצף
   אחד לפי גודל, מספר גדול על הדיוקן, ורצועת ארבע הקבוצות למטה — ימין וחרדים ·
   מרכז־שמאל · הרשימות הערביות (כולל רע״מ) · לא משויכות. */
function renderWallPoster(seats, est, blocTot, belowEntries) {
  const box = $("#wall-poster");
  if (!box) return;
  const ids = Object.keys(seats).filter(id => seats[id] > 0).sort((a, b) => seats[b] - seats[a] || (est.parties[b] || 0) - (est.parties[a] || 0));
  const tile = (id, n, sub) => {
    const m = partyMeta(id), photo = (S.leaders && S.leaders[normId(id)]) || LEADER_PLACEHOLDER, d = sub ? null : homeDelta(id);
    return `<button type="button" class="ptile${sub ? " is-below" : ""}" style="--c:${partyHue(id)};--c-ink:${textOnColor(partyHue(id))}" data-focus-party="${esc(id)}" aria-label="${esc(m.name)}, ${sub ? `מתחת לאחוז החסימה, כ־${sub}` : `${n} מנדטים`}. מעבר לסקרים">
      <span class="ptile-photo"><img src="${esc(photo)}"${leaderSrcset(photo, "140px")} alt="" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${LEADER_PLACEHOLDER}'"></span>
      <b class="ptile-num num">${sub ? sub : n}</b><span class="ptile-name">${esc(m.name)}</span><span class="ptile-leader">${esc(PARTY_LEADER[normId(id)] || "")}</span>${d ? `<small class="ptile-delta ${d.cls}">${esc(d.txt)}</small>` : ""}</button>`;
  };
  const arab = ids.filter(id => arcSideOf(id) === "mid" && partyMeta(id).alignment !== "Unknown").reduce((t, id) => t + seats[id], 0);
  const groups = [["גוש הימין והחרדים", blocTot.Right || 0, BLOCS.Right.color], ["מרכז־שמאל", (blocTot.Left || 0) + (blocTot.Arabs || 0) - arab, BLOCS.Left.color], ["הרשימות הערביות", arab, BLOCS.Arabs.color], ["לא משויכות", blocTot.Unknown || 0, BLOCS.Unknown.color]].filter(g => g[1] > 0);
  /* שתי שורות: גוש הימין למעלה, כל השאר (מרכז־שמאל, הרשימות הערביות,
     לא משויכות) למטה — לא לפי גודל בלבד, אלא לפי שיוך בפועל. */
  const isRight = id => partyMeta(id).alignment === "Right";
  const rightIds = ids.filter(isRight), otherIds = ids.filter(id => !isRight(id));
  const rightBelow = belowEntries.filter(([id]) => isRight(id)), otherBelow = belowEntries.filter(([id]) => !isRight(id));
  const rightTotal = blocTot.Right || 0, otherTotal = 120 - rightTotal;
  /* תג הסכום יושב אחרון ב-DOM כדי לנחות משמאל בפריסת flex ב-RTL (הראשון
     נופל מימין) — משמאל לכל שורה, לא רק ברצועת הסיכום למטה. */
  const rowTotal = (n, color) => `<div class="ptiles-total" style="--c:${color}"><b class="num">${n}</b><span>מנדטים</span></div>`;
  box.innerHTML = `<div class="ptiles-row"><div class="ptiles">${rightIds.map(id => tile(id, seats[id])).join("")}${rightBelow.map(([id, pct]) => tile(id, 0, `${r1(pct)}%`)).join("")}</div>${rowTotal(rightTotal, BLOCS.Right.color)}</div>
    <div class="ptiles-row"><div class="ptiles">${otherIds.map(id => tile(id, seats[id])).join("")}${otherBelow.map(([id, pct]) => tile(id, 0, `${r1(pct)}%`)).join("")}</div>${rowTotal(otherTotal, BLOCS.Left.color)}</div>
    <div class="pstrip"><span class="pstrip-lbl">חלוקת הגושים</span>${groups.map(([l, n, c]) => `<span class="pgroup" style="--c:${c}"><b class="num">${n}</b>${esc(l)}</span>`).join("")}<span class="pstrip-note">61 דרושים לרוב</span></div>`;
}

/* הפתיח: חמשת המכלולים שנבדקים — כל אחד עם מספר חי מהנתונים — שמתנקזים לתחזית אחת */
function renderHomePipeline() {
  if (typeof window !== 'undefined') window.initPipelineStory?.();
  const box = $("#home-pipeline"); if (!box) return;
  const nodes = [];
  try {
    /* 01 · תוצאות האמת של 2022 */
    const defs = S.hist?.blocs || BLOCS_2022, act = S.hist?.actual || {};
    const b22 = histBlocs(act, defs), r22 = b22.netanyahu || 0;
    if (r22) nodes.push({ k: "תוצאות 2022", n: `${r22} : ${120 - r22}`, t: "גוש הימין והחרדים מול כל שאר הרשימות, מנדטים — נקודת המוצא לכל בדיקה", href: "#/demography" });
    /* 02 · דיוק המכונים */
    const active = S.series.map(s => s.meta), calib = active.filter(m => m.calibrated);
    const best = calib.map(m => ({ m, sc: firmScore(m) })).sort((a, b) => b.sc - a.sc)[0];
    nodes.push({ k: "דיוק המכונים", n: `${calib.length} מכונים`, t: best ? `נמדדו מול שלוש הבחירות האחרונות (2020–2022) וקיבלו ציון. המדויק ביותר בתחזית: ${best.m.he} (${r1(best.sc)})` : "נמדדו מול שלוש הבחירות האחרונות וקיבלו ציון", href: "#/2022" });
    /* 03 · כמה עברו צד */
    if (S.regions && S.hist) {
      const c = crossoverBase();
      if (c.rows.length) nodes.push({ k: "כמה עברו צד", n: `${c.deltaAvg < 0 ? "−" : "+"}${c.kv(c.votersAvg)}`, t: `מצביעים ${c.deltaAvg < 0 ? "עזבו את גוש הימין" : "הצטרפו לגוש הימין"} מאז 2022, מעבר לגידול הטבעי, לפי ממוצע המכונים המשוקלל`, href: "#/crossover" });
    }
    /* 04 · גידול טבעי */
    if (S.demo) {
      const d = demoDriftPoints();
      nodes.push({ k: "גידול טבעי", n: `${d < 0 ? "−" : "+"}${r1(Math.abs(d))} נק׳`, t: "לימין ולחרדים עד 2026 מהדמוגרפיה בלבד — תחזית עצמאית לגודל הגושים, בלי אף סקר", href: "#/demography" });
    }
    /* 05 · הסקרים */
    const nPolls = S.series.reduce((t, s) => t + s.polls.length, 0);
    nodes.push({ k: "הסקרים", n: `${nPolls} סקרים`, t: `${S.series.length} מכונים ב־${FORECAST_MAX_AGE_DAYS} הימים האחרונים, כל מכון לפי ציונו`, href: "#/polls" });
  } catch (e) { console.error(e); }
  box.innerHTML = nodes.map((x, i) => `<a class="pipe-node" href="${x.href}">
      <span class="pipe-step">0${i + 1}</span>
      <span class="pipe-k">${esc(x.k)}</span>
      <b class="pipe-n num">${esc(x.n)}</b>
      <span class="pipe-t">${esc(x.t)}</span>
    </a>`).join("");
}

const initials = n => String(n || "").replace(/^ה/, "").replace(/["'׳״!.]/g, "").trim().slice(0, 2);

function logoBox(meta, size = 34) {
  if (meta?.logo) return `<span class="orglogo" style="width:${size}px;height:${size}px" title="${esc(meta.he || "")}"><img src="${esc(meta.logo)}" alt="" onerror="var p=this.parentNode;this.remove();p.textContent='${esc(meta.short || "")}'"></span>`;
  return `<span class="orglogo" style="width:${size}px;height:${size}px" title="${esc(meta?.he || "")}">${esc(meta?.short || "—")}</span>`;
}
function outletLogo(name) {
  if (name === BAROMETER_OUTLET) return `<span class="orglogo is-barometer" title="${esc(name)}"></span>`;
  const l = S.firms.outletLogos[name];
  return l ? `<span class="orglogo" title="${esc(name)}"><img src="${esc(l)}" alt="" onerror="var p=this.parentNode;this.remove();p.textContent='${esc((name||"").slice(0,3))}'"></span>`
           : `<span class="orglogo" title="${esc(name)}">${esc((name || "").slice(0, 3))}</span>`;
}

/* כותרת הציון בכרטיס המכון: המספר גדול, תג הדרגה, ופס 0–100 בצבע הדרגה */
function scoreTop(score, label, gradeKey, gradeLabel, rankNo = "") {
  return `<div class="score-top grade-${gradeKey}" role="img" aria-label="${esc(label)}: ${r1(score)} מתוך 100, ${esc(gradeLabel)}">
    <div class="score-row">${rankNo ? `<em class="rank-no">${esc(rankNo)}</em>` : ""}<b class="num">${r1(score)}</b></div>
    <i class="score-bar"><u style="--v:${clamp(score)}%"></u></i>
    <div class="score-foot"><span class="grade ${gradeKey}">${esc(gradeLabel)}</span><small>${esc(label)} · מתוך 100</small></div></div>`;
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
/* דיוקן בכרטיס קטן: איור קווים דקים שמוקטן בדפדפן מ-720px ל-64px הופך לרעש
   אפור. crop-leaders.py מפיק גרסאות 128/256 מוקטנות ב-LANCZOS, וה-srcset נותן
   לדפדפן לבחור את הקרובה לגודל התצוגה. */
const LEADER_WIDTHS = [64, 96, 128, 192, 256, 384];
const leaderSrcset = (photo, sizes) => /-full[.]jpg$/.test(photo)
  ? ` srcset="${LEADER_WIDTHS.map(w => `${esc(photo.replace(/-full[.]jpg$/, `-${w}.jpg`))} ${w}w`).join(", ")}, ${esc(photo)} 720w" sizes="${sizes}"` : "";
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

  renderPollCards(rows, polls);
  renderPartyProfile(rows);
  renderFirmCards();
  if (typeof renderPollTracker === "function") renderPollTracker();
  if (S.regions && $("#crossover-chart")) renderCrossover();
}

const shortName = n => n.replace(/^ה/, "").replace(/!.*/, "").replace(/\s*עם.*/, "").trim().slice(0, 12);

function renderFirmCards() {
  if (!$("#firm-cards")) return;                       // המכונים ומפרסמיהם — בעמוד דיוק המכונים
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
      <p>${active ? `${fmt(t.polls)} סקרים משויכים למכון` : esc(t.note || "ממתין לנתונים מלאים")}</p>
      ${active && t.note ? `<small>${esc(t.note)}</small>` : ""}
    </article>`;
  }).join("");
}

/* ============================================================
   6. עמוד מדד אמינות המכונים
   ============================================================ */
const curElection = () => S.elections.find(e => e.key === S.calibKey) || S.elections[0];
/* התרחיש ההיפותטי (מרצ עוברת את החסימה) שייך לכנסת ה־25 בלבד. */
const counterfactualAvailable = () => S.calibKey === "2022";
const scenActual = () => (S.scen === "counterfactual" && counterfactualAvailable())
  ? COUNTERFACTUAL : curElection().data.actual;
const curBlocDefs = () => curElection().data.blocs || BLOCS_2022;
/* שם הגוש: אם הוא רשימה אחת, מוצג שמה; אחרת התווית הכללית. */
const blocLabel = (key, ids) => ids.length === 1 ? (HIST_PARTY_HE[ids[0]] || ids[0]) : BLOC_LABELS[key];

function renderCalibSwitch() {
  $("#calib-switch").innerHTML = S.elections.map(e =>
    `<button type="button" data-calib="${esc(e.key)}" aria-pressed="${e.key === S.calibKey}">${esc(e.election)} · ${esc(e.short)}</button>`).join("");
  const e = curElection(), heD = d => d.split("-").reverse().join(".");
  const firms = new Set(e.data.polls.map(p => p.firm).filter(Boolean)).size;
  $("#arch-title").textContent = `${e.election} · ${heD(e.data.meta?.electionDate || e.data.window.to)}`;
  $("#calib-facts").innerHTML = [[e.data.polls.length, "סקרים בארכיון"], [firms, "שיוכי מכון בארכיון"], [`<span dir="ltr">${heD(e.data.window.from)} – ${heD(e.data.window.to)}</span>`, "תאריכי חלון הכיול בפועל"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  const src = e.data.meta?.sourceUrl ? `<a href="${esc(e.data.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(e.data.meta.source)} ↗</a>` : esc(e.data.meta?.source || "");
  const dataFile = accuracyDataFile(e);
  $("#calib-source").innerHTML = `מקור הארכיון: ${src || "ארכיון האתר"} · <a href="${dataFile}" target="_blank" rel="noopener">כל הנתונים לחישוב ↗</a> · <a href="${accuracyElectionSource(e)}" target="_blank" rel="noopener">תוצאות ועדת הבחירות ↗</a>. ${esc(e.data.meta?.note || "")}`;
  const proof = $("#accuracy-proof-summary");
  if (proof) {
    const missing = e.data.polls.filter(p => !p.firm).length;
    const original = e.data.polls.filter(p => p.source).length;
    const hypothetical = S.scen === "counterfactual" && counterfactualAvailable();
    proof.innerHTML = `<b>${hypothetical ? "הארכיון מוצג מול תרחיש מרצ עוברת" : "הנתונים שמהם חושב הציון"}</b><p>${hypothetical ? "זהו תרחיש המחשה. דירוג המכונים למעלה והמשקל בתחזית נשארים מחושבים מול תוצאות האמת." : "בחרו מערכת בחירות ומכון כדי לבדוק את הסקרים מול אותה תוצאת אמת. הדירוג למעלה תמיד משלב את כל מערכות הכיול."} ${missing ? `${missing} סקרים ללא שיוך למכון אינם נכנסים לציון של מכון.` : "כל הסקרים בחלון משויכים למכון."} ${original < e.data.polls.length ? `קישור לפרסום המקורי קיים ב־${original} מתוך ${e.data.polls.length} סקרים; בשאר הרשומות מצוין שהקישור חסר.` : "לכל סקר קיים קישור לפרסום המקורי."}</p>`;
  }
}

/* דיוק המכונים: הערה אחת לכל מכון — איפה הוא טועה באופן קבוע (2020–2022). אלה
   הטעויות שתחזית הברומטר מתקנת בתוך הגוש; בכרטיסי הסקרים עצמם אין הערה. */
function houseFirmNote(meta) {
  const h = houseOf(meta);
  if (!h) return "";
  if (h.bloc.runs.length < 2)
    return `<p class="house-firm is-clean">סקר רק במערכת אחת (${h.bloc.runs.map(r => r.year).join("")}) — מוקדם לקבוע טעות קבועה</p>`;
  const items = [];
  if (h.bloc.consistent) items.push(["גוש הימין", "גוש הימין", h.bloc]);
  Object.entries(HOUSE_GROUPS).forEach(([g, def]) => { if (h.groups[g]?.consistent) items.push([def.he, def.together || def.he, h.groups[g]]); });
  if (!items.length) return `<p class="house-firm is-clean">בלי טעות קבועה ב־2020–2022</p>`;
  return `<p class="house-firm"><b>טעות קבועה:</b> ${items.map(([short, long, x]) =>
    `<span title="${esc(houseExplain(x, long))}">${esc(short)} ${houseShort(x)}</span>`).join(" · ")}</p>`;
}

/* Transparent display helpers. The scoring formula and forecast weights are unchanged. */
function accuracyDataFile(e) {
  return `data/historical-polls${e.key === "2022" ? "" : `-${e.key}`}.json`;
}
function accuracyElectionSource(e) {
  const knesset = { "2020": 23, "2021": 24, "2022": 25 }[e.key];
  return knesset ? `https://media${knesset}.bechirot.gov.il/files/expc.csv` : "https://www.gov.il/he/departments/central_elections_committee";
}
function accuracyRuns(st) {
  return (st.elections || []).filter(r => S.elections.some(e => e.key === r.key));
}
function accuracyBreakdown(st) {
  const components = [
    ["blocScore", "דיוק בגושים", .6, "#17457F"],
    ["partyScore", "דיוק במפלגות", .3, "#966918"],
    ["consistencyScore", "עקביות", .1, "#6A5A9C"]
  ];
  return `<table class="accuracy-breakdown"><caption>ממה מורכב הציון</caption><thead><tr><th scope="col">רכיב</th><th scope="col">ציון</th><th scope="col">משקל</th><th scope="col">נקודות לציון</th></tr></thead><tbody>${components.map(([key, label, weight, color]) =>
    `<tr><th scope="row"><i style="--component:${color}"></i>${label}</th><td>${r1(st[key])}</td><td>${weight * 100}%</td><td><b>${(st[key] * weight).toFixed(2)}</b></td></tr>`).join("")}</tbody><tfoot><tr><th scope="row" colspan="3">סך הכול מתוך 100</th><td><b>${r1(st.score)}</b></td></tr></tfoot></table>`;
}
function accuracyScoreBasis(st, heir) {
  const runs = accuracyRuns(st), sparse = runs.filter(r => r.n < 3);
  const basis = runs.length === 1 ? `נמדד במערכת אחת בלבד (${esc(runs[0].short)})` : `ממוצע שווה של ${runs.length} מערכות בחירות`;
  return `<p class="accuracy-basis">${heir ? `<b>ציון מועבר מ־${esc(heir.he)}.</b> למכון הזה אין סדרת כיול עצמאית כאן; זו הנחת המשכיות של הברומטר, ולא בדיקה עצמאית של המכון הנוכחי. ` : ""}${basis}. ${sparse.length ? `<b>מעט נתונים:</b> ${sparse.map(r => `${esc(r.short)} — ${r.n === 1 ? "סקר אחד" : `${r.n} סקרים`}`).join("; ")}. רכיב העקביות הוכפל ב־${sparse.map(r => `<span dir="ltr">${r.n}/3</span>`).join(" ו־")} באותן מערכות.` : "בכל מערכת יש לפחות 3 סקרים למדידת העקביות."}</p>`;
}
function renderAccuracyMethod() {
  const box = $("#accuracy-method"); if (!box) return;
  box.innerHTML = `<div class="accuracy-method-band"><div class="accuracy-method-label"><strong>נוסחה אחת לכל מכון</strong><span>ממוצע שווה של מערכות הבחירות</span></div>
    <div class="accuracy-method-weight" style="--component:#17457F"><b>60%</b><span>דיוק בגושים</span></div>
    <div class="accuracy-method-weight" style="--component:#966918"><b>30%</b><span>דיוק במפלגות</span></div>
    <div class="accuracy-method-weight" style="--component:#6A5A9C"><b>10%</b><span>עקביות</span></div>
    <div class="accuracy-method-grades" aria-label="הדרגה והמשקל בתחזית"><span>משקל בתחזית</span>${GRADES.map(([key, label, min], i) => `<span class="grade ${key}">${esc(label.replace(/^אמינות /, ""))} ${i === GRADES.length - 1 ? `פחות מ־${GRADES[i - 1][2]}` : `${min}+`} · ${TIER_WEIGHT[key].toFixed(2)}</span>`).join("")}</div></div>
    <details class="accuracy-method-details"><summary>איך הגענו לנוסחה? השיטה והמגבלות</summary><div>
      <div class="accuracy-formula-grid">
      <article style="--component:#17457F"><span class="accuracy-weight">60%</span><h3>דיוק בגושים</h3><p>מחשבים לכל גוש את הפער המוחלט בין ממוצע סקרי המכון לתוצאה. מחברים את הפערים ומחלקים ב־3.</p><div class="accuracy-equation">100 − 10 × הפער הממוצע לגוש</div></article>
      <article style="--component:#966918"><span class="accuracy-weight">30%</span><h3>דיוק במפלגות</h3><p>בכל סקר מחשבים את הפער המוחלט לכל רשימה; ממוצעים את כל הפערים, בכל הסקרים והרשימות.</p><div class="accuracy-equation">100 − 15 × הטעות הממוצעת לרשימה</div></article>
      <article style="--component:#6A5A9C"><span class="accuracy-weight">10%</span><h3>עקביות בין הסקרים</h3><p>65% ליציבות גוש הימין והחרדים ו־35% ליציבות הרשימות. עם סקר אחד מקבלים שליש מהרכיב, ועם שניים — שני שלישים.</p><div class="accuracy-equation">65% × יציבות הגוש + 35% × יציבות הרשימות</div></article>
      </div>
      <div class="accuracy-method-foot"><p><b>למה דווקא המשקלים האלה?</b> הברומטר נותן את רוב המשקל לדיוק בגושים, אחריו לדיוק במפלגות, ומשקל קטן ליציבות הסקרים. זו בחירת שיטה של האתר, ולא מדד רשמי של ועדת הבחירות.</p><p><b>מה הציון אומר — ומה מגבלותיו?</b> הוא מתאר הצלחה בנתוני העבר שבארכיון, ואינו מבטיח דיוק בבחירות הבאות. מעט סקרים מספקים בסיס צר להשוואה. עקביות מודדת יציבות; גם סקר יציב עלול לטעות.</p></div>
      <p>כל ציון רכיב מוגבל לטווח 0–100. יציבות הגוש = 100 פחות 25 כפול סטיית התקן של מנדטי גוש הימין והחרדים בין הסקרים. יציבות הרשימות = 100 פחות 50 כפול ממוצע סטיות התקן של כל רשימה בין הסקרים.</p>
      <p>רכיב העקביות = (0.65 × יציבות הגוש + 0.35 × יציבות הרשימות) × המינימום בין 1 לבין מספר הסקרים חלקי 3. מספר הסקרים משנה רק את רכיב העקביות; הדיוק בגושים ובמפלגות מחושב כרגיל.</p>
      <p>ציון מערכת = 0.6 × דיוק בגושים + 0.3 × דיוק במפלגות + 0.1 × עקביות. הציון ההיסטורי = סכום ציוני המערכות שבהן המכון נמדד חלקי מספרן. מערכת ללא סקרים של המכון אינה נכנסת לממוצע שלו.</p>
      <p>סקר ללא שיוך למכון נשאר בארכיון ואינו נכנס לציון של מכון. מכון ללא כיול מקבל 70 כערך ניטרלי במודל; 70 אינו ציון דיוק שנמדד. ציון שמועבר ממכון קודם מסומן בנפרד. הגדרת הגושים ורשימת המפלגות מוצגות לכל מערכת בחירות בפירוט המכון.</p>
      <p>המספרים בתצוגה מעוגלים. החישוב משתמש בנתונים המלאים. בארכיון מסומנים במפורש סקרים שחסר להם קישור לפרסום המקורי.</p>
      <button class="accuracy-jump" type="button">לכל סקרי הכיול והמקורות <span aria-hidden="true">↓</span></button>
    </div></details>`;
  $(".accuracy-jump", box)?.addEventListener("click", () => {
    const evidence = $("#accuracy-proof-summary") || $("#arch-title");
    evidence?.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#arch-firm")?.focus({ preventScroll: true });
  });
}

function render2022() {
  const stats = S.stats;
  renderAccuracyMethod();
  renderCalibSwitch();
  renderCounterfactual();

  const totalPolls = S.elections.reduce((t, e) => t + e.data.polls.length, 0);
  const calibrated = stats.filter(st => S.firms.firms.find(f => f.id === st.firm)?.calibrated);
  const facts = $("#acc-facts");
  if (facts) facts.innerHTML = [
    [calibrated.length, "מכונים שנמדדו"], [totalPolls, "סקרים בארכיון"], [S.elections.length, "מערכות בחירות"]
  ].map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");

  const activeFirms = new Set(S.cur.polls.map(p => firmOf(p.sourceId).firm));
  const heirsOf = id => S.firms.firms.filter(f => f.calibrationFirm === id && f.id !== id && activeFirms.has(f.id));
  const components = [["blocScore", "גושים", .6, "#17457F"], ["partyScore", "מפלגות", .3, "#966918"], ["consistencyScore", "עקביות", .1, "#6A5A9C"]];
  const rowOf = (st, meta, index, heir) => {
    const runs = accuracyRuns(st), grade = gradeOf(st.score);
    const sourceCount = runs.reduce((n, run) => n + run.polls.filter(p => p.source).length, 0);
    return `<article class="acc-row${heir ? " is-heir" : ""}">
      <span class="accuracy-rank-number" aria-label="${heir ? "ללא מקום עצמאי בדירוג" : `מקום ${index + 1}`}">${heir ? "↳" : index + 1}</span>${logoBox(meta, 34)}
      <div class="accuracy-identity"><h3>${esc(meta.he)}</h3><span class="accuracy-card-type">${heir ? `ציון מועבר מ־${esc(heir.he)}` : `${runs.length === 1 ? "מערכת אחת" : `${runs.length} מערכות`} · ${st.n} סקרים`}</span></div>
      <span class="grade ${grade.key}" title="מקדם בתחזית ${TIER_WEIGHT[grade.key].toFixed(2)}">${esc(grade.label)}</span>
      <b class="accuracy-score">${r1(st.score)}</b>
      <div class="accuracy-contributions" title="הנקודות שמרכיבות את הציון"><div class="accuracy-score-track" aria-hidden="true">${components.map(([key, , weight, color]) => `<span style="width:${st[key] * weight}%;--component:${color}"></span>`).join("")}</div><div class="accuracy-contribution-values">${components.map(([key, label, weight, color]) => `<span style="--component:${color}"><i aria-hidden="true"></i>${label} <b>${r1(st[key] * weight)}</b><small>/${weight * 100}</small></span>`).join("")}</div></div>
      <span class="accuracy-sources" title="${sourceCount < st.n ? `ל־${st.n - sourceCount} סקרים חסר קישור לפרסום המקורי` : "לכל סקר יש קישור לפרסום המקורי"}"><b>${sourceCount}/${st.n}</b> עם מקור</span>
      <button class="accuracy-open" type="button" data-firm="${esc(meta.id)}" aria-label="פירוט הציון, הסקרים והמקורות של ${esc(meta.he)}">פירוט <span aria-hidden="true">↗</span></button>
    </article>`;
  };
  const list = $("#rank-list");
  list.className = "ranks acc-list";
  list.innerHTML = `<div class="acc-row acc-cols" aria-hidden="true"><span>#</span><span></span><span>מכון</span><span>דרגה</span><span>ציון</span><span>ממה מורכב הציון</span><span>מקורות</span><span></span></div>` + calibrated.map((st, index) => {
    const meta = S.firms.firms.find(f => f.id === st.firm);
    return rowOf(st, meta, index, null);
  }).join("");
  const inherited = calibrated.flatMap((st, index) => heirsOf(st.firm).map(heir => rowOf(st, heir, index, S.firms.firms.find(f => f.id === st.firm))));

  const rankedIds = new Set(calibrated.map(st => st.firm));
  const extras = [...activeFirms].map(id => S.firms.firms.find(f => f.id === id))
    .filter(f => f && !rankedIds.has(f.id) && !(f.calibrationFirm && rankedIds.has(f.calibrationFirm)));
  if (inherited.length || extras.length) list.insertAdjacentHTML("beforeend", `<p class="acc-subhead">ללא מדידה עצמאית — ציון שמועבר ממכון קודם, או ערך ברירת מחדל</p>${inherited.join("")}`);
  if (extras.length) list.insertAdjacentHTML("beforeend", extras.map(meta => `<article class="acc-row is-neutral">
    <span class="accuracy-rank-number" aria-hidden="true">—</span>${logoBox(meta, 34)}
    <div class="accuracy-identity"><h3>${esc(meta.he)}</h3><span class="accuracy-card-type">ללא כיול היסטורי</span></div>
    <span class="grade none">ללא דרגה</span><b class="accuracy-score">—</b>
    <p class="accuracy-neutral-explain">70 הוא ערך ברירת מחדל במודל, לא ציון שנמדד · מקדם <b dir="ltr">${firmWeight(meta).toFixed(2)}</b></p>
    <span class="accuracy-sources">—</span>
    <button class="accuracy-open" type="button" data-firm="${esc(meta.id)}" aria-label="פרטי ${esc(meta.he)}">פירוט <span aria-hidden="true">↗</span></button>
  </article>`).join(""));
  renderBiasNote();
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
  const target = scenActual(), keys = Object.keys(target).sort((a, b) => target[b] - target[a]);
  const rows = el.data.polls.map((p, i) => ({ p, i })).filter(({ p }) => {
    const m = S.firms.firms.find(f => f.id === p.firm);
    return (ff === "all" || p.firm === ff) && (!q || `${p.date} ${heDate(p.date)} ${p.firm} ${m ? m.he : ""} ${p.publisher}`.toLowerCase().includes(q));
  }).sort((a, b) => b.p.date.localeCompare(a.p.date));
  /* ברירת המחדל: עשרת הסקרים האחרונים; כפתור פותח את כל החלון */
  const LIMIT = 10, shown = S.archAll ? rows : rows.slice(0, LIMIT);
  $("#arch-count").textContent = `${shown.length} מתוך ${rows.length} סקרים תואמים · ${el.data.polls.length} בארכיון`;
  const cellCls = d => d === 0 ? "ok" : d === 1 ? "near" : d === 2 ? "off" : "far";
  const tbDefs = curBlocDefs(), tb = histBlocs(target, tbDefs);
  const cf = S.scen === "counterfactual" && counterfactualAvailable();
  const actualRow = `<tr class="actual${cf ? " cf" : ""}"><td class="date">${esc((el.data.meta?.electionDate || "").slice(5).split("-").reverse().join("."))}</td><td colspan="2"><strong>${cf ? "התרחיש: מרצ עוברת" : `תוצאות האמת · ${esc(el.election)}`}</strong></td>${
      keys.map(k => `<td class="n"><b>${target[k]}</b></td>`).join("")}<td class="n"><b>${tb.netanyahu}</b></td><td></td><td>בסיס ההשוואה</td></tr>`;
  $("#arch-table").innerHTML = `<thead><tr><th>תאריך</th><th>מפרסם</th><th>מכון</th>${
    keys.map(k => `<th class="n party-h">${esc(HIST_PARTY_HE[k] || k)}</th>`).join("")
  }<th class="n">גוש הימין והחרדים</th><th class="n">טעות לרשימה</th><th>הסקר</th></tr></thead><tbody>${actualRow}${
    shown.map(({ p, i }) => {
      const mae = avg(keys.map(k => Math.abs((p.p[k] || 0) - target[k])));
      const m = S.firms.firms.find(f => f.id === p.firm) || { he: FIRM_HE_FALLBACK[p.firm] || p.firm || "ללא שיוך מכון" };
      const bn = histBlocs(p.p, tbDefs).netanyahu, dev = Math.abs(bn - tb.netanyahu);
      return `<tr${p.firm ? "" : ' class="unattributed"'}><td class="date">${esc(p.date.slice(5).split("-").reverse().join("."))}</td>
        <td class="pub"><div class="orgcell">${outletLogo(p.publisher)}<span>${esc(p.publisher)}</span></div></td>
        <td class="firm">${p.firm ? `<button class="accuracy-firm-link" type="button" data-firm="${esc(p.firm)}">${esc(m.he)}</button>` : `<strong>${esc(m.he)}</strong>`}</td>
        ${keys.map(k => { const v = p.p[k] || 0, d = Math.abs(v - target[k]); return `<td class="n cell ${cellCls(d)}" title="${esc(HIST_PARTY_HE[k] || k)}: ${v} מול ${target[k]}">${v}</td>`; }).join("")}
        <td class="n cell ${cellCls(dev)}"><b>${bn}</b></td>
        <td class="n"><span class="chip ${mae < 1 ? "good" : mae > 1.6 ? "bad" : ""}">${r1(mae)}</span></td><td class="accuracy-archive-proof"><button class="accuracy-poll-open" type="button" data-poll="${i}" aria-label="פירוט סקר ${esc(p.publisher)} מ־${esc(heDate(p.date))}">פרטים</button>${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">מקור ↗</a>` : `<small title="קישור לפרסום המקורי חסר">אין קישור</small>`}</td></tr>`;
    }).join("") || `<tr><td colspan="${keys.length + 6}" class="empty">לא נמצאו סקרים.</td></tr>`}</tbody>`;
  const more = $("#arch-more");
  if (more) {
    more.hidden = rows.length <= LIMIT;
    more.textContent = S.archAll ? `להציג רק את ${LIMIT} הסקרים האחרונים` : `להציג את כל ${rows.length} הסקרים`;
  }
}

/* טעות דגימה קבועה: מפלגה שהסקרים החטיאו לאותו כיוון בכל המערכות שבהן רצה
   (לפחות שתיים), במנדט אחד ומעלה בממוצע. מוצגות השתיים הבולטות. */
function renderBiasNote() {
  const box = $("#bias-note"); if (!box) return;
  const byParty = {};
  S.elections.forEach(e => Object.keys(e.data.actual).forEach(k => {
    const mean = avg(e.data.polls.map(p => p.p[k] || 0));
    (byParty[k] ||= []).push({ e, mean, actual: e.data.actual[k], d: e.data.actual[k] - mean });
  }));
  const latest = S.elections[0]?.data.actual || {};
  const found = Object.entries(byParty)
    .filter(([k, runs]) => k in latest && runs.length >= 2 && (runs.every(r => r.d >= 0.3) || runs.every(r => r.d <= -0.3)))
    .map(([k, runs]) => ({ k, runs, mean: avg(runs.map(r => r.d)) }))
    .filter(x => Math.abs(x.mean) >= 1)
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean)).slice(0, 2);
  if (!found.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>דפוס משותף בסקרי העבר:</b> ` + found.map(x => {
    const dir = x.mean > 0 ? `במערכות שנבדקו, הסקרים נתנו לה בממוצע ${seatsHe(x.mean)} פחות מתוצאת האמת` : `במערכות שנבדקו, הסקרים נתנו לה בממוצע ${seatsHe(x.mean)} יותר מתוצאת האמת`;
    const list = x.runs.slice().sort((a, b) => b.e.year - a.e.year).map(r => `${esc(r.e.short)}: ${r1(r.mean)} בסקרים מול ${r.actual} בפועל`).join(" · ");
    return `<b>${esc(HIST_PARTY_HE[x.k] || x.k)}</b> — ${dir} (${list})`;
  }).join("; ") + `. זה תיאור של הארכיון, ואינו רכיב נוסף בציון המכונים או הבטחה לפער דומה בבחירות הבאות.`;
}

/* התחשיב של 2022: מה היה קורה אילו מרצ הייתה עוברת את אחוז החסימה — במנדטים,
   ובציוני המכונים (כל מכון נמדד מחדש מול התוצאה ההיפותטית). */
function renderCounterfactual() {
  const box = $("#scen-block"); if (!box) return;
  box.hidden = !counterfactualAvailable();
  if (box.hidden) return;
  const el = curElection(), defs = curBlocDefs(), w = S.regions.wasted;
  const actual = el.data.actual, cfB = histBlocs(COUNTERFACTUAL, defs), aB = histBlocs(actual, defs);
  const colors = { netanyahu: BLOCS.Right.color, outgoing: BLOCS.Left.color, outside: BLOCS.Arabs.color };
  $$("#scen-switch [data-scen]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scen === S.scen)));
  $("#scen-cards").innerHTML = Object.entries(defs).map(([k, ids]) => `<div class="scen-card" style="--c:${colors[k] || "#96A0AB"}">
      <p class="kicker">${esc(blocLabel(k, ids))}</p>
      <div class="scen-pair"><span><small>בפועל</small><b>${aB[k]}</b></span><i>→</i><span class="cf"><small>אילו מרצ עברה</small><b>${cfB[k]}</b></span></div>
    </div>`).join("");
  $("#scen-explain").innerHTML = `<p><b>מרצ קיבלה ${fmt(w.meretz)} קולות — ${fmt(w.meretzGap)} קולות בלבד מתחת לאחוז החסימה.</b> אילו עברה, היא הייתה מקבלת ${COUNTERFACTUAL.meretz} מנדטים, וחלוקת המנדטים כולה הייתה מחושבת מחדש: גוש הימין והחרדים ${aB.netanyahu} → ${cfB.netanyahu}.</p>
    <p><b>זהו תרחיש המחשה, ולא תוצאת בחירות.</b> המתג משנה את בסיס ההשוואה של טבלת סקרי 2022. בטבלה כאן אפשר לראות את הציון מול האמת ואת הציון מול התרחיש זה לצד זה. דירוג המכונים למעלה והמשקל בתחזית ממשיכים להשתמש בתוצאות האמת בלבד.</p>`;
  const rows = S.elections.find(e => e.key === "2022").stats.map(a => {
    const c = S.counterStats.find(x => x.firm === a.firm), m = S.firms.firms.find(f => f.id === a.firm) || { he: FIRM_HE_FALLBACK[a.firm] || a.firm };
    return { he: m.he, a: a.score, c: c ? c.score : null, n: a.n };
  }).sort((x, y) => (y.c ?? 0) - (x.c ?? 0));
  $("#scen-firms").innerHTML = `<thead><tr><th>מכון · 2022</th><th class="n">סקרים</th><th class="n">ציון מול האמת</th><th class="n">ציון מול התרחיש</th><th class="n">הפרש</th></tr></thead><tbody>${
    rows.map(r => { const d = r.c == null ? null : r.c - r.a; return `<tr><td><strong>${esc(r.he)}</strong></td><td class="n">${r.n}</td><td class="n">${r1(r.a)}</td><td class="n"><b>${r.c == null ? "—" : r1(r.c)}</b></td><td class="n"><span dir="ltr" class="chip ${d == null ? "" : d > 0.5 ? "good" : d < -0.5 ? "bad" : ""}">${d == null ? "—" : (d > 0 ? "+" : "") + d.toFixed(1)}</span></td></tr>`; }).join("")}</tbody>`;
}

/* באנר פירוט למכון: מה הוא חזה בחודש הכיול, מה יצא בפועל, ולמה הציון. */
/* Every score is traceable to its election runs, components, and original poll records. */
function openFirm(firmId) {
  const meta = S.firms.firms.find(f => f.id === firmId) || { id: firmId, he: FIRM_HE_FALLBACK[firmId] || firmId, short: "?" };
  const st = S.stats.find(x => x.firm === calibrationId(meta));
  const heir = meta.calibrationFirm && meta.calibrationFirm !== meta.id
    ? S.firms.firms.find(f => f.id === meta.calibrationFirm) : null;
  const measured = Boolean(meta.calibrated && st), dlg = $("#dlg");
  dlg.classList.add("wide");
  const head = `<header class="accuracy-detail-head">${logoBox(meta, 56)}<div><p class="accuracy-card-type">${measured ? heir ? "ציון מועבר ממכון קודם" : "הנתונים שמאחורי הציון" : "ללא כיול היסטורי"}</p><h2>${esc(meta.he)}</h2><p>${esc(meta.lead || "")}</p></div><div class="accuracy-card-score"><b>${r1(firmScore(meta))}</b><span>${measured ? "ציון היסטורי / 100" : "ערך ניטרלי במודל"}</span></div></header>`;
  if (!measured) {
    const dataReason = st ? `בארכיון קיימות ${st.n} רשומות תחת תווית זו, אבל היא אינה מסומנת כמכון מכויל ברישום המכונים. הרשומות מוצגות לצורכי ארכיון ואינן משמשות לדירוג.` : "אין למכון הזה סדרת כיול משויכת במערכות הבחירות שבמדד.";
    $("#dlg-body").innerHTML = `<div class="accuracy-detail">${head}<div class="accuracy-detail-note"><h3>70 הוא ברירת מחדל, ולא תוצאת בדיקת דיוק</h3><p>${dataReason} ערך ברירת המחדל של הברומטר למכון לא מכויל הוא 70, עם מקדם משקל יחסי של ${firmWeight(meta).toFixed(2)} בממוצע המשוקלל. הציון יעודכן כאשר יהיו נתונים מתאימים להשוואה לתוצאות אמת.</p></div><p>${esc(meta.about || "")}</p><p><a href="data/pollsters.json" target="_blank" rel="noopener">רישום המכונים וכללי שיוך הציון ↗</a></p></div>`;
    dlg.showModal(); dlg.scrollTop = 0; return;
  }

  const runs = accuracyRuns(st), grade = gradeOf(st.score);
  const aggregate = `<section class="accuracy-detail-total"><h3>הציון ההיסטורי: ${r1(st.score)} מתוך 100</h3>${accuracyScoreBasis(st, heir)}
    <div class="accuracy-runs">${runs.map(run => `<div><span>${esc(run.election)} · ${esc(run.short)}</span><b>${r1(run.score)}</b><small>${run.n} סקרים</small></div>`).join("")}</div>
    <p class="accuracy-average">${runs.length > 1 ? `<span dir="ltr">(${runs.map(r => r.score.toFixed(2)).join(" + ")}) ÷ ${runs.length} = ${r1(st.score)}</span>` : "זו מערכת הכיול היחידה של המכון בארכיון."}</p>
    ${accuracyBreakdown(st)}<p class="accuracy-rounding">ברכיבים למעלה מוצג ממוצע המערכות. כל מערכת מקבלת משקל שווה, גם אם פורסם בה מספר שונה של סקרים. התצוגה מעוגלת; החישוב משתמש בערכים המלאים.</p>
    <p>לצורך הממוצע המשוקלל בתחזית, הציון נמצא בדרגת <b>${esc(grade.label)}</b> ומקבל מקדם יחסי <b dir="ltr">${TIER_WEIGHT[grade.key].toFixed(2)}</b>. זו דרגה לפי מדד הברומטר; היא אינה הבטחה לדיוק עתידי.</p>${heir ? `<p><a href="data/pollsters.json" target="_blank" rel="noopener">לבדיקת שיוך הציון מ־${esc(heir.he)} ↗</a></p>` : ""}</section>`;

  const sections = runs.map(run => {
    const el = S.elections.find(e => e.key === run.key), actual = el.data.actual, defs = el.data.blocs || BLOCS_2022;
    const actualBlocs = histBlocs(actual, defs), keys = Object.keys(actual).sort((a, b) => actual[b] - actual[a]);
    const polls = run.polls.slice().sort((a, b) => b.date.localeCompare(a.date));
    const partyMean = Object.fromEntries(keys.map(k => [k, avg(polls.map(p => p.p[k] || 0))]));
    const blocSd = sd(polls.map(p => histBlocs(p.p, defs).netanyahu));
    const partySd = avg(keys.map(k => sd(polls.map(p => p.p[k] || 0))));
    const confidence = Math.min(1, run.n / 3), linked = polls.filter(p => p.source).length;
    const signedGap = value => `<span class="accuracy-gap${Math.abs(value) > 2 ? " large" : ""}" dir="ltr">${value > 0 ? "+" : ""}${r1(value)}</span>`;
    const breakdown = `<div class="accuracy-run-explain"><article><h4>גושים · ${r1(run.blocScore)} נקודות</h4><p>סכום הפערים המוחלטים בגושים: <b>${r1(run.blocAbs)}</b>. מחלקים ב־3: <b>${r1(run.blocAbs / 3)} מנדטים לגוש</b>.</p><p class="accuracy-equation" dir="ltr">100 − 10 × ${ (run.blocAbs / 3).toFixed(3) } = ${r1(run.blocScore)}</p></article>
      <article><h4>מפלגות · ${r1(run.partyScore)} נקודות</h4><p>ממוצע הטעות המוחלטת בכל ${run.n} הסקרים ובכל ${keys.length} הרשימות: <b>${r1(run.partyMae)} מנדטים לרשימה</b>.</p><p class="accuracy-equation" dir="ltr">100 − 15 × ${run.partyMae.toFixed(3)} = ${r1(run.partyScore)}</p></article>
      <article><h4>עקביות · ${r1(run.consistencyScore)} נקודות</h4><p>סטיית התקן בגוש הימין והחרדים: <b>${r1(blocSd)}</b>; ממוצע סטיות התקן ברשימות: <b>${r1(partySd)}</b>. מכאן ציוני יציבות של <b>${r1(run.stability)}</b> ו־<b>${r1(run.partyStability)}</b>, בהתאמה.</p><p class="accuracy-equation" dir="ltr">(0.65 × ${r1(run.stability)} + 0.35 × ${r1(run.partyStability)}) × ${confidence.toFixed(3)} = ${r1(run.consistencyScore)}</p><p>${confidence < 1 ? `<b>תיקון למיעוט סקרים:</b> מקדם העקביות הוא ${run.n}/3. כך סקר בודד אינו מקבל עקביות מושלמת רק מפני שאין לו סקר נוסף להשוואה.` : "לפחות 3 סקרים: רכיב העקביות נספר במלואו."}</p></article></div>`;
    const blocRows = Object.entries(defs).map(([key, ids]) => `<tr class="fd-bloc"><th scope="row">${esc(key === "netanyahu" ? "גוש הימין והחרדים" : key === "outgoing" ? "מרכז–שמאל" : "מחוץ לגושים")}</th><td class="n">${r1(run.blocMean[key])}</td><td class="n">${actualBlocs[key]}</td><td class="n">${signedGap(run.blocMean[key] - actualBlocs[key])}</td></tr>`).join("");
    const partyRows = keys.map(k => `<tr><th scope="row">${esc(HIST_PARTY_HE[k] || k)}</th><td class="n">${r1(partyMean[k])}</td><td class="n">${actual[k]}</td><td class="n">${signedGap(partyMean[k] - actual[k])}</td></tr>`).join("");
    const pollRows = polls.map(p => {
      const blocs = histBlocs(p.p, defs), mae = avg(keys.map(k => Math.abs((p.p[k] || 0) - actual[k])));
      return `<tr><th scope="row">${esc(heDate(p.date))}</th><td>${esc(p.publisher || "לא צוין")}</td>${keys.map(k => `<td class="n">${p.p[k] || 0}</td>`).join("")}<td class="n"><b>${blocs.netanyahu}</b></td><td class="n">${r1(mae)}</td><td class="accuracy-source-cell">${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">לפרסום המקורי ↗</a>` : `<span>קישור לפרסום המקורי חסר</span>`}</td></tr>`;
    }).join("");
    const cfStat = run.key === "2022" ? S.counterStats.find(s => s.firm === run.firm) : null;
    return `<section class="accuracy-detail-run"><div class="accuracy-run-heading"><div><p class="accuracy-card-type">בדיקה מול תוצאות האמת · ${esc(run.short)}</p><h3>${esc(el.election)}</h3><p>${run.n} סקרים · ${esc(heDate(el.data.window.from))} עד ${esc(heDate(el.data.window.to))}</p></div><div class="accuracy-card-score"><b>${r1(run.score)}</b><span>ציון המערכת</span></div></div>
      ${breakdown}${accuracyBreakdown(run)}<p class="accuracy-rounding">כל רכיב מוגבל לטווח 0–100. מספרים בנוסחה מוצגים בקירוב; הנתונים המלאים זמינים בקובץ המקושר למטה.</p>
      <div class="accuracy-bloc-definitions"><b>חלוקת הגושים במערכת זו</b>${Object.entries(defs).map(([key, ids]) => `<p><strong>${esc(key === "netanyahu" ? "גוש הימין והחרדים" : key === "outgoing" ? "מרכז–שמאל" : "מחוץ לגושים")}:</strong> ${ids.map(id => esc(HIST_PARTY_HE[id] || id)).join(" · ")}</p>`).join("")}</div>
      <div class="tablewrap accuracy-means-wrap"><table><caption>ממוצע סקרי המכון מול תוצאות האמת · פער חיובי = הערכת יתר; פער שלילי = הערכת חסר</caption><thead><tr><th scope="col">רשימה / גוש</th><th scope="col" class="n">ממוצע המכון</th><th scope="col" class="n">תוצאות אמת</th><th scope="col" class="n">פער במנדטים</th></tr></thead><tbody>${blocRows}${partyRows}</tbody></table></div>
      <div class="accuracy-detail-note"><b>אילו מקורות קיימים כאן?</b><p>${linked} מתוך ${run.n} סקרים כוללים קישור לפרסום המקורי. ${linked < run.n ? "בשאר הסקרים נשמרו הנתונים בארכיון, אבל הקישור הראשוני חסר. זו מגבלה של האפשרות לבדוק את המקור; אינה משנה את החישוב." : "אפשר לפתוח כל פרסום בטבלת הסקרים."}</p><div class="accuracy-source-links">${el.data.meta?.sourceUrl ? `<a href="${esc(el.data.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(el.data.meta.source)} ↗</a>` : `<span>מקור הרשומות: ${esc(el.data.meta?.source || "ארכיון האתר")}</span>`}<a href="${accuracyDataFile(el)}" target="_blank" rel="noopener">נתוני הכיול המלאים ↗</a><a href="${accuracyElectionSource(el)}" target="_blank" rel="noopener">תוצאות ועדת הבחירות ↗</a></div></div>
      <div class="tablewrap accuracy-evidence-wrap" role="region" aria-label="כל סקרי ${esc(meta.he)} בשנת ${esc(run.short)}. אפשר לגלול אופקית" tabindex="0"><table class="accuracy-evidence"><caption>כל סקרי הכיול, ללא קיצור · ${esc(run.short)}</caption><thead><tr><th scope="col">תאריך</th><th scope="col">פרסום</th>${keys.map(k => `<th scope="col" class="n">${esc(HIST_PARTY_HE[k] || k)}</th>`).join("")}<th scope="col" class="n">גוש הימין והחרדים</th><th scope="col" class="n">טעות לרשימה</th><th scope="col">מקור ראשוני</th></tr></thead><tbody>${pollRows}</tbody></table></div>
      ${cfStat ? `<p class="accuracy-scenario-note">להמחשת השפעת אחוז החסימה: מול התרחיש ההיפותטי שבו מרצ עוברת, ציון 2022 היה ${r1(cfStat.score)}. הדירוג והמשקל בתחזית משתמשים בתוצאת האמת ובציון ${r1(run.score)} למערכת הזו.</p>` : ""}</section>`;
  }).join("");
  $("#dlg-body").innerHTML = `<div class="accuracy-detail">${head}${aggregate}${sections}</div>`;
  dlg.showModal(); dlg.scrollTop = 0;
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
const DISCOVERY_ART = [
  `<svg viewBox="0 0 360 120" aria-hidden="true" focusable="false"><defs><linearGradient id="discovery-swing" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#78a8cf"/><stop offset="1" stop-color="#e2c27f"/></linearGradient></defs><path d="M0 99H360" stroke="#688198" stroke-opacity=".35"/><path d="M0 62H360" stroke="#688198" stroke-opacity=".2"/><path d="M8 85C55 85 68 40 116 42S178 91 222 79 274 28 352 18" fill="none" stroke="url(#discovery-swing)" stroke-width="3" stroke-linecap="round"/><path d="M8 106C58 101 77 72 118 76S181 54 222 47 295 61 352 42" fill="none" stroke="#8fb7d4" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/><circle cx="222" cy="79" r="6" fill="#e2c27f"/><circle cx="222" cy="79" r="14" fill="#e2c27f" fill-opacity=".12"/></svg>`,
  `<svg viewBox="0 0 360 120" aria-hidden="true" focusable="false"><defs><linearGradient id="discovery-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ead096"/><stop offset="1" stop-color="#8db8d9"/></linearGradient></defs><path d="M43 101H317" stroke="#7890a4" stroke-opacity=".45"/><path d="M116 100V18h128v82" fill="#243d51" fill-opacity=".38" stroke="url(#discovery-edge)" stroke-width="2"/><path d="M134 43h92M134 59h92M134 75h56" stroke="#a9c3d5" stroke-opacity=".5"/><path d="M208 20v80" stroke="#e8cc91" stroke-opacity=".45"/><circle cx="208" cy="19" r="8" fill="#e8cc91"/><circle cx="208" cy="19" r="18" fill="#e8cc91" fill-opacity=".1"/><path d="M62 86l21-18 18 18M268 84l18-18 16 18" fill="none" stroke="#8db8d9" stroke-opacity=".62" stroke-width="2"/></svg>`,
  `<svg viewBox="0 0 360 120" aria-hidden="true" focusable="false"><defs><linearGradient id="discovery-map" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8db8d9"/><stop offset="1" stop-color="#e8cc91"/></linearGradient></defs><path d="M33 99h294M57 84V52l26-13 22 10v35M117 84V29l24-11 24 11v55M180 84V43l28-12 25 13v40M250 84V54l27-11 25 11v30" fill="none" stroke="url(#discovery-map)" stroke-width="2" stroke-linejoin="round"/><path d="M55 99c62-19 90-11 142-3s88-17 131-6" fill="none" stroke="#e8cc91" stroke-opacity=".52" stroke-dasharray="3 6"/><circle cx="83" cy="39" r="4" fill="#e8cc91"/><circle cx="208" cy="31" r="4" fill="#e8cc91"/><circle cx="277" cy="43" r="4" fill="#e8cc91"/></svg>`
];
let discoveryGroups = [];
let discoveryStep = 0;
let discoveryTimer;
function paintDiscovery() {
  const host = $("#discovery-stories"), controls = $("#discovery-controls");
  if (!host || !discoveryGroups.length) return;
  host.innerHTML = discoveryGroups.map((group, slot) => {
    const story = group[discoveryStep];
    return `<a class="discovery-card" href="${story.href}">
      <span class="discovery-art">${DISCOVERY_ART[slot]}</span>
      <span class="discovery-eyebrow">${esc(story.eyebrow)}</span>
      <strong class="discovery-number" dir="auto">${esc(story.number)}</strong>
      <h3>${esc(story.title)}</h3><p>${esc(story.description)}</p>
      <span class="discovery-source">${esc(story.source)}</span>
      <span class="discovery-link">${esc(story.link)} <b aria-hidden="true">←</b></span>
    </a>`;
  }).join("");
  if (controls) controls.innerHTML = [0, 1, 2].map(index =>
    `<button type="button" data-discovery-step="${index}" aria-label="הציגו מקבץ סיפורים ${index + 1}" aria-pressed="${index === discoveryStep}"></button>`
  ).join("");
}
function renderDiscovery() {
  const host = $("#discovery-stories");
  if (!host || !S.regions) return;
  const c = crossoverBase();
  const ext = c.rows.length ? crossExtremes(c.rows) : { wild: [] };
  const panels = ext.wild[0], wildNames = firmsHe(ext.wild);
  const cities = ["חיפה", "אשדוד", "באר שבע"].map(name => S.regions.localitiesFull?.find(l => l.name === name));
  const cityVotes = cities.every(Boolean) ? cities.reduce((sum, city) => sum + city.valid, 0) : 0;
  const comparison = panels && cityVotes && panels.voters > cityVotes
    ? `יותר מכל הקולות הכשרים בחיפה, באשדוד ובבאר שבע יחד ב־2022 — ${fmt(cityVotes)} קולות.`
    : "כמה גדול השינוי בגושים? השוו את המספרים שמשתמעים מסקרי כל מכון.";
  const dates = [...new Set(ext.wild.map(r => r.date).filter(Boolean))];
  const dateLabel = dates.length ? ` · ${dates.join(", ")}` : "";
  const rightFirms = S.series.map(s => ({ name:s.meta.he || s.meta.id, value:s.blocs.Right || 0 })).sort((a, b) => a.value - b.value);
  let gapM = null;
  try { gapM = typeof pollGapModel === "function" ? pollGapModel() : null; } catch { /* בלי הכרטיס הזה */ }
  const rightGap = rightFirms.length > 1 ? rightFirms.at(-1).value - rightFirms[0].value : 0;
  const partyIds = [...new Set(S.series.flatMap(s => Object.keys(s.parties)))];
  const thresholds = partyIds.map(id => {
    const values = S.series.map(s => s.parties[id] || 0);
    return { id, above:values.filter(v => v >= THRESHOLD_MANDATES).length, below:values.filter(v => v > 0 && v < THRESHOLD_MANDATES).length };
  }).filter(p => p.above && p.below).sort((a, b) => Math.min(b.above, b.below) - Math.min(a.above, a.below));
  const threshold = thresholds[0];
  const partyGaps = partyIds.map(id => {
    const values = S.series.map(s => s.parties[id] || 0);
    return { id, gap:Math.max(...values) - Math.min(...values), present:values.filter(v => v > 0).length, high:Math.max(...values) };
  }).filter(p => p.present >= 2 && p.high >= THRESHOLD_MANDATES).sort((a, b) => b.gap - a.gap);
  const partyGap = partyGaps[0];
  const displayed = value => String(r1(value)).replace(/\.0$/, "");
  discoveryGroups = [
    [
      gapM ? { eyebrow:"שני סקרים מהשבועיים האחרונים", number:String(gapM.gap), title:`מנדטים: ${gapM.lo.outlet} מול ${gapM.hi.outlet}`, description:`${gapM.hi.outlet} נותן לגוש הימין והחרדים ${gapM.hi.right}, ${gapM.lo.outlet} — ${gapM.lo.right}. מי מהם קרוב יותר לאמת?`, source:`מקור: הסקרים הקיצוניים מבין ${gapM.n} סקרים אחרונים`, href:"#/polls/gap", link:"נסו לנחש" }
        : { eyebrow:panels ? `ההערכה הקיצונית ביותר: ${wildNames}` : "כמה השתנתה התמיכה בגושים?", number:panels ? `≈ ${c.kv(panels.voters)}` : "—", title:panels ? `קולות ${panels.delta < 0 ? "פחות" : "יותר"} לגוש הימין` : "כמה השתנתה התמיכה בגושים?", description:`${comparison} אומדן שינוי בתמיכה, לא ספירה של אנשים שעברו צד.`, source:`מקור: סקרי ${wildNames}${dateLabel} · חישוב הברומטר מול 2022 והגידול הטבעי`, href:"#/polls/crossover", link:"השוו בין המכונים" },
      { eyebrow:"ממוצע המכונים", number:`≈ ${c.kv(c.votersAvg)}`, title:`קולות ${c.deltaAvg < 0 ? "פחות" : "יותר"} לגוש הימין`, description:"שינוי התמיכה המשוקלל לעומת 2022 בתוספת הגידול הטבעי, במונחי מצביעים. זהו אומדן, לא מעקב אחרי מצביעים בודדים.", source:"מקור: הסקר האחרון של כל מכון · חישוב הברומטר", href:"#/polls/crossover", link:"ראו את דרך ההשוואה" },
      { eyebrow:"כשסופרים גם קולות שלא עברו", number:fmt(S.regions.wasted.blocGap), title:"קולות בלבד בין שני המחנות ב־2022", description:"הפער בין הגושים קטן בהרבה כשמוסיפים את מצביעי מרצ ובל״ד שנותרו מחוץ לכנסת.", source:"מקור: ועדת הבחירות · תוצאות 2022 · לפי שיוך הגושים באתר", href:"#/polls/crossover", link:"ראו את חישוב הגושים" }
    ],
    [
      { eyebrow:"על חודו של קול", number:fmt(S.regions.wasted.meretzGap), title:"קולות הפרידו בין מרצ לכנסת", description:"פער קטן בקלפי, שהיה יכול לשנות גוש שלם בחלוקת המנדטים.", source:"מקור: ועדת הבחירות · 2022", href:"#/2022", link:"מה היה קורה אילו עברה?" },
      { eyebrow:"נשארו מחוץ לחלוקת המנדטים", number:fmt(S.regions.wasted.total), title:"קולות למרצ ולבל״ד ב־2022", description:"שתי רשימות קרובות לאחוז החסימה קיבלו יחד כמעט שלוש מאות אלף קולות, אך לא נכנסו לכנסת.", source:"מקור: ועדת הבחירות · 2022", href:"#/2022", link:"בדקו את תוצאות העבר" },
      { eyebrow:"המכונים חלוקים על אחוז החסימה", number:threshold ? `${threshold.above} מתוך ${S.series.length}` : `${S.series.length}`, title:threshold ? `מכונים מעלים את ${partyMeta(threshold.id).name}` : "מכונים בחלון התחזית", description:threshold ? `אצל ${threshold.below} מכונים אחרים ממוצע הסקרים של הרשימה נמוך מאחוז החסימה.` : "ראו אילו רשימות מתקרבות לסף ובאיזה מכון.", source:"מקור: ממוצע סקרי כל מכון בחלון התחזית", href:"#/polls", link:"השוו את הסקרים" }
    ],
    [
      { eyebrow:"והסיפור של היישוב שלכם?", number:fmt(S.regions.localitiesFull?.length || 0), title:"יישובים. כל אחד מצביע אחרת.", description:"חפשו יישוב וגלו מי הוביל בו וכמה בעלי זכות בחירה הגיעו לקלפי.", source:"מקור: תוצאות האמת · בחירות 2022", href:"#/map", link:"חפשו את היישוב שלכם" },
      { eyebrow:"המכונים רואים גושים שונים", number:displayed(rightGap), title:"מנדטים מפרידים בין קצות ההערכות לימין", description:rightFirms.length > 1 ? `ממוצעי סקרי ${rightFirms[0].name} ו${rightFirms.at(-1).name} מציבים את הגוש בקצוות הטווח.` : "השוו את הערכות המכונים לגוש הימין.", source:"מקור: ממוצע סקרי כל מכון בחלון התחזית", href:"#/polls/trend", link:"פתחו את הסקרים" },
      { eyebrow:"על איזו רשימה אין הסכמה?", number:partyGap ? displayed(partyGap.gap) : "—", title:partyGap ? `מנדטים מפרידים בהערכת ${partyMeta(partyGap.id).name}` : "פערים בין המכונים", description:"המרחק בין ממוצע המכון הגבוה לנמוך עבור אותה רשימה בחלון התחזית.", source:"מקור: ממוצע סקרי כל מכון בחלון התחזית", href:"#/polls", link:"ראו את כל נתוני הסקרים" }
    ]
  ];
  paintDiscovery();
  if (!discoveryTimer) {
    $("#discovery-controls")?.addEventListener("click", event => {
      const button = event.target.closest("[data-discovery-step]");
      if (!button) return;
      discoveryStep = Number(button.dataset.discoveryStep);
      paintDiscovery();
    });
    discoveryTimer = setInterval(() => {
      if (document.hidden || !$("#view-landing")?.classList.contains("on") || host.matches(":hover") || host.contains(document.activeElement)) return;
      discoveryStep = (discoveryStep + 1) % 3;
      paintDiscovery();
    }, 9000);
  }
}
/* החישוב המשותף לעמוד "כמה עברו צד" ולפתיח הבית */
function crossoverBase() {
  const nat = S.regions.national, valid = nat.valid;
  const defs = S.hist.blocs || BLOCS_2022;
  const rightIds2022 = new Set(defs.netanyahu);
  const counted2022 = nat.parties.filter(p => p.pct >= CROSS_MIN_SHARE);
  const tot2022 = counted2022.reduce((t, p) => t + p.votes, 0);
  const right2022 = counted2022.filter(p => rightIds2022.has(p.id)).reduce((t, p) => t + p.votes, 0);
  const rightShare0 = 100 * right2022 / tot2022;
  const below2022 = counted2022.filter(p => !p.seats);
  const kv = v => fmt(Math.round(Math.abs(v) / 1000) * 1000);
  /* הגידול הטבעי: המודל הדמוגרפי (בלי סקרים) מעריך כמה היה זז חלק הימין עד 2026
     אילו איש לא החליף צד. נקודת האפס היא 2022 + הגידול הזה, כך שהפער של כל
     מכון ממנה הוא מה שנשאר להסביר בהחלפת צד או בהישארות בבית. הקולות מתורגמים
     לפי מספר המצביעים הצפוי ב־2026. */
  const growth = demoDriftPoints() ?? 0;
  const base = rightShare0 + growth;
  const tot2026 = S.demo ? tot2022 * runDemoModel(S.demo.meta.years).totalValid / runDemoModel(0).totalValid : tot2022;
  const votersOf = pp => Math.abs(pp) / 100 * tot2026;               // נקודות אחוז → מצביעים (2026)

  /* חלק הימין בכל מכון: כל רשימה עם ממוצע של 1.5% ומעלה נספרת, גם מתחת לסף. */
  const shareOf = s => {
    const ids = Object.keys(s.parties).filter(id => 100 * s.parties[id] / 120 >= CROSS_MIN_SHARE);
    const tot = ids.reduce((t, id) => t + s.parties[id], 0) || 1;
    const right = ids.filter(id => partyMeta(id).alignment === "Right").reduce((t, id) => t + s.parties[id], 0);
    const below = ids.filter(id => s.parties[id] < THRESHOLD_MANDATES);
    return { share: 100 * right / tot, below };
  };
  const wOf = s => firmWeight(s.meta);
  /* כאן — בניגוד לתחזית — אין חלון זמן: כל מכון מיוצג בסקר האחרון שלו,
     כך שגם מכון שלא פרסם בימים האחרונים מופיע ונכנס לממוצע. */
  const latest = new Map();
  [...S.cur.polls]
    .sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0))
    .forEach(p => { const k = firmOf(p.sourceId).firm; if (!latest.has(k)) latest.set(k, p); });
  const series = buildSeries([...latest.values()]);
  const rows = series.map(s => {
    const x = shareOf(s);
    const delta = x.share - base;                                     // נקודות אחוז; שלילי = הימין הצטמק
    return { meta: s.meta, series: s, share: x.share, delta, voters: votersOf(delta), date: s.polls[0].date, below: x.below };
  }).sort((a, b) => a.delta - b.delta);
  const totW = series.reduce((t, s) => t + wOf(s), 0) || 1;
  const shareAvg = series.reduce((t, s) => t + shareOf(s).share * wOf(s), 0) / totW;
  const deltaAvg = shareAvg - base;
  const votersAvg = votersOf(deltaAvg);
  /* נקודת האפס במנדטים — אותה נקודת בסיס כמו בתחזית: 2022 כאילו מרצ עברה (COUNTERFACTUAL) ועוד התוספת הדמוגרפית של שני המודלים.
     100 נקודות אחוז מהקולות הנספרים = 120 מנדטים. */
  const zeroSeats = histBlocs(COUNTERFACTUAL, defs).netanyahu + (modelDrift()?.mean ?? 0), seatsAvg = deltaAvg * 1.2;
  return { zeroSeats, seatsAvg, nat, valid, defs, rightIds2022, counted2022, tot2022, right2022, rightShare0, growth, base, below2022, kv, votersOf, shareOf, wOf, rows, shareAvg, deltaAvg, votersAvg };
}

/* המכונים שבקצוות — כולם, לא רק הראשון: בתיקו (למשל שני מכונים עם אותו
   חלק לימין) כל הדפים מציגים את שניהם, כדי שלא ייראה כאילו הם סותרים זה את זה. */
function crossExtremes(rows) {
  const abs = rows.map(r => Math.abs(r.delta)), hi = Math.max(...abs), lo = Math.min(...abs);
  const same = (x, y) => Math.abs(x - y) < 0.05;
  return { wild: rows.filter(r => same(Math.abs(r.delta), hi)), calm: rows.filter(r => same(Math.abs(r.delta), lo)) };
}
const heJoin = names => names.length < 2 ? (names[0] || "") : names.slice(0, -1).join(", ") + " ו" + names.at(-1);
const firmsHe = rs => heJoin(rs.map(r => r.meta.he || r.meta.firm || r.meta.id));

/* תחזית 2026 של המודל הגיאוגרפי (data/trends.json, ברירת המחדל של העמוד): חלק הימין
   והחרדים מתוך ארבע הקבוצות — אותה הגדרה כמו כאן (רשימות מ־1.5%). נטען בפעם הראשונה. */
function geoRightShare() {
  if (S.trendsNat === undefined) {
    S.trendsNat = null;
    const inline = window.__BAROMETER_DATA__?.["data/trends.json"];
    (inline ? Promise.resolve(inline) : loadJSONOptional("data/trends.json")).then(t => {
      S.trendsNat = t?.national || null;
      if (S.trendsNat && $("#poll-crossover") && !$("#poll-crossover").hidden) renderCrossover();
    });
    return null;
  }
  const f = S.trendsNat?.f26;
  return f ? 100 * (f[0] + f[1]) / (f[0] + f[1] + f[2] + f[3]) : null;
}

/* הסקרים מול 2022 והצפי הדמוגרפי. חלק כל גוש מהקולות שנספרים, בלי לבחור צד:
   גוש הימין והחרדים מול יתר הרשימות (מרכז–שמאל והרשימות הערביות). כל השורות — אותו מדד. */
function renderCrossover() {
  const { valid, tot2022, right2022, rightShare0, growth, base, below2022, kv, votersOf, rows, shareAvg, deltaAvg, votersAvg, zeroSeats, seatsAvg } = crossoverBase();
  const geo = geoRightShare(), box = $("#crossover-chart");
  if (!box) return;
  if (!rows.length) { box.innerHTML = `<p class="cx2-empty">אין סקרים בחלון הנוכחי.</p>`; return; }
  const R = BLOCS.Right.color, L = BLOCS.Left.color, sign = d => Math.abs(d) < 0.05 ? "0" : `${d < 0 ? "−" : "+"}${r1(Math.abs(d))}`;
  const name = r => r.meta.he || r.meta.firm || r.meta.id;
  const split = (v, label) => `<div class="cx2-split" role="img" aria-label="${esc(`${label}: ימין וחרדים ${r1(v)}%, יתר הרשימות ${r1(100 - v)}%`)}">
      <span style="flex:${v};background:${R}"><b dir="ltr">${r1(v)}%</b></span><span style="flex:${100 - v};background:${L}"><b dir="ltr">${r1(100 - v)}%</b></span><i class="cx2-half" title="50%"></i></div>`;
  const refs = [
    ["2022 בפועל", rightShare0], ["צפי דמוגרפי ל־2026", base],
    ...(geo == null ? [] : [["צפי לפי מגמות היישובים", geo]]), ["ממוצע הסקרים (משוקלל לפי אמינות)", shareAvg]
  ];
  const sorted = [...rows].sort((a, b) => b.share - a.share);
  const above = rows.filter(r => r.delta > 0.05).length, below = rows.filter(r => r.delta < -0.05).length;
  const spread = sorted[0].share - sorted.at(-1).share;
  box.innerHTML = `
    <header class="cx2-head"><h2 id="cross-title">חלק גוש הימין והחרדים מהקולות: <span>${r1(shareAvg)}%</span> בממוצע הסקרים</h2>
      <p>הפער בין ממוצע הסקרים לצפי הדמוגרפי ל־2026: ${pointsHe(deltaAvg)}, כ־${kv(votersAvg)} קולות — כ־${seatsHe(seatsAvg)} ${seatsAvg < 0 ? "פחות" : "יותר"} מ־${Math.round(zeroSeats)} המנדטים שהיו לימין ולחרדים אילו איש לא עבר צד. יתר הרשימות: ${r1(100 - shareAvg)}% ${gapInfo("אומדן של גודל הפער בתמיכה, לא ספירה של אנשים שעברו בין גושים: חלק מהפער יכול לנבוע משיעור הצבעה או מהרכב הנשאלים.")}</p></header>
    <div class="cx2-grid">
      <div class="cx2-side"><section class="tr-card cx2-refs" aria-label="איפה כל מקור מציב את הגושים">
        <h3>איפה כל מקור מציב את הגושים</h3>
        ${refs.map(([label, v]) => `<div class="cx2-ref"><span>${esc(label)}</span>${split(v, label)}</div>`).join("")}
        <p class="cx2-legend"><span><i style="background:${R}"></i>ימין וחרדים</span><span><i style="background:${L}"></i>יתר הרשימות: מרכז–שמאל והרשימות הערביות</span><span><i class="cx2-half-key"></i>50%</span></p>
      </section>
      <details class="tr-card cx2-how"><summary>איך מחשבים · מי בכל גוש</summary><p>חלק הימין והחרדים נמדד מתוך כל הרשימות שמקבלות לפחות ${CROSS_MIN_SHARE}% מהקולות, גם מתחת לאחוז החסימה. יתר הרשימות, מרכז–שמאל והרשימות הערביות, הן המשלים.</p><p><b>נקודת הייחוס:</b> חלק הימין והחרדים ב־2022 (${r1(rightShare0)}%, מתוך ${fmt(Math.round(tot2022 / 1000) * 1000)} קולות שנספרו) ועוד הגידול הדמוגרפי עד 2026 (${pointsHe(growth)}), בסך הכול ${r1(base)}%.</p><p><b>במנדטים:</b> אילו איש לא החליף צד, הימין והחרדים היו מקבלים כ־${Math.round(zeroSeats)} מנדטים: 2022 כאילו מרצ עברה את אחוז החסימה (${histBlocs(COUNTERFACTUAL, S.hist.blocs || BLOCS_2022).netanyahu}), ועוד התוספת הדמוגרפית (${seatsHe(modelDrift()?.mean ?? 0)}). זו נקודת הבסיס של התחזית עצמה. 100 נקודות אחוז מהקולות הנספרים הן 120 מנדטים, ולכן כל נקודת אחוז היא 1.2 מנדטים.</p><p><b>הפער של מכון:</b> חלק הימין והחרדים בסקר האחרון שלו פחות נקודת הייחוס. הוא מתורגם לקולות לפי כ־${fmt(Math.round(votersOf(100) / 1000) * 1000)} המצביעים הצפויים ב־2026. הממוצע משוקלל לפי דרגות האמינות.</p></details></div>
      <section class="tr-card cx2-firms" aria-label="הסקר האחרון של כל מכון">
        <h3>הסקר האחרון של כל מכון</h3>
        <div class="cx2-row cx2-cols" aria-hidden="true"><span></span><span>מכון</span><span>ימין וחרדים · יתר הרשימות <small>קו מקווקו = הצפי הדמוגרפי</small></span><span>מול הצפי</span><span>בקולות</span></div>
        ${sorted.map(r => `<div class="cx2-row" title="${esc(`${name(r)} · ${r.date}${r.below.length ? " · מתחת לסף אך נספר: " + r.below.map(id => `${partyMeta(id).name} ${r1(100 * r.series.parties[id] / 120)}%`).join(", ") : ""}`)}">
          ${logoBox(r.meta, 26)}<span class="cx2-name"><b>${esc(name(r))}</b><small>${esc(r.date)}</small></span>
          <div class="cx2-bar">${split(r.share, name(r))}<i class="cx2-exp" style="inset-inline-start:${(100 - base).toFixed(2)}%" title="הצפי הדמוגרפי ${r1(base)}%"></i></div>
          <b class="cx2-d" dir="ltr">${sign(r.delta)}</b><span class="cx2-v" dir="ltr">${Math.abs(r.delta) < 0.05 ? "—" : `≈ ${kv(r.voters)}`}</span></div>`).join("")}
        <p class="cx2-sum">${above} מכונים מעל הצפי הדמוגרפי ו־${below} מתחתיו. הפער בין הקצוות: ${pointsHe(spread)}, כ־${kv(votersOf(spread))} קולות.</p>
      </section>
    </div>`;
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

/* המספרים הלאומיים של 2022 — משמשים גם את עמוד "בחירות 2022" וגם את שלב 1 של המודל */
function natStatsHTML() {
  const N = S.regions.national;
  return [[fmt(N.eligible), "בעלי זכות בחירה"], [pct(N.turnout), "אחוז הצבעה ארצי"], [fmt(N.valid), "קולות כשרים"], [N.threshold + "%", "אחוז החסימה"]]
    .map(([n, l]) => `<div><b class="num" style="font-size:1.7rem">${n}</b><span>${esc(l)}</span></div>`).join("");
}
function baseBlocsHTML() {
  const R = S.regions, N = R.national, w = R.wasted;
  const r22 = S.hist ? histBlocs(S.hist.actual || {}, S.hist.blocs || BLOCS_2022).netanyahu : 64;
  const nb = 120 - r22, vN = w.blocNetanyahu, vO = w.blocChange;
  return `<div class="base-row"><span class="base-lbl">בקולות</span>
      <div class="base-blocbar votes" role="img" aria-label="גוש הימין והחרדים ${fmt(vN)} קולות, מרכז–שמאל והרשימות הערביות ${fmt(vO)} קולות">
        <span style="flex:${vN};background:${BLOCS.Right.color}"><b>${fmt(vN)}</b> גוש הימין והחרדים · ${pct(100 * vN / (vN + vO))}</span>
        <span style="flex:${vO};background:${BLOCS.Left.color}"><b>${fmt(vO)}</b> מרכז–שמאל והרשימות הערביות · ${pct(100 * vO / (vN + vO))}</span></div></div>
    <div class="base-row"><span class="base-lbl">במנדטים</span>
      <div class="base-blocbar" role="img" aria-label="גוש הימין והחרדים ${r22}, מרכז–שמאל והרשימות הערביות ${nb}">
        <span style="flex:${r22};background:${BLOCS.Right.color}"><b>${r22}</b></span>
        <span style="flex:${nb};background:${BLOCS.Left.color}"><b>${nb}</b></span>
        <i class="bc-61" title="קו הרוב: מעבר לאמצע = 61 ומעלה"></i></div></div>
    <div class="base-drama"><b>ב־2022 מרכז–שמאל והרשימות הערביות קיבלו ${fmt(w.blocGap)} קולות יותר מגוש הימין והחרדים, ו־56 מנדטים מול 64.</b> ההבדל נובע מכללי הבחירות: ${fmt(w.total)} קולות של רשימות שלא עברו את אחוז החסימה (מרצ ${fmt(w.meretz)}, בל״ד ${fmt(w.balad)}) לא הפכו למנדטים; מרצ החמיצה את הסף ב־${fmt(w.meretzGap)} קולות.</div>
    <p class="sec-note base-note">גוש הימין והחרדים = הליכוד, ש״ס, יהדות התורה והציונות הדתית. מרכז–שמאל והרשימות הערביות = יש עתיד, המחנה הממלכתי, העבודה, ישראל ביתנו, מרצ, רע״מ, חד״ש–תע״ל ובל״ד. נספרות רשימות שקיבלו 1.5% ומעלה; הבית היהודי (${fmt(N.parties.find(p => p.id === "jewish_home")?.votes || 0)}, 1.19%) אינו נספר. מקור: <a href="${esc(w.source.url)}" target="_blank" rel="noopener">${esc(w.source.name)} ↗</a>.</p>`;
}

/* שלב 1 של המודל הדמוגרפי + שורת המקור של שלב 2 */
function renderResultsBase() {
  const R = S.regions, r22 = S.hist ? histBlocs(S.hist.actual || {}, S.hist.blocs || BLOCS_2022).netanyahu : 64;
  $("#nat-stats").innerHTML = natStatsHTML();
  $("#base-blocs").innerHTML = baseBlocsHTML();
  $("#map-takeaway").innerHTML = `<b>מה לומדים מזה לתחזית:</b> זו נקודת המוצא של כל בדיקה באתר — וגם האזהרה שלה. רוב של ${r22} אינו ״בסיס״ מובטח: בקולות הגושים היו שקולים, וההכרעה נפלה על אחוז החסימה. לכן התחזית סופרת גם רשימות שמתחת לסף, ולא רק מנדטים, ולכן שינוי קטן בגודל הקבוצות (שלבים 2–5) יכול להכריע.`;
  const votersSum = S.demo ? S.demo.sectors.reduce((t, x) => t + x.eligible2022 * x.turnout, 0) : 0;
  const rs = R.religiosity.source, as = R.sectors.find(x => x.id === "arab")?.source;
  $("#relig-source").innerHTML = `${votersSum ? `סכום המצביעים לפי הקבוצות (~${fmt(Math.round(votersSum / 1000) * 1000)}) גבוה מעט ממספר הקולות הכשרים (${fmt(R.national.valid)}): שיעורי ההצבעה של הקבוצות הם אומדנים ממקורות שונים, וכוללים גם קולות פסולים. ` : ""}${esc(R.religiosity.title)} — מקור: <a href="${esc(rs.url)}" target="_blank" rel="noopener">${esc(rs.name)} ↗</a>${as ? `. המגזר הערבי — מקור: <a href="${esc(as.url)}" target="_blank" rel="noopener">${esc(as.name)} ↗</a>` : ""}`;
}

/* עמוד "בחירות 2022": התוצאה הלאומית, המפה, רשימת היישובים ופילוחי המגזרים */
/* תוצאת האמת של 2022 לכל קבוצת זהות במודל: ארבע הקבוצות היהודיות מסקר
   ההגדרה הדתית, הקבוצה הערבית מתוצאות היישובים הערביים והדרוזיים. */
function identityVote2022(secId) {
  const R = S.regions, D = S.demo;
  /* קולות 2022 של כל רשימה × חלקה של הקבוצה בקהל המצביעים שלה (הרכב המצביעים
     במודל, מכויל על סקרי IDI) → כמה מקולות הקבוצה הלכו לכל רשימה. */
  const rows = D.parties2022.map(p => ({ id: p.id, name: p.name, camp: p.camp, v: p.votes * (p.mix[secId] || 0) })).filter(x => x.v > 0);
  const tot = rows.reduce((t, x) => t + x.v, 0);
  if (!tot) return null;
  rows.sort((a, b) => b.v - a.v);
  const items = rows.slice(0, 4).map(x => ({ name: x.name, pct: 100 * x.v / tot, votes: x.v, color: R.partyColors[x.id] || "#96A0AB" }));
  const campSum = c => rows.filter(x => c.includes(x.camp)).reduce((t, x) => t + x.v, 0);
  const blocs = [
    { k: "right", label: "ימין וחרדים", v: campSum(["right", "haredi"]), color: BLOCS.Right.color },
    { k: "center", label: "מרכז–שמאל", v: campSum(["center"]), color: BLOCS.Left.color },
    { k: "arab", label: "רשימות ערביות", v: campSum(["arab"]), color: BLOCS.Arabs.color }
  ].filter(b => b.v / tot >= .005);
  const rightShare = 100 * campSum(["right", "haredi"]) / tot;
  const nm = { haredi:"חרדים", dati:"דתיים לאומיים", mesorati:"מסורתיים", hiloni:"חילונים" }[secId];
  const note = secId === "arab" ? R.sectors.find(x => x.id === "arab")?.desc : R.religiosity.rows.find(r => r.group === nm)?.note;
  return { items, blocs, note, rightShare, total: tot };
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
  /* חלקי הגושים נמדדים לפי הכלל האחיד באתר: רשימה נספרת רק אם קיבלה 1.5% ומעלה
     ב־2022 (הבית היהודי, 1.19%, אינו נספר באף גוש). המנדטים מחושבים מכל הרשימות. */
  const counted = new Set(D.parties2022.filter(p => 100 * p.votes / D.meta.validVotes2022 >= CROSS_MIN_SHARE).map(p => p.id));
  const campVotes = {};
  Object.entries(votes).forEach(([id, v]) => { if (counted.has(id)) campVotes[camp[id]] = (campVotes[camp[id]] || 0) + v; });
  const campTotal = Object.values(campVotes).reduce((a, b) => a + b, 0);
  return { votes, totalValid, thr, passing, seats, campVotes, campTotal,
           failed: Object.keys(votes).filter(k => !(k in passing)) };
}

/* חלוקת 120 מנדטים פרופורציונלית בין ארבעת הגושים — שארית גדולה, בלי אחוז חסימה */
const blocSeats = m => largestRemainder(Object.fromEntries(
  Object.entries(m.campVotes).map(([c, v]) => [c, v / m.campTotal * 120])), 120);

const BLOC_LABEL = { right: "ימין", center: "שמאל", haredi: "חרדים", arab: "ערבים" };

const seatsHe = n => Math.abs(Math.round(n * 10) / 10) === 1 ? "מנדט אחד" : `${r1(Math.abs(n))} מנדטים`;
const pointsHe = n => Math.abs(Math.round(n * 10) / 10) === 1 ? "נקודת אחוז אחת" : `${r1(Math.abs(n))} נקודות אחוז`;
const kfmt = v => fmt(Math.round(v / 1000) * 1000);          // עיגול לאלפים — מספרים מוערכים

/* שלב 2 — מי גדל ובכמה מאז ספטמבר 2019: פנקס הבוחרים לפי סוג היישוב (data/sector-growth.json,
   scripts/build-locality-trends.mjs). הקצב שנמדד מופיע גם ליד כל הנחה בשלב 4. */
const GROWTH_COLORS = { jewish: "#2563B0", haredi: "#6A5A9C", arab: "#2A7A5E", bedouin: "#8A6318", mixed: "#B8862B" };
async function renderGrowth2019() {
  const el = $("#growth-2019"); if (!el) return;
  if (!S.growth2019) {
    S.growth2019 = window.__BAROMETER_DATA__?.["data/sector-growth.json"]
      || await fetch("data/sector-growth.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!S.growth2019) { el.closest("[data-dm-panel]").hidden = true; $('[data-dm-tab="growth"]')?.setAttribute("hidden", ""); return; }
    renderDemoControls();
    renderDemoConclusions();
  }
  const G = S.growth2019, E = G.meta.elections, last = E.length - 1;
  const label = e => e.label.replace("ספטמבר ", "9.");
  const rows = [...G.sectors].sort((a, b) => b.eligible[last] - a.eligible[last]);
  const tot = { name: "כל היישובים", localities: rows.reduce((t, s) => t + s.localities, 0), eligible: E.map((_, k) => rows.reduce((t, s) => t + s.eligible[k], 0)),
    voted: E.map((_, k) => rows.reduce((t, s) => t + s.voted[k], 0)), eligible26: rows.reduce((t, s) => t + s.eligible26, 0), growth: G.national.growth };
  const change = s => 100 * (s.eligible[last] - s.eligible[0]) / s.eligible[0];
  const top = Math.max(...rows.map(change));
  const turn = (s, k) => s.eligible[k] ? 100 * s.voted[k] / s.eligible[k] : 0;
  const row = (s, cls = "") => `<tr class="${cls}">
      <th scope="row" class="gcell">${s.id ? `<i style="background:${GROWTH_COLORS[s.id] || "#6B7580"}"></i>` : ""}${esc(s.name)}<small class="g-sub">${fmt(s.localities)} יישובים</small></th>
      ${s.eligible.map(v => `<td class="n">${fmt(v)}</td>`).join("")}
      <td class="n g-change"><span class="g-bar" style="--w:${Math.max(0, 100 * change(s) / top).toFixed(1)}%;--c:${GROWTH_COLORS[s.id] || "#6B7580"}"></span><b>+${pct(change(s))}</b></td>
      <td class="n"><b>${pct(s.growth)}</b></td>
      <td class="n">${fmt(s.eligible26)}</td>
      <td class="n g-turn">${E.map((_, k) => pct(turn(s, k))).join(" · ")}</td></tr>`;
  el.innerHTML = `<table class="dtable g2019"><thead><tr><th>סוג היישוב</th>${E.map(e => `<th class="n">${esc(label(e))}</th>`).join("")}<th class="n">שינוי</th><th class="n">בשנה</th><th class="n">2026 · צפוי</th><th class="n">אחוז הצבעה · ${esc(label(E[0]))}–${esc(label(E[last]))}</th></tr></thead>
    <tbody>${rows.map(s => row(s)).join("")}</tbody><tfoot>${row(tot, "g-total")}</tfoot></table>`;
  const by = Object.fromEntries(rows.map(s => [s.id, s]));
  const fast = rows.filter(s => s.growth > tot.growth).sort((a, b) => b.growth - a.growth);
  $("#growth-takeaway").innerHTML = `<b>מה לומדים מזה:</b> מספטמבר 2019 עד נובמבר 2022 כל בעלי זכות הבחירה גדלו ב־${pct(G.national.growth)} בשנה. מהר יותר — ${fast.map(s => `${esc(s.name)} (${pct(s.growth)})`).join(", ")}; ${by.jewish ? `היישובים היהודיים האחרים — ${pct(by.jewish.growth)}` : ""}${by.mixed ? `, הערים המעורבות — ${pct(by.mixed.growth)}` : ""}. ההנחות בשלב 4 הן לפי קבוצות זהות ולא לפי יישובים, ולכן ליד כל אחת מופיע גם הקצב שנמדד כאן.`;
}
/* הקצב שנמדד מאז ספטמבר 2019 לכל קבוצת זהות — לפי סוג היישוב הקרוב לה */
function measuredGrowth(secId) {
  const G = S.growth2019; if (!G) return null;
  const by = Object.fromEntries(G.sectors.map(s => [s.id, s]));
  const pick = { haredi: ["haredi"], arab: ["arab", "bedouin"], dati: ["jewish"], mesorati: ["jewish"], hiloni: ["jewish"] }[secId];
  if (!pick || !pick.every(k => by[k])) return null;
  const w = pick.map(k => by[k].eligible[by[k].eligible.length - 1]), tw = w.reduce((a, b) => a + b, 0);
  const ADJ = { jewish: "היהודיים", haredi: "החרדיים", arab: "הערביים והדרוזיים", bedouin: "הבדואיים" };
  return { rate: pick.reduce((t, k, i) => t + by[k].growth * w[i] / tw, 0), where: pick.map(k => ADJ[k]).join(" ו") };
}

function renderDemography() {
  renderGrowth2019();         // שלב 2 — מי גדל מאז ספטמבר 2019
  renderIdentityTable();      // שלב 3 — מי הצביע ב־2022
  renderDemoControls();       // שלב 4 — ההנחות
  renderResultTable();        // שלב 5א — כמה יצביעו ב־2026
  renderDemoComparison();     // שלב 5ב — רשימת השינוי והמסלול השנתי (upgrade.js)
  renderBlocPies();           // שלב 5ב — שתי העוגות במקום עמודות האחוזים
  const m0 = runDemoModel(0), m1 = runDemoModel(S.demo.meta.years);
  const sh = (m, c) => 100 * (m.campVotes[c] || 0) / m.campTotal;
  const d = (sh(m1, "right") + sh(m1, "haredi")) - (sh(m0, "right") + sh(m0, "haredi"));
  const seats = d / 100 * 120;
  const md = modelDrift();
  renderDemoConclusions();
  $("#demo-takeaway").innerHTML = `<b>מה לומדים מזה לתחזית:</b> בלי אף סקר, הדמוגרפיה לבדה ${d >= 0 ? "מוסיפה" : "גורעת"} לימין ולחרדים ${pointsHe(d)} עד 2026 — כ־${seatsHe(seats)}. זו התחזית העצמאית לגודל הגושים. ${md && md.geographic != null ? `יחד עם המודל הגיאוגרפי (${seatsHe(md.geographic)}) היא קובעת את ״התוספת הדמוגרפית״ בתחזית הברומטר: הממוצע, ${seatsHe(md.seats)}.` : ""} הזיזו את הידיות בשלב 4 כדי לראות כמה ההנחה הזו רגישה.`;
}

/* המסקנות: העמודה שליד הכרטיסיות, משפט הכותרת, ושורת מסקנה בראש כל כרטיסייה.
   מחושבות מאותו מודל ומאותן הנחות, ומתעדכנות עם כל הזזת ידית. */
function renderDemoConclusions() {
  const D = S.demo; if (!D || !$("#dm-conclusions")) return;
  const years = D.meta.years, P = demoParams();
  const rh = m => 100 * ((m.campVotes.right || 0) + (m.campVotes.haredi || 0)) / m.campTotal;
  const m0 = runDemoModel(0), m1 = runDemoModel(years), d = rh(m1) - rh(m0);
  /* מנדטים לכל גוש לפי כללי הבחירות (בדר־עופר והסכמי העודפים, כמו runDemoModel) */
  const camp = Object.fromEntries(D.parties2022.map(p => [p.id, p.camp]));
  const blocs = m => Object.entries(m.seats).reduce((a, [id, n]) => { a[camp[id] === "right" || camp[id] === "haredi" ? 0 : 1] += n; return a; }, [0, 0]);
  const [R22, L22] = blocs(m0), [R26, L26] = blocs(m1), dR = R26 - R22, seats = dR;
  /* רגישות: אחוז ההצבעה של האזרחים הערבים ±10 נקודות מההנחה הנוכחית */
  const withArab = dt => {
    const keep = S.demoOverrides, base = P.arab?.turnout;
    if (base == null) return null;
    S.demoOverrides = { ...keep, arab: { ...(keep.arab || {}), turnout: Math.min(.95, Math.max(.2, base + dt)) } };
    try { return rh(runDemoModel(years)); } finally { S.demoOverrides = keep; }
  };
  const hi = withArab(.10), lo = withArab(-.10), swing = hi == null ? null : Math.abs(lo - hi) * 1.2 / 2;
  const secs = sectorsBySize(), fast = [...secs].sort((a, b) => P[b.id].growth - P[a.id].growth), slow = fast.at(-1);
  const ids = S.regions ? secs.map(sc => ({ sc, v: identityVote2022(sc.id) })).filter(x => x.v) : [];
  const top = ids.length ? ids.reduce((a, b) => b.v.rightShare > a.v.rightShare ? b : a) : null;
  const low = ids.length ? ids.reduce((a, b) => b.v.rightShare < a.v.rightShare ? b : a) : null;
  const md = modelDrift();
  const sgn = x => `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
  const times = fast[0] && slow && P[slow.id].growth > 0 ? P[fast[0].id].growth / P[slow.id].growth : null;
  const changed = Object.keys(S.demoOverrides).length > 0;

  $("#dm-verdict").innerHTML = `בלי אף סקר: הגידול באוכלוסייה לבדו מביא את הימין והחרדים ל־<b>${R26} מנדטים</b> ב־2026 (${R22} ב־2022)${changed ? " · לפי ההנחות ששונו" : ""}.`;
  $("#dm-conclusions").innerHTML = `
    <div class="dm-big" style="--c:${BLOCS.Right.color}"><b>${dR > 0 ? "+" : dR < 0 ? "−" : "±"}${Math.abs(dR)}</b><span>מנדטים לימין ולחרדים עד 2026</span><small>לפי כללי הבחירות · ${sgn(d)} נק׳ אחוז מכלל המצביעים — בלי שאף אחד משנה את דעתו</small></div>
    <figure class="dm-seats" role="img" aria-label="מנדטים צפויים לפי כללי הבחירות. 2022: ימין וחרדים ${R22}, מרכז־שמאל וערבים ${L22}. 2026: ימין וחרדים ${R26}, מרכז־שמאל וערבים ${L26}.">
      <figcaption>מנדטים צפויים לכל גוש</figcaption>
      ${[["2022", R22, L22], ["2026", R26, L26]].map(([y, r, l]) => `<div class="dm-seats-row${y === "2026" ? " is-next" : ""}"><span>${y}</span><div class="dm-seats-bar"><i style="flex:${r};background:${BLOCS.Right.color}"><b>${r}</b></i><i style="flex:${l};background:${BLOCS.Left.color}"><b>${l}</b></i><em aria-hidden="true"></em></div></div>`).join("")}
      <div class="dm-seats-key"><span><i style="background:${BLOCS.Right.color}"></i>ימין וחרדים</span><span><i style="background:${BLOCS.Left.color}"></i>מרכז־שמאל וערבים</span><span class="dm-61">61 · רוב</span></div>
    </figure>
    <ol class="dm-points">
      ${fast[0] && slow ? `<li><b>${esc(fast[0].name)} גדלים הכי מהר</b> — ${pct(P[fast[0].id].growth * 100)} בשנה, מול ${pct(P[slow.id].growth * 100)} אצל ה${esc(slow.name)}${times && times >= 2 ? ` (פי ${Math.round(times)})` : ""}.</li>` : ""}
      ${top ? `<li><b>הזהות מכריעה את ההצבעה</b> — ${esc(top.sc.name)}: ${Math.round(top.v.rightShare)}% לימין ולחרדים; ${esc(low.sc.name)}: ${Math.round(low.v.rightShare)}%.</li>` : ""}
      ${swing != null ? `<li><b>אחוז ההצבעה הערבי רגיש</b> — 10 נקודות למעלה או למטה מזיזות כ־${seatsHe(swing)}.</li>` : ""}
      <li><b>מול תחזית הברומטר</b> — שם התוספת הדמוגרפית היא ממוצע שני המודלים${md ? `: ${seatsHe(md.mean)}, מעוגל ל־${seatsHe(md.seats)}` : ""}.</li>
    </ol>`;

  const lead = (id, html) => { const el = $("#dm-lead-" + id); if (el) el.innerHTML = html; };
  lead("result", `120 המנדטים נשארים 120 — אבל קבוצה שגדלה מהר ״לוקחת״ חלק מהקבוצות האחרות. נטו: <b>${dR === 0 ? "בלי שינוי בין הגושים" : `${seatsHe(dR)} ${dR > 0 ? "יותר" : "פחות"} לימין ולחרדים`}</b> (${R22}←${R26}).`);
  const w = S.regions?.wasted;
  if (w) lead("base", `ב־2022 מרכז–שמאל והרשימות הערביות קיבלו <b>${fmt(w.blocGap)} קולות יותר</b> מגוש הימין והחרדים, ו־56 מנדטים מול 64: ${fmt(w.total)} קולות של רשימות שלא עברו את אחוז החסימה לא הפכו למנדטים.`);
  const G = S.growth2019;
  if (G) { const hs = G.sectors.find(x => x.id === "haredi"); lead("growth", `מספטמבר 2019 בעלי זכות הבחירה גדלו ב־<b>${pct(G.national.growth)} בשנה</b>${hs ? `; ביישובים החרדיים — <b>${pct(hs.growth)}</b>${G.national.growth > 0 ? `, פי ${r1(hs.growth / G.national.growth)}` : ""}` : ""}.`); }
  if (top) lead("identity", `הזהות מנבאת את ההצבעה: <b>${esc(top.sc.name)} — ${Math.round(top.v.rightShare)}%</b> לימין ולחרדים, <b>${esc(low.sc.name)} — ${Math.round(low.v.rightShare)}%</b>. לכן שינוי בגודל הקבוצות מזיז את הגושים.`);
  lead("assume", `רק שני דברים משתנים: <b>גודל כל קבוצה</b> ו<b>שיעור ההצבעה שלה</b>. הרגלי ההצבעה של 2022 נשארים. ${changed ? "ההנחות שונו — המסקנות מימין מחושבות לפיהן." : "הזיזו ידית — המסקנות מימין מתעדכנות."}`);
}

/* הכרטיסיות של המודל הדמוגרפי */
function setDemoTab(tab, focus = false) {
  const tabs = $$("[data-dm-tab]"); if (!tabs.length) return;
  if (!tabs.some(t => t.dataset.dmTab === tab && !t.hidden)) tab = "result";
  S.demoTab = tab;
  tabs.forEach(t => { const on = t.dataset.dmTab === tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  $$("[data-dm-panel]").forEach(p => { p.hidden = p.dataset.dmPanel !== tab; });
}

/* תא ראשון בכל טבלה: נקודת צבע + שם הקבוצה. אותו סדר שורות בכל שלב. */
const groupCell = s => `<th scope="row" class="gcell"><i style="background:${s.color}"></i>${esc(s.name)}</th>`;
/* אותו סדר בכל השלבים: מהקבוצה הגדולה לקטנה */
const sectorsBySize = () => [...S.demo.sectors].sort((a, b) => b.eligible2022 - a.eligible2022);

/* שלב 2 — מי הצביע ב־2022: גודל, הצבעה, ארבע הרשימות, גושים */
function renderIdentityTable() {
  const D = S.demo, secs = sectorsBySize();
  const totalEl = D.sectors.reduce((t, s) => t + s.eligible2022, 0);
  $("#electorate-bar").innerHTML = `<div class="elect-bar" role="img" aria-label="${esc(secs.map(s => `${s.name} ${pct(100 * s.eligible2022 / totalEl)}`).join(", "))}">${
      secs.map(s => `<span style="flex:${s.eligible2022};background:${s.color};color:${textOnColor(s.color)}" title="${esc(s.name)}: ${fmt(s.eligible2022)} בעלי זכות בחירה">${100 * s.eligible2022 / totalEl >= 8 ? `${esc(s.name)} ${Math.round(100 * s.eligible2022 / totalEl)}%` : ""}</span>`).join("")
    }</div><p class="elect-note">${fmt(totalEl)} בעלי זכות בחירה ב־2022, לפי חמש קבוצות זהות</p>`;
  let rightTop = null, rightLow = null;
  $("#identity-table").innerHTML = `<table class="dtable"><thead><tr><th>קבוצה</th><th class="n">בעלי זכות בחירה</th><th class="n">הצביעו</th><th class="n">מצביעים</th><th>לאילו רשימות · ארבע הגדולות</th><th>לאיזה גוש</th></tr></thead><tbody>${
    secs.map(s => {
      const v = S.regions ? identityVote2022(s.id) : null;
      const voters = s.eligible2022 * s.turnout;
      if (v) { if (!rightTop || v.rightShare > rightTop.v) rightTop = { n: s.name, v: v.rightShare }; if (!rightLow || v.rightShare < rightLow.v) rightLow = { n: s.name, v: v.rightShare }; }
      return `<tr data-sector="${s.id}" style="--c:${s.color}">
        ${groupCell(s)}
        <td class="n">${fmt(s.eligible2022)}</td>
        <td class="n">${pct(s.turnout * 100)}</td>
        <td class="n">~${kfmt(voters)}</td>
        <td>${v ? `<div class="pbar">${v.items.map(it => `<span style="flex:${it.pct};background:${it.color}" title="${esc(it.name)} ${pct(it.pct)}"></span>`).join("")}<span class="rest" style="flex:${Math.max(0, 100 - v.items.reduce((t, it) => t + it.pct, 0))}"></span></div>
            <div class="plegend">${v.items.map(it => `<span><i style="background:${it.color}"></i>${esc(it.name)} <b>${pct(it.pct)}</b> <small>~${kfmt(it.votes)}</small></span>`).join("")}</div>` : "—"}</td>
        <td>${v ? `<div class="pbar">${v.blocs.map(b => `<span style="flex:${b.v};background:${b.color}" title="${esc(b.label)}"></span>`).join("")}</div>
            <div class="plegend">${v.blocs.map(b => `<span><i style="background:${b.color}"></i>${esc(b.label)} <b>${pct(100 * b.v / v.total)}</b> <small>~${kfmt(b.v)}</small></span>`).join("")}</div>` : "—"}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
  $("#identity-takeaway").innerHTML = rightTop ? `<b>מה לומדים מזה לתחזית:</b> הזהות מנבאת את ההצבעה כמעט לחלוטין: ${esc(rightTop.n)} נותנים ${Math.round(rightTop.v)}% לימין ולחרדים, ${esc(rightLow.n)} ${Math.round(rightLow.v)}%. לכן שינוי בגודל הקבוצות (שלב 4) מזיז את מאזן הגושים גם בלי שאף אחד ישנה את דעתו — וזה בדיוק מה שהמודל מודד. הפילוח הפנימי של החילונים — כ־${Math.round(identityVote2022("hiloni")?.rightShare || 0)}% ימין מול ${Math.round(100 - (identityVote2022("hiloni")?.rightShare || 0))}% מרכז־שמאל — נגזר מהצבעתם, לא ממדידה נפרדת.` : "";
}

/* שלב 3 — ההנחות: אחוז הצבעה וגידול, ידית לכל קבוצה */
function renderDemoControls() {
  const D = S.demo, P = demoParams();
  $("#demo-controls").innerHTML = `<table class="dtable dtable-ctl"><thead><tr><th>קבוצה</th><th>אחוז הצבעה ב־2026 <small>(ב־2022)</small></th><th>גידול שנתי בבעלי זכות הבחירה</th><th>על מה זה מבוסס</th></tr></thead><tbody>${
    sectorsBySize().map(s => {
      const g = P[s.id].growth, t = P[s.id].turnout;
      return `<tr data-sector="${s.id}" style="--c:${s.color}">
        ${groupCell(s)}
        <td><label><span class="identity-lbl"><b class="num">${(t * 100).toFixed(0)}%</b><small>ב־2022: ${pct(s.turnout * 100)}</small></span>
          <input type="range" min="35" max="95" step="1" value="${(t * 100).toFixed(0)}" data-sec="${s.id}" data-kind="turnout" aria-label="אחוז הצבעה · ${esc(s.name)}"></label></td>
        <td><label><span class="identity-lbl"><b class="num">${(g * 100).toFixed(1)}%</b><small>${fmt(s.eligible2022)} → ${fmt(s.eligible2022 * Math.pow(1 + g, D.meta.years))}</small></span>
          <input type="range" min="-1" max="6" step="0.1" value="${(g * 100).toFixed(1)}" data-sec="${s.id}" data-kind="growth" aria-label="גידול שנתי · ${esc(s.name)}"></label></td>
        <td class="why"><p><b>בסיס:</b> גידול של ${pct(s.growth * 100)} בשנה${(m => m ? ` · <b>נמדד מאז 9.2019</b> ביישובים ${esc(m.where)}: ${pct(m.rate)}` : "")(measuredGrowth(s.id))}.</p><span class="src">מקור: <a href="${esc(D.sources[s.src].url)}" target="_blank" rel="noopener">${esc(D.sources[s.src].name)} ↗</a></span></td>
      </tr>`;
    }).join("")}</tbody></table>`;
  const changed = Object.keys(S.demoOverrides).length;
  $("#assump-note").textContent = changed ? "ההנחות שונו מערכי הבסיס — שלב 5 מחושב לפיהן." : "ההנחות הן ערכי הבסיס מהמקורות. הרגלי ההצבעה של 2022 אינם משתנים.";
}

/* שלב 4א — 120 מנדטים לא משתנים. מה שמשתנה הוא חלקה של כל קבוצה מכלל המצביעים,
   ולפי דפוס ההצבעה שלה ב־2022 — כמה מנדטים עוברים בין הגושים. הסכום תמיד 0. */
function renderResultTable() {
  const D = S.demo, P = demoParams(), years = D.meta.years, secs = sectorsBySize();
  const rows = secs.map(s => {
    const g = P[s.id].growth, t = P[s.id].turnout, v = S.regions ? identityVote2022(s.id) : null;
    const v22 = s.eligible2022 * s.turnout, v26 = s.eligible2022 * Math.pow(1 + g, years) * t;
    return { s, v22, v26, right: v ? v.rightShare / 100 : 0 };
  });
  const T22 = rows.reduce((t, r) => t + r.v22, 0), T26 = rows.reduce((t, r) => t + r.v26, 0);
  let netRight = 0;
  const body = rows.map(r => {
    const sh22 = r.v22 / T22, sh26 = r.v26 / T26, d = sh26 - sh22, seats = d * 120, toR = seats * r.right, toO = seats - toR;
    netRight += toR;
    const sg = x => Math.abs(x) < .05 ? "0" : `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
    return `<tr data-sector="${r.s.id}" style="--c:${r.s.color}">
      ${groupCell(r.s)}
      <td class="n">~${kfmt(r.v22)}<small>${pct(sh22 * 100)} מהמצביעים</small></td>
      <td class="n"><b>~${kfmt(r.v26)}</b><small>${pct(sh26 * 100)} מהמצביעים</small></td>
      <td class="n delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : "−"}${r1(Math.abs(d * 100))} נק׳</td>
      <td class="n"><b class="delta ${seats >= 0 ? "up" : "down"}">${sg(seats)}</b></td>
      <td class="n">${sg(toR)}</td>
      <td class="n">${sg(toO)}</td>
    </tr>`;
  }).join("");
  const sg = x => Math.abs(x) < .05 ? "0" : `${x >= 0 ? "+" : "−"}${r1(Math.abs(x))}`;
  $("#result-table").innerHTML = `<table class="dtable"><thead><tr><th>קבוצה</th><th class="n">מצביעים 2022</th><th class="n">מצביעים צפויים 2026</th><th class="n">שינוי בחלק</th><th class="n">≈ מנדטים</th><th class="n">לימין ולחרדים</th><th class="n">למרכז־שמאל ולערבים</th></tr></thead><tbody>${body}</tbody>
    <tfoot><tr><th scope="row">סך הכול</th><td class="n">~${kfmt(T22)}</td><td class="n"><b>~${kfmt(T26)}</b></td><td class="n">0</td><td class="n"><b>0</b> <small>120 נשארים 120</small></td><td class="n delta ${netRight >= 0 ? "up" : "down"}"><b>${sg(netRight)}</b></td><td class="n delta ${-netRight >= 0 ? "up" : "down"}"><b>${sg(-netRight)}</b></td></tr></tfoot></table>
    <p class="sec-note" style="margin-top:8px">בכנסת יש 120 מנדטים, וזה לא משתנה. מה שמשתנה הוא חלקה של כל קבוצה מכלל המצביעים — קבוצה שגדלה מהר יותר מהאחרות ״לוקחת״ מנדטים מהן. ״≈ מנדטים״ = השינוי בחלק × 120; לאן הם הולכים — לפי דפוס ההצבעה של הקבוצה ב־2022. החלוקה המדויקת בבדר־עופר מוצגת בגושים שלמטה.</p>`;
}

/* שלב 4ב — שתי עוגות: יחסי הכוחות בין ארבעת הגושים ב־2022 ובתרחיש 2026 */
function donutSVG(segs, centerBig, centerSmall) {
  const R = 60, C = 2 * Math.PI * R; let off = 0;
  const arcs = segs.map(sg => { const len = C * sg.share; const a = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${sg.color}" stroke-width="30" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(sg.label)} ${pct(sg.share * 100)}</title></circle>`; off += len; return a; }).join("");
  return `<svg viewBox="0 0 200 200" class="donut" role="img" aria-label="${esc(segs.map(sg => `${sg.label} ${pct(sg.share * 100)}`).join(", "))}">${arcs}
    <text x="100" y="96" text-anchor="middle" class="d-big">${esc(centerBig)}</text><text x="100" y="116" text-anchor="middle" class="d-small">${esc(centerSmall)}</text></svg>`;
}
function renderBlocPies() {
  const D = S.demo, order = ["right", "haredi", "arab", "center"], labels = { right: "ימין", haredi: "חרדים", arab: "ערבים", center: "מרכז–שמאל" };
  const m0 = runDemoModel(0), m1 = runDemoModel(D.meta.years);
  const pie = (m, year, note) => {
    const segs = order.map(c => ({ label: labels[c], color: D.camps[c].color, share: (m.campVotes[c] || 0) / m.campTotal }));
    const rh = 100 * (segs[0].share + segs[1].share);
    return `<article class="pie"><p class="kicker">${note}</p><h3>${year}</h3>${donutSVG(segs, pct(rh), "ימין וחרדים")}
      <ul class="pie-legend">${segs.map(sg => `<li><i style="background:${sg.color}"></i>${esc(sg.label)}<b>${pct(sg.share * 100)}</b></li>`).join("")}</ul></article>`;
  };
  $("#demo-share-chart").innerHTML = `<div class="pies">${pie(m0, 2022, "בסיס קבוע · תוצאות 2022")}<div class="pie-arrow" aria-hidden="true">←</div>${pie(m1, 2026, "תרחיש · לפי ההנחות שנבחרו")}</div>`;
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
const SOURCES = [
  { group: "תוצאות בחירות", items: [
    ["ועדת הבחירות המרכזית — תוצאות הכנסת ה־25", "https://votes25.bechirot.gov.il/", "הקולות והמנדטים הסופיים של 2022, לכל רשימה ולכל יישוב"],
    ["data.gov.il — קובץ התוצאות לפי יישובים", "https://data.gov.il/dataset/votes-knesset", "1,216 היישובים שעל המפה; המגזר החרדי ויהודה ושומרון מחושבים ממנו"],
    ["ועדת הבחירות — הכנסת ה־24 (2021)", "https://votes24.bechirot.gov.il/", "תוצאות האמת שמולן נמדדים המכונים ב־2021"],
    ["ועדת הבחירות — הכנסת ה־23 (2020)", "https://votes23.bechirot.gov.il/", "תוצאות האמת שמולן נמדדים המכונים ב־2020"]
  ]},
  { group: "סקרים", items: [
    ["המדד — מאגר סקרי הבחירות לכנסת ה־26", "https://themadad.com/polls26/", "המקור הראשי לעדכון הסקרים הנוכחיים"],
    ["Skarim — מאגר סקרי בחירות 2026", "https://www.skarim.org/", "מקור גיבוי וסקרים שנאספו קודם"],
    ["ויקיפדיה — הבחירות לכנסת ה־24: סקרים", "https://he.wikipedia.org/wiki/הבחירות_לכנסת_העשרים_וארבע#סקרים", "סקרי החודש שלפני בחירות 2021, לכיול המכונים"],
    ["ויקיפדיה — הבחירות לכנסת ה־23: סקרים", "https://he.wikipedia.org/wiki/הבחירות_לכנסת_העשרים_ושלוש#סקרים", "סקרי החודש שלפני בחירות 2020, לכיול המכונים"],
    ["ויקיפדיה — Opinion polling for the 2022 election", "https://en.wikipedia.org/wiki/Opinion_polling_for_the_2022_Israeli_legislative_election", "אימות סקר־סקר של ארכיון 2022 של האתר"],
    ["לכל הסקרים במאגר האתר", "#/polls", "ליד כל סקר מוצגים התאריך, המכון, כלי התקשורת והקישור למקור הנתונים שלו"]
  ]},
  { group: "דמוגרפיה ומגזרים", items: [
    ["מרכז טאוב — ישראל 2025: צומת דמוגרפי", "https://www.taubcenter.org.il/en/research/snr-2025-demography/", "קצבי הגידול של הקבוצות במודל הדמוגרפי"],
    ["המכון הישראלי לדמוקרטיה — הצבעה לפי הגדרה דתית", "https://www.idi.org.il/articles/64803", "איך הצביעה כל קבוצת זהות ב־2022; כיול הרכב המצביעים"],
    ["המכון הישראלי לדמוקרטיה — המגזר הערבי בבחירות 2022", "https://en.idi.org.il/articles/47986", "שיעור ההצבעה והחלוקה בין הרשימות במגזר הערבי"],
    ["המכון הישראלי לדמוקרטיה — חרדים בישראל 2050", "https://en.idi.org.il/articles/63385", "גודל האוכלוסייה החרדית וקצב גידולה"],
    ["דבר — תוצאות הבחירות לפי מצב כלכלי", "https://www.davar1.co.il/407506/", "ההצבעה לפי אשכול חברתי־כלכלי"]
  ]},
  { group: "המפה", items: [
    ["OpenStreetMap", "https://www.openstreetmap.org/", "גבולות ישראל, יהודה ושומרון ורצועת עזה במפה"],
    ["ויקינתונים (Wikidata)", "https://www.wikidata.org/", "מיקום היישובים, לפי סמל היישוב הרשמי (מאפיין P3466)"]
  ]},
  { group: "רקע", items: [
    ["Times of Israel — ניתוח פערי הקולות בין הגושים ב־2022", "https://www.timesofisrael.com/netanyahu-won-8-seat-majority-over-his-opponents-despite-near-parity-in-raw-votes/", "ההקשר ל״26,824 קולות״"],
    ["IFES Election Guide", "https://www.electionguide.org/elections/id/3970/", "סיכום התוצאות הרשמיות באנגלית"]
  ]}
];
function renderSources() {
  const flat = SOURCES.flatMap(g => g.items).filter(([, u]) => !u.startsWith("#"));
  $("#footer-sources").innerHTML = flat.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener"><span>${esc(n)}</span><span aria-hidden="true">↗</span></a>`).join("");
  const box = $("#method-sources"); if (!box) return;
  box.innerHTML = SOURCES.map(g => `<div class="sources-group"><h3>${esc(g.group)}</h3><ul>${g.items.map(([n, u, why]) =>
    `<li><a href="${esc(u)}" ${u.startsWith("#") ? "" : 'target="_blank" rel="noopener"'}>${esc(n)}${u.startsWith("#") ? "" : ' <span aria-hidden="true">↗</span>'}</a><span>${esc(why)}</span></li>`).join("")}</ul></div>`).join("");
}

/* עמוד "איך מחשבים": כל שלב עם המספר החי של היום */
function renderMethod() {
  renderSources();
  const cur = S.cur, polls = S.forecastPolls || [];
  const firms = [...new Set(polls.map(p => firmOf(p.sourceId).firm))], outlets = [...new Set(polls.map(p => p.channelHebrewName))];
  const heD = iso => new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" });
  $("#m-live-polls").innerHTML = [[polls.length, `סקרים ב־${FORECAST_MAX_AGE_DAYS} הימים האחרונים`], [firms.length, "מכונים"], [outlets.length, "כלי תקשורת"], [heD(cur.generatedAt), "עודכן לאחרונה"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  $("#m-outlets").innerHTML = [...new Set(cur.polls.map(p => p.channelHebrewName))].map(name => {
    const l = S.firms.outletLogos[name];
    return `<span title="${esc(name)}">${l ? `<img src="${esc(l)}" alt="${esc(name)}" loading="lazy">` : esc(name.slice(0, 3))}</span>`;
  }).join("");
  // 2 · firms and their weight in the mix
  const W = S.series.reduce((t, s) => t + firmWeight(s.meta), 0) || 1;
  const activeFirmIds = new Set(S.series.map(s => s.key));
  const inactiveFirms = S.firms.firms
    .filter(f => !activeFirmIds.has(f.id) && (f.calibrated || f.outlets?.length))
    .sort((a, b) => firmScore(b) - firmScore(a) || a.he.localeCompare(b.he, "he"));
  $("#m-firms").innerHTML = `<thead><tr><th>מכון</th><th>דרגה</th><th class="n">ציון</th><th class="n">סקרים בחלון</th><th class="n">משקל בתחזית</th><th>תיקון בתוך הגוש · תחזית הברומטר</th></tr></thead><tbody>${
    S.series.slice().sort((a, b) => firmScore(b.meta) - firmScore(a.meta)).map(s => {
      const sc = firmScore(s.meta), g = s.meta.calibrated ? gradeOf(sc) : { key: "none", label: "ללא דירוג · 70" };
      return `<tr><td><strong>${esc(s.meta.he)}</strong></td><td><span class="grade ${g.key}">${esc(g.label)}</span></td><td class="n">${r1(sc)}</td><td class="n">${s.polls.length}</td><td class="n"><b>${r1(100 * firmWeight(s.meta) / W)}%</b></td><td>${houseShiftHTML(houseShiftList(s.parties, S.seriesScenario?.find(x => x.key === s.key)?.parties || s.parties)) || "—"}</td></tr>`;
    }).join("")}${inactiveFirms.length ? `<tr class="m-firms-divider"><th colspan="6" scope="colgroup">מכונים נוספים · ללא סקר מנדטים בחישוב הנוכחי</th></tr>` : ""}${inactiveFirms.map(f => {
      const sc = firmScore(f), g = f.calibrated ? gradeOf(sc) : { key: "none", label: "ללא דירוג · 70" };
      const latest = S.cur.polls.filter(p => firmOf(p.sourceId).firm === f.id).sort((a, b) => parsePollDate(b) - parsePollDate(a))[0];
      const lastPoll = latest ? `סקר אחרון במאגר: ${heDate(parsePollDate(latest))}` : "אין סקר מנדטים במאגר הנוכחי";
      return `<tr class="m-firm-inactive"><td><strong>${esc(f.he)}</strong><small>${esc(lastPoll)}</small></td><td><span class="grade ${g.key}">${esc(g.label)}</span></td><td class="n">${r1(sc)}</td><td class="n">0</td><td class="n">—</td><td>—</td></tr>`;
    }).join("")}</tbody>`;
  // 3 · simple vs weighted, per party
  const simple = forecast("simple", HIDE_FROM_HOME), weighted = forecast("weighted", HIDE_FROM_HOME);
  const ss = allocateSeats(simple.parties), ws = allocateSeats(weighted.parties);
  const ids = [...new Set([...Object.keys(ss), ...Object.keys(ws)])].sort((a, b) => (ws[b] || 0) - (ws[a] || 0));
  $("#m-average").innerHTML = `<thead><tr><th>מפלגה</th><th class="n">ממוצע פשוט</th><th class="n">משוקלל אמינות</th><th class="n">הפרש</th></tr></thead><tbody>${
    ids.map(id => { const d = (ws[id] || 0) - (ss[id] || 0); return `<tr><td><strong>${esc(partyMeta(id).name)}</strong></td><td class="n">${ss[id] || 0}</td><td class="n"><b>${ws[id] || 0}</b></td><td class="n"><span dir="ltr" class="chip ${d > 0 ? "good" : d < 0 ? "bad" : ""}">${d > 0 ? "+" : ""}${d}</span></td></tr>`; }).join("")
  }<tr><th scope="row">סך הכול</th><td class="n">${Object.values(ss).reduce((t, v) => t + v, 0)}</td><td class="n"><b>${Object.values(ws).reduce((t, v) => t + v, 0)}</b></td><td></td></tr></tbody>`;
  // 4 · scenario assumptions (live)
  const sc = forecast("scenario", HIDE_FROM_HOME), o = S.scenarioOptions || {};
  const fx = sc.scenario?.fixed || FIXED_SEATS;
  $("#m-live-scenario").innerHTML = [[`${fx.shas} · ${fx.yahadut_hatora} · ${fx.raam}`, "ש״ס · יהדות התורה · רע״מ, קבועות"], [`${Math.round((o.blend ?? .5) * 100)}%`, "קירוב למאזן 2022"], [`+${r1(sc.scenario?.demographic ?? 0)}`, "תוספת דמוגרפית לימין, מנדטים"], [sc.scenario ? r1(sc.scenario.anchor + sc.scenario.demographic) : "—", "מנדטים שההנחות הזיזו היום"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  // 5 · demographic addition = mean of the demographic and geographic models
  {
    const md = sc.drift;
    if (md) $("#m-live-demo").innerHTML = [[md.demographic == null ? "—" : `${md.demographic >= 0 ? "+" : "−"}${r1(Math.abs(md.demographic))}`, "המודל הדמוגרפי, מנדטים"], [md.geographic == null ? "—" : `${md.geographic >= 0 ? "+" : "−"}${r1(Math.abs(md.geographic))}`, "המודל הגיאוגרפי, מנדטים"], [`${md.seats >= 0 ? "+" : "−"}${r1(Math.abs(md.seats))}`, "התוספת בתחזית: הממוצע, מעוגל לרבע מנדט"]]
      .map(([n, l]) => `<div><b class="num" dir="ltr">${n}</b><span>${esc(l)}</span></div>`).join("");
  }
  // תרחיש חרדי — תקציר בתחתית התחשיב
  try {
    const hs = harediState();
    $("#m-live-haredi").innerHTML = [[FIXED_SEATS.shas, "ש״ס בתחזית · 2022: 11"], [FIXED_SEATS.yahadut_hatora, "יהדות התורה בתחזית · 2022: 7"], [r1(hs.total), "התרחיש הדמוגרפי, שתיהן יחד"]]
      .map(([n, l]) => `<div><b class="num" dir="ltr">${n}</b><span>${esc(l)}</span></div>`).join("");
  } catch (e) { console.error(e); }
  // 6 · result
  const seats = allocateSeats(sc.parties), bt = {};
  Object.entries(seats).forEach(([id, n]) => { const al = partyMeta(id).alignment; bt[al] = (bt[al] || 0) + n; });
  $("#m-live-result").innerHTML = [[bt.Right || 0, "ימין וחרדים"], [bt.Left || 0, "מרכז־שמאל"], [bt.Arabs || 0, "הרשימות הערביות"], [Object.values(seats).reduce((t, v) => t + v, 0), "סך הכול מנדטים"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  const pairs = activeAgreements(sc.parties), rules = $("#m-rules");
  if (rules) rules.innerHTML = `<b>הסכמי עודפים בחישוב:</b> ${pairs.length ? pairs.map(([a, b]) => `${esc(partyMeta(a).name)}–${esc(partyMeta(b).name)}`).join(" · ") : "אין"}. ${esc(ELECTION_RULES.agreementsStatus)}.`;
  window.initMethodSim?.();
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

const EXIT_SHOWCASE_CHANNELS = [
  {id:"kan_news",name:"כאן 11",logo:"assets/logos/kan11.svg",photo:"assets/exit-2022-kan11.png"},
  {id:"channel_12",name:"חדשות 12",logo:"assets/logos/channel12.svg",photo:"assets/exit-2022-channel12.png"},
  {id:"channel_13",name:"חדשות 13",logo:"assets/logos/channel13.svg",photo:"assets/exit-2022-channel13.png"},
  {id:"channel_14",name:"ערוץ 14",logo:"assets/logos/channel14.png",photo:"assets/exit-2022-channel14.png"},
  {id:"i24news",name:"i24NEWS",logo:"assets/logos/i24news.png"}
];
const EXIT_SLIDE_MS = 9000;
const exitShowcaseState = {signature:"",cards:new Map(),timer:null};

function exitBlocHTML(values, labels, prefix) {
  const colors=["#e8b76a","#78a8e9","#9dca9a","#a9b3c2"];
  return `<div class="es-numbers" role="img" aria-label="${esc(prefix)}: ${values.map((n,i)=>`${labels[i]} ${n}`).join(' · ')}">${values.map((n,i)=>`<div class="es-number" style="--es-color:${colors[i]}"><b class="num">${n}</b><span>${esc(labels[i])}</span></div>`).join("")}</div>`;
}

function exitSample(live, channel) {
  const sample=live?.samples?.[channel.id] || (live?.sample?.sourceId===channel.id?live.sample:null);
  return sample?.parties?.length ? sample : null;
}

/* זיהוי הערוץ יושב בתוך השקופית עצמה — אין שורת כותרת נפרדת לכרטיס */
const exitLogoChip = channel => `<span class="es-slide-logo"><img src="${esc(channel.logo)}" alt="" loading="lazy"></span>`;

function exitSlideHTML(channel, kind, live) {
  if(kind==="current") {
    const sample=exitSample(live,channel);
    if(sample && Date.now()>=Date.parse(ELECTION_TIMELINE.exitPolls)) {
      const counts=liveBlocCounts(sample.parties), entries=[[counts.Right||0,"גוש הימין והחרדים"],[counts.Left||0,"מרכז־שמאל"],[counts.Arabs||0,"הרשימות הערביות"],[counts.Unknown||0,"ללא שיוך"]].filter(([n])=>n>0);
      return `<div class="es-content es-current">${exitLogoChip(channel)}<span class="es-photo-tag">מדגם 2026</span><h3>נתוני הגושים</h3>${exitBlocHTML(entries.map(e=>e[0]),entries.map(e=>e[1]),"מדגם 2026 של "+channel.name)}<small>מקור: ${esc(sample.sourceName||channel.name)}${sample.publishedAt?` · עודכן ${heDate(sample.publishedAt)}`:""}</small></div>`;
    }
    return `<div class="es-content es-waiting"><div class="es-wait-icon-wrap"><span class="es-wait-icon"><img class="es-wait-logo" src="${esc(channel.logo)}" alt="" loading="lazy"></span></div><h3>${Date.now()<Date.parse(ELECTION_TIMELINE.exitPolls)?"מחכים למדגם 2026":"ממתינים לנתוני המדגם"}</h3><p>חלוקת הגושים תופיע כאן עם פרסום הנתונים בערוץ.</p></div>`;
  }
  if(channel.id==="i24news") return `<div class="es-content es-brand es-brand-i24"><span class="es-eyebrow">מסך הערוץ</span><img src="assets/logos/i24news.png" alt="סמל i24NEWS" loading="lazy"><h3>i24NEWS</h3><p>מדגם ליל הבחירות</p></div>`;
  return `<div class="es-photo">${exitLogoChip(channel)}<img src="${channel.photo}" alt="צילום מדגם 2022 של ${esc(channel.name)}" loading="lazy"><span class="es-photo-tag">מדגם 2022</span></div>`;
}

function updateExitShowcaseSlides() {
  const grid=$("#exit-showcase-grid");
  if(!grid) return;
  const now=Date.now();
  for(const channel of EXIT_SHOWCASE_CHANNELS) {
    const state=exitShowcaseState.cards.get(channel.id),card=grid.querySelector(`[data-exit-channel="${channel.id}"]`);
    if(!state||!card) continue;
    if(now-state.started>=EXIT_SLIDE_MS) {state.index=(state.index+Math.floor((now-state.started)/EXIT_SLIDE_MS))%state.count;state.started=now;}
    /* נוגעים ב-DOM רק כשהשקופית באמת מתחלפת; כתיבה כל רבע שנייה מבטלת סגנונות לשווא */
    if(state.applied===state.index) continue;
    state.applied=state.index;
    card.querySelectorAll('.es-slide').forEach((slide,i)=>{const active=i===state.index;slide.classList.toggle('is-active',active);slide.setAttribute('aria-hidden',active?'false':'true');slide.inert=!active;});
  }
}

function renderExitShowcase(live) {
  const grid=$("#exit-showcase-grid");
  if(!grid) return;
  const signature=JSON.stringify({samples:live?.samples,sample:live?.sample,published:Date.now()>=Date.parse(ELECTION_TIMELINE.exitPolls)});
  if(signature!==exitShowcaseState.signature) {
    exitShowcaseState.signature=signature;
    grid.innerHTML=EXIT_SHOWCASE_CHANNELS.map(channel=>{
      const kinds=["current","photo"];
      if(!exitShowcaseState.cards.has(channel.id)) exitShowcaseState.cards.set(channel.id,{index:0,started:Date.now(),count:kinds.length});
      const state=exitShowcaseState.cards.get(channel.id);
      state.applied=null; /* המרקאפ נבנה מחדש — שהעדכון הבא יחיל שוב class/inert */
      return `<article class="es-card" data-exit-channel="${channel.id}" aria-label="${esc(channel.name)}">
        <div class="es-stage">${kinds.map((kind,i)=>`<div class="es-slide${i===state.index?' is-active':''}" data-kind="${kind}" aria-hidden="${i===state.index?'false':'true'}">${exitSlideHTML(channel,kind,live)}</div>`).join('')}</div>
      </article>`;
    }).join('');
  }
  updateExitShowcaseSlides();
  if(!exitShowcaseState.timer) exitShowcaseState.timer=setInterval(updateExitShowcaseSlides,250);
}

function renderNightCountdown(now = Date.now()) {
  const remaining = Math.max(0, Date.parse(ELECTION_TIMELINE.exitPolls) - now);
  const waiting = remaining > 0;
  const t = countdownParts(remaining);
  const clock = `<div class="night-clock" dir="ltr" role="timer" aria-live="off" aria-label="הזמן שנותר לפרסום המדגמים">${[[t.days,'ימים'],[t.hours,'שעות'],[t.minutes,'דקות'],[t.seconds,'שניות']].map(([value,label])=>`<div><b>${String(value).padStart(2,'0')}</b><span dir="rtl">${label}</span></div>`).join('')}</div>`;
  document.querySelectorAll('[data-night-countdown]').forEach(box => {
    const view=box.closest('.view');
    view.classList.toggle('night-waiting', waiting);
    box.hidden = !waiting;
    if (waiting) box.innerHTML = view.id==='view-live'
      ? `<div class="live-timer-row"><div class="live-timer-copy"><p class="kicker">ליל הבחירות · הכנסת ה־26</p><h2>עד שידור המדגמים</h2><p>27 באוקטובר 2026 · 22:00 · שעון ישראל</p></div>${clock}</div>`
      : `<p class="kicker">ליל הבחירות · הכנסת ה־26</p><h2>נפגשים במדגמים</h2><p>ביום הבחירות, 27 באוקטובר 2026, בשעה <strong>22:00</strong> — שעון ישראל.</p>${clock}<p class="night-note">המדגמים יופיעו כאן עם פרסומם, לאחר סגירת הקלפיות.</p><a class="btn ghost" href="#/">בינתיים, לתמונת המצב</a>`;
  });
  return waiting;
}

function renderLiveResults() {
  renderExitShowcase(S.live || {});
  if (renderNightCountdown()) return;
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
  if (renderNightCountdown()) return;
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
const VIEWS = { landing:"", home:"forecast", polls:"polls", e2022:"2022", map:"map", live:"live", results:"results", haredi:"haredi", demography:"demography", method:"method" };
/* כתובות ישנות שעדיין עשויות להיות מקושרות מבחוץ */
const VIEW_ALIASES = { regions:"map", swing:"map", "map/areas":"map", "forecast/coalition":"home", crossover:"polls", "polls/crossover":"polls", "polls/list":"polls", "polls/trend":"polls", "polls/gap":"polls", "polls/channels":"polls", "polls/firms":"polls", "polls/parties":"polls" };
const rendered = {};

function show(view) {
  if (!VIEWS.hasOwnProperty(view)) view = "landing";
  S.view = view;
  $$(".view").forEach(v => v.classList.toggle("on", v.id === "view-" + view));
  /* לשונית ראשית מסומנת גם כשמוצג אחד מתתי-הדפים שלה (data-group) */
  $$(".tab").forEach(t => {
    const grp = (t.dataset.group || "").split(/\s+/).filter(Boolean);
    t.setAttribute("aria-current", t.dataset.view === view || grp.includes(view) ? "page" : "false");
  });
  $$(".subtab").forEach(t => t.setAttribute("aria-current", t.dataset.view === view ? "page" : "false"));
  if (view === "haredi" && rendered[view]) renderHaredi();
  if (view === "polls" && rendered[view]) renderPolls();
  if (!rendered[view]) {
    try {
      if (view === "landing" || view === "home") renderHome();
      if (view === "polls") renderPolls();
      if (view === "e2022") render2022();
      if (view === "live") renderLiveResults();
      if (view === "results") renderOfficialResults();
      if (view === "haredi") renderHaredi();
      if (view === "map") window.renderR22?.();
      if (view === "demography") { renderResultsBase(); renderDemography(); }
      if (view === "method") renderMethod();
      rendered[view] = true;
    } catch (e) { console.error(e); }
  }
  if (view === "live" || view === "results") refreshLiveResults(true);
  const t = { landing:"התמונה הגדולה", home:"תחזית הברומטר", polls:"כל הסקרים", e2022:"דיוק המכונים", live:"ליל הבחירות · המדגמים", results:"ליל הבחירות · תוצאות האמת", haredi:"התרחיש החרדי", map:"המודל הגיאוגרפי", demography:"המודל הדמוגרפי", method:"שיטת החישוב" }[view];
  document.title = `${t} · הברומטר`;
  document.dispatchEvent(new Event("barometer:view"));
  if (view === "home") $("#view-home").scrollTop = 0;
  window.scrollTo({ top: 0, behavior: rendered[view] ? "auto" : "auto" });
}

function routeFromHash() {
  const h = (location.hash || "#/").replace(/^#\/?/, "");
  const view = VIEW_ALIASES[h] || Object.keys(VIEWS).find(k => VIEWS[k] === h) || "landing";
  show(view);
  if (h === "forecast/coalition") requestAnimationFrame(() => $("#election-coalition")?.scrollIntoView({ block: "start" }));
  /* הלשוניות של עמוד הסקרים (גם מהתפריט שבעמוד דיוק המכונים): פותחים כשהנתונים מוכנים */
  const [pollsTab, exMode] = { polls: ["gap"], "polls/gap": ["gap"], crossover: ["cross"], "polls/crossover": ["cross"], "polls/list": ["list"], "polls/trend": ["trend", "overview"], "polls/channels": ["trend", "channels"], "polls/firms": ["trend", "firms"], "polls/parties": ["trend", "parties"] }[h] || [];
  if (exMode) S.exploreMode = exMode;
  if (pollsTab) {
    let tries = 0;
    const go = () => (pollsTab !== "cross" || S.regions) && typeof setPollsTab === "function" ? (setPollsTab(pollsTab), window.scrollTo({ top: 0 })) : (++tries < 40 && setTimeout(go, 100));
    setTimeout(go, 0);
  }
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
  /* Portrait board by default; retain the visitor's explicit layout choice. */
  const applyWallLayout = () => { $(".board").classList.toggle("layout-size", S.wallLayout === "size"); $$("[data-wall-layout]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.wallLayout === S.wallLayout))); };
  try { S.wallLayout = localStorage.getItem("wallLayout") === "blocs" ? "blocs" : "size"; } catch { S.wallLayout = "size"; }
  applyWallLayout();
  $$("[data-wall-layout]").forEach(b => b.addEventListener("click", () => { S.wallLayout = b.dataset.wallLayout; try { localStorage.setItem("wallLayout", S.wallLayout); } catch {} applyWallLayout(); }));


  $$("[data-pollview]").forEach(b => b.addEventListener("click", () => {
    S.pollView = b.dataset.pollview;
    $$("[data-pollview]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#polls-cards").hidden = S.pollView !== "cards";
    $("#polls-compare").hidden = S.pollView !== "compare";
    $("#polls-average").hidden = S.pollView !== "average";
    $("#polls-table").hidden = S.pollView !== "table";
  }));

  ["#poll-firm", "#poll-outlet"].forEach(s => $(s).addEventListener("change", renderPolls));
  $("#calib-switch").addEventListener("click", e => {
    const b = e.target.closest("[data-calib]");
    if (!b) return;
    S.calibKey = b.dataset.calib;
    if (!counterfactualAvailable()) S.scen = "actual";
    render2022();
  });
  $("#arch-more")?.addEventListener("click", () => { S.archAll = !S.archAll; renderArchive(); $("#arch-more")?.focus(); });
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

  /* המספר ליד הידית מתעדכן תוך כדי גרירה; החישוב עצמו רץ בשחרור */
  $("#demo-controls").addEventListener("input", e => {
    const el = e.target; if (!el.dataset.sec) return;
    const b = el.closest("label")?.querySelector("b.num");
    if (b) b.textContent = (el.dataset.kind === "growth" ? Number(el.value).toFixed(1) : el.value) + "%";
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
  /* כרטיסיות המודל הדמוגרפי: לחיצה, וחצים בין הכרטיסיות */
  const dmTabs = $(".dm-tabs");
  dmTabs?.addEventListener("click", e => { const t = e.target.closest("[data-dm-tab]"); if (t) setDemoTab(t.dataset.dmTab); });
  dmTabs?.addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const list = $$("[data-dm-tab]").filter(t => !t.hidden), i = list.findIndex(t => t.dataset.dmTab === S.demoTab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (i + (e.key === "ArrowLeft" ? 1 : -1) + list.length) % list.length;   // RTL: שמאלה = הבאה
    e.preventDefault(); setDemoTab(list[next].dataset.dmTab, true);
  });

  $("#scen-switch")?.addEventListener("click", e => {
    const b = e.target.closest("[data-scen]"); if (!b) return;
    S.scen = b.dataset.scen; render2022();
  });
  $("#print-btn")?.addEventListener("click", () => window.print());
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
    /* [שנה, מפתח ייחודי, תווית קצרה, קובץ]. הכיול מתחיל ב־2020: מערכות ישנות יותר
       אינן מלמדות על מכון שהספיק ללמוד ולהשתנות מאז. */
    const EXTRA_CALIB = [[2021, "2021", "2021", "data/historical-polls-2021.json"], [2020, "2020", "2020", "data/historical-polls-2020.json"]];
    /* Optional resources start alongside the core files. Waiting for them in
       series used to keep every view hidden even after the main data arrived. */
    const optionalData = ["data/leaders.json", "data/forecast-history.json", "data/polls-archive.json", "data/trends.json"]
      .map(u => window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u] || null) : loadJSONOptional(u));
    const [hist, cur, firms, regions, demo, haredi, ...extra] = await Promise.all(
      ["data/historical-polls.json", "data/current-polls.json", "data/pollsters.json", "data/regions.json", "data/demographics.json", "data/haredi.json"]
        .map(u => (window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u]) : fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u); return r.json(); })))
        .concat(EXTRA_CALIB.map(([, , , u]) => window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u] || null) : loadJSONOptional(u))));
    const [leaders, forecastHistory, pollsArchive, trends] = await Promise.all(optionalData);
    if (trends?.national) S.trendsNat = trends.national;
    /* current-polls.json כבר מוגבל ל-MAX_PER_OUTLET לכל ערוץ (גם בשרת וגם
       פה בלקוח) — לתצוגת "כל ההיסטוריה" בכרטיס הסקר צריך את הארכיון
       המלא, שלא מוגבל. אופציונלי: אם נכשל, בורר התאריך בכרטיס פשוט נשאר
       מוגבל כמו קודם. */
    Object.assign(S, { hist, firms, regions, demo, haredi, leaders: leaders?.photos || {}, forecastHistory, pollsArchive });
    /* מערכות הבחירות שהמדד מכויל עליהן. הראשונה היא ברירת המחדל של עמוד הדיוק. */
    S.elections = [
      { year: 2022, key: "2022", short: "2022", election: "הכנסת ה־25", data: hist, stats: scoreFirms(hist) },
      ...extra.map((d, i) => d?.polls?.length ? { year: EXTRA_CALIB[i][0], key: EXTRA_CALIB[i][1], short: EXTRA_CALIB[i][2], election: d.meta?.election || EXTRA_CALIB[i][1], data: d, stats: scoreFirms(d) } : null).filter(Boolean)
    ];
    S.calibKey = S.elections[0].key;
    S.calibrations = S.elections.map(e => {
      const attributed = e.data.polls.filter(p => p.firm).length;
      const missing = e.data.polls.length - attributed;
      return { year: e.year, election: e.election, status: "active", polls: attributed,
        note: missing ? `${attributed} מתוך ${e.data.polls.length} סקרים משויכים למכון` : "כל הסקרים משויכים למכון" };
    });
    const win = inWindow(cur.polls, cur.generatedAt);
    S.cur = { ...cur, polls: win.polls };
    /* הציון המשוקלל: ממוצע שווה־משקל של כל המערכות שבהן המכון פרסם */
    S.stats = combineCalibrations(S.elections);
    S.house = houseEffects(S.elections);
    S.houseIndustry = houseIndustry(S.house);
    S.counterStats = scoreFirms(hist, COUNTERFACTUAL);
    S.forecastPolls = recentForForecast(S.cur.polls);
    S.series = buildSeries(S.forecastPolls);
    S.seriesScenario = buildSeries(S.forecastPolls.map(correctWithinBlocs));

    $("#hero-art").innerHTML = KNESSET_SVG;
    $("#stamp-updated").textContent = `עודכן ${heDate(cur.generatedAt)}`;

    renderSources();
    wire();
    renderElectionTimer();
    renderNightCountdown();
    routeFromHash();
    document.documentElement.classList.add("app-ready");
    refreshLiveResults(true);
    S.countdownTimer = setInterval(() => {
      if (document.hidden) return;
      renderElectionTimer();
      const wasWaiting = !!document.querySelector('.night-waiting');
      if (!renderNightCountdown() && wasWaiting) { renderLiveResults(); renderOfficialResults(); refreshLiveResults(true); }
    }, 1000);
    S.liveTimer = setInterval(refreshLiveResults, 60000);
    scheduleAnec();
  } catch (err) {
    console.error(err);
    document.documentElement.classList.add("app-ready");
    const coverUpdated = $("#cover-updated");
    if (coverUpdated) coverUpdated.textContent = "נתוני התחזית אינם זמינים כרגע.";
    $("#main").insertAdjacentHTML("afterbegin",
      `<div class="wrap"><div class="errbox"><b>לא הצלחנו לטעון את נתוני הסקרים.</b><br>ודאו שהאתר מוגש משרת (לא פתיחת קובץ ישירה) ורעננו את הדף.</div></div>`);
  }
}

if (typeof module !== "undefined" && module.exports)
  module.exports = { scoreFirms, combineCalibrations, histBlocs, buildSeries, forecast, largestRemainder, baderOfer, allocateSeats, ELECTION_RULES, histBlocs, structuralFix, COUNTERFACTUAL };
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
// A future scenario, not a replay of the lists that failed the threshold in 2022.
function projectedMandateCost(validVotes, wastedPercent = 5) {
  const wasted = Math.max(0, Math.min(12, Number.isFinite(wastedPercent) ? wastedPercent : 5));
  return { wasted, passingVotes: validVotes * (1 - wasted / 100), cost: validVotes * (1 - wasted / 100) / 120,
    rangeLow: validVotes * .93 / 120, rangeHigh: validVotes * .97 / 120 };
}

function harediState() {
  const H = S.haredi, D = S.demo;
  const sec = D.sectors.find(x => x.id === "haredi");
  const years = D.meta.years;
  const eligible2026 = sec.eligible2022 * Math.pow(1 + (S.harGrowth ?? sec.growth * 100) / 100, years);
  const turnout = (S.harTurnout ?? H.turnout.harediCities2022) / 100;
  const loyalty = (S.harLoyalty ?? H.loyalty[0].harediLists) / 100;
  const model = runDemoModel(years);
  // 5% is an explicit working assumption; 3–7% is a sensitivity scenario, not a confidence interval.
  const costEstimate = projectedMandateCost(model.totalValid, S.harWasted ?? 5);
  const { passingVotes, cost } = costEstimate;
  const thr2022 = D.meta.validVotes2022 * D.meta.threshold;
  const cost2022 = D.parties2022.filter(p => p.votes >= thr2022).reduce((a, p) => a + p.votes, 0) / 120;
  const cast = eligible2026 * turnout;
  const toHaredi = cast * loyalty;
  const seatsFromSector = toHaredi / cost;
  /* מקדם הגידול של הקולות החרדיים: קולות המגזר לרשימות החרדיות ב-2026 (בעלי
     זכות × הצבעה × נאמנות, לפי המחוונים) חלקי אותו חשבון ב-2022 (הערכים שנמדדו). */
  const haredi22 = sec.eligible2022 * H.turnout.harediCities2022 / 100 * H.loyalty[0].harediLists / 100;
  const harediFactor = toHaredi / haredi22;
  /* כל רשימה מתחילה מהקולות שלה ב-2022 ומתפצלת לחרדים / לא־חרדים לפי הרכב
     הבוחרים (mix ב-data/demographics.json; ש״ס — מחוון). החרדים גדלים במקדם
     המגזר; הלא־חרדים — בגידול של המגזרים שלהם (מסורתיים, דתיים, חילונים). */
  const sectorGrowth = Object.fromEntries(D.sectors.map(x => [x.id, Math.pow(1 + x.growth, years)]));
  const party = (id, harediShare) => {
    const p22 = D.parties2022.find(p => p.id === id);
    const nonMix = Object.entries(p22.mix).filter(([k]) => k !== "haredi"), nonSum = nonMix.reduce((t, [, v]) => t + v, 0) || 1;
    const outsideGrowth = nonMix.reduce((t, [k, v]) => t + v * sectorGrowth[k], 0) / nonSum;
    const votes22 = p22.votes, seats22 = p22.seats, haredi22v = votes22 * harediShare, outside22 = votes22 * (1 - harediShare);
    const harediVotes = haredi22v * harediFactor, outsideVotes = outside22 * outsideGrowth, votes = harediVotes + outsideVotes;
    return { id, votes22, seats22, harediShare, haredi22v, outside22, harediVotes, outsideVotes, outsideGrowth, votes, seats: votes / cost };
  };
  const shasMix = D.parties2022.find(p => p.id === "shas").mix, utjMix = D.parties2022.find(p => p.id === "utj").mix;
  const shas = party("shas", S.harShasHaredi != null ? S.harShasHaredi / 100 : shasMix.haredi);
  const utj = party("utj", utjMix.haredi || 0);
  return { H, sec, eligible2026, turnout, loyalty, cost, cost2022, costEstimate, passingVotes, cast, toHaredi, haredi22, harediFactor, seatsFromSector, shas, utj, shasOutside: shas.outsideVotes / cost, total: shas.seats + utj.seats, model };
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
  const partyCalc = (label, x, outsideLabel, color) => `
    <div class="calcparty" style="--c:${color}">
      <h4>${label}</h4>
      <div class="calcline"><span>קולות ב־2022 (${x.seats22} מנדטים)</span><b class="num">${fmt(x.votes22)}</b></div>
      <div class="calcline"><span>מתוכם חרדים · ${pct(x.harediShare * 100)} מהבוחרים</span><b class="num">${fmt(x.haredi22v)}</b></div>
      <div class="calcline"><span>× מקדם הגידול של הקולות החרדיים (${x2(st.harediFactor)})</span><b class="num">${fmt(x.harediVotes)}</b></div>
      <div class="calcline"><span>+ ${outsideLabel}: ${fmt(x.outside22)} ב־2022 × ${x2(x.outsideGrowth)} גידול</span><b class="num">${fmt(x.outsideVotes)}</b></div>
      <div class="calcline"><span>= קולות ב־${S.demo.meta.targetYear}</span><b class="num">${fmt(x.votes)}</b></div>
      <div class="calcline"><span>÷ מחיר מנדט (${fmt(st.cost)})</span><b class="num">${r1(x.seats)} מנדטים</b></div>
      <div class="calcout"><b class="num">${r1(x.seats)}</b><span>מנדטים ל${label} — לפני שהסתכלנו על סקר אחד</span></div>
    </div>`;
  const x2 = v => v.toFixed(3).replace(/0+$/, "").replace(/[.]$/, "");
  $("#haredi-calc").innerHTML = `
    <p class="kicker">החישוב, שקוף</p>
    <h3 style="margin:4px 0 14px">מהאוכלוסייה אל המנדט</h3>
    <section class="mandate-estimate" aria-label="אומדן קולות למנדט">
      <p class="kicker">אומדן עבודה · לא נתון שנמדד</p>
      <h4>כ־<span class="num">${fmt(Math.round(st.cost / 100) * 100)}</span> קולות למנדט</h4>
      <p>המודל צופה כ־${r1(st.model.totalValid / 1e6)} מיליון קולות כשרים. מניחים ש־${pct(st.costEstimate.wasted)} מהם יינתנו לרשימות שלא יעברו את הסף, ואת השאר מחלקים ב־120. לא מניחים שמרצ ורשימות אחרות ייפלו שוב כפי שקרה ב־2022.</p>
      <p><b>טווח רגישות: ${fmt(Math.round(st.costEstimate.rangeLow / 100) * 100)}–${fmt(Math.round(st.costEstimate.rangeHigh / 100) * 100)}</b>, אם 3%–7% מהקולות יישארו מחוץ לחלוקה. 5% היא הנחת אמצע, לא מסקנה מסקר; זה אינו טווח ביטחון ואינו כולל שינוי בהיקף ההצבעה הארצי.</p>
      <label class="slider"><span>הנחת הקולות לרשימות שלא יעברו את הסף<b>${pct(st.costEstimate.wasted)}</b></span><input id="har-wasted" type="range" min="0" max="12" step="0.5" value="${st.costEstimate.wasted}"></label>
      <p class="sec-note">אחוז החסימה עצמו נשאר <b>3.25%</b> מכל הקולות הכשרים — כ־${fmt(Math.ceil(st.model.totalValid * .0325))} קולות לפי היקף ההצבעה שבמודל. ב־2022 המודד היה ${fmt(st.cost2022)} קולות למנדט. המודד אינו מבטיח את המנדט האחרון, שמושפע גם מחלוקת העודפים. <a href="https://main.knesset.gov.il/About/Lexicon/pages/qualifying-threshold.aspx" target="_blank" rel="noopener">הסבר הכנסת ↗</a> · <a href="https://votes25.bechirot.gov.il/" target="_blank" rel="noopener">תוצאות 2022 ↗</a></p>
    </section>
    <div class="calcline"><span>בעלי זכות בחירה חרדים ב־${S.demo.meta.targetYear}</span><b class="num">${fmt(st.eligible2026)}</b></div>
    <div class="calcline"><span>× שיעור הצבעה</span><b class="num">${pct(st.turnout * 100)}</b></div>
    <div class="calcline"><span>= קולות שהוטלו</span><b class="num">${fmt(st.cast)}</b></div>
    <div class="calcline"><span>× נאמנות לרשימות החרדיות</span><b class="num">${pct(st.loyalty * 100)}</b></div>
    <div class="calcline"><span>= קולות לש״ס ולג׳ מהמגזר ב־${S.demo.meta.targetYear}</span><b class="num">${fmt(st.toHaredi)}</b></div>
    <div class="calcline"><span>÷ אותו חשבון ב־2022 (${fmt(st.sec.eligible2022)} × ${pct(H.turnout.harediCities2022)} × ${pct(H.loyalty[0].harediLists)} = ${fmt(st.haredi22)}) = מקדם הגידול של הקולות החרדיים</span><b class="num">× ${x2(st.harediFactor)}</b></div>
    <div class="calcline"><span>אומדן קולות למנדט: ${fmt(st.model.totalValid)} קולות כשרים × ${pct(100 - st.costEstimate.wasted)} שנכנסים לחלוקה ÷ 120</span><b class="num">כ־${fmt(Math.round(st.cost / 100) * 100)}</b></div>
    <div class="calcsplit">
      ${partyCalc("ש״ס", st.shas, "לא־חרדים (מסורתיים, דתיים, חילונים)", "#1B1D21")}
      ${partyCalc("יהדות התורה", st.utj, "לא־חרדים (דתיים, מסורתיים)", "#4A4F57")}
    </div>
    <div class="calcline calctotal"><span>יחד</span><b class="num">${r1(st.total)} מנדטים</b></div>
    <label class="slider"><span>גידול שנתי של בעלי זכות הבחירה<b>${r1(S.harGrowth ?? st.sec.growth*100)}%</b></span><input id="har-growth" type="range" min="0" max="6" step="0.1" value="${S.harGrowth ?? st.sec.growth*100}"></label><label class="slider"><span>שיעור הצבעה במגזר<b class="num">${pct(st.turnout * 100)}</b></span>
      <input type="range" min="45" max="95" step="0.5" value="${(st.turnout * 100).toFixed(1)}" id="har-turnout" style="accent-color:#17457F"></label>
    <label class="slider"><span>נאמנות לרשימות החרדיות<b class="num">${pct(st.loyalty * 100)}</b></span>
      <input type="range" min="55" max="95" step="0.5" value="${(st.loyalty * 100).toFixed(1)}" id="har-loyalty" style="accent-color:#B8862B"></label>
    <label class="slider"><span>חלק החרדים בבוחרי ש״ס (ב־2022)<b class="num">${pct(st.shas.harediShare * 100)}</b></span>
      <input type="range" min="30" max="90" step="1" value="${(st.shas.harediShare * 100).toFixed(0)}" id="har-shas-haredi" style="accent-color:#1B1D21"></label>
    <button class="btn ghost" type="button" id="har-reset" style="margin-top:14px">חזרה להנחות הבסיס</button>`;

  /* מה היה צריך לקרות */
  const est = forecast(S.mode);
  const pollShas = est.raw.shas || 0, pollUtj = est.raw.yahadut_hatora || 0, pollSum = pollShas + pollUtj;
  $("#haredi-verdict").innerHTML = `<p class="kicker">השוואת הנחות</p><h3>תרחיש דמוגרפי מול ממוצע הסקרים</h3>
    <div class="calcline"><span>ש״ס · ממוצע הסקרים → התרחיש</span><b class="num" dir="ltr">${r1(pollShas)} → ${r1(st.shas.seats)}</b></div>
    <div class="calcline"><span>יהדות התורה · ממוצע הסקרים → התרחיש</span><b class="num" dir="ltr">${r1(pollUtj)} → ${r1(st.utj.seats)}</b></div>
    <div class="calcline"><span>יחד</span><b class="num" dir="ltr">${r1(pollSum)} → ${r1(st.total)}</b></div>
    <p class="sec-note">אלה שתי שיטות שונות עם הנחות ואי־ודאות שונות. הפער אינו מוכיח איזו מהן מדויקת יותר. תחזית הברומטר בעמוד הראשי מקבעת ש״ס ${FIXED_SEATS.shas} וג׳ ${FIXED_SEATS.yahadut_hatora} — הנחה נפרדת; המחשבון כאן אינו מוכיח רצפת מנדטים.</p>`;

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

  $("#haredi-sources").innerHTML = `<ul class="h-src-list">${Object.values(H.sources).map(x =>
    `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a>${x.use ? `<span>${esc(x.use)}</span>` : ""}</li>`).join("")}</ul>`;
  /* ההנחות הקבועות של התחזית — אותם ערכים כמו בשיטת החישוב */
  const fixedChips = [[FIXED_SEATS.shas, "ש״ס בתחזית · 2022: 11 מנדטים"], [FIXED_SEATS.yahadut_hatora, "יהדות התורה בתחזית · 2022: 7 מנדטים"], [r1(st.total), "התרחיש הדמוגרפי, ש״ס ויהדות התורה יחד"]];
  $("#h-live-fixed").innerHTML = fixedChips.map(([n, l]) => `<div><b class="num" dir="ltr">${n}</b><span>${esc(l)}</span></div>`).join("");
  wireHarediDoc();

  /* wiring */
  const wire = (id, key) => $(id).addEventListener("change", e => { S[key] = Number(e.target.value); renderHaredi(); $(id)?.focus(); });
  wire("#har-growth", "harGrowth"); wire("#har-turnout", "harTurnout"); wire("#har-loyalty", "harLoyalty"); wire("#har-shas-haredi", "harShasHaredi"); wire("#har-wasted", "harWasted");
  $("#har-reset").addEventListener("click", () => { S.harGrowth = null; S.harTurnout = null; S.harLoyalty = null; S.harShasHaredi = null; S.harWasted = null; renderHaredi(); $("#har-reset").focus(); });
}

let harediDocWired = false;
function wireHarediDoc() {
  if (harediDocWired) return; harediDocWired = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#hdoc-nav [data-hgo]").forEach(b => b.addEventListener("click", () => document.getElementById(b.dataset.hgo)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })));
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    $("#hdoc-nav [data-hgo]").forEach(b => b.classList.toggle("is-on", b.dataset.hgo === e.target.id));
  }), { rootMargin: "-25% 0px -65% 0px" });
  $("#view-haredi .msec").forEach(sec => io.observe(sec));
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
