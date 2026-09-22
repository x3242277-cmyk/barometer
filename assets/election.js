/* Home section controls leave the application's hash routes intact. */
(() => {
  "use strict";
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

  // Leave wheel and touch scrolling native so long sections remain readable.
})();
