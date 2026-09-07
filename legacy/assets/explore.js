/* Data exploration shares the site's existing data, typography and colors. */
/* קנה מידה אחיד לכל תצוגות המנדטים: עגול ל־5 מעל הערך הגדול ביותר, ולא פחות מ־25.
   כך אורך העמודה של מפלגה אחת אומר אותו דבר בכל מקום באתר, והמידה אינה קופצת
   בין תצוגה לתצוגה רק מפני שהמקסימום זז במנדט אחד. */
function barScale(max) { return Math.max(25, Math.ceil((max + 1) / 5) * 5); }
/* סדר אחיד: מהמנדטים הרבים למעטים, ובשוויון לפי שם הרשימה. */
function byMandates(valueOf) {
  return (a, b) => (valueOf(b) || 0) - (valueOf(a) || 0) || partyMeta(a).name.localeCompare(partyMeta(b).name, 'he');
}
function pollValue(poll, id) {
  const entries = poll?.parties.filter(x => normId(x.id) === id) || [];
  return entries.length ? entries.reduce((n,x) => n+x.mandates,0) : null;
}
function previousComparablePoll(p, polls) {
  return polls.filter(q => q.channelHebrewName === p.channelHebrewName && firmOf(q.sourceId).firm === firmOf(p.sourceId).firm && parsePollDate(q) < parsePollDate(p)).sort((a,b)=>parsePollDate(b)-parsePollDate(a))[0] || null;
}
function partySignature(poll, id) {
  return (poll?.parties.filter(x=>normId(x.id)===id) || []).map(x=>x.id+'|'+x.name).sort().join('::');
}
function comparablePartyValue(current, previous, id) {
  return previous && partySignature(current,id) && partySignature(current,id)===partySignature(previous,id) ? pollValue(previous,id) : null;
}
function renderForecastOverview(est, seats) {
  const below = Object.entries(est.below || {});
  const entries = Object.entries(seats).sort((a,b)=>b[1]-a[1] || partyMeta(a[0]).name.localeCompare(partyMeta(b[0]).name,'he'))
    .concat(below.map(([id]) => [id, 0]));
  const preRound = id => est.parties[id] != null ? est.parties[id] : (est.rawFull ? est.rawFull[id] : 0);
  const scale = barScale(Math.max(0,...entries.map(([,v])=>v)));
  const belowPct = id => est.below && est.below[id] ? r1(est.below[id]) : null;
  $('#forecast-bars').innerHTML = '<div class="chart-caption"><span>מפלגה</span><span>מנדטים · מהגדול לקטן · קנה מידה אחיד 0–'+scale+'</span></div><div class="forecast-bar-grid" style="--rows:'+Math.ceil(entries.length/2)+'">'+entries.map(([id,n]) => `<button type="button" class="forecast-bar${n===0&&belowPct(id)?' is-below':''}" data-focus-party="${esc(id)}" aria-label="${esc(partyMeta(id).name)}, ${n} מנדטים${n===0&&belowPct(id)?` (כ־${belowPct(id)}% — מתחת לאחוז החסימה)`:''}. לצפייה בסקרים"><span>${esc(partyMeta(id).name)}${n===0&&belowPct(id)?` · כ־${belowPct(id)}%`:''}</span><i aria-hidden="true"><b style="width:${100*n/scale}%"></b></i><strong>${n}</strong></button>`).join('')+'</div>';
  $('#forecast-table').innerHTML = '<table><caption>אומדן מנדטים לפי מפלגה — לפני ואחרי עיגול ל־120</caption><thead><tr><th scope="col">מפלגה</th><th scope="col">ממוצע לפני עיגול</th><th scope="col">מנדטים מעוגלים</th></tr></thead><tbody>'+entries.map(([id,n])=>`<tr><th scope="row">${esc(partyMeta(id).name)}</th><td>${r1(preRound(id))}</td><td>${n}</td></tr>`).join('')+'</tbody></table>';
}
/* ההשוואה היא בין מכוני סקרים, לא בין סקרים בודדים: לכל מכון נלקח הסקר
   האחרון שלו בסינון הנוכחי, כדי שהעמודות יתארו את המצב העדכני של כל מכון. */
