/* אזור הניהול: כניסה, הזנת סקר או מדגם, רשימת הסקרים ומחיקה, סימולטור התחזית ונתוני צפייה. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const names = { home: 'תמונת מצב', forecast: 'תחזית', polls: 'מגמות בסקרים', 'polls/list': 'כל הסקרים', 'polls/gap': 'פערי הסקרים', 'polls/channels': 'סקרים לפי ערוצים', 'polls/firms': 'סקרים לפי מכונים', 'polls/parties': 'סקרים לפי מפלגות', 2022: 'דיוק המכונים', map: 'מפת ההצבעה', crossover: 'כמה עברו צד', haredi: 'תרחיש חרדי', demography: 'דמוגרפיה', regions: 'מפת ההצבעה', method: 'שיטת החישוב', live: 'ליל הבחירות', results: 'תוצאות אמת' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = v => new Date(v).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
const r1 = x => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
const signed = x => `${x > 0 ? '+' : x < 0 ? '−' : ''}${r1(Math.abs(x))}`;
let config = null, pending = null, busy = false;

function status(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data;
  try { data = await r.json(); } catch { throw Error('מערכת הניהול אינה פעילה באירוח הזה. יש לפרסם את הגרסה עם שרת הניהול ב־Netlify.'); }
  if (!r.ok) throw Error(data.error || 'הבקשה לא הושלמה.');
  return data;
}

/* ---------- לשוניות ---------- */
function showTab(tab) {
  $$('.admin-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
  if (tab === 'polls') loadPolls();
  if (tab === 'sim') startSim();
  if (tab === 'usage') loadUsage();
}
$$('.admin-tabs [data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- מצב הנתונים ---------- */
async function loadState() {
  config = await api('/api/admin/state');
  $('#data-date').textContent = 'נתוני האתר · ' + date(config.generatedAt);
  $('#latest-poll').textContent = 'הסקר האחרון: ' + new Date(config.latestPollDate).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  $('#last-check').textContent = config.lastCheck ? 'בדיקה אחרונה: ' + date(config.lastCheck.at) + ' · ' + ({ complete: 'הושלמה', partial: 'חלקית', error: 'המקור לא החזיר נתונים' }[config.lastCheck.status] || '') : '';
}

/* ---------- הזנת סקר: המפלגות מהגדולה לקטנה, הקטנות מקופלות ---------- */
const exitChannels = new Set(['kan_news', 'channel_12', 'channel_13', 'channel_14', 'i24news']);
function updateSourceOptions() {
  const meta = Object.fromEntries((config.firms || []).map(f => [f.id, f.he])), sample = $('#entry-kind').value === 'sample', selected = $('#entry-source').value;
  $('#entry-source').innerHTML = '<option value="">בחרו כלי תקשורת</option>' + Object.entries(config.outlets).filter(([id]) => !sample || exitChannels.has(id)).map(([id, m]) => `<option value="${esc(id)}">${esc(m.outlet)} · ${esc(meta[m.firm] || m.firm)}</option>`).join('');
  if ([...$('#entry-source').options].some(o => o.value === selected)) $('#entry-source').value = selected;
}
function partyRow(p) {
  const side = p.alignment === 'Coalition' ? ' coal' : p.alignment === 'Opposition' ? ' opp' : '';
  return `<label class="party-row${side}"><span title="${esc(p.name)}">${esc(p.name)}${p.average ? `<small>~${r1(p.average)}</small>` : ''}</span><input type="number" min="0" max="120" step="1" inputmode="numeric" data-party="${esc(p.id)}" aria-label="מנדטים ל${esc(p.name)}"></label>`;
}
function buildForm() {
  updateSourceOptions();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  $('#entry-date').value = today; $('#entry-date').max = today;
  const parties = [...config.parties].sort((a, b) => (b.average || 0) - (a.average || 0));
  const ranked = parties.some(p => p.average != null);                // שרת ישן בלי ממוצעים: כל המפלגות גלויות
  const main = ranked ? parties.filter(p => (p.average || 0) >= 1) : parties, small = ranked ? parties.filter(p => (p.average || 0) < 1) : [];
  $('#party-inputs').innerHTML = main.map(partyRow).join('');
  $('#party-inputs-more').innerHTML = small.map(partyRow).join('');
  $('#party-more-count').textContent = small.length;
  $('#party-more').hidden = !small.length;
  updateTotal();
}
function values() { return $$('[data-party]').filter(e => e.value !== '').map(e => ({ id: e.dataset.party, mandates: Number(e.value) })); }
function updateTotal() {
  const rows = values(), total = rows.reduce((s, p) => s + p.mandates, 0), valid = total === 120 && rows.every(p => Number.isInteger(p.mandates) && p.mandates >= 0 && p.mandates <= 120);
  $('#seat-total').textContent = `${total} / 120`; $('#seat-total').classList.toggle('valid', valid); $('#review-entry').disabled = !valid;
}
$('#poll-form').addEventListener('input', e => { if (e.target.matches('[data-party]')) updateTotal(); });
$('#entry-kind').onchange = () => { $('#sample-note').hidden = $('#entry-kind').value !== 'sample'; updateSourceOptions(); };
$('#poll-form').onsubmit = e => {
  e.preventDefault();
  pending = { kind: $('#entry-kind').value, sourceId: $('#entry-source').value, date: $('#entry-date').value, sourceUrl: $('#entry-url').value, parties: values() };
  if (pending.parties.reduce((s, p) => s + p.mandates, 0) !== 120) return;
  $('#review-description').textContent = `${pending.kind === 'sample' ? 'מדגם' : 'סקר'} · ${config.outlets[pending.sourceId].outlet} · ${pending.date} · ${pending.sourceUrl}`;
  $('#review-results').innerHTML = pending.parties.filter(p => p.mandates > 0).sort((a, b) => b.mandates - a.mandates).map(p => `<div class="review-row"><span>${esc(config.parties.find(x => x.id === p.id).name)}</span><b>${p.mandates}</b></div>`).join('');
  $('#poll-form').hidden = true; $('#review').hidden = false; $('#publish-entry').focus();
};
$('#edit-entry').onclick = () => { $('#review').hidden = true; $('#poll-form').hidden = false; pending = null; };
$('#publish-entry').onclick = async () => {
  if (!pending || busy) return;
  busy = true; $('#publish-entry').disabled = true; status('שומר את הנתונים…');
  try {
    const result = await api('/api/admin/save', pending);
    status(result.message); pending = null; $('#review').hidden = true; $('#poll-form').hidden = false;
    $('#entry-url').value = ''; buildForm(); await loadState(); sim.stale = true;
  } catch (e) { status(e.message, true); } finally { busy = false; $('#publish-entry').disabled = false; }
};

/* ---------- רשימת הסקרים ומחיקה ---------- */
async function loadPolls() {
  $('#poll-list').innerHTML = '<tr><td colspan="5" class="small">טוען…</td></tr>';
  try {
    const { polls } = await api('/api/admin/polls');
    $('#poll-list').innerHTML = polls.map(p => `<tr>
      <td>${esc(p.date)}</td>
      <td title="${esc(p.parties.map(x => `${x.name} ${x.mandates}`).join(' · '))}">${esc(p.outlet)}${p.sourceUrl ? ` <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener" class="small">מקור</a>` : ''}</td>
      <td class="n">${r1(p.coalition)}</td>
      <td>${p.manual ? '<span class="badge">ידני</span>' : '<span class="badge auto">אוטומטי</span>'}</td>
      <td class="n"><button type="button" class="btn danger small-btn" data-delete="${esc(p.id)}" data-label="${esc(`${p.outlet} מ־${p.date}`)}">מחיקה</button></td></tr>`).join('') || '<tr><td colspan="5" class="small">אין סקרים.</td></tr>';
  } catch (e) { $('#poll-list').innerHTML = `<tr><td colspan="5" class="small">${esc(e.message)}</td></tr>`; }
}
$('#reload-polls').onclick = loadPolls;
$('#poll-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-delete]'); if (!b || busy) return;
  if (!confirm(`למחוק את הסקר של ${b.dataset.label}? הוא יוסר מהאתר מיד.`)) return;
  busy = true; b.disabled = true; status('מוחק…');
  try { const r = await api('/api/admin/delete', { id: b.dataset.delete }); status(r.message); await loadPolls(); await loadState(); sim.stale = true; }
  catch (err) { status(err.message, true); b.disabled = false; }
  finally { busy = false; }
});

/* ---------- סימולטור התחזית (מנוע האתר ב־Worker) ---------- */
const RIGHTWING = ['channel_14', 'i24news'];
const sim = { worker: null, seq: 0, waiting: new Map(), shifts: {}, base: null, sources: [], stale: false, timer: null };
function simCall(msg) {
  return new Promise((resolve, reject) => { const id = ++sim.seq; sim.waiting.set(id, { resolve, reject }); sim.worker.postMessage({ ...msg, id }); });
}
function makeWorker() {
  const v = id => new URL($(id).href).searchParams.get('v') || '';
  const w = new Worker(`assets/admin-sim-worker.js?v=${v('#sim-app')}`);
  w.onmessage = ({ data }) => { const p = sim.waiting.get(data.id); if (!p) return; sim.waiting.delete(data.id); data.error ? p.reject(Error(data.error)) : p.resolve(data); };
  w.onerror = e => { $('#sim-result').innerHTML = `<p class="small">מנוע התחזית לא נטען: ${esc(e.message || '')}</p>`; };
  return w;
}
async function startSim() {
  if (sim.worker && !sim.stale) return;
  if (sim.worker) sim.worker.terminate();
  sim.worker = makeWorker(); sim.stale = false; sim.shifts = {};
  $('#sim-result').innerHTML = '<p class="small">טוען את מנוע התחזית…</p>';
  try {
    sim.base = (await simCall({ type: 'run', shifts: {} })).result;
    const by = new Map();
    sim.base.window.forEach(p => { const s = by.get(p.sourceId) || { id: p.sourceId, outlet: p.outlet, firm: p.firm, values: [] }; s.values.push(p.coalition); by.set(p.sourceId, s); });
    sim.sources = [...by.values()].map(s => ({ ...s, avg: s.values.reduce((t, x) => t + x, 0) / s.values.length })).sort((a, b) => b.avg - a.avg);
    renderControls(); renderResult(sim.base); renderTable();
  } catch (e) { $('#sim-result').innerHTML = `<p class="small">${esc(e.message)}</p>`; }
}
const others = () => sim.sources.filter(s => !RIGHTWING.includes(s.id)).map(s => s.id);
const groupAvg = ids => { const xs = sim.sources.filter(s => ids.includes(s.id)); const n = xs.reduce((t, s) => t + s.values.length, 0); return n ? xs.reduce((t, s) => t + s.values.reduce((a, x) => a + x + (sim.shifts[s.id] || 0), 0), 0) / n : 0; };
function sliderRow(key, name, sub, value, base, group = false) {
  return `<div class="sim-row${group ? ' group' : ''}" data-row="${esc(key)}"><span class="name">${esc(name)}<small>${esc(sub)}</small></span>
    <button type="button" data-step="-0.5" aria-label="פחות לקואליציה">−</button>
    <input type="range" min="-6" max="6" step="0.5" value="${value}" aria-label="שינוי לקואליציה · ${esc(name)}">
    <button type="button" data-step="0.5" aria-label="יותר לקואליציה">+</button>
    <output><b>${r1(base + value)}</b>${value ? signed(value) : 'כמו היום'}</output></div>`;
}
function groupValue(ids) { const vals = ids.map(id => sim.shifts[id] || 0); return vals.every(v => v === vals[0]) ? vals[0] || 0 : 0; }
function renderControls() {
  const rest = others(), rw = sim.sources.filter(s => RIGHTWING.includes(s.id)).map(s => s.id);
  $('#sim-groups').innerHTML = (rest.length ? sliderRow('others', 'כל הערוצים חוץ מערוץ 14 ו־i24', `ממוצע לקואליציה · ${rest.length} כלי תקשורת`, groupValue(rest), groupAvg(rest) - groupValue(rest), true) : '')
    + (rw.length ? sliderRow('rightwing', 'ערוץ 14 ו־i24 יחד', 'ממוצע לקואליציה', groupValue(rw), groupAvg(rw) - groupValue(rw), true) : '');
  $('#sim-sources').innerHTML = sim.sources.map(s => sliderRow(s.id, s.outlet, `${s.firm} · ${s.values.length > 1 ? `${s.values.length} סקרים, ממוצע` : 'סקר אחד'}`, sim.shifts[s.id] || 0, s.avg)).join('');
}
function idsOf(key) { return key === 'others' ? others() : key === 'rightwing' ? sim.sources.filter(s => RIGHTWING.includes(s.id)).map(s => s.id) : [key]; }
function setShift(key, value) {
  value = Math.max(-6, Math.min(6, Math.round(value * 2) / 2));
  idsOf(key).forEach(id => { sim.shifts[id] = value; });
  renderControls();
  clearTimeout(sim.timer); sim.timer = setTimeout(runSim, 120);
}
$('#sim-groups').addEventListener('input', e => { const row = e.target.closest('[data-row]'); if (row && e.target.type === 'range') setShift(row.dataset.row, Number(e.target.value)); });
$('#sim-sources').addEventListener('input', e => { const row = e.target.closest('[data-row]'); if (row && e.target.type === 'range') setShift(row.dataset.row, Number(e.target.value)); });
for (const box of ['#sim-groups', '#sim-sources']) $(box).addEventListener('click', e => {
  const b = e.target.closest('[data-step]'), row = e.target.closest('[data-row]'); if (!b || !row) return;
  const cur = Number(row.querySelector('input').value); setShift(row.dataset.row, cur + Number(b.dataset.step));
});
$('#sim-reset').onclick = () => { sim.shifts = {}; renderControls(); runSim(); };
async function runSim() {
  try { renderResult((await simCall({ type: 'run', shifts: sim.shifts })).result); }
  catch (e) { $('#sim-result').innerHTML = `<p class="small">${esc(e.message)}</p>`; }
}
function renderResult(r) {
  const d = r.coalition - sim.base.coalition, changed = Object.values(sim.shifts).some(Boolean);
  $('#sim-result').innerHTML = `<div class="sim-big"><div class="c"><b>${r.coalition}</b><span>מפלגות הקואליציה</span></div><div class="o"><b>${120 - r.coalition}</b><span>מפלגות האופוזיציה</span></div></div>
    <div class="sim-meta">${changed ? `<span class="sim-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? `${signed(d)} מנדטים לקואליציה מול היום (${sim.base.coalition})` : `ללא שינוי במנדטים מול היום (${sim.base.coalition})`}</span><br>` : '<b>התחזית של היום.</b> הזיזו ערוץ כדי לראות מה ישתנה.<br>'}
    מרכז־שמאל <b>${r.centerLeft}</b> · הרשימות הערביות <b>${r.arab}</b><br>
    קואליציה <b>${r1(r.coalitionShare)}%</b> מהמצביעים · הסקרים לבדם <b>${r1(r.pollsShare)}%</b> · הרצפה <b>${r1(r.floorShare)}%</b>${r.lift > 0.005 ? ` — <b>פועלת</b>, מוסיפה ${r1(r.lift)} נקודות` : ' — לא פועלת'}</div>
    <div class="sim-parties">${r.parties.map(p => `<span class="${p.coalition ? 'c' : ''}">${esc(p.name)} ${p.seats}</span>`).join('')}</div>`;
}
async function renderTable() {
  const rest = others();
  if (!rest.length) { $('#sim-table').innerHTML = '<tr><td colspan="5" class="small">אין סקרים של ערוצים אחרים בחלון.</td></tr>'; return; }
  try {
    const { rows } = await simCall({ type: 'table', others: rest });
    const base = groupAvg(rest) - groupValue(rest);
    $('#sim-table').innerHTML = rows.map(r => `<tr class="${r.shift ? '' : 'is-now'}"><td class="n">${r1(base + r.shift)}${r.shift ? '' : ' <small>היום</small>'}</td><td class="n">${r1(r.coalitionShare)}%</td><td class="n"><b>${r.coalition}</b></td><td class="n">${120 - r.coalition} <small>(${r.centerLeft} + ${r.arab})</small></td><td>${r.lift > 0.005 ? `פועלת +${r1(r.lift)}` : '—'}</td></tr>`).join('');
  } catch (e) { $('#sim-table').innerHTML = `<tr><td colspan="5" class="small">${esc(e.message)}</td></tr>`; }
}

/* ---------- צפייה באתר ---------- */
async function loadUsage() {
  try {
    const d = await api('/api/analytics/summary');
    $('#stats').innerHTML = [[d.sessions, 'ביקורים'], [d.views, 'פתיחות דפים'], [Math.round(d.seconds / 60), 'דקות פעילות']].map(([v, t]) => `<div><b>${Number(v).toLocaleString('he-IL')}</b><span>${t}</span></div>`).join('');
    $('#pages').innerHTML = d.pages.map(p => `<tr><th>${names[p.page] || 'אחר'}</th><td class="n">${Number(p.views)}</td><td class="n">${Number(p.sessions)}</td><td class="n">${Math.round(p.seconds / 60)}</td><td class="n">${Number(p.average)} שניות</td></tr>`).join('');
    $('#days').innerHTML = d.days.map(p => `<tr><td>${esc(p.day)}</td><td class="n">${Number(p.sessions)}</td><td class="n">${Number(p.views)}</td><td class="n">${Math.round(p.seconds / 60)}</td></tr>`).join('');
    $('#usage-status').textContent = d.views ? 'עודכן עכשיו' : 'טרם נאספה פעילות מאז הפעלת המדידה.';
  } catch (e) { $('#usage-status').textContent = e.message; }
}
$('#refresh-usage').onclick = loadUsage;

/* ---------- כניסה ויציאה ---------- */
async function enter() {
  await loadState();
  $('#login').hidden = true; $('#dashboard').hidden = false; $('#logout').hidden = false;
  buildForm(); status('');
}
$('#login').addEventListener('submit', async e => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true; status('מתחבר…');
  try { await api('/api/admin/session', { token: $('#token').value }); $('#token').value = ''; await enter(); }
  catch (err) { status(err.message, true); } finally { btn.disabled = false; }
});
$('#logout').onclick = async () => {
  await api('/api/admin/logout', {});
  $('#dashboard').hidden = true; $('#logout').hidden = true; $('#login').hidden = false; config = null; pending = null;
  if (sim.worker) { sim.worker.terminate(); sim.worker = null; }
  status('יצאת מהניהול.');
};
$('#refresh-polls').onclick = async () => {
  if (busy) return; busy = true; $('#refresh-polls').disabled = true; status('בודק את מקור הסקרים… הפעולה עשויה להימשך כחצי דקה.');
  try { const r = await api('/api/admin/refresh', {}); status(r.message); await loadState(); sim.stale = true; }
  catch (e) { status(e.message, true); } finally { busy = false; $('#refresh-polls').disabled = false; }
};
// Reuse an authenticated HttpOnly session; no secret is stored in JS storage.
api('/api/admin/state').then(async data => { config = data; await enter(); }).catch(() => { $('#login').hidden = false; });
