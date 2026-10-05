/* כל הסקרים · מגמות והשוואות — כרטיס אחד בגובה המסך:
   שורה אחת של מקרא וכלים, בחירת לוגואים (בהשוואות), והגרף או הטבלה בכל הגובה שנשאר.
   מבט כולל = הגושים לפי בסיס המספרים שנבחר. ההשוואות לפי ערוץ / מכון / מפלגה
   משתמשות בסקרים כפי שפורסמו: רשימה שלא נמדדה נשארת חסרה (לא 0), והקו נקטע
   כשהרכב הרשימה משתנה. */
const EXPLORER_COLORS = ['#245fa6', '#c05a36', '#168575', '#805ca3', '#ac801a'];
const EXPLORER_MODES = { overview: 'מבט כולל', channels: 'ערוצים', firms: 'מכונים', parties: 'מפלגות' };
const EXPLORER_MAX = 5;
const EXPLORER_OUTLET_LOGOS = { 'חדשות 12':'assets/logos/channel12.svg', 'חדשות 13':'assets/logos/channel13.svg', 'ערוץ 14':'assets/logos/channel14.png', 'כאן 11':'assets/logos/kan11.svg', 'i24NEWS':'assets/logos/i24news.png', 'ערוץ 16':'assets/logos/channel-16.png', 'וואלה':'assets/logos/walla.png', 'זמן ישראל':'assets/logos/zman-israel.png', 'גלי צה״ל':'assets/logos/galatz.png' };
const EXPLORER_NOTE = 'כל נקודה היא תאריך שבו פורסם סקר. כשיש כמה סקרים באותו יום מוצג ממוצע, עם משקל שווה לכל מכון. הקווים מחברים מדידות בלבד ונקטעים כששם הרשימה או הרכבה משתנים; אין נתון בתאריך מסוים אינו אפס (בטבלה: —). בהשוואת מפלגות, הממוצע בכל יום כולל רק מכונים שמדדו את המפלגה. המספרים במנדטים.';

function explorerEntities(P, mode) {
  if (mode === 'parties') return P.parties.map(p => ({ key: p.id, label: p.name, logo: P.polls.slice().reverse().flatMap(q=>q.parties).find(x=>normId(x.id)===p.id&&x.logoUrl)?.logoUrl || partyMeta(p.id).logo, color: p.color, party: true }));
  const by = new Map();
  P.polls.slice().reverse().forEach(p => {
    const f = firmOf(p.sourceId), key = mode === 'channels' ? p.channelHebrewName : f.firm;
    if (!by.has(key)) by.set(key, { key, label: mode === 'channels' ? key : f.meta.he, logo: mode === 'channels' ? EXPLORER_OUTLET_LOGOS[key] || S.firms.outletLogos[key] : f.meta.logo, short: f.meta.short });
  });
  return [...by.values()];
}

function explorerLogo(e) {
  /* מפלגה: תמונת המנהיג (מקומית, מזוהה גם בעיגול קטן); אחרת — הלוגו, וראשי התיבות עד שהוא נטען */
  const portrait = e.party ? S.leaders?.[e.key] : '';
  if (portrait) return `<span class="ex-avatar"><img class="ex-portrait-image" src="${esc(portrait)}" alt="" loading="lazy"></span>`;
  return `<span class="ex-avatar"><span class="ex-logo-fallback">${esc(e.short || initials(e.label))}</span>${e.logo ? `<img class="ex-logo-image" src="${esc(e.logo)}" alt="" loading="lazy" onload="this.parentNode.classList.add('ex-logo-ready')" onerror="this.remove()">` : ''}</span>`;
}

function explorerState(P) {
  if (!EXPLORER_MODES[S.exploreMode]) S.exploreMode = 'overview';
  if (S.exploreView !== 'table') S.exploreView = 'chart';
  S.exploreSelections ||= {};
  const mode = S.exploreMode, entities = mode === 'overview' ? [] : explorerEntities(P, mode);
  if (!S.exploreSelections[mode]) S.exploreSelections[mode] = entities.slice(0, 2).map(e => e.key);
  /* לפי סדר הבחירה — כך הצבע של מה שכבר נבחר לא משתנה כשמוסיפים עוד */
  const selected = S.exploreSelections[mode].map(k => entities.find(e => e.key === k)).filter(Boolean).slice(0, EXPLORER_MAX);
  S.exploreMetric ||= 'Right';
  return { mode, entities, selected, metric: S.exploreMetric, view: S.exploreView };
}