function latestByFirm(rows) {
  const by = new Map();
  rows.forEach(p => {
    const id = firmOf(p.sourceId).firm;
    const cur = by.get(id);
    if (!cur || parsePollDate(p) > parsePollDate(cur)) by.set(id, p);
  });
  return [...by.entries()]
    .map(([firm, poll]) => ({ firm, poll, meta: firmOf(poll.sourceId).meta }))
    .sort((a, b) => parsePollDate(b.poll) - parsePollDate(a.poll));
}
function renderComparison(rows, ids) {
  const firms = latestByFirm(rows);
  if (S.compareIds === null) S.compareIds = firms.slice(0, 2).map(f => f.firm);
  S.compareIds = S.compareIds.filter(id => firms.some(f => f.firm === id)).slice(0, 3);
  const selected = firms.filter(f => S.compareIds.includes(f.firm));
  $('#compare-picker').innerHTML = '<legend>בחרו עד שלושה מכונים להשוואה</legend>'+firms.map(f=>`<label style="--firm:${esc(f.meta.color||'#64707C')}"><input type="checkbox" data-compare-id="${esc(f.firm)}" ${S.compareIds.includes(f.firm)?'checked':selected.length===3?'disabled':''}>${esc(f.meta.he)}<small>הסקר האחרון · ${esc(f.poll.channelHebrewName)} · ${esc(f.poll.date)}</small></label>`).join('');
  $('#compare-status').textContent = `${selected.length} מתוך 3 מכונים נבחרו. לכל מכון מוצג הסקר האחרון שלו; הרשימות מסודרות מהמנדטים הרבים למעטים, — מציין שאין נתון.`;
  const order = [...ids].sort(byMandates(id => selected.reduce((n,f) => n + (pollValue(f.poll,id) || 0), 0)));
  $('#compare-table').innerHTML = selected.length ? `<table><caption>הסקר האחרון של כל מכון שנבחר, מהמנדטים הרבים למעטים</caption><thead><tr><th scope="col">מפלגה</th>${selected.map(f=>`<th scope="col" style="--firm:${esc(f.meta.color||'#64707C')}">${esc(f.meta.he)}<br><small>${esc(f.poll.channelHebrewName)} · ${esc(f.poll.date)}</small></th>`).join('')}</tr></thead><tbody>${order.map(id=>`<tr class="${id===S.focusParty?'party-highlight':''}"><th scope="row"><button type="button" data-select-party="${esc(id)}" aria-pressed="${id===S.focusParty}">${esc(partyMeta(id).name)}</button></th>${selected.map(f=>`<td>${pollValue(f.poll,id)??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">בחרו מכונים מהרשימה כדי להתחיל בהשוואה.</p>';
}
function renderPollCards(rows, polls) {
  const selected = S.focusParty;
  /* כרטיס אחד לכל כלי תקשורת. ברירת המחדל היא הסקר האחרון שלו, ובורר
     התאריך שבכרטיס מחליף לסקר קודם של אותו כלי תקשורת. */
  const byOutlet = new Map();
  rows.forEach(p => {
    const k = outletKey(p);
    if (!byOutlet.has(k)) byOutlet.set(k, []);
    byOutlet.get(k).push(p);
  });
  byOutlet.forEach(list => list.sort((a, b) => parsePollDate(b) - parsePollDate(a)));
  const cards = [...byOutlet.entries()].map(([key, list]) => {
    const pick = list.find(p => p.id === S.cardPoll[key]) || list[0];
    return { key, list, poll: pick };
  /* הסדר נקבע לפי הסקר האחרון של כלי התקשורת ולא לפי הסקר שנבחר בכרטיס,
     כדי שהחלפת תאריך לא תזיז את הכרטיס ממקומו. */
  }).sort((a, b) => parsePollDate(b.list[0]) - parsePollDate(a.list[0]));
  $('#poll-party').innerHTML = '<option value="">כל המפלגות</option>' + topPartyIds(Infinity).map(id => `<option value="${esc(id)}">${esc(partyMeta(id).name)}</option>`).join('');
  $('#poll-party').value = selected;
  const summary = $('#party-focus-summary');
  const focusValues = rows.map(p => pollValue(p, selected)).filter(v => v !== null);
  summary.hidden = !selected;
  summary.textContent = selected ? `${partyMeta(selected).name}: ${focusValues.length ? `טווח ${Math.min(...focusValues)}–${Math.max(...focusValues)} מנדטים ב־${focusValues.length} סקרים בסינון הנוכחי` : 'אין נתון בסינון הנוכחי'}.` : '';
  const stableIds = [...new Set(polls.flatMap(p => p.parties.map(x => normId(x.id))))].sort((a,b) => partyMeta(a).name.localeCompare(partyMeta(b).name,'he'));
  $('#polls-cards').innerHTML = cards.map(({ key, list, poll: p }) => {
    const prev = previousComparablePoll(p, polls), f = firmOf(p.sourceId);
    const total = p.parties.reduce((n,x) => n+x.mandates,0);
    const bloc = Object.fromEntries(BLOC_ORDER.map(k => [k,p.parties.filter(x=>alignOf(x)===k).reduce((n,x)=>n+x.mandates,0)]));
    const zeros = p.parties.filter(x=>x.mandates === 0);
    const rowHTML = id => {
      const v = pollValue(p,id), pv = comparablePartyValue(p,prev,id), d = v !== null && pv !== null ? v-pv : null;
      const delta = !prev ? '' : d === null ? '<em class="flat" title="אין נתון בר השוואה">—</em>' : `<em class="neutral-delta" aria-label="${d > 0 ? 'עלייה של' : d < 0 ? 'ירידה של' : 'ללא שינוי'} ${Math.abs(d)} מנדטים">${d > 0 ? '↑' : d < 0 ? '↓' : '='}${d ? Math.abs(d) : ''}</em>`;
      const meta = partyMeta(id), col = BLOCS[meta.alignment].color;
      const face = (S.leaders && S.leaders[id]) || LEADER_PLACEHOLDER;
      return `<li class="${selected===id ? 'party-highlight' : ''}" style="--c:${col}"><button type="button" class="poll-party-name" data-select-party="${esc(id)}" aria-pressed="${selected===id}"><span class="pface"><img src="${esc(face)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${LEADER_PLACEHOLDER}';this.parentNode.classList.add('is-blank')"></span><span class="pname">${esc(meta.name)}</span></button><b>${v===null ? '—' : v}</b>${delta}</li>`;
    };
    const displayIds = stableIds.filter(id => (pollValue(p,id)||0)>0 || id===selected).sort(byMandates(id => pollValue(p,id)));
    /* פס הגושים יושב מעל התוצאות, בלי מספרים ובלי פתיחה. גוש שעבר 61 מקבל וי. */
    const shown = BLOC_ORDER.filter(k => bloc[k] > 0);
    const winner = shown.find(k => bloc[k] >= 61);
    const seatbar = `<div class="poll-blocbar" role="img" aria-label="${esc(shown.map(k=>`${BLOCS[k].he} ${bloc[k]}`).join(', '))}${winner ? `. רוב ל${BLOCS[winner].he}` : '. אין רוב לגוש'}">${
      shown.map(k => `<span style="flex:${bloc[k]};background:${BLOCS[k].color}" title="${esc(BLOCS[k].he)}: ${bloc[k]} מנדטים${bloc[k] >= 61 ? ' — רוב' : ''}">${
        k === winner ? `<b aria-hidden="true" style="color:${BLOCS[k].color}">✓</b>` : ''}</span>`).join('')
    }${total === 120 ? '<i class="poll-61 from-start" title="קו הרוב: 61 מתוך 120"></i><i class="poll-61 from-end" title="קו הרוב: 61 מתוך 120"></i>' : ''}</div>`;
    return `<article class="poll-result-card" style="--firm:${firmColor(p.sourceId)}"><header><div class="orgcell">${outletLogo(p.channelHebrewName)}<div><h3>${esc(p.channelHebrewName)}</h3><p>${esc(f.meta.he)}</p></div></div>${list.length > 1
        ? `<label class="poll-date-pick"><span class="sr-only">תאריך הסקר של ${esc(p.channelHebrewName)}</span><select data-card-outlet="${esc(key)}">${
            list.map(q => `<option value="${esc(q.id)}" ${q.id === p.id ? 'selected' : ''}>${esc(q.date)}</option>`).join('')
          }</select></label>`
        : `<time>${esc(p.date)}</time>`}</header>
      ${seatbar}
      <div class="poll-cols">
        <ol class="poll-list">${displayIds.filter(id => partyMeta(id).alignment === 'Right').map(rowHTML).join('')}</ol>
        <ol class="poll-list">${displayIds.filter(id => partyMeta(id).alignment !== 'Right').map(rowHTML).join('')}</ol>
      </div>
      ${zeros.length ? `<details class="zero-results"><summary>${zeros.length} רשימות עם 0 מנדטים במאגר</summary><p>${zeros.map(x=>esc(x.name)).join(' · ')}</p></details>` : ''}
      <footer><span>${total} מנדטים</span><span>${prev ? `שינוי מול ${esc(f.meta.he)} · ${esc(prev.channelHebrewName)} · ${esc(prev.date)}` : 'אין סקר קודם של אותו מכון ומפרסם בחלון'}</span></footer></article>`;
  }).join('') || '<p class="empty">לא נמצאו סקרים לפי הסינון.</p>';
  $('#polls-cards').hidden = S.pollView !== 'cards';
  $('#polls-compare').hidden = S.pollView !== 'compare';
  renderComparison(rows, stableIds);
  const trendIds = topPartyIds(Infinity).filter(id => rows.some(p => pollValue(p,id) !== null))
    .concat(stableIds.filter(id => rows.some(p => pollValue(p,id) !== null)));
  if (!trendIds.includes(S.trendParty)) S.trendParty = trendIds[0] || '';
  $('#trend-party').innerHTML = [...new Set(trendIds)].map(id=>`<option value="${esc(id)}">${esc(partyMeta(id).name)}</option>`).join('');
  $('#trend-party').value = S.trendParty;
}
function renderPartyTrend(polls) {
  const id=S.trendParty, rows=polls.filter(p=>pollValue(p,id)!==null).sort((a,b)=>parsePollDate(a)-parsePollDate(b));
  if(!rows.length){$('#trend-box').innerHTML='<p class="empty">אין סקרים להצגת מגמה בסינון הנוכחי.</p>';return;}
  const W=900,H=320,m={l:50,r:185,t:26,b:40},t0=parsePollDate(rows[0]),t1=parsePollDate(rows.at(-1));
  const hi=Math.max(10,Math.ceil(Math.max(...rows.map(p=>pollValue(p,id)))/5)*5);
  const x=t=>m.l+(W-m.l-m.r)*(t1===t0?.5:(t-t0)/(t1-t0)),y=v=>H-m.b-(H-m.b-m.t)*v/hi;
  const groups=new Map();
  rows.forEach(p=>{const key=firmOf(p.sourceId).firm+'|'+p.channelHebrewName+'|'+partySignature(p,id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)});
  const colors=['#17457F','#925600','#5B4B8A','#28684F','#983B36','#42515F'];
  const grid=Array.from({length:6},(_,i)=>hi*i/5).map(v=>`<line x1="${m.l}" y1="${y(v)}" x2="${W-m.r}" y2="${y(v)}" stroke="#DDD9CF"/><text x="${m.l-12}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#46515E">${r1(v)}</text>`).join('');
  const legends=[];
  const paths=[...groups.values()].map((ps,i)=>{
    const col=colors[i%colors.length],dash=i%3===0?'':i%3===1?'7 4':'2 4';
    legends.push(`<span><b style="color:${col}">${i+1}.</b> ${esc(ps[0].channelHebrewName)} · ${esc(firmOf(ps[0].sourceId).meta.he)}</span>`);
    return `<path d="${ps.map((p,j)=>`${j?'L':'M'}${x(parsePollDate(p))} ${y(pollValue(p,id))}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="${dash}"/>`+ps.map(p=>`<circle cx="${x(parsePollDate(p))}" cy="${y(pollValue(p,id))}" r="5" fill="#fff" stroke="${col}" stroke-width="2"><title>${esc(p.channelHebrewName)} · ${esc(p.date)} · ${pollValue(p,id)} מנדטים</title></circle><text x="${x(parsePollDate(p))+7}" y="${y(pollValue(p,id))-7-i%3*12}" fill="${col}" font-size="11">${i+1}</text>`).join('')+`<text x="${W-m.r+12}" y="${30+i*26}" fill="${col}" font-size="12">${i+1}. ${esc(ps[0].channelHebrewName)}: ${pollValue(ps.at(-1),id)}</text>`;
  }).join('');
  const dates=[...new Set(rows.map(parsePollDate))].map(t=>`<text x="${x(t)}" y="${H-10}" text-anchor="middle" fill="#46515E" font-size="12">${new Date(t).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})}</text>`).join('');
  $('#trend-box').innerHTML=`<h3>${esc(partyMeta(id).name)} · מנדטים בסקרים</h3><div class="trend-scroll"><svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="תוצאות ${esc(partyMeta(id).name)} בסקרים. פירוט מלא בטבלה מתחת לגרף.">${grid}${paths}${dates}</svg></div><div class="trend-legend">${legends.join('')}</div><details class="trend-data"><summary>פתיחת נתוני הגרף כטבלה</summary><div class="tablewrap" tabindex="0" role="region" aria-label="נתוני הגרף"><table><caption>תוצאות ${esc(partyMeta(id).name)}</caption><thead><tr><th scope="col">תאריך</th><th scope="col">מפרסם</th><th scope="col">מכון</th><th scope="col">מנדטים</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.channelHebrewName)}</td><td>${esc(firmOf(p.sourceId).meta.he)}</td><td>${pollValue(p,id)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function wireExploration() {
  $$('[data-homeview]').forEach(b=>b.addEventListener('click',()=>{S.homeView=b.dataset.homeview;$$('[data-homeview]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$$('[data-homepanel]').forEach(x=>x.hidden=x.dataset.homepanel!==S.homeView);}));
  $('#poll-party').addEventListener('change',e=>{S.focusParty=e.target.value;renderPolls();});
  $('#trend-party').addEventListener('change',e=>{S.trendParty=e.target.value;renderPolls();});
  $('#polls-cards').addEventListener('change', e => {
    const sel = e.target.closest('[data-card-outlet]');
    if (!sel) return;
    S.cardPoll[sel.dataset.cardOutlet] = sel.value;
    renderPolls();
    $(`[data-card-outlet="${CSS.escape(sel.dataset.cardOutlet)}"]`)?.focus();
  });
  $('#compare-picker').addEventListener('change',e=>{const id=e.target.dataset.compareId;if(!id)return;S.compareIds=e.target.checked?[...S.compareIds,id].slice(0,3):S.compareIds.filter(x=>x!==id);renderPolls();$$('[data-compare-id]').find(x=>x.dataset.compareId===id)?.focus();});
  document.addEventListener('click',e=>{
    const select=e.target.closest('[data-select-party]');
    if(select){S.focusParty=S.focusParty===select.dataset.selectParty?'':select.dataset.selectParty;renderPolls();$('#poll-party').focus();}
    const focus=e.target.closest('[data-focus-party]');
    if(focus){S.focusParty=focus.dataset.focusParty;S.trendParty=S.focusParty;location.hash='#/polls';}
    
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.nav-more')?.open){$('.nav-more').open=false;$('.nav-more summary').focus();}});
}
