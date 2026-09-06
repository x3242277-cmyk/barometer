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
  Left:    { he: "שמאל",  short: "שמאל",  color: "#DE7A2C" },
  Haredi:  { he: "חרדים", short: "חרדים", color: "#5B4B8A" },
  Arabs:   { he: "ערבים", short: "ערבים", color: "#2E8467" },
  Unknown: { he: "לא משויך", short: "אחר", color: "#96A0AB" }
};
const BLOC_ORDER = ["Right", "Haredi", "Arabs", "Left", "Unknown"];
const HAREDI_PARTIES = new Set(["shas", "yahadut_hatora", "utj", "mifleget_hazibur_haharedi"]);
const LEGACY_BLOCS = { Coalition: "Right", Opposition: "Left", Arabs: "Arabs", Unknown: "Unknown" };
const HIST_PARTY_HE = {
  likud:"הליכוד", yesh_atid:"יש עתיד", national_unity:"המחנה הממלכתי", shas:"ש״ס", labor:"העבודה",
  utj:"יהדות התורה", yisrael_beiteinu:"ישראל ביתנו", religious_zionism:"הציונות הדתית", 
  hadash_taal:"חד״ש–תע״ל", meretz:"מרצ", raam:"רע״מ"
};
const COUNTERFACTUAL = { likud:31, yesh_atid:23, national_unity:12, shas:11, labor:5, utj:7,
  yisrael_beiteinu:5, religious_zionism:13, hadash_taal:4, meretz:4, raam:5 };
const WINDOW_DAYS = 14;
const ELECTION_TIMELINE = {
  pollsOpen: "2026-10-27T07:00:00+02:00",
  exitPolls: "2026-10-27T22:00:00+02:00"
};

const S = { hist:null, cur:null, firms:null, regions:null, demo:null,
            stats:[], counterStats:[], series:[], mode:"weighted", scen:"actual",
            pollView:"table", view:"home", selectedLoc:0, demoOverrides:{}, live:null, liveTimer:null, countdownTimer:null,
            calibrations:[] };

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
    ${arc(Math.PI, a61, R, 16, "#DE7A2C")}
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
function histBlocs(p) {
  return {
    netanyahu: p.likud + p.shas + p.utj + p.religious_zionism,
    outgoing:  p.yesh_atid + p.national_unity + p.labor + p.yisrael_beiteinu + p.meretz + p.raam,
    outside:   p.hadash_taal
  };
}

function scoreFirms(data, actual = data.actual) {
  const keys = Object.keys(actual), aB = histBlocs(actual);
  const grouped = data.polls.reduce((m, p) => { (m[p.firm] ||= []).push(p); return m; }, {});
  const allT = data.polls.map(p => Date.parse(p.date.slice(0, 10)));
  const fullSpan = Math.max(...allT) - Math.min(...allT);
  return Object.entries(grouped).map(([firm, polls]) => {
    const blocs = polls.map(p => histBlocs(p.p));
    const bm = { netanyahu: avg(blocs.map(b => b.netanyahu)), outgoing: avg(blocs.map(b => b.outgoing)), outside: avg(blocs.map(b => b.outside)) };
    const blocAbs = Object.keys(aB).reduce((s, k) => s + Math.abs(bm[k] - aB[k]), 0);
    const partyMae = avg(polls.flatMap(p => keys.map(k => Math.abs(p.p[k] - actual[k]))));
    const consSd = sd(blocs.map(b => b.netanyahu));
    const t = polls.map(p => Date.parse(p.date.slice(0, 10)));
    const continuity = fullSpan ? clamp(100 * (Math.max(...t) - Math.min(...t)) / fullSpan) : 100;
    const blocScore = clamp(100 - 10 * (blocAbs / 3));
    const partyScore = clamp(100 - 15 * partyMae);
    const stability = clamp(100 - 25 * consSd);
    const consistencyScore = .7 * stability + .3 * continuity;
    const score = .6 * blocScore + .3 * partyScore + .1 * consistencyScore;
    return { firm, polls, n: polls.length, blocMean: bm, blocAbs, partyMae, blocScore, partyScore, consistencyScore, stability, continuity, score };
  }).sort((a, b) => b.score - a.score);
}

/* ============================================================
   2. חלון 14 יום + סדרות
   ============================================================ */
const normId = id => id === "zionut_datit_zehut" ? "zionut_datit" : id;

/* שיוך גוש שנקבע ידנית באתר, מעל למה שמופיע בנתוני הסקר הגולמיים */
const ALIGN_OVERRIDE = { ofer_vinter_party: "Right", noam: "Right" };
function alignOf(party = {}) {
  const id = normId(party.id || "");
  if (HAREDI_PARTIES.has(id)) return "Haredi";
  if (ALIGN_OVERRIDE[id]) return ALIGN_OVERRIDE[id];
  return LEGACY_BLOCS[party.alignment] || party.alignment || "Unknown";
}

