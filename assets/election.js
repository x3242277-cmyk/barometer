/* Home section controls leave the application's hash routes intact. */
(() => {
  "use strict";
  const SECTION_SELECTOR = '.election-cover, .verdict, .board, .election-coalition, .home-method';
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goToSection(target) {
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-home-section]');
    if (!button) return;
    goToSection(document.getElementById(button.dataset.homeSection));
  });

  /* Wheel scrolling on the home page pages a full section at a time, like the
     arrow buttons, instead of scrolling a little at a time — one wheel tick
     (once the in-flight jump settles) always lands on the next or previous
     section, never partway between two. Touch/scrollbar dragging still
     scrolls freely; only wheel input is paged, matching how most trackpads
     and mouse wheels are actually used to move through a page like this. */
  let locked = false;
  function sections() {
    const home = document.getElementById('view-home');
    return home ? [...home.querySelectorAll(':scope > :is(' + SECTION_SELECTOR + ')')] : [];
  }
  function currentIndex(list, home) {
    const homeTop = home.getBoundingClientRect().top;
    let idx = 0;
    list.forEach((el, i) => {
      if (el.getBoundingClientRect().top - homeTop <= 24) idx = i;
    });
    return idx;
  }
  document.addEventListener('wheel', event => {
    const home = document.getElementById('view-home');
    if (!home || !home.classList.contains('on')) return;
    if (document.querySelector('dialog[open]') || !home.contains(event.target)) return;
    if (locked) { event.preventDefault(); return; }
    const list = sections();
    if (list.length < 2) return;
    const idx = currentIndex(list, home);
    const next = event.deltaY > 0 ? idx + 1 : event.deltaY < 0 ? idx - 1 : idx;
    if (next === idx || next < 0 || next >= list.length) return;
    event.preventDefault();
    locked = true;
    goToSection(list[next]);
    setTimeout(() => { locked = false; }, reducedMotion() ? 150 : 650);
  }, { passive: false });
})();

/* The Knesset scene is still a photograph. Small, feathered copies of the
   flag and foliage let wind move in those areas without shifting the building.
   Each copy uses the same cached image and tracks background-size: cover. */
(() => {
  'use strict';
  const IMAGE_WIDTH = 1536;
  const IMAGE_HEIGHT = 1024;
  const regions = [
    { className: 'scene-motion-patch--flag', x: 510, y: 401, width: 90, height: 90 },
    { className: 'scene-motion-patch--tree', x: 0, y: 548, width: 285, height: 250 },
    { className: 'scene-motion-patch--tree scene-motion-patch--tree-right', x: 958, y: 600, width: 235, height: 185 }
  ];

  function percentage(value) {
    if (!value || value === 'center') return .5;
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    const number = parseFloat(value);
    return Number.isFinite(number) && value.endsWith('%') ? number / 100 : .5;
  }

  function addWindFilters() {
    if (document.getElementById('scene-wind-filters')) return;
    document.body.insertAdjacentHTML('beforeend', `<svg id="scene-wind-filters" xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;overflow:hidden">
      <defs>
        <filter id="scene-flag-wind" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.07" numOctaves="1" seed="3" result="wind">
            <animate attributeName="baseFrequency" values="0.012 0.07;0.019 0.06;0.014 0.085;0.012 0.07" dur="3.7s" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="wind" scale="5" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id="scene-tree-wind" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.025 0.023" numOctaves="1" seed="6" result="wind">
            <animate attributeName="baseFrequency" values="0.025 0.023;0.029 0.019;0.023 0.027;0.025 0.023" dur="8s" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="wind" scale="2" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
    </svg>`);
  }

  function animateScene(host) {
    if (!host) return;
    const patches = regions.map(region => {
      const patch = document.createElement('span');
      patch.className = 'scene-motion-patch ' + region.className;
      patch.setAttribute('aria-hidden', 'true');
      host.appendChild(patch);
      return { patch, region };
    });

    function positionPatches() {
      // Transforms animate the finished scene, so measure its untransformed box.
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      const scale = Math.max(width / IMAGE_WIDTH, height / IMAGE_HEIGHT);
      const backgroundWidth = IMAGE_WIDTH * scale;
      const backgroundHeight = IMAGE_HEIGHT * scale;
      const [horizontal, vertical] = getComputedStyle(host).backgroundPosition.split(',')[0].trim().split(/\s+/);
      const offsetX = (width - backgroundWidth) * percentage(horizontal);
      const offsetY = (height - backgroundHeight) * percentage(vertical);
      for (const { patch, region } of patches) {
        patch.style.left = `${offsetX + region.x * scale}px`;
        patch.style.top = `${offsetY + region.y * scale}px`;
        patch.style.width = `${region.width * scale}px`;
        patch.style.height = `${region.height * scale}px`;
        patch.style.backgroundSize = `${backgroundWidth}px ${backgroundHeight}px`;
        patch.style.backgroundPosition = `${-region.x * scale}px ${-region.y * scale}px`;
      }
    }

    if ('ResizeObserver' in window) new ResizeObserver(positionPatches).observe(host);
    else window.addEventListener('resize', positionPatches, { passive: true });
    positionPatches();
  }

  function init() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cover = document.querySelector('.cover-image');
    const exit = document.querySelector('.exit-showcase');
    if (!cover && !exit) return;
    addWindFilters();
    animateScene(cover);
    if (exit) {
      const backdrop = document.createElement('div');
      backdrop.className = 'exit-scene-image';
      backdrop.setAttribute('aria-hidden', 'true');
      exit.prepend(backdrop);
      animateScene(backdrop);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
