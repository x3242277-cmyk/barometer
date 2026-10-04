/* ============================================================
   ברומטר — בחירות 2022: לוח נתונים לפי יישוב (#/map)
   ------------------------------------------------------------
   מסך אחד: סינון (עיר · אזור · אוכלוסייה · ממוצע ארצי) ← טבלת היישובים,
   תמונת הבחירה, הקולות לפי רשימה, ומפה. כל נתון מופיע במקום אחד בלבד:
   הטבלה — שורה לכל יישוב; הכרטיס — סיכום הבחירה והגושים; הגרף — הרשימות;
   המפה — הגאוגרפיה.
   הנתונים: data/results-2022.json (scripts/build-results-2022.mjs).
   ============================================================ */
(() => {
"use strict";

const CAMPS = ["R", "L", "A", "O"];
const CAMP_HE = { R: "גוש נתניהו", L: "המתנגדים", A: "הרשימות הערביות", O: "אחרות" };
const campColor = k => {
  const b = typeof BLOCS !== "undefined" ? BLOCS : null;
  return { R: b?.Right.color || "#2563B0", L: b?.Left.color || "#C0392B", A: b?.Arabs.color || "#2A7A5E", O: b?.Unknown.color || "#6B7580" }[k];
};
const nf = new Intl.NumberFormat("he-IL");
const n0 = v => nf.format(Math.round(v));
const p1 = v => (Math.round(v * 10) / 10).toFixed(1);
const signed = v => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${p1(Math.abs(v))}`;
const escH = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const q = s => document.querySelector(s);

let D = null;                                       // data/results-2022.json
const st = { city: null, district: null, region: null, sectors: new Set(), nat: true, sort: { key: "v", dir: -1 } };

async function loadData() {
  if (D) return D;
  const inline = window.__BAROMETER_DATA__?.["data/results-2022.json"];
  if (inline) return (D = inline);
  const r = await fetch("data/results-2022.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("data/results-2022.json");
  return (D = await r.json());
}

/* ---------- חישובים ---------- */
const campIdx = () => D._camp ||= CAMPS.map(c => D.parties.map((p, i) => p.camp === c ? i : -1).filter(i => i >= 0));
function campShares(votes, valid) {
  return Object.fromEntries(CAMPS.map((c, k) => [c, valid ? 100 * campIdx()[k].reduce((t, i) => t + votes[i], 0) / valid : 0]));
}
function aggregate(list) {
  const a = { e: 0, t: 0, v: 0, p: D.parties.map(() => 0), n: list.length };
  for (const l of list) { a.e += l.e; a.t += l.t; a.v += l.v; l.p.forEach((x, i) => a.p[i] += x); }
  return a;
}
/* ממוצע ארצי: אחוזי הרשימות — התוצאה הרשמית (כולל המעטפות החיצוניות). אחוז ההצבעה —
   של היישובים בלבד: קולות המעטפות (חיילים, נציגויות) אינם משויכים ליישוב, ולכן
   השוואת יישוב ל־70.6% הרשמי הייתה מנמיכה כל יישוב באופן מלאכותי. */
function nationalRef() {
  if (D._nat) return D._nat;
  const loc = aggregate(D.localities);
  return (D._nat = { shares: D.national.votes.map(v => 100 * v / D.national.valid), camps: campShares(D.national.votes, D.national.valid),
    turnout: 100 * loc.t / loc.e, turnoutOfficial: 100 * D.national.voted / D.national.eligible, valid: D.national.valid });
}
const lead = l => l.p.reduce((b, x, i) => x > l.p[b] ? i : b, 0);
const leadCamp = l => { const c = campShares(l.p, l.v); return CAMPS.reduce((b, k) => c[k] > c[b] ? k : b, "R"); };

function filtered() {
  return D.localities.filter(l =>
    (st.district == null || l.d === st.district) &&
    (st.region == null || l.r === st.region) &&
    (!st.sectors.size || st.sectors.has(l.s)));
}
function selectionLabel(list) {
  if (st.city != null) return D.localities.find(l => l.c === st.city)?.n || "";
  const parts = [];
  if (st.region != null) parts.push(D.regions[st.region]);
  else if (st.district != null) parts.push(`מחוז ${D.districts[st.district]}`.replace("מחוז אזור ", ""));
  if (st.sectors.size) parts.push([...st.sectors].map(s => D.sectors[s]).join(", "));
  return parts.join(" · ") || "כל הארץ";
}

/* ---------- סינון ---------- */
function renderFilters() {
  q("#r22-city-list").innerHTML = D.localities.map(l => `<option value="${escH(l.n)}"></option>`).join("");
  const byDistrict = D.districts.map((name, d) => ({ d, name, regions: D.regions.map((r, i) => ({ r, i })).filter(x => D.regionDistrict[x.i] === d).sort((a, b) => a.r.localeCompare(b.r, "he")) }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  q("#r22-region").innerHTML = `<option value="">כל הארץ</option>` + byDistrict.map(g =>
    `<optgroup label="${escH(g.name)}"><option value="d:${g.d}">כל ${escH(/^אזור /.test(g.name) ? g.name : "מחוז " + g.name)}</option>${
      g.regions.map(x => `<option value="r:${x.i}">${escH(x.r)}</option>`).join("")}</optgroup>`).join("");
  const counts = Object.fromEntries(Object.keys(D.sectors).map(k => [k, D.localities.filter(l => l.s === k).length]));
  q("#r22-sector").innerHTML = `<button type="button" data-sector="" aria-pressed="true">הכול</button>` +
    Object.entries(D.sectors).map(([k, he]) => `<button type="button" data-sector="${k}" aria-pressed="false" title="${counts[k]} יישובים">${escH(he)}</button>`).join("");
  q("#r22-rule").textContent = D.meta.sectorRule;
}
function syncFilterControls() {
  q("#r22-region").value = st.region != null ? `r:${st.region}` : st.district != null ? `d:${st.district}` : "";
  document.querySelectorAll("#r22-sector [data-sector]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.sector ? st.sectors.has(b.dataset.sector) : !st.sectors.size)));
  q("#r22-nat").checked = st.nat;
  const c = st.city != null ? D.localities.find(l => l.c === st.city) : null;
  if (document.activeElement !== q("#r22-city")) q("#r22-city").value = c ? c.n : "";
  q("#r22-reset").disabled = st.city == null && st.district == null && st.region == null && !st.sectors.size;
}

/* ---------- טבלה ---------- */
const COLS = [
  { key: "n", he: "יישוב", val: l => l.n, cell: l => `<th scope="row">${escH(l.n)}</th>` },
  { key: "r", he: "אזור", val: l => D.regions[l.r], cell: l => `<td class="r22-dim">${escH(D.regions[l.r])}</td>` },
  { key: "s", he: "אוכלוסייה", val: l => D.sectors[l.s], cell: l => `<td class="r22-dim">${escH(D.sectors[l.s])}</td>` },
  { key: "v", he: "קולות", title: "קולות כשרים", num: true, val: l => l.v, cell: l => `<td class="n">${n0(l.v)}</td>` },
  { key: "to", he: "הצבעה", title: "אחוז הצבעה", num: true, val: l => l.e ? l.t / l.e : 0, cell: l => `<td class="n">${l.e ? p1(100 * l.t / l.e) + "%" : "—"}</td>` },
  ...["R", "L", "A"].map(k => ({ key: k, he: { R: "גוש נתניהו", L: "מתנגדים", A: "ערביות" }[k], num: true, camp: k, val: l => campShares(l.p, l.v)[k],
    cell: l => { const v = campShares(l.p, l.v)[k]; return `<td class="n r22-camp" style="--c:${campColor(k)};--w:${v.toFixed(1)}%"><span>${p1(v)}%</span></td>`; } })),
  { key: "lead", he: "הגדולה", title: "הרשימה הגדולה ביישוב", val: l => D.parties[lead(l)].short, cell: l => { const p = D.parties[lead(l)]; return `<td class="r22-lead"><i class="r22-sw" style="--c:${p.color}"></i>${escH(p.short)}</td>`; } }
];
function renderTable(list) {
  const col = COLS.find(c => c.key === st.sort.key) || COLS[3];
  const rows = list.slice().sort((a, b) => {
    const x = col.val(a), y = col.val(b);
    return (typeof x === "string" ? x.localeCompare(y, "he") : x - y) * st.sort.dir || b.v - a.v;
  });
  const city = st.city != null ? D.localities.find(l => l.c === st.city) : null;
  if (city) { const i = rows.indexOf(city); if (i >= 0) rows.splice(i, 1); rows.unshift(city); }
  q("#r22-table").innerHTML = `<thead><tr>${COLS.map(c => {
    const on = c.key === col.key, sort = on ? (st.sort.dir > 0 ? "ascending" : "descending") : "none";
    return `<th scope="col" class="${c.num ? "n" : ""}" aria-sort="${sort}"><button type="button" data-sort="${c.key}"${c.title ? ` title="${escH(c.title)}"` : ""}>${escH(c.he)}${on ? `<i aria-hidden="true">${st.sort.dir > 0 ? "▲" : "▼"}</i>` : ""}</button></th>`;
  }).join("")}</tr></thead><tbody>${rows.map(l =>
    `<tr data-city="${l.c}" class="${l.c === st.city ? "is-sel" : ""}" tabindex="-1">${COLS.map(c => c.cell(l)).join("")}</tr>`).join("")}</tbody>`;
  const a = aggregate(list);
  q("#r22-count").textContent = `${n0(list.length)} יישובים · ${n0(a.v)} קולות`;
}

/* ---------- כרטיס הבחירה ---------- */
function renderKpi(list) {
  const sel = st.city != null ? [D.localities.find(l => l.c === st.city)] : list;
  const a = aggregate(sel), nat = nationalRef(), camps = campShares(a.p, a.v);
  const turnout = a.e ? 100 * a.t / a.e : 0, li = a.p.reduce((b, x, i) => x > a.p[b] ? i : b, 0);
  const delta = (v, ref) => st.nat ? `<em class="${v - ref >= 0 ? "up" : "down"}" title="מול הממוצע הארצי">${signed(v - ref)}</em>` : "";
  q("#r22-kpi").innerHTML = `
    <div class="r22-kpi-head"><p class="r22-kicker">${st.city != null ? "יישוב" : "הבחירה"}</p><h3>${escH(selectionLabel(list))}</h3>
      <p>${st.city != null ? `${escH(D.regions[sel[0].r])} · ${escH(D.sectors[sel[0].s])}` : `${n0(a.n)} יישובים`} · ${n0(a.e)} בעלי זכות בחירה</p></div>
    <div class="r22-kpis">
      <div><b>${n0(a.v)}</b><span>קולות כשרים</span>${st.nat ? `<em class="flat">${p1(100 * a.v / nat.valid)}% מהארץ</em>` : ""}</div>
      <div title="הממוצע להשוואה: ${p1(nat.turnout)}% — אחוז ההצבעה ביישובים, בלי המעטפות החיצוניות (הרשמי: ${p1(nat.turnoutOfficial)}%)"><b>${p1(turnout)}%</b><span>אחוז הצבעה</span>${delta(turnout, nat.turnout)}</div>
      <div><b style="color:${D.parties[li].color}">${escH(D.parties[li].short)}</b><span>הרשימה הגדולה</span><em class="flat">${p1(100 * a.p[li] / (a.v || 1))}%</em></div>
    </div>
    <div class="r22-blocs">
      <div class="r22-blocbar" role="img" aria-label="${CAMPS.map(k => `${CAMP_HE[k]} ${p1(camps[k])}%`).join(", ")}">${
        CAMPS.filter(k => camps[k] > 0).map(k => `<span style="flex:${camps[k]};background:${campColor(k)}"></span>`).join("")}
        ${st.nat ? `<i class="r22-natmark" style="inset-inline-start:${nat.camps.R.toFixed(2)}%" title="גוש נתניהו בממוצע הארצי: ${p1(nat.camps.R)}%"></i>` : ""}</div>
      <ul>${["R", "L", "A"].map(k => `<li style="--c:${campColor(k)}"><i></i><span>${CAMP_HE[k]}</span><b>${p1(camps[k])}%</b>${delta(camps[k], nat.camps[k])}</li>`).join("")}</ul>
    </div>
    ${st.nat ? `<p class="r22-foot">ממוצע ארצי: אחוזי הגושים — התוצאה הרשמית; אחוז ההצבעה — ${p1(nat.turnout)}% ביישובים (הרשמי, כולל המעטפות החיצוניות: ${p1(nat.turnoutOfficial)}%).</p>` : ""}`;
}

/* ---------- גרף הרשימות ---------- */
function renderBars(list) {
  const sel = st.city != null ? [D.localities.find(l => l.c === st.city)] : list;
  const a = aggregate(sel), nat = nationalRef();
  const shares = a.p.map(v => a.v ? 100 * v / a.v : 0);
  const shown = D.parties.map((p, i) => ({ p, i, v: shares[i], n: nat.shares[i] }))
    .filter(x => x.p.id !== "other" && (x.v >= 0.5 || (st.nat && x.n >= 3.25 && x.v >= 0.1)))
    .sort((x, y) => y.v - x.v).slice(0, 12);
  const top = Math.max(...shown.map(x => Math.max(x.v, st.nat ? x.n : 0)), 1);
  const max = top > 40 ? Math.ceil(top / 10) * 10 : Math.ceil(top / 5) * 5;
  q("#r22-bars").innerHTML = `<div class="r22-rows" style="--rows:${shown.length}">${shown.map(x => `
    <div class="r22-row" title="${escH(x.p.name)}: ${p1(x.v)}%${st.nat ? ` · ארצי ${p1(x.n)}%` : ""}">
      <span class="r22-row-name">${escH(x.p.short)}</span>
      <span class="r22-row-track"><span class="r22-row-bar" style="width:${(100 * x.v / max).toFixed(2)}%;background:${x.p.color}"></span>${
        st.nat ? `<i class="r22-row-nat" style="inset-inline-start:${(100 * x.n / max).toFixed(2)}%"></i>` : ""}</span>
      <b>${p1(x.v)}%</b></div>`).join("")}</div>`;
  q("#r22-bars-legend").innerHTML = `באחוזים מהקולות${st.nat ? ` · <i class="r22-natkey"></i> ממוצע ארצי` : ""}`;
}

/* ---------- מפה ---------- */
const MAP = { vb: null, full: null, anim: 0 };
const proj = (lon, lat) => [(lon - 34) * 100 * Math.cos(31.5 * Math.PI / 180), (33.5 - lat) * 100];
function renderMapBase() {
  const G = S.regions.geo;
  const path = ring => "M" + ring.map(([lon, lat]) => proj(lon, lat).map(v => v.toFixed(2)).join(" ")).join("L") + "Z";
  const shapes = (key, cls) => { const g = G[key]; if (!g?.length) return ""; const rings = Array.isArray(g[0][0]) ? g : [g]; return rings.map(r => `<path class="${cls}" d="${path(r)}"/>`).join(""); };
  const pts = G.israel.concat(G.westbank || []).map(([lon, lat]) => proj(lon, lat));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  MAP.full = [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...ys) - Math.min(...ys) + 8];
  MAP.vb = MAP.full.slice();
  q("#r22-map").innerHTML = `<svg viewBox="${MAP.vb.join(" ")}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="מפת היישובים">
    <g class="r22-land">${shapes("westbank", "ws")}${shapes("gaza", "gz")}${shapes("israel", "il")}${shapes("kinneret", "water")}${shapes("deadsea", "water")}</g>
    <g class="r22-dots"></g></svg>`;
  q("#r22-map-legend").innerHTML = ["R", "L", "A"].map(k => `<span><i style="background:${campColor(k)}"></i>${CAMP_HE[k]} מוביל</span>`).join("") + `<span class="r22-dimkey"><i></i>מחוץ לסינון</span>`;
}
function renderDots(list) {
  const svg = q("#r22-map svg"); if (!svg) return;
  const inSet = new Set(list.map(l => l.c));
  const scale = MAP.vb[2] / (svg.clientWidth || 300);             // יחידות מפה לפיקסל
  const rOf = l => Math.max(1.6, Math.min(11, Math.sqrt(l.v) / 28)) * scale;
  const dots = D.localities.filter(l => l.x != null).sort((a, b) => b.v - a.v);
  svg.querySelector(".r22-dots").innerHTML = dots.map(l => {
    const [x, y] = proj(l.x, l.y), on = inSet.has(l.c), sel = l.c === st.city;
    return `<circle data-city="${l.c}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${rOf(l).toFixed(2)}" class="${on ? "on" : "off"}${sel ? " sel" : ""}" style="--c:${campColor(leadCamp(l))}${sel ? `;stroke-width:${(2.4 * scale).toFixed(2)}` : ""}"><title>${escH(l.n)} · ${n0(l.v)} קולות · ${escH(D.parties[lead(l)].short)} ${p1(100 * l.p[lead(l)] / (l.v || 1))}%</title></circle>`;
  }).join("");
  const city = st.city != null && D.localities.find(l => l.c === st.city);
  if (city?.x != null) svg.querySelector(".r22-dots").appendChild(svg.querySelector(`circle[data-city="${city.c}"]`));   // הנבחר מעל כולם
}
/* המפה מתמקדת בבחירה: יישוב — בסביבתו; סינון — בכל היישובים שבו; אחרת — כל הארץ */
function focusMap(list) {
  const svg = q("#r22-map svg"); if (!svg) return;
  let target = MAP.full;
  const pick = st.city != null ? D.localities.filter(l => l.c === st.city) : (st.district != null || st.region != null || st.sectors.size) ? list : null;
  const pts = (pick || []).filter(l => l.x != null).map(l => proj(l.x, l.y));
  if (pts.length) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    let w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const minSpan = st.city != null ? 40 : 25, pad = 8;
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    w = Math.max(w + 2 * pad, minSpan); h = Math.max(h + 2 * pad, minSpan);
    const ar = svg.clientWidth && svg.clientHeight ? svg.clientWidth / svg.clientHeight : MAP.full[2] / MAP.full[3];
    if (w / h < ar) w = h * ar; else h = w / ar;
    target = [cx - w / 2, cy - h / 2, w, h];
  }
  const from = MAP.vb.slice(), t0 = performance.now(), dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
  cancelAnimationFrame(MAP.anim);
  const step = now => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
    MAP.vb = from.map((v, i) => v + (target[i] - v) * e);
    svg.setAttribute("viewBox", MAP.vb.map(v => v.toFixed(2)).join(" "));
    if (k < 1) MAP.anim = requestAnimationFrame(step); else renderDots(list);
  };
  MAP.anim = requestAnimationFrame(step);
}

/* ---------- הכול יחד ---------- */
/* שולחן עבודה: הלוח ממלא בדיוק את מה שנשאר מתחת לכותרת, כך שאין גלילת עמוד */
function fitHeight() {
  const dash = q("#r22-dash"); if (!dash) return;
  if (innerWidth <= 1000) { dash.style.removeProperty("--r22-h"); return; }
  const top = dash.getBoundingClientRect().top + scrollY;
  dash.style.setProperty("--r22-h", `${Math.max(480, innerHeight - top - 12)}px`);
}
function update({ refocus = true } = {}) {
  const list = filtered();
  fitHeight();
  syncFilterControls();
  renderTable(list);
  renderKpi(list);
  renderBars(list);
  renderDots(list);
  if (refocus) focusMap(list);
}
function selectCity(code) {
  st.city = code == null || code === st.city ? null : code;
  update();
  if (st.city != null) q(`#r22-table tr[data-city="${st.city}"]`)?.scrollIntoView({ block: "nearest" });
}
function wire() {
  q("#r22-city").addEventListener("change", e => {
    const v = e.target.value.trim();
    if (!v) return selectCity(null);
    const hit = D.localities.find(l => l.n === v) || D.localities.find(l => l.n.startsWith(v)) || D.localities.find(l => l.n.includes(v));
    if (hit) { st.district = st.region = null; st.sectors.clear(); st.city = null; selectCity(hit.c); }
  });
  q("#r22-city").addEventListener("search", e => { if (!e.target.value) selectCity(null); });
  q("#r22-region").addEventListener("change", e => {
    const [k, v] = e.target.value.split(":");
    st.district = k === "d" ? Number(v) : null; st.region = k === "r" ? Number(v) : null; st.city = null;
    update();
  });
  q("#r22-sector").addEventListener("click", e => {
    const b = e.target.closest("[data-sector]"); if (!b) return;
    const k = b.dataset.sector;
    if (!k) st.sectors.clear(); else if (st.sectors.has(k)) st.sectors.delete(k); else st.sectors.add(k);
    st.city = null; update();
  });
  q("#r22-nat").addEventListener("change", e => { st.nat = e.target.checked; update({ refocus: false }); });
  q("#r22-reset").addEventListener("click", () => { st.city = st.district = st.region = null; st.sectors.clear(); update(); });
  q("#r22-table").addEventListener("click", e => {
    const s = e.target.closest("[data-sort]");
    if (s) { const k = s.dataset.sort, num = COLS.find(c => c.key === k)?.num; st.sort = { key: k, dir: st.sort.key === k ? -st.sort.dir : num ? -1 : 1 }; return update({ refocus: false }); }
    const r = e.target.closest("tr[data-city]"); if (r) selectCity(Number(r.dataset.city));
  });
  q("#r22-map").addEventListener("click", e => { const c = e.target.closest("circle[data-city]"); if (c) selectCity(Number(c.dataset.city)); });
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (!q("#view-map")?.classList.contains("on")) return; fitHeight(); focusMap(filtered()); }, 150); });
}

let ready = false;
window.renderR22 = async function renderR22() {
  const root = q("#r22-dash"); if (!root) return;
  try {
    await loadData();
    if (!ready) { renderFilters(); renderMapBase(); wire(); ready = true; }
    update();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<p class="r22-error">לא הצלחנו לטעון את נתוני היישובים.</p>`;
  }
};
})();