function parsePollDate(p) {
  if (p.dateTimestamp) return p.dateTimestamp;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(p.date || "");
  return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}`) : 0;
}

function inWindow(polls, generatedAt) {
  const anchor = Math.max(Date.now(), ...polls.map(parsePollDate));
  const from = anchor - WINDOW_DAYS * 864e5;
  const kept = polls.filter(p => parsePollDate(p) >= from);
  return { polls: kept.length ? kept : polls, from, to: anchor };
}

function firmOf(sourceId) {
  const m = S.firms.sourceMap[sourceId];
  if (!m) return { firm: sourceId, outlet: sourceId, meta: { he: sourceId, short: "?", calibrated: false } };
  return { ...m, meta: S.firms.firms.find(f => f.id === m.firm) || { he: m.firm, short: "?", calibrated: false } };
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

function forecast(mode) {
  const ids = [...new Set(S.series.flatMap(s => Object.keys(s.parties)))];
  const w = s => mode === "weighted" ? firmScore(s.meta) / 100 : 1;
  const W = S.series.reduce((sum, s) => sum + w(s), 0);
  const raw = Object.fromEntries(ids.map(id => [id, S.series.reduce((sum, s) => sum + (s.parties[id] || 0) * w(s), 0) / W]));
  const fix = structuralFix(raw);
  const blocs = Object.fromEntries(Object.keys(BLOCS).map(al => [al, S.series.reduce((sum, s) => sum + s.blocs[al] * w(s), 0) / W]));
  return { raw, parties: fix.parties, blocs, fix };
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
  let target = open, title = "עד פתיחת הקלפיות", sub = "בחירות 2026";
  if (now >= open && now < exit) {
    target = exit;
    title = "עד פרסום המדגמים";
    sub = "הקלפיות פתוחות";
  } else if (now >= exit) {
    title = "המדגמים פורסמו";
    sub = "עוברים למדגמים ולתוצאות האמת";
  }
  const left = countdownParts(target - now);
  const cells = now >= exit
    ? [["00", "ימים"], ["00", "שעות"], ["00", "דקות"]]
    : [[left.days, "ימים"], [left.hours, "שעות"], [left.minutes, "דקות"]];
  box.innerHTML = `<div><p class="kicker">שעון בחירות</p><h3>${esc(title)}</h3><span>${esc(sub)}</span></div>
    <div class="countdown-cells">${cells.map(([n, l]) =>
      `<b><span class="num">${String(n).padStart(2, "0")}</span><em>${esc(l)}</em></b>`).join("")}</div>`;
}

/* ============================================================
   4. עמוד הבית — התחזית
   ============================================================ */
function renderHome() {
  renderAnecdote();
  renderElectionTimer();
  const est = forecast(S.mode);
  const seats = largestRemainder(est.parties);
  const blocSeats = Object.fromEntries(Object.keys(BLOCS).map(k => [k, 0]));
  Object.entries(seats).forEach(([id, n]) => { blocSeats[partyMeta(id).alignment] += n; });
  const order = BLOC_ORDER.filter(k => blocSeats[k] > 0);
  const governing = (blocSeats.Right || 0) + (blocSeats.Haredi || 0);

  // gauge
  $("#gauge-svg").innerHTML = gaugeSVG(governing, 120, { caption: "מנדטים לימין ולחרדים" });
  $("#gauge-mode").textContent = S.mode === "weighted" ? "משוקלל אמינות" : "ממוצע פשוט";
  const alternative = (blocSeats.Left || 0) + (blocSeats.Arabs || 0);
  $("#gauge-read").innerHTML = order.map(k =>
    `<div><b style="color:${BLOCS[k].color}">${blocSeats[k]}</b><span>${esc(BLOCS[k].he)}</span></div>`).join("");
  const gap = governing - 61;
  $("#gauge-verdict").innerHTML = gap >= 0
    ? `ימין וחרדים חוצים יחד את קו ה־61 עם <b>עודף של ${gap} מנדטים</b>. שמאל וערבים עומדים יחד על ${alternative}.`
    : `ימין וחרדים <b>חסרים ${Math.abs(gap)} מנדטים</b> לרוב. שמאל וערבים עומדים יחד על ${alternative} — גם הם ללא רוב אוטומטי.`;

  // stats
  const calN = S.series.filter(s => s.meta.calibrated).length;
  $("#home-stats").innerHTML = [
    [S.cur.polls.length, "סקרים בחלון"],
    [S.series.length, "מכוני סקרים"],
    [calN, "מהם מכוילים על 2022"],
    [S.hist.polls.length, "סקרי כיול מ־2022"]
  ].map(([n, l]) => `<div><b class="num">${n}</b><span>${esc(l)}</span></div>`).join("");

  // hemicycle
  const items = [];
  BLOC_ORDER.forEach(al => {
    Object.entries(seats).filter(([id]) => partyMeta(id).alignment === al)
      .sort((a, b) => b[1] - a[1])
      .forEach(([id, n]) => { const m = partyMeta(id); items.push({ color: BLOCS[al].color, count: n, key: id, label: `${m.name} · ${n}` }); });
  });
  $("#hemi-svg").innerHTML = hemicycleSVG(items, { aria: "מפת 120 המנדטים לפי גוש" });
  $("#hemi-updated").textContent = `עדכון אחרון: ${heDate(S.cur.generatedAt)}`;
  $("#blocbar").innerHTML = blocBarHTML(order.map(k => ({ count: blocSeats[k], color: BLOCS[k].color, label: `${BLOCS[k].he}: ${blocSeats[k]}` })));
  $("#bloclegend").innerHTML = order.map(k =>
    `<button type="button" data-bloc="${k}" aria-pressed="false" style="--c:${BLOCS[k].color}"><i></i><b class="num">${blocSeats[k]}</b> ${esc(BLOCS[k].he)} <span style="color:var(--ink-3)">· ${r1(est.blocs[k])} גולמי</span></button>`).join("");

  // top firm
  const top = S.stats[0], tm = S.firms.firms.find(f => f.id === top.firm);
  $("#top-firm").innerHTML = `<div style="display:flex;align-items:center;gap:14px;margin-top:8px">
      ${logoBox(tm, 52)}
      <div style="min-width:0"><div style="font-weight:800;font-size:1.1rem">${esc(tm.he)}</div>
      <div style="color:var(--ink-3);font-size:.76rem">${esc(tm.lead)} · ${top.n} סקרי כיול</div></div>
      <div style="margin-inline-start:auto;text-align:end"><b style="font-family:var(--serif);font-size:2.2rem;font-weight:900;color:var(--navy);line-height:1">${r1(top.score)}</b>
      <div style="color:var(--ink-3);font-size:.68rem">מתוך 100</div></div></div>
    <p style="margin:12px 0 0;color:var(--ink-2);font-size:.85rem">מפרסם ב־${esc(tm.outlets.join(", "))}.</p>`;

  // fixes
  const f = est.fix;
  $("#fix-box").innerHTML = `
    <div class="lbars">
      <div class="lbar" style="--c:#4A4A4A"><span>ש״ס</span><i><b style="--w:${clamp(f.parties.shas / 20 * 100)}%"></b></i><span class="v">${r1(f.parties.shas)}</span></div>
      <div class="lbar" style="--c:#5B4B8A"><span>יהדות התורה</span><i><b style="--w:${clamp(f.parties.yahadut_hatora / 20 * 100)}%"></b></i><span class="v">${r1(f.parties.yahadut_hatora)}</span></div>
    </div>
    <p style="margin:12px 0 0;color:var(--ink-2);font-size:.84rem">בסקרים: ש״ס ${r1(f.shasBefore)} · ג׳ ${r1(f.utjBefore)}. הרצפות הן ${FLOORS.shas} ו־${FLOORS.yahadut_hatora} — יחד ${r1(FLOORS.shas + FLOORS.yahadut_hatora)}, בדיוק תוצאת 2022. ${f.added > 0.05 ? `נוספו <b>${r1(f.added)}</b> מנדטים שנגרעו יחסית מ־${f.donors.length} מפלגות באותו גוש.` : "הסקרים כבר מעל הרצפה — לא הופעל תיקון."}</p>
    <span class="tagfix">רצפת מודל — לא נתון סקר</span>
    <a class="src" href="#/haredi" style="color:var(--navy)">בנק הקולות החרדי — ההסבר המלא ←</a>`;

  // party rows
  $("#party-rows").innerHTML = Object.entries(seats).filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || est.parties[b[0]] - est.parties[a[0]])
    .map(([id, n]) => {
      const m = partyMeta(id), col = BLOCS[m.alignment].color;
      const tag = (id === "shas" && est.parties.shas > est.raw.shas + .01) ? `רצפת ${FLOORS.shas}` : (id === "yahadut_hatora" && est.parties.yahadut_hatora > est.raw.yahadut_hatora + .01) ? `רצפת ${FLOORS.yahadut_hatora}` : "";
      const sub = tag ? `בסקרים ${r1(est.raw[id])}` : "";
      return resultRowHTML({ meta: m, value: n, color: col, sub, tag });
    }).join("");
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

function resultRowHTML({ meta, value, color, sub = "", tag = "" }) {
  return `<article class="rcard" style="--c:${color}">
    <span class="rcard-logo" style="--c:${color}"><img src="${esc(meta.logo)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('nologo');this.remove()"><b>${esc(initials(meta.name))}</b></span>
    <b class="rcard-num num">${r1(value)}</b>
    <strong title="${esc(meta.name)}">${esc(meta.name)}</strong>
    ${sub ? `<small>${esc(sub)}</small>` : ""}
    ${tag ? `<span class="tagfix">${esc(tag)}</span>` : ""}
  </article>`;
}

/* ============================================================
   5. עמוד סקרי 2026
   ============================================================ */
function topPartyIds(limit = 11) {
  const totals = {};
  S.cur.polls.forEach(p => p.parties.forEach(x => { const id = normId(x.id); totals[id] = (totals[id] || 0) + x.mandates; }));
  return Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
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
  $("#poll-count").textContent = `${rows.length} מתוך ${polls.length} סקרים`;

  // table
  const ids = topPartyIds(11);
  const head = `<thead><tr><th>תאריך</th><th>מכון ופרסום</th><th class="n">ימין+חרדים</th>${ids.map(id => `<th class="n" title="${esc(partyMeta(id).name)}">${esc(shortName(partyMeta(id).name))}</th>`).join("")}</tr></thead>`;
  const body = rows.map(p => {
    const f = firmOf(p.sourceId);
    const val = id => p.parties.filter(x => normId(x.id) === id).reduce((s, x) => s + x.mandates, 0);
    const coal = p.parties.filter(x => ["Right", "Haredi"].includes(alignOf(x))).reduce((s, x) => s + x.mandates, 0);
    return `<tr><td style="white-space:nowrap">${esc(p.date)}</td>
      <td><div class="orgcell">${outletLogo(p.channelHebrewName)}<div><strong>${esc(f.meta.he)}</strong><span>${esc(p.channelHebrewName)}</span></div></div></td>
      <td class="n"><span class="chip ${coal >= 61 ? "good" : ""}">${coal}</span></td>
      ${ids.map(id => { const v = val(id); return `<td class="n">${v ? `<span class="chip">${v}</span>` : `<span style="color:var(--ink-3)">—</span>`}</td>`; }).join("")}</tr>`;
  }).join("") || `<tr><td colspan="${ids.length + 3}" class="empty">לא נמצאו סקרים לפי הסינון.</td></tr>`;
  $("#polls-table").innerHTML = head + `<tbody>${body}</tbody>`;

  // cards
  $("#polls-cards").innerHTML = rows.map(p => {
    const f = firmOf(p.sourceId), sc = firmScore(f.meta);
    const series = S.series.find(s => s.polls.some(x => x.id === p.id));
    const outletMark = S.firms.outletLogos[p.channelHebrewName]
      ? `<img src="${esc(S.firms.outletLogos[p.channelHebrewName])}" alt="${esc(p.channelHebrewName)}">`
      : esc(p.channelHebrewName.slice(0, 3));
    const firmMark = f.meta.logo
      ? `<img src="${esc(f.meta.logo)}" alt="${esc(f.meta.he)}">`
      : esc(f.meta.short || "?");
    return `<article class="pollcard">
      <div class="chanwrap"><span class="chan" title="${esc(p.channelHebrewName)}">${outletMark}</span>
        <span class="firmmark" title="${esc(f.meta.he)}">${firmMark}</span></div>
      <div style="min-width:0"><h4>${esc(p.channelHebrewName)} · ${esc(p.date)}</h4>
        <p>${esc(f.meta.he)} · ${esc(f.meta.lead || "")}${series && series.polls.length > 1 ? ` · סדרה של ${series.polls.length} סקרים` : ""}</p>
        ${f.meta.calibrated ? "" : `<span class="badge neutral">ללא כיול 2022 · משקל ניטרלי</span>`}</div>
      <div class="rel"><b class="num">${r1(sc)}</b><span>${f.meta.calibrated ? "ציון אמינות" : "משקל חישובי"}</span></div>
    </article>`;
  }).join("") || `<p class="empty">לא נמצאו סקרים לפי הסינון.</p>`;

  renderTrend(polls);
  renderFirmCards();
}

const shortName = n => n.replace(/^ה/, "").replace(/!.*/, "").replace(/\s*עם.*/, "").trim().slice(0, 12);

function renderTrend(polls) {
  const pts = polls.map(p => ({
    t: parsePollDate(p),
    right: p.parties.filter(x => alignOf(x) === "Right").reduce((s, x) => s + x.mandates, 0),
    haredi: p.parties.filter(x => alignOf(x) === "Haredi").reduce((s, x) => s + x.mandates, 0),
    left: p.parties.filter(x => alignOf(x) === "Left").reduce((s, x) => s + x.mandates, 0),
    ar: p.parties.filter(x => alignOf(x) === "Arabs").reduce((s, x) => s + x.mandates, 0)
  })).sort((a, b) => a.t - b.t);
  if (!pts.length) return;
  const W = 900, H = 270, m = { t: 22, r: 66, b: 36, l: 30 };
  const t0 = pts[0].t, t1 = pts.at(-1).t || t0 + 1;
  const x = t => m.l + (W - m.l - m.r) * (t1 === t0 ? .5 : (t - t0) / (t1 - t0));
  const lo = 4, hi = 72;
  const y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const grid = [10, 20, 30, 40, 50, 61, 70].map(v =>
    `<line x1="${m.l}" y1="${y(v)}" x2="${W - m.r}" y2="${y(v)}" stroke="${v === 61 ? "#141A21" : "#E4DFD4"}" stroke-width="${v === 61 ? 1.6 : 1}" ${v === 61 ? 'stroke-dasharray="5 4"' : ""}/>
     <text x="${W - m.r + 12}" y="${y(v) + 4}" font-size="11" fill="${v === 61 ? "#141A21" : "#6C7885"}" font-weight="${v === 61 ? 800 : 600}">${v}</text>`).join("");
  const line = (key, col) => {
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p[key]).toFixed(1)}`).join("");
    const dots = pts.map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="4" fill="#fff" stroke="${col}" stroke-width="2.2"/>`).join("");
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round"/>${dots}`;
  };
  const days = [...new Set(pts.map(p => p.t))].map(t =>
    `<text x="${x(t).toFixed(1)}" y="${H - 10}" font-size="10.5" fill="#6C7885" text-anchor="middle">${new Date(t).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}</text>`).join("");
  $("#trend-box").innerHTML = `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="מגמת הגושים בסקרים">
      ${grid}${line("left", "#DE7A2C")}${line("right", "#17457F")}${line("haredi", "#5B4B8A")}${line("ar", "#2E8467")}${days}</svg>
    <div class="legend" style="margin-top:6px">
      <span style="--c:#17457F;display:inline-flex;align-items:center;gap:8px"><i style="width:11px;height:11px;border-radius:3px;background:#17457F"></i>ימין</span>
      <span style="display:inline-flex;align-items:center;gap:8px"><i style="width:11px;height:11px;border-radius:3px;background:#5B4B8A"></i>חרדים</span>
      <span style="display:inline-flex;align-items:center;gap:8px"><i style="width:11px;height:11px;border-radius:3px;background:#DE7A2C"></i>שמאל</span>
      <span style="display:inline-flex;align-items:center;gap:8px"><i style="width:11px;height:11px;border-radius:3px;background:#2E8467"></i>ערבים</span>
      <span style="display:inline-flex;align-items:center;gap:8px"><i style="width:16px;height:0;border-top:2px dashed #141A21"></i>קו ה־61</span>
    </div>`;
}

