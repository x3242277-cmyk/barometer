/* ============================================================
   הברומטר — מפת הבחירות: לוח נתונים במסך אחד (#/map)
   ------------------------------------------------------------
   בכותרת בוחרים מערכת בחירות — כל אחת מעשר מערכות הבחירות 2003–2022, או
   תחזית 2026 לפי מגמות היישובים. הכול בארבע קבוצות: ימין, חרדים, מרכז־שמאל
   וערבים (data/elections/*.json — scripts/import-elections-history.py).
   שלוש תצוגות (בעמודה הימנית), כל אחת עם מפה, כרטיס וגרף משלה:
     כל הארץ   — המדינה מחולקת לפסים לפי הקולות של כל קבוצה;
                 רשימת המנדטים של כל מפלגה במקום טבלת מחוזות.
     לפי אזורים — 68 אזורי הצבעה רציפים (נקבעו לפי 2022), צבועים לפי
                 הקבוצה המובילה ועוצמת היתרון; הטבלה: האזורים.
     לפי ערים   — כל יישוב בצורתו, סינון לפי אוכלוסייה; הטבלה: היישובים.
   תחזית 2026 (data/trends.json — scripts/build-locality-trends.py): אותן תצוגות,
   המספרים מול 2022, והגרף — קו המגמה של הבחירה מ־2003 עד 2026.
   הגאוגרפיה: data/results-2022.json (scripts/build-results-2022.mjs).
   ============================================================ */
