#!/usr/bin/env node
/**
 * בדיקה לאחור של שני המודלים המבניים (דמוגרפי וגיאוגרפי) בארבע מערכות הבחירות האחרונות:
 * ספטמבר 2019, 2020, 2021, 2022. כל מערכת "נחזית" רק מהבחירות שקדמו לה, באותה יחידה כמו
 * בתחזית: חלק מפלגות הקואליציה (הגוש של נתניהו) מקולות שלושת הגושים, באחוזים מהמצביעים.
 *
 *   node scripts/backtest-structural.mjs        → data/structural-backtest.json
 *
 * הגושים: מפלגות הקואליציה = הגוש של נתניהו (כולל החרדים). ימינה של בנט נספרת בגוש גם ב־2021 —
 * מצביעיה הצביעו לרשימת ימין, וב־2022 חזרו ברובם לליכוד ולציונות הדתית. ישראל ביתנו: מספטמבר
 * 2019 באופוזיציה — אחרי אפריל 2019 ליברמן סירב להצטרף לממשלה ורץ נגד ממשלת ימין וחרדים; כך גם
 * בבחירות הבסיס (אפריל 2019), כדי שכל בדיקה תשתמש באותה הגדרה לבסיס ולתוצאה. מעבר הקולות אליו
 * (מ־4.0% ל־7.0%) נספר לכן כטעות של המודלים — מעבר צד שמודל דמוגרפי אינו יכול לחזות.
 * הבית היהודי ב־2022 באופוזיציה.
 * רשימות "אחרות" מושמטות. 2019b–2022 מ־data/elections (אותם נתונים כמו המודל), 2015 ו־2019a
 * מ־locality-history.
 *
 * המודל הדמוגרפי (לפי יישובים): חלקי הגושים בכל יישוב נשארים כמו בבחירות הבסיס; בעלי זכות
 * הבחירה גדלים בקצב של היישוב (לוג־ליניארי), ואחוז ההצבעה הוא הממוצע שלו.
 * המודל הגיאוגרפי: כמו הדמוגרפי, ועוד המגמה של היישוב — קו ישר משוקלל דרך הבחירות הקודמות
 * (לפחות שלוש), יישוב קטן נשען על המגמה הארצית, ועד 8 נקודות לקבוצה.
 *
 * הפלט: לכל מערכת — חלק מפלגות הקואליציה בתחזית ובפועל, באחוזים מהמצביעים, והפער בנקודות אחוז
 * (בפועל פחות התחזית; שלילי = התוצאה מתחת למודלים). הרצפה של התחזית (structuralDeviationPoints
 * ב־data/demographics.json) היא הנחת מודל, לא תוצאה של הבדיקה; כאן רק נספר באילו מערכות היא נחצתה.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = f => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));
const TAU = 10, MAX_SHIFT = 8, SHRINK_VOTES = 3000, ENVELOPES = 99999;
const sum = a => a.reduce((s, x) => s + x, 0);
const years = iso => { const [y, m, d] = iso.split("-").map(Number); return y + ((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 + .5) / 365.25; };

/* לכל בחירות: מפה קוד יישוב → { e: בעלי זכות, valid: כשרים, g: [ימין+חרדים, מרכז־שמאל, ערבים] } */
const hist = rd("data/locality-history.json");
const elections = [];
for (const id of ["2015", "2019a"]) {
  const meta = hist.elections.find(e => e.id === id), loc = new Map();
  for (const l of hist.localities) {
    const r = l.e[id]; if (!r) continue;
    const [elig, , valid, R, L, A, , , yb] = r;
    loc.set(l.code, { e: elig, valid, core: [R - (yb || 0), L, A], yb: yb || 0 });  // ישראל ביתנו בנפרד
  }
  elections.push({ id, date: meta.date, t: years(meta.date), loc });
}
for (const id of ["2019b", "2020", "2021", "2022"]) {
  const d = rd(`data/elections/${id}.json`), loc = new Map();
  const ybIdx = d.parties.findIndex(p => p.id === "yisrael_beiteinu");
  const grp = d.parties.map((p, j) => j === ybIdx ? -2 : p.camp === "R" || p.camp === "H" ? 0 : p.camp === "L" ? 1 : p.camp === "A" ? 2 : -1);
  for (const r of d.rows) {
    const core = [0, 0, 0];
    r.slice(4).forEach((v, j) => { if (grp[j] >= 0) core[grp[j]] += v; });
    loc.set(r[0], { e: r[1], valid: r[3], core, yb: ybIdx >= 0 ? r[4 + ybIdx] : 0 });
  }
  elections.push({ id, date: d.date, t: years(d.date), loc });
}

