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
  polls.forEach(p => p.parties.forEach(x => { names[normId(x.id)] = x.name; }));
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

const trFmt = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
const trDelta = d => Math.abs(d) < 0.25 ? { cls: "flat", txt: "ללא שינוי", sym: "=" } :
  d > 0 ? { cls: "up", txt: `עלייה של ${trFmt(d)}`, sym: `▲ ${trFmt(d)}` } : { cls: "down", txt: `ירידה של ${trFmt(-d)}`, sym: `▼ ${trFmt(-d)}` };
const trDay = t => new Date(t).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });

/* ---------- הכותרת: משפט אחד שנגזר מהמספרים ---------- */
function trackerHeadline(M) {
  const r = M.now.blocs.Right, rb = M.before.blocs.Right, lead = M.parties[0], second = M.parties[1];
  const gap = r - 61, d = r - rb;
  const trend = Math.abs(d) < 0.5 ? "יציב בשבועיים האחרונים" : d > 0 ? `עלה ב־${trFmt(d)} בשבועיים האחרונים` : `ירד ב־${trFmt(-d)} בשבועיים האחרונים`;
  const head = gap >= 0 ? `גוש הימין והחרדים עומד על ${trFmt(r)} מנדטים — ${gap < 0.5 ? "בדיוק על קו הרוב" : `${trFmt(gap)} מעל קו הרוב`}`
    : `גוש הימין והחרדים עומד על ${trFmt(r)} מנדטים — ${trFmt(-gap)} מתחת לרוב`;
  return { head, sub: `הגוש ${trend}. ${esc(lead.name)} היא הגדולה בממוצע (${trFmt(lead.now)}), ${esc(second.name)} אחריה (${trFmt(second.now)}).` };
}

