/* מעקב הסקרים — המגמות שמעל כרטיסי הסקרים: ממוצע נע של הגושים ושל כל מפלגה
   לאורך זמן, העולות והיורדות, איך כל מכון רואה את המפה, וטבלת כל הסקרים.
   הממוצע הנע: לכל יום נלקחים הסקרים של 7 הימים שהסתיימו בו; כל מכון נספר פעם
   אחת (ממוצע הסקרים שלו בחלון), ואז ממוצע פשוט בין המכונים — כך מכון שמפרסם כל
   יום לא מכריע לבד. רשימה שלא הופיעה בסקר נספרת 0, כמו בשאר האתר. */
const TRACK_WINDOW_DAYS = 7, TRACK_CHANGE_DAYS = 14, DAY_MS = 864e5;
const TRACK_BLOCS = [["Right", "גוש הימין והחרדים"], ["Left", "מרכז–שמאל"], ["Arabs", "הרשימות הערביות"]];

function trackerPolls() {
  const byId = new Map();
  [...(S.pollsArchive?.polls || []), ...S.cur.polls].forEach(p => { if (p && p.id && !byId.has(p.id)) byId.set(p.id, p); });
  return [...byId.values()]
    .filter(p => parsePollDate(p) >= POLLS_FROM && p.parties.reduce((n, x) => n + x.mandates, 0) >= 110)
    .sort((a, b) => parsePollDate(a) - parsePollDate(b));
}

/* ערכי סקר בודד: מנדטים לכל מפלגה (מזהה מנורמל) ולכל גוש */
function pollVector(p) {
  const parties = {}, blocs = { Right: 0, Left: 0, Arabs: 0, Unknown: 0 };
  p.parties.forEach(x => {
    const id = normId(x.id);
    parties[id] = (parties[id] || 0) + x.mandates;
    const al = alignOf(x);
    blocs[al in blocs ? al : "Unknown"] += x.mandates;
  });
  return { parties, blocs };
}

function trackerModel() {
  const polls = trackerPolls();
  if (polls.length < 3) return null;
  const vec = new Map(polls.map(p => [p.id, pollVector(p)]));
  const ids = [...new Set(polls.flatMap(p => p.parties.map(x => normId(x.id))))];
  const t0 = parsePollDate(polls[0]), t1 = parsePollDate(polls.at(-1));
  const avgWindow = end => {
    const inWin = polls.filter(p => { const t = parsePollDate(p); return t <= end && t > end - TRACK_WINDOW_DAYS * DAY_MS; });
    if (!inWin.length) return null;
    const byFirm = new Map();
    inWin.forEach(p => { const f = firmOf(p.sourceId).firm; if (!byFirm.has(f)) byFirm.set(f, []); byFirm.get(f).push(vec.get(p.id)); });
    const firms = [...byFirm.values()];
    const mean = get => firms.reduce((s, list) => s + list.reduce((a, v) => a + (get(v) || 0), 0) / list.length, 0) / firms.length;
    return {
      t: end, n: inWin.length, firms: firms.length,
      parties: Object.fromEntries(ids.map(id => [id, mean(v => v.parties[id])])),
      blocs: Object.fromEntries(["Right", "Left", "Arabs", "Unknown"].map(k => [k, mean(v => v.blocs[k])]))
    };
  };
  /* הסדרה מתחילה שבוע אחרי הסקר הראשון, כדי שבכל נקודה יהיה חלון מלא */
  const series = [];
  for (let t = Math.min(t1, t0 + (TRACK_WINDOW_DAYS - 1) * DAY_MS); t <= t1; t += DAY_MS) {
    const a = avgWindow(t); if (a) series.push(a);
  }
  const now = series.at(-1), before = series.find(s => s.t >= now.t - TRACK_CHANGE_DAYS * DAY_MS) || series[0];
  const names = {};
  polls.forEach(p => p.parties.forEach(x => { names[normId(x.id)] = NAME_OVERRIDE[normId(x.id)] || x.name; }));
  const recent = polls.filter(p => parsePollDate(p) > now.t - TRACK_WINDOW_DAYS * DAY_MS);
  const parties = ids
    .map(id => {
      const vals = recent.map(p => vec.get(p.id).parties[id] || 0);
      return { id, name: names[id] || partyMeta(id).name, now: now.parties[id], before: before.parties[id],
        min: Math.min(...vals), max: Math.max(...vals), color: partyHue(id), line: series.map(s => s.parties[id]) };
    })
    .filter(x => x.now >= 0.5 || x.max >= 4)
    .sort((a, b) => b.now - a.now);
  return { polls, vec, series, now, before, parties, recent };
}

