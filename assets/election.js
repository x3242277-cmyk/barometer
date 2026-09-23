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
