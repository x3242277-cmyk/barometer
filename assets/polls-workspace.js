/* כל הסקרים · מגמות והשוואות — כרטיס אחד בגובה המסך:
   שורה אחת של מקרא וכלים, שתי שורות לוגואים (מימין מי פרסם, משמאל על מה), והגרף או הטבלה בכל הגובה שנשאר.
   ברירת המחדל = ממוצע הסקרים של הגושים. בחירת ערוץ מציגה את הסקרים שלו כפי שפורסמו: רשימה שלא נמדדה נשארת חסרה (לא 0), והקו נקטע
   כשהרכב הרשימה משתנה. */
const EXPLORER_COLORS = ['#0f7c8a', '#c7871a', '#7c5aa6', '#475569', '#b0467d'];
const EXPLORER_MODES = { overview: 'מבט כולל', channels: 'ערוצים', firms: 'מכונים', parties: 'מפלגות' };
const EXPLORER_MAX = 5;
/* שתי שורות אייקונים: מימין המקורות (ערוצים + הברומטר; בלי בחירה — ממוצע כל הסקרים),
   משמאל הנושאים (מפלגות + סמל הכנסת = הגושים; ברירת המחדל). */
const EXPLORER_BARO = { key: 'baro', label: 'תחזית הברומטר', logo: 'assets/logos/barometer-mark.png', short: 'ה' };
const EXPLORER_BLOCS = { key: 'blocs', label: 'הכנסת · הגושים (ברירת מחדל)', logo: 'assets/logos/knesset-emblem.svg', short: 'כנסת', special: true };
const EXPLORER_METRICS = { Right: 'ימין וחרדים', Left: 'מרכז–שמאל', Arabs: 'הרשימות הערביות' };
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
  if (e.svg) return `<span class="ex-avatar ex-avatar-svg">${e.svg}</span>`;
  /* מפלגה: הלוגו של המפלגה (לא תמונת המנהיג); ראשי התיבות עד שהוא נטען */
  return `<span class="ex-avatar"><span class="ex-logo-fallback">${esc(e.short || initials(e.label))}</span>${e.logo ? `<img class="ex-logo-image" src="${esc(e.logo)}" alt="" loading="lazy" onload="this.parentNode.classList.add('ex-logo-ready')" onerror="this.remove()">` : ''}</span>`;
}