/* ---------- על מה מבוססים המספרים: שלוש אפשרויות לבחירת הגולש ----------
   ממוצע כל הסקרים — הממוצע הנע שלמעלה. תחזית הברומטר ומשוקלל אמינות — אותם
   מספרים כמו בעמוד התחזית, והקו לאורך זמן מצילומי התחזית (פעמיים ביום). */
const TRACK_BASES = {
  avg: { label: "ממוצע כל הסקרים", kicker: "ממוצע הסקרים",
    note: "ממוצע נע של 7 ימים: כל מכון נספר פעם אחת, בלי משקלים ובלי תיקונים. כל נקודה בגרף היא סקר." },
  weighted: { label: "משוקלל דיוק", kicker: "משוקלל דיוק", key: "weighted", mode: "weighted",
    note: "סקרי 8 הימים האחרונים משוקללים לפי ציון הדיוק של כל מכון — בלי ההנחות של תחזית הברומטר." },
  baro: { label: "תחזית הברומטר", kicker: "תחזית הברומטר", key: "scenario", mode: "scenario",
    note: "התחזית של האתר: סקרי 8 הימים האחרונים משוקללים לפי דיוק המכונים, עם תיקון הטעות הקבועה, ש״ס, יהדות התורה ורע״מ קבועים, והתוספת הדמוגרפית (ממוצע המודל הדמוגרפי והגיאוגרפי) — במנדטים לפי כללי הבחירות." }
};
function basisModel(P, basis) {
  const B = TRACK_BASES[basis];
  if (!B?.key) return P;
  const point = (t, seats, n, firms) => {
    const parties = {}, blocs = { Right: 0, Left: 0, Arabs: 0, Unknown: 0 };
    Object.entries(seats || {}).forEach(([id, v]) => {
      const k = normId(id), al = partyMeta(k).alignment;
      parties[k] = (parties[k] || 0) + v;
      blocs[al in blocs ? al : "Unknown"] += v;
    });
    return { t, n, firms, parties, blocs };
  };
  let live = null;
  try { live = point(Date.parse(S.cur.generatedAt), allocateSeats(forecast(B.mode, HIDE_FROM_HOME).parties), S.forecastPolls?.length || 0, S.series?.length || 0); } catch { /* בלי תחזית חיה — רק הצילומים */ }
  /* המנדטים לפי כללי הבחירות (x.seats), כמו הנקודה החיה; צילום ישן בלי seats — שארית גדולה */
  const series = (S.forecastHistory?.snapshots || []).filter(x => x[B.key])
    .map(x => point(Date.parse(x.updatedAt), x.seats?.[B.key] || x[B.key], x.polls, x.firms))
    .filter(x => !live || x.t < live.t - 36e5).sort((a, b) => a.t - b.t);
  if (live) series.push(live);
  if (series.length < 2) return P;
  const now = series.at(-1), before = series.find(x => x.t >= now.t - TRACK_CHANGE_DAYS * DAY_MS) || series[0];
  const ids = [...new Set(series.flatMap(x => Object.keys(x.parties)))], range = Object.fromEntries(P.parties.map(x => [x.id, x]));
  const parties = ids.map(id => ({ id, name: NAME_OVERRIDE[id] || partyMeta(id).name, now: now.parties[id] || 0, before: before.parties[id] || 0,
      min: range[id]?.min ?? 0, max: range[id]?.max ?? 0, color: partyHue(id), line: series.map(x => x.parties[id] || 0) }))
    .filter(x => x.now >= 0.5 || x.max >= 4).sort((a, b) => b.now - a.now);
  return { ...P, series, now, before, parties, dotPolls: [], basis };
}