/* ---------- גרף הקווים (גושים או מפלגה אחת) ---------- */
function trackerChart(M, mode) {
  /* רוחב ה־viewBox = הרוחב האמיתי, כדי שהטקסט יישאר בגודל קריא גם בטלפון */
  const W = Math.round(Math.min(920, Math.max(320, S.trackWidth || 920))), H = W < 600 ? 260 : 340, m = { l: 30, r: W < 600 ? 40 : 52, t: 18, b: 34 };
  const days = S.trackRange === "month" ? 30 : 400;
  const tMin = Math.max(M.series[0].t, M.now.t - (days - 1) * DAY_MS);
  const S2 = M.series.filter(s => s.t >= tMin), polls = M.polls.filter(p => parsePollDate(p) >= tMin - 0.5 * DAY_MS);
  const party = mode !== "blocs" ? M.parties.find(x => x.id === mode) : null;
  const lines = party
    ? [{ key: party.id, label: party.name, color: party.color, get: s => s.parties[party.id], dot: p => M.vec.get(p.id).parties[party.id] || 0 }]
    : TRACK_BLOCS.filter(([k]) => k !== "Arabs").map(([k, label]) => ({ key: k, label, color: BLOCS[k].color, get: s => s.blocs[k], dot: p => M.vec.get(p.id).blocs[k] }));
  const vals = lines.flatMap(l => [...S2.map(l.get), ...polls.map(l.dot)]);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  if (!party) { lo = Math.min(lo, 58); hi = Math.max(hi, 64); }
  else if (lo < 9) lo = Math.max(0, Math.min(lo, 3));      /* מפלגה קטנה: רואים גם את אחוז החסימה */
  else { lo = Math.max(0, lo - 3); hi += 2; }
  const step = hi - lo > 40 ? 10 : hi - lo > 16 ? 5 : 2;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const t0 = Math.min(S2[0].t, ...polls.map(parsePollDate)), t1 = Math.max(S2.at(-1).t, t0 + DAY_MS);
  const x = t => m.l + (W - m.l - m.r) * (t - t0) / (t1 - t0);
  const y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  let g = "";
  for (let v = lo; v <= hi; v += step) g += `<line class="tr-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tr-tick" text-anchor="end" x="${m.l - 8}" y="${y(v) + 4}">${v}</text>`;
  const ref = party ? (lo <= 4 && hi >= 4 ? [4, "אחוז החסימה ≈ 4"] : null) : [61, "61 · רוב"];
  if (ref) g += `<line class="tr-ref" x1="${m.l}" x2="${W - m.r}" y1="${y(ref[0])}" y2="${y(ref[0])}"/><text class="tr-ref-label" text-anchor="end" x="${W - m.r - 14}" y="${y(ref[0]) - 7}">${ref[1]}</text>`;
  /* תוויות תאריך: בערך כל שבוע */
  const every = Math.max(1, Math.round((t1 - t0) / DAY_MS / (W < 600 ? 4 : 7))) * DAY_MS;
  for (let t = t1; t >= t0; t -= every) g += `<text class="tr-tick" text-anchor="middle" x="${x(t)}" y="${H - 10}">${trDay(t)}</text>`;
  const dots = lines.map(l => polls.map(p => `<circle class="tr-dot" cx="${x(Math.min(t1, Math.max(t0, parsePollDate(p))))}" cy="${y(l.dot(p))}" r="3.2" fill="${l.color}"/>`).join("")).join("");
  const paths = lines.map(l => `<path class="tr-line" d="${S2.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)} ${y(l.get(s)).toFixed(1)}`).join("")}" stroke="${l.color}"/>`).join("");
  const ends = lines.map(l => ({ l, v: l.get(S2.at(-1)) })).sort((a, b) => b.v - a.v);
  /* תוויות הסוף לא עולות זו על זו */
  let lastY = -99;
  const labels = ends.map(({ l, v }) => { let yy = Math.max(y(v) + 5, lastY + 16); lastY = yy;
    return `<circle cx="${x(S2.at(-1).t)}" cy="${y(v)}" r="5" fill="${l.color}" class="tr-end"/><text class="tr-end-label" x="${W - m.r + 8}" y="${yy}" fill="${l.color}">${trFmt(v)}</text>`; }).join("");
  const legend = lines.map(l => `<span style="--c:${l.color}"><i></i>${esc(l.label)} <b>${trFmt(l.get(S2.at(-1)))}</b></span>`).join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="tr-svg" role="img" aria-label="${esc(party ? `${party.name}: ממוצע נע של המנדטים בסקרים` : "ממוצע נע של הגושים בסקרים")}, ${trDay(t0)}–${trDay(t1)}. הנתונים המלאים בטבלה שמתחת.">
    ${g}${dots}${paths}${labels}<line class="tr-cursor" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" hidden/><rect class="tr-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  const rows = S2.slice().reverse().filter((_, i) => i % 2 === 0);
  const table = `<details class="tr-data"><summary>נתוני הגרף בטבלה</summary><div class="tablewrap" tabindex="0" role="region" aria-label="נתוני הגרף"><table><thead><tr><th scope="col">תאריך</th>${lines.map(l => `<th scope="col">${esc(l.label)}</th>`).join("")}<th scope="col">סקרים בחלון</th></tr></thead><tbody>${rows.map(s => `<tr><td>${trDay(s.t)}</td>${lines.map(l => `<td>${trFmt(l.get(s))}</td>`).join("")}<td>${s.n}</td></tr>`).join("")}</tbody></table></div></details>`;
  return { svg, legend, table, S2, lines, geom: { W, m, t0, t1, x, y } };
}