(() => {
"use strict";

/* ארבע קבוצות בכל השנים (החלטת המשתמש, 04.10.2026): לפי האידיאולוגיה, וישראל ביתנו
   (מספטמבר 2019) ותקווה חדשה במרכז־שמאל כי ישבו מול נתניהו. O — רשימות מחוץ לקבוצות. */
const CAMPS = ["R", "H", "L", "A", "O"];
const GROUPS = ["R", "H", "L", "A"];
const CAMP_HE = { R: "ימין", H: "חרדים", L: "מרכז־שמאל", A: "ערבים", O: "אחרות" };
const campColor = k => {
  const b = typeof BLOCS !== "undefined" ? BLOCS : null;
  return { R: b?.Right.color || "#2563B0", H: b?.Haredi.color || "#6A5A9C", L: b?.Left.color || "#C0392B", A: b?.Arabs.color || "#2A7A5E", O: b?.Unknown.color || "#6B7580" }[k];
};
const FORECAST = "2026";
const isForecast = () => st.year === FORECAST;
/* צבע רך יותר לאזורים צמודים; ההבדל בגוון משקף את יתרון הגוש. */
const RATING = [[30, .86], [15, .72], [7, .58], [2, .44], [0, .32]];
const nf = new Intl.NumberFormat("he-IL");
const n0 = v => nf.format(Math.round(v));
const p1 = v => (Math.round(v * 10) / 10).toFixed(1);
const signed = v => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${p1(Math.abs(v))}`;
const escH = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const q = s => document.querySelector(s);

let D = null;
const st = { year: "2022", mode: "nation", sel: null, sectors: new Set(), nat: true, sort: { key: "v", dir: -1 } };
const YEARS = { list: [], cache: new Map() };

async function getJSON(path) {
  const inline = window.__BAROMETER_DATA__?.[path];
  if (inline) return inline;
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(path);
  return r.json();
}
async function loadData() {
  if (D) return D;
  D = await getJSON("data/results-2022.json");
  D.base = D.localities;                       // הגאוגרפיה והשיוך (אזור, אוכלוסייה) — לפי 2022
  YEARS.list = await getJSON("data/elections/index.json");
  await applyYear(st.year);
  return D;
}
/* תחזית 2026 באותו מבנה כמו מערכת בחירות: "רשימה" לכל קבוצה */
function forecastYear(T) {
  const parties = CAMPS.map((k, i) => ({ id: `g_${k}`, name: CAMP_HE[k], short: CAMP_HE[k], camp: k, color: campColor(k), seats: T.national.seats26[i] || 0 }));
  const rows = Object.entries(T.loc).map(([c, L]) => [Number(c), L.f[0], Math.round(L.f[0] * L.f[1] / 1000), ...L.f.slice(2)]);
  const national = { eligible: 0, voted: 0, valid: 0, votes: parties.map(() => 0) };
  for (const r of rows) {
    national.eligible += r[1]; national.voted += r[0] === 99999 ? r[3] : r[2]; national.valid += r[3];
    r.slice(4).forEach((x, i) => national.votes[i] += x);
  }
  return { id: FORECAST, label: "תחזית 2026", parties, national, rows, names: {}, trends: T };
}
async function loadYear(id) {
  if (!YEARS.cache.has(id)) YEARS.cache.set(id, id === FORECAST ? forecastYear(await getJSON("data/trends.json")) : await getJSON(`data/elections/${id}.json`));
  return YEARS.cache.get(id);
}
/* מחליפים את התוצאות של כל יישוב בתוצאות של השנה שנבחרה; מה שלא קיים בה — יוצא */
async function applyYear(id) {
  const E = await loadYear(id);
  st.year = id; D.E = E; D.parties = E.parties; D.national = E.national;
  const rows = new Map(E.rows.map(r => [r[0], r])), known = new Set(D.base.map(l => l.c));
  const fill = (l, r) => ({ ...l, e: r[1], t: r[2], v: r[3], p: r.slice(4) });
  D.localities = D.base.filter(l => rows.get(l.c)?.[3] > 0).map(l => fill(l, rows.get(l.c)))
    .concat(E.rows.filter(r => r[0] !== 99999 && r[3] > 0 && !known.has(r[0]))
      .map(r => fill({ c: r[0], n: E.names?.[r[0]] || String(r[0]), d: null, r: null, s: "", x: null, y: null, g: null }, r)));
  prepare();
}

/* ---------- נתונים מחושבים ---------- */
function prepare() {
  D.campIdx = CAMPS.map(c => D.parties.map((p, i) => p.camp === c ? i : -1).filter(i => i >= 0));
  D.byCode = new Map(D.localities.map(l => [l.c, l]));
  const sum = list => {
    const a = { e: 0, t: 0, v: 0, p: D.parties.map(() => 0), n: list.length, codes: list.map(l => l.c) };
    for (const l of list) { a.e += l.e; a.t += l.t; a.v += l.v; l.p.forEach((x, i) => a.p[i] += x); }
    return a;
  };
  D.sum = sum;
  const loc = sum(D.localities);
  D.nat = { name: "כל הארץ", e: D.national.eligible, t: D.national.voted, v: D.national.valid, p: D.national.votes, n: D.localities.length };
  /* אחוז ההצבעה להשוואה: של היישובים בלבד — קולות המעטפות החיצוניות (חיילים,
     נציגויות) אינם משויכים ליישוב, ולכן השוואת יישוב ל־70.6% הרשמי הייתה מנמיכה אותו. */
  D.locTurnout = 100 * loc.t / loc.e;
  D.envelopes = { name: "מעטפות חיצוניות", sub: "חיילים, נציגויות ועוד — בלי יישוב", e: 0, t: D.nat.t - loc.t, v: D.nat.v - loc.v, p: D.nat.p.map((x, i) => x - loc.p[i]), fixed: true };
  D.districtRows = D.districts.map((name, d) => ({ id: d, name: /^אזור /.test(name) ? name : `מחוז ${name}`, ...sum(D.localities.filter(l => l.d === d)) }));
  D.areaRows = D.areas.map((a, i) => ({ id: i, name: a.name, sub: D.districts[a.d] || "", ...sum(D.localities.filter(l => l.g === i)) }));
  D.cityRows = D.localities.map(l => ({ id: l.c, name: l.n, sub: D.regions[l.r] || "", sector: D.sectors[l.s] || "", s: l.s, e: l.e, t: l.t, v: l.v, p: l.p, n: 1, l, codes: [l.c] }));
}
/* תחזית: מה שהיה באותה יחידה בכל מערכת בחירות (קולות לכל קבוצה), מתוך data/trends.json */
function history(r) {
  const T = D.E.trends, K = T.meta.elections.length;
  const codes = r === D.nat ? Object.keys(T.loc) : r.codes || [];
  const v = new Array(K).fill(0), g = Array.from({ length: K }, () => [0, 0, 0, 0, 0]);
  for (const c of codes) {
    const L = T.loc[c]; if (!L) continue;
    for (let k = 0; k < K; k++) { v[k] += L.v[k]; for (let j = 0; j < 5; j++) g[k][j] += L.g[k * 5 + j]; }
  }
  return { v, g, share: k => Object.fromEntries(CAMPS.map((c, j) => [c, v[k] ? 100 * g[k][j] / v[k] : null])) };
}
const share22 = r => { const h = history(r); return h.share(h.v.length - 1); };
/* תזוזה: השינוי בחלקם של ימין וחרדים יחד מ־2022 לתחזית, בנקודות */
const shiftOf = r => { const b = share22(r), c = campShares(r); return b.R == null ? null : c.R + c.H - b.R - b.H; };
const campShares = r => Object.fromEntries(CAMPS.map((c, k) => [c, r.v ? 100 * D.campIdx[k].reduce((t, i) => t + r.p[i], 0) / r.v : 0]));
const isOther = p => p.id === "other" || p.id.startsWith("other_") || p.id === "g_O";
const leadIdx = r => r.p.reduce((b, x, i) => x > r.p[b] && !isOther(D.parties[i]) ? i : b, 0);
const leadCamp = r => { const c = campShares(r); return GROUPS.reduce((b, k) => c[k] > c[b] ? k : b, "R"); };
const margin = r => { const c = campShares(r), v = GROUPS.map(k => c[k]).sort((a, b) => b - a); return v[0] - v[1]; };
const strength = r => RATING.find(([m]) => margin(r) >= m)[1];
const blocVotes = (r, ks) => ks.reduce((t, k) => t + D.campIdx[CAMPS.indexOf(k)].reduce((s, i) => s + r.p[i], 0), 0);

/* ---------- התצוגה הנוכחית ---------- */
function rows() {
  if (st.mode === "nation") return D.districtRows;
  if (st.mode === "areas") return st.sel == null ? D.areaRows : D.cityRows.filter(r => r.l.g === st.sel);
  return D.cityRows.filter(r => !st.sectors.size || st.sectors.has(r.s));
}
const areaCities = () => st.mode === "areas" && st.sel != null;
function selection() {
  const sel = st.sel == null ? null : st.mode === "nation" ? D.districtRows[st.sel] : st.mode === "areas" ? D.areaRows[st.sel] : D.cityRows.find(r => r.id === st.sel);
  if (sel) return sel;
  if (st.mode === "cities" && st.sectors.size) return { name: [...st.sectors].map(s => D.sectors[s]).join(", "), ...D.sum(rows().map(r => r.l)) };
  return D.nat;
}

/* ---------- העמודה הימנית ---------- */
const MODES = [
  ["nation", "כל הארץ", "מפלגות ומנדטים"],
  ["areas", "לפי אזורים", "דפוסי הצבעה מקומיים"],
  ["cities", "לפי ערים", "כל יישוב בנפרד"]
];
function renderSide() {
  const sub = { nation: "120 מנדטים", areas: `${D.areas.length} אזורים`, cities: `${n0(D.localities.length)} יישובים` };
  q("#r22-side").innerHTML = `
    <div class="r22-modes" role="group" aria-label="תצוגה">${MODES.map(([k, he, note]) =>
      `<button type="button" data-mode="${k}" aria-pressed="${st.mode === k}"><b>${he}</b><small>${note} · ${sub[k]}</small></button>`).join("")}</div>
    <div class="r22-mode-controls">${modeControls()}</div>
    ${st.mode === "nation" ? "" : `${isForecast() ? "" : `<label class="r22-toggle"><input type="checkbox" id="r22-nat" ${st.nat ? "checked" : ""}><span>השוואה לממוצע הארצי</span></label>`}
    <button type="button" class="r22-reset" id="r22-reset" ${st.sel == null && !st.sectors.size ? "disabled" : ""}>ניקוי הבחירה</button>`}
    <details class="r22-explain"><summary>${isForecast() ? "איך מחושבת התחזית?" : "איך קוראים את התצוגה?"}</summary>${isForecast() ? forecastExplain() : `<p class="r22-rule">${st.mode === "cities" ? escH(D.meta.sectorRule) : st.mode === "areas"
      ? "היבשה מחולקת ל־68 אזורים רציפים, על בסיס קרבה גאוגרפית ודפוסי ההצבעה ב־2022 — אותם אזורים בכל השנים. רשומות שבט ונקודות מיקום לא אמינות נספרות בתוצאות, אך אינן משמשות נקודת מיקום במפה. צבע כהה מציין יתרון גדול יותר לקבוצה המובילה."
      : "ימין — הליכוד והמפלגות מימינו, כולנו, וישראל ביתנו עד אפריל 2019. חרדים — ש״ס ויהדות התורה. מרכז־שמאל — העבודה, מרצ, קדימה, שינוי, יש עתיד, כחול לבן והמחנה הממלכתי, וגם ישראל ביתנו מספטמבר 2019 ותקווה חדשה (ישבו מול נתניהו). ערבים — חד״ש, רע״מ, בל״ד ותע״ל. הפסים מחלקים את שטח המפה לפי הקולות."}</p>`}</details>`;
}
function modeControls() {
  if (st.mode === "areas") return `<label class="r22-field"><span>אזור</span><input id="r22-find" type="search" list="r22-find-list" placeholder="שם אזור או עיר" autocomplete="off"><datalist id="r22-find-list">${
    D.areaRows.slice().sort((a, b) => a.name.localeCompare(b.name, "he")).map(r => `<option value="${escH(r.name)}"></option>`).join("")}</datalist></label>`;
  if (st.mode === "cities") {
    const counts = Object.fromEntries(Object.keys(D.sectors).map(k => [k, D.localities.filter(l => l.s === k).length]));
    return `<label class="r22-field"><span>עיר</span><input id="r22-find" type="search" list="r22-find-list" placeholder="שם יישוב" autocomplete="off"><datalist id="r22-find-list">${
      D.localities.map(l => `<option value="${escH(l.n)}"></option>`).join("")}</datalist></label>
      <fieldset class="r22-field"><legend>אוכלוסייה</legend><div class="r22-chips">
        <button type="button" data-sector="" aria-pressed="${!st.sectors.size}">הכול</button>${
        Object.entries(D.sectors).map(([k, he]) => `<button type="button" data-sector="${k}" aria-pressed="${st.sectors.has(k)}" title="${counts[k]} יישובים">${escH(he)}</button>`).join("")}</div></fieldset>`;
  }
  const R = blocVotes(D.nat, ["R", "H"]), C = blocVotes(D.nat, ["L", "A"]), yl = D.E.label;
  const seats = ks => D.parties.filter(p => ks.includes(p.camp)).reduce((n, p) => n + (p.seats || 0), 0);
  return `<div class="r22-duel"><div style="--c:${campColor("R")}"><b>${n0(R)}</b><span>ימין וחרדים · ${escH(yl)}</span></div><div style="--c:${campColor("L")}"><b>${n0(C)}</b><span>מרכז־שמאל וערבים · ${escH(yl)}</span></div>
    <p>פער של ${n0(Math.abs(C - R))} קולות ${C > R ? "לטובת מרכז־שמאל וערבים" : "לטובת ימין וחרדים"} · ${isForecast() ? "בערך " : ""}${seats(["R", "H"])}–${seats(["L", "A"])} במנדטים.</p></div>`;
}
/* ההסבר של התחזית: השיטה, והבדיקה לאחור על 2022 */
function forecastExplain() {
  const T = D.E.trends, b = T.national.backtest, at = k => GROUPS.indexOf(k);
  return `<p class="r22-rule">${escH(T.meta.method)}</p>
    <p class="r22-rule"><b>בדיקה לאחור:</b> אותה שיטה, רק על הנתונים עד 2021, חזתה ל־2022 ימין ${p1(b.predicted[at("R")])}%, חרדים ${p1(b.predicted[at("H")])}%, מרכז־שמאל ${p1(b.predicted[at("L")])}% וערבים ${p1(b.predicted[at("A")])}% — בפועל ${p1(b.actual[at("R")])}%, ${p1(b.actual[at("H")])}%, ${p1(b.actual[at("L")])}% ו־${p1(b.actual[at("A")])}%. ביישובים הטעות הממוצעת הייתה ${p1(b.locErrModel)} נקודות, מול ${p1(b.locErrNaive)} אם מניחים שהכול יחזור על הבחירות הקודמות.</p>
    <p class="r22-rule">המנדטים: 2022 בפועל, ועוד השינוי בקולות כאילו כל קבוצה רצה כרשימה אחת. לא סקר — המשך של המגמות.</p>`;
}

/* ---------- טבלה ---------- */
const campCell = k => ({ key: k, he: CAMP_HE[k], num: true, val: r => campShares(r)[k],
  cell: r => { const v = campShares(r)[k]; return `<td class="n r22-camp" style="--c:${campColor(k)};--w:${v.toFixed(1)}%"><span>${p1(v)}%</span></td>`; } });
const leadCell = { key: "lead", he: "הגדולה", title: "הרשימה הגדולה", val: r => D.parties[leadIdx(r)].short,
  cell: r => { const p = D.parties[leadIdx(r)]; return `<td class="r22-lead"><i class="r22-sw" style="--c:${p.color}"></i>${escH(p.short)}</td>`; } };
const shiftCell = { key: "shift", he: "תזוזה", title: "השינוי בחלקם של ימין וחרדים יחד מול 2022, בנקודות", num: true, val: r => shiftOf(r) ?? 0,
  cell: r => { const v = shiftOf(r); return v == null ? `<td class="n r22-dim">חדש</td>` : `<td class="n r22-shift ${v >= .05 ? "right" : v <= -.05 ? "left" : ""}">${Math.abs(v) < .05 ? "±0" : `${v > 0 ? "ימינה" : "שמאלה"} ${p1(Math.abs(v))}`}</td>`; } };
const COLS = {
  nation: () => [{ key: "n", he: "מחוז", val: r => r.name, cell: r => `<th scope="row">${escH(r.name)}${r.sub ? `<small>${escH(r.sub)}</small>` : ""}</th>` }],
  areas: () => [{ key: "n", he: "אזור", val: r => r.name, cell: r => `<th scope="row" title="${escH(r.name)}">${escH(r.name)}</th>` },
    { key: "d", he: "מחוז", val: r => r.sub, cell: r => `<td class="r22-dim">${escH(r.sub)}</td>` }],
  cities: () => [{ key: "n", he: "יישוב", val: r => r.name, cell: r => `<th scope="row">${escH(r.name)}</th>` },
    { key: "r", he: "אזור", val: r => r.sub, cell: r => `<td class="r22-dim" title="${escH(r.sub)}">${escH(r.sub)}</td>` },
    { key: "s", he: "אוכלוסייה", val: r => r.sector, cell: r => `<td class="r22-dim">${escH(r.sector)}</td>` }]
};
const NUM_COLS = [
  { key: "v", he: "קולות", title: "קולות כשרים", num: true, val: r => r.v, cell: r => `<td class="n">${n0(r.v)}</td>` },
  { key: "to", he: "הצבעה", title: "אחוז הצבעה", num: true, val: r => r.e ? r.t / r.e : 0, cell: r => `<td class="n">${r.e ? p1(100 * r.t / r.e) + "%" : "—"}</td>` }
];
const cols = () => [...COLS[areaCities() ? "cities" : st.mode](), ...NUM_COLS, ...GROUPS.map(campCell), isForecast() ? shiftCell : leadCell];
function renderTable() {
  if (st.mode === "nation") {
    q("#r22-table").hidden = true;
    q(".r22-scroll").classList.add("r22-is-nation");
    const grid = q("#r22-party-grid");
    grid.hidden = false;
    if (isForecast()) {
      const n = D.E.trends.national, d = n.steps;
      q("#r22-table-title").textContent = "מנדטים לפי קבוצה · 2022 מול 2026";
      grid.innerHTML = GROUPS.map((k, i) => {
        const old = n.seats22[i], next = n.seats26[i], diff = next - old;
        return `<li class="r22-seatitem r22-groupitem"><i class="r22-sw" style="--c:${campColor(k)}"></i><span class="r22-seatname"><strong>${CAMP_HE[k]}</strong><small title="השינוי בנקודות אחוז מ־2022">דמוגרפיה ${signed(d.demography[i])} · הצבעה ${signed(d.turnout[i])} · מגמה ${signed(d.trend[i])}</small></span><span class="r22-seatnum"><small>2022</small><b>${old}</b></span><span class="r22-seatnum r22-seat-next"><small>2026</small><b>${next}</b></span><span class="r22-seat-delta ${diff > 0 ? "up" : diff < 0 ? "down" : "flat"}">${diff > 0 ? "+" : ""}${diff}</span></li>`;
      }).join("");
      q("#r22-count").textContent = "השינוי בנקודות: גידול היישובים · אחוז ההצבעה · מגמה בתוך היישובים";
      q(".r22-scroll").setAttribute("aria-label", "מנדטים לפי קבוצה");
      return;
    }
    const list = D.parties.filter(p => !isOther(p));
    q("#r22-table-title").textContent = `מנדטים לפי רשימה · ${D.E.label}`;
    grid.innerHTML = list.map((p, i) => {
      const old = p.seats || 0;
      return `<li class="r22-seatitem" title="${escH(p.name)} · ${CAMP_HE[p.camp]} · ${n0(D.nat.p[i])} קולות · ${p1(100 * D.nat.p[i] / D.nat.v)}%"><i class="r22-sw" style="--c:${p.color}"></i><span class="r22-seatname"><strong>${escH(p.short)}</strong><small>${CAMP_HE[p.camp]}${old ? "" : " · לא עברה את אחוז החסימה"}</small></span><span class="r22-seatnum"><small>מנדטים</small><b>${old}</b></span></li>`;
    }).join("");
    q("#r22-count").textContent = `${list.filter(p => p.seats).length} רשימות עברו · אחוז החסימה ${D.E.threshold}% · 120 מנדטים`;
    q(".r22-scroll").setAttribute("aria-label", "מנדטים לפי רשימה");
    return;
  }
  q("#r22-table").hidden = false;
  q("#r22-party-grid").hidden = true;
  q(".r22-scroll").classList.remove("r22-is-nation");
  const C = cols(), col = C.find(c => c.key === st.sort.key) || C.find(c => c.key === "v");
  const list = rows().slice().sort((a, b) => {
    const x = col.val(a), y = col.val(b);
    return (typeof x === "string" ? x.localeCompare(y, "he") : x - y) * st.sort.dir || b.v - a.v;
  });
  const sel = st.sel == null || areaCities() ? -1 : list.findIndex(r => r.id === st.sel);
  if (sel > 0) list.unshift(list.splice(sel, 1)[0]);
  q("#r22-table-title").textContent = areaCities() ? `יישובי ${D.areaRows[st.sel].name}` : { nation: "המחוזות", areas: "האזורים", cities: "היישובים" }[st.mode];
  q("#r22-table").innerHTML = `<thead><tr>${C.map(c => {
    const on = c.key === col.key;
    return `<th scope="col" class="${c.num ? "n" : ""}" aria-sort="${on ? (st.sort.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${c.key}"${c.title ? ` title="${escH(c.title)}"` : ""}>${escH(c.he)}${on ? `<i aria-hidden="true">${st.sort.dir > 0 ? "▲" : "▼"}</i>` : ""}</button></th>`;
  }).join("")}</tr></thead><tbody>${list.map(r =>
    `<tr ${r.fixed ? 'class="r22-fixed"' : `data-id="${r.id}" tabindex="0" aria-selected="${!areaCities() && r.id === st.sel}" class="${!areaCities() && r.id === st.sel ? "is-sel" : ""}"`}>${C.map(c => c.cell(r)).join("")}</tr>`).join("")}</tbody>`;
  const shown = rows();
  q("#r22-count").textContent = st.mode === "cities" || areaCities() ? `${n0(shown.length)} יישובים · ${n0(shown.reduce((t, r) => t + r.v, 0))} קולות` : st.mode === "areas" ? `${shown.length} אזורים · לחצו לבחירה` : `${shown.length} שורות · לחצו לבחירה`;
  q(".r22-scroll").setAttribute("aria-label", `טבלת ${q("#r22-table-title").textContent}`);
}

/* ---------- כרטיס הבחירה ---------- */
function renderKpi() {
  if (isForecast()) return renderForecastKpi();
  const s = selection(), camps = campShares(s), natC = campShares(D.nat);
  const isNat = s === D.nat, turnout = s.e ? 100 * s.t / s.e : 0, li = leadIdx(s);
  const delta = (v, ref) => st.nat && !isNat ? `<em class="${v - ref >= 0 ? "up" : "down"}" title="מול הממוצע הארצי">${signed(v - ref)}</em>` : "";
  const kind = { nation: "מחוז", areas: "אזור", cities: "יישוב" }[st.mode];
  const subline = isNat ? `${n0(s.n)} יישובים ומעטפות חיצוניות` : st.sel == null ? `${n0(s.n)} יישובים`
    : st.mode === "cities" ? `${escH(s.sub)} · ${escH(s.sector)}${s.l?.x == null ? " · ללא מיקום מדויק במפה" : ""}` : `${n0(s.n)} יישובים${s.sub ? ` · ${escH(s.sub)}` : ""}`;
  q("#r22-kpi").innerHTML = `
    <div class="r22-kpi-head"><p class="r22-kicker">${isNat ? `התוצאה הרשמית · ${escH(D.E.label)}` : st.sel != null ? kind : "הבחירה"}</p><h3>${escH(s.name)}</h3><p>${subline} · ${n0(s.e)} בעלי זכות בחירה</p></div>
    <div class="r22-kpis">
      <div><b>${n0(s.v)}</b><span>קולות כשרים</span>${st.nat && !isNat ? `<em class="flat">${p1(100 * s.v / D.nat.v)}% מהארץ</em>` : ""}</div>
      <div title="${isNat ? "כולל המעטפות החיצוניות" : `הממוצע להשוואה: ${p1(D.locTurnout)}% — ביישובים, בלי המעטפות החיצוניות (הרשמי: ${p1(100 * D.nat.t / D.nat.e)}%)`}"><b>${p1(turnout)}%</b><span>אחוז הצבעה</span>${delta(turnout, D.locTurnout)}</div>
      <div><b style="color:${D.parties[li].color}">${escH(D.parties[li].short)}</b><span>הרשימה הגדולה</span><em class="flat">${p1(100 * s.p[li] / (s.v || 1))}%</em></div>
    </div>
    <div class="r22-blocs">
      <div class="r22-blocbar" role="img" aria-label="${CAMPS.map(k => `${CAMP_HE[k]} ${p1(camps[k])}%`).join(", ")}">${
        CAMPS.filter(k => camps[k] > 0).map(k => `<span style="flex:${camps[k]};background:${campColor(k)}"></span>`).join("")}
        ${st.nat && !isNat ? `<i class="r22-natmark" style="inset-inline-start:${(natC.R + natC.H).toFixed(2)}%" title="ימין וחרדים בממוצע הארצי: ${p1(natC.R + natC.H)}%"></i>` : ""}</div>
      <ul>${GROUPS.map(k => `<li style="--c:${campColor(k)}"><i></i><span>${CAMP_HE[k]}</span><b>${p1(camps[k])}%</b>${delta(camps[k], natC[k])}</li>`).join("")}</ul>
    </div>`;
}
/* כרטיס התחזית: כל מספר מול אותה יחידה ב־2022 */
function renderForecastKpi() {
  const s = selection(), c = campShares(s), b = share22(s), h = history(s), last = h.v.length - 1;
  const isNat = s === D.nat, kind = { nation: "מחוז", areas: "אזור", cities: "יישוב" }[st.mode];
  const e22 = isNat ? D.E.trends.national.eligible[last] : s.codes.reduce((t, code) => t + (D.E.trends.loc[code]?.e[last] || 0), 0);
  const v22 = h.v[last], turnout = s.e ? 100 * s.t / s.e : 0, lead = leadCamp(s), shift = shiftOf(s);
  const em = (v, unit = "") => v == null ? "" : `<em class="${v >= 0 ? "up" : "down"}" title="מול 2022">${signed(v)}${unit}</em>`;
  const pct = (a, z) => z ? 100 * (a - z) / z : null;
  q("#r22-kpi").innerHTML = `
    <div class="r22-kpi-head"><p class="r22-kicker">תחזית 2026 · ${isNat ? "כל הארץ" : st.sel != null ? kind : "הבחירה"}</p><h3>${escH(s.name)}</h3><p>${n0(s.e)} בעלי זכות בחירה צפויים${e22 ? ` · ${signed(pct(s.e, e22))}% מ־2022` : ""}</p></div>
    <div class="r22-kpis">
      <div><b>${n0(s.v)}</b><span>קולות כשרים צפויים</span>${em(pct(s.v, v22), "%")}</div>
      <div><b>${p1(turnout)}%</b><span>אחוז הצבעה צפוי</span><em class="flat">ממוצע 2019–2022</em></div>
      <div><b style="color:${campColor(shift == null ? lead : shift >= 0 ? "R" : "L")}">${shift == null ? escH(CAMP_HE[lead]) : `${shift >= 0 ? "ימינה" : "שמאלה"} ${p1(Math.abs(shift))}`}</b><span>${shift == null ? "הקבוצה הגדולה" : "תזוזה מ־2022"}</span><em class="flat">${shift == null ? `${p1(c[lead])}%` : "ימין וחרדים יחד, בנקודות"}</em></div>
    </div>
    <div class="r22-blocs">
      <div class="r22-blocbar" role="img" aria-label="${CAMPS.map(k => `${CAMP_HE[k]} ${p1(c[k])}%`).join(", ")}">${
        CAMPS.filter(k => c[k] > 0).map(k => `<span style="flex:${c[k]};background:${campColor(k)}"></span>`).join("")}
        ${b.R != null ? `<i class="r22-natmark" style="inset-inline-start:${(b.R + b.H).toFixed(2)}%" title="ימין וחרדים ב־2022: ${p1(b.R + b.H)}%"></i>` : ""}</div>
      <ul>${GROUPS.map(k => `<li style="--c:${campColor(k)}"><i></i><span>${CAMP_HE[k]}</span><b>${p1(c[k])}%</b>${b[k] == null ? "" : em(c[k] - b[k])}</li>`).join("")}</ul>
    </div>`;
}

/* ---------- גרף הרשימות ---------- */
function renderBars() {
  if (isForecast()) return renderTrend();
  q("#r22-bars-title").textContent = `הקולות לפי רשימה · ${D.E.label}`;
  const s = selection(), isNat = s === D.nat, natS = D.nat.p.map(v => 100 * v / D.nat.v);
  const m = null;
  const shares = s.p.map(v => s.v ? 100 * v / s.v : 0);
  const cmp = st.nat && !isNat;
  const shown = D.parties.map((p, i) => ({ p, v: shares[i], n: natS[i] }))
    .filter(x => !isOther(x.p) && (x.v >= 0.5 || (cmp && x.n >= D.E.threshold && x.v >= 0.1)))
    .sort((x, y) => y.v - x.v).slice(0, 12);
  const top = Math.max(...shown.map(x => Math.max(x.v, cmp ? x.n : 0)), 1), max = top > 40 ? Math.ceil(top / 10) * 10 : Math.ceil(top / 5) * 5;
  q("#r22-bars").innerHTML = `<div class="r22-rows" style="--rows:${shown.length}">${shown.map(x => `
    <div class="r22-row" title="${escH(x.p.name)}: ${p1(x.v)}%${cmp ? ` · ${m ? "2022" : "ארצי"} ${p1(x.n)}%` : ""}">
      <span class="r22-row-name">${escH(x.p.short)}</span>
      <span class="r22-row-track"><span class="r22-row-bar" style="width:${(100 * x.v / max).toFixed(2)}%;background:${x.p.color}"></span>${
        cmp ? `<i class="r22-row-nat" style="inset-inline-start:${(100 * x.n / max).toFixed(2)}%"></i>` : ""}</span>
      <b>${p1(x.v)}%</b></div>`).join("")}</div>`;
  q("#r22-bars-legend").innerHTML = `באחוזים מהקולות${cmp ? ` · <i class="r22-natkey"></i> ממוצע ארצי` : ""}`;
}
/* קו מעוגל שלא חורג מהערכים (Fritsch–Carlson), כמו בגרף הסקרים */
function smoothPath(pts) {
  const n = pts.length;
  if (n < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
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
/* תחזית: איך הבחירה הצביעה מ־2003, וההמשך המקווקו ל־2026 */
function renderTrend() {
  const s = selection(), h = history(s), T = D.E.trends, c = campShares(s);
  const el = q("#r22-bars"), W = Math.max(320, el.clientWidth || 520), H = Math.max(170, el.clientHeight || 240);
  const yr = d => { const t = new Date(d); return t.getFullYear() + (t - new Date(t.getFullYear(), 0, 1)) / 31557600000; };
  const xs = T.meta.elections.map(e => yr(e.date)), x26 = yr(T.meta.target);
  const pad = { r: 44, l: 40, t: 10, b: 24 }, x0 = xs[0], span = x26 - x0;
  const X = t => pad.l + (t - x0) / span * (W - pad.r - pad.l);              // הזמן משמאל לימין, כמו בגרף הסקרים
  const vals = [];
  for (let k = 0; k < xs.length; k++) if (h.v[k]) GROUPS.forEach((g, j) => vals.push(100 * h.g[k][CAMPS.indexOf(g)] / h.v[k]));
  GROUPS.forEach(g => vals.push(c[g]));
  const top = Math.min(100, Math.max(20, Math.ceil(Math.max(...vals) / 10) * 10));
  const Y = v => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const grid = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10).filter(v => top <= 50 || v % 20 === 0)
    .map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="r22-tr-grid"/><text x="${pad.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="r22-tr-ax" text-anchor="end">${v}%</text>`).join("");
  const ticks = T.meta.elections.map((e, k) => ({ x: X(xs[k]), l: e.label.replace("אפריל ", "4.").replace("ספטמבר ", "9.").replace(/^(\d)\.(20)?(\d\d)$/, "$1.$3") }))
    .concat([{ x: X(x26), l: "2026" }]).filter((t, i, a) => i === 0 || Math.abs(t.x - a[i - 1].x) > 26 || i === a.length - 1)
    .map(t => `<text x="${t.x.toFixed(1)}" y="${H - 6}" class="r22-tr-ax" text-anchor="middle">${escH(t.l)}</text>`).join("");
  /* התוויות בקצה: לפחות 12 פיקסלים בין שתיים, כדי שערכים קרובים לא יעלו זה על זה */
  const endY = {};
  GROUPS.map(g => [g, Y(c[g])]).sort((a, b) => a[1] - b[1]).forEach(([g, y], i, a) => { endY[g] = i ? Math.max(y, endY[a[i - 1][0]] + 12) : y; });
  const lines = GROUPS.map(g => {
    const j = CAMPS.indexOf(g), pts = [];
    for (let k = 0; k < xs.length; k++) if (h.v[k]) pts.push([X(xs[k]), Y(100 * h.g[k][j] / h.v[k])]);
    if (!pts.length) return "";
    const last = pts[pts.length - 1], end = [X(x26), Y(c[g])];
    return `<path class="r22-tr-line" d="${smoothPath(pts)}" stroke="${campColor(g)}"/>
      <path class="r22-tr-line r22-tr-proj" d="M${last[0].toFixed(1)} ${last[1].toFixed(1)}L${end[0].toFixed(1)} ${end[1].toFixed(1)}" stroke="${campColor(g)}"/>
      <circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="3.6" fill="${campColor(g)}"/>
      <text x="${(end[0] + 7).toFixed(1)}" y="${(endY[g] + 4).toFixed(1)}" class="r22-tr-end" fill="${campColor(g)}">${p1(c[g])}</text>`;
  }).join("");
  const xEnd = X(xs[xs.length - 1]);
  el.innerHTML = `<svg class="r22-trend" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escH(s.name)}: ${GROUPS.map(g => `${CAMP_HE[g]} ${p1(c[g])}% ב־2026`).join(", ")}">
    <rect x="${xEnd.toFixed(1)}" y="${pad.t}" width="${(X(x26) - xEnd).toFixed(1)}" height="${H - pad.t - pad.b}" class="r22-tr-future"/>
    ${grid}${ticks}${lines}</svg>`;
  q("#r22-bars-title").textContent = `המגמה · ${s.name}`;
  q("#r22-bars-legend").innerHTML = GROUPS.map(g => `<span class="r22-tr-key" style="--c:${campColor(g)}"><i></i>${CAMP_HE[g]}</span>`).join("") + `<span class="r22-tr-key"><span class="r22-tr-dash"></span>2026</span>`;
}

