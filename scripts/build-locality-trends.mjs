#!/usr/bin/env node
/**
 * מגמות היישובים מספטמבר 2019 והתחזית ל־2026 (data/trends.json), וגידול כל סוג יישוב
 * (data/sector-growth.json). מחליף מ־05.10.2026 את scripts/build-locality-trends.py (אותו חישוב —
 * נבדק שנתן קובץ זהה); השינויים מאז: מגמה של היישוב עצמו, בלי "אחרות", ומלאה כברירת מחדל.
 *
 *   node scripts/build-locality-trends.mjs
 *
 * קורא את data/elections/*.json (2019b עד 2022 — כל רשימה באותה קבוצה לאורך כל התקופה)
 * ואת האזורים וסוגי היישובים של 2022 מ־data/results-2022.json. חמישה תאים: R ימין ·
 * H חרדים · L מרכז־שמאל · A ערבים · O רשימות מתחת ל־1.5% (בדף H מתאחד עם הימין).
 *
 * לכל יישוב:
 *   מגמה        — קו ישר משוקלל דרך חלקה של כל קבוצה בארבע הבחירות, של היישוב עצמו.
 *                 יישוב קטן נשען על מגמת האזור שלו; אף קבוצה לא זזה יותר מ־8 נקודות.
 *                 "אחרות" מושמטות מכל החישוב: החלקים הם מתוך ארבע הקבוצות בלבד
 *                 (רשימות קטנות שמתחלפות — ב־2022 גם הבית היהודי — היו מעוותות את הקו).
 *                 נשמרת במלואה; הדף מפעיל אותה בעוצמה שנבחרה (מלאה כברירת מחדל).
 *   בעלי זכות   — קצב הגידול שלהם 2019b–2022 (לוג־ליניארי), בין −3% ל־+10% בשנה.
 *   אחוז הצבעה  — הממוצע שלו בארבע הבחירות.
 * 2026 = תוצאת 2022 + המגמה, כפול בעלי זכות הבחירה שגדלו ואחוז ההצבעה הרגיל. הסכום על
 * כל היישובים (והמעטפות החיצוניות) הוא התחזית הארצית, מפורקת לדמוגרפיה / הצבעה / מגמה.
 *
 * אחוז ההצבעה של כל קבוצה (לידיות בדף) — לפי היישובים שבהם מצביעיה גרים.
 * בדיקה לאחור: אותו מודל על הבחירות עד 2021 "מנבא" את 2022.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = f => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));
const G = ["R", "H", "L", "A", "O"];
const GROUPS = ["R", "H", "L", "A"];
const TARGET = "2026-10-27";
const TAU = 10;               // משקל לפי קרבה: exp(−שנים לפני הבחירות האחרונות / TAU)
const RELATIVE = false;       // true — מגמה יחסית לכל הארץ (כך היה עד 05.10.2026: מחקה את התזוזה הכללית והוסיפה "ערבים" ליישובים יהודיים)
const EXCLUDE_OTHERS = true;  // החלקים מתוך ארבע הקבוצות בלבד — "אחרות" לא נכנסות לתחזית
const DEFAULT_TREND = 1;      // עוצמת המגמה בתחזית ברירת המחדל (הדף: st.fc.trend)
const SHRINK_VOTES = 3000;    // יישוב עם כל כך הרבה קולות — חצי מגמה שלו, חצי של האזור
const SHRINK_ELIG = 2000;
const MAX_SHIFT = 8;          // נקודות לקבוצה עד 2026
const ENVELOPES = 99999;

const index = rd("data/elections/index.json");
const E = index.map(e => rd(`data/elections/${e.id}.json`));
const base = rd("data/results-2022.json");
const areaOf = new Map(base.localities.filter(l => l.g != null).map(l => [l.c, l.g]));
const sectorOf = new Map(base.localities.map(l => [l.c, l.s]));
const years = iso => {
  const [y, m, d] = iso.split("-").map(Number);
  const yday = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 + 1;
  return y + (yday - .5) / 365.25;
};
const T = E.map(e => years(e.date));

/* לכל יישוב ולכל בחירות: בעלי זכות, הצביעו, כשרים, קולות לכל תא */
const codes = [...new Set(E.flatMap(e => e.rows.map(r => r[0])))].sort((a, b) => a - b);
const cidx = new Map(codes.map((c, i) => [c, i]));
const N = codes.length, K = E.length;
const mk = () => Array.from({ length: N }, () => new Array(K).fill(0));
const elig = mk(), voted = mk(), valid = mk();
const harediVotes = Array.from({ length: N }, () => Array.from({ length: K }, () => [0, 0]));
const gv = Array.from({ length: N }, () => Array.from({ length: K }, () => [0, 0, 0, 0, 0]));
E.forEach((e, k) => {
  const grp = e.parties.map(p => G.indexOf(p.camp));
  for (const r of e.rows) {
    const i = cidx.get(r[0]);
    elig[i][k] = r[1]; voted[i][k] = r[2]; valid[i][k] = r[3];
    r.slice(4).forEach((v, j) => {
      gv[i][k][grp[j]] += v;
      const h = ["shas", "utj"].indexOf(e.parties[j].id);
      if (h >= 0) harediVotes[i][k][h] += v;
    });
  }
});
const sum = a => a.reduce((s, x) => s + x, 0);
const add = (a, b) => a.map((x, j) => x + b[j]);
/* המכנה של החלקים: כל הכשרים, או רק ארבע הקבוצות; ו"אחרות" מתאפסות */
const den = (i, k) => EXCLUDE_OTHERS ? sum(gv[i][k].slice(0, 4)) : valid[i][k];
const cells = g => EXCLUDE_OTHERS ? [...g.slice(0, 4), 0] : g;
// Each Haredi party has its own locality history and trend. The map combines them only for display.
const forecastCells = (i, k) => {
  const g = cells(gv[i][k]), h = harediVotes[i][k];
  return [g[0], h[0], h[1], g[2], g[3], g[4]];
};
const groupCells = s => [s[0], s[1] + s[2], s[3], s[4], s[5]];

