
/* A short visual interpretation of the loaded data, not a simulated network request.
   The forecast remains owned by app.js. No timers change application data. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 11200;
  const phases = [
    { at: 0, title: 'אוספים את התמונה.', label: 'איסוף נתונים' },
    { at: 3500, title: 'מצליבים. מכיילים.', label: 'כיול היסטורי' },
    { at: 6500, title: 'נותנים לדיוק משקל.', label: 'שקלול' },
    { at: 9200, title: 'התמונה מתבהרת.', label: 'התחזית' }
  ];
  let stage = null, frame = 0, played = false, elapsed = 0, previous = null;
  let paused = false, phase = -1, particles = [], ctx, width = 0, height = 0;
  let observer, restoreFocus, inertElements = [];
  const ICON = {
    flag: '<svg class="ic flag" viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="10" width="40" height="28" rx="3"/><path d="M4 16h40M4 32h40"/><path d="M24 19l5.2 9H18.8zM24 29l-5.2-9h10.4z"/></svg>',
    ballot: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22h32v17a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z"/><path d="M8 29h32"/><path d="M17 22V10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12"/><path d="M20 15l3 3 5-6"/></svg>',
    knesset: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V19M16 40h16"/><path d="M24 30c-3.5 0-6.5-2.5-6.5-6V16M24 30c3.5 0 6.5-2.5 6.5-6V16"/><path d="M24 34c-6.5 0-11.5-3.5-11.5-10V16M24 34c6.5 0 11.5-3.5 11.5-10V16"/><path d="M24 38c-9.5 0-16.5-4.5-16.5-14V16M24 38c9.5 0 16.5-4.5 16.5-14V16"/><path d="M7.5 12v1.5M12.5 12v1.5M17.5 12v1.5M24 14v1.5M30.5 12v1.5M35.5 12v1.5M40.5 12v1.5"/></svg>',
    polls: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40h32"/><rect x="11" y="24" width="7" height="12" rx="1.5"/><rect x="20.5" y="15" width="7" height="21" rx="1.5"/><rect x="30" y="8" width="7" height="28" rx="1.5"/></svg>',
    people: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="16" r="5"/><circle cx="31" cy="16" r="5"/><path d="M7 38c0-6.5 4.5-11 10-11s10 4.5 10 11M21 38c0-6.5 4.5-11 10-11s10 4.5 10 11"/></svg>',
    gauge: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M11.7 33.6A15 15 0 1 1 36.3 33.6"/><path d="M24 25l6.5-10.5"/><circle cx="24" cy="25" r="2.5" fill="currentColor"/></svg>',
    scale: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v32M14 40h20M8 16h32"/><path d="M8 16l-5 12h10zM40 16l-5 12h10z"/></svg>',
    check: '<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16"/><path d="M16 24l6 6 11-12"/></svg>'
  };
  const STEP_ICON = [ICON.polls, ICON.gauge, ICON.scale, ICON.ballot];
  const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const noise = i => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

  function prepare() {
    const polls = S.forecastPolls || S.cur.polls;
    const records = polls.flatMap((p, pi) => p.parties.map((v, vi) => ({
      value: Number(v.mandates) || 0, weight: firmScore(firmOf(p.sourceId).meta) / 100,
      seed: pi * 37 + vi, lane: pi % 4
    })));
    // Bound canvas work on large archives; every particle still comes from a real record.
    particles = records.filter((_, i) => i % Math.max(1, Math.ceil(records.length / 240)) === 0)
      .map((r, i) => ({ ...r, i, x: noise(r.seed + 1), y: noise(r.seed + 10) }));
    return polls.length;
  }

  function resize() {
    if (!stage) return;
    const canvas = stage.querySelector('canvas'), box = canvas.getBoundingClientRect();
    width = box.width; height = box.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(elapsed);
  }

  function draw(t) {
    if (!ctx || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2, cy = height * .5;
    const span = Math.min(width * .78, 730), tall = Math.min(height * .64, 240);
    const collect = ease(t / 3500), align = ease((t - 3500) / 2200);
    const weigh = ease((t - 6500) / 2200), resolve = ease((t - 9200) / 1200);

    // A quiet drafting field becomes visible as the incoming observations align.
    ctx.strokeStyle = `rgba(18,52,92,${.10 * (1 - resolve)})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = cy - tall / 2 + tall * i / 6;
      ctx.beginPath(); ctx.moveTo(cx - span / 2, y); ctx.lineTo(cx + span / 2, y); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = cx - span / 2 + span * i / 4;
      ctx.beginPath(); ctx.moveTo(x, cy - tall / 2); ctx.lineTo(x, cy + tall / 2); ctx.stroke();
    }

    // Four source streams, a calibrated matrix, then a compact signal.
    const columns = Math.max(1, Math.ceil(particles.length / 8));
    particles.forEach((p, i) => {
      const arrival = ease((collect - p.x * .40) / .60);
      const side = p.lane % 2 ? 1 : -1;
      const startX = cx + side * (span * .55 + p.x * span * .27);
      const startY = cy + (p.lane < 2 ? -1 : 1) * tall * (.30 + p.y * .38);
      const sampleX = cx + (p.x - .5) * span * .86;
      const sampleY = cy + (p.y - .5) * tall;
      const gridX = cx + ((Math.floor(i / 8) + .5) / columns - .5) * span * .82;
      const gridY = cy + ((i % 8) - 3.5) * tall / 9;
      let x = lerp(lerp(startX, sampleX, arrival), gridX, align);
      let y = lerp(lerp(startY, sampleY, arrival), gridY, align);
      const signalX = cx + ((i % 36) / 35 - .5) * span * .69;
      const signalY = cy + Math.sin(i % 36 / 35 * Math.PI * 2) * tall * .12
        + (p.y - .5) * tall * .19 * (1 - p.weight);
      x = lerp(x, signalX, weigh); y = lerp(y, signalY, weigh);
      const opacity = Math.min(1, t / 500) * (1 - resolve) * (.23 + p.weight * .65);
      // Short horizontal trails give collection a direction without flying labels.
      if (align < 1) {
        ctx.strokeStyle = `rgba(18,52,92,${opacity * .35 * (1 - align)})`;
        ctx.beginPath(); ctx.moveTo(x + side * (12 + 23 * (1 - arrival)), y); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.fillStyle = `rgba(${i % 7 === 0 ? '184,134,43' : '18,52,92'},${opacity})`;
      const size = lerp(1.5, 1.5 + Math.min(p.value, 35) / 30, align) * (1 - weigh * .22);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    });

    // One restrained scan line passes across the aligned observations.
    if (t > 3500 && t < 6500) {
      const x = cx - span * .45 + span * .90 * ((t - 3500) / 3000);
      const gradient = ctx.createLinearGradient(x - 35, 0, x, 0);
      gradient.addColorStop(0, 'rgba(184,134,43,0)'); gradient.addColorStop(1, 'rgba(184,134,43,.14)');
      ctx.fillStyle = gradient; ctx.fillRect(x - 35, cy - tall * .58, 35, tall * 1.16);
      ctx.fillStyle = 'rgba(184,134,43,.6)'; ctx.fillRect(x, cy - tall * .58, 1, tall * 1.16);
    }
  }

  function setPhase(index) {
    if (!stage || phase === index) return;
    phase = index;
    stage.dataset.phase = index;
    stage.querySelector('.signal-title').textContent = phases[index].title;
    stage.querySelectorAll('.signal-step').forEach((el, i) => {
      el.classList.toggle('active', i === index); el.classList.toggle('done', i < index);
    });
  }

  function tick(now) {
    if (!stage) return;
    if (previous !== null && !paused && !document.hidden) elapsed += Math.min(now - previous, 100);
    previous = now;
    setPhase(phases.reduce((last, p, i) => elapsed >= p.at ? i : last, 0));
    stage.style.setProperty('--signal-progress', Math.min(1, elapsed / duration));
    stage.classList.toggle('signal-leaving', elapsed > duration - 650);
    draw(elapsed);
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
    stage?.remove(); stage = null; ctx = null;
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
    const count = prepare();
    if (!particles.length) return;
    played = true; elapsed = 0; previous = null; paused = false; phase = -1;
    restoreFocus = document.activeElement;
    const logoSrc = document.querySelector(".brand img")?.getAttribute("src") || "assets/logo.svg";
    stage = document.createElement('div'); stage.id = 'show'; stage.dir = 'rtl';
    stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', 'פתיח ברומטר — המחשת עיבוד הנתונים');
    stage.innerHTML = `
      <header class="signal-top"><span class="signal-brand"><img src="${logoSrc}" alt="">ברומטר<span class="signal-divider"></span><span lang="en" dir="ltr">BAROMETER</span></span><button class="signal-skip" type="button">לדלג לתחזית <span aria-hidden="true">↙</span></button></header>
      <main class="signal-body">
        <div class="signal-caption" aria-hidden="true"><span class="signal-dot"></span>${ICON.ballot} בחירות 2026 · מהנתונים לתמונה המלאה</div>
        <h2 class="signal-title" aria-live="polite" aria-atomic="true"></h2>
        <div class="signal-icons" aria-hidden="true"><span>${ICON.flag}</span><span class="gold">${ICON.knesset}</span><span>${ICON.ballot}</span><span class="gold">${ICON.polls}</span><span>${ICON.people}</span></div>
        <div class="signal-field" aria-hidden="true"><canvas></canvas>
          <div class="signal-sources"><span>${ICON.polls}סקרים</span><span>${ICON.ballot}תוצאות אמת</span><span>${ICON.gauge}מכוני מחקר</span><span>${ICON.people}דמוגרפיה</span></div>
          <div class="signal-lockup"><div class="lockup-icons">${ICON.knesset}<img src="${logoSrc}" alt="">${ICON.flag}</div><strong>ברומטר</strong><span>מדידה. ניתוח. תמונת מצב.</span></div>
          <div class="signal-meta" dir="ltr"><span>${String(count).padStart(2, '0')} POLLS</span><span>CALIBRATE / WEIGHT / RESOLVE</span></div>
        </div>
        <div class="signal-bottom"><div class="signal-steps" aria-hidden="true">${phases.map((p, i) => `<span class="signal-step">${STEP_ICON[i]}<b dir="ltr">0${i + 1}</b>${p.label}</span>`).join('')}</div><button class="signal-pause" type="button" aria-label="השהיית הפתיח">השהיה <span aria-hidden="true">Ⅱ</span></button></div>
      </main>
      <footer class="signal-footer"><span>המחשת עיבוד הנתונים</span><span>נתונים מעודכנים ל־${esc(heDate(S.cur.generatedAt))}</span></footer>
      <div class="signal-progress" aria-hidden="true"></div>`;
    document.body.appendChild(stage);
    inertElements = [...document.body.children].filter(el => el !== stage && !['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el => [el, el.inert]);
    inertElements.forEach(([el]) => { el.inert = true; });
    document.documentElement.classList.add('show-open');
    stage.querySelector('.signal-skip').addEventListener('click', () => finish());
    stage.querySelector('.signal-pause').addEventListener('click', e => {
      paused = !paused;
      e.currentTarget.innerHTML = paused ? 'המשך <span aria-hidden="true">▷</span>' : 'השהיה <span aria-hidden="true">Ⅱ</span>';
      e.currentTarget.setAttribute('aria-label', paused ? 'המשך הפתיח' : 'השהיית הפתיח');
    });
    document.addEventListener('keydown', onKey);
    ctx = stage.querySelector('canvas').getContext('2d');
    if (!ctx) { finish(); return; }
    setPhase(0); observer = new ResizeObserver(resize); observer.observe(stage.querySelector('.signal-field')); resize();
    stage.querySelector('.signal-skip').focus({ preventScroll: true });
    frame = requestAnimationFrame(tick);
  }

  document.addEventListener('barometer:view', () => { if (S.view === 'home') enter(); else finish(false); });
  document.addEventListener('visibilitychange', () => { previous = null; });
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  window.addEventListener('beforeprint', () => finish(false));
  const controls = $('.home-forecast-controls');
  if (controls) {
    controls.insertAdjacentHTML('beforeend', '<div class="intro-result-links"><a href="#/method">לשיטת החישוב</a><button type="button" id="intro-replay">לצפייה בפתיח ↻</button></div>');
    $('#intro-replay').addEventListener('click', () => enter(true));
  }
})();