function wireTrackerHover(box, chart) {
  const svg = box.querySelector(".tr-svg"), hit = svg.querySelector(".tr-hit"), cur = svg.querySelector(".tr-cursor"), tip = box.querySelector(".tr-tip");
  const { S2, lines, geom } = chart;
  const show = ev => {
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) * geom.W / r.width;
    const t = geom.t0 + (vx - geom.m.l) / (geom.W - geom.m.l - geom.m.r) * (geom.t1 - geom.t0);
    const s = S2.reduce((best, s) => Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best, S2[0]);
    const px = geom.x(s.t);
    cur.setAttribute("x1", px); cur.setAttribute("x2", px); cur.hidden = false;
    tip.hidden = false;
    tip.innerHTML = `<b>${trDay(s.t)}</b><small>${s.n} סקרים · ${s.firms} מכונים בשבוע שהסתיים ביום זה</small>${lines.map(l => `<span style="--c:${l.color}"><i></i>${esc(l.label)}<b>${trFmt(l.get(s))}</b></span>`).join("")}`;
    const left = px / geom.W * r.width;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left - tip.offsetWidth - 14)) + "px";
  };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", () => { cur.hidden = true; tip.hidden = true; });
}

/* ---------- ספארקליין לשורה בטבלת המפלגות ---------- */
function trSpark(line, color) {
  const W = 120, H = 30, pts = line.slice(-Math.min(line.length, 45));
  const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(2, hi - lo);
  const mid = (hi + lo) / 2, a = mid - span / 2;
  const x = i => 2 + (W - 4) * i / Math.max(1, pts.length - 1), y = v => H - 3 - (H - 6) * (v - a) / span;
  return `<svg class="tr-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("")}" stroke="${color}"/><circle cx="${x(pts.length - 1)}" cy="${y(pts.at(-1))}" r="2.6" fill="${color}"/></svg>`;
}