/* תחזיות הברומטר של מוצאי שבת — מופיעות ברשימת הסקרים ובטבלה כמו סקר, אבל לא בשום ממוצע */
const weeklyBaro = () => (typeof barometerWeeklyPolls === "function" ? barometerWeeklyPolls() : []).filter(p => parsePollDate(p) >= POLLS_FROM);

const trFmt = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
const trDelta = d => Math.abs(d) < 0.25 ? { cls: "flat", txt: "ללא שינוי", sym: "=" } :
  d > 0 ? { cls: "up", txt: `עלייה של ${trFmt(d)}`, sym: `▲ ${trFmt(d)}` } : { cls: "down", txt: `ירידה של ${trFmt(-d)}`, sym: `▼ ${trFmt(-d)}` };
const trDay = t => new Date(t).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });

/* קו מעוגל בלי לחרוג מהערכים: עקומה מונוטונית (Fritsch–Carlson) — בין שתי נקודות
   הקו לא עולה מעל הגבוהה ולא יורד מתחת לנמוכה, כך שהעיגול לא ממציא שיאים */
function smoothPath(pts) {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");
  const dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(pts[i][0] + h).toFixed(1)} ${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)} ${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/* ---------- גרף הקווים (גושים או מפלגה אחת) ---------- */
function trackerChart(M, mode, base) {
  /* במעבר ל״משוקלל דיוק״ המסגרת נשארת של הממוצע (אותו ציר זמן, אותו טווח ערכים, אותן נקודות סקרים) — רק הקווים מתחלפים */
  const useBase = !!base && base !== M && M.basis === "weighted";
  /* ה־viewBox בגודל המקום שהגרף קיבל בפועל (drawExplorer), כך שהטקסט לא נמתח */
  const W = Math.max(320, S.trackWidth || 920), H = Math.max(160, S.trackH || 260), m = { l: 30, r: 18, t: 14, b: 26 + (S.exBasisOn ? 34 : 0) };
  const days = S.trackRange === "month" ? 30 : 400;
  const tMin = useBase ? Math.max(base.series[0].t, base.now.t - (days - 1) * DAY_MS) : Math.max(M.series[0].t, M.now.t - (days - 1) * DAY_MS);
  const S2 = M.series.filter(s => s.t >= tMin), polls = (useBase ? base.polls : (M.dotPolls || M.polls)).filter(p => parsePollDate(p) >= tMin - 0.5 * DAY_MS);
  const Sb = useBase ? base.series.filter(s => s.t >= Math.max(base.series[0].t, base.now.t - (days - 1) * DAY_MS)) : [];
  const party = mode !== "blocs" ? M.parties.find(x => x.id === mode) : null;
  const lines = party
    ? [{ key: party.id, label: party.name, color: party.color, get: s => s.parties[party.id], dot: p => M.vec.get(p.id).parties[party.id] || 0 }]
    : TRACK_BLOCS.filter(([k]) => k !== "Arabs").map(([k, label]) => ({ key: k, label, color: BLOCS[k].color, get: s => s.blocs[k], dot: p => M.vec.get(p.id).blocs[k] }));
  const vals = lines.flatMap(l => [...S2.map(l.get), ...Sb.map(l.get), ...polls.map(l.dot)]);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  if (!party) { lo = Math.min(lo, 58); hi = Math.max(hi, 64); }
  else if (lo < 9) lo = Math.max(0, Math.min(lo, 3));      /* מפלגה קטנה: רואים גם את אחוז החסימה */
  else { lo = Math.max(0, lo - 3); hi += 2; }
  const step = hi - lo > 40 ? 10 : hi - lo > 16 ? 5 : 2;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const t0 = Math.min(S2[0].t, ...Sb.slice(0, 1).map(s => s.t), ...polls.map(parsePollDate)), t1 = useBase ? Math.max(Sb.at(-1).t, t0 + DAY_MS) : Math.max(S2.at(-1).t, t0 + DAY_MS);
  const x = t => m.l + (W - m.l - m.r) * (Math.min(t, t1) - t0) / (t1 - t0);
  const y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  let g = "";
  for (let v = lo; v <= hi; v += step) g += `<line class="tr-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tr-tick" text-anchor="end" x="${m.l - 8}" y="${y(v) + 4}">${v}</text>`;
  const ref = party ? (lo <= 4 && hi >= 4 ? [4, "אחוז החסימה ≈ 4"] : null) : [61, "61 · רוב"];
  if (ref) g += `<line class="tr-ref" x1="${m.l}" x2="${W - m.r}" y1="${y(ref[0])}" y2="${y(ref[0])}"/><text class="tr-ref-label" text-anchor="end" x="${W - m.r - 14}" y="${y(ref[0]) - 7}">${ref[1]}</text>`;
  /* תאריכים בציר: כתווית אחת לכל ~90 פיקסלים (לפחות 4) */
  const every = Math.max(1, Math.round((t1 - t0) / DAY_MS / Math.max(4, Math.floor(W / 90)))) * DAY_MS;
  for (let t = t1; t >= t0; t -= every) g += `<text class="tr-tick" text-anchor="middle" x="${x(t)}" y="${H - 8}">${trDay(t)}</text>`;
  const dots = lines.map(l => polls.map(p => `<circle class="tr-dot" cx="${x(Math.min(t1, Math.max(t0, parsePollDate(p))))}" cy="${y(l.dot(p))}" r="3.2" fill="${l.color}"/>`).join("")).join("");
  const paths = lines.map(l => `<path class="tr-line" d="${smoothPath(S2.map(s => [x(s.t), y(l.get(s))]))}" stroke="${l.color}"/>`).join("");
  /* בסוף כל קו נקודה בלבד — הערך עצמו כבר בשורת המספרים שמעל הגרף */
  const labels = lines.map(l => `<circle cx="${x(S2.at(-1).t)}" cy="${y(l.get(S2.at(-1)))}" r="5" fill="${l.color}" class="tr-end"/>`).join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="tr-svg" role="img" aria-label="${esc(party ? `${party.name}: ממוצע נע של המנדטים בסקרים` : "ממוצע נע של הגושים בסקרים")}, ${trDay(t0)}–${trDay(t1)}. הנתונים המלאים בתצוגת הטבלה." width="${W}" height="${H}">
    ${g}${dots}${paths}${labels}<line class="tr-cursor" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" hidden/><rect class="tr-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  /* הטבלה: כל יום שני, מהחדש לישן — גם הרשימות הערביות, שאינן קו בגרף */
  const rows = S2.slice().reverse().filter((_, i) => i % 2 === 0);
  const cols = party ? lines : TRACK_BLOCS.map(([k, label]) => ({ label, color: BLOCS[k].color, get: s => s.blocs[k] }));
  const table = `<div class="tablewrap ex-data-table" tabindex="0" role="region" aria-label="נתוני הגרף"><table><thead><tr><th scope="col">תאריך</th>${cols.map(l => `<th scope="col" style="--c:${l.color}">${esc(l.label)}</th>`).join("")}<th scope="col">סקרים</th></tr></thead><tbody>${rows.map(s => `<tr><th scope="row">${trDay(s.t)}</th>${cols.map(l => `<td><b>${trFmt(l.get(s))}</b></td>`).join("")}<td>${s.n}</td></tr>`).join("")}</tbody></table></div>`;
  return { svg, table, S2, lines, basis: M.basis || "avg", geom: { W, m, t0, t1, x, y } };
}

function wireTrackerHover(box, chart) {
  const svg = box.querySelector(".tr-svg"), hit = svg.querySelector(".tr-hit"), cur = svg.querySelector(".tr-cursor"), tip = box.querySelector(".tr-tip");
  const { S2, lines, geom } = chart;
  const show = ev => {
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) * geom.W / r.width;
    const t = geom.t0 + (vx - geom.m.l) / (geom.W - geom.m.l - geom.m.r) * (geom.t1 - geom.t0);
    const s = S2.reduce((best, s) => Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best, S2[0]);
    const px = geom.x(s.t);
    cur.setAttribute("x1", px); cur.setAttribute("x2", px); cur.removeAttribute("hidden");
    tip.hidden = false;
    tip.innerHTML = `<b>${trDay(s.t)}</b><small>${chart.basis === "avg" ? `${s.n} סקרים · ${s.firms} מכונים בשבוע שהסתיים ביום זה` : `${TRACK_BASES[chart.basis].label} · ${s.n} סקרים מ־${s.firms} מכונים`}</small>${lines.map(l => `<span style="--c:${l.color}"><i></i>${esc(l.label)}<b>${trFmt(l.get(s))}</b></span>`).join("")}`;
    const left = px / geom.W * r.width;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left - tip.offsetWidth - 14)) + "px";
  };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", () => { cur.setAttribute("hidden", ""); tip.hidden = true; });
}