function explorerLines(P, state) {
  const end = parsePollDate(P.polls.at(-1)), start = S.trackRange === 'month' ? end - 29 * DAY_MS : parsePollDate(P.polls[0]);
  return state.selected.map((e, i) => {
    const rows = P.polls.filter(p => parsePollDate(p) >= start && (state.mode === 'parties' || (state.mode === 'channels' ? p.channelHebrewName === e.key : firmOf(p.sourceId).firm === e.key)));
    const byDate = new Map(), metric = state.mode === 'parties' ? e.key : state.metric;
    rows.forEach(p => {
      const v = ['Right', 'Left', 'Arabs'].includes(metric) ? pollVector(p).blocs[metric] : pollValue(p, metric);
      if (v === null) return;
      const t = parsePollDate(p), firm = firmOf(p.sourceId).firm;
      if (!byDate.has(t)) byDate.set(t, new Map());
      const byFirm = byDate.get(t); if (!byFirm.has(firm)) byFirm.set(firm, []);
      byFirm.get(firm).push({ v, p });
    });
    const points = [...byDate].sort((a,b) => a[0]-b[0]).map(([t, firms]) => {
      const groups = [...firms.values()], polls = groups.flat();
      const v = groups.reduce((sum,g) => sum + g.reduce((n,x) => n + x.v,0)/g.length,0)/groups.length;
      const signature = ['Right','Left','Arabs'].includes(metric) ? '' : [...new Set(polls.map(x=>partySignature(x.p,metric)))].sort().join(';;');
      return { t, v, n: polls.length, firms: groups.length, polls: polls.map(x => x.p), signature };
    });
    return { ...e, color: e.color || EXPLORER_COLORS[i], points, last: points.at(-1) };
  });
}

/* מפלגות לפי בסיס המספרים שנבחר: ממוצע נע, משוקלל אמינות או תחזית הברומטר — נקודה אחת ביום (האחרונה).
   רשימה שלא הופיעה בסקר נספרת 0, כמו בשאר האתר. */
function explorerPartyLines(M, state) {
  const end = M.now.t, start = S.trackRange === 'month' ? end - 29 * DAY_MS : -Infinity;
  const day = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const byDay = new Map(); M.series.filter(s => s.t >= start).forEach(s => byDay.set(day(s.t), s));
  const series = [...byDay.values()];
  return state.selected.map((e, i) => {
    const points = series.map(s => ({ t: s.t, v: s.parties[e.key] || 0, n: s.n, firms: s.firms, polls: [], signature: '' }));
    return { ...e, color: e.color || EXPLORER_COLORS[i], points, last: points.at(-1) };
  });
}
const explorerLinesFor = (P, M, state) => state.mode === 'parties' && M ? explorerPartyLines(M, state) : explorerLines(P, state);