/* ---------- העמודה השמאלית: הסקרים האחרונים, מהחדש לישן ---------- */
function feedWhen(p) {
  const key = t => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const today = key(Date.now()), d = key(parsePollDate(p) + 12 * 36e5);
  if (d === today) return "היום";
  if (d === key(Date.now() - DAY_MS)) return "אתמול";
  return p.date.replace(/\.20\d\d$/, "");
}
function renderPollFeed(M) {
  const box = $("#polls-feed"); if (!box) return;
  const list = M.polls.slice().sort((a, b) => parsePollDate(b) - parsePollDate(a) || (b.publishedAt || 0) - (a.publishedAt || 0));
  const LIMIT = 12, shown = S.feedAll ? list : list.slice(0, LIMIT);
  /* במחשב הסקר החדש פתוח; בטלפון הכרטיסים בשורה נגללת, ולכן כולם סגורים */
  const wide = matchMedia("(min-width: 981px)").matches;
  box.innerHTML = shown.map((p, i) => {
    const v = M.vec.get(p.id), f = firmOf(p.sourceId), prev = previousComparablePoll(p, M.polls), pv = prev ? M.vec.get(prev.id) : null;
    const names = {};
    p.parties.forEach(x => { names[normId(x.id)] ||= x.name; });
    const ids = Object.keys(v.parties).filter(id => v.parties[id] > 0).sort((a, b) => v.parties[b] - v.parties[a]);
    const blocs = ["Right", "Unknown", "Arabs", "Left"].filter(k => v.blocs[k] > 0);
    const bar = blocs.map(k => `<span style="flex:${v.blocs[k]};background:${BLOCS[k].color}">${v.blocs[k] >= 7 ? v.blocs[k] : ""}</span>`).join("");
    const aria = blocs.map(k => `${BLOCS[k].he} ${v.blocs[k]}`).join(", ");
    const delta = id => {
      if (!pv) return "";
      const d = v.parties[id] - (pv.parties[id] || 0);
      return d ? `<em class="${d > 0 ? "up" : "down"}" aria-label="${d > 0 ? "עלייה" : "ירידה"} של ${Math.abs(d)}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</em>` : `<em class="flat" aria-label="ללא שינוי">=</em>`;
    };
    return `<details class="feed-item"${i === 0 && wide ? " open" : ""}>
      <summary>
        <span class="feed-top">${outletLogo(p.channelHebrewName)}<span class="feed-who"><b>${esc(p.channelHebrewName)}</b><small>${esc(f.meta.he)}</small></span><time datetime="${new Date(parsePollDate(p)).toISOString().slice(0, 10)}">${esc(feedWhen(p))}</time></span>
        <span class="feed-bar" role="img" aria-label="${esc(aria)}">${bar}<i class="feed-61" title="61"></i></span>
        <span class="feed-lead">${ids.slice(0, 3).map(id => `<span style="--c:${partyHue(id)}"><i></i>${esc(names[id])} <b>${v.parties[id]}</b></span>`).join("")}</span>
      </summary>
      <ol class="feed-parties">${ids.map(id => `<li style="--c:${partyHue(id)}"><i></i><span>${esc(names[id])}</span><b>${v.parties[id]}</b>${delta(id)}</li>`).join("")}</ol>
      <p class="feed-src">${prev ? `החצים: שינוי מול הסקר הקודם של ${esc(f.meta.he)} ב${esc(p.channelHebrewName)} (${esc(prev.date.replace(/\.20\d\d$/, ""))})` : "אין סקר קודם של אותו מכון ואותו ערוץ"}${p.sourceUrl ? ` · <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">מקור ↗</a>` : ""}</p>
    </details>`;
  }).join("") + (list.length > LIMIT ? `<button type="button" class="feed-more" data-feed-more>${S.feedAll ? "להציג פחות" : `עוד ${list.length - LIMIT} סקרים מאז אוגוסט`}</button>` : "");
}

/* ---------- טבלת כל הסקרים ---------- */
function renderTrackerTable(M) {
  const box = $("#polls-table"); if (!box) return;
  const ff = $("#poll-firm")?.value || "all", oo = $("#poll-outlet")?.value || "all";
  const rows = M.polls.filter(p => (ff === "all" || firmOf(p.sourceId).firm === ff) && (oo === "all" || p.channelHebrewName === oo)).reverse();
  const cols = M.parties.filter(x => x.now >= 3).slice(0, 12);
  const LIMIT = 25, shown = S.trackAllRows ? rows : rows.slice(0, LIMIT);
  box.innerHTML = `<div class="tablewrap tr-table-wrap" tabindex="0" role="region" aria-label="כל הסקרים בטבלה"><table class="tr-table"><caption>כל סקר בשורה, מהחדש לישן · המספרים במנדטים</caption><thead><tr><th scope="col">תאריך</th><th scope="col">פורסם ב־</th><th scope="col">מכון</th>${cols.map(c => `<th scope="col" class="n" style="--c:${c.color}"><span>${esc(c.name)}</span></th>`).join("")}<th scope="col" class="n bloc">ימין וחרדים</th></tr></thead><tbody>${
    `<tr class="tr-avg-row"><td>${trDay(M.now.t)}</td><td colspan="2"><b>ממוצע 7 הימים האחרונים</b></td>${cols.map(c => `<td class="n"><b>${trFmt(c.now)}</b></td>`).join("")}<td class="n bloc"><b>${trFmt(M.now.blocs.Right)}</b></td></tr>` +
    shown.map(p => { const v = M.vec.get(p.id), f = firmOf(p.sourceId), r = v.blocs.Right;
      return `<tr><td class="date">${esc(p.date)}</td><td><div class="orgcell">${outletLogo(p.channelHebrewName)}<span>${esc(p.channelHebrewName)}</span></div></td><td>${esc(f.meta.he)}</td>${cols.map(c => {
        const val = v.parties[c.id] || 0, dv = val - c.now;
        return `<td class="n${Math.abs(dv) >= 2 ? (dv > 0 ? " hi" : " lo") : ""}"${Math.abs(dv) >= 2 ? ` title="${dv > 0 ? "גבוה" : "נמוך"} ב־${trFmt(Math.abs(dv))} מהממוצע"` : ""}>${val || "<span class=\"z\">0</span>"}</td>`; }).join("")}<td class="n bloc${r >= 61 ? " maj" : ""}"><b>${r}</b></td></tr>`; }).join("")
  }</tbody></table></div><p class="tr-table-note">תא מודגש: המכון נתן למפלגה 2 מנדטים או יותר מעל (כחול) או מתחת (כתום) לממוצע העדכני. ${rows.length > LIMIT ? `<button type="button" class="linkbtn" data-track-rows>${S.trackAllRows ? `להציג רק ${LIMIT} אחרונים` : `להציג את כל ${rows.length} הסקרים`}</button>` : ""}</p>`;
}

function renderPollTracker() {
  const root = $("#poll-tracker"); if (!root) return;
  const M = trackerModel();
  if (!M) { root.hidden = true; return; }
  root.hidden = false;
  S.trackMode ||= "blocs"; S.trackRange ||= "all";
  if (S.trackMode !== "blocs" && !M.parties.some(x => x.id === S.trackMode)) S.trackMode = "blocs";
  S.trackWidth = (root.clientWidth || 900) - (root.clientWidth > 800 ? 50 : 34);
  const h = trackerHeadline(M), chart = trackerChart(M, S.trackMode);
  const movers = M.parties.filter(x => x.now >= 1 || x.before >= 1).map(x => ({ ...x, d: x.now - x.before })).filter(x => Math.abs(x.d) >= 0.5).sort((a, b) => b.d - a.d);
  const ups = movers.filter(x => x.d > 0).slice(0, 3), downs = movers.filter(x => x.d < 0).slice(-3).reverse();
  const moverChip = x => `<button type="button" class="tr-mover" data-track-party="${esc(x.id)}" style="--c:${x.color}"><i></i><span>${esc(x.name)}</span><b class="${x.d > 0 ? "up" : "down"}">${trDelta(x.d).sym}</b></button>`;
  const selParty = S.trackMode !== "blocs" ? M.parties.find(x => x.id === S.trackMode) : null;
  const maxNow = Math.max(...M.parties.map(x => x.max));
  const scale = Math.max(25, Math.ceil((maxNow + 1) / 5) * 5);
  root.innerHTML = `
    <div class="tr-hero">
      <div class="tr-hero-text">
        <p class="kicker">ממוצע הסקרים · עודכן ${trDay(M.now.t)}</p>
        <h3>${esc(h.head)}</h3>
        <p>${h.sub}</p>
      </div>
      <div class="tr-blocs" role="list">${TRACK_BLOCS.map(([k, l]) => { const d = trDelta(M.now.blocs[k] - M.before.blocs[k]);
        return `<div class="tr-bloc" role="listitem" style="--c:${BLOCS[k].color}"><span>${l}</span><b class="num">${trFmt(M.now.blocs[k])}</b><em class="${d.cls}" title="שינוי מלפני שבועיים">${d.sym}</em></div>`; }).join("")}</div>
    </div>
    <div class="tr-movers" aria-label="מי עולה ומי יורדת בשבועיים האחרונים">
      <div class="tr-mover-group"><span class="tr-mover-lbl up">עולות בשבועיים</span>${ups.map(moverChip).join("") || '<span class="tr-none">אף מפלגה לא עלתה בחצי מנדט או יותר</span>'}</div>
      <div class="tr-mover-group"><span class="tr-mover-lbl down">יורדות בשבועיים</span>${downs.map(moverChip).join("") || '<span class="tr-none">אף מפלגה לא ירדה בחצי מנדט או יותר</span>'}</div>
    </div>
    <div class="tr-card tr-chart-card">
      <div class="tr-card-head">
        <div><h3>${selParty ? `${esc(selParty.name)} לאורך זמן` : "הגושים לאורך זמן"}</h3><p>${selParty ? "" : "ימין וחרדים מול מרכז–שמאל. "}הקו הוא ממוצע נע של 7 ימים (כל מכון נספר פעם אחת); כל נקודה היא סקר בודד.</p></div>
        <div class="tr-controls">
          ${selParty ? `<button type="button" class="tr-back" data-track-party="blocs">→ חזרה לגושים</button>` : ""}
          <div class="switch tr-range" role="group" aria-label="טווח זמן"><button type="button" data-track-range="month" aria-pressed="${S.trackRange === "month"}">חודש אחרון</button><button type="button" data-track-range="all" aria-pressed="${S.trackRange === "all"}">מאז אוגוסט</button></div>
        </div>
      </div>
      <div class="tr-legend">${chart.legend}</div>
      <div class="tr-plot">${chart.svg}<div class="tr-tip" hidden></div></div>
      ${chart.table}
    </div>
    <div class="tr-card tr-parties">
      <div class="tr-card-head"><div><h3>כל המפלגות — ממוצע ומגמה</h3><p>הממוצע של השבוע האחרון, הקו מאז אוגוסט, השינוי בשבועיים והטווח שבין הסקרים השונים השבוע.</p></div></div>
      <div class="tablewrap" tabindex="0" role="region" aria-label="ממוצע ומגמה לכל מפלגה">
      <table class="tr-ptable"><thead><tr><th scope="col">מפלגה</th><th scope="col" class="n">ממוצע</th><th scope="col">מגמה</th><th scope="col" class="n">שבועיים</th><th scope="col" class="rng">טווח השבוע <small>(0–${scale})</small></th></tr></thead><tbody>${
        M.parties.map(x => { const d = trDelta(x.now - x.before), below = x.now < 4;
          return `<tr class="${S.trackMode === x.id ? "is-on" : ""}${below ? " is-below" : ""}" style="--c:${x.color}"><th scope="row"><button type="button" data-track-party="${esc(x.id)}" aria-pressed="${S.trackMode === x.id}"><i></i>${esc(x.name)}</button></th>
          <td class="n"><b class="num">${trFmt(x.now)}</b></td><td>${trSpark(x.line, x.color)}</td>
          <td class="n"><em class="tr-d ${d.cls}" aria-label="${d.txt}">${d.sym}</em></td>
          <td class="rng"><span class="tr-range-bar" aria-label="בין ${x.min} ל־${x.max} מנדטים"><i style="--a:${100 * x.min / scale}%;--b:${100 * x.max / scale}%"></i><b style="--at:${100 * x.now / scale}%"></b></span><small class="tr-range-txt">${x.min === x.max ? x.min : `${x.min}–${x.max}`}</small></td></tr>`; }).join("")
      }</tbody></table></div>
      <p class="tr-foot">מפלגה מתחת ל־4 מנדטים בממוצע מסומנת בחיוור — היא קרובה לאחוז החסימה (3.25%).</p>
    </div>`;
  wireTrackerHover(root, chart);
  renderTrackerTable(M);
  renderPollFeed(M);
}

function wirePollTracker() {
  document.addEventListener("click", e => {
    const p = e.target.closest("[data-track-party]");
    if (p) {
      const id = p.dataset.trackParty;
      S.trackMode = id === "blocs" || S.trackMode === id ? "blocs" : id;
      renderPollTracker();
      $("#poll-tracker .tr-chart-card")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      return;
    }
    const r = e.target.closest("[data-track-range]");
    if (r) { S.trackRange = r.dataset.trackRange; renderPollTracker(); $(`[data-track-range="${S.trackRange}"]`)?.focus(); return; }
    if (e.target.closest("[data-feed-more]")) { S.feedAll = !S.feedAll; const M = trackerModel(); if (M) renderPollFeed(M); return; }
    if (e.target.closest("[data-track-rows]")) { S.trackAllRows = !S.trackAllRows; const M = trackerModel(); if (M) renderTrackerTable(M); }
  });
}
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", wirePollTracker);
/* גודל הגרף תלוי ברוחב — מציירים מחדש כשהרוחב משתנה באמת */
let trResizeTimer = 0, trLastW = 0;
if (typeof window !== "undefined") window.addEventListener("resize", () => {
  clearTimeout(trResizeTimer);
  trResizeTimer = setTimeout(() => { const r = $("#poll-tracker"); if (!r || !r.offsetParent || Math.abs(r.clientWidth - trLastW) < 40) return; trLastW = r.clientWidth; renderPollTracker(); }, 200);
});
