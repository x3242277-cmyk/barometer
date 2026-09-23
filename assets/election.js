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

/* A small vector flag replaces the indistinct flag in the photograph; masked
   copies of the foliage add a little wind without shifting the building.
   Every overlay tracks the photograph's background-size: cover. */
(() => {
  'use strict';
  const IMAGE_WIDTH = 1536;
  const IMAGE_HEIGHT = 1024;
  const regions = [
    { className: 'scene-motion-patch--flag-matte', x: 505, y: 399, width: 101, height: 95, sampleX: 630 },
    { className: 'scene-motion-patch--tree', x: 0, y: 548, width: 285, height: 250 },
    { className: 'scene-motion-patch--tree scene-motion-patch--tree-right', x: 958, y: 600, width: 235, height: 185 },
    { className: 'scene-photo-flag', x: 525, y: 414, width: 58, height: 89, vector: true }
  ];
  let flagCount = 0;

  function flagSVG() {
    const fabric = `scene-flag-fabric-${++flagCount}`;
    return `<svg viewBox="0 0 58 89" preserveAspectRatio="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="${fabric}" x1="0" y1="0" x2="1" y2=".15">
        <stop offset="0" stop-color="#f3f5f4"/><stop offset=".35" stop-color="#d0d9e1"/>
        <stop offset=".7" stop-color="#f4f6f4"/><stop offset="1" stop-color="#b8c8d5"/>
      </linearGradient></defs>
      <path d="M1.5 2 V86" fill="none" stroke="#d7dfe4" stroke-width="1.7"/>
      <circle cx="1.5" cy="2" r="1.6" fill="#e9eef0"/>
      <g class="scene-flag-cloth">
        <path d="M2 4 C18 5 38 14 57 18 Q55 34 57 53 C40 50 20 43 2 40 Z" fill="url(#${fabric})" stroke="#dce6ec" stroke-width=".7"/>
        <path d="M3 12 C20 14 38 21 56 25 L56 29 C38 25 20 18 3 16 Z" fill="#174c84"/>
        <path d="M3 31 C20 34 38 42 56 45 L56 49 C38 46 20 38 3 35 Z" fill="#174c84"/>
        <path d="M29 22 L35 33 L23 33 Z M29 35 L23 24 L35 24 Z" fill="none" stroke="#1a4d83" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M13 8 C23 16 23 37 13 42 M42 15 C37 25 38 42 44 49" fill="none" stroke="#6f8498" stroke-opacity=".18" stroke-width="4"/>
      </g>
    </svg>`;
  }

  function percentage(value) {
    if (!value || value === 'center') return .5;
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    const number = parseFloat(value);
    return Number.isFinite(number) && value.endsWith('%') ? number / 100 : .5;
  }

  function animateScene(host) {
    if (!host) return;
    const patches = regions.map(region => {
      const patch = document.createElement('span');
      patch.className = (region.vector ? '' : 'scene-motion-patch ') + region.className;
      patch.setAttribute('aria-hidden', 'true');
      if (region.vector) patch.innerHTML = flagSVG();
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
        if (!region.vector) {
          patch.style.backgroundSize = `${backgroundWidth}px ${backgroundHeight}px`;
          patch.style.backgroundPosition = `${-(region.sampleX ?? region.x) * scale}px ${-region.y * scale}px`;
        }
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
