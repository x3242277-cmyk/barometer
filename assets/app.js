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
            homeView:"bars", homeHistory:"current", focusParty:"", compareIds:null, trendParty:"", pollView:"cards", avgDays:7, avgWeight:"simple", cardPoll:{}, view:"home", selectedLoc:0, demoOverrides:{}, live:null, liveTimer:null, countdownTimer:null,
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
/* משקל בממוצע המשוקלל: לא רציף לפי הציון (בפועל תמיד בטווח צר, 70–85 —
   כמעט בלי הבדל אמיתי בין המכונים), אלא לפי הדרגה שהציון נופל בה: אמינות
   גבוהה 45%, טובה 35%, בינונית 20%. כך פער אמיתי בין דרגות משפיע בפועל
   על הממוצע המשוקלל, לא רק על הציון המוצג. הציון עצמו (firmScore) ממשיך
   להיות רציף — הוא רק לתצוגה ולקביעת הדרגה, לא לחישוב המשקל. */
const TIER_WEIGHT = { high: 0.45, mid: 0.35, low: 0.20 };
const firmWeight = meta => TIER_WEIGHT[gradeOf(firmScore(meta)).key];

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
  const w = s => mode !== "simple" ? firmWeight(s.meta) : 1;
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
    /* שלב 5: המודל הדמוגרפי מאשר או מתקן את ההנחה הדמוגרפית — אם ההנחה רחוקה
       מאומדן המודל ביותר ממנדט אחד, התחזית משתמשת באומדן המודל במקומה. */
    const opts = { ...(S.scenarioOptions || {}), rawFull };
    const want = opts.demographic ?? 2, model = demoDriftSeats();
    if (model != null && Math.abs(model - want) > DEMO_TOLERANCE) { opts.demographic = Math.round(model * 4) / 4; opts.demographicCorrected = { from: want, model, to: opts.demographic }; }
    const scenario = scenarioForecast(raw, opts);
    return { raw, rawFull, parties: scenario.parties, blocs, fix, scenario, below: belowShare };
  }
  return { raw, rawFull, parties: fix.parties, blocs, fix, below: belowShare };
}

/* אומדן המודל הדמוגרפי (בלי סקרים) לשינוי כוח הימין והחרדים עד 2026, במנדטים */
const DEMO_TOLERANCE = 1;
function demoDriftSeats() {
  if (!S.demo) return null;
  const m0 = runDemoModel(0), m1 = runDemoModel(S.demo.meta.years), sh = (m, c) => 100 * (m.campVotes[c] || 0) / m.campTotal;
  return ((sh(m1, "right") + sh(m1, "haredi")) - (sh(m0, "right") + sh(m0, "haredi"))) / 100 * 120;
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
  const seats = snapshotSeats ? {...snapshotSeats} : allocateSeats(est.parties);
  const belowEntries = Object.entries(est.below || {});
  $('#home-eyebrow').textContent = snapshot
    ? `תחזית ארכיון · ${heDate(snapshot.updatedAt)} · ${snapshot.polls || '—'} סקרים`
    : 'תחזית הברומטר · הכנסת ה־26 · הצבעה ב־27 באוקטובר';
  const coverUpdated = $('#cover-updated');
  if (coverUpdated) coverUpdated.textContent = `לתחזית המלאה — מעודכן ${humanUpdate(S.cur.generatedAt)}`;

  const blocTot = {};
  Object.entries(seats).forEach(([id, n]) => {
    const al = partyMeta(id).alignment;
    blocTot[al] = (blocTot[al] || 0) + n;
  });
  const R = blocTot.Right || 0, U = blocTot.Unknown || 0;
  const LA = (blocTot.Left || 0) + (blocTot.Arabs || 0);

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
    return `<button type="button" class="ptile${sub ? " is-below" : ""}" style="--c:${partyHue(id)}" data-focus-party="${esc(id)}" aria-label="${esc(m.name)}, ${sub ? `מתחת לאחוז החסימה, כ־${sub}` : `${n} מנדטים`}. מעבר לסקרים">
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
    if (r22) nodes.push({ k: "תוצאות 2022", n: `${r22} : ${120 - r22}`, t: "גוש נתניהו מול גוש השינוי, מנדטים — נקודת המוצא לכל בדיקה", href: "#/demography" });
    /* 02 · דיוק המכונים */
    const active = S.series.map(s => s.meta), calib = active.filter(m => m.calibrated);
    const best = calib.map(m => ({ m, sc: firmScore(m) })).sort((a, b) => b.sc - a.sc)[0];
    nodes.push({ k: "דיוק המכונים", n: `${calib.length} מכונים`, t: best ? `נמדדו מול שלוש הבחירות האחרונות (2020–2022) וקיבלו ציון. המדויק ביותר בתחזית: ${best.m.he} (${r1(best.sc)})` : "נמדדו מול שלוש הבחירות האחרונות וקיבלו ציון", href: "#/2022" });
    /* 03 · כמה עברו צד */
    if (S.regions && S.hist) {
      const c = crossoverBase();
      if (c.rows.length) nodes.push({ k: "כמה עברו צד", n: `${c.deltaAvg < 0 ? "−" : "+"}${c.kv(c.votersAvg)}`, t: `מצביעים ${c.deltaAvg < 0 ? "עזבו את גוש הימין" : "הצטרפו לגוש הימין"} מאז 2022, לפי ממוצע המכונים המשוקלל`, href: "#/crossover" });
    }
    /* 04 · גידול טבעי */
    if (S.demo) {
      const m0 = runDemoModel(0), m1 = runDemoModel(S.demo.meta.years);
      const sh = (m, c) => 100 * ((m.campVotes[c] || 0)) / m.campTotal;
      const d = (sh(m1, "right") + sh(m1, "haredi")) - (sh(m0, "right") + sh(m0, "haredi"));
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
const curElection = () => S.elections.find(e => e.key === S.calibKey) || S.elections[0];
/* התרחיש ההיפותטי (מרצ עוברת את החסימה) שייך לכנסת ה־25 בלבד. */
const counterfactualAvailable = () => S.calibKey === "2022";
const scenActual = () => (S.scen === "counterfactual" && counterfactualAvailable())
  ? COUNTERFACTUAL : curElection().data.actual;
const curBlocDefs = () => curElection().data.blocs || BLOCS_2022;
/* שם הגוש: אם הוא רשימה אחת, מוצג שמה; אחרת התווית הכללית. */
const blocLabel = (key, ids) => ids.length === 1 ? (HIST_PARTY_HE[ids[0]] || ids[0]) : (key === "outgoing" && curElection().key === "2022" ? "גוש השינוי" : BLOC_LABELS[key]);

function renderCalibSwitch() {
  $("#calib-switch").innerHTML = S.elections.map(e =>
    `<button type="button" data-calib="${esc(e.key)}" aria-pressed="${e.key === S.calibKey}">${esc(e.election)} · ${esc(e.short)}</button>`).join("");
  const e = curElection(), heD = d => d.split("-").reverse().join(".");
  const firms = new Set(e.data.polls.map(p => p.firm).filter(Boolean)).size;
  $("#arch-title").textContent = `${e.election} · ${heD(e.data.meta?.electionDate || e.data.window.to)}`;
  $("#calib-facts").innerHTML = [[e.data.polls.length, "סקרים בחלון"], [firms, "מכונים"], [`<span dir="ltr">${heD(e.data.window.from)} – ${heD(e.data.window.to)}</span>`, "30 הימים שלפני הבחירות"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  const src = e.data.meta?.sourceUrl ? `<a href="${esc(e.data.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(e.data.meta.source)} ↗</a>` : esc(e.data.meta?.source || "");
  $("#calib-source").innerHTML = `מקור הסקרים: ${src} · תוצאות האמת: ועדת הבחירות המרכזית. ${esc(e.data.meta?.note || "")}`;
}

