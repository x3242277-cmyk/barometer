/* Phone navigation and progressive disclosure. Existing data controls keep their
   original handlers; only their presentation changes below the mobile breakpoint. */
(() => {
  'use strict';
  const mobile = matchMedia('(max-width: 900px)');
  const $ = s => document.querySelector(s);
  const states = new Map();
  let forecastControlsHome, methodHome;
  let lastForecastHash;
  // On a phone the simulation lives inside the forecast card, under the seat map,
  // so "simulation" is a place on the overview, not a panel of its own.
  function selectForecast(panel, scroll = false) {
    const home = $('#view-home');
    if (!home) return;
    const toSim = panel === 'simulation';
    if (toSim) panel = 'overview';
    home.dataset.mobileForecast = panel;
    home.querySelectorAll('[data-mobile-forecast]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mobileForecast === panel)));
    if (mobile.matches && panel !== 'overview') document.dispatchEvent(new Event('barometer:simulation-hidden'));
    if (toSim) setTimeout(() => showSim(), 60);
    else if (scroll) home.scrollIntoView({block:'start', behavior:'auto'});
  }
  // Put the simulation right under the sticky bars (masthead + forecast tabs).
  function showSim(force = true) {
    const sim = $('#method-sim');
    if (!sim || !mobile.matches) return;
    const bars = ($('.masthead')?.offsetHeight || 64) + ($('#view-home .mobile-forecast-nav')?.offsetHeight || 0);
    const top = sim.getBoundingClientRect().top - bars - 8;
    if (force || top < -4 || top > 60) window.scrollBy({top, behavior:'auto'});
  }
  document.addEventListener('barometer:forecast-panel', e => selectForecast(e.detail));
  const masthead = $('.masthead-in');
  if (masthead) {
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'mobile-menu-toggle';
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.setAttribute('aria-controls', 'mobile-menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span aria-hidden="true">☰</span> תפריט';
    masthead.append(toggle);
    const menu = document.createElement('dialog');
    menu.id = 'mobile-menu'; menu.className = 'mobile-menu';
    menu.setAttribute('aria-labelledby', 'mobile-menu-title');
    menu.innerHTML = '<header><h2 id="mobile-menu-title">לאן ממשיכים?</h2><button type="button" class="mobile-menu-close" aria-label="סגירת התפריט">×</button></header><nav aria-label="ניווט לטלפון"></nav><p class="mobile-menu-update"></p>';
    document.body.append(menu);
    const syncMenu = () => {
      const nav = menu.querySelector('nav'); nav.replaceChildren();
      document.querySelectorAll('.mainnav .tab').forEach(link => {
        const copy = link.cloneNode(true); copy.className = 'mobile-menu-link';
        nav.append(copy);
      });
      menu.querySelector('.mobile-menu-update').textContent = $('#stamp-updated')?.textContent || '';
      const current = document.querySelector('.mainnav .tab[aria-current="page"]');
      toggle.setAttribute('aria-label', `פתיחת תפריט האתר${current ? ' · ' + current.textContent : ''}`);
    };
    const close = () => menu.close();
    toggle.addEventListener('click', () => { syncMenu(); menu.showModal(); toggle.setAttribute('aria-expanded','true'); });
    menu.querySelector('.mobile-menu-close').addEventListener('click', close);
    menu.addEventListener('click', e => {
      if (e.target.closest('a')) close();
      if (e.target === menu) { const r = menu.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }
    });
    menu.addEventListener('close', () => { toggle.setAttribute('aria-expanded','false'); });
    document.addEventListener('barometer:view', syncMenu);
    window.addEventListener('hashchange', () => { if (menu.open) close(); });
    mobile.addEventListener('change', () => { if (menu.open) close(); });
    syncMenu();
  }

  // Native details provide touch, keyboard and screen-reader support.
  function fold(element, key, label) {
    if (!element || element.parentElement.classList.contains('mobile-disclosure')) return;
    const detail = document.createElement('details'); detail.className = 'mobile-disclosure';
    detail.dataset.mobileFold = key;
    detail.open = mobile.matches ? (states.get(key) || false) : true;
    const summary = document.createElement('summary'); summary.textContent = label;
    element.before(detail); detail.append(summary, element);
    detail.addEventListener('toggle', () => { if (mobile.matches && detail.isConnected) states.set(key, detail.open); });
  }
  function prepare() {
    const home = $('#view-home');
    if (home && !home.querySelector('.mobile-forecast-nav')) {
      const nav = document.createElement('nav'); nav.className = 'mobile-forecast-nav';
      nav.setAttribute('aria-label', 'מה מציגים בתחזית');
      nav.innerHTML = [['overview','תמונת מצב'],['parties','מפלגות'],['coalition','קואליציה']].map(([key,label]) => `<button type="button" data-mobile-forecast="${key}" aria-pressed="false">${label}</button>`).join('');
      home.prepend(nav);
      nav.addEventListener('click', e => {
        const b = e.target.closest('[data-mobile-forecast]'); if (!b) return;
        selectForecast(b.dataset.mobileForecast, true);
      });
    }
    if (home && lastForecastHash !== location.hash) {
      lastForecastHash = location.hash;
      selectForecast(location.hash === '#/forecast/coalition' ? 'coalition' : 'overview');
    }
    const controls = $('#view-home .home-forecast-controls'), center = $('#view-home .fs-center');
    if (controls && center) {
      if (!forecastControlsHome) { forecastControlsHome = document.createComment('forecast controls'); controls.before(forecastControlsHome); }
      if (mobile.matches && controls.parentElement !== center) center.append(controls);
      if (!mobile.matches && controls.previousSibling !== forecastControlsHome) forecastControlsHome.after(controls);
    }
    const method = $('#home-method-section'), card = $('#forecast-section .verdict-in');
    if (method && card) {
      if (!methodHome) { methodHome = document.createComment('home method'); method.before(methodHome); }
      if (mobile.matches && method.parentElement !== card) card.append(method);
      if (!mobile.matches && method.previousSibling !== methodHome) methodHome.after(method);
    }
    fold($('.ex-pickers'), 'explorer', 'בחירת ערוצים ומפלגות');
    fold($('.dm-side'), 'demography', 'המסקנות של המודל');
    fold($('.r22-mode-controls'), 'map-controls', 'חיפוש, סינון ואפשרויות');
    fold($('#method-sim .ms-ledger'), 'simulation-results', 'סיכום המספרים שחושבו');
    document.querySelectorAll('#view-method .msec-body').forEach(body => fold(body, 'method-' + body.closest('.msec').id, 'הסבר ונתונים'));
    // Give each demographic record its own labelled card on a phone. The same
    // table cells and live inputs remain in place, preserving their handlers.
    document.querySelectorAll('#view-demography .dtable').forEach(table => {
      if (table.classList.contains('mobile-record-table')) return;
      const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (!headings.length) return;
      table.classList.add('mobile-record-table'); table.setAttribute('role','table');
      table.querySelectorAll('thead,tbody,tfoot').forEach(g => g.setAttribute('role','rowgroup'));
      table.querySelectorAll('tr').forEach(row => {
        row.setAttribute('role','row');
        [...row.children].forEach((cell, i) => {
          cell.setAttribute('role',cell.tagName === 'TH' ? 'columnheader' : 'cell');
          if (i > 0) cell.dataset.mobileLabel = headings[i] || '';
          if (cell.matches('.why') || cell.querySelector('input,.pbar,.plegend,.why') || cell.colSpan > 1) cell.classList.add('mobile-wide-cell');
        });
      });
    });
    const polls = $('#view-polls .polls-layout');
    if (polls && !$('.mobile-polls-nav')) {
      const nav = document.createElement('nav');nav.className = 'mobile-polls-nav';nav.setAttribute('aria-label','תצוגת הסקרים');
      nav.innerHTML = '<a href="#/polls">מבט כולל ומגמות</a><a href="#/polls/list">רשימת הסקרים</a>';
      polls.before(nav);
    }
    document.querySelectorAll('.mobile-polls-nav a').forEach(a => a.setAttribute('aria-current', (location.hash === '#/polls/list') === (a.hash === '#/polls/list') ? 'page' : 'false'));
    const dash = $('#r22-dash');
    if (dash && !$('.mobile-map-nav')) {
      dash.dataset.mobileMapPanel = 'map';
      const nav = document.createElement('div'); nav.className = 'mobile-map-nav';
      nav.setAttribute('role','group'); nav.setAttribute('aria-label','תצוגת נתוני המפה בטלפון');
      nav.innerHTML = '<button type="button" data-mobile-map="map" aria-pressed="true">מפה</button><button type="button" data-mobile-map="list" aria-pressed="false">רשימה</button><button type="button" data-mobile-map="detail" aria-pressed="false">נתונים וגרף</button>';
      dash.before(nav);
      nav.addEventListener('click', e => {
        const b = e.target.closest('[data-mobile-map]'); if (!b) return;
        dash.dataset.mobileMapPanel = b.dataset.mobileMap;
        nav.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed',String(x === b)));
        // Restore the map's viewport after its hidden panel becomes visible.
        if (b.dataset.mobileMap === 'map') window.dispatchEvent(new Event('resize'));
      });
    }
    const map = $('#r22-map');
    if (map && !map.querySelector('.mobile-map-pan')) {
      const pan = document.createElement('button'); pan.type = 'button'; pan.className = 'mobile-map-pan';
      pan.setAttribute('aria-pressed','false'); pan.textContent = 'הזזת מפה';
      pan.addEventListener('click', () => {
        const enabled = map.classList.toggle('touch-navigation');
        pan.setAttribute('aria-pressed',String(enabled));
        pan.textContent = enabled ? 'סיום הזזה' : 'הזזת מפה';
      });
      map.append(pan);
    }
  }
  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; prepare(); }); };
  new MutationObserver(schedule).observe(document.getElementById('main') || document.body, {childList:true, subtree:true});
  document.addEventListener('barometer:view', schedule);
  window.addEventListener('hashchange', () => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || e.target.closest('.tr-plot')) return;
    document.querySelectorAll('.tr-tip,.tr-cursor').forEach(t => { t.hidden = true; t.setAttribute('hidden',''); });
  });
  mobile.addEventListener('change', () => {
    document.querySelectorAll('.mobile-disclosure').forEach(d => { d.open = mobile.matches ? (states.get(d.dataset.mobileFold) || false) : true; });
    schedule();
  });
  // Keep the active item visible in horizontal navigation without moving the page.
  document.addEventListener('click', e => {
    const tab = e.target.closest('.dm-tabs button,.mdoc-nav button,.r22-years button');
    if (tab && mobile.matches) tab.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
  });
  document.addEventListener('click', e => {
    if (mobile.matches) {
      const jump = e.target.closest('[data-home-section]');
      if (jump) selectForecast(jump.dataset.homeSection === 'election-coalition' ? 'coalition' : jump.dataset.homeSection === 'home-method-section' ? 'simulation' : 'overview');
      if (jump && jump.dataset.homeSection === 'home-method-section') e.stopImmediatePropagation();
      const docJump = e.target.closest('.mdoc-nav [data-go]');
      if (docJump) { const d = document.getElementById(docJump.dataset.go)?.querySelector('.mobile-disclosure'); if (d) d.open = true; }
    }
    const detail = e.target.closest('.mobile-disclosure');
    if (detail && mobile.matches) states.set(detail.dataset.mobileFold, e.target.closest('summary') === detail.firstElementChild ? !detail.open : detail.open);
  }, true);
  // Phone simulation: steps, caption, stage and controls share one screen. The
  // stage takes the height that is left; a scene that needs more room is scaled
  // with CSS zoom (which reflows, unlike transform) instead of growing the page.
  const sim = document.getElementById('method-sim');
  if (sim) {
    let fitFirst = null, fitZoom = 1, fitQueued = false;
    const mastH = () => $('.masthead')?.offsetHeight || 64;
    const fitSim = () => {
      fitQueued = false;
      const home = $('#view-home'), box = sim.querySelector('.ms-stagebox'), stage = sim.querySelector('#ms-stage');
      const embedded = !!(mobile.matches && home?.classList.contains('on') && home.dataset.mobileForecast === 'overview' && sim.closest('#forecast-section'));
      const on = embedded && sim.classList.contains('is-running');
      sim.classList.toggle('is-phone-fit', embedded);
      if (!box || !stage) return;
      const kids = [...stage.children], zoom = z => kids.forEach(c => { c.style.zoom = z === 1 ? '' : String(z); });
      if (!on) { box.style.height = ''; zoom(1); fitFirst = null; return; }
      // Height left when the sim sits right under the masthead and the forecast tabs.
      const offset = box.getBoundingClientRect().top - sim.getBoundingClientRect().top;
      const viewH = window.visualViewport?.height || innerHeight;
      const bars = mastH() + (home.querySelector('.mobile-forecast-nav')?.offsetHeight || 0);
      const pad = parseFloat(getComputedStyle(sim).paddingBottom) || 0;
      box.style.height = `${Math.max(300, Math.floor(viewH - bars - offset - pad - 16))}px`;
      const fresh = stage.firstElementChild !== fitFirst;
      if (!fresh && stage.scrollHeight <= stage.clientHeight + 1) return;
      if (fresh) { fitFirst = stage.firstElementChild; fitZoom = 1; }
      // Measure with the scene's later reveals shown, so the scale is chosen once.
      stage.classList.add('is-measuring'); zoom(1);
      let z = 1;
      for (let i = 0; i < 5; i++) {
        const need = stage.scrollHeight, room = stage.clientHeight;
        if (need <= room + 1) break;
        z = Math.max(.55, z * room / need * .985); zoom(z);
      }
      stage.classList.remove('is-measuring');
      fitZoom = Math.min(z, fitZoom); zoom(fitZoom);
    };
    const queueFit = () => { if (fitQueued) return; fitQueued = true; setTimeout(fitSim, 0); };
    new MutationObserver(queueFit).observe(sim, {childList:true, subtree:true, attributes:true, attributeFilter:['hidden','class']});
    document.addEventListener('barometer:forecast-panel', queueFit);
    document.addEventListener('barometer:view', queueFit);
    $('#view-home')?.addEventListener('click', e => { if (e.target.closest('[data-mobile-forecast]')) queueFit(); });
    // Starting or stepping the player brings it to the top of the screen.
    sim.addEventListener('click', e => { if (e.target.closest('.ms-big-play,[data-ms-stage],.ms-prev,.ms-next')) setTimeout(() => showSim(false), 140); });
    window.addEventListener('resize', queueFit);
    window.visualViewport?.addEventListener('resize', queueFit);
    mobile.addEventListener('change', queueFit);
    queueFit();
  }
  prepare();
})();
