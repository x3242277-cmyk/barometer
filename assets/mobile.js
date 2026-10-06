/* Phone navigation and progressive disclosure. Existing data controls keep their
   original handlers; only their presentation changes below the mobile breakpoint. */
(() => {
  'use strict';
  const mobile = matchMedia('(max-width: 900px)');
  const $ = s => document.querySelector(s);
  const states = new Map();
  let forecastControlsHome;
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
    const print = document.createElement('button'); print.type = 'button'; print.className = 'mobile-menu-link';
    print.textContent = 'הדפסת נתוני התחזית';
    print.addEventListener('click', () => { menu.close(); document.getElementById('print-btn')?.click(); });
    const syncMenu = () => {
      const nav = menu.querySelector('nav'); nav.replaceChildren();
      document.querySelectorAll('.mainnav .tab').forEach(link => {
        const copy = link.cloneNode(true); copy.className = 'mobile-menu-link';
        nav.append(copy);
      });
      nav.append(print);
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
    const controls = $('#view-home .home-forecast-controls'), center = $('#view-home .fs-center');
    if (controls && center) {
      if (!forecastControlsHome) { forecastControlsHome = document.createComment('forecast controls'); controls.before(forecastControlsHome); }
      if (mobile.matches && controls.parentElement !== center) center.append(controls);
      if (!mobile.matches && controls.previousSibling !== forecastControlsHome) forecastControlsHome.after(controls);
    }
    fold($('.ex-pickers'), 'explorer', 'בחירת ערוצים ומפלגות');
    fold($('.dm-side'), 'demography', 'המסקנות של המודל');
    fold($('.r22-mode-controls'), 'map-controls', 'חיפוש, סינון ואפשרויות');
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
    const detail = e.target.closest('.mobile-disclosure');
    if (detail && mobile.matches) states.set(detail.dataset.mobileFold, e.target.closest('summary') === detail.firstElementChild ? !detail.open : detail.open);
  }, true);
  prepare();
})();