function render2022() {
  const stats = S.stats, el = curElection(), defs = curBlocDefs(), target = scenActual();
  renderCalibSwitch();
  renderCounterfactual();

  // facts strip under the title
  const totalPolls = S.elections.reduce((t, e) => t + e.data.polls.length, 0);
  const calibrated = stats.filter(st => S.firms.firms.find(f => f.id === st.firm)?.calibrated);
  const best = calibrated[0], facts = $("#acc-facts");
  if (facts) facts.innerHTML = [
    [calibrated.length, "מכונים מכוילים"], [totalPolls, "סקרי כיול"], [`${S.elections.length} · <span dir="ltr">${Math.min(...S.elections.map(e => e.year))}–${Math.max(...S.elections.map(e => e.year))}</span>`, "מערכות בחירות"],
    [best ? `${esc((S.firms.firms.find(f => f.id === best.firm) || { he: best.firm }).he)} · ${r1(best.score)}` : "—", "המדויק ביותר"]
  ].map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");

  // ranking
  const comps = [["blocScore", "דיוק בגושים", "#17457F"], ["partyScore", "דיוק במפלגות", "#B8862B"], ["consistencyScore", "עקביות", "#5B4B8A"]];
  const runsOf = S.elections.slice();
  /* מכון שיורש ציון (נקסט דאטה ← דירקט פולס: אותו צוות סוקרים) מוצג ככרטיס רגיל, זהה
     במבנהו לשאר, מיד אחרי המקור; הקשר בין השניים מוסבר בחלון הפירוט בלבד. */
  const activeFirms = new Set(S.cur.polls.map(p => firmOf(p.sourceId).firm));
  const heirsOf = id => S.firms.firms.filter(f => f.calibrationFirm === id && f.id !== id && activeFirms.has(f.id));
  const cardOf = (it, m, g, runs, rankNo, heirOf) => `<article class="rank grade-${g.key}" data-firm="${esc(m.id)}" role="button" tabindex="0" aria-label="${esc(m.he)} — פירוט הציון">
      ${scoreTop(it.score, "ציון משוקלל", g.key, g.label, rankNo)}
      ${logoBox(m, 52)}
      <div style="min-width:0"><strong style="display:block">${esc(m.he)}</strong>
        <span style="color:var(--ink-3);font-size:.75rem">${it.n} סקרים ב־${it.elections.length} ${it.elections.length === 1 ? "מערכת" : "מערכות"}</span></div>
      <div class="runs" aria-label="ציון לפי מערכת בחירות">${runs.map((r, i) => r
        ? `<span title="${esc(r.election)}: ${r.n} סקרים"><small>${esc(runsOf[i].short)}</small><b>${r1(r.score)}</b></span>`
        : `<span class="none" title="לא פרסם סקרים בחלון"><small>${esc(runsOf[i].short)}</small><b>—</b></span>`).join("")}</div>
      <div class="meters">${comps.map(([k, l, c]) => `<div class="meter" style="--c:${c}"><span>${l}<b>${r1(it[k])}</b></span><i style="--v:${clamp(it[k])}%"></i></div>`).join("")}</div>
      <div class="final rank-outlets"><span>מפרסם ב־</span>${outletIconStrip(m.outlets || [])}</div>
    </article>`;
  $("#rank-list").innerHTML = calibrated.map((it, idx) => {
    const m = S.firms.firms.find(f => f.id === it.firm), g = gradeOf(it.score);
    const runs = runsOf.map(e => it.elections.find(r => r.key === e.key));
    const rankNo = String(idx + 1).padStart(2, "0");
    return cardOf(it, m, g, runs, rankNo, null) + heirsOf(it.firm).map(h => cardOf(it, h, g, runs, rankNo, m)).join("");
  }).join("");

  /* מכונים פעילים בתחזית שאין להם סדרת כיול משלהם מ-2022 — כדי שהעמוד
     יכסה כל מכון שמזין את החישוב, לא רק את שבעת המכוילים. */
  const rankedIds = new Set(calibrated.map(s => s.firm));
  const extras = [...new Set(S.cur.polls.map(p => firmOf(p.sourceId).firm))]
    .map(id => S.firms.firms.find(f => f.id === id))
    .filter(f => f && !rankedIds.has(f.id) && !(f.calibrationFirm && rankedIds.has(f.calibrationFirm)))
    .sort((a, b) => firmScore(b) - firmScore(a));
  /* אותה משבצת כמו המכונים המכוילים, באותה שורה; ההסבר במקום המדדים. */
  if (extras.length) $("#rank-list").insertAdjacentHTML("beforeend",
    extras.map(f => {
      const heir = f.calibrationFirm && rankedIds.has(f.calibrationFirm) ? S.firms.firms.find(x => x.id === f.calibrationFirm) : null;
      const note = heir
        ? `<b>ללא סדרת כיול משלו.</b> יורש את ציון ${esc(heir.he)} — אותו צוות סוקרים, ולכן אותו ציון.`
        : `<b>ללא סדרת כיול.</b> לא פרסם סקרים בחודש שלפני אף אחת משלוש הבחירות, ולכן אין למה להשוות. עד שייבחן מול תוצאות אמת הוא נכנס לתחזית במשקל ניטרלי של 70.`;
      return `<article class="rank rank-nocalib" data-firm="${esc(f.id)}" role="button" tabindex="0" aria-label="${esc(f.he)} — פירוט הציון">
        ${scoreTop(firmScore(f), heir ? "ציון בשימוש" : "משקל ניטרלי", "none", heir ? `יורש את ${esc(heir.he)}` : "ללא דירוג")}
        ${logoBox(f, 52)}
        <div style="min-width:0"><strong style="display:block">${esc(f.he)}</strong>
          <span style="color:var(--ink-3);font-size:.75rem">${heir ? "יורש ציון" : "משקל ניטרלי"}</span></div>
        <div class="meters nocalib-note"><p>${note}</p></div>
        <div class="final rank-outlets"><span>מפרסם ב־</span>${outletIconStrip(f.outlets || [])}</div>
      </article>`;
    }).join(""));

  // the standing-sampling-error note
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
    return (ff === "all" || p.firm === ff) && (!q || `${p.date} ${p.firm} ${m ? m.he : ""} ${p.publisher}`.toLowerCase().includes(q));
  }).sort((a, b) => b.p.date.localeCompare(a.p.date));
  /* ברירת המחדל: עשרת הסקרים האחרונים; כפתור פותח את כל החלון */
  const LIMIT = 10, shown = S.archAll ? rows : rows.slice(0, LIMIT);
  $("#arch-count").textContent = `${shown.length} מתוך ${el.data.polls.length} סקרים`;
  const cellCls = d => d === 0 ? "ok" : d === 1 ? "near" : d === 2 ? "off" : "far";
  const tbDefs = curBlocDefs(), tb = histBlocs(target, tbDefs);
  const cf = S.scen === "counterfactual" && counterfactualAvailable();
  const actualRow = `<tr class="actual${cf ? " cf" : ""}"><td class="date">${esc((el.data.meta?.electionDate || "").slice(5).split("-").reverse().join("."))}</td><td colspan="2"><strong>${cf ? "התרחיש: מרצ עוברת" : `תוצאות האמת · ${esc(el.election)}`}</strong></td>${
      keys.map(k => `<td class="n"><b>${target[k]}</b></td>`).join("")}<td class="n"><b>${tb.netanyahu}</b></td><td></td></tr>`;
  $("#arch-table").innerHTML = `<thead><tr><th>תאריך</th><th>מפרסם</th><th>מכון</th>${
    keys.map(k => `<th class="n party-h">${esc(HIST_PARTY_HE[k] || k)}</th>`).join("")
  }<th class="n">גוש נתניהו</th><th class="n">שגיאה ממוצעת</th></tr></thead><tbody>${actualRow}${
    shown.map(({ p }) => {
      const mae = avg(keys.map(k => Math.abs((p.p[k] || 0) - target[k])));
      const m = S.firms.firms.find(f => f.id === p.firm) || { he: FIRM_HE_FALLBACK[p.firm] || p.firm || "ללא שיוך מכון" };
      const bn = histBlocs(p.p, tbDefs).netanyahu, dev = Math.abs(bn - tb.netanyahu);
      return `<tr${p.firm ? "" : ' class="unattributed"'}><td class="date">${esc(p.date.slice(5).split("-").reverse().join("."))}</td>
        <td class="pub"><div class="orgcell">${outletLogo(p.publisher)}<span>${esc(p.publisher)}</span></div></td>
        <td class="firm"><strong>${esc(m.he)}</strong></td>
        ${keys.map(k => { const v = p.p[k] || 0, d = Math.abs(v - target[k]); return `<td class="n cell ${cellCls(d)}" title="${esc(HIST_PARTY_HE[k] || k)}: ${v} מול ${target[k]}">${v}</td>`; }).join("")}
        <td class="n cell ${cellCls(dev)}"><b>${bn}</b></td>
        <td class="n"><span class="chip ${mae < 1 ? "good" : mae > 1.6 ? "bad" : ""}">${r1(mae)}</span></td></tr>`;
    }).join("") || `<tr><td colspan="${keys.length + 5}" class="empty">לא נמצאו סקרים.</td></tr>`}</tbody>`;
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
  box.innerHTML = `<b>טעות דגימה קבועה:</b> ` + found.map(x => {
    const dir = x.mean > 0 ? `הסקרים נותנים לה בממוצע ${seatsHe(x.mean)} פחות ממה שהיא מקבלת בקלפי` : `הסקרים נותנים לה בממוצע ${seatsHe(x.mean)} יותר ממה שהיא מקבלת בקלפי`;
    const list = x.runs.slice().sort((a, b) => b.e.year - a.e.year).map(r => `${esc(r.e.short)}: ${r1(r.mean)} בסקרים מול ${r.actual} בפועל`).join(" · ");
    return `<b>${esc(HIST_PARTY_HE[x.k] || x.k)}</b> — ${dir} (${list})`;
  }).join("; ") + `. התחזית אינה מתקנת לפי זה.`;
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
  $("#scen-explain").innerHTML = `<p><b>מרצ קיבלה ${fmt(w.meretz)} קולות — ${fmt(w.meretzGap)} קולות בלבד מתחת לאחוז החסימה.</b> אילו עברה, היא הייתה מקבלת ${COUNTERFACTUAL.meretz} מנדטים, וחלוקת המנדטים כולה הייתה מחושבת מחדש: גוש נתניהו ${aB.netanyahu} → ${cfB.netanyahu}.</p>
    <p>זה ההבדל בין למדוד את מצב הרוח לבין לחזות את התוצאה: מכון שהראה למרצ 4–5 מנדטים ״טעה״ מול המציאות, אבל היה מדויק מול התרחיש. המתג מודד את כל סקרי 2022 מחדש מול התוצאה ההיפותטית — הטבלה, ההטיה המשותפת וטבלת הציונים שלמטה מגיבות לו.</p>`;
  const rows = S.elections.find(e => e.key === "2022").stats.map(a => {
    const c = S.counterStats.find(x => x.firm === a.firm), m = S.firms.firms.find(f => f.id === a.firm) || { he: FIRM_HE_FALLBACK[a.firm] || a.firm };
    return { he: m.he, a: a.score, c: c ? c.score : null, n: a.n };
  }).sort((x, y) => (y.c ?? 0) - (x.c ?? 0));
  $("#scen-firms").innerHTML = `<thead><tr><th>מכון · 2022</th><th class="n">סקרים</th><th class="n">ציון מול האמת</th><th class="n">ציון מול התרחיש</th><th class="n">הפרש</th></tr></thead><tbody>${
    rows.map(r => { const d = r.c == null ? null : r.c - r.a; return `<tr><td><strong>${esc(r.he)}</strong></td><td class="n">${r.n}</td><td class="n">${r1(r.a)}</td><td class="n"><b>${r.c == null ? "—" : r1(r.c)}</b></td><td class="n"><span dir="ltr" class="chip ${d == null ? "" : d > 0.5 ? "good" : d < -0.5 ? "bad" : ""}">${d == null ? "—" : (d > 0 ? "+" : "") + d.toFixed(1)}</span></td></tr>`; }).join("")}</tbody>`;
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
  const runs = (st.elections || []).filter(r => S.elections.some(e => e.key === r.key));
  const sections = runs.map(run => {
    const el = S.elections.find(e => e.key === run.key);
    const actual = el.data.actual, defs = el.data.blocs || BLOCS_2022, aB = histBlocs(actual, defs);
    const polls = run.polls.slice().sort((a, b) => a.date.localeCompare(b.date));
    const keys = Object.keys(actual);
    const pAvg = Object.fromEntries(keys.map(k => [k, avg(polls.map(p => p.p[k]))]));
    /* לכנסת ה-25 נוספת עמודה "אילו מרצ עברה": כמה מהפער הוא בכלל אחוז החסימה */
    const cf = run.key === "2022" ? COUNTERFACTUAL : null, cfB = cf ? histBlocs(cf, defs) : null;
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
      return `<tr><td style="white-space:nowrap">${esc(p.date.slice(5).split("-").reverse().join("."))}</td><td>${esc(p.publisher || "")}</td>
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
  const votersOf = pp => Math.abs(pp) / 100 * tot2022;               // נקודות אחוז → מצביעים (על בסיס 2022)

  /* חלק הימין בכל מכון: כל רשימה עם ממוצע של 1.5% ומעלה נספרת, גם מתחת לסף. */
  const shareOf = s => {
    const ids = Object.keys(s.parties).filter(id => 100 * s.parties[id] / 120 >= CROSS_MIN_SHARE);
    const tot = ids.reduce((t, id) => t + s.parties[id], 0) || 1;
    const right = ids.filter(id => partyMeta(id).alignment === "Right").reduce((t, id) => t + s.parties[id], 0);
    const below = ids.filter(id => s.parties[id] < THRESHOLD_MANDATES);
    return { share: 100 * right / tot, below };
  };
  const wOf = s => firmWeight(s.meta);
  const rows = S.series.map(s => {
    const x = shareOf(s);
    const delta = x.share - rightShare0;                              // נקודות אחוז; שלילי = הימין הצטמק
    return { meta: s.meta, series: s, share: x.share, delta, voters: votersOf(delta), n: s.polls.length, below: x.below };
  }).sort((a, b) => a.delta - b.delta);
  const totW = S.series.reduce((t, s) => t + wOf(s), 0) || 1;
  const shareAvg = S.series.reduce((t, s) => t + shareOf(s).share * wOf(s), 0) / totW;
  const deltaAvg = shareAvg - rightShare0;
  const votersAvg = votersOf(deltaAvg);
  return { nat, valid, defs, rightIds2022, counted2022, tot2022, right2022, rightShare0, below2022, kv, votersOf, shareOf, wOf, rows, shareAvg, deltaAvg, votersAvg };
}

function renderCrossover() {
  const { nat, valid, defs, rightIds2022, counted2022, tot2022, right2022, rightShare0, below2022, kv, votersOf, shareOf, wOf, rows, shareAvg, deltaAvg, votersAvg } = crossoverBase();

  $("#crossover-intro").textContent =
    "בבחירות 2022 קיבל גוש הימין " + r1(rightShare0) + "% מהקולות (בספירה שכוללת גם רשימות שלא עברו את אחוז החסימה אך קיבלו 1.5% ומעלה). כל מכון מצייר היום חלוקה אחרת, וכל חלוקה כזאת אומרת שכמות מסוימת של מצביעים עברה מצד לצד. כאן מתורגם כל מכון למספר אחד: כמה מצביעים, נטו, חצו את קו הגוש מאז 2022.";

  $("#crossover-baseline").innerHTML =
    `<div class="crossbar">` +
    `<span style="flex:0 0 ${rightShare0.toFixed(1)}%;background:${BLOCS.Right.color}">גוש הימין · ${r1(rightShare0)}% · ${fmt(right2022)} קולות</span>` +
    `<span style="flex:1 1 auto;background:${BLOCS.Left.color}">גוש השינוי · ${r1(100 - rightShare0)}% · ${fmt(tot2022 - right2022)} קולות</span>` +
    `</div>` +
    `<p class="sec-note" style="margin-top:8px;max-width:none">גוש הימין 2022 = הליכוד, ש״ס, יהדות התורה והציונות הדתית (כולל עוצמה יהודית). בצד השני נספרות גם ${below2022.map(p => `${p.name} (${p.pct}%)`).join(" ו")} שלא עברו את אחוז החסימה — ${fmt(below2022.reduce((t, p) => t + p.votes, 0))} קולות. רשימות מתחת ל־1.5% אינן נספרות. סה״כ ${fmt(tot2022)} קולות נספרים מתוך ${fmt(valid)} כשרים.</p>`;

  if (!rows.length) {
    $("#crossover-note").textContent = "אין סקרים בחלון הנוכחי.";
    $("#crossover-chart").innerHTML = "";
    $("#crossover-verdict").textContent = "";
    return;
  }


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
      <div class="base-blocbar votes" role="img" aria-label="גוש נתניהו ${fmt(vN)} קולות, גוש השינוי ${fmt(vO)} קולות">
        <span style="flex:${vN};background:${BLOCS.Right.color}"><b>${fmt(vN)}</b> גוש נתניהו · ${pct(100 * vN / (vN + vO))}</span>
        <span style="flex:${vO};background:${BLOCS.Left.color}"><b>${fmt(vO)}</b> גוש השינוי · ${pct(100 * vO / (vN + vO))}</span></div></div>
    <div class="base-row"><span class="base-lbl">במנדטים</span>
      <div class="base-blocbar" role="img" aria-label="גוש נתניהו ${r22}, גוש השינוי ${nb}">
        <span style="flex:${r22};background:${BLOCS.Right.color}"><b>${r22}</b></span>
        <span style="flex:${nb};background:${BLOCS.Left.color}"><b>${nb}</b></span>
        <i class="bc-61 from-start" title="61"></i><i class="bc-61 from-end" title="61"></i></div></div>
    <div class="base-drama"><b>גוש השינוי קיבל ${fmt(w.blocGap)} קולות יותר מגוש נתניהו — ובכל זאת הפסיד 56 : 64.</b> ${fmt(w.total)} מקולותיו (מרצ ${fmt(w.meretz)}, בל״ד ${fmt(w.balad)}) נפלו מתחת לאחוז החסימה ולא הפכו למנדטים; מרצ החמיצה את הסף ב־${fmt(w.meretzGap)} קולות בלבד.</div>
    <p class="sec-note base-note">גוש נתניהו = הליכוד, ש״ס, יהדות התורה והציונות הדתית. גוש השינוי = יש עתיד, המחנה הממלכתי, העבודה, ישראל ביתנו, מרצ, רע״מ, חד״ש–תע״ל ובל״ד. נספרות רשימות שקיבלו 1.5% ומעלה; הבית היהודי (${fmt(N.parties.find(p => p.id === "jewish_home")?.votes || 0)}, 1.19%) אינו נספר. מקור: <a href="${esc(w.source.url)}" target="_blank" rel="noopener">${esc(w.source.name)} ↗</a>.</p>`;
}

/* שלב 1 של המודל הדמוגרפי + שורת המקור של שלב 2 */
function renderResultsBase() {
  const R = S.regions, r22 = S.hist ? histBlocs(S.hist.actual || {}, S.hist.blocs || BLOCS_2022).netanyahu : 64;
  $("#nat-stats").innerHTML = natStatsHTML();
  $("#base-blocs").innerHTML = baseBlocsHTML();
  $("#map-takeaway").innerHTML = `<b>מה לומדים מזה לתחזית:</b> זו נקודת המוצא של כל בדיקה באתר — וגם האזהרה שלה. רוב של ${r22} אינו ״בסיס״ מובטח: בקולות הגושים היו שקולים, וההכרעה נפלה על אחוז החסימה. לכן התחזית סופרת גם רשימות שמתחת לסף, ולא רק מנדטים, ולכן שינוי קטן בגודל הקבוצות (שלבים 2–4) יכול להכריע.`;
  const votersSum = S.demo ? S.demo.sectors.reduce((t, x) => t + x.eligible2022 * x.turnout, 0) : 0;
  const rs = R.religiosity.source, as = R.sectors.find(x => x.id === "arab")?.source;
  $("#relig-source").innerHTML = `${votersSum ? `סכום המצביעים לפי הקבוצות (~${fmt(Math.round(votersSum / 1000) * 1000)}) גבוה מעט ממספר הקולות הכשרים (${fmt(R.national.valid)}): שיעורי ההצבעה של הקבוצות הם אומדנים ממקורות שונים, וכוללים גם קולות פסולים. ` : ""}${esc(R.religiosity.title)} — מקור: <a href="${esc(rs.url)}" target="_blank" rel="noopener">${esc(rs.name)} ↗</a>${as ? `. המגזר הערבי — מקור: <a href="${esc(as.url)}" target="_blank" rel="noopener">${esc(as.name)} ↗</a>` : ""}`;
}

/* עמוד "בחירות 2022": התוצאה הלאומית, המפה, רשימת היישובים ופילוחי המגזרים */
function renderRegions() {
  const R = S.regions;
  $("#r22-stats").innerHTML = natStatsHTML();
  $("#r22-blocs").innerHTML = baseBlocsHTML();

  // ---- map: every locality from the official file that has coordinates ----
  mapLocalities();
  if (!renderLeafletMap()) $("#map-svg").innerHTML = mapSVG({ labelMin: 14000 });   // בלי Leaflet (למשל בקובץ היחיד) — מפת SVG
  const used = [...new Set(S.mapLocs.map(l => l.top[0]?.id).filter(Boolean))].sort((a, b) => S.mapLocs.filter(l => l.top[0]?.id === b).length - S.mapLocs.filter(l => l.top[0]?.id === a).length);
  $("#map-legend").innerHTML = used.map(id => {
    const nm = R.national.parties.find(p => p.id === id)?.name || id;
    return `<span style="--c:${R.partyColors[id] || "#96A0AB"}"><i></i>${esc(nm)}</span>`;
  }).join("");
  $("#map-count").textContent = `${fmt(S.mapLocs.length)} יישובים ו־${fmt(S.mapLocs.reduce((t, l) => t + l.valid, 0))} קולות על המפה (${pct(100 * S.mapLocs.reduce((t, l) => t + l.valid, 0) / R.national.valid)} מהקולות הכשרים).`;
  renderMapList($("#map-q")?.value || "");
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

  // ---- what each section teaches about the 2026 forecast ----
  const arabSec = S.demo?.sectors.find(x => x.id === "arab"), aSector = R.sectors.find(x => x.id === "arab");
  const arabLists = aSector ? aSector.parties.filter(p => p.id !== "jewish").reduce((t, p) => t + p.pct, 0) / 100 : .857;
  const per5 = arabSec ? arabSec.eligible2022 * 0.05 * arabLists / seatCost() : 0;
  const yosh = R.sectors.find(x => x.id === "yosh");
  $("#sectors-takeaway").innerHTML = `<b>מה לומדים מזה לתחזית:</b> שיעור ההצבעה במגזר הערבי הוא המשתנה הגדול ביותר במפה: הוא נע בין ${pct(aSector?.turnoutPrev || 44.6)} ל־${pct(aSector?.turnoutDecadeAvg || 55.9)} בעשור האחרון, וכל 5 נקודות בו ≈ ${seatsHe(per5)} לרשימות הערביות — מנדטים שיוצאים בעיקר מגוש הימין. ${yosh ? `ביהודה ושומרון ההצבעה גבוהה ויציבה (${pct(yosh.turnout)}) ו־${pct(yosh.parties.slice(0, 2).reduce((t, p) => t + p.pct, 0))} מהקולות הולכים לשתי הרשימות הראשונות — בסיס קבוע שכמעט אינו זז בין סקר לסקר.` : ""}`;
  $("#clusters-takeaway").innerHTML = `<b>מה לומדים מזה לתחזית:</b> השסע המעמדי הוא שסע הגושים. ביישובים החלשים מובילות המפלגות החרדיות והערביות, במעמד הבינוני הליכוד, וביישובים החזקים יש עתיד. לכן מעבר קולות בין שתי מפלגות באותו אשכול כמעט לא משנה את מאזן הגושים — ואילו שינוי קטן בשיעור ההצבעה באשכולות 1–3 (החרדים והערבים גם יחד) מזיז אותו יותר מכל תנודה אחרת בסקרים.`;

}

/* ---- הגשר בין המפה למודל ----
   תיאור המגזר של כל יישוב במפה (טקסט חופשי בקובץ הנתונים) ממופה לקבוצות
   הזהות של המודל הדמוגרפי, כדי שהמפה והכרטיסים יוכלו להצביע זה על זה. */
const LOC_IDENTITY = { haredi:/חרדי/, dati:/דתי/, mesorati:/מסורתי|עיירת פיתוח|פריפריאל/, hiloni:/חילוני/, arab:/ערבי|דרוזי/ };
const localityIdentities = loc => loc ? Object.keys(LOC_IDENTITY).filter(k => LOC_IDENTITY[k].test(loc.sector || "")) : [];

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


/* רשימת המפה: כל יישוב מהקובץ הרשמי שיש לו קואורדינטות; היישובים המסוקרים
   (regions.localities) תורמים את התיאור, האזור וההערה שלהם. */
function mapLocalities() {
  if (S.mapLocs) return S.mapLocs;
  const R = S.regions, key = n => String(n || "").replace(/[\s–—\-־"״׳']/g, "");
  const curated = new Map(R.localities.map(l => [key(l.name), l]));
  S.mapLocs = (R.localitiesFull || []).filter(l => l.lon != null && l.lat != null && l.name !== "מעטפות חיצוניות")
    .map(l => { const c = curated.get(key(l.name)); return { ...l, region: c?.region, sector: c?.sector, note: c?.note, parties: c?.parties?.length >= 4 ? c.parties : null }; })
    .sort((a, b) => b.valid - a.valid);
  return S.mapLocs;
}

/* סיווג יישוב לקבוצות הזהות של המודל לפי דפוס ההצבעה שלו ב־2022 (ארבע הרשימות
   המובילות), בתוספת מילות המפתח של היישובים המסוקרים. */
function inferIdentities(loc) {
  const p = Object.fromEntries((loc.top || []).map(t => [t.id, t.pct]));
  const sum = (...ids) => ids.reduce((t, id) => t + (p[id] || 0), 0);
  const out = new Set(localityIdentities(loc));
  if (sum("utj", "shas") >= 45) out.add("haredi");
  if (sum("raam", "hadash_taal", "balad") >= 45) out.add("arab");
  if (sum("religious_zionism", "jewish_home") >= 30) out.add("dati");
  if (sum("yesh_atid", "national_unity", "labor", "meretz", "yisrael_beiteinu") >= 45) out.add("hiloni");
  if ((p.likud || 0) >= 38 && !out.has("haredi")) out.add("mesorati");
  return [...out];
}

function mapSVG({ labelMin = 14000, big = true } = {}) {
  const R = S.regions, locs = mapLocalities(), G = R.geo;
  const [minLon, minLat, maxLon, maxLat] = G.bbox;
  const box = { minLon, maxLon, minLat, maxLat, W: 520, H: 900, pad: 18 };
  const path = pts => pts.map((p, i) => { const [x, y] = project(p[0], p[1], box); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("") + "Z";
  const dots = locs.map((loc, i) => {
    const [x, y] = project(loc.lon, loc.lat, box);
    const l = loc.top[0], col = l ? (R.partyColors[l.id] || "#96A0AB") : "#96A0AB";
    const rr = clamp(1.9 + Math.sqrt(loc.valid) / 28, 1.9, 11);
    const label = loc.valid >= labelMin;
    return `<g class="locdot${i === S.selectedLoc ? " sel" : ""}${label ? " lbl" : ""}" data-loc="${i}" tabindex="${label ? 0 : -1}" role="button" aria-label="${esc(loc.name)}"><title>${esc(loc.name)} · ${fmt(loc.valid)} קולות${l ? ` · ${esc(l.name)} ${pct(l.pct)}` : ""}</title>
      <circle class="core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="${col}" fill-opacity=".88" stroke="#fff" stroke-width="${rr > 4 ? 1.2 : .6}"/>
      ${label ? `<text x="${(x + rr + 3).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="start">${esc(loc.name)}</text>` : ""}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${box.W} ${box.H}" role="img" aria-label="מפת כל היישובים עם תוצאות האמת של 2022">
      <defs><filter id="landShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#0B2740" flood-opacity=".22"/></filter></defs>
      <rect width="${box.W}" height="${box.H}" fill="#D6E4EC" rx="14"/>
      <g filter="url(#landShadow)"><path class="landmass" d="${path(G.israel)}"/></g>
      <path class="territory" d="${path(G.westbank)}"/>
      <path class="territory" d="${path(G.gaza)}"/>
      ${dots}
    </svg>`;
}

function locDetailHTML(loc) {
  const R = S.regions, ids = inferIdentities(loc);
  const rows = loc.parties || loc.top;
  return `<p class="kicker">${loc.region ? `${esc(loc.region)} · ${esc(loc.sector)}` : "תוצאות הכנסת ה־25"}</p>
    <h3>${esc(loc.name)}</h3>
    <p class="lmeta">${fmt(loc.valid)} קולות כשרים${loc.turnout ? ` · אחוז הצבעה ${pct(loc.turnout)}` : ""}</p>
    <div class="lbars">${rows.map(p => `<div class="lbar" style="--c:${R.partyColors[p.id] || "#96A0AB"}">
        <span>${esc(p.name)}</span><i><b style="--w:${clamp(p.pct * 2.2)}%"></b></i><span class="v">${pct(p.pct)}</span></div>`).join("")}</div>
    ${loc.note ? `<p style="margin:12px 0 0;color:var(--ink-3);font-size:.78rem">${esc(loc.note)}</p>` : ""}
    ${ids.length ? `<div class="loc-identity"><span>קבוצות הזהות במודל הדמוגרפי (לפי דפוס ההצבעה):</span>${ids.map(id => { const sec = S.demo.sectors.find(x => x.id === id); return `<a class="chip" href="#/demography" data-jump-sector="${id}" style="border-color:${sec?.color || "#ccc"}">${esc(sec?.name || id)}</a>`; }).join("")}</div>` : `<p class="loc-identity muted">דפוס הצבעה מעורב — ללא שיוך חד־משמעי לקבוצת זהות אחת.</p>`}
    <span class="src">מקור: <a href="${esc(R.sources.official?.url || "#")}" target="_blank" rel="noopener">${esc(R.sources.official?.name || "ועדת הבחירות המרכזית")} ↗</a></span>`;
}

/* ---- מפה אמיתית (Leaflet + אריחי OpenStreetMap), אם הספרייה נטענה ---- */
function renderLeafletMap() {
  if (typeof L === "undefined" || !$("#map-svg")) return false;
  const R = S.regions, locs = mapLocalities();
  if (S.leaflet) { S.leaflet.map.invalidateSize(); return true; }
  const box = $("#map-svg"); box.classList.add("leaflet-host"); box.innerHTML = "";
  const map = L.map(box, { preferCanvas: true, zoomControl: true, scrollWheelZoom: true, attributionControl: true, minZoom: 6, maxZoom: 15 });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.fitBounds([[29.45, 34.2], [33.35, 35.95]]);
  const layer = L.layerGroup().addTo(map), markers = [];
  const rOf = v => clamp(3 + Math.sqrt(v) / 22, 3, 22);
  locs.forEach((loc, i) => {
    const l = loc.top[0], col = l ? (R.partyColors[l.id] || "#96A0AB") : "#96A0AB";
    const m = L.circleMarker([loc.lat, loc.lon], { radius: rOf(loc.valid), color: "#fff", weight: 1, fillColor: col, fillOpacity: .85 });
    m.bindTooltip(`<b>${esc(loc.name)}</b><br>${fmt(loc.valid)} קולות${l ? ` · ${esc(l.name)} ${pct(l.pct)}` : ""}`, { direction: "top", sticky: true, className: "map-tip" });
    m.on("click", () => { S.selectedLoc = i; S.locPicked = true; renderLocDetail(); $$("#map-list [data-loc]").forEach(b => b.classList.toggle("sel", Number(b.dataset.loc) === i)); });
    m.addTo(layer); markers[i] = m;
  });
  S.leaflet = { map, markers, base: rOf };
  return true;
}
function leafletSelect(i, fly) {
  const lf = S.leaflet; if (!lf) return;
  lf.markers.forEach((m, k) => m.setStyle({ color: k === i ? "#141A21" : "#fff", weight: k === i ? 3 : 1 }));
  const m = lf.markers[i];
  if (m) { m.bringToFront(); if (fly) lf.map.flyTo(m.getLatLng(), Math.max(lf.map.getZoom(), 10), { duration: .8 }); }
}

function renderLocDetail(fly = false) {
  const loc = mapLocalities()[S.selectedLoc];
  if (!loc) return;
  const box = $("#loc-detail"); if (box) box.innerHTML = locDetailHTML(loc);
  $$("#map-svg .locdot").forEach(g => g.classList.toggle("sel", Number(g.dataset.loc) === S.selectedLoc));
  leafletSelect(S.selectedLoc, fly);
  /* יישוב שהמשתמש בחר במפה מדגיש את שורות הקבוצות שמרכיבות אותו בטבלאות (לא בברירת המחדל) */
  const ids = inferIdentities(loc);
  $$("#demo-main [data-sector]").forEach(c => c.classList.toggle("is-linked", !!S.locPicked && ids.includes(c.dataset.sector)));
}

function renderMapList(q) {
  const locs = mapLocalities(), qq = q.trim();
  const rows = (qq ? locs.filter(l => l.name.includes(qq)) : locs).slice(0, 40);
  $("#map-list").innerHTML = rows.map(l => { const i = locs.indexOf(l), t = l.top[0]; return `<button type="button" data-loc="${i}" class="${i === S.selectedLoc ? "sel" : ""}"><b>${esc(l.name)}</b><span>${fmt(l.valid)} קולות${t ? ` · <i style="background:${S.regions.partyColors[t.id] || "#96A0AB"}"></i>${esc(t.name)} ${pct(t.pct)}` : ""}</span></button>`; }).join("") || `<p class="empty">לא נמצא יישוב בשם הזה.</p>`;
  $("#map-list-count").textContent = qq ? `${rows.length} תוצאות` : `${fmt(locs.length)} יישובים · הגדולים ראשונים · 40 מוצגים`;
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

function renderDemography() {
  renderIdentityTable();      // שלב 2 — מי הצביע ב־2022
  renderDemoControls();       // שלב 3 — ההנחות
  renderResultTable();        // שלב 4א — כמה יצביעו ב־2026
  renderDemoComparison();     // שלב 4ב — רשימת השינוי והמסלול השנתי (upgrade.js)
  renderBlocPies();           // שלב 4ב — שתי העוגות במקום עמודות האחוזים
  const m0 = runDemoModel(0), m1 = runDemoModel(S.demo.meta.years);
  const sh = (m, c) => 100 * (m.campVotes[c] || 0) / m.campTotal;
  const d = (sh(m1, "right") + sh(m1, "haredi")) - (sh(m0, "right") + sh(m0, "haredi"));
  const seats = d / 100 * 120;
  const scen = S.scenarioOptions?.demographic ?? 2;
  $("#demo-takeaway").innerHTML = `<b>מה לומדים מזה לתחזית:</b> בלי אף סקר, הדמוגרפיה לבדה ${d >= 0 ? "מוסיפה" : "גורעת"} לימין ולחרדים ${pointsHe(d)} עד 2026 — כ־${seatsHe(seats)}. זו התחזית העצמאית לגודל הגושים, וזה מה שעומד מאחורי ״התוספת הדמוגרפית״ של ${scen} מנדטים בתחזית הברומטר שבתמונת המצב: ${Math.abs(seats - scen) <= 1 ? "המודל כאן מאשר אותה בערך" : seats > scen ? "המודל כאן מצביע על תוספת גדולה יותר" : "המודל כאן מצביע על תוספת קטנה יותר"}. הזיזו את הידיות בשלב 3 כדי לראות כמה ההנחה הזו רגישה.`;
}

/* תא ראשון בכל טבלה: נקודת צבע + שם הקבוצה. אותו סדר שורות בכל שלב. */
const groupCell = s => `<th scope="row" class="gcell"><i style="background:${s.color}"></i>${esc(s.name)}</th>`;
/* אותו סדר בכל השלבים: מהקבוצה הגדולה לקטנה */
const sectorsBySize = () => [...S.demo.sectors].sort((a, b) => b.eligible2022 - a.eligible2022);
const linkedNow = () => S.locPicked ? localityIdentities(S.regions?.localities?.[S.selectedLoc]) : [];

/* שלב 2 — מי הצביע ב־2022: גודל, הצבעה, ארבע הרשימות, גושים */
function renderIdentityTable() {
  const D = S.demo, linked = linkedNow(), secs = sectorsBySize();
  const totalEl = D.sectors.reduce((t, s) => t + s.eligible2022, 0);
  $("#electorate-bar").innerHTML = `<div class="elect-bar" role="img" aria-label="${esc(secs.map(s => `${s.name} ${pct(100 * s.eligible2022 / totalEl)}`).join(", "))}">${
      secs.map(s => `<span style="flex:${s.eligible2022};background:${s.color}" title="${esc(s.name)}: ${fmt(s.eligible2022)} בעלי זכות בחירה">${100 * s.eligible2022 / totalEl >= 8 ? `${esc(s.name)} ${Math.round(100 * s.eligible2022 / totalEl)}%` : ""}</span>`).join("")
    }</div><p class="elect-note">${fmt(totalEl)} בעלי זכות בחירה ב־2022, לפי חמש קבוצות זהות</p>`;
  let rightTop = null, rightLow = null;
  $("#identity-table").innerHTML = `<table class="dtable"><thead><tr><th>קבוצה</th><th class="n">בעלי זכות בחירה</th><th class="n">הצביעו</th><th class="n">מצביעים</th><th>לאילו רשימות · ארבע הגדולות</th><th>לאיזה גוש</th></tr></thead><tbody>${
    secs.map(s => {
      const v = S.regions ? identityVote2022(s.id) : null;
      const voters = s.eligible2022 * s.turnout;
      if (v) { if (!rightTop || v.rightShare > rightTop.v) rightTop = { n: s.name, v: v.rightShare }; if (!rightLow || v.rightShare < rightLow.v) rightLow = { n: s.name, v: v.rightShare }; }
      return `<tr data-sector="${s.id}" class="${linked.includes(s.id) ? "is-linked" : ""}" style="--c:${s.color}">
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
  $("#identity-takeaway").innerHTML = rightTop ? `<b>מה לומדים מזה לתחזית:</b> הזהות מנבאת את ההצבעה כמעט לחלוטין: ${esc(rightTop.n)} נותנים ${Math.round(rightTop.v)}% לימין ולחרדים, ${esc(rightLow.n)} ${Math.round(rightLow.v)}%. לכן שינוי בגודל הקבוצות (שלב 3) מזיז את מאזן הגושים גם בלי שאף אחד ישנה את דעתו — וזה בדיוק מה שהמודל מודד. הפילוח הפנימי של החילונים — כ־${Math.round(identityVote2022("hiloni")?.rightShare || 0)}% ימין מול ${Math.round(100 - (identityVote2022("hiloni")?.rightShare || 0))}% מרכז־שמאל — נגזר מהצבעתם, לא ממדידה נפרדת.` : "";
}

/* שלב 3 — ההנחות: אחוז הצבעה וגידול, ידית לכל קבוצה */
function renderDemoControls() {
  const D = S.demo, P = demoParams(), linked = linkedNow();
  $("#demo-controls").innerHTML = `<table class="dtable dtable-ctl"><thead><tr><th>קבוצה</th><th>אחוז הצבעה ב־2026 <small>(ב־2022)</small></th><th>גידול שנתי בבעלי זכות הבחירה</th><th>על מה זה מבוסס</th></tr></thead><tbody>${
    sectorsBySize().map(s => {
      const g = P[s.id].growth, t = P[s.id].turnout;
      return `<tr data-sector="${s.id}" class="${linked.includes(s.id) ? "is-linked" : ""}" style="--c:${s.color}">
        ${groupCell(s)}
        <td><label><span class="identity-lbl"><b class="num">${(t * 100).toFixed(0)}%</b><small>ב־2022: ${pct(s.turnout * 100)}</small></span>
          <input type="range" min="35" max="95" step="1" value="${(t * 100).toFixed(0)}" data-sec="${s.id}" data-kind="turnout" aria-label="אחוז הצבעה · ${esc(s.name)}"></label></td>
        <td><label><span class="identity-lbl"><b class="num">${(g * 100).toFixed(1)}%</b><small>${fmt(s.eligible2022)} → ${fmt(s.eligible2022 * Math.pow(1 + g, D.meta.years))}</small></span>
          <input type="range" min="-1" max="6" step="0.1" value="${(g * 100).toFixed(1)}" data-sec="${s.id}" data-kind="growth" aria-label="גידול שנתי · ${esc(s.name)}"></label></td>
        <td class="why"><p><b>גידול אוכלוסייה:</b> ${pct(s.growth * 100)} בשנה. <b>הצבעה ב־2022:</b> ${pct(s.turnout * 100)}.</p><span class="src">מקור: <a href="${esc(D.sources[s.src].url)}" target="_blank" rel="noopener">${esc(D.sources[s.src].name)} ↗</a></span></td>
      </tr>`;
    }).join("")}</tbody></table>`;
  const changed = Object.keys(S.demoOverrides).length;
  $("#assump-note").textContent = changed ? "ההנחות שונו מערכי הבסיס — שלב 4 מחושב לפיהן." : "ההנחות הן ערכי הבסיס מהמקורות. הרגלי ההצבעה של 2022 אינם משתנים.";
}

/* שלב 4א — 120 מנדטים לא משתנים. מה שמשתנה הוא חלקה של כל קבוצה מכלל המצביעים,
   ולפי דפוס ההצבעה שלה ב־2022 — כמה מנדטים עוברים בין הגושים. הסכום תמיד 0. */
function renderResultTable() {
  const D = S.demo, P = demoParams(), linked = linkedNow(), years = D.meta.years, secs = sectorsBySize();
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
    return `<tr data-sector="${r.s.id}" class="${linked.includes(r.s.id) ? "is-linked" : ""}" style="--c:${r.s.color}">
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
    ["ויקיפדיה — הבחירות לכנסת ה־24: סקרים", "https://he.wikipedia.org/wiki/הבחירות_לכנסת_העשרים_וארבע#סקרים", "סקרי החודש שלפני בחירות 2021, לכיול המכונים"],
    ["ויקיפדיה — הבחירות לכנסת ה־23: סקרים", "https://he.wikipedia.org/wiki/הבחירות_לכנסת_העשרים_ושלוש#סקרים", "סקרי החודש שלפני בחירות 2020, לכיול המכונים"],
    ["ויקיפדיה — Opinion polling for the 2022 election", "https://en.wikipedia.org/wiki/Opinion_polling_for_the_2022_Israeli_legislative_election", "אימות סקר־סקר של ארכיון 2022 של האתר"],
    ["הפרסומים עצמם — חדשות 12, חדשות 13, כאן 11, ערוץ 14, מעריב, ישראל היום, i24NEWS, זמן ישראל, וואלה, 103FM, גל״צ", "#/polls", "סקרי 2026 נאספים מהפרסום המקורי, עם תאריך, מכון וכלי תקשורת לצד כל סקר"]
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
  $("#m-live-polls").innerHTML = [[polls.length, "סקרים ב־8 הימים האחרונים"], [firms.length, "מכונים"], [outlets.length, "כלי תקשורת"], [heD(cur.generatedAt), "עודכן לאחרונה"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  $("#m-outlets").innerHTML = [...new Set(cur.polls.map(p => p.channelHebrewName))].map(name => {
    const l = S.firms.outletLogos[name];
    return `<span title="${esc(name)}">${l ? `<img src="${esc(l)}" alt="${esc(name)}" loading="lazy">` : esc(name.slice(0, 3))}</span>`;
  }).join("");
  // 2 · firms and their weight in the mix
  const W = S.series.reduce((t, s) => t + firmWeight(s.meta), 0) || 1;
  $("#m-firms").innerHTML = `<thead><tr><th>מכון</th><th>דרגה</th><th class="n">ציון</th><th class="n">סקרים בחלון</th><th class="n">משקל בתחזית</th></tr></thead><tbody>${
    S.series.slice().sort((a, b) => firmScore(b.meta) - firmScore(a.meta)).map(s => {
      const sc = firmScore(s.meta), g = s.meta.calibrated ? gradeOf(sc) : { key: "none", label: "ללא דירוג · 70" };
      return `<tr><td><strong>${esc(s.meta.he)}</strong></td><td><span class="grade ${g.key}">${esc(g.label)}</span></td><td class="n">${r1(sc)}</td><td class="n">${s.polls.length}</td><td class="n"><b>${r1(100 * firmWeight(s.meta) / W)}%</b></td></tr>`;
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
  $("#m-live-scenario").innerHTML = [[`${fx.shas} · ${fx.yahadut_hatora} · ${fx.raam}`, "ש״ס · יהדות התורה · רע״מ, קבועות"], [`${Math.round((o.blend ?? .5) * 100)}%`, "קירוב למאזן 2022"], [`+${o.demographic ?? 2}`, "תוספת דמוגרפית לימין, מנדטים"], [sc.scenario ? r1(sc.scenario.anchor + sc.scenario.demographic) : "—", "מנדטים שההנחות הזיזו היום"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  // 5 · demography check
  if (S.demo) {
    const ms = demoDriftSeats(), d = ms / 120 * 100, corr = sc.scenario?.demographicCorrected, want = o.demographic ?? 2;
    $("#m-live-demo").innerHTML = [[`${d >= 0 ? "+" : "−"}${r1(Math.abs(d))} נק׳`, "לימין ולחרדים עד 2026, מהדמוגרפיה בלבד"], [`≈ ${ms >= 0 ? "+" : "−"}${r1(Math.abs(ms))}`, "מנדטים"], [`${want}`, "ההנחה בשלב 4"], [corr ? `מתקן ל־${corr.to}` : "מאשר", corr ? "המודל החליף את ההנחה" : "המודל את ההנחה · הפער קטן ממנדט"]]
      .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  }
  // 6 · result
  const seats = allocateSeats(sc.parties), bt = {};
  Object.entries(seats).forEach(([id, n]) => { const al = partyMeta(id).alignment; bt[al] = (bt[al] || 0) + n; });
  $("#m-live-result").innerHTML = [[bt.Right || 0, "גוש הימין"], [bt.Left || 0, "מרכז־שמאל"], [bt.Arabs || 0, "הרשימות הערביות"], [Object.values(seats).reduce((t, v) => t + v, 0), "סך הכול מנדטים"]]
    .map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");
  const pairs = activeAgreements(sc.parties), rules = $("#m-rules");
  if (rules) rules.innerHTML = `<b>הסכמי עודפים בחישוב:</b> ${pairs.length ? pairs.map(([a, b]) => `${esc(partyMeta(a).name)}–${esc(partyMeta(b).name)}`).join(" · ") : "אין"}. ${esc(ELECTION_RULES.agreementsStatus)}.`;
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

function exitSlideHTML(channel, kind, live) {
  if(kind==="current") {
    const sample=exitSample(live,channel);
    if(sample && Date.now()>=Date.parse(ELECTION_TIMELINE.exitPolls)) {
      const counts=liveBlocCounts(sample.parties), entries=[[counts.Right||0,"גוש הימין והחרדים"],[counts.Left||0,"מרכז־שמאל"],[counts.Arabs||0,"הרשימות הערביות"],[counts.Unknown||0,"ללא שיוך"]].filter(([n])=>n>0);
      return `<div class="es-content es-current"><span class="es-eyebrow">מדגם 2026 · ${esc(channel.name)}</span><h3>נתוני הגושים</h3>${exitBlocHTML(entries.map(e=>e[0]),entries.map(e=>e[1]),"מדגם 2026 של "+channel.name)}<small>מקור: ${esc(sample.sourceName||channel.name)}${sample.publishedAt?` · עודכן ${heDate(sample.publishedAt)}`:""}</small></div>`;
    }
    return `<div class="es-content es-waiting"><span class="es-eyebrow">מדגם 2026 · ${esc(channel.name)}</span><div class="es-wait-icon" aria-hidden="true">26</div><h3>${Date.now()<Date.parse(ELECTION_TIMELINE.exitPolls)?"מחכים למדגם 2026":"ממתינים לנתוני המדגם"}</h3><p>חלוקת הגושים תופיע כאן עם פרסום הנתונים בערוץ.</p></div>`;
  }
  if(channel.id==="i24news") return `<div class="es-content es-brand es-brand-i24"><span class="es-eyebrow">מסך הערוץ</span><img src="assets/logos/i24news.png" alt="סמל i24NEWS" loading="lazy"><h3>i24NEWS</h3><p>מדגם ליל הבחירות</p></div>`;
  return `<div class="es-photo"><img src="${channel.photo}" alt="צילום מדגם 2022 של ${esc(channel.name)}" loading="lazy"><div class="es-photo-caption"><span class="es-eyebrow">מדגם 2022</span><b>${esc(channel.name)}</b></div></div>`;
}

function updateExitShowcaseSlides() {
  const grid=$("#exit-showcase-grid");
  if(!grid) return;
  const now=Date.now();
  for(const channel of EXIT_SHOWCASE_CHANNELS) {
    const state=exitShowcaseState.cards.get(channel.id),card=grid.querySelector(`[data-exit-channel="${channel.id}"]`);
    if(!state||!card) continue;
    if(now-state.started>=EXIT_SLIDE_MS) {state.index=(state.index+Math.floor((now-state.started)/EXIT_SLIDE_MS))%state.count;state.started=now;}
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
      return `<article class="es-card" data-exit-channel="${channel.id}" aria-label="${esc(channel.name)}">
        <header><span class="es-channel-logo"><img src="${channel.logo}" alt="לוגו ${esc(channel.name)}"></span><b>${esc(channel.name)}</b></header>
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
const VIEWS = { home:"", polls:"polls", e2022:"2022", map:"map", crossover:"crossover", live:"live", results:"results", haredi:"haredi", demography:"demography", method:"method" };
/* כתובות ישנות שעדיין עשויות להיות מקושרות מבחוץ */
const VIEW_ALIASES = { regions:"map" };
const rendered = {};

function show(view) {
  if (!VIEWS.hasOwnProperty(view)) view = "home";
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
      if (view === "home") renderHome();
      if (view === "polls") renderPolls();
      if (view === "e2022") render2022();
      if (view === "crossover") renderCrossover();
      if (view === "live") renderLiveResults();
      if (view === "results") renderOfficialResults();
      if (view === "haredi") renderHaredi();
      if (view === "map") renderRegions();
      if (view === "demography") { renderResultsBase(); renderDemography(); }
      if (view === "method") renderMethod();
      rendered[view] = true;
    } catch (e) { console.error(e); }
  }
  if (view === "live" || view === "results") refreshLiveResults(true);
  if (view === "map" && S.leaflet) setTimeout(() => S.leaflet.map.invalidateSize(), 50);
  const t = { home:"התחזית", polls:"כל הסקרים", e2022:"דיוק המכונים", crossover:"כמה עברו צד", live:"ליל הבחירות · המדגמים", results:"ליל הבחירות · תוצאות האמת", haredi:"התרחיש החרדי", map:"בחירות 2022", demography:"המודל הדמוגרפי", method:"שיטת החישוב" }[view];
  document.title = `${t} · ברומטר`;
  document.dispatchEvent(new Event("barometer:view"));
  window.scrollTo({ top: 0, behavior: rendered[view] ? "auto" : "auto" });
}

function routeFromHash() {
  const h = (location.hash || "#/").replace(/^#\/?/, "");
  const view = VIEW_ALIASES[h] || Object.keys(VIEWS).find(k => VIEWS[k] === h) || "home";
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

  const pickLoc = g => { S.selectedLoc = Number(g.dataset.loc); S.locPicked = true; renderLocDetail(g.tagName === "BUTTON"); $$("#map-list [data-loc]").forEach(b => b.classList.toggle("sel", Number(b.dataset.loc) === S.selectedLoc)); };
  ["#map-svg", "#map-list"].forEach(sel => {
    $(sel)?.addEventListener("click", e => { const g = e.target.closest("[data-loc]"); if (g) pickLoc(g); });
    $(sel)?.addEventListener("keydown", e => { const g = e.target.closest("[data-loc]"); if (g && g.tagName !== "BUTTON" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickLoc(g); } });
  });
  $("#map-q")?.addEventListener("input", e => renderMapList(e.target.value));

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

  $("#scen-switch")?.addEventListener("click", e => {
    const b = e.target.closest("[data-scen]"); if (!b) return;
    S.scen = b.dataset.scen; render2022();
  });
  $("#print-btn")?.addEventListener("click", () => window.print());

  /* המפה ↔ המודל: ריחוף/מיקוד על כרטיס קבוצת זהות מדגיש במפה את היישובים שבהם היא בולטת */
  const ctl = $("#demo-main");
  const hl = sec => $$("#map-svg .locdot").forEach(g => {
    const ids = inferIdentities(mapLocalities()[Number(g.dataset.loc)] || {});
    g.classList.toggle("hl", !!sec && ids.includes(sec));
    g.classList.toggle("dim", !!sec && !ids.includes(sec));
  });
  ctl?.addEventListener("mouseover", e => { const c = e.target.closest("[data-sector]"); if (c) hl(c.dataset.sector); });
  ctl?.addEventListener("mouseleave", () => hl(null));
  ctl?.addEventListener("focusin", e => { const c = e.target.closest("[data-sector]"); if (c) hl(c.dataset.sector); });
  ctl?.addEventListener("focusout", e => { if (!ctl.contains(e.relatedTarget)) hl(null); });
  /* ולהפך: שבב קבוצה בפרטי היישוב קופץ לשורה המתאימה */
  /* שבב קבוצה בפרטי היישוב → עמוד המודל, ישר לשורת הקבוצה */
  document.addEventListener("click", e => {
    if (!e.target.closest("#loc-detail")) return;
    const a = e.target.closest("[data-jump-sector]"); if (!a) return;
    e.preventDefault();
    location.hash = "#/demography";
    setTimeout(() => $(`#identity-table [data-sector="${CSS.escape(a.dataset.jumpSector)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
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
    /* [שנה, מפתח ייחודי, תווית קצרה, קובץ]. הכיול מתחיל ב־2020: מערכות ישנות יותר
       אינן מלמדות על מכון שהספיק ללמוד ולהשתנות מאז. */
    const EXTRA_CALIB = [[2021, "2021", "2021", "data/historical-polls-2021.json"], [2020, "2020", "2020", "data/historical-polls-2020.json"]];
    const [hist, cur, firms, regions, demo, haredi, ...extra] = await Promise.all(
      ["data/historical-polls.json", "data/current-polls.json", "data/pollsters.json", "data/regions.json", "data/demographics.json", "data/haredi.json"]
        .map(u => (window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u]) : fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u); return r.json(); })))
        .concat(EXTRA_CALIB.map(([, , , u]) => window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u] || null) : loadJSONOptional(u))));
    const leaders = window.__BAROMETER_DATA__ ? (window.__BAROMETER_DATA__["data/leaders.json"] || null) : await loadJSONOptional("data/leaders.json");
    const forecastHistory = window.__BAROMETER_DATA__ ? (window.__BAROMETER_DATA__["data/forecast-history.json"] || null) : await loadJSONOptional("data/forecast-history.json");
    /* current-polls.json כבר מוגבל ל-MAX_PER_OUTLET לכל ערוץ (גם בשרת וגם
       פה בלקוח) — לתצוגת "כל ההיסטוריה" בכרטיס הסקר צריך את הארכיון
       המלא, שלא מוגבל. אופציונלי: אם נכשל, בורר התאריך בכרטיס פשוט נשאר
       מוגבל כמו קודם. */
    const pollsArchive = window.__BAROMETER_DATA__ ? (window.__BAROMETER_DATA__["data/polls-archive.json"] || null) : await loadJSONOptional("data/polls-archive.json");
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
    S.counterStats = scoreFirms(hist, COUNTERFACTUAL);
    S.forecastPolls = recentForForecast(S.cur.polls);
    S.series = buildSeries(S.forecastPolls);

    $("#hero-art").innerHTML = KNESSET_SVG;
    $("#stamp-updated").textContent = `עודכן ${heDate(cur.generatedAt)}`;

    renderSources();
    wire();
    await refreshLiveResults(true);
    renderElectionTimer();
    renderNightCountdown();
    S.countdownTimer = setInterval(() => {
      if (document.hidden) return;
      renderElectionTimer();
      const wasWaiting = !!document.querySelector('.night-waiting');
      if (!renderNightCountdown() && wasWaiting) { renderLiveResults(); renderOfficialResults(); refreshLiveResults(true); }
    }, 1000);
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

  $("#haredi-sources").innerHTML = Object.values(H.sources).map(x =>
    `<a class="card pad" href="${esc(x.url)}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;justify-content:space-between;gap:14px;align-items:center">
      <span style="font-size:.9rem;font-weight:600">${esc(x.name)}</span><span aria-hidden="true" style="color:var(--navy)">↗</span></a>`).join("");

  /* wiring */
  const wire = (id, key) => $(id).addEventListener("change", e => { S[key] = Number(e.target.value); renderHaredi(); $(id)?.focus(); });
  wire("#har-growth", "harGrowth"); wire("#har-turnout", "harTurnout"); wire("#har-loyalty", "harLoyalty"); wire("#har-shas-haredi", "harShasHaredi"); wire("#har-wasted", "harWasted");
  $("#har-reset").addEventListener("click", () => { S.harGrowth = null; S.harTurnout = null; S.harLoyalty = null; S.harShasHaredi = null; S.harWasted = null; renderHaredi(); $("#har-reset").focus(); });
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
