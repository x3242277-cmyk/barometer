/* Home section controls leave the application's hash routes intact. */
(() => {
  "use strict";
  const SECTION_SELECTOR = '.election-cover, .home-discovery, .verdict, .board, .election-coalition, .home-method';
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goToSection(target) {
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-home-section], [data-page-section]');
    if (!button) return;
    goToSection(document.getElementById(button.dataset.homeSection || button.dataset.pageSection));
  });

  const discovery = document.getElementById('home-discovery');
  if (discovery && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        discovery.classList.add('is-visible');
        observer.disconnect();
      }
    }, { threshold:0.12 });
    observer.observe(discovery);
  }
})();

/* Gentle foliage motion; keep the original flag in the photograph untouched. */
(() => {
  'use strict';
  const IMAGE_WIDTH = 1536;
  const IMAGE_HEIGHT = 1024;
  const regions = [
    { className: 'scene-motion-patch--tree', x: 0, y: 548, width: 285, height: 250 },
    { className: 'scene-motion-patch--tree scene-motion-patch--tree-right', x: 958, y: 600, width: 235, height: 185 },
  ];
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