/* ---------- העמודה השמאלית: הסקרים האחרונים, מהחדש לישן ---------- */
function feedWhen(p) {
  const key = t => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const today = key(Date.now()), d = key(parsePollDate(p) + 12 * 36e5);
  if (d === today) return "היום";
  if (d === key(Date.now() - DAY_MS)) return "אתמול";
  return p.date.replace(/\.20\d\d$/, "");
}
const pollsCount = M => {
  const n = M.polls.length, firms = new Set(M.polls.map(p => firmOf(p.sourceId).firm)).size, outlets = new Set(M.polls.map(p => p.channelHebrewName)).size;
  return { n, firms, outlets, from: trDay(parsePollDate(M.polls[0])) };
};
function renderPollFeed(M) {
  const box = $("#polls-feed"); if (!box) return;
  const c = pollsCount(M), all = $("#feed-all");
  $("#polls-stats").textContent = `${c.firms} מכונים · ${c.outlets} כלי תקשורת · מאז ${c.from}`;
  if (all) all.textContent = `כל ${c.n} הסקרים ←`;
  const list = [...M.polls, ...weeklyBaro()].sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0));
  const latestPoll = list.find(p => !p.barometer);
  const seen = new Set([...box.querySelectorAll("[data-feed-id]")].map(el => el.dataset.feedId));
  const opened = new Set([...box.querySelectorAll("[data-feed-id]:has(details[open])")].map(el => el.dataset.feedId));
  box.innerHTML = list.slice(0, 12).map(p => feedCardHTML(p, list, opened.has(p.id) || (p.id === latestPoll?.id && !seen.has(p.id)))).join("");
}