/* ריבועים פחותים משוקללים: שיפוע של y על t (המשקל exp(tt/TAU)); null עם פחות מ־minN נקודות */
function wslope(t, y, mask, tLast, minN) {
  const ks = t.map((_, k) => k).filter(k => mask[k]);
  if (ks.length < minN) return null;
  const w = ks.map(k => Math.exp((t[k] - tLast) / TAU)), x = ks.map(k => t[k] - tLast);
  const W = sum(w), xm = sum(x.map((xi, i) => w[i] * xi)) / W;
  const den = sum(x.map((xi, i) => w[i] * (xi - xm) ** 2));
  return yk => { const ym = sum(ks.map((k, i) => w[i] * yk(k))) / W; return den ? sum(ks.map((k, i) => w[i] * (x[i] - xm) * (yk(k) - ym))) / den : 0; };
}
function trendSlopes(shares, present, t, last) {
  const s = wslope(t, null, present, t[last], 3);
  return s && shares[0].map((_, j) => s(k => shares[k][j]));
}
function growthRate(e, t, last) {
  const mask = e.map((x, k) => x > 0 && k <= last);
  const s = wslope(t, null, mask, t[last], 2);
  return s && s(k => Math.log(e[k]));
}

function model(upto, targetYear, damp) {
  const last = upto, ks = [...Array(upto + 1).keys()], t = T.slice(0, upto + 1), dt = targetYear - T[last];
  const empty = [0, 0, 0, 0, 0, 0];
  const shOf = i => ks.map(k => den(i, k) > 0 ? forecastCells(i, k).map(x => 100 * x / den(i, k)) : [...empty]);
  const natsh = ks.map(k => { const v = sum(codes.map((_, i) => den(i, k))); return empty.map((_, j) => 100 * sum(codes.map((_, i) => forecastCells(i, k)[j])) / v); });
  const rel = sh => RELATIVE ? sh.map((r, k) => r.map((x, j) => x - natsh[k][j])) : sh;
  const areas = new Map();
  codes.forEach((c, i) => { const a = areaOf.get(c) ?? -1; if (!areas.has(a)) areas.set(a, []); areas.get(a).push(i); });
  const areaSlope = new Map(), areaGrowth = new Map(), areaTurn = new Map();
  for (const [a, ii] of areas) {
    const av = ks.map(k => sum(ii.map(i => valid[i][k])));
    const ag = ks.map(k => ii.reduce((s, i) => add(s, forecastCells(i, k)), [...empty]));
    const ad = ks.map(k => sum(ii.map(i => den(i, k))));
    const ash = ks.map(k => ad[k] > 0 ? ag[k].map(x => 100 * x / ad[k]) : [...empty]);
    areaSlope.set(a, trendSlopes(rel(ash), ad.map(v => v > 0), t, last));
    areaGrowth.set(a, growthRate(ks.map(k => sum(ii.map(i => elig[i][k]))), t, last));
    const ae = sum(ks.map(k => sum(ii.map(i => elig[i][k])))), at = sum(ks.map(k => sum(ii.map(i => voted[i][k]))));
    areaTurn.set(a, ae ? at / ae : null);
  }
  const natGrowth = growthRate(ks.map(k => sum(elig.map(r => r[k]))), t, last);
  const out = new Map();
  codes.forEach((c, i) => {
    if (valid[i][last] <= 0 || den(i, last) <= 0) return;
    const a = areaOf.get(c) ?? -1, sh = shOf(i), present = ks.map(k => den(i, k) > 0);
    const own = trendSlopes(rel(sh), present, t, last), ref = areaSlope.get(a);
    const pv = ks.filter(k => present[k]).map(k => valid[i][k]), nv = sum(pv) / pv.length;
    const slope = !own ? (ref || [...empty]) : !ref ? own : own.map((s, j) => { const w = nv / (nv + SHRINK_VOTES); return w * s + (1 - w) * ref[j]; });
    const shift = slope.map(s => Math.min(MAX_SHIFT, Math.max(-MAX_SHIFT, damp * s * dt)));
    let s = sh[last].map((x, j) => Math.max(0, x + shift[j]));
    s = sum(s) > 0 ? s.map(x => 100 * x / sum(s)) : sh[last];
    let v26, e26, turn;
    if (c === ENVELOPES) {
      v26 = valid[i][last] * Math.exp((natGrowth || 0) * dt); e26 = 0; turn = null;
    } else {
      let gr = growthRate(ks.map(k => elig[i][k]), t, last);
      const ga = areaGrowth.get(a) != null ? areaGrowth.get(a) : natGrowth;
      if (gr == null) gr = ga;
      else if (ga != null) { const w = elig[i][last] / (elig[i][last] + SHRINK_ELIG); gr = w * gr + (1 - w) * ga; }
      gr = Math.min(Math.max(gr || 0, -.03), .10);
      e26 = elig[i][last] * Math.exp(gr * dt);
      const rec = ks.filter(k => elig[i][k] > 0);
      const ownT = rec.length ? sum(rec.map(k => voted[i][k])) / sum(rec.map(k => elig[i][k])) : null;
      const refT = areaTurn.get(a), w = elig[i][last] / (elig[i][last] + SHRINK_ELIG);
      turn = refT == null ? ownT : ownT == null ? refT : w * ownT + (1 - w) * refT;
      turn = Math.min(Math.max(turn || 0, .05), .98);
      const vr = voted[i][last] ? valid[i][last] / voted[i][last] : .99;
      v26 = e26 * turn * vr;
    }
    const share = groupCells(s);
    // Use the normalized projection so the grouped map and the party calculation agree even after clipping.
    const groupShift = share.map((x, j) => x - groupCells(sh[last])[j]);
    out.set(c, { i, share, shift: groupShift, partyShare: { shas: s[1], utj: s[2] }, e: e26, turn, v: v26 });
  });
  return out;
}

