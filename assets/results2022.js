/* ============================================================
   ברומטר — בחירות 2022: לוח נתונים במסך אחד (#/map)
   ------------------------------------------------------------
   שלוש תצוגות (בעמודה הימנית), כל אחת עם מפה, טבלה, כרטיס וגרף משלה:
     כל הארץ   — המדינה מחולקת בין גוש נתניהו לגוש השינוי לפי הקולות;
                 הטבלה: המחוזות.
     לפי אזורים — אזורי "המפה המתנדנדת" (כ־1% מהקולות כל אחד) צבועים לפי
                 הגוש המוביל ועוצמת היתרון; הטבלה: האזורים.
     לפי ערים   — נקודה לכל יישוב, סינון לפי אוכלוסייה; הטבלה: היישובים.
   כל נתון מופיע במקום אחד: הטבלה — שורה לכל יחידה; הכרטיס — סיכום הבחירה
   והגושים; הגרף — הרשימות; המפה — הגאוגרפיה. המפה מתקרבת בגלגלת וזזה בגרירה.
   הנתונים: data/results-2022.json (scripts/build-results-2022.mjs).
   ============================================================ */
(() => {
"use strict";

const CAMPS = ["R", "L", "A", "O"];
const CAMP_HE = { R: "גוש נתניהו", L: "המתנגדים", A: "הרשימות הערביות", O: "אחרות" };
const CAMP_SHORT = { R: "גוש נתניהו", L: "מתנגדים", A: "ערביות" };
const campColor = k => {
  const b = typeof BLOCS !== "undefined" ? BLOCS : null;
  return { R: b?.Right.color || "#2563B0", L: b?.Left.color || "#C0392B", A: b?.Arabs.color || "#2A7A5E", O: b?.Unknown.color || "#6B7580" }[k];
};
/* עוצמת היתרון של הגוש המוביל (בנקודות אחוז מול השני), כמו במפה המתנדנדת */
const RATING = [[30, 1], [15, .78], [7, .56], [2, .38], [0, .2]];
const nf = new Intl.NumberFormat("he-IL");
const n0 = v => nf.format(Math.round(v));
const p1 = v => (Math.round(v * 10) / 10).toFixed(1);
const signed = v => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${p1(Math.abs(v))}`;
const escH = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const q = s => document.querySelector(s);

let D = null;
const st = { mode: "nation", sel: null, sectors: new Set(), nat: true, sort: { key: "v", dir: -1 } };

async function loadData() {
  if (D) return D;
  const inline = window.__BAROMETER_DATA__?.["data/results-2022.json"];
  D = inline || await fetch("data/results-2022.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("data/results-2022.json"); return r.json(); });
  prepare();
  return D;
}

/* ---------- נתונים מחושבים ---------- */
function prepare() {
  D.campIdx = CAMPS.map(c => D.parties.map((p, i) => p.camp === c ? i : -1).filter(i => i >= 0));
  D.byCode = new Map(D.localities.map(l => [l.c, l]));
  const sum = list => {
    const a = { e: 0, t: 0, v: 0, p: D.parties.map(() => 0), n: list.length };
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
  D.cityRows = D.localities.map(l => ({ id: l.c, name: l.n, sub: D.regions[l.r], sector: D.sectors[l.s], s: l.s, e: l.e, t: l.t, v: l.v, p: l.p, n: 1, l }));
}
const campShares = r => Object.fromEntries(CAMPS.map((c, k) => [c, r.v ? 100 * D.campIdx[k].reduce((t, i) => t + r.p[i], 0) / r.v : 0]));
const leadIdx = r => r.p.reduce((b, x, i) => x > r.p[b] && D.parties[i].id !== "other" ? i : b, 0);
const leadCamp = r => { const c = campShares(r); return ["R", "L", "A"].reduce((b, k) => c[k] > c[b] ? k : b, "R"); };
const margin = r => { const c = campShares(r), v = ["R", "L", "A"].map(k => c[k]).sort((a, b) => b - a); return v[0] - v[1]; };
const strength = r => RATING.find(([m]) => margin(r) >= m)[1];
const blocVotes = (r, ks) => ks.reduce((t, k) => t + D.campIdx[CAMPS.indexOf(k)].reduce((s, i) => s + r.p[i], 0), 0);

/* ---------- התצוגה הנוכחית ---------- */
function rows() {
  if (st.mode === "nation") return D.districtRows;
  if (st.mode === "areas") return D.areaRows;
  return D.cityRows.filter(r => !st.sectors.size || st.sectors.has(r.s));
}
function selection() {
  const sel = st.sel == null ? null : st.mode === "nation" ? D.districtRows[st.sel] : st.mode === "areas" ? D.areaRows[st.sel] : D.cityRows.find(r => r.id === st.sel);
  if (sel) return sel;
  if (st.mode === "cities" && st.sectors.size) return { name: [...st.sectors].map(s => D.sectors[s]).join(", "), ...D.sum(rows().map(r => r.l)) };
  return D.nat;
}

/* ---------- העמודה הימנית ---------- */
const MODES = [
  ["nation", "כל הארץ", "גוש מול גוש"],
  ["areas", "לפי אזורים", "המפה המתנדנדת"],
  ["cities", "לפי ערים", "כל יישוב בנפרד"]
];
function renderSide() {
  const sub = { nation: `${D.districts.length} מחוזות`, areas: `${D.areas.length} אזורים`, cities: `${n0(D.localities.length)} יישובים` };
  q("#r22-side").innerHTML = `
    <div class="r22-modes" role="group" aria-label="תצוגה">${MODES.map(([k, he, note]) =>
      `<button type="button" data-mode="${k}" aria-pressed="${st.mode === k}"><b>${he}</b><small>${note} · ${sub[k]}</small></button>`).join("")}</div>
    <div class="r22-mode-controls">${modeControls()}</div>
    <label class="r22-toggle"><input type="checkbox" id="r22-nat" ${st.nat ? "checked" : ""}><span>השוואה לממוצע הארצי</span></label>
    <button type="button" class="r22-reset" id="r22-reset" ${st.sel == null && !st.sectors.size ? "disabled" : ""}>ניקוי הבחירה</button>
    <p class="r22-rule">${st.mode === "cities" ? escH(D.meta.sectorRule) : st.mode === "areas"
      ? "כל אזור — כ־1% מהקולות: עיר גדולה לבדה, או יישובים סמוכים מאותו אזור טבעי ומאותו מגזר. גוון הצבע — גודל היתרון של הגוש המוביל."
      : "גוש נתניהו — הליכוד, הציונות הדתית, ש״ס ויהדות התורה. גוש השינוי — שמונה הרשימות שמולו, כולל הערביות. הקו מחלק את שטח המפה לפי הקולות."}</p>`;
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
  const R = blocVotes(D.nat, ["R"]), C = blocVotes(D.nat, ["L", "A"]);
  return `<div class="r22-duel"><div style="--c:${campColor("R")}"><b>${n0(R)}</b><span>גוש נתניהו</span></div><div style="--c:${campColor("L")}"><b>${n0(C)}</b><span>גוש השינוי</span></div>
    <p>פער של ${n0(Math.abs(C - R))} קולות — ${C > R ? "לטובת גוש השינוי" : "לטובת גוש נתניהו"}, ובכל זאת גוש נתניהו קיבל 64 מנדטים.</p></div>`;
}

/* ---------- טבלה ---------- */
const campCell = k => ({ key: k, he: CAMP_SHORT[k], num: true, val: r => campShares(r)[k],
  cell: r => { const v = campShares(r)[k]; return `<td class="n r22-camp" style="--c:${campColor(k)};--w:${v.toFixed(1)}%"><span>${p1(v)}%</span></td>`; } });
const leadCell = { key: "lead", he: "הגדולה", title: "הרשימה הגדולה", val: r => D.parties[leadIdx(r)].short,
  cell: r => { const p = D.parties[leadIdx(r)]; return `<td class="r22-lead"><i class="r22-sw" style="--c:${p.color}"></i>${escH(p.short)}</td>`; } };
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
const cols = () => [...COLS[st.mode](), ...NUM_COLS, campCell("R"), campCell("L"), campCell("A"), leadCell];
function renderTable() {
  const C = cols(), col = C.find(c => c.key === st.sort.key) || C.find(c => c.key === "v");
  const list = rows().slice().sort((a, b) => {
    const x = col.val(a), y = col.val(b);
    return (typeof x === "string" ? x.localeCompare(y, "he") : x - y) * st.sort.dir || b.v - a.v;
  });
  const sel = st.sel == null ? -1 : list.findIndex(r => r.id === st.sel);
  if (sel > 0) list.unshift(list.splice(sel, 1)[0]);
  if (st.mode === "nation") list.push(D.envelopes);
  q("#r22-table-title").textContent = { nation: "המחוזות", areas: "האזורים", cities: "היישובים" }[st.mode];
  q("#r22-table").innerHTML = `<thead><tr>${C.map(c => {
    const on = c.key === col.key;
    return `<th scope="col" class="${c.num ? "n" : ""}" aria-sort="${on ? (st.sort.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${c.key}"${c.title ? ` title="${escH(c.title)}"` : ""}>${escH(c.he)}${on ? `<i aria-hidden="true">${st.sort.dir > 0 ? "▲" : "▼"}</i>` : ""}</button></th>`;
  }).join("")}</tr></thead><tbody>${list.map(r =>
    `<tr ${r.fixed ? 'class="r22-fixed"' : `data-id="${r.id}" class="${r.id === st.sel ? "is-sel" : ""}"`}>${C.map(c => c.cell(r)).join("")}</tr>`).join("")}</tbody>`;
  const shown = rows();
  q("#r22-count").textContent = st.mode === "cities" ? `${n0(shown.length)} יישובים · ${n0(shown.reduce((t, r) => t + r.v, 0))} קולות` : `${shown.length} שורות · לחצו לבחירה`;
}

/* ---------- כרטיס הבחירה ---------- */
function renderKpi() {
  const s = selection(), camps = campShares(s), natC = campShares(D.nat);
  const isNat = s === D.nat, turnout = s.e ? 100 * s.t / s.e : 0, li = leadIdx(s);
  const delta = (v, ref) => st.nat && !isNat ? `<em class="${v - ref >= 0 ? "up" : "down"}" title="מול הממוצע הארצי">${signed(v - ref)}</em>` : "";
  const kind = { nation: "מחוז", areas: "אזור", cities: "יישוב" }[st.mode];
  const subline = isNat ? `${n0(s.n)} יישובים ומעטפות חיצוניות` : st.sel == null ? `${n0(s.n)} יישובים`
    : st.mode === "cities" ? `${escH(s.sub)} · ${escH(s.sector)}` : `${n0(s.n)} יישובים${s.sub ? ` · ${escH(s.sub)}` : ""}`;
  q("#r22-kpi").innerHTML = `
    <div class="r22-kpi-head"><p class="r22-kicker">${isNat ? "התוצאה הרשמית" : st.sel != null ? kind : "הבחירה"}</p><h3>${escH(s.name)}</h3><p>${subline} · ${n0(s.e)} בעלי זכות בחירה</p></div>
    <div class="r22-kpis">
      <div><b>${n0(s.v)}</b><span>קולות כשרים</span>${st.nat && !isNat ? `<em class="flat">${p1(100 * s.v / D.nat.v)}% מהארץ</em>` : ""}</div>
      <div title="${isNat ? "כולל המעטפות החיצוניות" : `הממוצע להשוואה: ${p1(D.locTurnout)}% — ביישובים, בלי המעטפות החיצוניות (הרשמי: ${p1(100 * D.nat.t / D.nat.e)}%)`}"><b>${p1(turnout)}%</b><span>אחוז הצבעה</span>${delta(turnout, D.locTurnout)}</div>
      <div><b style="color:${D.parties[li].color}">${escH(D.parties[li].short)}</b><span>הרשימה הגדולה</span><em class="flat">${p1(100 * s.p[li] / (s.v || 1))}%</em></div>
    </div>
    <div class="r22-blocs">
      <div class="r22-blocbar" role="img" aria-label="${CAMPS.map(k => `${CAMP_HE[k]} ${p1(camps[k])}%`).join(", ")}">${
        CAMPS.filter(k => camps[k] > 0).map(k => `<span style="flex:${camps[k]};background:${campColor(k)}"></span>`).join("")}
        ${st.nat && !isNat ? `<i class="r22-natmark" style="inset-inline-start:${natC.R.toFixed(2)}%" title="גוש נתניהו בממוצע הארצי: ${p1(natC.R)}%"></i>` : ""}</div>
      <ul>${["R", "L", "A"].map(k => `<li style="--c:${campColor(k)}"><i></i><span>${CAMP_HE[k]}</span><b>${p1(camps[k])}%</b>${delta(camps[k], natC[k])}</li>`).join("")}</ul>
    </div>`;
}

/* ---------- גרף הרשימות ---------- */
function renderBars() {
  const s = selection(), isNat = s === D.nat, natS = D.nat.p.map(v => 100 * v / D.nat.v);
  const shares = s.p.map(v => s.v ? 100 * v / s.v : 0), cmp = st.nat && !isNat;
  const shown = D.parties.map((p, i) => ({ p, v: shares[i], n: natS[i] }))
    .filter(x => x.p.id !== "other" && (x.v >= 0.5 || (cmp && x.n >= 3.25 && x.v >= 0.1)))
    .sort((x, y) => y.v - x.v).slice(0, 12);
  const top = Math.max(...shown.map(x => Math.max(x.v, cmp ? x.n : 0)), 1), max = top > 40 ? Math.ceil(top / 10) * 10 : Math.ceil(top / 5) * 5;
  q("#r22-bars").innerHTML = `<div class="r22-rows" style="--rows:${shown.length}">${shown.map(x => `
    <div class="r22-row" title="${escH(x.p.name)}: ${p1(x.v)}%${cmp ? ` · ארצי ${p1(x.n)}%` : ""}">
      <span class="r22-row-name">${escH(x.p.short)}</span>
      <span class="r22-row-track"><span class="r22-row-bar" style="width:${(100 * x.v / max).toFixed(2)}%;background:${x.p.color}"></span>${
        cmp ? `<i class="r22-row-nat" style="inset-inline-start:${(100 * x.n / max).toFixed(2)}%"></i>` : ""}</span>
      <b>${p1(x.v)}%</b></div>`).join("")}</div>`;
  q("#r22-bars-legend").innerHTML = `באחוזים מהקולות${cmp ? ` · <i class="r22-natkey"></i> ממוצע ארצי` : ""}`;
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
  if (MAP.split?.share === share) return MAP.split.y;
  const total = MAP.rings.reduce((t, r) => t + polyArea(r), 0);
  let lo = MAP.full[1], hi = MAP.full[1] + MAP.full[3];
  for (let k = 0; k < 36; k++) {
    const mid = (lo + hi) / 2, above = MAP.rings.reduce((t, r) => { const c = clipAbove(r, mid); return t + (c.length > 2 ? polyArea(c) : 0); }, 0);
    if (above / total < share) lo = mid; else hi = mid;
  }
  MAP.split = { share, y: (lo + hi) / 2 };
  return MAP.split.y;
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
    <path class="r22-water" d="${water}"/>
    <g class="r22-top"></g><g class="r22-labels"></g></svg>
    <div class="r22-zoom" role="group" aria-label="זום"><button type="button" data-zoom="in" aria-label="התקרבות">+</button><button type="button" data-zoom="out" aria-label="התרחקות">−</button><button type="button" data-zoom="reset" aria-label="כל המפה">⟲</button></div>`;
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
  q("#r22-map-legend").innerHTML = st.mode === "nation"
    ? `<span><i style="background:${campColor("R")}"></i>גוש נתניהו</span><span><i style="background:${campColor("L")}"></i>גוש השינוי</span><span class="r22-legend-note">${n0(blocVotes(D.nat, ["O"]))} קולות לרשימות אחרות — לא בשום גוש</span>`
    : ["R", "L", "A"].map(k => `<span><i style="background:${campColor(k)}"></i>${CAMP_HE[k]} מוביל</span>`).join("") +
      (st.mode === "areas" ? `<span class="r22-legend-note">כהה = יתרון גדול · בהיר = צמוד</span>` : `<span class="r22-dimkey"><i></i>מחוץ לסינון</span>`);
  if (st.mode === "nation") {
    const R = blocVotes(D.nat, ["R"]), C = blocVotes(D.nat, ["L", "A"]);
    const Y = splitY(R / (R + C)), [x, y0, w, h] = MAP.full, cx = x + w * .40;
    const fs = 13 * u, fsBig = 24 * u;
    const label = (yy, name, votes, pct) => `<text x="${cx.toFixed(1)}" y="${yy.toFixed(1)}" class="r22-split-lbl" font-size="${fs.toFixed(2)}" stroke-width="${(3 * u).toFixed(2)}"><tspan x="${cx.toFixed(1)}" font-size="${fsBig.toFixed(2)}" font-weight="800">${n0(votes)}</tspan><tspan x="${cx.toFixed(1)}" dy="${(1.45 * fs).toFixed(2)}">${name} · ${p1(pct)}%</tspan></text>`;
    layer.innerHTML = `<g clip-path="url(#r22-land-clip)"><rect x="${x}" y="${y0}" width="${w}" height="${Y - y0}" fill="${campColor("R")}"/><rect x="${x}" y="${Y}" width="${w}" height="${y0 + h - Y}" fill="${campColor("L")}"/></g>
      <line x1="${x}" x2="${x + w}" y1="${Y}" y2="${Y}" class="r22-split-line"/>`;
    top.innerHTML = label(y0 + (Y - y0) * .5, "גוש נתניהו", R, 100 * R / D.nat.v) + label(Y + (y0 + h - Y) * .2, "גוש השינוי", C, 100 * C / D.nat.v);
    renderLabels();
    return;
  }
  if (st.mode === "areas") {
    layer.innerHTML = D.areaRows.map(r => {
      const a = D.areas[r.id], k = leadCamp(r);
      return `<path data-id="${r.id}" d="${a.shape.rings.map(e => pathOf(decode(e))).join("")}" class="r22-area${r.id === st.sel ? " sel" : ""}" style="--c:${campColor(k)};--o:${strength(r)}"><title>${escH(r.name)} · ${n0(r.v)} קולות · ${CAMP_HE[k]} ${p1(campShares(r)[k])}%</title></path>`;
    }).join("");
    top.innerHTML = st.sel != null ? `<path d="${D.areas[st.sel].shape.rings.map(e => pathOf(decode(e))).join("")}" class="r22-area-ring"/>` : "";
    renderLabels();
    return;
  }
  layer.innerHTML = "";
  renderDots();
}
/* שמות על המפה: רק כשיש להם מקום על המסך (מתעדכן בכל זום), בלי חפיפות, הגדולים קודם */
const SHORT = { "תל אביב-יפו": "ת״א-יפו", "ראשון לציון": "ראשל״צ", "פתח תקווה": "פ״ת", "באר שבע": "ב״ש", "מודיעין-מכבים-רעות": "מודיעין" };
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
    .sort((a, b) => b.v - a.v).map(it => {
      const w = it.name.length * .58 * fs, h = 1.3 * fs, box = [it.x - w / 2, it.y - h, it.x + w / 2, it.y + .3 * fs];
      if (placed.some(o => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) return "";
      placed.push(box);
      return `<text x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" font-size="${fs.toFixed(2)}" stroke-width="${(2.6 * u).toFixed(2)}">${escH(it.name)}</text>`;
    }).join("");
}
function renderDots() {
  const svg = svgEl(); if (!svg || st.mode !== "cities") return;
  const inSet = new Set(rows().map(r => r.id)), u = unitsPerPx();
  const rad = l => Math.max(1.8, Math.min(12, Math.sqrt(l.v) / 26)) * u;
  const dots = D.localities.filter(l => l.x != null).sort((a, b) => b.v - a.v), sel = dots.find(l => l.c === st.sel);
  const dot = l => { const [x, y] = proj(l.x, l.y), li = leadIdx(l); return `<circle data-id="${l.c}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad(l).toFixed(2)}" class="${inSet.has(l.c) ? "on" : "off"}${l.c === st.sel ? " sel" : ""}" style="--c:${campColor(leadCamp(l))}"><title>${escH(l.n)} · ${n0(l.v)} קולות · ${escH(D.parties[li].short)} ${p1(100 * l.p[li] / (l.v || 1))}%</title></circle>`; };
  svg.querySelector(".r22-top").innerHTML = dots.filter(l => l !== sel).map(dot).join("") + (sel ? dot(sel) : "");
  renderLabels();
}

/* מיקוד: יישוב — סביבתו; אזור — כולו; סינון אוכלוסייה — היישובים שבו; אחרת — כל הארץ */
function focusMap() {
  const svg = svgEl(); if (!svg) return;
  let target = MAP.full, pts = [];
  if (st.mode === "cities" && st.sel != null) { const l = D.byCode.get(st.sel); if (l?.x != null) pts = [proj(l.x, l.y)]; }
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
    const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
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
function wireMap() {
  const host = q("#r22-map");
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
function update({ refocus = true, side = true } = {}) {
  fitHeight();
  if (side) renderSide();
  renderTable(); renderKpi(); renderBars(); renderLayer();
  if (refocus) focusMap();
}
function select(id) {
  st.sel = id == null || id === st.sel ? null : id;
  update({ side: false });
  const reset = q("#r22-reset"); if (reset) reset.disabled = st.sel == null && !st.sectors.size;
  if (st.sel != null) q(`#r22-table tr[data-id="${st.sel}"]`)?.scrollIntoView({ block: "nearest" });
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
    const r = e.target.closest("tr[data-id]"); if (r) select(Number(r.dataset.id));
  });
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