/* כל תאריכי הפרסום בטווח, מהחדש לישן; — = לא נמדד בתאריך הזה */
function explorerTable(lines, dates) {
  return `<div class="tablewrap ex-data-table" tabindex="0" role="region" aria-label="נתוני ההשוואה"><table><thead><tr><th scope="col">תאריך</th>${lines.map(l => `<th scope="col" style="--c:${l.color}">${esc(l.label)}</th>`).join('')}</tr></thead><tbody>${dates.map(t => `<tr><th scope="row">${trDay(t)}</th>${lines.map(l => { const p = l.points.find(p => p.t === t); return `<td>${p ? `<b>${trFmt(p.v)}</b>${p.n > 1 ? `<small>${p.n} סקרים</small>` : ''}` : '<span class="ex-na" title="אין מדידה בתאריך זה">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* הגרף בגודל המקום שקיבל (S.trackWidth × S.trackH), כך שהטקסט לא נמתח */
function explorerChart(P, state, M) {
  const lines = explorerLinesFor(P, M, state), valid = lines.filter(l => l.points.length), points = valid.flatMap(l => l.points);
  const dates = [...new Set(points.map(p => p.t))].sort((a, b) => b - a), table = explorerTable(lines, dates);
  if (!points.length) return { lines, dates, table, svg: `<div class="ex-empty">${state.selected.length ? 'אין מדידות בטווח הזה. נסו טווח רחב יותר.' : 'בחרו לוגו אחד או יותר כדי להשוות.'}</div>` };
  const W = Math.max(320, S.trackWidth || 850), H = Math.max(160, S.trackH || 260), m = { l: 34, r: 16, t: 14, b: 26 };
  const t0 = Math.min(...points.map(p => p.t)), t1 = Math.max(t0 + DAY_MS, ...points.map(p => p.t));
  const vals = points.map(p => p.v), isRight = state.mode !== 'parties' && state.metric === 'Right';
  const span = Math.max(...vals) - Math.min(...vals), step = span > 30 ? 10 : span > 12 ? 5 : 2;
  let lo = Math.max(0, Math.floor((Math.min(...vals)-2)/step)*step), hi = Math.ceil((Math.max(...vals)+2)/step)*step;
  if (isRight) { lo = Math.min(lo, 58); hi = Math.max(hi, 64); }
  const x = t => m.l + (W-m.l-m.r)*(t-t0)/(t1-t0), y = v => m.t+(H-m.t-m.b)*(1-(v-lo)/(hi-lo));
  let grid = '';
  for (let v=lo; v<=hi; v+=step) grid += `<line class="tr-grid" x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tr-tick" x="${m.l-7}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  if (isRight) grid += `<line class="tr-ref" x1="${m.l}" x2="${W-m.r}" y1="${y(61)}" y2="${y(61)}"/><text class="tr-ref-label" x="${W-m.r}" y="${y(61)-7}" text-anchor="end">61 · רוב</text>`;
  const ticks = Math.max(2, Math.floor(W/110));
  for (let i=0;i<=ticks;i++) { const t=t0+(t1-t0)*i/ticks; grid += `<text class="tr-tick" x="${x(t)}" y="${H-8}" text-anchor="middle">${trDay(t)}</text>`; }
  const paths = valid.map(l => `<path class="tr-line ex-line" stroke="${l.color}" d="${l.points.map((p,i) => `${i && p.signature===l.points[i-1].signature?'L':'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}"/>${l.points.map(p => `<circle class="ex-point" cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="${l.color}"><title>${esc(l.label)} · ${trDay(p.t)} · ${trFmt(p.v)} מנדטים · ${p.n} סקרים</title></circle>`).join('')}`).join('');
  const svg = `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="השוואת ${esc(lines.map(l=>l.label).join(', '))} לאורך זמן, במנדטים. הנתונים המלאים בתצוגת הטבלה.">${grid}${paths}<line class="tr-cursor" x1="0" x2="0" y1="${m.t}" y2="${H-m.b}" hidden/><rect class="tr-hit" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}"/></svg>`;
  const sub = state.mode === 'parties' && M ? TRACK_BASES[M.basis || 'avg'].label : '';
  return { lines, dates, table, svg, sub, geom: { W, m, t0, t1, x, y } };
}

const exInfo = text => `<span class="tr-info" tabindex="0" role="note" title="${esc(text)}" aria-label="${esc(text)}">ⓘ</span>`;
const exSelect = (attr, label, options, value) => `<select ${attr} aria-label="${esc(label)}">${options.map(([k, l]) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

/* המקרא הוא גם שורת המספרים: במבט הכולל — שלושת הגושים והשינוי בשבועיים;
   בהשוואה — כל מה שנבחר, עם המדידה האחרונה ותאריכה */
function explorerKeys(M, state, lines) {
  if (state.mode === 'overview') return TRACK_BLOCS.map(([k, label]) => {
    const d = trDelta(M.now.blocs[k] - M.before.blocs[k]);
    return `<span class="ex-key${k === 'Arabs' ? ' no-line' : ''}" style="--c:${BLOCS[k].color}"><i></i><span>${label}</span><b>${trFmt(M.now.blocs[k])}</b><em class="${d.cls}" title="שינוי לעומת לפני שבועיים">${d.sym}</em></span>`;
  }).join('');
  return lines.map(l => `<span class="ex-key" style="--c:${l.color}"><i></i><span>${esc(l.label)}</span><b>${l.last ? trFmt(l.last.v) : '—'}</b><small>${l.last ? trDay(l.last.t) : 'אין נתון'}</small></span>`).join('') || '<span class="ex-key-empty">עוד לא נבחר דבר</span>';
}

function explorerTools(P, M, state) {
  const out = [exSelect('data-ex-lens', 'מה להשוות', [['overview', 'מבט כולל · הגושים'], ['parties', 'מפלגות'], ['firms', 'מכונים'], ['channels', 'ערוצים']], state.mode)], basis = M.basis || 'avg';
  if (state.mode !== 'overview' && state.mode !== 'parties') out.push(exSelect('data-ex-metric', 'מה משווים', [['Right','ימין וחרדים'],['Left','מרכז–שמאל'],['Arabs','הרשימות הערביות'],...P.parties.map(p=>[p.id,p.name])], state.metric));
  const series = state.mode === 'overview' || state.mode === 'parties';
  const first = series ? M.series[0].t : parsePollDate(P.polls[0]), last = series ? M.now.t : parsePollDate(P.polls.at(-1));
  if (last - first > 31 * DAY_MS) out.push(exSelect('data-ex-range', 'טווח זמן', [['all', series && basis !== 'avg' ? `מאז ${trDay(first)}` : 'מאז אוגוסט'], ['month', 'חודש אחרון']], S.trackRange));
  out.push(`<div class="switch ex-view" role="group" aria-label="תצוגה"><button type="button" data-ex-view="chart" aria-pressed="${state.view === 'chart'}">גרף</button><button type="button" data-ex-view="table" aria-pressed="${state.view === 'table'}">טבלה</button></div>`);
  out.push(exInfo(state.mode === 'overview' ? `${TRACK_BASES[basis].note} בגרף: ימין וחרדים מול מרכז–שמאל; הרשימות הערביות — במספר בלבד.`
    : state.mode === 'parties' ? `${TRACK_BASES[basis].note} כל קו הוא מפלגה אחת; רשימה שלא הופיעה בסקר נספרת 0, כמו בשאר האתר.` : EXPLORER_NOTE));
  return out.join('');
}

function explorerPicker(state) {
  const full = state.selected.length >= EXPLORER_MAX, colorOf = key => state.lines?.find(l => l.key === key)?.color;
  return `<div class="ex-picker" role="group" aria-label="בחירת ${esc(EXPLORER_MODES[state.mode])} להשוואה, עד ${EXPLORER_MAX}">${state.entities.map(e => {
    const on = state.selected.some(x => x.key === e.key);
    return `<button type="button" class="ex-logo-button" data-ex-entity="${esc(e.key)}" title="${esc(e.label)}" aria-label="${esc(e.label)}" aria-pressed="${on}"${on ? ` style="--c:${colorOf(e.key)}"` : ''}${full && !on ? ' disabled' : ''}>${explorerLogo(e)}</button>`;
  }).join('')}<span class="ex-count" title="לחצו על הלוגואים כדי להוסיף או להסיר">${state.selected.length}/${EXPLORER_MAX}</span></div>`;
}

function renderExplorerHTML(P, M) {
  const state = explorerState(P);
  state.lines = state.mode === 'overview' ? [] : explorerLinesFor(P, M, state);
  S.explorer = { P, M, state };
  const basis = M.basis || 'avg', tabs = state.mode === 'overview' || state.mode === 'parties'
    ? `<div class="ex-tabs" role="tablist" aria-label="על מה מבוססים המספרים">${Object.entries(TRACK_BASES).map(([k, b]) => `<button type="button" role="tab" data-ex-basis="${k}" aria-selected="${basis === k}" title="${esc(b.note)}">${b.label}</button>`).join('')}</div>` : '';
  return `<div class="tr-card ex-workspace" data-mode="${state.mode}">${tabs}
    <div class="ex-bar"><div class="ex-keys">${explorerKeys(M, state, state.lines)}</div><div class="ex-tools">${explorerTools(P, M, state)}</div></div>
    ${state.mode === 'overview' ? '' : explorerPicker(state)}
    <div class="ex-body" data-ex-body></div>
  </div>`;
}

/* מצייר את הגרף (או הטבלה) בדיוק בגודל של .ex-body — שנקבע לפי הפריסה ולא לפי התוכן */
function drawExplorer() {
  const X = S.explorer, body = document.querySelector('#poll-tracker [data-ex-body]'); if (!X || !body) return;
  const w = Math.round(body.clientWidth), h = Math.round(body.clientHeight); if (!w || !h) return;
  S.trackWidth = w; S.trackH = h; S.exDrawn = `${w}x${h}`;
  const overview = X.state.mode === 'overview', chart = overview ? trackerChart(X.M, 'blocs') : explorerChart(X.P, X.state, X.M);
  if (X.state.view === 'table') { body.innerHTML = chart.table; return; }
  body.innerHTML = `<div class="tr-plot">${chart.svg}<div class="tr-tip" hidden></div></div>`;
  if (chart.geom) (overview ? wireTrackerHover : wireExplorerHover)(body, chart);
}
let exObserver = null;
function renderExplorer() {
  const root = document.querySelector('#poll-tracker'), P = trackerModel(); if (!root || !P) return;
  S.trackBasis ||= 'avg'; S.trackRange ||= 'all';
  root.innerHTML = renderExplorerHTML(P, basisModel(P, S.trackBasis));
  S.exDrawn = ''; drawExplorer();
  const body = root.querySelector('[data-ex-body]');
  if (typeof ResizeObserver === 'undefined' || !body) return;
  exObserver?.disconnect();
  exObserver = new ResizeObserver(() => { if (`${Math.round(body.clientWidth)}x${Math.round(body.clientHeight)}` !== S.exDrawn) requestAnimationFrame(drawExplorer); });
  exObserver.observe(body);
}

function wireExplorerHover(box, chart) {
  const svg = box.querySelector('svg'), hit = box.querySelector('.tr-hit'), cursor = box.querySelector('.tr-cursor'), tip = box.querySelector('.tr-tip'), { geom } = chart;
  const show = ev => {
    const r=svg.getBoundingClientRect(), px=(ev.clientX-r.left)*geom.W/r.width;
    const t=geom.t0+(px-geom.m.l)/(geom.W-geom.m.l-geom.m.r)*(geom.t1-geom.t0);
    const date=chart.dates.reduce((a,b)=>Math.abs(b-t)<Math.abs(a-t)?b:a), sx=geom.x(date);
    cursor.setAttribute('x1',sx);cursor.setAttribute('x2',sx);cursor.removeAttribute('hidden');tip.hidden=false;
    tip.innerHTML=`<b>${trDay(date)}</b><small>${chart.sub || 'תוצאות שפורסמו בתאריך זה'}</small>${chart.lines.map(l=>{const p=l.points.find(p=>p.t===date);return `<span style="--c:${l.color}"><i></i>${esc(l.label)}<b>${p?trFmt(p.v):'—'}</b></span>`;}).join('')}`;
    tip.style.left=Math.max(4,Math.min(r.width-tip.offsetWidth-4,sx/geom.W*r.width-tip.offsetWidth-12))+'px';
  };
  hit.addEventListener('pointermove',show); hit.addEventListener('pointerdown',show);
  hit.addEventListener('pointerleave',()=>{cursor.setAttribute('hidden','');tip.hidden=true;});
}

/* ---------- כרטיס סקר בעמודת הסקרים האחרונים (ובתצוגה המוגדלת) ---------- */
function feedCardHTML(p, list, expanded = false) {
  const v=pollVector(p), f=firmOf(p.sourceId), previous=previousComparablePoll(p,list);
  const ids=Object.keys(v.parties).sort((a,b)=>v.parties[b]-v.parties[a]);
  const row=id=>{ const value=v.parties[id], pv=comparablePartyValue(p,previous,id), d=pv === null ? null : value-pv;
    return `<li style="--c:${partyHue(id)}"><i></i><span>${esc(p.parties.find(x=>normId(x.id)===id)?.name||partyMeta(id).name)}</span><b>${value}</b><em class="flat" title="${d===null?'אין מדידה קודמת בת השוואה':'לעומת הסקר הקודם של אותו ערוץ ומכון'}">${d===null?'—':d>0?'↑'+d:d<0?'↓'+Math.abs(d):'='}</em></li>`; };
  const blocs=['Right','Unknown','Arabs','Left'].filter(k=>v.blocs[k]>0), bar=blocs.map(k=>`<span style="flex:${v.blocs[k]};background:${BLOCS[k].color}">${v.blocs[k]>=7?v.blocs[k]:''}</span>`).join('');
  return `<article class="feed-card-shell" data-feed-id="${esc(p.id)}"><details class="feed-item${p.barometer?' is-baro':''}"${expanded?' open':''}><summary><span class="feed-top">${outletLogo(p.channelHebrewName)}<span class="feed-who"><b>${esc(p.channelHebrewName)}</b><small>${p.barometer?'ניתוח שבועי':esc(f.meta.he)}</small></span><time title="${esc(p.date)}">${esc(feedWhen(p))}${p.barometer?' · 20:00':''}</time></span><span class="feed-bar" role="img" aria-label="${esc(blocs.map(k=>`${BLOCS[k].he}: ${v.blocs[k]}`).join(', '))}">${bar}<i class="feed-61"></i></span><span class="feed-lead">${ids.filter(id=>v.parties[id]>0).slice(0,3).map(id=>`<span>${esc(partyMeta(id).name)} <b>${v.parties[id]}</b></span>`).join('')}</span></summary><div class="feed-cols">${[['Right','ימין וחרדים'],['rest','יתר הרשימות']].map(([side,label])=>{const col=ids.filter(id=>(partyMeta(id).alignment==='Right')===(side==='Right'));return `<div><p class="feed-col-head">${label}<b>${col.reduce((n,id)=>n+v.parties[id],0)}</b></p><ol class="feed-parties">${col.map(row).join('')}</ol></div>`;}).join('')}</div><p class="feed-src">${previous?'השינוי מול הסקר הקודם של אותו ערוץ ומכון · '+esc(previous.date):'אין סקר קודם בר השוואה'}${p.sourceUrl?` · <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">מקור ↗</a>`:''}<button type="button" class="feed-expand-one" data-feed-poll="${esc(p.id)}" aria-label="הגדלת הסקר של ${esc(p.channelHebrewName)} מ־${esc(p.date)}">⤢ הגדלה</button></p></details></article>`;
}

/* סקר אחד במסך מלא — לקריאה נוחה של כל הרשימות */
function openPollGallery(id) {
  const P=trackerModel(); if(!P)return;
  const list=[...P.polls,...weeklyBaro()].sort((a,b)=>parsePollDate(b)-parsePollDate(a)), poll=list.find(p=>p.id===id), dlg=$('#poll-gallery');
  if(!poll||!dlg)return;
  $('#poll-gallery-title').textContent=`${poll.channelHebrewName} · ${poll.barometer?'ניתוח שבועי':firmOf(poll.sourceId).meta.he}`;
  $('#poll-gallery-count').textContent=`${poll.date} · המספרים במנדטים`;
  $('#poll-gallery-cards').innerHTML=feedCardHTML(poll,list,true);
  dlg.showModal();dlg.scrollTop=0;
}

if(typeof document!=='undefined') document.addEventListener('DOMContentLoaded',()=>{
  const refocus = sel => document.querySelector(sel)?.focus();
  document.addEventListener('click',e=>{
    const entity=e.target.closest('[data-ex-entity]');
    if(entity){const key=entity.dataset.exEntity,selected=S.exploreSelections[S.exploreMode];S.exploreSelections[S.exploreMode]=selected.includes(key)?selected.filter(k=>k!==key):selected.concat(key).slice(0,EXPLORER_MAX);renderExplorer();refocus(`[data-ex-entity="${CSS.escape(key)}"]`);return;}
    const basis=e.target.closest('button[data-ex-basis]');
    if(basis){S.trackBasis=basis.dataset.exBasis;renderExplorer();refocus(`button[data-ex-basis="${S.trackBasis}"]`);return;}
    const view=e.target.closest('[data-ex-view]');
    if(view){S.exploreView=view.dataset.exView;renderExplorer();refocus(`[data-ex-view="${S.exploreView}"]`);return;}
    const single=e.target.closest('[data-feed-poll]');
    if(single){if(!single.closest('#poll-gallery'))openPollGallery(single.dataset.feedPoll);return;}
    if(e.target.closest('[data-gallery-close]'))$('#poll-gallery').close();
  });
  document.addEventListener('change',e=>{
    const controls={'data-ex-lens':'exploreMode','data-ex-metric':'exploreMetric','data-ex-range':'trackRange'};
    for(const [attr,key] of Object.entries(controls)) if(e.target.hasAttribute?.(attr)){S[key]=e.target.value;renderExplorer();refocus(`[${attr}]`);return;}
  });
  $('#poll-gallery')?.addEventListener('click',e=>{if(e.target===$('#poll-gallery'))$('#poll-gallery').close();});
});
