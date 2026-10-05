/* Comparison uses published observations, preserving missing values as missing. */
const EXPLORER_COLORS = ['#245fa6', '#c05a36', '#168575', '#805ca3', '#ac801a'];
const EXPLORER_MODES = { overview: 'מבט כולל', channels: 'ערוצים', firms: 'מכונים', parties: 'מפלגות' };
const EXPLORER_OUTLET_LOGOS = { 'חדשות 12':'assets/logos/channel12.svg', 'חדשות 13':'assets/logos/channel13.svg', 'ערוץ 14':'assets/logos/channel14.png', 'כאן 11':'assets/logos/kan11.svg', 'i24NEWS':'assets/logos/i24news.png', 'ערוץ 16':'assets/logos/channel-16.png', 'וואלה':'assets/logos/walla.png', 'זמן ישראל':'assets/logos/zman-israel.png', 'גלי צה״ל':'assets/logos/galatz.png' };

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
  // A local portrait or initials remain visible while a remote logo loads.
  const portrait = e.party ? S.leaders?.[e.key] : '';
  return `<span class="ex-avatar"><span class="ex-logo-fallback">${portrait ? `<img class="ex-portrait-image" src="${esc(portrait)}" alt="" loading="lazy">` : esc(e.short || initials(e.label))}</span>${e.logo ? `<img class="ex-logo-image" src="${esc(e.logo)}" alt="" loading="lazy" onload="this.parentNode.classList.add('ex-logo-ready')" onerror="this.remove()">` : ''}</span>`;
}