/* ישראל ביתנו בימין רק בבדיקה של ספטמבר 2019 (המעבר עם קולות הימין), אחרת במרכז־שמאל */
let ybRight = false;
const groups = x => ybRight ? [x.core[0] + x.yb, x.core[1], x.core[2]] : [x.core[0], x.core[1] + x.yb, x.core[2]];
for (const E of elections) for (const x of E.loc.values()) Object.defineProperty(x, "g", { get: () => groups(x), enumerable: true });
const shareR = g => { const s = sum(g); return s > 0 ? g[0] / s : 0; };
const nat = E => { const g = [0, 0, 0]; for (const x of E.loc.values()) x.g.forEach((v, j) => g[j] += v); return g; };

/* שיפוע משוקלל (ריבועים פחותים, משקל exp((t − tLast)/TAU)) של y על t */
function wslope(ts, ys, tLast) {
  if (ts.length < 2) return null;
  const w = ts.map(t => Math.exp((t - tLast) / TAU)), x = ts.map(t => t - tLast), W = sum(w);
  const xm = sum(x.map((v, i) => w[i] * v)) / W, ym = sum(ys.map((v, i) => w[i] * v)) / W;
  const den = sum(x.map((v, i) => w[i] * (v - xm) ** 2));
  return den ? sum(x.map((v, i) => w[i] * (v - xm) * (ys[i] - ym))) / den : 0;
}

function backtest(k) {
  const target = elections[k], H = elections.slice(0, k), base = H.at(-1), dt = target.t - base.t;
  const ts = H.map(E => E.t);
  /* המגמה הארצית — ליישובים קטנים או בלי היסטוריה מספיקה */
  const natShares = H.map(E => { const g = nat(E), s = sum(g); return g.map(v => 100 * v / s); });
  const natSlope = H.length >= 3 ? [0, 1, 2].map(j => wslope(ts, natShares.map(s => s[j]), base.t)) : [0, 0, 0];
  let demo = [0, 0, 0], geo = [0, 0, 0];
  for (const [code, b] of base.loc) {
    const s0 = sum(b.g); if (s0 <= 0) continue;
    const share = b.g.map(v => 100 * v / s0);
    const rows = H.map(E => E.loc.get(code)).map((x, i) => x && { ...x, t: ts[i] }).filter(Boolean);
    /* היקף ההצבעה הצפוי: בעלי זכות × קצב גידול × אחוז הצבעה ממוצע (מעטפות: לפי הכשרים) */
    let V;
    if (code === ENVELOPES || !(b.e > 0)) {
      const pts = rows.filter(x => x.valid > 0), g = wslope(pts.map(x => x.t), pts.map(x => Math.log(x.valid)), base.t) ?? 0;
      V = b.valid * Math.exp(Math.max(-.03, Math.min(.10, g)) * dt);
    } else {
      const pts = rows.filter(x => x.e > 0), g = wslope(pts.map(x => x.t), pts.map(x => Math.log(x.e)), base.t) ?? 0;
      const turn = sum(pts.map(x => x.valid / x.e)) / pts.length;
      V = b.e * Math.exp(Math.max(-.03, Math.min(.10, g)) * dt) * turn;
    }
    demo = demo.map((v, j) => v + V * share[j] / 100);
    /* המגמה של היישוב: לפחות שלוש בחירות; יישוב קטן — חלק מהמגמה הארצית */
    const own = rows.filter(x => sum(x.g) > 0);
    const slope = own.length >= 3
      ? [0, 1, 2].map(j => wslope(own.map(x => x.t), own.map(x => 100 * x.g[j] / sum(x.g)), base.t))
      : natSlope;
    const w = own.length >= 3 ? b.valid / (b.valid + SHRINK_VOTES) : 0;
    const shifted = share.map((v, j) => Math.max(0, v + Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, (w * slope[j] + (1 - w) * natSlope[j]) * dt))));
    const tot = sum(shifted) || 1;
    geo = geo.map((v, j) => v + V * shifted[j] / tot);
  }
  const actual = 100 * shareR(nat(target));
  const d = 100 * shareR(demo), g = 100 * shareR(geo), mean = (d + g) / 2;
  const dev = p => actual - p;                                  // בנקודות אחוז; שלילי = התוצאה מתחת לתחזית
  return { election: target.id, base: base.id, history: H.map(E => E.id), years: +dt.toFixed(2),
    baseRight: +(100 * shareR(nat(base))).toFixed(2), actual: +actual.toFixed(2),
    demographic: +d.toFixed(2), geographic: +g.toFixed(2), mean: +mean.toFixed(2),
    deviation: { demographic: +dev(d).toFixed(2), geographic: +dev(g).toFixed(2), mean: +dev(mean).toFixed(2) } };
}