function explorerState(P) {
  if (S.exploreView !== 'table') S.exploreView = 'chart';
  const channels = explorerEntities(P, 'channels'), parties = explorerEntities(P, 'parties');
  const chKeys = new Set(channels.map(e => e.key)), pKeys = new Set(parties.map(e => e.key));
  S.exSources = (S.exSources || []).filter(k => k === 'baro' || chKeys.has(k)).slice(0, EXPLORER_MAX);
  let subs = (S.exSubjects || ['blocs']).filter(k => k === 'blocs' || pKeys.has(k));
  if (subs.length > 1) subs = subs.filter(k => k !== 'blocs');
  S.exSubjects = (subs.length ? subs : ['blocs']).slice(0, EXPLORER_MAX);
  /* בגושים כל מקור מוסיף שני קווים, אז לא יותר ממה שנכנס */
  if (S.exSubjects[0] === 'blocs') S.exSources = S.exSources.slice(0, Math.floor(EXPLORER_MAX / EXPLORER_BLOC_LINES.length));
  if (!EXPLORER_METRICS[S.exploreMetric]) S.exploreMetric = 'Right';
  const sources = S.exSources, subjects = S.exSubjects, hasChannel = sources.some(k => k !== 'baro');
  return { channels, parties, sources, subjects, hasChannel, overview: subjects[0] === 'blocs' && !hasChannel, metric: S.exploreMetric, view: S.exploreView };
}
/* כמה קווים יצטרכו אם מוסיפים בחירה: מקורות (או ממוצע) כפול נושאים (או גוש אחד) */
/* גושים = שני קווים לכל מקור (ימין וחרדים, מרכז–שמאל), מפלגות = קו לכל מפלגה */
const EXPLORER_BLOC_LINES = ['Right', 'Left'];
const explorerLineCount = (sources, subjects) => Math.max(1, sources.length) * (subjects[0] === 'blocs' ? EXPLORER_BLOC_LINES.length : subjects.length);

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
function explorerSeriesDays(M) {
  const end = M.now.t, start = S.trackRange === 'month' ? end - 29 * DAY_MS : -Infinity;
  const day = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const byDay = new Map(); M.series.filter(s => s.t >= start).forEach(s => byDay.set(day(s.t), s));
  return [...byDay.values()];
}
function explorerPartyLines(M, state) {
  const series = explorerSeriesDays(M);
  return state.selected.map((e, i) => {
    const points = series.map(s => ({ t: s.t, v: s.parties[e.key] || 0, n: s.n, firms: s.firms, polls: [], signature: '' }));
    return { ...e, color: e.color || EXPLORER_COLORS[i], points, last: points.at(-1) };
  });
}
/* הקווים של ההשוואה: לכל מקור שנבחר (ערוץ, הברומטר, או הממוצע) ולכל נושא (גוש או מפלגה) */
function explorerCompareLines(P, M, Mb, state) {
  const srcs = state.sources.length ? state.sources : ['agg'];
  const metrics = state.subjects[0] === 'blocs' ? EXPLORER_BLOC_LINES : state.subjects;
  const partyOf = id => state.parties.find(e => e.key === id);
  const lines = [];
  srcs.forEach((src, si) => metrics.forEach((metric, mi) => {
    const subject = EXPLORER_METRICS[metric] ? { label: EXPLORER_METRICS[metric], color: BLOCS[metric].color } : { label: partyOf(metric)?.label || metric, color: partyOf(metric)?.color };
    const channel = state.channels.find(e => e.key === src);
    const source = src === 'agg' ? { label: TRACK_BASES[M.basis || 'avg'].label } : src === 'baro' ? EXPLORER_BARO : channel;
    let points;
    if (channel) points = explorerLines(P, { mode: 'channels', selected: [channel], metric })[0].points;
    else {
      const model = src === 'baro' ? Mb : M;
      points = explorerSeriesDays(model).map(s => ({ t: s.t, v: EXPLORER_METRICS[metric] ? s.blocs[metric] : (s.parties[metric] || 0), n: s.n, firms: s.firms, polls: [], signature: '' }));
    }
    const label = srcs.length > 1 ? `${subject.label} · ${source.label}` : subject.label;
    /* גושים: הצבע לפי הגוש, והמקור הבא מסומן בקו מקווקו; מפלגות: צבע המפלגה, ובכמה מקורות — צבע לפי מקור */
    const bloc = !!EXPLORER_METRICS[metric];
    const color = bloc || srcs.length === 1 ? subject.color : metrics.length === 1 ? EXPLORER_COLORS[si % EXPLORER_COLORS.length] : EXPLORER_COLORS[(si * metrics.length + mi) % EXPLORER_COLORS.length];
    const dash = bloc && si > 0 ? ['', '7 5', '2 5'][si % 3] : '';
    lines.push({ key: `${src}|${metric}`, source: src, subject: metric, dash, label, color: color || EXPLORER_COLORS[lines.length % EXPLORER_COLORS.length], points, last: points.at(-1) });
  }));
  return lines;
}
const explorerLinesFor = (P, M, state) => state.mode === 'parties' && M ? explorerPartyLines(M, state) : explorerLines(P, state);

