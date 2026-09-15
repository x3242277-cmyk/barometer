
/* הפתיח: ארבע תמונות מהנתונים האמיתיים — הסקרים נכנסים לקלפי, 120 המנדטים
   מתחלקים לפי גושים, ראשי הרשימות, והכותרת. התחזית נשארת בבעלות app.js;
   הפתיח רק מצייר אותה, ולא משנה שום נתון. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 13000;
  const phases = [
    { at: 0,     title: 'הסקרים נכנסים לקלפי.',   label: 'איסוף הסקרים' },
    { at: 4200,  title: '120 מנדטים מתחלקים.',   label: 'חלוקת המנדטים' },
    { at: 7600,  title: 'ראשי הרשימות.',         label: 'המנהיגים' },
    { at: 10400, title: '',                       label: 'תמונת המצב' }
  ];
  const ROWS = [18, 22, 25, 27, 28];
  const ICON = {
    flag: '<svg class="ic flag" viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="10" width="40" height="28" rx="3"/><path d="M4 16h40M4 32h40"/><path d="M24 19l5.2 9H18.8zM24 29l-5.2-9h10.4z"/></svg>',
    knesset: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V19M16 40h16"/><path d="M24 30c-3.5 0-6.5-2.5-6.5-6V16M24 30c3.5 0 6.5-2.5 6.5-6V16"/><path d="M24 34c-6.5 0-11.5-3.5-11.5-10V16M24 34c6.5 0 11.5-3.5 11.5-10V16"/><path d="M24 38c-9.5 0-16.5-4.5-16.5-14V16M24 38c9.5 0 16.5-4.5 16.5-14V16"/><path d="M7.5 12v1.5M12.5 12v1.5M17.5 12v1.5M24 14v1.5M30.5 12v1.5M35.5 12v1.5M40.5 12v1.5"/></svg>',
    ballot: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22h32v17a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z"/><path d="M8 29h32"/><path d="M17 22V10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12"/><path d="M20 15l3 3 5-6"/></svg>',
    seats: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 36a16 16 0 0 1 32 0"/><path d="M15 36a9 9 0 0 1 18 0"/><path d="M6 36h36"/></svg>',
    people: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="16" r="5"/><circle cx="31" cy="16" r="5"/><path d="M7 38c0-6.5 4.5-11 10-11s10 4.5 10 11M21 38c0-6.5 4.5-11 10-11s10 4.5 10 11"/></svg>',
    gauge: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M11.7 33.6A15 15 0 1 1 36.3 33.6"/><path d="M24 25l6.5-10.5"/><circle cx="24" cy="25" r="2.5" fill="currentColor"/></svg>'
  };
  const STEP_ICON = [ICON.ballot, ICON.seats, ICON.people, ICON.gauge];
  const BIG_BALLOT = `<svg class="ballot-big" viewBox="0 0 200 170" aria-hidden="true">
    <path class="bb-body" d="M18 62h164v88a12 12 0 0 1-12 12H30a12 12 0 0 1-12-12z"/>
    <path class="bb-lid" d="M8 44h184v18H8z"/>
    <path class="bb-slot" d="M70 53h60"/>
    <path class="bb-line" d="M18 92h164"/>
    <path class="bb-star" d="M100 108l8.5 14.7H91.5zM100 126l-8.5-14.7h17z"/>
  </svg>`;

  let stage = null, frame = 0, played = false, elapsed = 0, previous = null;
  let paused = false, phase = -1, data = null;
  let observer, restoreFocus, inertElements = [];

  function prepare() {
    const polls = (S.forecastPolls || S.cur.polls).slice(0, 16);
    const est = forecast(S.mode, HIDE_FROM_HOME);
    const seats = allocateSeats(est.parties);
    const blocTot = {};
    Object.entries(seats).forEach(([id, n]) => { const al = partyMeta(id).alignment; blocTot[al] = (blocTot[al] || 0) + n; });
    const firms = new Set(polls.map(p => firmOf(p.sourceId).firm)).size;
    const leaders = Object.entries(seats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([id, n]) => {
        const m = partyMeta(id);
        return { id, n, name: m.name, color: partyColor(id, m.alignment),
          photo: (S.leaders && S.leaders[normId(id)]) || LEADER_PLACEHOLDER, leader: PARTY_LEADER[normId(id)] || '' };
      });
    return { polls, seats, blocTot, firms, leaders, headline: homeHeadline(est, seats, blocTot) };
  }

  /* 120 מושבים בחצי גורן, מימין (ימין) לשמאל (הרשימות הערביות) */
  function hemicycle(blocTot) {
    const pts = [];
    ROWS.forEach((n, row) => {
      const r = 118 + row * 38;
      for (let k = 0; k < n; k++) {
        const a = Math.PI * (k + .5) / n;           // 0 = ימין, π = שמאל
        pts.push({ x: 300 + r * Math.cos(a), y: 296 - r * Math.sin(a), a });
      }
    });
    pts.sort((p, q) => p.a - q.a);
    const order = ['Right', 'Haredi', 'Unknown', 'Left', 'Arabs'];
    const colors = [];
    order.forEach(k => { for (let i = 0; i < (blocTot[k] || 0); i++) colors.push(BLOCS[k].color); });
    while (colors.length < 120) colors.push(BLOCS.Unknown.color);
    return pts.map((p, i) => `<circle class="seat" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" style="--c:${colors[i]};--d:${(i * 11)}ms"/>`).join('');
  }

  function envelopes(polls) {
    return polls.map((p, i) => {
      const side = i % 2 ? 1 : -1, lane = Math.floor(i / 2) % 4;
      const logo = p.channel ? `<img src="${esc(p.channel)}" alt="" onerror="this.remove()">` : '';
      return `<div class="env" style="--i:${i};--sx:${side * (46 + lane * 9)}vw;--sy:${-38 + lane * 22}px;--rot:${side * (6 + lane * 4)}deg">
        <span class="env-logo">${logo}</span><span class="env-txt"><b>${esc(p.channelHebrewName || firmOf(p.sourceId).meta.he || '')}</b><small>${esc(p.date || '')}</small></span></div>`;
    }).join('');
  }

  function leadersRow(leaders) {
    return leaders.map((l, i) => `<div class="lead" style="--i:${i};--c:${l.color}">
      <span class="lead-photo"><img src="${esc(l.photo)}" alt="" onerror="this.onerror=null;this.src='${LEADER_PLACEHOLDER}'"></span>
      <b class="num">${l.n}</b><span class="lead-name">${esc(l.name)}</span></div>`).join('');
  }

  function setPhase(index) {
    if (!stage || phase === index) return;
    phase = index;
    stage.dataset.phase = index;
    const title = stage.querySelector('.signal-title');
    if (index === 3) title.innerHTML = data.headline.h; else title.textContent = phases[index].title;
    stage.querySelectorAll('.signal-step').forEach((el, i) => {
      el.classList.toggle('active', i === index); el.classList.toggle('done', i < index);
    });
    if (index >= 1) stage.querySelector('.hemi').classList.add('filled');
  }

  function counters(t) {
    const n = Math.min(data.polls.length, Math.floor(t / 240));
    const c = stage.querySelector('.box-count');
    if (c) { c.querySelector('.n-polls').textContent = n; c.querySelector('.n-firms').textContent = Math.min(data.firms, Math.ceil(n * data.firms / Math.max(1, data.polls.length))); }
    const k = Math.min(1, Math.max(0, (t - phases[1].at) / 1500));
    stage.querySelectorAll('.hemi-tot b[data-n]').forEach(b => { b.textContent = Math.round(Number(b.dataset.n) * k); });
  }

  function tick(now) {
    if (!stage) return;
    if (previous !== null && !paused && !document.hidden) elapsed += Math.min(now - previous, 100);
    previous = now;
    setPhase(phases.reduce((last, p, i) => elapsed >= p.at ? i : last, 0));
    counters(elapsed);
    stage.style.setProperty('--signal-progress', Math.min(1, elapsed / duration));
    stage.classList.toggle('signal-leaving', elapsed > duration - 650);
    if (elapsed >= duration) { finish(); return; }
    frame = requestAnimationFrame(tick);
  }

  function onKey(e) {
    if (!stage) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
    if (e.key === 'Tab') {
      const buttons = [...stage.querySelectorAll('button')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function finish(focus = true) {
    cancelAnimationFrame(frame); observer?.disconnect(); observer = null;
    document.removeEventListener('keydown', onKey);
    stage?.remove(); stage = null;
    document.documentElement.classList.remove('show-open');
    inertElements.forEach(([el, wasInert]) => { el.inert = wasInert; }); inertElements = [];
    if (focus) {
      const target = restoreFocus?.isConnected && restoreFocus !== document.body ? restoreFocus : $('#verdict-head');
      if (target) { if (!target.matches('button,a,input,select')) target.tabIndex = -1; target.focus({ preventScroll: true }); }
    }
  }

  function enter(force = false) {
    if (!S.cur || S.view !== 'home' || reduced.matches || (played && !force)) return;
    finish(false);
    data = prepare();
    if (!data.polls.length) return;
    played = true; elapsed = 0; previous = null; paused = false; phase = -1;
    restoreFocus = document.activeElement;
    const logoSrc = document.querySelector('.brand img')?.getAttribute('src') || 'assets/logo.svg';
    const R = data.blocTot.Right || 0, L = data.blocTot.Left || 0, A = data.blocTot.Arabs || 0;
    stage = document.createElement('div'); stage.id = 'show'; stage.dir = 'rtl';
    stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', 'פתיח ברומטר — המחשת התחזית');
    stage.innerHTML = `
      <header class="signal-top"><span class="signal-brand"><img src="${logoSrc}" alt="">ברומטר<span class="signal-divider"></span><span lang="en" dir="ltr">BAROMETER</span></span><button class="signal-skip" type="button">לדלג לתחזית <span aria-hidden="true">↙</span></button></header>
      <main class="signal-body">
        <div class="signal-caption" aria-hidden="true"><span class="signal-dot"></span>${ICON.flag} בחירות לכנסת ה־26 · 27 באוקטובר 2026</div>
        <h2 class="signal-title" aria-live="polite" aria-atomic="true"></h2>
        <div class="stage" aria-hidden="true">
          <div class="sc sc-box">
            ${BIG_BALLOT}
            <div class="envs">${envelopes(data.polls)}</div>
            <div class="box-count"><b class="n-polls num">0</b> סקרים <i>·</i> <b class="n-firms num">0</b> מכונים</div>
          </div>
          <div class="sc sc-hemi">
            <svg class="hemi" viewBox="0 0 600 310">${hemicycle(data.blocTot)}<line class="hemi-61" x1="300" y1="30" x2="300" y2="300"/><text class="hemi-61-t" x="300" y="22">61</text></svg>
            <div class="hemi-tot">
              <span style="--c:${BLOCS.Right.color}"><i></i>גוש הימין <b class="num" data-n="${R}">0</b></span>
              <span style="--c:${BLOCS.Left.color}"><i></i>מרכז־שמאל <b class="num" data-n="${L}">0</b></span>
              <span style="--c:${BLOCS.Arabs.color}"><i></i>הרשימות הערביות <b class="num" data-n="${A}">0</b></span>
            </div>
          </div>
          <div class="sc sc-leaders">${leadersRow(data.leaders)}</div>
          <div class="sc sc-final"><span class="fin fin-a">${ICON.knesset}</span><span class="fin fin-b">${ICON.flag}</span></div>
        </div>
        <div class="signal-bottom"><div class="signal-steps" aria-hidden="true">${phases.map((p, i) => `<span class="signal-step">${STEP_ICON[i]}<b dir="ltr">0${i + 1}</b>${p.label}</span>`).join('')}</div><button class="signal-pause" type="button" aria-label="השהיית הפתיח">השהיה <span aria-hidden="true">Ⅱ</span></button></div>
      </main>
      <footer class="signal-footer"><span>${data.polls.length} סקרים · ${data.firms} מכונים · ${S.mode === 'weighted' ? 'משוקלל אמינות' : 'תחזית הברומטר'}</span><span>נתונים מעודכנים ל־${esc(heDate(S.cur.generatedAt))}</span></footer>
      <div class="signal-progress" aria-hidden="true"></div>`;
    document.body.appendChild(stage);
    inertElements = [...document.body.children].filter(el => el !== stage && !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    inertElements.forEach(([el]) => { el.inert = true; });
    document.documentElement.classList.add('show-open');
    stage.querySelector('.signal-skip').addEventListener('click', () => finish());
    stage.querySelector('.signal-pause').addEventListener('click', e => {
      paused = !paused;
      stage.classList.toggle('paused', paused);
      e.currentTarget.innerHTML = paused ? 'המשך <span aria-hidden="true">▷</span>' : 'השהיה <span aria-hidden="true">Ⅱ</span>';
      e.currentTarget.setAttribute('aria-label', paused ? 'המשך הפתיח' : 'השהיית הפתיח');
    });
    document.addEventListener('keydown', onKey);
    setPhase(0);
    stage.querySelector('.signal-skip').focus({ preventScroll: true });
    frame = requestAnimationFrame(tick);
  }

  /* ההצגה אינה נפתחת מעצמה: הפתיח של הבית הוא "חמש בדיקות, תחזית אחת"; ההצגה זמינה בלחיצה. */
  document.addEventListener('barometer:view', () => { if (S.view !== 'home') finish(false); });
  document.addEventListener('visibilitychange', () => { previous = null; });
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  window.addEventListener('beforeprint', () => finish(false));
  const controls = $('.home-forecast-controls');
  if (controls) {
    controls.insertAdjacentHTML('beforeend', '<div class="intro-result-links"><a href="#/method">לשיטת החישוב</a><button type="button" id="intro-replay">להצגת החישוב ▷</button></div>');
    $('#intro-replay').addEventListener('click', () => window.openPipelineShow ? window.openPipelineShow() : enter(true));
  }
})();