const rows = [2, 3, 4, 5].map(k => backtest(k));
const avgAbs = key => +(sum(rows.map(r => Math.abs(r.deviation[key]))) / rows.length).toFixed(2);
const floor = JSON.parse(readFileSync(path.join(ROOT, "data/demographics.json"), "utf8")).meta.structuralDeviationPoints ?? 1;
const out = {
  meta: {
    title: "בדיקה לאחור של המודלים הדמוגרפי והגיאוגרפי · ארבע מערכות הבחירות האחרונות",
    unit: "חלק מפלגות הקואליציה (הגוש של נתניהו) מקולות שלושת הגושים, באחוזים מהמצביעים",
    blocRule: "מפלגות הקואליציה = הגוש של נתניהו, כולל החרדים; ימינה של בנט בגוש גם ב־2021; ישראל ביתנו באופוזיציה מספטמבר 2019 (גם בבסיס, אפריל 2019); אותה הגדרה לבסיס ולתוצאה; הבית היהודי ב־2022 באופוזיציה; אחרות מושמטות",
    deviation: "התוצאה בפועל פחות התחזית, בנקודות אחוז. שלילי = התוצאה מתחת לתחזית",
    floorPoints: floor,
    generatedAt: new Date().toISOString()
  },
  elections: rows,
  summary: {
    averageAbsoluteDeviation: { demographic: avgAbs("demographic"), geographic: avgAbs("geographic"), mean: avgAbs("mean") },
    averageSignedDeviation: +(sum(rows.map(r => r.deviation.mean)) / rows.length).toFixed(2),
    largestShortfallBelowMean: +Math.max(0, ...rows.map(r => -r.deviation.mean)).toFixed(2),
    belowFloor: rows.filter(r => r.deviation.mean < -floor).map(r => r.election)
  }
};
writeFileSync(path.join(ROOT, "data/structural-backtest.json"), JSON.stringify(out, null, 2) + "\n");
console.log("בחירות   בסיס   בפועל  דמוגרפי גיאוגרפי ממוצע   פער (נק׳)");
for (const r of rows) console.log(`${r.election.padEnd(7)} ${r.base.padEnd(6)} ${r.actual.toFixed(2).padStart(6)} ${r.demographic.toFixed(2).padStart(7)} ${r.geographic.toFixed(2).padStart(7)} ${r.mean.toFixed(2).padStart(7)}   ${r.deviation.mean.toFixed(2)}`);
console.log(JSON.stringify(out.summary));