function renderFirmCards() {
  const active = [...new Set(S.cur.polls.map(p => firmOf(p.sourceId).firm))];
  $("#firm-cards").innerHTML = S.firms.firms.filter(f => active.includes(f.id)).map(f => {
    const st = S.stats.find(s => s.firm === f.id);
    return `<article class="card pad" style="border-top:4px solid ${f.calibrated ? "#17457F" : "#5B4B8A"}">
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
const scenActual = () => S.scen === "counterfactual" ? COUNTERFACTUAL : S.hist.actual;

function render2022() {
  const stats = S.scen === "counterfactual" ? S.counterStats : S.stats;
  const target = scenActual(), tb = histBlocs(target);

  renderCalibrationStrip();

  $("#scen-cards").innerHTML = [
    { t: "גוש נתניהו", v: tb.netanyahu, c: "#17457F" },
    { t: "הגוש היוצא", v: tb.outgoing, c: "#DE7A2C" },
    { t: "חד״ש–תע״ל", v: tb.outside, c: "#2E8467" }
  ].map(x => `<div class="card pad" style="border-top:4px solid ${x.c}">
      <p class="kicker" style="color:${x.c}">${esc(x.t)}</p>
      <b style="display:block;font-family:var(--serif);font-size:3rem;font-weight:900;line-height:1;margin-top:6px">${x.v}</b>
      <span style="color:var(--ink-3);font-size:.8rem">מנדטים</span></div>`).join("");

  const w = S.regions.wasted;
  $("#scen-explain").innerHTML = S.scen === "counterfactual"
    ? `<p style="margin:0 0 6px"><b>התרחיש שכמעט קרה.</b> מרצ קיבלה ${fmt(w.meretz)} קולות — ${fmt(w.meretzGap)} קולות בלבד מתחת לאחוז החסימה. אילו עברה, הדירוג כולו מחושב כאן מחדש מול התוצאה ההיפותטית.</p>
       <p style="margin:0">שימו לב מה קורה לציונים: מכון שהראה למרצ 4–5 מנדטים ״טעה״ מול המציאות, אך היה מדויק מול התרחיש הזה. זה בדיוק ההבדל בין למדוד את מצב הרוח לבין לחזות את התוצאה.</p>`
    : `<p style="margin:0 0 6px"><b>הפער בין הגושים היה 30,293 קולות בלבד</b> — ${fmt(w.blocNetanyahu)} לגוש נתניהו מול ${fmt(w.blocChange)} לגוש השני. ובכל זאת נפער הפרש של 8 מנדטים.</p>
       <p style="margin:0">הסיבה: ${fmt(w.total)} קולות ירדו לטמיון כשמרצ (${fmt(w.meretz)}) ובל״ד (${fmt(w.balad)}) לא עברו את אחוז החסימה — יותר משבעה מנדטים בחישוב גולמי. אף סקר לא ״טעה״ בגושים; הם פשוט לא יכלו לתמחר את אחוז החסימה.</p>`;

  // ranking
  const comps = [["blocScore", "דיוק בגושים", "#17457F"], ["partyScore", "דיוק במפלגות", "#B8862B"], ["consistencyScore", "עקביות", "#5B4B8A"]];
  $("#rank-list").innerHTML = stats.map(it => {
    const m = S.firms.firms.find(f => f.id === it.firm) || { he: it.firm, short: "?" };
    return `<article class="rank">
      ${logoBox(m, 52)}
      <div style="min-width:0"><strong style="display:block">${esc(m.he)}</strong>
        <span style="color:var(--ink-3);font-size:.75rem">${it.n} סקרים · גוש נתניהו ${r1(it.blocMean.netanyahu)} מול ${tb.netanyahu}</span>
        ${outletIconStrip(m.outlets || [])}</div>
      <div class="meters">${comps.map(([k, l, c]) => `<div class="meter" style="--c:${c}"><span>${l}<b>${r1(it[k])}</b></span><i style="--v:${clamp(it[k])}%"></i></div>`).join("")}</div>
      <div class="final"><b class="num">${r1(it.score)}</b><span>ציון סופי</span></div>
    </article>`;
  }).join("");

  // bias table
  const keys = Object.keys(S.hist.actual);
  const biasRows = keys.map(k => {
    const mean = avg(S.hist.polls.map(p => p.p[k]));
    return { k, mean, act: target[k], d: target[k] - mean };
  }).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const biasHTML = `<thead><tr><th>מפלגה</th><th class="n">ממוצע 39 הסקרים</th><th class="n">${S.scen === "counterfactual" ? "בתרחיש" : "בפועל"}</th><th class="n">פער</th></tr></thead><tbody>${
    biasRows.map(r => `<tr><td>${esc(HIST_PARTY_HE[r.k])}</td><td class="n">${r1(r.mean)}</td><td class="n">${r.act}</td>
      <td class="n"><span dir="ltr" class="chip ${Math.abs(r.d) >= 1 ? (r.d > 0 ? "good" : "bad") : ""}">${r.d > 0 ? "+" : ""}${r.d.toFixed(1)}</span></td></tr>`).join("")}</tbody>`;
  $("#bias-table").innerHTML = biasHTML;
  const mb = $("#method-bias"); if (mb) mb.innerHTML = biasHTML;
  const har = $("#m-har-poll");
  if (har) har.textContent = r1(avg(S.hist.polls.map(p => p.p.shas + p.p.utj)));

  renderArchive();
}

function renderArchive() {
  const sel = $("#arch-firm");
  if (sel.options.length === 1)
    S.stats.forEach(s => {
      const m = S.firms.firms.find(f => f.id === s.firm);
      sel.insertAdjacentHTML("beforeend", `<option value="${esc(s.firm)}">${esc(m ? m.he : s.firm)} (${s.n})</option>`);
    });
  const ff = sel.value, q = $("#arch-q").value.trim().toLowerCase();
  const target = scenActual(), keys = Object.keys(S.hist.actual);
  const rows = S.hist.polls.map((p, i) => ({ p, i })).filter(({ p }) => {
    const m = S.firms.firms.find(f => f.id === p.firm);
    return (ff === "all" || p.firm === ff) && (!q || `${p.date} ${p.firm} ${m ? m.he : ""} ${p.publisher}`.toLowerCase().includes(q));
  });
  $("#arch-count").textContent = `${rows.length} מתוך ${S.hist.polls.length} סקרים`;
  $("#arch-table").innerHTML = `<thead><tr><th>תאריך</th><th>מכון ופרסום</th><th class="n">גוש נתניהו</th><th class="n">הגוש היוצא</th><th class="n">חד״ש–תע״ל</th><th class="n">שגיאת מפלגות</th><th></th></tr></thead><tbody>${
    rows.map(({ p, i }) => {
      const b = histBlocs(p.p), tb = histBlocs(target);
      const mae = avg(keys.map(k => Math.abs(p.p[k] - target[k])));
      const m = S.firms.firms.find(f => f.id === p.firm) || { he: p.firm, short: "?" };
      const dev = Math.abs(b.netanyahu - tb.netanyahu);
      return `<tr><td style="white-space:nowrap">${esc(p.date.replaceAll("2022-", ""))}</td>
        <td><div class="orgcell">${outletLogo(p.publisher)}<div><strong>${esc(m.he)}</strong><span>${esc(p.publisher)}</span></div></div></td>
        <td class="n"><span class="chip ${dev <= 1 ? "good" : dev >= 3 ? "bad" : ""}">${b.netanyahu}</span></td>
        <td class="n"><span class="chip">${b.outgoing}</span></td>
        <td class="n"><span class="chip">${b.outside}</span></td>
        <td class="n"><span class="chip ${mae < 1 ? "good" : mae > 1.6 ? "bad" : ""}">${r1(mae)}</span></td>
        <td><button class="btn ghost" style="padding:5px 12px;font-size:.78rem" type="button" data-poll="${i}">מפלגות</button></td></tr>`;
    }).join("") || `<tr><td colspan="7" class="empty">לא נמצאו סקרים.</td></tr>`}</tbody>`;
}

function openPoll(i) {
  const p = S.hist.polls[i], m = S.firms.firms.find(f => f.id === p.firm) || { he: p.firm };
  const target = scenActual();
  $("#dlg-body").innerHTML = `<h2 style="font-size:1.6rem">${esc(m.he)} · ${esc(p.publisher)}</h2>
    <p style="color:var(--ink-3);font-size:.82rem;margin:6px 0 0">${esc(p.date)} · מול ${S.scen === "counterfactual" ? "תרחיש מרצ עוברת" : "תוצאת האמת"}</p>
    <div class="dgrid">${Object.keys(target).map(k => {
      const d = p.p[k] - target[k];
      return `<div><span>${esc(HIST_PARTY_HE[k])}</span><b>${p.p[k]} <span style="color:var(--ink-3)">→ ${target[k]}</span> <span dir="ltr" class="chip ${Math.abs(d) <= 1 ? "good" : "bad"}">${d > 0 ? "+" : ""}${d}</span></b></div>`;
    }).join("")}</div>`;
  $("#dlg").showModal();
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
  const D = S.demo, P = demoParams();
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
  const D = S.demo, P = demoParams(), years = D.meta.years;
  const now = runDemoModel(years), base = runDemoModel(0);
  const order = ["right", "haredi", "arab", "center"];
  const share = (m, c) => 100 * m.campVotes[c] / m.campTotal;
  const shares = order.map(c => {
    const s0 = share(base, c), s1 = share(now, c), d = s1 - s0;
    return { id: c, color: D.camps[c].color, label: BLOC_LABEL[c], s0, s1, d };
  });
  const bloc = share(now, "right") + share(now, "haredi");
  const bloc22 = share(base, "right") + share(base, "haredi");
  const deltaTag = d => `<span dir="ltr" class="${d > 0.049 ? "pos" : d < -0.049 ? "neg" : "flat"}">${d > 0.049 ? "+" : d < -0.049 ? "−" : "±"}${r1(Math.abs(d))}</span>`;

  $("#demo-share-chart").innerHTML = `<div class="share-head">
      <div><p class="kicker" style="margin:0">מודל מול מודל</p><h3>2022 מול 2026</h3></div>
      <p>ימין + חרדים: <b>${r1(bloc)}%</b></p>
    </div>
    <div class="compare-stacks" role="img" aria-label="השוואת אחוזי תמיכה לפי גוש בין 2022 ל-2026">
      <div class="compare-stack-row">
        <b>2022</b>
        <div class="share-stack">
          ${shares.map(x => `<span style="--w:${x.s0.toFixed(3)}%;--c:${x.color}" title="${esc(x.label)} ${r1(x.s0)}%">${r1(x.s0)}%</span>`).join("")}
        </div>
      </div>
      <div class="compare-stack-row strong">
        <b>2026</b>
        <div class="share-stack">
          ${shares.map(x => `<span style="--w:${x.s1.toFixed(3)}%;--c:${x.color}" title="${esc(x.label)} ${r1(x.s1)}%">${r1(x.s1)}%</span>`).join("")}
        </div>
      </div>
    </div>
    <div class="share-rows">
      ${shares.map(x => `<div class="share-row" style="--c:${x.color};--w:${x.s1.toFixed(3)}%">
        <span><i></i>${esc(x.label)}</span>
        <b class="num">${r1(x.s1)}%</b>
        <em>${deltaTag(x.d)} נק׳ מ־2022</em>
        <strong><i></i></strong>
      </div>`).join("")}
    </div>`;
  $("#demo-legend").innerHTML = order.map(c =>
    `<span style="display:inline-flex;align-items:center;gap:8px;font-size:.83rem;font-weight:600"><i style="width:11px;height:11px;border-radius:3px;background:${D.camps[c].color}"></i><b class="num">${r1(share(now, c))}%</b> ${esc(BLOC_LABEL[c])} <span dir="ltr" style="color:var(--ink-3)">(${share(now, c) - share(base, c) >= 0 ? "+" : ""}${r1(share(now, c) - share(base, c))})</span></span>`).join("");

  const totalGrowth = 100 * (now.campTotal / base.campTotal - 1);
  $("#demo-delta").innerHTML = `<div style="margin-top:8px">
      <b style="display:block;font-family:var(--serif);font-size:2.6rem;font-weight:900;line-height:1;color:${bloc >= 50 ? "var(--navy)" : "var(--red)"}">${r1(bloc)}%</b>
      <span style="color:var(--ink-3);font-size:.8rem">אחוז תמיכה לימין + חרדים · ב־2022: ${r1(bloc22)}%</span></div>
    <table style="width:100%;min-width:0;margin-top:16px;border-collapse:collapse;font-size:.82rem;font-variant-numeric:tabular-nums">
      <thead><tr style="color:var(--ink-3);font-size:.72rem;font-weight:700">
        <th style="text-align:start;padding:4px 2px">גוש</th>
        <th style="text-align:end;padding:4px 2px">2022</th>
        <th style="text-align:end;padding:4px 2px">2026</th>
        <th style="text-align:end;padding:4px 2px">שינוי, נק׳</th></tr></thead>
      <tbody>${order.map(c => {
        const s0 = share(base, c), s1 = share(now, c), d = s1 - s0;
        const dtag = (t, val) => `<span dir="ltr" style="color:${t > 0.049 ? "#1F6349" : t < -0.049 ? "#8E241A" : "var(--ink-3)"}">${t > 0.049 ? "+" : t < -0.049 ? "−" : "±"}${val}</span>`;
        return `<tr style="border-top:1px solid var(--rule-2)">
          <td style="padding:7px 2px"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${D.camps[c].color};margin-inline-end:6px;vertical-align:middle"></i>${esc(BLOC_LABEL[c])}</td>
          <td style="text-align:end;padding:7px 2px;color:var(--ink-3)">${s0.toFixed(1)}%</td>
          <td style="text-align:end;padding:7px 2px;font-weight:700">${s1.toFixed(1)}%</td>
          <td style="text-align:end;padding:7px 2px">${dtag(d, r1(Math.abs(d)))}</td></tr>`;
      }).join("")}</tbody>
    </table>
    <p style="margin:14px 0 0;color:var(--ink-2);font-size:.82rem">העמוד הזה בכוונה לא הופך את התוצאה למפת מנדטים. הוא מראה רק את שינוי יחסי הכוח באחוזי תמיכה, כדי לבודד את האפקט הדמוגרפי בלי אחוז חסימה, עודפים או עיגולי חלוקה.</p>
    <p style="margin:10px 0 0;color:var(--ink-3);font-size:.78rem">סך הקולות הכשרים במודל גדל ב־<b>${r1(totalGrowth)}%</b> ב־${years} שנים — אך לא באופן אחיד בין הגושים, וזה כל הסיפור.</p>`;

  $("#demo-sectors").innerHTML = D.sectors.map(s => {
    const g = P[s.id].growth, chg = (Math.pow(1 + g, years) - 1) * 100;
    const e26 = s.eligible2022 * Math.pow(1 + g, years);
    return `<div class="prow" style="--c:${s.color}">
      <span class="orglogo" style="background:${s.color};color:#fff;border:0">${esc(initials(s.name))}</span>
      <div style="min-width:0"><div class="pname">${esc(s.name)}</div>
        <div class="psub">${fmt(s.eligible2022)} → ${fmt(e26)} בעלי זכות בחירה · ${(g * 100).toFixed(1)}% לשנה</div></div>
      <div class="pbar" style="--c:${s.color};--w:${clamp(chg / 20 * 100)}%"><i></i></div>
      <div class="pseats num" style="color:${s.color}" dir="ltr">+${r1(chg)}<span style="font-size:.46em;font-weight:700">%</span></div></div>`;
  }).join("");

  renderDemoControls();
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
    const res = await fetch(`data/live-results.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("data/live-results.json");
    S.live = await res.json();
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
      return resultRowHTML({ meta: p.meta, value: p.mandates, color: col, sub: votes + pctText });
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
    return resultRowHTML({ meta: p.meta, value: p.mandates, color: col, sub: votes + pctText });
  }).join("");
}