function national(proj, last, mode) {
  let tot = [0, 0, 0, 0, 0];
  for (const [c, p] of proj) {
    const i = p.i;
    if (mode === "demography") {          // חלקי 2022 ואחוז ההצבעה של 2022, בעלי זכות שגדלו
      const v = c === ENVELOPES ? p.v : p.e * (elig[i][last] ? voted[i][last] / elig[i][last] : 0) * (voted[i][last] ? valid[i][last] / voted[i][last] : 1);
      tot = add(tot, cells(gv[i][last]).map(x => v * x / Math.max(den(i, last), 1)));
    } else if (mode === "turnout") tot = add(tot, cells(gv[i][last]).map(x => p.v * x / Math.max(den(i, last), 1)));
    else tot = add(tot, p.share.map(x => p.v * x / 100));
  }
  return [tot.map(x => 100 * x / sum(tot)), tot];
}
/* מנדטים כאילו כל קבוצה רצה כרשימה אחת (ל"אחרות" אין) */
function seats(share) {
  const s = share.slice(0, 4), raw = s.map(x => 120 * x / sum(s)), seat = raw.map(Math.floor);
  raw.map((r, k) => [r - seat[k], k]).sort((a, b) => b[0] - a[0]).slice(0, 120 - sum(seat)).forEach(([, k]) => seat[k]++);
  return seat;
}
/* אחוז ההצבעה של מצביעי כל קבוצה, לפי היישובים שבהם הם גרים */
function groupTurnout(turn, votes) {
  return [0, 1, 2, 3].map(j => 100 * sum(turn.map((x, i) => x * votes[i][j])) / Math.max(sum(votes.map(v => v[j])), 1));
}

