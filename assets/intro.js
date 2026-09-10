/* ============================================================
   הצגת החישוב — עמוד הבית.
   שכבת תצוגה בלבד: כל מספר על הבמה נגזר מפונקציות החישוב הקיימות
   (forecast, largestRemainder, firmScore, homeHeadline). שום נתון
   אינו משתנה, ובסוף ההצגה נשאר הקיר הרגיל שמצייר renderHome.

   הבמה נפתחת עם כפתור "טענו את הנתונים". ציר הזמן (שניות) מהלחיצה:
   שלב 1 · טעינת הנתונים ממאגרי המידע — מאגר אחד בכל פעם, בלי מקביל:
     לכל מאגר: מתחבר → טוען רשומות (מונה, מאגר מתמלא) → שולח למנוע
     (מילים נוסעות לאורך הקישור) → נקלט. ואז המאגר הבא.
     0–22      תוצאות האמת 2022 → ארכיון הכיול → דמוגרפיה → ערוצים → מכונים
     22–33.6   ארכיון הסקרים: הסקרים נשלחים אחד־אחד, כל סקר מודגש
               בלוח "נטען עכשיו" ונרשם כנקודות בגרף
     33.6–35   הנתונים נטענו — מעבר לניתוח
   שלב 2 · הניתוח
     35–41     מכיילים כל מכון מול 2022 — עמודות אמינות
     41–47.2   משקללים, אחוז חסימה, 120 מושבים — הסמנים זזים
   התוצאה
     47.2–54.8 מסדר המפלגות: פורטרטים, עמודות שעולות, המספרים עולים,
               כותרת: מי עלה ומי ירד מאתמול, והערה קופצת עם הפירוט
     54.8–56.3 הכרטיסים טסים למקומם בקיר
   ============================================================ */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const home = $('#view-home');
  const root = document.documentElement;
  const NS = 'http://www.w3.org/2000/svg';
  const OFFSET_OK = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('offset-path', 'path("M0 0L1 1")');
  const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const pname = id => partyMeta(id).name.replace(/!.*$/, '').trim();
  const dayKey = v => new Date(v).toLocaleDateString('en-CA', { timeZone:'Asia/Jerusalem' });
  const SRC = 4400, POLL = 265;           /* משך טעינת מאגר אחד · משך סקר אחד בזרם */
  const T = { fetch:5 * SRC, loaded:33600, calib:35000, weigh:41000, lineup:47200, bars:49000, blocs:52100, note:53000, fly:54800, end:56300 };

  let token = 0, raf = 0, played = false, stage = null, timers = [], links = {}, clones = [], counters = [], visHandlers = [], noteShown = false, current = null;

  /* ---------- אייקונים ---------- */
  const GLYPH = {
    globe:  '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 2 2.2 10 0 12M8 2c-2.2 2-2.2 10 0 12"/>',
    tv:     '<rect x="1.5" y="4" width="13" height="8.5" rx="1.5"/><path d="M5 15h6M8 12.5V15M5 1l3 2.5L11 1"/>',
    bars:   '<path d="M3 13V8M7 13V4M11 13V9.5M1 14.5h14"/>',
    ballot: '<rect x="1.5" y="7" width="13" height="7.5" rx="1"/><path d="M5 7V2.5h6V7M6.3 4.8h3.4M1.5 10.5h13"/>',
    clock:  '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.6 1.6"/>',
    people: '<circle cx="5.5" cy="5" r="2.3"/><circle cx="11.2" cy="6" r="1.9"/><path d="M1.2 13.5c.4-3.2 2-4.8 4.3-4.8s3.9 1.6 4.3 4.8M9.6 13.5c.2-2.2 1-3.4 1.6-3.4s1.7 1 2.2 3.4"/>'
  };
  const dbIcon = (glyph, uid) => `<svg viewBox="0 0 44 56" aria-hidden="true"><defs><clipPath id="${uid}"><path d="M4 9v37c0 3.3 8.1 6 18 6s18-2.7 18-6V9z"/></clipPath></defs>
    <g clip-path="url(#${uid})"><rect class="db-fill" x="4" y="9" width="36" height="44"/></g>
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><ellipse cx="22" cy="9" rx="18" ry="6"/><path d="M4 9v37c0 3.3 8.1 6 18 6s18-2.7 18-6V9"/><path d="M4 21.5c0 3.3 8.1 6 18 6s18-2.7 18-6M4 34c0 3.3 8.1 6 18 6s18-2.7 18-6" opacity=".55"/></g>
    <g class="db-glyph" transform="translate(29 40)"><circle r="10.5"/><g transform="translate(-8 -8)" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${GLYPH[glyph]}</g></g></svg>`;

  /* ---------- הנתונים — הכול מהחישוב הקיים ---------- */
  function prepare() {
    const simple = forecast('simple', HIDE_FROM_HOME), weighted = forecast('weighted', HIDE_FROM_HOME), final = forecast(S.mode, HIDE_FROM_HOME);
    const seats = largestRemainder(final.parties);
    const nat = S.regions.national;
    const polls = [...S.cur.polls].sort((a, b) => parsePollDate(a) - parsePollDate(b) || (a.publishedAt || 0) - (b.publishedAt || 0));
    const outlets = [...new Set(polls.map(outletKey))];
    const firms = [...new Set(polls.map(p => firmOf(p.sourceId).firm))]
      .map(id => firmOf(polls.find(p => firmOf(p.sourceId).firm === id).sourceId).meta)
      .map(meta => ({ meta, score: firmScore(meta), stat: meta.calibrated ? S.stats.find(s => s.firm === calibrationId(meta)) : null }))
      .sort((a, b) => b.score - a.score);
    const ids = $$('.hcard', home).map(c => c.dataset.focusParty);
    const val = id => final.parties[id] != null ? final.parties[id] : (final.rawFull[id] || 0);
    const order = ids.slice().sort((a, b) => (seats[b] || 0) - (seats[a] || 0) || val(b) - val(a));
    const blocs = map => { const t = {}; Object.entries(map).forEach(([id, n]) => { const al = partyMeta(id).alignment; t[al] = (t[al] || 0) + n; }); return t; };
    const blocTot = blocs(seats);
    const R = blocTot.Right || 0, LA = (blocTot.Left || 0) + (blocTot.Arabs || 0) + (blocTot.Unknown || 0);
    const maxVal = Math.max(10, ...polls.flatMap(p => p.parties.map(x => x.mandates || 0)));
    const pollVal = (p, id) => p.parties.filter(x => normId(x.id) === id).reduce((s, x) => s + (x.mandates || 0), 0);
    const d = { simple, weighted, final, seats, nat, polls, outlets, firms, ids, order, blocTot, R, LA, maxVal, pollVal, blocs,
      headline: homeHeadline(final, seats, blocTot), calib: S.elections[0], days: new Set(polls.map(p => heDate(parsePollDate(p)))).size };
    d.change = dayChange(d);
    return d;
  }

  /* מי עלה ומי ירד מאתמול: השוואה לתמונת המצב האחרונה של היום הקודם
     ב-forecast-history.json (ואם אין — לעדכון הקודם). */
  function dayChange(d) {
    const snaps = (S.forecastHistory?.snapshots || []).slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const today = dayKey(S.cur.generatedAt), key = S.mode === 'weighted' ? 'weighted' : 'scenario';
    const prev = snaps.find(s => s[key] && dayKey(s.updatedAt) < today) || snaps.find(s => s[key] && Date.parse(s.updatedAt) < Date.parse(S.cur.generatedAt));
    if (!prev) return null;
    const was = prev[key], pt = d.blocs(was);
    const pR = pt.Right || 0, pLA = (pt.Left || 0) + (pt.Arabs || 0) + (pt.Unknown || 0);
    const movers = [...new Set([...Object.keys(was), ...Object.keys(d.seats)])]
      .map(id => ({ id, from: was[id] || 0, to: d.seats[id] || 0, delta: (d.seats[id] || 0) - (was[id] || 0) }))
      .filter(x => x.delta).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.to - a.to);
    const daysAgo = Math.round((Date.parse(today) - Date.parse(dayKey(prev.updatedAt))) / 864e5);
    const when = daysAgo === 1 ? 'אתמול' : daysAgo === 2 ? 'שלשום' : daysAgo > 2 ? heDate(prev.updatedAt) : `העדכון הקודם (${humanUpdate(prev.updatedAt)})`;
    return { dR: d.R - pR, dLA: d.LA - pLA, pR, pLA, movers, when, daysAgo };
  }
  const moveText = m => `${pname(m.id)} ${m.delta > 0 ? 'עולה' : 'יורדת'} ${Math.abs(m.delta) === 1 ? 'מנדט' : Math.abs(m.delta) + ' מנדטים'}`;
  const deltaTag = n => n ? `<span class="${n > 0 ? 'up' : 'down'}">${n > 0 ? '▲' : '▼'}${Math.abs(n)}</span>` : '<span class="same">ללא שינוי</span>';
  const blocLine = (d, c) => `גוש הימין <b>${d.R}</b> ${deltaTag(c.dR)} · מרכז־שמאל והרשימות הערביות <b>${d.LA}</b> ${deltaTag(c.dLA)}`;
  /* כותרת מסדר המפלגות: מי זז מאתמול; בלי היסטוריה — כותרת הבית הרגילה */
  function lineupHeadline(d) {
    const c = d.change;
    if (!c) return { h: d.headline.h, sub: d.headline.s };
    if (!c.movers.length) return { h: `אין שינוי מ${esc(c.when)} — <em>אף רשימה לא זזה</em>`, sub: blocLine(d, c) };
    const lead = c.movers.slice(0, 2).map(m => `<em>${esc(pname(m.id))}</em> ${esc(moveText(m).slice(pname(m.id).length + 1))}`);
    const rest = c.movers.slice(2).map(m => `${esc(pname(m.id))} ${deltaTag(m.delta)}`).join(' · ');
    return { h: `${lead.join(', ')} מ${esc(c.when)}`, sub: (rest ? rest + ' · ' : '') + blocLine(d, c) };
  }
  function noteHTML(d) {
    const c = d.change;
    const head = c.movers.length ? c.movers.slice(0, 2).map(moveText).join(', ') : `אף רשימה לא שינתה מנדט מ${c.when}`;
    return `<p class="k">מה השתנה מ${esc(c.when)}</p><h3>${esc(head)}</h3>
      ${c.movers.length ? `<ul class="movers">${c.movers.map(m => `<li><b>${esc(pname(m.id))}</b> ${deltaTag(m.delta)} <span class="num">${m.from} → ${m.to}</span></li>`).join('')}</ul>` : ''}
      <p>${blocLine(d, c)}</p>`;
  }
  function toast(d) {
    if (noteShown || !d.change) return;
    noteShown = true;
    const el = document.createElement('aside');
    el.className = 'show-toast'; el.setAttribute('role', 'status'); el.dir = 'rtl';
    el.innerHTML = `<button type="button" class="toast-x" aria-label="סגירה">×</button>` + noteHTML(d);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 500); };
    $('.toast-x', el).addEventListener('click', close);
    setTimeout(close, 16000);
  }

  /* ---------- הבמה ---------- */
  function mount(d) {
    const uid = 'show' + Date.now().toString(36);
    const sectors = (S.demo?.sectors || []).slice(0, 4);
    const nodes = [
      { id:'archive', side:'a', glyph:'globe',  title:'skarim.org · ארכיון הסקרים', to:d.polls.length, unit:'סקרים בחלון התצוגה', fill:.9,
        chips:[{ label:`${d.days} ימי פרסום` }, { label:`עודכן ${humanUpdate(S.cur.generatedAt)}` }] },
      { id:'outlets', side:'a', glyph:'tv',     title:'ערוצי הפרסום', to:d.outlets.length, unit:'כלי תקשורת', fill:.8,
        chips:d.outlets.map(o => ({ key:o, label:o, img:S.firms.outletLogos?.[o] })) },
      { id:'firms',   side:'a', glyph:'bars',   title:'מכוני הסקרים', to:d.firms.length, unit:'מכונים', fill:.75,
        chips:d.firms.map(f => ({ key:f.meta.id, label:f.meta.he, color:f.meta.color, score:true })) },
      { id:'truth',   side:'b', glyph:'ballot', title:'ועדת הבחירות · תוצאות האמת 2022', to:d.nat.valid, unit:'קולות כשרים', fill:1,
        chips:[{ label:`${d.nat.turnout}% הצבעה` }, { label:`${d.nat.parties.length} רשימות` }, { label:`${fmt(d.nat.eligible)} בעלי זכות בחירה` }] },
      { id:'calib',   side:'b', glyph:'clock',  title:'ארכיון סקרי 2022 · כיול המכונים', to:d.calib.data.polls.length, unit:'סקרים ב־30 הימים שלפני הבחירות', fill:.85,
        chips:[{ label:`${d.calib.stats.length} מכונים מכוילים` }, { label:'גושים · מפלגות · עקביות' }] },
      { id:'demo',    side:'b', glyph:'people', title:'הלמ״ס · מרכז טאוב · המכון לדמוקרטיה', to:sectors.reduce((s, x) => s + (x.eligible2022 || 0), 0) || d.nat.eligible, unit:'בעלי זכות בחירה במגזרים הנמדדים', fill:.7,
        chips:sectors.map(s => ({ label:`${s.name} ‎+${r1(s.growth * 100)}%‎ בשנה` })) }
    ];
    const nodeHTML = (n, i) => `<article class="show-node" data-node="${n.id}" style="--fill:${n.fill}">
      <div class="node-ico">${dbIcon(n.glyph, uid + i)}</div>
      <div class="node-title">${esc(n.title)}</div>
      <div class="node-status">ממתין לחיבור</div>
      <div class="node-count"><b class="num" data-to="${n.to}">0</b><small>${esc(n.unit)}</small></div>
      ${n.chips.length ? `<div class="node-chips">${n.chips.map(c => `<span class="node-chip"${c.key ? ` data-key="${esc(c.key)}"` : ''}${c.color ? ` style="--c:${esc(c.color)}"` : ''}>${c.img ? `<img src="${esc(c.img)}" alt="" onerror="this.remove()">` : c.color ? '<i></i>' : ''}${esc(c.label)}${c.score ? '<b></b>' : ''}</span>`).join('')}</div>` : ''}
    </article>`;
    const el = document.createElement('div');
    el.id = 'show'; el.dir = 'rtl'; el.className = 'stage-ready'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'חישוב התחזית');
    el.innerHTML = `<svg class="show-links" aria-hidden="true"></svg>
      <header class="show-top">
        <div class="show-brand"><i></i>ברומטר · מנוע התחזית</div>
        <div class="show-clock num" dir="ltr">00:00.0</div>
        <div class="show-steps" aria-hidden="true"><span class="ph">שלב 1</span><span data-step="load">טעינת המאגרים <b>0/6</b></span><span class="ph">שלב 2</span><span data-step="calib">כיול</span><span data-step="weigh">שקלול</span><span class="ph">שלב 3</span><span data-step="result">התוצאה</span></div>
        <button type="button" class="show-skip">דלג לתוצאה ←</button>
      </header>
      <div class="show-title" aria-live="polite" aria-atomic="true"><p class="ph"></p><h2></h2><p class="sub"></p></div>
      <div class="show-grid">
        <aside class="show-col col-a">${nodes.filter(n => n.side === 'a').map(nodeHTML).join('')}</aside>
        <div class="show-center">
          <div class="engine-wrap"><div class="engine-tags" aria-hidden="true"></div>
            <div class="show-engine" aria-hidden="true"><svg viewBox="0 0 200 200"><circle class="ring r1" cx="100" cy="100" r="96"/><circle class="ring r2" cx="100" cy="100" r="82"/><circle class="ring r3" cx="100" cy="100" r="66"/><circle class="engine-prog-bg" cx="100" cy="100" r="90"/><circle class="engine-prog" cx="100" cy="100" r="90" stroke-dasharray="565.5" stroke-dashoffset="565.5"/></svg><div class="engine-text"><b class="num">0</b><span>מקורות מחוברים</span></div></div>
          </div>
          <div class="show-now" aria-live="off"><span class="now-k">נטען עכשיו</span><div class="now-main">ממתין להפעלה</div><div class="now-sub"></div></div>
          <div class="show-chart" aria-hidden="true">
            <div class="chart-parties"><div class="chart-head"><b>כל מדידה של כל רשימה</b><span>מנדטים בסקר · נקודה = סקר, צבע = מכון</span></div><svg></svg></div>
            <div class="chart-firms"><div class="chart-head"><b>ציון האמינות של כל מכון</b><span>מול תוצאות האמת 2022 · 0–100</span></div><svg></svg></div>
          </div>
          <div class="show-log" aria-hidden="true"></div>
        </div>
        <aside class="show-col col-b">${nodes.filter(n => n.side === 'b').map(nodeHTML).join('')}</aside>
      </div>
      <section class="show-lineup" aria-label="התחזית">
        <div class="lineup-head"><p class="k">תחזית הברומטר · הכנסת ה־26</p><h2></h2><p class="sub"></p></div>
        <div class="lineup-row"></div>
        <div class="lineup-blocs"><div class="lb right"><span>גוש הימין</span><b class="num">0</b></div><div class="lineup-track"><span class="r"></span><span class="l"></span><i class="m61"></i></div><div class="lb left"><span>מרכז־שמאל והרשימות הערביות</span><b class="num">0</b></div></div>
      </section>
      <div class="show-start"><div>
        <p class="k">ברומטר · מנוע התחזית</p>
        <h2>מהסקרים לתחזית — לנגד עיניכם</h2>
        <p class="lead">קודם טוענים את הנתונים ממאגרי המידע: ${d.polls.length} סקרים מ־${d.outlets.length} ערוצים ו־${d.firms.length} מכונים, תוצאות האמת של 2022 והמודל הדמוגרפי. אחר כך הניתוח — כיול, שקלול ואחוז חסימה — ובסוף 120 מנדטים.</p>
        <div class="start-stats"><span><b class="num">${d.polls.length}</b>סקרים</span><span><b class="num">${d.outlets.length}</b>ערוצים</span><span><b class="num">${d.firms.length}</b>מכונים</span><span><b class="num">${fmt(d.nat.valid)}</b>קולות אמת 2022</span></div>
        <button type="button" class="show-go">טענו את הנתונים <span>←</span></button>
        <button type="button" class="alt">ישר לתוצאה, בלי ההצגה</button>
      </div></div>`;
    document.body.appendChild(el);
    stage = el;
    $('.show-skip', el).addEventListener('click', () => finish());
    $('.show-start .alt', el).addEventListener('click', () => finish());
    $('.show-go', el).addEventListener('click', () => begin(d));
    buildPartyChart(d);
    buildFirmChart(d);
    buildLinks();
  }

  /* ---------- קישורים: מכל מאגר אל המנוע ---------- */
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function pathBetween(a, b, bulge = 0) {
    const [ax, ay] = a, [bx, by] = b, mx = (ax + bx) / 2;
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}C${mx.toFixed(1)} ${(ay + bulge).toFixed(1)},${mx.toFixed(1)} ${(by + bulge).toFixed(1)},${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  function anchorOf(node) {
    const r = node.getBoundingClientRect(), a = node.closest('.col-a');
    return [a ? r.left : r.right, r.top + r.height / 2];
  }
  function engineEdge(from) {
    const eng = $('.show-engine', stage), [cx, cy] = center(eng), rad = eng.getBoundingClientRect().width * .5;
    const dx = from[0] - cx, dy = from[1] - cy, len = Math.hypot(dx, dy) || 1;
    return [cx + dx / len * rad, cy + dy / len * rad];
  }
  function makeLink(id, from, to, cls = '') {
    const svg = $('.show-links', stage);
    const base = document.createElementNS(NS, 'path'), flow = document.createElementNS(NS, 'path');
    base.setAttribute('class', 'link ' + cls); flow.setAttribute('class', 'flow ' + cls);
    svg.append(base, flow);
    links[id] = { base, flow, from, to, d:'', drawn:false };
    layoutLink(id);
  }
  function layoutLink(id) {
    const L = links[id], a = L.from(), b = L.to(a);
    L.a = a; L.b = b;
    L.d = pathBetween(a, b, L.bulge || 0);
    L.base.setAttribute('d', L.d); L.flow.setAttribute('d', L.d);
    const len = L.base.getTotalLength();
    L.base.style.transition = 'none';
    L.base.style.strokeDasharray = L.drawn ? 'none' : len;
    L.base.style.strokeDashoffset = L.drawn ? 0 : len;
    void L.base.getBoundingClientRect();
    L.base.style.transition = '';
  }
  function drawLink(id) { const L = links[id]; if (!L || L.drawn) return; L.drawn = true; L.base.style.strokeDashoffset = 0; timers.push(setTimeout(() => { L.base.style.strokeDasharray = 'none'; }, 950)); }
  function flow(ids, on) { ids.forEach(id => links[id] && links[id].flow.classList.toggle('on', on)); }
  function buildLinks() {
    $$('.show-node', stage).forEach(n => makeLink(n.dataset.node, () => anchorOf(n), engineEdge));
  }
  function crossLinks() {
    const firms = $('[data-node="firms"]', stage);
    ['truth', 'calib'].forEach(id => {
      const n = $(`[data-node="${id}"]`, stage);
      makeLink('x-' + id, () => { const r = n.getBoundingClientRect(); return [r.right, r.top + r.height * .7]; }, () => { const r = firms.getBoundingClientRect(); return [r.left, r.top + r.height * .7]; }, 'x');
      links['x-' + id].bulge = Math.round(stage.clientHeight * .28);
      layoutLink('x-' + id);
      drawLink('x-' + id);
    });
  }
  function relayout() { Object.keys(links).forEach(layoutLink); }

  /* מילה (או נקודת אור) שנוסעת לאורך קישור */
  function flyWord(id, text, o = {}) {
    const L = links[id]; if (!L || !stage) return;
    const el = document.createElement('span');
    el.className = 'show-word' + (text ? '' : ' dot');
    el.textContent = text || '';
    if (o.color) { el.style.background = o.color; el.style.color = '#fff'; el.style.boxShadow = `0 4px 18px ${o.color}80`; }
    stage.appendChild(el);
    const dur = o.dur || 800, ease = 'cubic-bezier(.35,.05,.25,1)';
    let anim;
    if (OFFSET_OK) {
      el.style.offsetPath = `path("${L.d}")`;
      anim = el.animate([
        { offsetDistance:'0%', opacity:0, transform:'scale(.5)' },
        { offsetDistance:'10%', opacity:1, transform:'scale(1)', offset:.12 },
        { offsetDistance:'90%', opacity:1, transform:'scale(1)', offset:.88 },
        { offsetDistance:'100%', opacity:0, transform:'scale(.4)' }
      ], { duration:dur, easing:ease });
    } else {
      const [ax, ay] = L.a, [bx, by] = L.b;
      anim = el.animate([
        { transform:`translate(${ax}px,${ay}px) translate(-50%,-50%) scale(.5)`, opacity:0 },
        { transform:`translate(${ax + (bx - ax) * .1}px,${ay + (by - ay) * .1}px) translate(-50%,-50%) scale(1)`, opacity:1, offset:.12 },
        { transform:`translate(${bx}px,${by}px) translate(-50%,-50%) scale(.4)`, opacity:0 }
      ], { duration:dur, easing:ease });
    }
    anim.onfinish = () => el.remove();
  }

  /* ---------- גרף המפלגות: נקודה לכל מדידה, סמן לממוצע ---------- */
  let chart = null;
  function buildPartyChart(d) {
    const svg = $('.chart-parties svg', stage);
    const rowH = 22, W = 632, top = 20, labelX = 612, axisR = 468, axisL = 26;
    const H = top + d.order.length * rowH + 22;
    const x = v => axisR - (axisR - axisL) * v / d.maxVal;
    const ys = Object.fromEntries(d.order.map((id, i) => [id, top + i * rowH + rowH / 2]));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ticks = []; for (let v = 0; v <= d.maxVal; v += 5) ticks.push(v);
    svg.innerHTML = ticks.map(v => `<line class="axis" x1="${x(v)}" x2="${x(v)}" y1="${top - 5}" y2="${H - 14}"/><text x="${x(v)}" y="${top - 9}" text-anchor="middle" font-size="9" fill="#7F93A6">${v}</text>`).join('')
      + d.order.map(id => {
        const y = ys[id], m = partyMeta(id), col = BLOCS[m.alignment]?.color || '#96A0AB';
        return `<g class="row" data-id="${esc(id)}"><rect class="lbl" x="${labelX + 6}" y="${y - 5}" width="4" height="10" rx="1" fill="${col}"/><text class="lbl" x="${labelX}" y="${y + 4}" text-anchor="end" font-weight="700" font-size="11.5">${esc(pname(id))}</text><line class="axis" x1="${axisL}" x2="${axisR}" y1="${y}" y2="${y}"/><g class="dots"></g><g class="mark" style="transform:translate(${x(0)}px,${y}px)"><line x1="0" x2="0" y1="-8" y2="8" stroke="#DDAA42" stroke-width="2.5" stroke-linecap="round"/><text x="-7" y="4" text-anchor="end" fill="#fff" font-weight="800" font-size="10.5"></text></g></g>`;
      }).join('')
      + `<g class="thr"><line x1="${x(THRESHOLD_MANDATES)}" x2="${x(THRESHOLD_MANDATES)}" y1="${top - 5}" y2="${H - 14}" stroke-width="1.5"/><text x="${x(THRESHOLD_MANDATES)}" y="${H - 2}" text-anchor="middle" fill="#E0533F" font-size="9.5" font-weight="700">אחוז החסימה ${d.nat.threshold}% · ${r1(THRESHOLD_MANDATES)} מנדטים</text></g>`;
    const count = {};
    chart = {
      x, ys,
      row: id => svg.querySelector(`.row[data-id="${CSS.escape(id)}"]`),
      dot(id, v, color) {
        const row = chart.row(id); if (!row) return;
        const k = count[id] = (count[id] || 0) + 1;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'dot'); c.setAttribute('r', '3.4'); c.setAttribute('fill', color || '#9FB2C4');
        c.setAttribute('cx', x(v)); c.setAttribute('cy', ys[id] + ((k % 3) - 1) * 4.2);
        $('.dots', row).appendChild(c);
        requestAnimationFrame(() => c.classList.add('in'));
        if (k === 1) $$('.lbl', row).forEach(l => l.classList.add('in'));
      },
      marks(map, f) {
        d.order.forEach(id => {
          const row = chart.row(id), v = map[id] || 0, m = $('.mark', row);
          m.style.transform = `translate(${x(v)}px,${ys[id]}px)`;
          $('text', m).textContent = f(v);
          m.classList.add('in');
        });
      },
      head: t => { $('.chart-parties .chart-head b', stage).textContent = t; },
      threshold() { $('.thr', svg).classList.add('in'); }
    };
  }

  /* ---------- גרף המכונים: עמודת אמינות לכל מכון ---------- */
  function buildFirmChart(d) {
    const svg = $('.chart-firms svg', stage);
    const rowH = 25, W = 632, top = 8, labelX = 612, barR = 468, barL = 26;
    const H = top + d.firms.length * rowH + 6;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = d.firms.map((f, i) => {
      const y = top + i * rowH + rowH / 2, col = f.meta.calibrated ? (f.meta.color || '#5FB7C9') : '#7F93A6';
      return `<g class="frow" data-firm="${esc(f.meta.id)}"><text x="${labelX}" y="${y + 4}" text-anchor="end" font-weight="700" font-size="11.5">${esc(f.meta.he)}</text><rect x="${barL}" y="${y - 7}" width="${barR - barL}" height="14" rx="4" fill="rgba(255,255,255,.06)"/><rect class="fbar" x="${barL}" y="${y - 7}" width="${barR - barL}" height="14" rx="4" fill="${col}" style="--k:${(f.score / 100).toFixed(3)}"${f.meta.calibrated ? '' : ' opacity=".5"'}/><text class="fval" x="${barR - (barR - barL) * f.score / 100 - 7}" y="${y + 4}" text-anchor="end" fill="#fff" font-weight="800" font-size="10.5">${r1(f.score)}${f.meta.calibrated ? '' : ' · ניטרלי'}</text></g>`;
    }).join('');
  }

  /* ---------- עזרי במה ---------- */
  const q = s => $(s, stage);
  const nodeEl = id => q(`[data-node="${id}"]`);
  const chipEl = (node, key) => nodeEl(node)?.querySelector(`.node-chip[data-key="${CSS.escape(key)}"]`);
  function status(n, t) { $('.node-status', n).textContent = t; }
  function title(phase, h, p) { const box = q('.show-title'); box.innerHTML = `<p class="ph t-in">${phase}</p><h2 class="t-in">${h}</h2><p class="sub t-in">${p}</p>`; }
  const STEPS = ['load', 'calib', 'weigh', 'result'];
  function step(name) { const i = STEPS.indexOf(name); $$('.show-steps span[data-step]', stage).forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('done', k < i); }); }
  function loadCount(k, n) { const b = q('.show-steps [data-step="load"] b'); if (b) b.textContent = `${k}/${n}`; }
  function log(html) { const box = q('.show-log'); const p = document.createElement('p'); p.innerHTML = html; box.appendChild(p); while (box.children.length > 8) box.firstChild.remove(); }
  function engine(num, label) { const t = q('.engine-text'); if (num != null) $('b', t).textContent = num; if (label) $('span', t).textContent = label; }
  function hot(el) { if (!el) return; el.classList.add('hot'); timers.push(setTimeout(() => el.classList.remove('hot'), 620)); }
  function live(ids) { $$('.show-node', stage).forEach(n => n.classList.toggle('live', ids.includes(n.dataset.node))); }
  function chartOn(which) { $$('.show-chart>div', stage).forEach(p => p.classList.toggle('on', p.classList.contains('chart-' + which))); }
  function counter(el, at, dur = 1500) { counters.push({ el, to:+el.dataset.to, at, dur }); }
  /* לוח "נטען עכשיו" — ההדגשה של הרשומה שנטענת ברגע זה */
  function now(k, main, sub = '') {
    const box = q('.show-now');
    $('.now-k', box).textContent = k; $('.now-main', box).innerHTML = main; $('.now-sub', box).innerHTML = sub;
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  }
  function tag(text, xPct, yPct) {
    const t = document.createElement('span'); t.className = 'engine-tag'; t.innerHTML = text;
    t.style.left = xPct + '%'; t.style.top = yPct + '%';
    q('.engine-tags').appendChild(t); requestAnimationFrame(() => t.classList.add('in'));
  }
  const partyLine = p => [...p.parties].filter(x => x.mandates > 0).sort((a, b) => b.mandates - a.mandates).map(x => `${esc(x.name.replace(/!.*$/, '').trim())} <b>${x.mandates}</b>`).join(' · ');
  const topParties = p => [...p.parties].sort((a, b) => b.mandates - a.mandates).slice(0, 5).map(x => `${esc(x.name.replace(/!.*$/, '').trim())} ${x.mandates}`).join(' · ');
  const topN = (map, n = 5) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, v]) => `${esc(pname(id))} <b>${r1(v)}</b>`).join(' · ');

  /* ---------- מסדר המפלגות ---------- */
  let slots = [], maxSeat = 1;
  function buildLineup(d) {
    const row = q('.lineup-row'), sr = stage.getBoundingClientRect();
    const n = d.order.length, narrow = sr.width < 900, gap = narrow ? 8 : 10, pad = narrow ? 24 : 64;
    /* מסך צר: שתי שורות של כרטיסים במקום שורה אחת ארוכה */
    const perRow = narrow ? Math.ceil(n / 2) : n, rows = Math.ceil(n / perRow);
    const lw = Math.max(40, Math.min(150, Math.floor((sr.width - pad - gap * (perRow - 1)) / perRow)));
    clones = d.order.map(id => {
      const real = home.querySelector(`.hcard[data-focus-party="${CSS.escape(id)}"]`), tr = real.getBoundingClientRect();
      const c = real.cloneNode(true);
      c.classList.add('clone'); c.removeAttribute('aria-label'); c.tabIndex = -1;
      c.style.width = tr.width + 'px';
      c.style.setProperty('--bc', getComputedStyle(real).getPropertyValue('--bc').trim() || '#17457F');
      c.dataset.seats = d.seats[id] || 0;
      c._scale = lw / tr.width; c._h = tr.height * c._scale; c._id = id;
      $('.hcard-seat', c).textContent = '0';
      c.style.opacity = '0';
      return c;
    });
    const anchorH = Math.max(...clones.map(c => c._h));
    row.style.setProperty('--lw', lw + 'px');
    row.innerHTML = clones.map(c => `<div class="lineup-slot" style="--bc:${c.style.getPropertyValue('--bc')}"><div class="lineup-bar"><b class="num">0</b><i></i></div><div class="lineup-anchor" style="height:${c._h.toFixed(1)}px"></div></div>`).join('');
    const hd = lineupHeadline(d);
    q('.lineup-head h2').innerHTML = hd.h; q('.lineup-head .sub').innerHTML = hd.sub || '';
    const avail = sr.height - q('.show-top').offsetHeight - q('.lineup-head').offsetHeight - q('.lineup-blocs').offsetHeight - 70;
    const barH = Math.max(60, Math.min(sr.height * .34, avail / rows - anchorH - 24));
    row.style.setProperty('--bar-h', barH + 'px');
    slots = $$('.lineup-slot', row).map((s, i) => ({ el:s, bar:$('.lineup-bar i', s), num:$('.lineup-bar b', s), anchor:$('.lineup-anchor', s), clone:clones[i] }));
    slots.forEach(s => { const ar = s.anchor.getBoundingClientRect(); s.clone.style.transform = `translate(${ar.left}px,${ar.top}px) scale(${s.clone._scale})`; stage.appendChild(s.clone); });
    maxSeat = Math.max(1, ...clones.map(c => +c.dataset.seats));
    q('.lineup-head .k').classList.add('in');
  }
  function popClone(i) {
    const s = slots[i]; if (!s) return;
    const ar = s.anchor.getBoundingClientRect(), k = s.clone._scale;
    s.clone.style.opacity = '1';
    s.clone.animate([
      { transform:`translate(${ar.left}px,${ar.top + 34}px) scale(${k})`, opacity:0 },
      { transform:`translate(${ar.left}px,${ar.top}px) scale(${k})`, opacity:1 }
    ], { duration:520, easing:'cubic-bezier(.2,.8,.2,1)' });
  }
  function fly() {
    home.classList.add('show-landing');
    stage.classList.add('is-leaving');
    slots.forEach((s, i) => {
      const real = home.querySelector(`.hcard[data-focus-party="${CSS.escape(s.clone._id)}"]`), tr = real.getBoundingClientRect();
      s.clone.animate([{ transform:s.clone.style.transform }, { transform:`translate(${tr.left}px,${tr.top}px) scale(1)` }],
        { duration:950, delay:i * 35, easing:'cubic-bezier(.55,0,.15,1)', fill:'forwards' });
    });
  }

  /* ---------- ההצגה ---------- */
  function begin(d) {
    if (!stage || !stage.classList.contains('stage-ready')) return;
    stage.classList.remove('stage-ready');
    const startBox = q('.show-start'); startBox.classList.add('out'); timers.push(setTimeout(() => startBox.remove(), 600));
    q('.show-skip').focus({ preventScroll:true });
    run(d);
  }

  function run(d) {
    let t0 = performance.now(), hiddenAt = 0;
    const mine = ++token;
    /* לשונית שעברה לרקע: ההצגה נעצרת וממשיכה מאותה נקודה, במקום לקפוץ לסוף */
    const onVis = () => { if (document.hidden) hiddenAt = performance.now(); else if (hiddenAt) { t0 += performance.now() - hiddenAt; hiddenAt = 0; } };
    document.addEventListener('visibilitychange', onVis); visHandlers.push(onVis);
    const cues = [], cue = (at, fn) => cues.push({ at, fn });
    let barsOn = false, connected = 0;
    const PH1 = 'שלב 1 · טעינת הנתונים ממאגרי המידע', PH2 = 'שלב 2 · הניתוח', PH3 = 'התוצאה';

    /* 1. טעינת המאגרים — אחד אחרי השני. לכל מאגר: מתחבר → טוען → שולח למנוע → נקלט */
    const order = ['truth', 'calib', 'demo', 'outlets', 'firms'];
    const items = {
      truth:   [...d.nat.parties].sort((a, b) => b.seats - a.seats).slice(0, 6).map(p => `${p.name} ${p.seats}`),
      calib:   d.calib.stats.slice(0, 6).map(st => `${(S.firms.firms.find(f => f.id === st.firm) || { he: st.firm }).he} · ${st.n} סקרים`),
      demo:    (S.demo?.sectors || []).slice(0, 4).map(x => `${x.name} +${r1(x.growth * 100)}%`),
      outlets: d.outlets.slice(0, 6),
      firms:   d.firms.slice(0, 6).map(f => f.meta.he)
    };
    const sends = {
      truth: `${fmt(d.nat.valid)} קולות כשרים · ${d.nat.parties.length} רשימות · ${d.nat.turnout}% הצבעה`,
      calib: `${d.calib.data.polls.length} סקרים מ־30 הימים שלפני בחירות 2022 · ${d.calib.stats.length} מכונים`,
      demo: `${(S.demo?.sectors || []).slice(0, 4).map(x => x.name).join(' · ')} — קצב גידול שנתי`,
      outlets: d.outlets.join(' · '),
      firms: d.firms.map(f => f.meta.he).join(' · ')
    };
    cue(0, () => { step('load'); log(`<em>מנוע התחזית</em> הופעל · ${esc(humanUpdate(S.cur.generatedAt))} · ${S.mode === 'weighted' ? 'משוקלל אמינות' : 'תחזית הברומטר'}`); });
    order.forEach((id, i) => {
      const n = nodeEl(id), at = i * SRC, name = $('.node-title', n).textContent, unit = $('.node-count small', n).textContent, total = +$('.node-count b', n).dataset.to;
      cue(at, () => {
        title(PH1, `טוענים: ${esc(name)}`, `מאגר ${i + 1} מתוך 6 · ${esc(unit)}`);
        n.classList.add('in', 'live'); status(n, 'מתחבר…'); live([id]);
        now('מתחבר אל', esc(name), 'פותחים חיבור ומבקשים את הרשומות');
      });
      cue(at + 350, () => drawLink(id));
      cue(at + 900, () => {
        n.classList.add('loading'); status(n, 'טוען רשומות…'); counter($('.node-count b', n), at + 900, 1600);
        now('טוען', `<b>${esc(name)}</b>`, `<b>${fmt(total)}</b> ${esc(unit)}`);
      });
      $$('.node-chip', n).forEach((c, k) => cue(at + 1100 + k * 140, () => c.classList.add('in')));
      cue(at + 2700, () => {
        status(n, 'שולח למנוע…'); flow([id], true);
        now('שולח לשקלול', `<b>${esc(name)}</b>`, esc(sends[id]));
        engine(null, 'קולט…');
      });
      items[id].forEach((w, k) => cue(at + 2750 + k * 230, () => flyWord(id, w, { dur:1000 })));
      cue(at + 4100, () => {
        n.classList.remove('live'); n.classList.add('ok'); status(n, 'נקלט במנוע ✓'); flow([id], false); live([]);
        engine(++connected, 'מאגרים נקלטו'); loadCount(connected, 6);
        log(`✓ <b>${esc(name)}</b> · ${fmt(total)} ${esc(unit)} — נשלחו לשקלול`);
      });
    });

    /* 2. ארכיון הסקרים — הסקרים נשלחים למנוע אחד־אחד */
    {
      const id = 'archive', n = nodeEl(id), at = T.fetch, name = $('.node-title', n).textContent;
      cue(at, () => {
        title(PH1, `טוענים: ${esc(name)}`, `מאגר 6 מתוך 6 · ${d.polls.length} סקרים · ${d.outlets.length} כלי תקשורת · ${d.firms.length} מכונים`);
        n.classList.add('in', 'live'); status(n, 'מתחבר…'); live([id]);
        now('מתחבר אל', esc(name), 'פותחים חיבור ומבקשים את הסקרים');
      });
      cue(at + 350, () => drawLink(id));
      cue(at + 900, () => {
        title(PH1, 'שולפים את הסקרים, סקר אחר סקר', `${d.polls.length} סקרים · ${d.outlets.length} כלי תקשורת · ${d.firms.length} מכונים — כל מדידה של כל רשימה נשלחת למנוע`);
        n.classList.add('loading'); status(n, 'שולף סקרים…'); chartOn('parties'); engine(0, 'סקרים נקלטו'); flow([id], true);
      });
      $$('.node-chip', n).forEach((c, k) => cue(at + 1000 + k * 140, () => c.classList.add('in')));
      d.polls.forEach((p, i) => cue(at + 1000 + i * POLL, () => {
        const f = firmOf(p.sourceId), outlet = outletKey(p), date = heDate(parsePollDate(p));
        flyWord(id, `${outlet} · ${date.slice(0, 5)}`, { dur:1000 });
        hot(chipEl('outlets', outlet)); hot(chipEl('firms', f.firm));
        engine(i + 1); $('.node-count b', n).textContent = i + 1;
        now(`סקר ${i + 1} מתוך ${d.polls.length}`, `<b>${esc(outlet)}</b> · ${esc(f.meta.he)} · <span class="num">${esc(date)}</span>`, partyLine(p));
        log(`<em>${esc(date.slice(0, 5))}</em> · <b>${esc(outlet)}</b> · ${esc(f.meta.he)} — ${topParties(p)}`);
        d.ids.forEach(pid => { const v = d.pollVal(p, pid); if (v > 0) chart.dot(pid, v, f.meta.color); });
      }));
      cue(at + 1000 + d.polls.length * POLL + 150, () => {
        n.classList.remove('live'); n.classList.add('ok'); status(n, 'נקלט במנוע ✓'); flow([id], false); live([]);
        engine(++connected, 'מאגרים נקלטו'); loadCount(connected, 6);
        log(`✓ <b>${esc(name)}</b> · ${d.polls.length} סקרים — נשלחו לשקלול`);
      });
    }

    /* הנתונים נטענו — מעבר לניתוח */
    cue(T.loaded, () => {
      title(PH1, 'כל הנתונים נטענו', `${d.polls.length} סקרים · ${d.ids.length} רשימות · ${fmt(d.nat.valid)} קולות אמת · ${d.calib.data.polls.length} סקרי כיול — עוברים לניתוח`);
      live([]); flow(Object.keys(links), true); engine('✓', 'הנתונים נטענו');
      now('הושלם', `<b>${d.polls.length}</b> סקרים נטענו מ־<b>${connected}</b> מאגרים`, `${d.ids.length} רשימות · ${d.days} ימי פרסום · ${d.firms.length} מכונים · עכשיו: כיול, שקלול ואחוז חסימה`);
      log(`נטענו <b>${d.polls.length}</b> סקרים · ${d.ids.length} רשימות · ${d.days} ימי פרסום ✓ · <em>עוברים לניתוח</em>`);
    });

    /* 3. כיול המכונים */
    cue(T.calib, () => {
      title(PH2, 'מכיילים את אמינות המכונים', 'כל מכון מול תוצאות האמת של 2022 — דיוק בגושים (60%), במפלגות (30%) ועקביות (10%)');
      step('calib'); chartOn('firms'); flow(Object.keys(links), false); flow(['truth', 'calib'], true); live(['truth', 'calib', 'firms']); crossLinks(); engine(0, 'מכונים כוילו');
    });
    const perF = (T.weigh - 500 - (T.calib + 350)) / d.firms.length;
    d.firms.forEach((f, j) => {
      const at = T.calib + 350 + j * perF;
      cue(at, () => {
        flyWord('x-calib', `${f.meta.he} ${r1(f.score)}`, { color:f.meta.calibrated ? f.meta.color : '#5C6F82', dur:950 }); flyWord('x-truth', '', { dur:950 });
        now(`מכייל ${j + 1} מתוך ${d.firms.length}`, `<b>${esc(f.meta.he)}</b>` + (f.stat ? ` · ${f.stat.n} סקרים ב־30 הימים שלפני בחירות 2022` : ' · לא פרסם סקרים ב־2022'), f.stat ? 'משווים כל סקר לתוצאה בפועל…' : 'בלי כיול אין ציון — מקבל משקל ניטרלי');
      });
      cue(at + 900, () => {
        const row = q(`.frow[data-firm="${CSS.escape(f.meta.id)}"]`);
        if (row) { $('.fbar', row).classList.add('in'); $('.fval', row).classList.add('in'); }
        const chip = chipEl('firms', f.meta.id); if (chip) { $('b', chip).textContent = r1(f.score); hot(chip); }
        engine(j + 1);
        now('ציון האמינות', `<b>${esc(f.meta.he)}</b> → <b class="num">${r1(f.score)}</b>`, f.stat ? `גושים <b>${r1(f.stat.blocScore)}</b> · מפלגות <b>${r1(f.stat.partyScore)}</b> · עקביות <b>${r1(f.stat.consistencyScore)}</b> · משקל בתחזית <b>${(f.score / 100).toFixed(2)}</b>` : `משקל ניטרלי <b>${(f.score / 100).toFixed(2)}</b>`);
        log(f.stat ? `<b>${esc(f.meta.he)}</b> · ${f.stat.n} סקרים ב־2022 · גושים ${r1(f.stat.blocScore)} · מפלגות ${r1(f.stat.partyScore)} · עקביות ${r1(f.stat.consistencyScore)} → <em>${r1(f.score)}</em>`
                     : `<b>${esc(f.meta.he)}</b> · ללא כיול על 2022 → משקל ניטרלי <em>${r1(f.score)}</em>`);
      });
    });
    cue(T.weigh - 350, () => log(`המשקלים מוכנים: ${d.firms.slice(0, 4).map(f => `${esc(f.meta.he)} ${(f.score / 100).toFixed(2)}`).join(' · ')} …`));

    /* 4. שקלול, אחוז חסימה, 120 מושבים */
    const seatsMap = Object.fromEntries(d.order.map(id => [id, d.seats[id] || 0]));
    cue(T.weigh, () => {
      title(PH2, 'משקללים לפי אמינות', `חלון ${FORECAST_MAX_AGE_DAYS} ימים · ${S.forecastPolls.length} סקרים מ־${S.series.length} מכונים · אחוז חסימה ${d.nat.threshold}% · 120 מושבים`);
      step('weigh'); chartOn('parties'); q('.show-chart').classList.add('dim'); flow(Object.keys(links), true); live([]); q('.show-engine').classList.add('fast'); engine('0%', 'מהחישוב');
      now('חלון הנתונים', `<b>${S.forecastPolls.length}</b> סקרים מ־<b>${FORECAST_MAX_AGE_DAYS}</b> הימים האחרונים · <b>${S.series.length}</b> מכונים`, 'קודם ממוצע לכל מכון, ואז ממוצע בין המכונים');
    });
    cue(T.weigh + 300, () => tag(`חלון <em>${FORECAST_MAX_AGE_DAYS}</em> ימים · <em>${S.forecastPolls.length}</em> סקרים`, 18, 22));
    cue(T.weigh + 700, () => { chart.marks(d.simple.rawFull, v => r1(v)); chart.head('ממוצע פשוט — משקל שווה לכל מכון'); now('ממוצע פשוט', 'משקל שווה לכל מכון', topN(d.simple.rawFull)); log('ממוצע פשוט: ' + topN(d.simple.rawFull, 4)); });
    cue(T.weigh + 1500, () => tag('משקל לפי <em>ציון האמינות</em>', 82, 30));
    cue(T.weigh + 2000, () => { chart.marks(d.weighted.rawFull, v => r1(v)); chart.head('משוקלל לפי ציון האמינות של כל מכון'); now('משוקלל אמינות', 'מכון מדויק יותר — משקל גדול יותר', topN(d.weighted.rawFull)); log('משוקלל אמינות: ' + topN(d.weighted.rawFull, 4)); });
    cue(T.weigh + 2700, () => tag(`אחוז חסימה <em>${d.nat.threshold}%</em> = ${r1(THRESHOLD_MANDATES)} מנדטים`, 20, 76));
    cue(T.weigh + 3200, () => {
      chart.threshold();
      const below = Object.entries(d.final.below || {});
      below.forEach(([id]) => chart.row(id)?.classList.add('below'));
      const txt = below.length ? below.map(([id, p]) => `${esc(pname(id))} <b>${r1(p)}%</b> — מתחת לסף`).join(' · ') : 'כל הרשימות עוברות את הסף';
      now('אחוז החסימה', `<b>${d.nat.threshold}%</b> מהקולות הכשרים = <b>${r1(THRESHOLD_MANDATES)}</b> מנדטים`, txt);
      log(`אחוז החסימה ${d.nat.threshold}%: ` + (below.length ? below.map(([id, p]) => `<b>${esc(pname(id))}</b> ${r1(p)}% מתחת לסף`).join(' · ') : 'כל הרשימות עוברות'));
    });
    if (S.mode === 'scenario' && d.final.scenario) cue(T.weigh + 3900, () => {
      chart.marks(d.final.parties, v => r1(v)); chart.head('הנחות התרחיש — עוגן 2022 ותוספת דמוגרפית');
      now('הנחות התרחיש', `תוספת דמוגרפית <b>${r1(d.final.scenario.demographic)}</b> · עוגן 2022 <b>${r1(d.final.scenario.anchor)}</b>`, topN(d.final.parties));
      log(`הנחות התרחיש: תוספת דמוגרפית ${r1(d.final.scenario.demographic)} · עוגן 2022 ${r1(d.final.scenario.anchor)}`);
    });
    cue(T.weigh + 4200, () => tag('<em>120</em> מושבים · שיטת השארית הגדולה', 80, 78));
    cue(T.weigh + 4600, () => { chart.marks(seatsMap, v => v); chart.head('אחרי אחוז החסימה ועיגול ל־120 מושבים'); now('120 מושבים', `גוש הימין <b>${d.R}</b> · מרכז־שמאל והרשימות הערביות <b>${d.LA}</b>`, Object.entries(seatsMap).filter(([, v]) => v).map(([id, v]) => `${esc(pname(id))} <b>${v}</b>`).join(' · ')); log(`חלוקה ל־<b>120</b> מושבים ✓ · ימין ${d.R} · מרכז־שמאל והרשימות הערביות ${d.LA}`); });
    cue(T.weigh + 5100, () => { q('.show-engine').classList.add('burst'); engine('120', 'מושבים'); title(PH3, 'התחזית מוכנה', 'הרשימות, המנדטים, הגושים — ומי עלה ומי ירד מאתמול'); });
    cue(T.lineup - 380, () => stage.classList.add('is-fading'));

    /* 5. מסדר המפלגות, ההערה על השינוי מאתמול, ואז טיסה למקום */
    cue(T.lineup, () => { stage.classList.remove('is-fading'); stage.classList.add('stage-lineup'); step('result'); buildLineup(d); });
    d.order.forEach((id, i) => cue(T.lineup + 140 + i * 105, () => popClone(i)));
    cue(T.bars, () => { barsOn = true; });
    cue(T.blocs, () => { q('.lineup-head h2').classList.add('in'); q('.lineup-head .sub').classList.add('in'); q('.lineup-blocs').classList.add('in'); clones.forEach(c => c.classList.add('final')); });
    cue(T.note, () => toast(d));
    cue(T.fly, fly);

    cues.sort((a, b) => a.at - b.at);
    let ci = 0;
    const clock = q('.show-clock'), prog = q('.engine-prog'), eng = q('.engine-text b');
    const lbR = q('.lb.right b'), lbL = q('.lb.left b'), trR = q('.lineup-track .r'), trL = q('.lineup-track .l');
    function frame(t) {
      const s = t / 1000;
      clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
      if (t <= T.lineup) prog.style.strokeDashoffset = (565.5 * (1 - t / T.lineup)).toFixed(1);
      counters = counters.filter(c => { const k = easeOut((t - c.at) / c.dur); c.el.textContent = fmt(c.to * k); return k < 1; });
      if (t >= T.weigh && t < T.weigh + 5000) eng.textContent = Math.round(100 * (t - T.weigh) / 5000) + '%';
      if (barsOn) {
        const e = easeOut((t - T.bars) / 2700);
        slots.forEach(s => {
          const n = +s.clone.dataset.seats, v = Math.round(e * n);
          s.bar.style.height = (100 * e * n / maxSeat).toFixed(2) + '%';
          s.num.textContent = v; if (e > .02) s.num.style.opacity = 1;
          $('.hcard-seat', s.clone).textContent = v;
        });
        lbR.textContent = Math.round(e * d.R); lbL.textContent = Math.round(e * d.LA);
        trR.style.width = (100 * e * d.R / 120).toFixed(2) + '%'; trL.style.width = (100 * e * d.LA / 120).toFixed(2) + '%';
      }
    }
    function tick(nowTs) {
      if (mine !== token) return;
      const t = nowTs - t0;
      while (ci < cues.length && cues[ci].at <= t) cues[ci++].fn(t);
      frame(t);
      if (t >= T.end) return finish();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  /* ---------- כניסה ויציאה ---------- */
  const onKey = e => { if (e.key === 'Escape' && stage) finish(); };
  let resizeRaf = 0;
  const onResize = () => { if (!stage) return; cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(relayout); };

  function finish(focus = true) {
    token++; cancelAnimationFrame(raf);
    timers.forEach(clearTimeout); timers = []; counters = []; links = {}; clones = []; slots = [];
    visHandlers.forEach(h => document.removeEventListener('visibilitychange', h)); visHandlers = [];
    const data = current; current = null;
    if (stage) { stage.remove(); stage = null; }
    root.classList.remove('show-open'); home.classList.remove('show-landing');
    document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
    if (focus && S.cur) {
      const h = $('#verdict-head'); h.tabIndex = -1; h.focus({ preventScroll:true });
      if (data) toast(data);
    }
  }
  function enter(force = false) {
    if (!S.cur || S.view !== 'home' || reduced.matches || (played && !force)) return;
    played = true;
    finish(false);
    noteShown = false;
    S.homeHistory = 'current'; $('#home-history').value = 'current'; renderHome();
    window.scrollTo({ top:0, behavior:'instant' });
    root.classList.add('show-open');
    document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    current = prepare();
    mount(current);
    $('.show-go', stage).focus({ preventScroll:true });
  }

  document.addEventListener('barometer:view', () => { if (S.view === 'home') enter(); else if (stage) finish(false); });
  reduced.addEventListener('change', () => { if (reduced.matches && stage) finish(false); });
  window.addEventListener('beforeprint', () => { if (stage) finish(false); });

  const controls = $('.home-forecast-controls');
  controls.insertAdjacentHTML('beforeend', '<div class="intro-result-links"><a href="#/method">לשיטת החישוב</a><button type="button" id="intro-replay">ההצגה מחדש ↻</button></div>');
  $('#intro-replay').addEventListener('click', () => enter(true));
})();
