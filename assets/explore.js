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
  $('#compare-picker').innerHTML = '<legend>בחרו עד שלושה מכונים להשוואה — לכל מכון יוצג הסקר האחרון שפרסם בסינון הנוכחי, זה לצד זה</legend>'
    +firms.map(f=>`<label style="--firm:${esc(f.meta.color||'#64707C')}">${logoBox(f.meta,30)}<span class="compare-label-text"><input type="checkbox" data-compare-id="${esc(f.firm)}" ${S.compareIds.includes(f.firm)?'checked':selected.length===3?'disabled':''}>${esc(f.meta.he)}<small>הסקר האחרון · ${esc(f.poll.channelHebrewName)} · ${esc(f.poll.date)}</small></span></label>`).join('');
  $('#compare-status').textContent = `${selected.length} מתוך 3 מכונים נבחרו (סמנו תיבה כדי להוסיף מכון להשוואה, ועד שלושה בו-זמנית). הטבלה למטה מציגה, זה מול זה, רק את הסקר האחרון שכל מכון נבחר פרסם — לא ממוצע ולא משוקלל — ומסודרת לפי סך המנדטים שהמכונים הנבחרים נתנו לכל רשימה, מהגבוה לנמוך. תו "—" בתא מציין שהמכון הזה לא מדד רשימה כלשהי באותו סקר, לא שהיא קיבלה אפס.`;
  const order = [...ids].sort(byMandates(id => selected.reduce((n,f) => n + (pollValue(f.poll,id) || 0), 0)));
  $('#compare-table').innerHTML = selected.length ? `<table><caption>הסקר האחרון של כל מכון שנבחר, מהמנדטים הרבים למעטים</caption><thead><tr><th scope="col">מפלגה</th>${selected.map(f=>`<th scope="col" style="--firm:${esc(f.meta.color||'#64707C')}">${esc(f.meta.he)}<br><small>${esc(f.poll.channelHebrewName)} · ${esc(f.poll.date)}</small></th>`).join('')}</tr></thead><tbody>${order.map(id=>`<tr class="${id===S.focusParty?'party-highlight':''}"><th scope="row"><button type="button" data-select-party="${esc(id)}" aria-pressed="${id===S.focusParty}">${esc(partyMeta(id).name)}</button></th>${selected.map(f=>`<td>${pollValue(f.poll,id)??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="empty">בחרו מכונים מהרשימה כדי להתחיל בהשוואה.</p>';
}
function renderPollCards(rows, polls) {
  const selected = S.focusParty;
  /* התחזית השבועית של הברומטר מופיעה בכרטיסים ובהשוואה, אבל לא בממוצע הסקרים */
  const baro = barometerWeeklyPolls(), avgRows = rows;
  rows = [...rows, ...baro]; polls = [...polls, ...baro];
  /* כרטיס אחד לכל כלי תקשורת. ברירת המחדל היא הסקר האחרון שלו, ובורר
     התאריך שבכרטיס מחליף לסקר קודם של אותו כלי תקשורת. */
  const byOutlet = new Map();
  rows.forEach(p => {
    const k = outletKey(p);
    if (!byOutlet.has(k)) byOutlet.set(k, []);
    byOutlet.get(k).push(p);
  });
  byOutlet.forEach(list => list.sort((a, b) => parsePollDate(b) - parsePollDate(a)));
  /* current-polls.json מוגבל ל-MAX_PER_OUTLET לכל ערוץ; בורר התאריך בכרטיס
     צריך את כל ההיסטוריה מאז POLLS_FROM, שקיימת רק בארכיון המלא. אם
     הארכיון לא נטען (אופציונלי), נופלים חזרה לרשימה המוגבלת. */
  const archiveByOutlet = new Map();
  (S.pollsArchive?.polls || []).forEach(p => {
    if (parsePollDate(p) < POLLS_FROM) return;
    const k = outletKey(p);
    if (!archiveByOutlet.has(k)) archiveByOutlet.set(k, []);
    archiveByOutlet.get(k).push(p);
  });
  archiveByOutlet.forEach(list => list.sort((a, b) => parsePollDate(b) - parsePollDate(a)));
  const cards = [...byOutlet.entries()].map(([key, list]) => {
    const fullList = archiveByOutlet.get(key)?.length ? archiveByOutlet.get(key) : list;
    const pick = fullList.find(p => p.id === S.cardPoll[key]) || list[0];
    return { key, list: fullList, poll: pick };
  /* הסדר נקבע לפי הסקר האחרון של כלי התקשורת ולא לפי הסקר שנבחר בכרטיס,
     כדי שהחלפת תאריך לא תזיז את הכרטיס ממקומו. */
  }).sort((a, b) => parsePollDate(b.list[0]) - parsePollDate(a.list[0]));
  $('#poll-party').innerHTML = '<option value="">כל המפלגות</option>' + topPartyIds(Infinity).map(id => `<option value="${esc(id)}">${esc(partyMeta(id).name)}</option>`).join('');
  $('#poll-party').value = selected;
  const summary = $('#party-focus-summary');
  const focusValues = avgRows.map(p => pollValue(p, selected)).filter(v => v !== null);
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
      const meta = partyMeta(id), col = partyColor(id, meta.alignment);
      /* טעות קבועה של המכון ברשימה הזו במערכות הקודמות — הערה מתחת לשם */
      const h = v !== null && !p.barometer ? houseFor(f.meta, id) : null;
      const house = h ? `<small class="house-note" title="${esc(houseExplain(h, h.together || meta.name))}">טעות קבועה: ${houseShort(h)}${h.together ? ' (יחד עם ' + esc(partyMeta(HOUSE_GROUPS.rz.members.find(x => x !== normId(id))).name) + ')' : ''}</small>` : '';
      return `<li class="${selected===id ? 'party-highlight' : ''}" style="--c:${col}"><button type="button" class="poll-party-name" data-select-party="${esc(id)}" aria-pressed="${selected===id}"><span class="pname">${esc(meta.name)}</span></button><b>${v===null ? '—' : v}</b>${delta}${house}</li>`;
    };
    const displayIds = stableIds.filter(id => (pollValue(p,id)||0)>0 || id===selected).sort(byMandates(id => pollValue(p,id)));
    /* גרף הגושים בראש הכרטיס: ימין בימין, ערבים באמצע, מרכז–שמאל בשמאל, המספר בתוך
       כל מקטע, וי לגוש שעבר 61, וקו רוב אחד באמצע (מי שעובר אותו — 61 ומעלה). */
    const shown = BLOC_ORDER.filter(k => bloc[k] > 0);
    const winner = shown.find(k => bloc[k] >= 61);
    const seatbar = `<div class="poll-blocgraph" role="img" aria-label="${esc(shown.map(k=>`${BLOCS[k].he} ${bloc[k]}`).join(', '))}${winner ? `. רוב ל${BLOCS[winner].he}` : '. אין רוב לגוש'}">${
      shown.map(k => `<span class="bc-seg${k === winner ? ' is-maj' : ''}" style="flex:${bloc[k]} ${bloc[k]};background:${BLOCS[k].color}" title="${esc(BLOCS[k].he)}: ${bloc[k]} מנדטים${bloc[k] >= 61 ? ' — רוב' : ''}"><b>${bloc[k]}</b></span>`).join('')
    }${total === 120 ? `<i class="bc-61${winner ? ' is-maj' : ''}"${winner ? ` style="--c:${BLOCS[winner].color}"` : ''} title="קו הרוב: מעבר לאמצע = 61 ומעלה"></i>` : ''}</div>`;
    /* דירוג האמינות של המכון (הציון המשוקלל של מערכות הכיול) */
    const score = firmScore(f.meta), grade = gradeOf(score);
    const gradeTag = p.barometer ? '' : f.meta.calibrated
      ? `<span class="poll-grade grade-${grade.key}" title="ציון אמינות ${r1(score)} מתוך 100 — לפי דיוק המכון בבחירות 2020–2022">${grade.label} · ${r1(score)}</span>`
      : `<span class="poll-grade grade-none" title="אין למכון סקרים במערכות הכיול — הוא מקבל משקל ניטרלי">ללא כיול · משקל ניטרלי</span>`;
    const hb = p.barometer ? null : houseBloc(f.meta);
    const blocNote = hb ? `<p class="house-bloc" title="${esc(houseExplain(hb, 'גוש הימין'))}">טעות קבועה בגוש הימין: ${houseShort(hb)} מנדטים</p>` : '';
    return `<article class="poll-result-card" style="--firm:${firmColor(p.sourceId)}"><header><div class="orgcell">${outletLogo(p.channelHebrewName)}<div><h3>${esc(p.channelHebrewName)}</h3><p>${esc(f.meta.he)}</p>${gradeTag}</div></div>${list.length > 1
        ? `<label class="poll-date-pick"><span class="sr-only">תאריך הסקר של ${esc(p.channelHebrewName)}</span><select data-card-outlet="${esc(key)}">${
            list.map(q => `<option value="${esc(q.id)}" ${q.id === p.id ? 'selected' : ''}>${esc(q.date)}</option>`).join('')
          }</select></label>`
        : `<time>${esc(p.date)}</time>`}</header>
      ${seatbar}${blocNote}
      <div class="poll-cols">
        <ol class="poll-list">${displayIds.filter(id => partyMeta(id).alignment === 'Right').map(rowHTML).join('')}</ol>
        <ol class="poll-list">${displayIds.filter(id => partyMeta(id).alignment !== 'Right').map(rowHTML).join('')}</ol>
      </div>
      ${zeros.length ? `<details class="zero-results"><summary>${zeros.length} רשימות עם 0 מנדטים במאגר</summary><p>${zeros.map(x=>esc(partyMeta(normId(x.id)).name)).join(' · ')}</p></details>` : ''}
      ${p.barometer ? '' : (fix => fix.length ? `<details class="zero-results house-fix"><summary>התיקון של המכון בתחזית הברומטר</summary><p>${houseShiftHTML(fix)} — מנדטים שעוברים בתוך אותו גוש, לפי הטעות הממוצעת של המכון ב־2020–2022${f.meta.calibrated ? '' : ' (אין לו היסטוריה: חצי מהטעות הממוצעת של כל המכונים)'}. סך הגושים לא משתנה.</p></details>` : '')(houseShiftList(pollPartyMap(p), pollPartyMap(correctWithinBlocs(p))))}
      <footer><span>${total} מנדטים</span><span>${prev ? `שינוי מול הסקר הקודם שלהם · ${esc(prev.date)}` : 'אין סקר קודם של אותו מכון ומפרסם בחלון'}</span></footer></article>`;
  }).join('') || '<p class="empty">לא נמצאו סקרים לפי הסינון.</p>';
  $('#polls-cards').hidden = S.pollView !== 'cards';
  $('#polls-compare').hidden = S.pollView !== 'compare';
  $('#polls-average').hidden = S.pollView !== 'average';
  $('#polls-trends').hidden = S.pollView !== 'trends';
  renderComparison(rows, stableIds);
  renderPollAverage(avgRows);
  if (S.pollView === 'trends') renderFirmTrends();
}
function renderPollAverage(rows) {
  const box = $('#average-results'), status = $('#average-status'), firmsBox = $('#average-firms');
  if (!box || !status || !firmsBox) return;
  /* החלון נספר מהיום ממש (חצות, שעון ישראל) ולא מהסקר האחרון: "היום האחרון" = סקרים
     מהיום; "5 ימים" = היום וארבעת הימים שלפניו. */
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const today = Date.parse(todayKey);                       // חצות UTC, כמו parsePollDate
  const cutoff = today - (S.avgDays - 1) * 864e5;
  const included = rows.filter(p => parsePollDate(p) >= cutoff);
  if (!included.length) {
    status.textContent = S.avgDays === 1 ? 'לא פורסם סקר היום. החלון נספר מהיום ממש — בחרו חלון רחב יותר.' : `אין סקרים ב־${S.avgDays} הימים האחרונים (החלון נספר מהיום ממש).`;
    box.innerHTML = firmsBox.innerHTML = '';
    return;
  }
  const weightOf = p => S.avgWeight === 'reliability' ? firmScore(firmOf(p.sourceId).meta) / 100 : 1;
  const ids = [...new Set(included.flatMap(p => p.parties.map(x => normId(x.id))))];
  let averages = ids.map(id => {
    const values = included.map(p => ({ p, v: pollValue(p, id) })).filter(x => x.v !== null);
    const totalW = values.reduce((n, x) => n + weightOf(x.p), 0) || 1;
    return { id, value: values.reduce((n, x) => n + x.v * weightOf(x.p), 0) / totalW, values };
  }).filter(x => x.value > .25);
  const rawTotal = averages.reduce((n, x) => n + x.value, 0) || 120;
  const wholeSeats = largestRemainder(Object.fromEntries(averages.map(x => [x.id, x.value * 120 / rawTotal])), 120);   // ממוצע תיאורי של הסקרים — בלי כללי הבחירות (אלה מופעלים רק על התחזית)
  averages = averages.map(x => ({...x, seats:wholeSeats[x.id] || 0})).filter(x => x.seats > 0).sort((a, b) => b.seats - a.seats || b.value - a.value);
  const blocSeats = { Right:0, Left:0, Arabs:0, Unknown:0 };
  averages.forEach(x => { const al = partyMeta(x.id).alignment; blocSeats[al] = (blocSeats[al] || 0) + x.seats; });
  const total = 120;
  const right = 100 * blocSeats.Right / total, left = 100 * blocSeats.Left / total, arabs = 100 * blocSeats.Arabs / total;
  const start = new Date(Math.min(...included.map(parsePollDate))).toLocaleDateString('he-IL', {day:'2-digit',month:'2-digit'});
  const end = new Date(Math.max(...included.map(parsePollDate))).toLocaleDateString('he-IL', {day:'2-digit',month:'2-digit'});
  const sources = included.slice().sort((a,b)=>parsePollDate(b)-parsePollDate(a)).map(p => `<li>${esc(p.date)} · ${esc(p.channelHebrewName)} · ${esc(firmOf(p.sourceId).meta.he)}</li>`).join('');
  status.innerHTML = `<span><b>${included.length} סקרים</b> ${start === end ? `מ־${end}` : `בין ${start} ל־${end}`}${S.avgWeight === 'reliability' ? ' · משקל גבוה יותר למכון בעל ציון אמינות גבוה' : ''}</span><details class="average-source-popover"><summary>הסקרים שנכללו</summary><ul>${sources}</ul></details>`;
  const donutStyle = `background:conic-gradient(${BLOCS.Right.color} 0 ${right}%,${BLOCS.Left.color} ${right}% ${right+left}%,${BLOCS.Arabs.color} ${right+left}% ${right+left+arabs}%,${BLOCS.Unknown.color} ${right+left+arabs}% 100%)`;
  const max = Math.max(1, ...averages.map(x => x.seats));
  box.innerHTML = `<aside class="average-blocs"><div class="bloc-donut" style="${donutStyle}"><span><b>120</b><small>מנדטים</small></span></div><div class="bloc-legend">${[['Right','גוש הימין'],['Left','מרכז־שמאל'],['Arabs','הרשימות הערביות'],['Unknown','לא משויך']].filter(([k])=>k !== 'Unknown' || blocSeats[k] > 0).map(([k,l])=>`<div style="--c:${BLOCS[k].color}"><i></i><span>${l}</span><b>${blocSeats[k]}</b></div>`).join('')}</div></aside><div class="average-party-list">${averages.map(x => {
    const meta=partyMeta(x.id), col=partyColor(x.id, meta.alignment);
    const detail=x.values.slice().sort((a,b)=>parsePollDate(b.p)-parsePollDate(a.p)).map(({p,v})=>`<li><span>${esc(p.channelHebrewName)} · ${esc(firmOf(p.sourceId).meta.he)} · ${esc(p.date)}</span><b>${v}</b></li>`).join('');
    return `<article class="average-party" tabindex="0" style="--c:${col}"><span class="average-logo">${meta.logo?`<img src="${esc(meta.logo)}" alt="" onerror="this.remove()">`:esc(initials(meta.name))}</span><strong>${esc(meta.name)}</strong><span class="average-bar"><i style="width:${100*x.seats/max}%"></i></span><b class="average-number">${x.seats}</b><div class="average-tooltip"><b>הסקרים שמרכיבים את הממוצע</b><ul>${detail}</ul></div></article>`;
  }).join('')}</div>`;
  const firmRows = [...new Set(included.map(p => firmOf(p.sourceId).firm))].map(id => {
    const sample = included.find(p => firmOf(p.sourceId).firm === id), meta = firmOf(sample.sourceId).meta;
    return { meta, score:firmScore(meta), n:included.filter(p => firmOf(p.sourceId).firm === id).length };
  }).sort((a,b)=>b.score-a.score);
  firmsBox.innerHTML = `<h3>המכונים בחלון לפי רמת אמינות</h3><div>${firmRows.map((f,i)=>`<span style="--firm:${esc(f.meta.color||'#64707C')}"><b>${i+1}</b>${logoBox(f.meta,30)}<strong>${esc(f.meta.he)}</strong><em>${r1(f.score)}</em><small>${f.n} סקרים</small></span>`).join('')}</div>`;
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
/* ---------- מגמות מכון: כל הסקרים של מכון אחד לאורך זמן ----------
   גושים — גרף קווים אחד, עם קו הרוב (61) וחלונית שעוקבת אחרי הסמן. מפלגות — גרף
   קטן לכל רשימה, כולם באותו קנה מידה אנכי (אותו מספר מנדטים לגובה), כך ששיפוע
   אומר אותו דבר בכל גרף. המקור: כל הארכיון מאז תחילת החלון, לא רק 4 האחרונים. */
const TREND_BLOCS = ['Right', 'Left', 'Arabs', 'Unknown'];
const trendBlocsOf = p => Object.fromEntries(TREND_BLOCS.map(k => [k, p.parties.filter(x => alignOf(x) === k).reduce((n, x) => n + x.mandates, 0)]));
const trendSigned = d => d > 0 ? `+${r1(d)}` : d < 0 ? `−${r1(-d)}` : '0';
const trendShortDate = p => new Date(parsePollDate(p)).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

function trendFirms() {
  const src = (S.pollsArchive?.polls?.length ? S.pollsArchive.polls : S.cur.polls).filter(p => parsePollDate(p) >= POLLS_FROM);
  const by = new Map();
  src.forEach(p => {
    const f = firmOf(p.sourceId);
    if (!by.has(f.firm)) by.set(f.firm, { firm: f.firm, meta: f.meta, polls: [] });
    by.get(f.firm).polls.push(p);
  });
  const list = [...by.values()].sort((a, b) => Math.max(...b.polls.map(parsePollDate)) - Math.max(...a.polls.map(parsePollDate)));
  const baro = barometerWeeklyPolls();
  if (baro.length) list.push({ firm: BAROMETER_SOURCE, meta: firmOf(BAROMETER_SOURCE).meta, label: BAROMETER_OUTLET, polls: baro });
  list.forEach(f => f.polls.sort((a, b) => parsePollDate(a) - parsePollDate(b) || (a.publishedAt || 0) - (b.publishedAt || 0)));
  return list;
}

function renderFirmTrends() {
  if (!$('#polls-trends')) return;
  const firms = trendFirms();
  if (!firms.length) { $('#trend-chart').innerHTML = '<p class="empty">אין סקרים להצגה.</p>'; return; }
  if (!firms.some(f => f.firm === S.trendFirm)) S.trendFirm = firms[0].firm;
  const sel = $('#trend-firm');
  sel.innerHTML = firms.map(f => `<option value="${esc(f.firm)}">${esc(f.label || f.meta.he)} · ${f.polls.length} ${f.firm === BAROMETER_SOURCE ? 'שבועות' : 'סקרים'}</option>`).join('');
  sel.value = S.trendFirm;
  $$('[data-trend-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.trendMode === S.trendMode)));
  const cur = firms.find(f => f.firm === S.trendFirm), polls = cur.polls;
  const first = polls[0], last = polls.at(-1), b0 = trendBlocsOf(first), b1 = trendBlocsOf(last);
  const outlets = [...new Set(polls.map(p => p.channelHebrewName))];
  $('#trend-summary').innerHTML =
    `<div><b class="num">${polls.length}</b><span>${cur.firm === BAROMETER_SOURCE ? 'תחזיות שבועיות' : 'סקרים'} · ${esc(first.date)}–${esc(last.date)}</span></div>` +
    ['Right', 'Left', 'Arabs'].map(k => `<div><b class="num">${b1[k]}</b><span>${esc(BLOCS[k].he)} · <span dir="ltr">${trendSigned(b1[k] - b0[k])}</span> מאז ${esc(first.date)}</span></div>`).join('') +
    (cur.firm === BAROMETER_SOURCE ? '' : `<p class="trend-outlets">${esc(outlets.join(' · '))}</p>`);
  if (S.trendMode === 'parties') renderFirmPartyTrends(polls); else renderFirmBlocTrend(polls);
}

function renderFirmBlocTrend(polls) {
  const blocs = polls.map(trendBlocsOf);
  const keys = TREND_BLOCS.filter(k => blocs.some(b => b[k] > 0));
  const W = 900, H = 340, m = { l: 40, r: 130, t: 16, b: 34 };
  const t0 = parsePollDate(polls[0]), t1 = parsePollDate(polls.at(-1));
  const xs = polls.map(p => m.l + (W - m.l - m.r) * (t1 === t0 ? .5 : (parsePollDate(p) - t0) / (t1 - t0)));
  const top = Math.max(70, Math.ceil(Math.max(...blocs.flatMap(b => keys.map(k => b[k]))) / 10) * 10);
  const y = v => H - m.b - (H - m.b - m.t) * v / top;
  const grid = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10).map(v =>
    `<line class="tr-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tr-tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const majority = `<line class="tr-majority" x1="${m.l}" x2="${W - m.r}" y1="${y(61)}" y2="${y(61)}"/><text class="tr-tick" x="${W - m.r + 6}" y="${y(61) - 6}">61 · רוב</text>`;
  /* תאריכים בציר — לכל היותר 7, כדי שלא יתנגשו */
  const step = Math.max(1, Math.ceil(polls.length / 7));
  const dates = polls.map((p, i) => i % step && i !== polls.length - 1 ? '' : `<text class="tr-tick" x="${xs[i]}" y="${H - 10}" text-anchor="middle">${trendShortDate(p)}</text>`).join('');
  const lines = keys.map(k => `<path class="tr-line" d="${blocs.map((b, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${y(b[k]).toFixed(1)}`).join(' ')}" stroke="${BLOCS[k].color}"/>` +
    blocs.map((b, i) => `<circle class="tr-dot" cx="${xs[i].toFixed(1)}" cy="${y(b[k]).toFixed(1)}" r="4" fill="${BLOCS[k].color}"/>`).join('')).join('');
  /* תוויות בקצה: הערך האחרון ושם הגוש, עם קו מוביל כשצריך להרחיק תוויות קרובות */
  const lastB = blocs.at(-1), lx = xs.at(-1);
  const labels = keys.map(k => ({ k, y0: y(lastB[k]), y: y(lastB[k]) })).sort((a, b) => a.y0 - b.y0);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 16);
  const endLabels = labels.map(l => `${Math.abs(l.y - l.y0) > 1 ? `<line class="tr-leader" x1="${lx + 6}" y1="${l.y0}" x2="${lx + 16}" y2="${l.y}"/>` : ''}<text class="tr-end" x="${lx + 18}" y="${l.y + 4}"><tspan class="tr-end-v">${lastB[l.k]}</tspan> ${esc(BLOCS[l.k].he)}</text>`).join('');
  const legend = keys.map(k => `<span><i style="background:${BLOCS[k].color}"></i>${esc(BLOCS[k].he)}</span>`).join('');
  $('#trend-chart').innerHTML = `<div class="tr-legend">${legend}</div>
    <div class="tr-plot" dir="ltr"><svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="הגושים בסקרי המכון לאורך זמן. חצים ימינה ושמאלה עוברים בין הסקרים; הנתונים המלאים בטבלה שמתחת.">${grid}${majority}${dates}${lines}${endLabels}<line class="tr-cross" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/><rect class="tr-hit" x="${m.l - 10}" y="0" width="${W - m.l - m.r + 20}" height="${H}"/></svg><div class="tr-tip" hidden></div></div>`;
  /* חלונית הריחוף: נצמדת לסקר הקרוב לסמן, ומציגה את כל הגושים בו */
  const plot = $('#trend-chart .tr-plot'), svg = plot.querySelector('svg'), tip = plot.querySelector('.tr-tip'), cross = svg.querySelector('.tr-cross');
  plot.scrollLeft = plot.scrollWidth;                     // בטלפון הגרף נגלל — מתחילים מהסקרים האחרונים
  let idx = polls.length - 1;
  const show = i => {
    idx = Math.max(0, Math.min(polls.length - 1, i));
    const p = polls[idx], b = blocs[idx];
    cross.setAttribute('x1', xs[idx]); cross.setAttribute('x2', xs[idx]); cross.setAttribute('visibility', 'visible');
    tip.replaceChildren();
    const head = document.createElement('p'); head.className = 'tr-tip-head'; head.textContent = `${p.date} · ${p.channelHebrewName}`; tip.append(head);
    keys.slice().sort((a, c) => b[c] - b[a]).forEach(k => {
      const row = document.createElement('p'), key = document.createElement('i'), v = document.createElement('b'), n = document.createElement('span');
      key.style.background = BLOCS[k].color; v.textContent = b[k]; n.textContent = BLOCS[k].he;
      row.append(key, v, n); tip.append(row);
    });
    tip.hidden = false;
    const r = svg.getBoundingClientRect(), px = xs[idx] * r.width / W;
    tip.style.left = `${Math.min(Math.max(px + 14, 0), r.width - tip.offsetWidth - 4)}px`;
    if (px + 14 + tip.offsetWidth > r.width) tip.style.left = `${Math.max(0, px - tip.offsetWidth - 14)}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
    let best = 0; xs.forEach((x, i) => { if (Math.abs(x - sx) < Math.abs(xs[best] - sx)) best = i; });
    show(best);
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(idx));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
  });
  $('#trend-table').innerHTML = `<summary>פתיחת הנתונים כטבלה</summary><div class="tablewrap" tabindex="0" role="region" aria-label="הגושים בכל סקר"><table><thead><tr><th scope="col">תאריך</th><th scope="col">מפרסם</th>${keys.map(k => `<th scope="col" class="n">${esc(BLOCS[k].he)}</th>`).join('')}</tr></thead><tbody>${
    polls.slice().reverse().map((p, i) => { const b = blocs[polls.length - 1 - i]; return `<tr><td>${esc(p.date)}</td><td>${esc(p.channelHebrewName)}</td>${keys.map(k => `<td class="n">${b[k]}</td>`).join('')}</tr>`; }).join('')
  }</tbody></table></div>`;
}

function renderFirmPartyTrends(polls) {
  const ids = [...new Set(polls.flatMap(p => p.parties.filter(x => x.mandates > 0).map(x => normId(x.id))))];
  const series = ids.map(id => ({ id, vals: polls.map(p => pollValue(p, id)) }));
  const lastOf = s => s.vals.filter(v => v !== null).at(-1) ?? 0, firstOf = s => s.vals.find(v => v !== null) ?? 0;
  series.sort((a, b) => lastOf(b) - lastOf(a) || partyMeta(a.id).name.localeCompare(partyMeta(b.id).name, 'he'));
  /* אותו טווח אנכי לכל הגרפים הקטנים — רק נקודת ההתחלה שלו זזה */
  const span = Math.max(8, ...series.map(s => { const v = s.vals.filter(x => x !== null); return Math.max(...v) - Math.min(...v) + 2; }));
  const W = 260, H = 76, m = { l: 22, r: 8, t: 8, b: 8 };
  const t0 = parsePollDate(polls[0]), t1 = parsePollDate(polls.at(-1));
  const xs = polls.map(p => m.l + (W - m.l - m.r) * (t1 === t0 ? .5 : (parsePollDate(p) - t0) / (t1 - t0)));
  $('#trend-chart').innerHTML = `<div class="tr-minis">${series.map(s => {
    const vs = s.vals.filter(v => v !== null), mid = (Math.max(...vs) + Math.min(...vs)) / 2;
    const lo = Math.max(0, Math.round(mid - span / 2)), hi = lo + span;
    const y = v => H - m.b - (H - m.b - m.t) * (v - lo) / span;
    const meta = partyMeta(s.id), col = partyColor(s.id, meta.alignment);
    /* קו עם רווחים במקום שבו המכון לא מדד את הרשימה */
    let d = '', pen = false;
    s.vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${xs[i].toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
    const li = s.vals.map((v, i) => v === null ? -1 : i).filter(i => i >= 0).at(-1);
    const hits = s.vals.map((v, i) => v === null ? '' : `<circle class="tr-hitdot" cx="${xs[i].toFixed(1)}" cy="${y(v).toFixed(1)}" r="10"><title>${esc(polls[i].date)} · ${esc(polls[i].channelHebrewName)}: ${v}</title></circle>`).join('');
    const delta = lastOf(s) - firstOf(s);
    return `<figure class="tr-mini"><figcaption><i style="background:${col}"></i><b>${esc(meta.name)}</b><span class="num">${lastOf(s)}</span><small dir="ltr">${delta ? (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta) : '='}</small></figcaption>
      <svg viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="${esc(meta.name)}: מ־${firstOf(s)} ל־${lastOf(s)} מנדטים"><line class="tr-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(lo)}" y2="${y(lo)}"/><line class="tr-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(hi)}" y2="${y(hi)}"/><text class="tr-tick" x="${m.l - 4}" y="${y(lo) + 4}" text-anchor="end">${lo}</text><text class="tr-tick" x="${m.l - 4}" y="${y(hi) + 4}" text-anchor="end">${hi}</text><path class="tr-line" d="${d}" stroke="${col}"/>${li >= 0 ? `<circle class="tr-dot" cx="${xs[li].toFixed(1)}" cy="${y(s.vals[li]).toFixed(1)}" r="4" fill="${col}"/>` : ''}${hits}</svg></figure>`;
  }).join('')}</div>`;
  $('#trend-table').innerHTML = `<summary>פתיחת הנתונים כטבלה</summary><div class="tablewrap" tabindex="0" role="region" aria-label="המפלגות בכל סקר"><table><thead><tr><th scope="col">תאריך</th><th scope="col">מפרסם</th>${series.map(s => `<th scope="col" class="n">${esc(partyMeta(s.id).name)}</th>`).join('')}</tr></thead><tbody>${
    polls.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => `<tr><td>${esc(p.date)}</td><td>${esc(p.channelHebrewName)}</td>${series.map(s => `<td class="n">${s.vals[i] ?? '—'}</td>`).join('')}</tr>`).join('')
  }</tbody></table></div>`;
}

function wireExploration() {
  $('#trend-firm')?.addEventListener('change', e => { S.trendFirm = e.target.value; renderFirmTrends(); });
  $$('[data-trend-mode]').forEach(b => b.addEventListener('click', () => { S.trendMode = b.dataset.trendMode; renderFirmTrends(); }));
  $$('[data-homeview]').forEach(b=>b.addEventListener('click',()=>{S.homeView=b.dataset.homeview;$$('[data-homeview]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$$('[data-homepanel]').forEach(x=>x.hidden=x.dataset.homepanel!==S.homeView);}));
  $('#poll-party').addEventListener('change',e=>{S.focusParty=e.target.value;renderPolls();});
  $('#polls-cards').addEventListener('change', e => {
    const sel = e.target.closest('[data-card-outlet]');
    if (!sel) return;
    S.cardPoll[sel.dataset.cardOutlet] = sel.value;
    renderPolls();
    $(`[data-card-outlet="${CSS.escape(sel.dataset.cardOutlet)}"]`)?.focus();
  });
  $('#compare-picker').addEventListener('change',e=>{const id=e.target.dataset.compareId;if(!id)return;S.compareIds=e.target.checked?[...S.compareIds,id].slice(0,3):S.compareIds.filter(x=>x!==id);renderPolls();$$('[data-compare-id]').find(x=>x.dataset.compareId===id)?.focus();});
  $$('.average-days [data-avg-days]').forEach(b=>b.addEventListener('click',()=>{S.avgDays=Number(b.dataset.avgDays);$$('[data-avg-days]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderPolls();}));
  $('#average-weight').addEventListener('change',e=>{S.avgWeight=e.target.value;renderPolls();});
  document.addEventListener('click',e=>{
    const select=e.target.closest('[data-select-party]');
    if(select){S.focusParty=S.focusParty===select.dataset.selectParty?'':select.dataset.selectParty;renderPolls();$('#poll-party').focus();}
    const focus=e.target.closest('[data-focus-party]');
    if(focus){S.focusParty=focus.dataset.focusParty;S.trendParty=S.focusParty;location.hash='#/polls';}
    
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.nav-more')?.open){$('.nav-more').open=false;$('.nav-more summary').focus();}});
}