function explorerState(P) {
  S.exploreMode ||= 'overview'; S.exploreView ||= 'timeline'; S.exploreSelections ||= {};
  const mode = S.exploreMode, entities = mode === 'overview' ? [] : explorerEntities(P, mode);
  if (!S.exploreSelections[mode]) S.exploreSelections[mode] = entities.slice(0, 2).map(e => e.key);
  const selected = entities.filter(e => S.exploreSelections[mode].includes(e.key)).slice(0, 5);
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

function explorerChart(P, state) {
  const lines = explorerLines(P, state), valid = lines.filter(l => l.points.length), points = valid.flatMap(l => l.points);
  if (!points.length) return { html: '<div class="ex-empty">בחרו לוגואים למעלה כדי לראות את ההשוואה. אם אין נתונים בטווח, בחרו טווח רחב יותר.</div>', lines };
  const W = Math.max(320, S.trackWidth || 850), H = W < 600 ? 210 : 220, m = { l: 34, r: 25, t: 22, b: 38 };
  const t0 = Math.min(...points.map(p => p.t)), t1 = Math.max(t0 + DAY_MS, ...points.map(p => p.t));
  const vals = points.map(p => p.v), isBloc = state.mode !== 'parties' && ['Right','Left','Arabs'].includes(state.metric);
  const span = Math.max(...vals) - Math.min(...vals), step = span > 30 ? 10 : span > 12 ? 5 : 2;
  let lo = Math.max(0, Math.floor((Math.min(...vals)-2)/step)*step), hi = Math.ceil((Math.max(...vals)+2)/step)*step;
  if (isBloc && state.metric === 'Right') { lo = Math.min(lo, 58); hi = Math.max(hi, 64); }
  const x = t => m.l + (W-m.l-m.r)*(t-t0)/(t1-t0), y = v => m.t+(H-m.t-m.b)*(1-(v-lo)/(hi-lo));
  let grid = '';
  for (let v=lo; v<=hi; v+=step) grid += `<line class="tr-grid" x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tr-tick" x="${m.l-7}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  if (isBloc && state.metric === 'Right') grid += `<line class="tr-ref" x1="${m.l}" x2="${W-m.r}" y1="${y(61)}" y2="${y(61)}"/><text class="tr-ref-label" x="${W-m.r}" y="${y(61)-8}" text-anchor="end">61 · רוב בכנסת</text>`;
  const ticks = Math.max(2, Math.floor(W/120));
  for(let i=0;i<=ticks;i++) { const t=t0+(t1-t0)*i/ticks; grid += `<text class="tr-tick" x="${x(t)}" y="${H-10}" text-anchor="middle">${trDay(t)}</text>`; }
  const paths = valid.map(l => `<path class="tr-line" stroke="${l.color}" d="${l.points.map((p,i) => `${i && p.signature===l.points[i-1].signature?'L':'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}"/>${l.points.map(p => `<circle class="ex-point" cx="${x(p.t)}" cy="${y(p.v)}" r="4" fill="${l.color}" stroke="white" stroke-width="1.5"><title>${esc(l.label)} · ${trDay(p.t)} · ${trFmt(p.v)} מנדטים · ${p.n} סקרים</title></circle>`).join('')}`).join('');
  const legend = lines.map(l => `<span class="ex-legend-item" style="--c:${l.color}"><i></i>${esc(l.label)}<b>${l.last ? trFmt(l.last.v) : '—'}</b><small>${l.last ? trDay(l.last.t) : 'אין נתון'}</small></span>`).join('');
  const dates = [...new Set(points.map(p => p.t))].sort((a,b)=>b-a);
  const table = `<div class="tablewrap ex-data-table" tabindex="0" role="region" aria-label="נתוני ההשוואה"><table><caption>${state.view === 'snapshot' ? 'הנתון האחרון הזמין לכל בחירה · תאריכים שונים מוצגים במפורש' : 'כל תאריכי הפרסום בטווח הנבחר · — פירושו שאין מדידה בתאריך זה'}</caption><thead><tr><th>תאריך</th>${lines.map(l=>`<th>${esc(l.label)}</th>`).join('')}</tr></thead><tbody>${(state.view === 'snapshot' ? [null] : dates).map(t=>`<tr><th>${t === null ? 'הסקר האחרון' : trDay(t)}</th>${lines.map(l=>{ const p=t === null ? l.last : l.points.find(p=>p.t===t); return `<td>${p ? `<b>${trFmt(p.v)}</b>${t === null ? `<small>${trDay(p.t)} · ${p.n} סקרים</small>` : ''}` : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  const snapshot = `<div class="ex-snapshot">${lines.map(l => `<article style="--c:${l.color}">${explorerLogo(l)}<h4>${esc(l.label)}</h4><b>${l.last ? trFmt(l.last.v) : '—'}</b><span>מנדטים</span><small>${l.last ? `${trDay(l.last.t)} · ${l.last.n} סקרים בתאריך זה` : 'אין מדידה בטווח הנבחר'}</small></article>`).join('')}</div>`;
  return { lines, html: `<div class="ex-legend">${legend}</div>${state.view === 'snapshot' ? snapshot+table : `<div class="tr-plot ex-plot"><svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="השוואת ${esc(lines.map(l=>l.label).join(', '))} לאורך זמן במנדטים; כל הנתונים בטבלה שמתחת">${grid}${paths}<line class="tr-cursor" x1="0" x2="0" y1="${m.t}" y2="${H-m.b}" hidden/><rect class="tr-hit" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}"/></svg><div class="tr-tip" hidden></div></div><details class="tr-data"><summary>כל נתוני הגרף ומועדי הפרסום</summary>${table}</details>`}`, geom: { W,m,t0,t1,x,y }, dates };
}

function renderExplorerHTML(P, M) {
  const state = explorerState(P), overview = state.mode === 'overview', chart = overview ? trackerChart(M, S.trackMode) : explorerChart(P, state);
  S.explorerChart = chart;
  const metricOptions = [['Right','ימין וחרדים'],['Left','מרכז–שמאל'],['Arabs','הרשימות הערביות'],...P.parties.map(p=>[p.id,p.name])];
  return `<div class="tr-card tr-chart-card ex-workspace">
    <div class="ex-mode-row" role="group" aria-label="לפי מה להשוות">${Object.entries(EXPLORER_MODES).map(([k,label])=>`<button type="button" data-ex-mode="${k}" aria-pressed="${state.mode===k}">${label}</button>`).join('')}</div>
    ${overview ? `<div class="ex-overview-meta"><span>תמונת המנדטים · ${trDay(M.now.t)}</span><select data-ex-basis aria-label="על מה מבוססים המספרים">${Object.entries(TRACK_BASES).map(([k,b])=>`<option value="${k}"${(M.basis||'avg')===k?' selected':''}>${b.label}</option>`).join('')}</select></div><div class="ex-overview-stats">${TRACK_BLOCS.map(([k,l])=>{const d=trDelta(M.now.blocs[k]-M.before.blocs[k]);return `<div style="--c:${BLOCS[k].color}"><span>${l}</span><b>${trFmt(M.now.blocs[k])}</b><small title="שינוי לעומת לפני שבועיים">${d.sym} בשבועיים</small></div>`;}).join('')}</div>` : `<div class="ex-picker" role="group" aria-label="בחירת ${esc(EXPLORER_MODES[state.mode])}">${state.entities.map(e=>`<button type="button" class="ex-logo-button" data-ex-entity="${esc(e.key)}" title="${esc(e.label)}" aria-label="${esc(e.label)}" aria-pressed="${state.selected.some(x=>x.key===e.key)}"${state.selected.length>=5&&!state.selected.some(x=>x.key===e.key)?' disabled':''}>${explorerLogo(e)}<span class="ex-check" aria-hidden="true">✓</span></button>`).join('')}</div><p class="ex-selection-note" aria-live="polite">${state.selected.length} מתוך 5 נבחרו <span>לחצו על הלוגואים כדי להשוות</span></p>`}
    <div class="ex-chart-controls">${overview ? `<select data-track-select aria-label="מנדטים של"><option value="blocs"${S.trackMode==='blocs'?' selected':''}>כל הגושים</option>${M.parties.map(p=>`<option value="${esc(p.id)}"${S.trackMode===p.id?' selected':''}>${esc(p.name)}</option>`).join('')}</select>` : `${state.mode !== 'parties' ? `<select data-ex-metric aria-label="משווים מנדטים של">${metricOptions.map(([k,l])=>`<option value="${esc(k)}"${state.metric===k?' selected':''}>${esc(l)}</option>`).join('')}</select>` : '<span class="ex-unit">מנדטים</span>'}<div class="ex-view-switch" role="group" aria-label="אופן ההשוואה"><button type="button" data-ex-view="timeline" aria-pressed="${state.view==='timeline'}">ציר הזמן</button><button type="button" data-ex-view="snapshot" aria-pressed="${state.view==='snapshot'}">נתון אחרון</button></div>`}
    <select data-ex-range aria-label="טווח זמן"><option value="all"${S.trackRange==='all'?' selected':''}>מאז אוגוסט</option><option value="month"${S.trackRange==='month'?' selected':''}>חודש אחרון</option></select></div>
    ${overview ? `<div class="tr-legend">${chart.legend}</div><div class="tr-plot">${chart.svg}<div class="tr-tip" hidden></div></div>${chart.table}` : chart.html}
    <details class="ex-method"><summary>איך מחושבת ההשוואה?</summary><p>${overview ? esc(TRACK_BASES[M.basis||'avg'].note) : 'כל נקודה היא תאריך שבו פורסם סקר. כשיש כמה סקרים באותו יום מוצג ממוצע, עם משקל שווה לכל מכון. הקווים מחברים מדידות בלבד ונקטעים כששם הרשימה או הרכבה משתנים; אין נתון בתאריך מסוים אינו אפס. בהשוואת מפלגות, הממוצע בכל יום כולל רק מכונים שמדדו את המפלגה.'}</p></details>
  </div>`;
}

function wireExplorerHover(root) {
  if (S.exploreMode === 'overview') { wireTrackerHover(root, S.explorerChart); return; }
  const chart = S.explorerChart, box = root.querySelector('.ex-plot'); if (!box || !chart.geom) return;
  const svg = box.querySelector('svg'), hit = box.querySelector('.tr-hit'), cursor = box.querySelector('.tr-cursor'), tip = box.querySelector('.tr-tip'), { geom } = chart;
  const show = ev => {
    const r=svg.getBoundingClientRect(), px=(ev.clientX-r.left)*geom.W/r.width;
    const t=geom.t0+(px-geom.m.l)/(geom.W-geom.m.l-geom.m.r)*(geom.t1-geom.t0);
    const date=chart.dates.reduce((a,b)=>Math.abs(b-t)<Math.abs(a-t)?b:a), sx=geom.x(date);
    cursor.setAttribute('x1',sx);cursor.setAttribute('x2',sx);cursor.removeAttribute('hidden');tip.hidden=false;
    tip.innerHTML=`<b>${trDay(date)}</b><small>תוצאות שפורסמו בתאריך זה</small>${chart.lines.map(l=>{const p=l.points.find(p=>p.t===date);return `<span style="--c:${l.color}"><i></i>${esc(l.label)}<b>${p?trFmt(p.v):'—'}</b></span>`;}).join('')}`;
    tip.style.left=Math.max(4,Math.min(r.width-tip.offsetWidth-4,sx/geom.W*r.width-tip.offsetWidth-12))+'px';
  };
  hit.addEventListener('pointermove',show); hit.addEventListener('pointerdown',show);
  hit.addEventListener('pointerleave',()=>{cursor.setAttribute('hidden','');tip.hidden=true;});
}

function feedCardHTML(p, list, expanded = false) {
  const v=pollVector(p), f=firmOf(p.sourceId), previous=previousComparablePoll(p,list);
  const ids=Object.keys(v.parties).sort((a,b)=>v.parties[b]-v.parties[a]);
  const row=id=>{ const value=v.parties[id], pv=comparablePartyValue(p,previous,id), d=pv === null ? null : value-pv;
    return `<li style="--c:${partyHue(id)}"><i></i><span>${esc(p.parties.find(x=>normId(x.id)===id)?.name||partyMeta(id).name)}</span><b>${value}</b><em class="flat" title="${d===null?'אין מדידה קודמת בת השוואה':'לעומת הסקר הקודם של אותו ערוץ ומכון'}">${d===null?'—':d>0?'↑'+d:d<0?'↓'+Math.abs(d):'='}</em></li>`; };
  const blocs=['Right','Unknown','Arabs','Left'].filter(k=>v.blocs[k]>0), bar=blocs.map(k=>`<span style="flex:${v.blocs[k]};background:${BLOCS[k].color}">${v.blocs[k]>=7?v.blocs[k]:''}</span>`).join('');
  return `<article class="feed-card-shell" data-feed-id="${esc(p.id)}"><details class="feed-item${p.barometer?' is-baro':''}"${expanded?' open':''}><summary><span class="feed-top">${outletLogo(p.channelHebrewName)}<span class="feed-who"><b>${esc(p.channelHebrewName)}</b><small>${p.barometer?'ניתוח שבועי':esc(f.meta.he)}</small></span><time title="${esc(p.date)}">${esc(feedWhen(p))}${p.barometer?' · 20:00':''}</time></span><span class="feed-bar" role="img" aria-label="${esc(blocs.map(k=>`${BLOCS[k].he}: ${v.blocs[k]}`).join(', '))}">${bar}<i class="feed-61"></i></span><span class="feed-lead">${ids.filter(id=>v.parties[id]>0).slice(0,3).map(id=>`<span>${esc(partyMeta(id).name)} <b>${v.parties[id]}</b></span>`).join('')}</span></summary><div class="feed-cols">${[['Right','ימין וחרדים'],['rest','יתר הרשימות']].map(([side,label])=>{const col=ids.filter(id=>(partyMeta(id).alignment==='Right')===(side==='Right'));return `<div><p class="feed-col-head">${label}<b>${col.reduce((n,id)=>n+v.parties[id],0)}</b></p><ol class="feed-parties">${col.map(row).join('')}</ol></div>`;}).join('')}</div><p class="feed-src">${previous?'השינוי מול הסקר הקודם של אותו ערוץ ומכון · '+esc(previous.date):'אין סקר קודם בר השוואה'}${p.sourceUrl?` · <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">מקור ↗</a>`:''}</p></details><button type="button" class="feed-expand-one" data-feed-poll="${esc(p.id)}" aria-label="פתיחת סקר ${esc(p.channelHebrewName)} מתאריך ${esc(p.date)} במסך מלא" title="פתיחת הסקר במסך מלא">⤢</button></article>`;
}

function openPollGallery(id = '') {
  const P=trackerModel(); if(!P)return;
  const list=[...P.polls,...weeklyBaro()].sort((a,b)=>parsePollDate(b)-parsePollDate(a));
  const shown=id?list.filter(p=>p.id===id):list, dlg=$('#poll-gallery');
  $('#poll-gallery-title').textContent=id?'הסקר, בתמונה מלאה':'כל הסקרים, בתמונה מלאה';
  const pollsCount=shown.filter(p=>!p.barometer).length, forecastsCount=shown.length-pollsCount;
  $('#poll-gallery-count').textContent=`${pollsCount ? `${pollsCount} ${pollsCount===1?'סקר':'סקרים'}` : ''}${forecastsCount ? `${pollsCount?' ו־':''}${forecastsCount} ${forecastsCount===1?'תחזית שבועית':'תחזיות שבועיות'}` : ''} · מהחדש לישן · המספרים במנדטים`;
  $('#poll-gallery-cards').innerHTML=shown.map(p=>feedCardHTML(p,list,true)).join('');
  dlg.showModal();dlg.scrollTop=0;
}

if(typeof document!=='undefined') document.addEventListener('DOMContentLoaded',()=>{
  document.addEventListener('click',e=>{
    const mode=e.target.closest('[data-ex-mode]');if(mode){S.exploreMode=mode.dataset.exMode;renderPollTracker();$(`[data-ex-mode="${S.exploreMode}"]`)?.focus();return;}
    const entity=e.target.closest('[data-ex-entity]');if(entity){const key=entity.dataset.exEntity,selected=S.exploreSelections[S.exploreMode];S.exploreSelections[S.exploreMode]=selected.includes(key)?selected.filter(k=>k!==key):selected.concat(key).slice(0,5);renderPollTracker();$(`[data-ex-entity="${CSS.escape(key)}"]`)?.focus();return;}
    const view=e.target.closest('[data-ex-view]');if(view){S.exploreView=view.dataset.exView;renderPollTracker();$(`[data-ex-view="${S.exploreView}"]`)?.focus();return;}
    if(e.target.closest('[data-feed-gallery]')){openPollGallery();return;}
    const single=e.target.closest('[data-feed-poll]');if(single){if(!single.closest('#poll-gallery'))openPollGallery(single.dataset.feedPoll);return;}
    if(e.target.closest('[data-gallery-close]'))$('#poll-gallery').close();
  });
  document.addEventListener('change',e=>{const controls={'data-ex-metric':'exploreMetric','data-ex-range':'trackRange','data-ex-basis':'trackBasis'};for(const [attr,key] of Object.entries(controls)){if(e.target.hasAttribute(attr)){S[key]=e.target.value;renderPollTracker();$(`[${attr}]`)?.focus();return;}}});
  $('#poll-gallery')?.addEventListener('click',e=>{if(e.target===$('#poll-gallery'))$('#poll-gallery').close();});
});