/* ---------- מפה ---------- */
/* היחידות של המפה המתנדנדת: עשיריות ק״מ, צפון למעלה */
const KX = 111.32 * Math.cos(31.5 * Math.PI / 180) * 10, KY = 110.57 * 10;
const proj = (lon, lat) => [(lon - 34) * KX, -(lat - 29) * KY];
const decode = e => { const pts = []; let x = 0, y = 0; for (let i = 0; i < e.length; i += 2) { x += e[i]; y += e[i + 1]; pts.push([x, y]); } return pts; };
const pathOf = pts => "M" + pts.map(p => p.join(" ")).join("L") + "Z";
const MAP = { vb: null, full: null, anim: 0, rings: null };

/* קו החלוקה של "כל הארץ": הגובה שבו שטח המפה שמעליו שווה לחלקו של הגוש העליון */
function polyArea(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a) / 2; }
function clipAbove(pts, Y) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ina = a[1] <= Y, inb = b[1] <= Y;
    if (ina) out.push(a);
    if (ina !== inb) out.push([a[0] + (b[0] - a[0]) * (Y - a[1]) / (b[1] - a[1]), Y]);
  }
  return out;
}
function splitY(share) {
  MAP.split ||= new Map();
  if (MAP.split.has(share)) return MAP.split.get(share);
  const total = MAP.rings.reduce((t, r) => t + polyArea(r), 0);
  let lo = MAP.full[1], hi = MAP.full[1] + MAP.full[3];
  for (let k = 0; k < 36; k++) {
    const mid = (lo + hi) / 2, above = MAP.rings.reduce((t, r) => { const c = clipAbove(r, mid); return t + (c.length > 2 ? polyArea(c) : 0); }, 0);
    if (above / total < share) lo = mid; else hi = mid;
  }
  MAP.split.set(share, (lo + hi) / 2);
  return MAP.split.get(share);
}