/* ---------- טבלת כל הסקרים ---------- */
function renderTrackerTable(M) {
  const box = $("#polls-table"); if (!box) return;
  const ff = $("#poll-firm")?.value || "all", oo = $("#poll-outlet")?.value || "all";
  const rows = [...M.polls, ...weeklyBaro()].filter(p => (ff === "all" || firmOf(p.sourceId).firm === ff) && (oo === "all" || p.channelHebrewName === oo))
    .sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0));
  const cols = M.parties.filter(x => x.now >= 3).slice(0, 12), c = pollsCount(M), info = $("#polls-list-info");
  const allN = $("#allpolls-n"); if (allN) allN.textContent = c.n;
  if (info) info.innerHTML = `<b>${c.n}</b> סקרים · ${c.firms} מכונים · ${c.outlets} כלי תקשורת · מהחדש לישן, במנדטים <span class="tr-info" tabindex="0" role="note" title="תא מודגש: המכון נתן למפלגה 2 מנדטים או יותר מעל (כחול) או מתחת (כתום) לממוצע של 7 הימים האחרונים. בשורות הזהב — הניתוח השבועי של הברומטר (לא סקר).">ⓘ</span>`;
  box.innerHTML = `<div class="tablewrap tr-table-wrap" tabindex="0" role="region" aria-label="כל הסקרים בטבלה"><table class="tr-table"><thead><tr><th scope="col">תאריך</th><th scope="col">פורסם ב־</th><th scope="col">מכון</th>${cols.map(c => `<th scope="col" class="n" style="--c:${c.color}"><span>${esc(c.name)}</span></th>`).join("")}<th scope="col" class="n bloc">ימין וחרדים</th></tr></thead><tbody>${
    `<tr class="tr-avg-row"><td>${trDay(M.now.t)}</td><td colspan="2"><b>ממוצע 7 הימים האחרונים</b></td>${cols.map(c => `<td class="n"><b>${trFmt(c.now)}</b></td>`).join("")}<td class="n bloc"><b>${trFmt(M.now.blocs.Right)}</b></td></tr>` +
    rows.map(p => { const v = M.vec.get(p.id) || pollVector(p), f = firmOf(p.sourceId), r = v.blocs.Right;
      return `<tr${p.barometer ? ' class="tr-baro"' : ""}><td class="date">${esc(p.date)}${p.barometer ? " · 20:00" : ""}</td><td><div class="orgcell">${outletLogo(p.channelHebrewName)}<span>${esc(p.channelHebrewName)}</span></div></td><td>${p.barometer ? "ניתוח שבועי" : esc(f.meta.he)}</td>${cols.map(c => {
        const val = v.parties[c.id] || 0, dv = val - c.now;
        return `<td class="n${Math.abs(dv) >= 2 ? (dv > 0 ? " hi" : " lo") : ""}"${Math.abs(dv) >= 2 ? ` title="${dv > 0 ? "גבוה" : "נמוך"} ב־${trFmt(Math.abs(dv))} מהממוצע"` : ""}>${val || "<span class=\"z\">0</span>"}</td>`; }).join("")}<td class="n bloc${r >= 61 ? " maj" : ""}"><b>${r}</b></td></tr>`; }).join("")
  }</tbody></table></div>`;
}