const last = K - 1, target = years(TARGET);
const proj = model(last, target, 1);
const natShare = k => { const d = sum(codes.map((_, i) => den(i, k))); return [0, 1, 2, 3, 4].map(j => 100 * sum(gv.map(r => cells(r[k])[j])) / d); };
const nat22 = natShare(last);
const [sDemo] = national(proj, last, "demography");
const [sTurn] = national(proj, last, "turnout");
/* ברירת המחדל: המגמה בעוצמה DEFAULT_TREND */
const projDef = DEFAULT_TREND === 1 ? proj : model(last, target, DEFAULT_TREND);
const [s26, v26] = DEFAULT_TREND ? national(projDef, last, "full") : national(proj, last, "turnout");
const projectedValid = sum([...projDef.values()].map(p => p.v));
const partyForecast = Object.fromEntries(["shas", "utj"].map(id => {
  const votes = sum([...projDef.values()].map(p => p.v * p.partyShare[id] / 100));
  return [id, { votes, seats: 120 * votes / projectedValid }];
}));
const actual22 = GROUPS.map(g => sum(E[last].parties.filter(p => p.camp === g).map(p => p.seats || 0)));
/* 2022 כאילו מרצ עברה את אחוז החסימה (חסרו לה 4,062 קולות): חלוקה מחדש של 120 המנדטים, כמו COUNTERFACTUAL ב־assets/app.js.
   נקודת המוצא של מנדטי 2026 — כדי שהתחזית לא תירש את 4 המנדטים של מרצ שנפלו אל הימין בספירה בפועל. */
const CF22 = { likud: 31, yesh_atid: 23, national_unity: 12, shas: 11, labor: 5, utj: 7, yisrael_beiteinu: 5, religious_zionism: 13, hadash_taal: 4, meretz: 4, raam: 5 };
const base22 = GROUPS.map(g => sum(E[last].parties.filter(p => p.camp === g).map(p => CF22[p.id] || 0)));

const home = codes.map(c => c !== ENVELOPES);
const gtSeries = [...Array(K).keys()].map(k => {
  const ii = codes.map((_, i) => i).filter(i => home[i]);
  return groupTurnout(ii.map(i => elig[i][k] > 0 ? voted[i][k] / Math.max(elig[i][k], 1) : 0), ii.map(i => gv[i][k]));
});
const pList = [...projDef].filter(([c]) => c !== ENVELOPES).map(([, p]) => p);
const gt26 = groupTurnout(pList.map(p => p.turn), pList.map(p => p.share.map(x => p.v * x / 100)));