function renderMapBase() {
  MAP.rings = D.areas.flatMap(a => a.shape.rings.map(decode));
  const [x0, y0, x1, y1] = D.map.bbox, pad = 10;
  MAP.full = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  MAP.vb = MAP.full.slice();
  const land = MAP.rings.map(pathOf).join("");
  const water = D.map.water.map(e => pathOf(decode(e))).join("");
  q("#r22-map").innerHTML = `<svg viewBox="${MAP.vb.join(" ")}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="מפת ישראל">
    <defs><clipPath id="r22-land-clip"><path d="${land}"/></clipPath></defs>
    <path class="r22-landfill" d="${land}"/>
    <g class="r22-layer"></g>
    ${D.map.terrain ? `<image class="r22-terrain" href="assets/terrain.jpg" x="${D.map.terrain.x}" y="${D.map.terrain.y}" width="${D.map.terrain.w}" height="${D.map.terrain.h}" preserveAspectRatio="none" clip-path="url(#r22-land-clip)"/>` : ""}
    <path class="r22-water" d="${water}"/>
    <g class="r22-top"></g><g class="r22-labels"></g></svg>
    <div class="r22-zoom" role="group" aria-label="זום"><button type="button" data-zoom="in" aria-label="התקרבות">+</button><button type="button" data-zoom="out" aria-label="התרחקות">−</button><button type="button" data-zoom="reset" aria-label="כל המפה">⟲</button></div>
    <div class="r22-tip" role="tooltip" hidden></div>
    <p class="r22-credit">גבולות היישובים: © OpenStreetMap · ${escH(D.map.terrain?.credit || "")}</p>`;
}
const svgEl = () => q("#r22-map svg");
/* יחידות מפה לפיקסל מסך, לפי ערכת התצוגה הנוכחית */
function unitsPerPx() {
  const svg = svgEl(), w = svg?.clientWidth || 300, h = svg?.clientHeight || 600;
  return Math.max(MAP.vb[2] / w, MAP.vb[3] / h);
}