/* הכול בעמוד הסקרים: כרטיס המגמות, טבלת כל הסקרים ועמודת הסקרים האחרונים */
function renderPollTracker() {
  const root = $("#poll-tracker"); if (!root) return;
  const P = trackerModel();
  if (!P) { root.hidden = true; return; }
  root.hidden = false;
  $("#view-polls")?.setAttribute("data-tab", S.pollsTab || "gap");
  renderExplorer();
  if (typeof renderPollGap === "function") renderPollGap();
  renderTrackerTable(P);
  renderPollFeed(P);
  renderPollsNav();
}

/* ---------- הניווט של כל הסקרים: אותו תפריט צד בעמוד הסקרים ובדיוק המכונים ---------- */
const POLLS_NAV = [
  ["gap", "", "#/polls/gap", "למה הסקרים חלוקים?", "לחצו כדי לראות למה שני סקרים מאותו שבוע מראים תמונה אחרת"],
  ["acc", "", "#/2022", "דיוק המכונים", "לחצו כדי לראות מי הסוקר הדייקן בישראל"],
  ["cross", "", "#/crossover", "כמה עברו צד", "לחצו כדי לראות איזה מכון מעריך שמאות אלפי מצביעים החליפו צד"]
];
/* שורות ההזמנה בלשוניות: ב״כמה עברו צד״ המספר חי מהנתונים (המכון עם הפער הגדול ביותר) */
function pollsNavTeasers() {
  const key = S.cur?.polls, cache = S.navTeasers;
  if (cache && cache.key === key && cache.regions === !!S.regions) return cache.map;
  const map = {};
  try {
    if (S.regions && typeof crossoverBase === "function") {
      const { rows, kv } = crossoverBase(), top = Math.max(...rows.map(r => Math.abs(r.voters)));
      if (top >= 1000) map.cross = `לחצו כדי לראות איזה מכון מעריך שעד כ־${kv(top)} מצביעים החליפו צד`;
    }
  } catch { /* נשארים עם הנוסח הקבוע */ }
  S.navTeasers = { key, regions: !!S.regions, map };
  return map;
}
/* אילו לשוניות כבר נפתחו בביקור הזה — כדי שהצופה יראה מה נשאר לו */
const pollsSeen = (() => { let seen = []; try { seen = JSON.parse(sessionStorage.getItem("pollsTabsSeen") || "[]"); } catch {} return new Set(Array.isArray(seen) ? seen : []); })();
function renderPollsNav() {
  const tab = S.view === "e2022" ? "acc" : S.pollsTab || "gap";
  if (S.view === "polls" || S.view === "e2022") { pollsSeen.add(tab); try { sessionStorage.setItem("pollsTabsSeen", JSON.stringify([...pollsSeen])); } catch {} }
  const teasers = pollsNavTeasers();
  const link = ([t, , href, label, teaser], i) => `<a class="pn${pollsSeen.has(t) ? " is-seen" : ""}" href="${href}" data-polls-go="${t}"${t === tab ? ' aria-current="page"' : ""}><span class="pn-num" aria-hidden="true">${i + 1}</span><span class="pn-text"><b>${label}</b>${t === tab ? "" : `<small>${esc(teasers[t] || teaser)}</small>`}</span></a>`;
  const seen = POLLS_NAV.filter(n => pollsSeen.has(n[0])).length;
  const html = `<p class="pn-head"><b>${POLLS_NAV.length} כרטיסיות</b><span>ראיתם ${seen} מתוך ${POLLS_NAV.length}</span></p>` + POLLS_NAV.map(link).join("");
  document.querySelectorAll("[data-polls-nav]").forEach(n => { n.innerHTML = html; });
}