/* בדיקה לאחור: 2022 מהבחירות עד 2021, בכמה עוצמות של המגמה */
function backtest(damp) {
  const bt = model(last - 1, T[last], damp);
  let pred = [0, 0, 0, 0, 0], err = 0, naive = 0, wsum = 0;
  for (const p of bt.values()) {
    const i = p.i;
    if (den(i, last) <= 0) continue;
    const act = cells(gv[i][last]).map(x => 100 * x / den(i, last));
    const prev = cells(gv[i][last - 1]).map(x => 100 * x / Math.max(den(i, last - 1), 1));
    pred = add(pred, p.share.map(x => p.v * x / 100));
    const w = valid[i][last];
    err += w * sum([0, 1, 2, 3].map(j => Math.abs(p.share[j] - act[j]))) / 2;
    naive += w * sum([0, 1, 2, 3].map(j => Math.abs(prev[j] - act[j]))) / 2;
    wsum += w;
  }
  return [pred.map(x => 100 * x / sum(pred)), err / wsum, naive / wsum];
}
const bt = {};
for (const d of [0, .5, 1]) {
  bt[d] = backtest(d);
  console.log(`· בדיקה לאחור, מגמה ×${d}: ${bt[d][0].slice(0, 4).map(x => x.toFixed(1)).join(" ")} · טעות ביישוב ${bt[d][1].toFixed(2)} (כמו 2021: ${bt[d][2].toFixed(2)})`);
}
const [pred, , errNaive] = bt[1];
const nat21 = natShare(last - 1);

const r1 = a => a.map(x => Math.round(x * 10) / 10 + 0);
const loc = {};
for (const [c, p] of proj) {
  const i = p.i;
  loc[String(c)] = {
    v: valid[i].map(Math.round),                    // קולות כשרים בכל בחירות
    g: gv[i].flat().map(Math.round),                // קולות לכל תא בכל בחירות (R,H,L,A,O × בחירות)
    e: elig[i].map(Math.round),
    t: voted[i].map(Math.round),
    f: [Math.round(p.e), p.turn ? Math.round(1000 * p.turn) : 0, Math.round(p.v)],   // 2026: בעלי זכות, אחוז הצבעה ‰, כשרים
    tr: r1(p.shift),                                // המגמה המלאה עד 2026, בנקודות לכל תא
    h: harediVotes[i].flat(),                       // ש״ס וג׳ בנפרד בכל אחת מארבע הבחירות
    hf: [p.v * p.partyShare.shas / 100, p.v * p.partyShare.utj / 100]
  };
}
const data = {
  meta: {
    elections: E.map(e => ({ id: e.id, label: e.label, date: e.date })),
    groups: { R: "ימין", H: "חרדים", L: "מרכז־שמאל", A: "ערבים", O: "אחרות" },
    target: TARGET,
    method: "כל יישוב ממשיך את הקו שלו: חלקה של כל קבוצה ב־2022 ועוד המגמה של היישוב — קו ישר דרך ארבע הבחירות מספטמבר 2019, "
      + `ש״ס ויהדות התורה נבדקות בנפרד, ואז מצורפות לקבוצת החרדים בתצוגה. לכל היותר ${MAX_SHIFT} נקודות לכל רכיב לפני נרמול; יישוב קטן נשען על מגמת האזור שלו. ״אחרות״ (רשימות מתחת ל־1.5%) מושמטות — החלקים מתוך ארבע הקבוצות. בעלי זכות הבחירה גדלים בקצב של היישוב `
      + "מספטמבר 2019 עד 2022, ואחוז ההצבעה — הממוצע שלו בארבע הבחירות. רשימה נספרת בקבוצה שלה מ־1.5% מהקולות, גם אם לא עברה את אחוז החסימה.",
    harediMethod: "ש״ס ויהדות התורה מחושבות בנפרד בכל יישוב: מגמת חלקה של המפלגה בארבע הבחירות מספטמבר 2019, גידול בבעלי זכות הבחירה ושיעור ההצבעה הצפוי. ביישוב קטן המגמה נשענת גם על מגמת אותה מפלגה באזור. האומדן הארצי הוא סכום קולות המפלגה בכל היישובים והמעטפות החיצוניות; שברי המנדטים הם חלקה בקולות התחזית כפול 120, ללא פיצול לפי יחס מנדטים קבוע.",
    sources: "ועדת הבחירות המרכזית — תוצאות לפי יישובים, ספטמבר 2019–2022"
  },
  national: {
    series: [...Array(K).keys()].map(k => { const v = sum(valid.map(r => r[k])); return r1([0, 1, 2, 3, 4].map(j => 100 * sum(gv.map(r => r[k][j])) / v)); }),
    valid: [...Array(K).keys()].map(k => sum(valid.map(r => r[k]))),
    eligible: [...Array(K).keys()].map(k => sum(elig.map(r => r[k]))),
    f26: r1(s26), votes26: v26.map(Math.round), eligible26: Math.round(sum([...proj.values()].map(p => p.e))),
    defaultTrend: DEFAULT_TREND,
    partyForecast, projectedValid,
    // 2022 — המנדטים הרשמיים לפי קבוצה (seats22) וכאילו מרצ עברה (base22); 2026 — base22 ועוד השינוי במנדטים היחסיים
    seats22: actual22, base22, prop22: seats(nat22), seats26: base22.map((a, k) => a + seats(s26)[k] - seats(nat22)[k]),
    steps: { demography: r1(sDemo.map((x, j) => x - nat22[j])), turnout: r1(sTurn.map((x, j) => x - sDemo[j])), trend: r1(s26.map((x, j) => x - sTurn[j])) },
    groupTurnout: { series: gtSeries.map(r1), base26: r1(gt26) },
    backtest: { predicted: r1(pred), predictedNoTrend: r1(bt[0][0]), actual: r1(nat22), previous: r1(nat21),
      locErr: Object.fromEntries(Object.entries(bt).map(([d, x]) => [d, Math.round(x[1] * 100) / 100])), locErrNaive: Math.round(errNaive * 100) / 100 }
  },
  loc
};
writeFileSync(path.join(ROOT, "data/trends.json"), JSON.stringify(data), "utf8");