function renderLayer() {
  const svg = svgEl(); if (!svg) return;
  const layer = svg.querySelector(".r22-layer"), top = svg.querySelector(".r22-top"), u = unitsPerPx();
  svg.dataset.mode = st.mode;
  q("#r22-map-legend").innerHTML = GROUPS.map(k => `<span><i style="background:${campColor(k)}"></i>${CAMP_HE[k]}</span>`).join("") + (st.mode === "nation"
    ? (blocVotes(D.nat, ["O"]) ? `<span class="r22-legend-note">${n0(blocVotes(D.nat, ["O"]))} קולות לרשימות אחרות — לא בשום קבוצה</span>` : "")
    : st.mode === "areas" ? `<span class="r22-legend-note">הצבע — הקבוצה המובילה · כהה = יתרון גדול</span>` : `<span class="r22-dimkey"><i></i>מחוץ לסינון</span>`);
  if (st.mode === "nation") {
    /* פס לכל קבוצה, משטח המפה לפי חלקה בקולות — מלמעלה: ימין, חרדים, מרכז־שמאל, ערבים */
    const votes = GROUPS.map(k => blocVotes(D.nat, [k])), tot = votes.reduce((a, b) => a + b, 0), [x, y0, w, h] = MAP.full, cx = x + w * .40;
    const ys = [y0]; let acc = 0;
    votes.slice(0, -1).forEach(v => { acc += v / tot; ys.push(splitY(Math.round(acc * 1e5) / 1e5)); });
    ys.push(y0 + h);
    const fs = 12 * u, fsBig = 20 * u;
    layer.innerHTML = `<g clip-path="url(#r22-land-clip)">${GROUPS.map((k, i) => `<rect x="${x}" y="${ys[i]}" width="${w}" height="${ys[i + 1] - ys[i]}" fill="${campColor(k)}"/>`).join("")}</g>
      ${ys.slice(1, -1).map(Y => `<line x1="${x}" x2="${x + w}" y1="${Y}" y2="${Y}" class="r22-split-line"/>`).join("")}`;
    top.innerHTML = GROUPS.map((k, i) => {
      const yy = (ys[i] + ys[i + 1]) / 2 - .4 * fs;
      if ((ys[i + 1] - ys[i]) / u < 46) return "";
      return `<text x="${cx.toFixed(1)}" y="${yy.toFixed(1)}" class="r22-split-lbl" font-size="${fs.toFixed(2)}" stroke-width="${(3 * u).toFixed(2)}"><tspan x="${cx.toFixed(1)}" font-size="${fsBig.toFixed(2)}" font-weight="800">${n0(votes[i])}</tspan><tspan x="${cx.toFixed(1)}" dy="${(1.4 * fs).toFixed(2)}">${CAMP_HE[k]} · ${p1(100 * votes[i] / D.nat.v)}%</tspan></text>`;
    }).join("");
    renderLabels();
    return;
  }
  if (st.mode === "areas") {
    layer.innerHTML = D.areaRows.map(r => {
      const a = D.areas[r.id], k = leadCamp(r);
      return `<path data-id="${r.id}" d="${a.shape.rings.map(e => pathOf(decode(e))).join("")}" class="r22-area${r.id === st.sel ? " sel" : ""}" style="--c:${campColor(k)};--o:${strength(r)}" aria-label="${escH(r.name)}"></path>`;
    }).join("");
    top.innerHTML = st.sel != null ? `<path d="${D.areas[st.sel].shape.rings.map(e => pathOf(decode(e))).join("")}" class="r22-area-ring"/>` : "";
    renderLabels();
    return;
  }
  layer.innerHTML = "";
  renderDots();
}
/* שמות על המפה: רק כשיש להם מקום על המסך (מתעדכן בכל זום), בלי חפיפות, הגדולים קודם */
const SHORT = { "תל אביב-יפו": "ת״א-יפו", "ראשון לציון": "ראשל״צ", "פתח תקווה": "פ״ת", "מודיעין-מכבים-רעות": "מודיעין" };
function renderLabels() {
  const svg = svgEl(); if (!svg) return;
  const g = svg.querySelector(".r22-labels"), u = unitsPerPx(), [vx, vy, vw, vh] = MAP.vb, placed = [];
  if (st.mode === "nation") { g.innerHTML = ""; return; }
  const items = st.mode === "areas"
    ? D.areaRows.map(r => { const a = D.areas[r.id], pts = a.shape.rings.flatMap(decode), xs = pts.map(p => p[0]);
        return { x: a.shape.label[0], y: a.shape.label[1], w: (Math.max(...xs) - Math.min(...xs)) / u, v: r.v, name: SHORT[a.lead] || a.lead }; })
    : D.localities.filter(l => l.x != null && (!st.sectors.size || st.sectors.has(l.s))).map(l => { const [x, y] = proj(l.x, l.y);
        return { x, y: y - Math.max(1.8, Math.min(12, Math.sqrt(l.v) / 26)) * u - 3 * u, w: Math.sqrt(l.v) / 2.2, v: l.v, name: SHORT[l.n] || l.n }; });
  const fs = 11 * u;
  g.innerHTML = items.filter(it => it.x > vx && it.x < vx + vw && it.y > vy && it.y < vy + vh && it.w >= (st.mode === "areas" ? 46 : 60))
    .sort((a, b) => b.v - a.v).slice(0, st.mode === "areas" ? (MAP.vb[2] < MAP.full[2] * .65 ? 20 : 11) : 40).map(it => {
      const w = it.name.length * .58 * fs, h = 1.3 * fs, box = [it.x - w / 2, it.y - h, it.x + w / 2, it.y + .3 * fs];
      if (placed.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) return "";
      placed.push(box);
      return `<text x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" font-size="${fs.toFixed(2)}" stroke-width="${(2.6 * u).toFixed(2)}">${escH(it.name)}</text>`;
    }).join("");
}
function renderDots() {
  const svg = svgEl(); if (!svg || st.mode !== "cities") return;
  const inSet = new Set(rows().map(r => r.id)), u = unitsPerPx();
  /* יישוב בלי גבול משלו (קיבוץ, מושב): נקודה בגודל קבוע על הקרקע — מתקרבים והיא גדלה,
     אבל לא קטנה מפיקסל וחצי כשרואים את כל הארץ */
  const rad = l => Math.max(1.6 * u, Math.min(18, Math.max(4, Math.sqrt(l.v) * .12)));
  const all = D.localities.filter(l => l.b || l.x != null).sort((a, b) => b.v - a.v), sel = all.find(l => l.c === st.sel);
  const cls = l => `${inSet.has(l.c) ? "on" : "off"}${l.c === st.sel ? " sel" : ""}`;
  const shape = l => `<path data-id="${l.c}" d="${l.b.map(e => pathOf(decode(e))).join("")}" class="r22-city ${cls(l)}" style="--c:${campColor(leadCamp(l))}" aria-label="${escH(l.n)}"/>`;
  const dot = l => { const [x, y] = proj(l.x, l.y); return `<circle data-id="${l.c}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad(l).toFixed(2)}" class="${cls(l)}" style="--c:${campColor(leadCamp(l))}" aria-label="${escH(l.n)}"></circle>`; };
  const draw = l => l.b ? shape(l) : dot(l);
  /* הגבולות קודם (מתחת), הנקודות מעליהם, והנבחר מעל כולם */
  /* גבולות השיפוט של ערי החוף נכנסים לפעמים לים — חותכים אותם בקו החוף */
  const clipLand = h => h && `<g clip-path="url(#r22-land-clip)">${h}</g>`;
  svg.querySelector(".r22-top").innerHTML = clipLand(all.filter(l => l.b && l !== sel).map(draw).join("")) + all.filter(l => !l.b && l !== sel).map(draw).join("") + (sel ? (sel.b ? clipLand(draw(sel)) : draw(sel)) : "");
  renderLabels();
}