/* לשונית אחת גלויה בכל פעם; ברשימת כל הסקרים עמודת הסקרים האחרונים מוסתרת (אותו תוכן) */
/* ״כל הסקרים״ (מבט כולל ומגמות + רשימת הסקרים) הם כרטיסייה בפני עצמה; מדד האמינות — השאר */
const pollsSectionOf = tab => (tab === "trend" || tab === "list") ? "all" : "rel";
function syncPollTabs() {
  const sec = pollsSectionOf(S.pollsTab || "gap");
  $("#view-polls")?.setAttribute("data-section", sec);
  document.querySelectorAll(".tab[data-section]").forEach(t => t.setAttribute("aria-current", (S.view === "polls" && t.dataset.section === sec) || (S.view === "e2022" && t.dataset.section === "rel") ? "page" : "false"));
}
function setPollsTab(tab) {
  S.pollsTab = tab;
  document.querySelectorAll("[data-polls-panel]").forEach(p => { p.hidden = p.dataset.pollsPanel !== tab; });
  $("#view-polls")?.setAttribute("data-tab", tab);
  syncPollTabs();
  renderPollsNav();
  /* גרפים שמחושבים לפי הגודל — מציירים כשהלשונית גלויה */
  if (tab === "trend") renderExplorer();
  if (tab === "gap" && typeof renderPollGap === "function") renderPollGap();
  if (tab === "cross" && S.regions && typeof renderCrossover === "function") renderCrossover();
}

function wirePollTracker() {
  document.addEventListener("click", e => {
    /* בתוך עמוד הסקרים: מחליפים לשונית בלי לטעון את העמוד מחדש; הכתובת מתעדכנת */
    const a = e.target.closest("a[data-polls-go]");
    if (!a || S.view !== "polls" || a.dataset.pollsGo === "acc" || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    if (a.dataset.exMode === "overview") { S.exSources = []; S.exSubjects = ["blocs"]; }
    history.replaceState(null, "", a.getAttribute("href"));
    setPollsTab(a.dataset.pollsGo);
    $(`[data-polls-nav] a[aria-current="page"]`)?.focus();
  });
  document.addEventListener("barometer:view", () => { renderPollsNav(); syncPollTabs(); });
}
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", wirePollTracker);