/* ============================================================
   12. ניתוב וכרטיסיות
   ============================================================ */
const VIEWS = { home:"", polls:"polls", e2022:"2022", live:"live", results:"results", haredi:"haredi", regions:"regions", demography:"demography", method:"method" };
const rendered = {};

function show(view) {
  if (!VIEWS.hasOwnProperty(view)) view = "home";
  S.view = view;
  $$(".view").forEach(v => v.classList.toggle("on", v.id === "view-" + view));
  $$(".tab").forEach(t => t.setAttribute("aria-current", t.dataset.view === view ? "page" : "false"));
  if (view === "haredi" && rendered[view]) renderHaredi();
  if (!rendered[view]) {
    try {
      if (view === "home") renderHome();
      if (view === "polls") renderPolls();
      if (view === "e2022") render2022();
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
  const t = { home:"התחזית", polls:"סקרי 2026", e2022:"מדד אמינות המכונים", live:"ליל הבחירות", results:"תוצאות אמת", haredi:"בנק הקולות החרדי", regions:"פילוח אזורי", demography:"התחזית היבשה", method:"מתודולוגיה" }[view];
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
function wire() {
  window.addEventListener("hashchange", routeFromHash);

  $$("[data-mode]").forEach(b => b.addEventListener("click", () => {
    S.mode = b.dataset.mode;
    $$("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderHome();
  }));

  $$("[data-scen]").forEach(b => b.addEventListener("click", () => {
    S.scen = b.dataset.scen;
    $$("[data-scen]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    render2022();
  }));

  $$("[data-pollview]").forEach(b => b.addEventListener("click", () => {
    S.pollView = b.dataset.pollview;
    $$("[data-pollview]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#polls-table-wrap").hidden = S.pollView !== "table";
    $("#polls-cards").hidden = S.pollView !== "cards";
  }));

  ["#poll-firm", "#poll-outlet"].forEach(s => $(s).addEventListener("change", renderPolls));
  $("#arch-firm").addEventListener("change", renderArchive);
  $("#arch-q").addEventListener("input", renderArchive);

  $("#arch-table").addEventListener("click", e => {
    const b = e.target.closest("[data-poll]"); if (b) openPoll(Number(b.dataset.poll));
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

  $("#demo-controls").addEventListener("input", e => {
    const el = e.target; if (!el.dataset.sec) return;
    const sec = el.dataset.sec, kind = el.dataset.kind, v = Number(el.value);
    S.demoOverrides[sec] ||= {};
    S.demoOverrides[sec][kind] = kind === "growth" ? v / 100 : v / 100;
    renderDemography();
  });
  $("#demo-reset").addEventListener("click", () => { S.demoOverrides = {}; renderDemography(); });

  $("#anec-next").addEventListener("click", () => { S.anecIdx = (S.anecIdx ?? 0) + 1; renderAnecdote(); });
  $("#anec-prev").addEventListener("click", () => { S.anecIdx = (S.anecIdx ?? 0) - 1; renderAnecdote(); });

  $("#bloclegend").addEventListener("click", e => {
    const b = e.target.closest("[data-bloc]"); if (!b) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    $$("#bloclegend [data-bloc]").forEach(x => x.setAttribute("aria-pressed", String(x === b && on)));
    const box = $("#hemi-box");
    box.classList.toggle("dim", on);
    if (on) {
      $$("#hemi-svg .hemi-seat").forEach(c => {
        const k = c.dataset.k;
        c.classList.toggle("hl", k && partyMeta(k).alignment === b.dataset.bloc);
      });
    }
  });
}

/* ============================================================
   14. אתחול
   ============================================================ */
async function loadJSONOptional(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function boot() {
  try {
    const [hist, cur, firms, regions, demo, haredi, hist2021] = await Promise.all(
      ["data/historical-polls.json", "data/current-polls.json", "data/pollsters.json", "data/regions.json", "data/demographics.json", "data/haredi.json"]
        .map(u => (window.__BAROMETER_DATA__ ? Promise.resolve(window.__BAROMETER_DATA__[u]) : fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); })))
        .concat(window.__BAROMETER_DATA__ ? [Promise.resolve(window.__BAROMETER_DATA__["data/historical-polls-2021.json"] || null)] : [loadJSONOptional("data/historical-polls-2021.json")]));
    Object.assign(S, { hist, firms, regions, demo, haredi });
    S.calibrations = [
      { year: 2022, election: "הכנסת ה־25", status: "active", polls: hist.polls.length, note: "הציון הנוכחי מחושב ממנו" },
      { year: 2021, election: "הכנסת ה־24", status: hist2021?.polls?.length ? "active" : "pending", polls: hist2021?.polls?.length || 0, note: hist2021?.meta?.note || "ייכנס לציון אחרי טעינת ארכיון מלא" }
    ];
    const win = inWindow(cur.polls, cur.generatedAt);
    S.cur = { ...cur, polls: win.polls };
    S.stats = scoreFirms(hist);
    S.counterStats = scoreFirms(hist, COUNTERFACTUAL);
    S.series = buildSeries(S.cur.polls);

    $("#hero-art").innerHTML = KNESSET_SVG;
    $("#stamp-updated").textContent = `עודכן ${heDate(cur.generatedAt)}`;
    $("#stamp-window").textContent = `חלון ${WINDOW_DAYS} יום · עד ${heDate(new Date(win.to).toISOString())}`;

    renderSources();
    wire();
    await refreshLiveResults(true);
    renderElectionTimer();
    S.countdownTimer = setInterval(renderElectionTimer, 30000);
    S.liveTimer = setInterval(refreshLiveResults, 60000);
    routeFromHash();
  } catch (err) {
    console.error(err);
    $("#main").insertAdjacentHTML("afterbegin",
      `<div class="wrap"><div class="errbox"><b>לא הצלחנו לטעון את נתוני הסקרים.</b><br>ודאו שהאתר מוגש משרת (לא פתיחת קובץ ישירה) ורעננו את הדף.</div></div>`);
  }
}

if (typeof module !== "undefined" && module.exports)
  module.exports = { scoreFirms, buildSeries, forecast, largestRemainder, baderOfer, histBlocs, structuralFix, COUNTERFACTUAL };
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
  const A = [], polls = S.cur.polls, add = (title, text, meta) => A.push({ title, text, meta });
  const coalOf = p => p.parties.filter(x => ["Right", "Haredi"].includes(alignOf(x))).reduce((s, x) => s + x.mandates, 0);
  const seatOf = (p, id) => p.parties.filter(x => normId(x.id) === id).reduce((s, x) => s + x.mandates, 0);

  /* 1. מעבר בין הגושים אצל אותו מכון */
  let best = null;
  S.series.forEach(sr => {
    if (sr.polls.length < 2) return;
    const sorted = [...sr.polls].sort((a, b) => parsePollDate(a) - parsePollDate(b));
    const a = sorted[0], b = sorted.at(-1);
    const d = Math.abs(coalOf(b) - coalOf(a));
    const days = Math.max(1, Math.round((parsePollDate(b) - parsePollDate(a)) / 864e5));
    if (d > 0 && (!best || d > best.d)) best = { sr, a, b, d, days, up: coalOf(b) > coalOf(a) };
  });
  if (best) {
    const v = votesOf(best.d);
    add(`${fmt(v)} בוחרים החליפו צד תוך ${best.days} ימים`,
      `אותו מכון בדיוק — <b>${esc(best.sr.meta.he)}</b>, שמפרסם ב${esc(best.b.channelHebrewName)} — מדד את ימין+חרדים ב־${coalOf(best.a)} ב־${esc(best.a.date)}, ואז ב־${coalOf(best.b)} ב־${esc(best.b.date)}. הפרש של ${best.d} מנדטים הוא כ־<b>${fmt(v)} קולות</b> ש${best.up ? "עברו לימין+חרדים" : "נטשו את ימין+חרדים"} תוך פחות משבועיים. ${scaleOf(v)} — קמו בוקר אחד והחליפו מחנה.`,
      "מקור: הפרש בין שני סקרים של אותה סדרה בחלון הנוכחי");
  }

  /* 2. שני מכונים, אותה מפלגה, אותו שבוע */
  const ids = topPartyIds(6);
  let gapBest = null;
  ids.forEach(id => {
    const vals = polls.map(p => ({ p, v: seatOf(p, id) })).filter(x => x.v > 0);
    if (vals.length < 2) return;
    vals.sort((a, b) => a.v - b.v);
    const lo = vals[0], hi = vals.at(-1), d = hi.v - lo.v;
    if (!gapBest || d > gapBest.d) gapBest = { id, lo, hi, d };
  });
  if (gapBest && gapBest.d > 1) {
    const v = votesOf(gapBest.d);
    add(`פער של ${gapBest.d} מנדטים על אותה מפלגה, באותו שבוע`,
      `<b>${esc(partyMeta(gapBest.id).name)}</b> קיבלה ${gapBest.hi.v} מנדטים אצל ${esc(gapBest.hi.p.channelHebrewName)} ו־${gapBest.lo.v} בלבד אצל ${esc(gapBest.lo.p.channelHebrewName)} — בהפרש של ימים בודדים. מישהו כאן טועה ב־<b>${fmt(v)} קולות</b>, ${scaleOf(v)}. זו בדיוק הסיבה שהאתר לא מסתמך על סקר בודד.`,
      "מקור: הסקר הגבוה מול הנמוך בחלון הנוכחי");
  }

  /* 3. קו ה־61 */
  const over = polls.filter(p => coalOf(p) >= 61).length;
  add(over ? `${over} מתוך ${polls.length} סקרים נתנו רוב לגוש הימני–חרדי` : `אף סקר בשבועיים לא נתן רוב לאף גוש`,
    over
      ? `בחלון הנוכחי ${over} סקרים הציבו את ימין+חרדים על 61 ומעלה, ו־${polls.length - over} לא. אותה מדינה, אותו שבוע, שתי מסקנות הפוכות לגמרי על השאלה היחידה שקובעת מי מרכיב ממשלה.`
      : `כל ${polls.length} הסקרים בחלון הנוכחי הותירו את ימין+חרדים ואת שמאל+ערבים מתחת ל־61. מבחינה מתמטית זה אומר שהמפלגות הערביות מחזיקות את המפתח — תרחיש שאף אחד מהצדדים לא מוכן לומר בקול.`,
    "מקור: ספירת הסקרים בחלון 14 הימים");

  /* 4. מרצ 2022 */
  const w = S.regions.wasted;
  add(`${fmt(w.meretzGap)} קולות שינו את זהות הממשלה`,
    `מרצ עצרה על ${fmt(w.meretz)} קולות — <b>${fmt(w.meretzGap)}</b> מתחת לאחוז החסימה. זה 0.09% מהקולות, ובערך מספר האנשים שנכנסים ל־${scaleOf(w.meretzGap) || "אולם ספורט בינוני"}. בגללם ירדו לטמיון ${fmt(w.total)} קולות של מרצ ובל״ד יחד — יותר משבעה מנדטים בחישוב גולמי — והפער בין הגושים, שעמד על ${fmt(w.blocGap)} קולות בלבד, הפך ל־8 מנדטים.`,
    "מקור: Times of Israel · ועדת הבחירות המרכזית");

  /* 5. הבנק החרדי */
  const harPoll = avg(S.hist.polls.map(p => p.p.shas + p.p.utj));
  const harGap = 18 - harPoll;
  add(`${fmt(votesOf(harGap))} קולות חרדים שהסקרים לא מצאו`,
    `39 סקרים פורסמו בחודש האחרון לפני בחירות 2022. בממוצע הם נתנו לש״ס וליהדות התורה יחד <b>${r1(harPoll)}</b> מנדטים. בקלפי הן קיבלו <b>18</b>. הפער — ${r1(harGap)} מנדטים, כ־${fmt(votesOf(harGap))} קולות — לא היה טעות של מכון אחד. הוא חזר כמעט בכל סקר, בכל מכון, לאורך כל החודש.`,
    "מקור: חישוב על 39 סקרי הכיול · ועדת הבחירות");

  /* 6. ערוץ 14 מול השאר */
  const c14 = polls.filter(p => firmOf(p.sourceId).firm === "Direct Polls");
  const rest = polls.filter(p => firmOf(p.sourceId).firm !== "Direct Polls");
  if (c14.length && rest.length) {
    const a = avg(c14.map(p => seatOf(p, "likud"))), b = avg(rest.map(p => seatOf(p, "likud")));
    const d = Math.abs(a - b);
    if (d >= 1) add(`${r1(d)} מנדטים של הליכוד תלויים בשאלה מי שואל`,
      `בחלון הנוכחי, דירקט פולס (ערוץ 14) מודד את הליכוד על <b>${r1(a)}</b> מנדטים בממוצע. כל שאר המכונים יחד מודדים <b>${r1(b)}</b>. הפער הקבוע הזה שווה כ־<b>${fmt(votesOf(d))} קולות</b>, והוא חוזר על עצמו סקר אחרי סקר — כלומר הוא לא רעש, הוא שיטה.`,
      "מקור: ממוצעי החלון הנוכחי לפי מכון");
  }

  /* 7. המפלגה הכי משעממת */
  const ranges = ids.map(id => {
    const vals = polls.map(p => seatOf(p, id)).filter(v => v > 0);
    return { id, min: Math.min(...vals), max: Math.max(...vals), n: vals.length };
  }).filter(x => x.n >= 5);
  if (ranges.length) {
    const calm = [...ranges].sort((a, b) => (a.max - a.min) - (b.max - b.min))[0];
    const wild = [...ranges].sort((a, b) => (b.max - b.min) - (a.max - a.min))[0];
    add(`המפלגה הכי צפויה בישראל השבוע: ${partyMeta(calm.id).name}`,
      `${calm.n} סקרים, ${calm.n} מכונים ומתודולוגיות שונות — וכולם נתנו ל<b>${esc(partyMeta(calm.id).name)}</b> בין ${calm.min} ל־${calm.max} מנדטים. בקצה השני, <b>${esc(partyMeta(wild.id).name)}</b> נעה בין ${wild.min} ל־${wild.max}: טווח של ${wild.max - wild.min} מנדטים, כ־${fmt(votesOf(wild.max - wild.min))} קולות, תלוי במי ענה לטלפון.`,
      "מקור: טווח הערכים בחלון הנוכחי");
  }

  /* 8. מחיר מנדט */
  add(`מנדט אחד = ${fmt(seatCost())} בני אדם`,
    `ב־2022 הצביעו ${fmt(S.regions.national.valid)} אזרחים, כך שמנדט אחד עלה כ־<b>${fmt(seatCost())} קולות</b> — ${scaleOf(seatCost())}. בפעם הבאה שסקר מזיז מפלגה במנדט אחד, זכרו שמדובר בעיר שלמה שהחליפה דעה, או — הרבה יותר סביר — במדגם של 500 איש שבו שני אנשים ענו אחרת.`,
    "מקור: ועדת הבחירות · Israel Policy Forum");

  /* 9. מדגם של 500 */
  add(`500 אנשים מחליטים איך תיראה הכותרת`,
    `סקר טלוויזיה טיפוסי בישראל דוגם כ־<b>500 נשאלים</b>. טעות הדגימה שלו גדולה מ־4% — כלומר <b>גדולה מאחוז החסימה עצמו</b> (3.25%). זה אומר שהמשפט ״מפלגה X לא עוברת״ הוא לעיתים קרובות מידע על גודל המדגם, לא על המפלגה.`,
    "מקור: Israel Policy Forum — Israeli Election Polls & Pollsters");

  /* 10. גוש נתניהו אז והיום */
  const est = forecast(S.mode);
  const nowCoal = largestRemainder(est.parties);
  let coalNow = 0; Object.entries(nowCoal).forEach(([id, n]) => { if (["Right", "Haredi"].includes(partyMeta(id).alignment)) coalNow += n; });
  const d10 = 64 - coalNow;
  add(`${Math.abs(d10)} מנדטים מפרידים בין 2022 להיום`,
    `ב־1 בנובמבר 2022 קיבל גוש נתניהו <b>64 מנדטים</b>. התחזית המשוקללת של ברומטר היום עומדת על <b>${coalNow}</b>. הפרש של ${Math.abs(d10)} מנדטים הוא כ־${fmt(votesOf(Math.abs(d10)))} קולות — ${scaleOf(votesOf(Math.abs(d10)))}. וכל זה עוד לפני שנפתחה קלפי אחת.`,
    "מקור: תוצאות 2022 מול התחזית הנוכחית");

  return A;
}

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
  const eligible2026 = sec.eligible2022 * Math.pow(1 + sec.growth, years);
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
      p: `בערים החרדיות (${H.turnout.cities.join(", ")}), לעומת ${pct(H.turnout.national2022)} ארצי ו־${pct(H.turnout.arab2022)} ביישובים הערביים. ב־2021 זה היה ${pct(H.turnout.harediCities2021)} — הכיוון הוא למעלה, לא למטה.`,
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
    <label class="slider"><span>שיעור הצבעה במגזר<b class="num">${pct(st.turnout * 100)}</b></span>
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
  $("#haredi-verdict").innerHTML = `
    <p class="kicker">המבחן</p>
    <h3 style="margin:4px 0 12px">מה היה צריך לקרות כדי שהסקרים יצדקו</h3>
    <p style="color:var(--ink-2);font-size:.93rem;margin:0 0 14px">הסקרים בחלון הנוכחי נותנים לש״ס ולג׳ יחד <b>${r1(pollSum)}</b> מנדטים. כדי שהמספר הזה יתממש, אחד משני הדברים האלה צריך לקרות — ואף אחד מהם לא קרה מעולם:</p>
    <div class="lbars">
      <div class="lbar" style="--c:#17457F"><span>שיעור ההצבעה יצנח ל־</span><i><b style="--w:${clamp(needTurnout)}%"></b></i><span class="v">${pct(needTurnout)}</span></div>
      <div class="lbar" style="--c:#B8862B"><span>או שהנאמנות תיפול ל־</span><i><b style="--w:${clamp(needLoyalty)}%"></b></i><span class="v">${pct(needLoyalty)}</span></div>
    </div>
    <p style="color:var(--ink-2);font-size:.88rem;margin:14px 0 0">לשם השוואה: שיעור ההצבעה הנמוך ביותר שנמדד בערים החרדיות בעשור הוא ${pct(H.turnout.harediCities2021)}, והנאמנות לא ירדה מ־${pct(H.loyalty[0].harediLists)} באף מדידה. ${needTurnout < H.turnout.harediCities2021 - 5 || needLoyalty < H.loyalty[0].harediLists - 5 ? "כלומר: הסקרים מתמחרים אירוע חסר תקדים." : "כלומר: הסקרים מתמחרים ירידה אפשרית, אך חריגה."}</p>
    <div class="notice warm" style="margin-top:16px"><span class="ic">↓</span><p style="margin:0">ולמרות כל זה, האתר <b>לא</b> קובע ${modelSum} מנדטים — מה שהמודל הדמוגרפי המלא נותן. הרצפה שנקבעה היא <b>${r1(floors)}</b>: כמעט זהה לחישוב מהמגזר שלמעלה (${r1(st.total)}), וזהה לתוצאה שהתקבלה בפועל בקלפי ב־2022 (18). עדיף לטעות בכיוון השמרני.</p></div>
    <p style="margin:12px 0 0;color:var(--ink-3);font-size:.78rem">שתי דרכים שונות לחשב, ושתיהן מגיעות לאותו אזור: החישוב מהמגזר שלמעלה נותן ${r1(st.total)} מנדטים, ו<a href="#/demography" style="color:var(--navy)">המודל הדמוגרפי המלא</a> נותן לגוש החרדי ${modelSum} מנדטים. אף אחד מהם לא נותן את ${r1(pollSum)} שהסקרים אומרים.</p>`;

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
  }).join("") + `<p style="margin:10px 0 0;color:var(--ink-2);font-size:.85rem">ממוצע 39 סקרי הכיול מול התוצאה בפועל. ש״ס פוספסה ב־<b>${r1(11 - avg(S.hist.polls.map(p => p.p.shas)))}</b> מנדטים; ג׳ נמדדה במדויק. הפער כולו התרכז במפלגה אחת — וזה בדיוק מה שקורה כשמדגם קטן מפספס תת־קבוצה.</p>`;

  $("#haredi-sources").innerHTML = Object.values(H.sources).map(x =>
    `<a class="card pad" href="${esc(x.url)}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;justify-content:space-between;gap:14px;align-items:center">
      <span style="font-size:.9rem;font-weight:600">${esc(x.name)}</span><span aria-hidden="true" style="color:var(--navy)">↗</span></a>`).join("");

  /* wiring */
  const wire = (id, key) => $(id).addEventListener("input", e => { S[key] = Number(e.target.value); renderHaredi(); });
  wire("#har-turnout", "harTurnout"); wire("#har-loyalty", "harLoyalty");
  $("#har-reset").addEventListener("click", () => { S.harTurnout = null; S.harLoyalty = null; renderHaredi(); });
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