/* מיקוד: יישוב — סביבתו; אזור — כולו; סינון אוכלוסייה — היישובים שבו; אחרת — כל הארץ */
function focusMap() {
  const svg = svgEl(); if (!svg) return;
  let target = MAP.full, pts = [];
  if (st.mode === "cities" && st.sel != null) { const l = D.byCode.get(st.sel); pts = l?.b ? l.b.flatMap(decode) : l?.x != null ? [proj(l.x, l.y)] : []; }
  else if (st.mode === "cities" && st.sectors.size) pts = rows().filter(r => r.l.x != null).map(r => proj(r.l.x, r.l.y));
  else if (st.mode === "areas" && st.sel != null) pts = D.areas[st.sel].shape.rings.flatMap(decode);
  if (pts.length) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minSpan = st.mode === "cities" && st.sel != null ? 400 : 250;
    let w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    w = Math.max(w * 1.36, minSpan); h = Math.max(h * 1.36, minSpan);
    const ar = svg.clientWidth / Math.max(1, svg.clientHeight) || MAP.full[2] / MAP.full[3];
    if (w / h < ar) w = h * ar; else h = w / ar;
    target = [cx - w / 2, cy - h / 2, w, h];
  }
  animateTo(target);
}
function setVB(vb) { MAP.vb = vb; svgEl()?.setAttribute("viewBox", vb.map(v => v.toFixed(1)).join(" ")); }
function animateTo(target) {
  const from = MAP.vb.slice(), t0 = performance.now(), dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
  cancelAnimationFrame(MAP.anim);
  const step = now => {
    /* חותמת הזמן של הפריים הראשון יכולה להיות מוקדמת מ־t0 — בלי זה הזום "חוזר אחורה" לרגע ונותן viewBox שלילי */
    const k = dur ? Math.min(1, Math.max(0, (now - t0) / dur)) : 1, e = 1 - Math.pow(1 - k, 3);
    setVB(from.map((v, i) => v + (target[i] - v) * e));
    if (k < 1) MAP.anim = requestAnimationFrame(step); else afterZoom();
  };
  MAP.anim = requestAnimationFrame(step);
}
/* אחרי זום: הנקודות והתוויות חוזרות לגודל קבוע על המסך */
let zoomT;
function afterZoom() { clearTimeout(zoomT); zoomT = setTimeout(() => { if (st.mode === "cities") renderDots(); else if (st.mode === "nation") renderLayer(); else renderLabels(); }, 60); }
/* גלגלת — התקרבות סביב הסמן; גרירה — הזזה; כפתורים — פלוס, מינוס, כל המפה */
function zoomAt(factor, px, py) {
  cancelAnimationFrame(MAP.anim);                    // גלגלת באמצע מעבר — המשתמש קובע
  const svg = svgEl(), rect = svg.getBoundingClientRect(), [x, y, w, h] = MAP.vb;
  const s = Math.min(rect.width / w, rect.height / h), ox = (rect.width - w * s) / 2, oy = (rect.height - h * s) / 2;
  const mx = x + ((px ?? rect.width / 2) - ox) / s, my = y + ((py ?? rect.height / 2) - oy) / s;
  const nw = Math.min(MAP.full[2] * 1.05, Math.max(MAP.full[2] / 40, w / factor)), k = nw / w;
  setVB([mx - (mx - x) * k, my - (my - y) * k, nw, h * k]);
  afterZoom();
}
/* ריחוף על אזור או יישוב: השם מופיע מיד ליד הסמן, עם הקולות והגוש המוביל */
function tipHTML(el) {
  const id = Number(el.dataset.id);
  const r = st.mode === "areas" ? D.areaRows[id] : D.cityRows.find(x => x.id === id);
  if (!r) return "";
  const k = leadCamp(r), li = leadIdx(r);
  if (isForecast()) { const sh = shiftOf(r); return `<b>${escH(r.name)}</b><span>${n0(r.v)} קולות צפויים · ${CAMP_HE[k]} ${p1(campShares(r)[k])}%</span><span>${sh == null ? "יישוב חדש" : Math.abs(sh) < .05 ? "בלי תזוזה מ־2022" : `${sh > 0 ? "ימינה" : "שמאלה"} ${p1(Math.abs(sh))} נק׳ מ־2022`}</span>`; }
  return `<b>${escH(r.name)}</b><span>${n0(r.v)} קולות · ${CAMP_HE[k]} ${p1(campShares(r)[k])}%</span><span>הגדולה: ${escH(D.parties[li].short)} ${p1(100 * r.p[li] / (r.v || 1))}%</span>`;
}
function wireTip(host) {
  const tip = () => host.querySelector(".r22-tip");
  const hide = () => { const t = tip(); if (t) t.hidden = true; };
  host.addEventListener("pointermove", e => {
    const t = tip(), el = e.target.closest?.("[data-id]");
    if (!t || !el || host.classList.contains("dragging") || st.mode === "nation") return hide();
    if (t.dataset.for !== el.dataset.id + st.mode) { t.innerHTML = tipHTML(el); t.dataset.for = el.dataset.id + st.mode; }
    if (!t.innerHTML) return hide();
    t.hidden = false;
    const box = host.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
    if (x + w > box.width - 6) x = e.clientX - box.left - w - 14;
    if (y + h > box.height - 6) y = e.clientY - box.top - h - 14;
    t.style.left = `${Math.max(6, x)}px`; t.style.top = `${Math.max(6, y)}px`;
  });
  host.addEventListener("pointerleave", hide);
  host.addEventListener("wheel", hide, { passive: true });
}
function wireMap() {
  const host = q("#r22-map");
  wireTip(host);
  host.addEventListener("wheel", e => {
    if (!svgEl()?.contains(e.target)) return;
    e.preventDefault();
    const r = svgEl().getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let drag = null;
  host.addEventListener("pointerdown", e => { if (!svgEl()?.contains(e.target) || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: MAP.vb.slice(), moved: false }; });
  window.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; host.classList.add("dragging"); cancelAnimationFrame(MAP.anim); }
    const r = svgEl().getBoundingClientRect(), s = Math.min(r.width / drag.vb[2], r.height / drag.vb[3]);
    setVB([drag.vb[0] - dx / s, drag.vb[1] - dy / s, drag.vb[2], drag.vb[3]]);
  });
  window.addEventListener("pointerup", () => {
    if (drag?.moved) { host.classList.remove("dragging"); host.dataset.justDragged = "1"; setTimeout(() => delete host.dataset.justDragged, 0); }
    drag = null;
  });
  host.addEventListener("click", e => {
    if (host.dataset.justDragged) return;
    const z = e.target.closest("[data-zoom]");
    if (z) return z.dataset.zoom === "reset" ? animateTo(MAP.full) : zoomAt(z.dataset.zoom === "in" ? 1.6 : 1 / 1.6);
    const el = e.target.closest("[data-id]");
    if (el && (st.mode === "areas" || st.mode === "cities")) select(Number(el.dataset.id));
  });
}

