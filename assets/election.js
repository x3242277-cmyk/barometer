/* Home section controls leave the application's hash routes intact. */
(() => {
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-home-section]');
    if (!button) return;
    const target = document.getElementById(button.dataset.homeSection);
    if (!target) return;
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  });
})();