/* הגידול בפועל של כל סוג יישוב, למודל הדמוגרפי */
const growthPct = e => Math.round(100 * (Math.exp(growthRate(e, T, last)) - 1) * 100) / 100;
const sg = Object.entries(base.sectors).map(([key, name]) => {
  const ii = codes.map((c, i) => sectorOf.get(c) === key ? i : -1).filter(i => i >= 0);
  const by = arr => [...Array(K).keys()].map(k => sum(ii.map(i => arr[i][k])));
  return { id: key, name, localities: ii.length, eligible: by(elig), voted: by(voted), valid: by(valid),
    groups: [...Array(K).keys()].map(k => ii.reduce((s, i) => add(s, gv[i][k]), [0, 0, 0, 0, 0])),
    eligible26: Math.round(sum(codes.filter(c => sectorOf.get(c) === key && proj.has(c)).map(c => proj.get(c).e))),
    growth: growthPct(by(elig)) };
});
const homeIdx = codes.map((_, i) => i).filter(i => home[i]);
writeFileSync(path.join(ROOT, "data/sector-growth.json"), JSON.stringify({
  meta: { elections: data.meta.elections, target: TARGET,
    note: "בעלי זכות הבחירה, המצביעים והקולות לכל קבוצה לפי סוג היישוב (סיווג הלמ״ס ו־2022). "
      + "growth — קצב הגידול השנתי של בעלי זכות הבחירה מספטמבר 2019 עד 2022; eligible26 — לפי המודל הגיאוגרפי.",
    source: data.meta.sources },
  national: { eligible: data.national.eligible, eligible26: data.national.eligible26,
    growth: growthPct([...Array(K).keys()].map(k => sum(homeIdx.map(i => elig[i][k])))) },
  sectors: sg
}), "utf8");

const fmt = a => G.map((g, j) => `${g} ${a[j].toFixed(1)}`).join(" · ");
console.log(`· 2022: ${fmt(nat22)}`);
console.log(`· 2026: ${fmt(s26)} · מנדטים ${JSON.stringify(Object.fromEntries(GROUPS.map((g, k) => [g, data.national.seats26[k]])))} (2022 בפועל: ${actual22.join(",")})`);
console.log(`· פירוק: דמוגרפיה ${data.national.steps.demography} · הצבעה ${data.national.steps.turnout} · מגמה ${data.national.steps.trend}`);
console.log(`· הצבעה לפי קבוצה 2026: ${r1(gt26)}`);
console.log(`· data/trends.json — ${Object.keys(loc).length} יישובים, ${Math.round(statSync(path.join(ROOT, "data/trends.json")).size / 1024)} KB`);