/* כל תאריכי הפרסום בטווח, מהחדש לישן; — = לא נמדד בתאריך הזה */
function explorerTable(lines, dates) {
  return `<div class="tablewrap ex-data-table" tabindex="0" role="region" aria-label="נתוני ההשוואה"><table><thead><tr><th scope="col">תאריך</th>${lines.map(l => `<th scope="col" style="--c:${l.color}">${esc(l.label)}</th>`).join('')}</tr></thead><tbody>${dates.map(t => `<tr><th scope="row">${trDay(t)}</th>${lines.map(l => { const p = l.points.find(p => p.t === t); return `<td>${p ? `<b>${trFmt(p.v)}</b>${p.n > 1 ? `<small>${p.n} סקרים</small>` : ''}` : '<span class="ex-na" title="אין מדידה בתאריך זה">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* הגרף בגודל המקום שקיבל (S.trackWidth × S.trackH), כך שהטקסט לא נמתח */
function explorerChart(P, state, M) {
  const lines = state.lines || explorerLinesFor(P, M, state), valid = lines.filter(l => l.points.length), points = valid.flatMap(l => l.points);
  const dates = [...new Set(points.map(p => p.t))].sort((a, b) => b - a), table = explorerTable(lines, dates);
  if (!points.length) return { lines, dates, table, svg: `<div class="ex-empty">${(state.selected || state.lines || []).length ? 'אין מדידות בטווח הזה. נסו טווח רחב יותר.' : 'בחרו לוגו אחד או יותר כדי להשוות.'}</div>` };
  const W = Math.max(320, S.trackWidth || 850), H = Math.max(160, S.trackH || 260), m = { l: 34, r: 16, t: 14, b: 26 + (S.exBasisOn ? 34 : 0) };
  const t0 = Math.min(...points.map(p => p.t)), t1 = Math.max(t0 + DAY_MS, ...points.map(p => p.t));
  const vals = points.map(p => p.v), isRight = state.isRight ?? (state.mode !== 'parties' && state.metric === 'Right');
  const span = Math.max(...vals) - Math.min(...vals), step = span > 30 ? 10 : span > 12 ? 5 : 2;
  let lo = Math.max(0, Math.floor((Math.min(...vals)-2)/step)*step), hi = Math.ceil((Math.max(...vals)+2)/step)*step;
  if (isRight) { lo = Math.min(lo, 58); hi = Math.max(hi, 64); }
  const x = t => m.l + (W-m.l-m.r)*(t-t0)/(t1-t0), y = v => m.t+(H-m.t-m.b)*(1-(v-lo)/(hi-lo));
  let grid = '';
  for (let v=lo; v<=hi; v+=step) grid += `<line class="tr-grid" x1="${m.l}" x2="${W-m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tr-tick" x="${m.l-7}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  if (isRight) grid += `<line class="tr-ref" x1="${m.l}" x2="${W-m.r}" y1="${y(61)}" y2="${y(61)}"/><text class="tr-ref-label" x="${W-m.r}" y="${y(61)-7}" text-anchor="end">61 · רוב</text>`;
  const ticks = Math.max(2, Math.floor(W/110));
  for (let i=0;i<=ticks;i++) { const t=t0+(t1-t0)*i/ticks; grid += `<text class="tr-tick" x="${x(t)}" y="${H-8}" text-anchor="middle">${trDay(t)}</text>`; }
  const paths = valid.map(l => `<path class="tr-line ex-line" stroke="${l.color}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''} d="${l.points.map((p,i) => `${i && p.signature===l.points[i-1].signature?'L':'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}"/>${l.points.map(p => `<circle class="ex-point" cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="${l.color}"><title>${esc(l.label)} · ${trDay(p.t)} · ${trFmt(p.v)} מנדטים · ${p.n} סקרים</title></circle>`).join('')}`).join('');
  const svg = `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="השוואת ${esc(lines.map(l=>l.label).join(', '))} לאורך זמן, במנדטים. הנתונים המלאים בתצוגת הטבלה.">${grid}${paths}<line class="tr-cursor" x1="0" x2="0" y1="${m.t}" y2="${H-m.b}" hidden/><rect class="tr-hit" x="${m.l}" y="${m.t}" width="${W-m.l-m.r}" height="${H-m.t-m.b}"/></svg>`;
  const sub = state.sub ?? (state.mode === 'parties' && M ? TRACK_BASES[M.basis || 'avg'].label : '');
  return { lines, dates, table, svg, sub, geom: { W, m, t0, t1, x, y } };
}

const exInfo = text => `<span class="tr-info" tabindex="0" role="note" title="${esc(text)}" aria-label="${esc(text)}">ⓘ</span>`;
const exSelect = (attr, label, options, value) => `<select ${attr} aria-label="${esc(label)}">${options.map(([k, l]) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

/* המקרא הוא גם שורת המספרים: במבט הכולל — שלושת הגושים והשינוי בשבועיים;
   בהשוואה — כל מה שנבחר, עם המדידה האחרונה ותאריכה */
function explorerKeys(M, state, lines) {
  if (state.overview) return TRACK_BLOCS.map(([k, label]) => {
    const d = trDelta(M.now.blocs[k] - M.before.blocs[k]);
    return `<span class="ex-key${k === 'Arabs' ? ' no-line' : ''}" style="--c:${BLOCS[k].color}"><i></i><span>${label}</span><b>${trFmt(M.now.blocs[k])}</b><em class="${d.cls}" title="שינוי לעומת לפני שבועיים">${d.sym}</em></span>`;
  }).join('');
  return lines.map(l => `<span class="ex-key" style="--c:${l.color}"><i></i><span>${esc(l.label)}</span><b>${l.last ? trFmt(l.last.v) : '—'}</b><small>${l.last ? trDay(l.last.t) : 'אין נתון'}</small></span>`).join('') || '<span class="ex-key-empty">עוד לא נבחר דבר</span>';
}

function explorerTools(P, M, state) {
  const out = [];
  const model = state.hasChannel ? null : state.model;
  const first = model ? model.series[0].t : parsePollDate(P.polls[0]), last = model ? model.now.t : parsePollDate(P.polls.at(-1));
  if (last - first > 31 * DAY_MS) out.push(exSelect('data-ex-range', 'טווח זמן', [['all', model && (model.basis || 'avg') !== 'avg' ? `מאז ${trDay(first)}` : 'מאז אוגוסט'], ['month', 'חודש אחרון']], S.trackRange));
  out.push(`<div class="switch ex-view" role="group" aria-label="תצוגה"><button type="button" data-ex-view="chart" aria-pressed="${state.view === 'chart'}">גרף</button><button type="button" data-ex-view="table" aria-pressed="${state.view === 'table'}">טבלה</button></div>`);
  const modelNote = TRACK_BASES[((model || M).basis) || 'avg'].note;
  out.push(exInfo(state.overview ? `${modelNote} בגרף: ימין וחרדים מול מרכז–שמאל; הרשימות הערביות — במספר בלבד.`
    : state.hasChannel ? EXPLORER_NOTE : `${modelNote} כל קו הוא מפלגה אחת; רשימה שלא הופיעה בסקר נספרת 0, כמו בשאר האתר.`));
  return out.join('');
}

/* שתי שורות לוגואים: מימין מי פרסם (הברומטר והערוצים), משמאל על מה (סמל הכנסת = הגושים, והמפלגות) */
function explorerPicker(state, hasBaro) {
  const colorOf = (kind, key) => state.lines?.find(l => l[kind] === key)?.color;
  const count = explorerLineCount(state.sources, state.subjects);
  /* המקור שהקו שלו מקווקו מקבל מסגרת מקווקת באותו סגנון, כדי שיהיה ברור מי מי */
  const dashOf = (kind, key) => kind === 'source' ? state.lines?.find(l => l.source === key)?.dash : '';
  const btn = (attr, e, on, kind, disabled) => `<button type="button" class="ex-logo-button${e.special || e.key === 'baro' ? ' ex-logo-special' : ''}${on && dashOf(kind, e.key) ? (dashOf(kind, e.key) === '2 5' ? ' is-dotted' : ' is-dashed') : ''}" ${attr}="${esc(e.key)}" title="${esc(e.label)}" aria-label="${esc(e.label)}" aria-pressed="${on}"${on && colorOf(kind, e.key) ? ` style="--c:${colorOf(kind, e.key)}"` : ''}${disabled ? ' disabled' : ''}>${explorerLogo(e)}</button>`;
  const canSrc = k => state.sources.includes(k) || explorerLineCount([...state.sources, k], state.subjects) <= EXPLORER_MAX;
  const canSub = k => state.subjects.includes(k) || (state.subjects[0] === 'blocs' ? explorerLineCount(state.sources, [k]) : explorerLineCount(state.sources, [...state.subjects, k])) <= EXPLORER_MAX;
  const sources = [hasBaro ? btn('data-ex-src', EXPLORER_BARO, state.sources.includes('baro'), 'source', !canSrc('baro')) : '', ...state.channels.map(e => btn('data-ex-src', e, state.sources.includes(e.key), 'source', !canSrc(e.key)))].join('');
  const subjects = [btn('data-ex-sub', EXPLORER_BLOCS, state.subjects[0] === 'blocs', 'subject', false), ...state.parties.map(e => btn('data-ex-sub', e, state.subjects.includes(e.key), 'subject', !canSub(e.key)))].join('');
  return `<div class="ex-pickers">
    <div class="ex-picker ex-src" role="group" aria-label="מי פרסם — בלי בחירה מוצג ממוצע כל הסקרים"><span class="ex-picker-label">מי פרסם <small>בלי בחירה: ממוצע כולם</small></span><span class="ex-picker-icons">${sources}</span></div>
    <div class="ex-picker ex-sub" role="group" aria-label="על מה — סמל הכנסת הוא הגושים"><span class="ex-picker-label">על מה <small>סמל הכנסת: הגושים</small></span><span class="ex-picker-icons">${subjects}</span><span class="ex-count" title="לחצו על הלוגואים כדי להוסיף או להסיר">${count}/${EXPLORER_MAX}</span></div>
  </div>`;
}

function renderExplorerHTML(P, M, Mb) {
  const state = explorerState(P), hasBaro = !!(Mb && Mb.basis);
  if (!hasBaro) state.sources = S.exSources = state.sources.filter(k => k !== 'baro');
  state.hasChannel = state.sources.some(k => k !== 'baro');
  state.overview = state.subjects[0] === 'blocs' && !state.hasChannel;
  /* הדגם של הקווים המצטברים: הברומטר אם נבחר, אחרת הממוצע שנבחר בלשונית */
  state.model = state.sources.includes('baro') && !state.hasChannel ? Mb : M;
  state.lines = state.overview ? [] : explorerCompareLines(P, M, hasBaro ? Mb : M, state);
  state.isRight = state.subjects[0] === 'blocs';
  state.sub = state.hasChannel ? '' : TRACK_BASES[state.model.basis || 'avg'].label;
  S.explorer = { P, M, Mb, state };
  /* בחירת בסיס הממוצע יושבת בתחתית הגרף, מעל התאריכים, ונעלמת כשנבחר מקור (ערוץ או הברומטר) */
  const basis = M.basis || 'avg', hasBasis = !state.sources.length;
  S.exBasisOn = hasBasis;
  const tabs = hasBasis ? `<div class="ex-basis" role="tablist" aria-label="על מה מבוסס הממוצע">${Object.entries(TRACK_BASES).filter(([k]) => k !== 'baro').map(([k, b]) => `<button type="button" role="tab" data-ex-basis="${k}" aria-selected="${basis === k}" title="${esc(b.note)}">${b.label}</button>`).join('')}</div>` : '';
  return `<div class="tr-card ex-workspace${hasBasis ? ' has-basis' : ''}" data-mode="${state.overview ? 'overview' : 'compare'}">
    <div class="ex-bar"><div class="ex-keys">${explorerKeys(state.model, state, state.lines)}</div><div class="ex-tools">${explorerTools(P, M, state)}</div></div>
    ${explorerPicker(state, hasBaro)}
    <div class="ex-stage"><div class="ex-body" data-ex-body></div>${tabs}</div>
  </div>`;
}

/* מצייר את הגרף (או הטבלה) בדיוק בגודל של .ex-body — שנקבע לפי הפריסה ולא לפי התוכן */
function drawExplorer() {
  const X = S.explorer, body = document.querySelector('#poll-tracker [data-ex-body]'); if (!X || !body) return;
  const w = Math.round(body.clientWidth), h = Math.round(body.clientHeight); if (!w || !h) return;
  S.trackWidth = w; S.trackH = h; S.exDrawn = `${w}x${h}`;
  const overview = X.state.overview, chart = overview ? trackerChart(X.state.model, 'blocs') : explorerChart(X.P, X.state, X.M);
  if (X.state.view === 'table') { body.innerHTML = chart.table; return; }
  body.innerHTML = `<div class="tr-plot">${chart.svg}<div class="tr-tip" hidden></div></div>`;
  if (chart.geom) (overview ? wireTrackerHover : wireExplorerHover)(body, chart);
}
let exObserver = null;
function renderExplorer() {
  const root = document.querySelector('#poll-tracker'), P = trackerModel(); if (!root || !P) return;
  /* ״תחזית הברומטר״ כבר אינה לשונית אלא לוגו בשורת המקורות */
  if (S.trackBasis === 'baro') { S.trackBasis = 'avg'; if (!(S.exSources || []).length) S.exSources = ['baro']; }
  S.trackBasis ||= 'avg'; S.trackRange ||= 'all';
  root.innerHTML = renderExplorerHTML(P, basisModel(P, S.trackBasis), basisModel(P, 'baro'));
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
function feedCardHTML(p, list, expanded = false, gallery = false) {
  const v=pollVector(p), f=firmOf(p.sourceId), previous=previousComparablePoll(p,list);
  const ids=Object.keys(v.parties).filter(id=>v.parties[id]>0).sort((a,b)=>v.parties[b]-v.parties[a]);
  const row=id=>{ const value=v.parties[id], pv=comparablePartyValue(p,previous,id), d=pv === null ? null : value-pv;
    return `<li style="--c:${partyHue(id)}"><i></i><span>${esc(p.parties.find(x=>normId(x.id)===id)?.name||partyMeta(id).name)}</span><b>${value}</b><em class="flat" title="${d===null?'אין מדידה קודמת בת השוואה':'לעומת הסקר הקודם של אותו ערוץ ומכון'}">${d===null?'—':d>0?'↑'+d:d<0?'↓'+Math.abs(d):'='}</em></li>`; };
  /* בסקר שנפתח במסך מלא מוצגות גם הרשימות שלא עוברות את אחוז החסימה (0 מנדטים) */
  const belowNames=gallery?Object.keys(v.parties).filter(id=>v.parties[id]===0).map(id=>p.parties.find(x=>normId(x.id)===id)?.name||partyMeta(id).name):[];
  const belowHTML=belowNames.length?`<div class="feed-below"><b>לא עברו את אחוז החסימה</b><span>${belowNames.map(n=>`<em>${esc(n)}</em>`).join('')}</span></div>`:'';
  const blocs=['Right','Unknown','Arabs','Left'].filter(k=>v.blocs[k]>0), bar=blocs.map(k=>`<span style="flex:${v.blocs[k]};background:${BLOCS[k].color}">${v.blocs[k]>=7?v.blocs[k]:''}</span>`).join('');
  return `<article class="feed-card-shell" data-feed-id="${esc(p.id)}"><details class="feed-item${p.barometer?' is-baro':''}"${expanded?' open':''}><summary><span class="feed-top">${outletLogo(p.channelHebrewName)}<span class="feed-who"><b>${esc(p.channelHebrewName)}</b><small>${p.barometer?'ניתוח שבועי':esc(f.meta.he)}</small></span><time title="${esc(p.date)}">${esc(feedWhen(p))}${p.barometer?' · 20:00':''}</time></span><span class="feed-bar" role="img" aria-label="${esc(blocs.map(k=>`${BLOCS[k].he}: ${v.blocs[k]}`).join(', '))}">${bar}<i class="feed-61"></i></span><span class="feed-lead">${ids.filter(id=>v.parties[id]>0).slice(0,3).map(id=>`<span>${esc(partyMeta(id).name)} <b>${v.parties[id]}</b></span>`).join('')}</span></summary><div class="feed-cols">${[['Right','ימין וחרדים'],['rest','יתר הרשימות']].map(([side,label])=>{const col=ids.filter(id=>(partyMeta(id).alignment==='Right')===(side==='Right'));return `<div><p class="feed-col-head">${label}<b>${col.reduce((n,id)=>n+v.parties[id],0)}</b></p><ol class="feed-parties">${col.map(row).join('')}</ol></div>`;}).join('')}</div>${belowHTML}<p class="feed-src">${previous?'השינוי מול הסקר הקודם של אותו ערוץ ומכון · '+esc(previous.date):'אין סקר קודם בר השוואה'}${p.sourceUrl?` · <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">מקור ↗</a>`:''}<button type="button" class="feed-expand-one" data-feed-poll="${esc(p.id)}" aria-label="הגדלת הסקר של ${esc(p.channelHebrewName)} מ־${esc(p.date)}">⤢ הגדלה</button></p></details></article>`;
}

/* סקר אחד במסך מלא — לקריאה נוחה של כל הרשימות */
function openPollGallery(id) {
  const P=trackerModel(); if(!P)return;
  const list=[...P.polls,...weeklyBaro()].sort((a,b)=>parsePollDate(b)-parsePollDate(a)), poll=list.find(p=>p.id===id), dlg=$('#poll-gallery');
  if(!poll||!dlg)return;
  const firm=poll.barometer?null:firmOf(poll.sourceId).meta;
  $('#poll-gallery-title').textContent=`${poll.channelHebrewName} · ${poll.barometer?'ניתוח שבועי':firm.he}`;
  $('#poll-gallery-count').textContent=`${poll.date} · המספרים במנדטים`;
  /* בראש הסקר, באמצע: לוגו הערוץ בגדול, ולצדו לוגו המכון שסוקר */
  $('#poll-gallery-logos').innerHTML=`<span class="pg-channel">${outletLogo(poll.channelHebrewName)}</span>${firm?`<span class="pg-firm">${logoBox(firm,64)}</span>`:''}`;
  $('#poll-gallery-cards').innerHTML=feedCardHTML(poll,list,true,true);
  dlg.showModal();dlg.scrollTop=0;
}

if(typeof document!=='undefined') document.addEventListener('DOMContentLoaded',()=>{
  const refocus = sel => document.querySelector(sel)?.focus();
  document.addEventListener('click',e=>{
    const src=e.target.closest('[data-ex-src]');
    if(src){const key=src.dataset.exSrc,cur=S.exSources||[];S.exSources=cur.includes(key)?cur.filter(k=>k!==key):cur.concat(key);renderExplorer();refocus(`[data-ex-src="${CSS.escape(key)}"]`);return;}
    const sub=e.target.closest('[data-ex-sub]');
    if(sub){const key=sub.dataset.exSub,cur=(S.exSubjects||['blocs']).filter(k=>k!=='blocs');S.exSubjects=key==='blocs'?['blocs']:(cur.includes(key)?cur.filter(k=>k!==key):cur.concat(key));renderExplorer();refocus(`[data-ex-sub="${CSS.escape(key)}"]`);return;}
    const basis=e.target.closest('button[data-ex-basis]');
    if(basis){S.trackBasis=basis.dataset.exBasis;renderExplorer();refocus(`button[data-ex-basis="${S.trackBasis}"]`);return;}
    const view=e.target.closest('[data-ex-view]');
    if(view){S.exploreView=view.dataset.exView;renderExplorer();refocus(`[data-ex-view="${S.exploreView}"]`);return;}
    const single=e.target.closest('[data-feed-poll]');
    if(single){if(!single.closest('#poll-gallery'))openPollGallery(single.dataset.feedPoll);return;}
    if(e.target.closest('[data-gallery-close]'))$('#poll-gallery').close();
  });
  document.addEventListener('change',e=>{
    const controls={'data-ex-metric':'exploreMetric','data-ex-range':'trackRange'};
    for(const [attr,key] of Object.entries(controls)) if(e.target.hasAttribute?.(attr)){S[key]=e.target.value;renderExplorer();refocus(`[${attr}]`);return;}
  });
  $('#poll-gallery')?.addEventListener('click',e=>{if(e.target===$('#poll-gallery'))$('#poll-gallery').close();});
});