/* ---------- הכול יחד ---------- */
/* שולחן עבודה: הלוח ממלא בדיוק את מה שנשאר מתחת לכותרת, כך שאין גלילת עמוד */
function fitHeight() {
  const dash = q("#r22-dash"); if (!dash) return;
  if (innerWidth <= 1000) { dash.style.removeProperty("--r22-h"); return; }
  const top = dash.getBoundingClientRect().top + scrollY;
  dash.style.setProperty("--r22-h", `${Math.max(480, innerHeight - top - 12)}px`);
}
/* הכותרת: מערכת הבחירות שנבחרה, ופס לבחירת כל מערכת מאז 2003 ותחזית 2026 */
const yearShort = e => e.label.replace("אפריל ", "4.").replace("ספטמבר ", "9.");
function renderHead() {
  const fc = isForecast(), cur = YEARS.list.find(e => e.id === st.year);
  q("#r22-heading").textContent = fc ? "תחזית דמוגרפית 2026 · לפי מגמות היישובים" : `בחירות ${cur?.label || st.year} · תוצאות האמת`;
  q("#r22-src").textContent = fc ? "מגמות 2003–2022 · ועדת הבחירות המרכזית · הלמ״ס"
    : Number(st.year.slice(0, 4)) < 2015 ? "ועדת הבחירות המרכזית (דרך הסדנא לידע ציבורי) · הלמ״ס" : "ועדת הבחירות המרכזית · הלמ״ס · אזורי הצבעה מקומיים";
  q("#r22-years").innerHTML = YEARS.list.map(e => `<button type="button" data-year="${e.id}" aria-pressed="${e.id === st.year}" title="${escH(`הבחירות לכנסת ה־${e.knesset} · ${e.label}`)}">${escH(yearShort(e))}</button>`).join("")
    + `<button type="button" data-year="${FORECAST}" class="r22-year-fc" aria-pressed="${fc}">תחזית 2026</button>`;
}
async function setYear(id) {
  if (id === st.year) return;
  const keep = st.sel;
  q("#r22-years")?.setAttribute("aria-busy", "true");
  await applyYear(id);
  q("#r22-years")?.removeAttribute("aria-busy");
  st.sel = keep != null && (st.mode !== "cities" || D.byCode.has(keep)) ? keep : null;
  if (st.sort.key === "lead" || st.sort.key === "shift") st.sort = { key: "v", dir: -1 };
  update({ refocus: false });
}
function update({ refocus = true, side = true } = {}) {
  renderHead();
  fitHeight();
  if (side) renderSide();
  renderTable(); renderKpi(); renderBars(); renderLayer();
  if (refocus) focusMap();
}
function select(id) {
  st.sel = id == null || id === st.sel ? null : id;
  update({ side: false });
  const reset = q("#r22-reset"); if (reset) reset.disabled = st.sel == null && !st.sectors.size;
  if (st.mode === "areas") q(".r22-scroll").scrollTop = 0;
  else if (st.sel != null) q(`#r22-table tr[data-id="${st.sel}"]`)?.scrollIntoView({ block: "nearest" });
}
function selectAreaCity(code) {
  st.mode = "cities"; st.sel = code; st.sectors.clear(); st.sort = { key: "v", dir: -1 };
  update();
  q(`#r22-table tr[data-id="${code}"]`)?.scrollIntoView({ block: "nearest" });
}
function setMode(mode) {
  if (mode === st.mode) return;
  st.mode = mode; st.sel = null; st.sectors.clear(); st.sort = { key: "v", dir: -1 };
  update();
}
function wire() {
  const side = q("#r22-side");
  side.addEventListener("click", e => {
    const m = e.target.closest("[data-mode]"); if (m) return setMode(m.dataset.mode);
    const s = e.target.closest("[data-sector]");
    if (s) { const k = s.dataset.sector; if (!k) st.sectors.clear(); else if (st.sectors.has(k)) st.sectors.delete(k); else st.sectors.add(k); st.sel = null; return update(); }
    if (e.target.closest("#r22-reset")) { st.sel = null; st.sectors.clear(); update(); }
  });
  side.addEventListener("change", e => {
    if (e.target.id === "r22-nat") { st.nat = e.target.checked; return update({ refocus: false, side: false }); }
    if (e.target.id === "r22-find") {
      const v = e.target.value.trim(); if (!v) return select(null);
      const list = st.mode === "areas" ? D.areaRows : D.cityRows;
      const hit = list.find(r => r.name === v) || list.find(r => r.name.startsWith(v)) || list.find(r => r.name.includes(v))
        || (st.mode === "areas" ? D.areaRows.find(r => D.localities.some(l => l.g === r.id && l.n === v)) : null);
      if (hit) { st.sectors.clear(); st.sel = null; select(hit.id); }
    }
  });
  side.addEventListener("search", e => { if (e.target.id === "r22-find" && !e.target.value) select(null); });
  q("#r22-table").addEventListener("click", e => {
    const s = e.target.closest("[data-sort]");
    if (s) { const k = s.dataset.sort, num = cols().find(c => c.key === k)?.num; st.sort = { key: k, dir: st.sort.key === k ? -st.sort.dir : num ? -1 : 1 }; return update({ refocus: false, side: false }); }
    const r = e.target.closest("tr[data-id]"); if (r) areaCities() ? selectAreaCity(Number(r.dataset.id)) : select(Number(r.dataset.id));
  });
  q("#r22-table").addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const r = e.target.closest("tr[data-id]");
    if (r) { e.preventDefault(); areaCities() ? selectAreaCity(Number(r.dataset.id)) : select(Number(r.dataset.id)); }
  });
  q("#r22-years").addEventListener("click", e => { const b = e.target.closest("[data-year]"); if (b) setYear(b.dataset.year).catch(err => console.error(err)); });
  wireMap();
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (q("#view-map")?.classList.contains("on")) { fitHeight(); focusMap(); } }, 150); });
}

let ready = false;
window.renderR22 = async function renderR22() {
  const root = q("#r22-dash"); if (!root) return;
  try {
    await loadData();
    if (/swing|areas/.test(location.hash)) st.mode = "areas";
    if (!ready) { renderMapBase(); wire(); ready = true; }
    update();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<p class="r22-error">לא הצלחנו לטעון את נתוני הבחירות.</p>`;
  }
};
})();
