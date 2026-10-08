(() => {
  'use strict';
  const dialog = document.querySelector('#chart-dialog');
  const image = document.querySelector('#dialog-chart');
  const viewport = document.querySelector('.chart-viewport');
  const title = document.querySelector('#chart-dialog-title');
  const level = document.querySelector('#zoom-level');
  const minus = document.querySelector('#zoom-out');
  const plus = document.querySelector('#zoom-in');
  const fullscreen = document.querySelector('#chart-fullscreen');
  let scale = 1;
  let fitWidth = 0;
  let invoker;
  const padding = () => parseFloat(getComputedStyle(viewport).paddingLeft) + parseFloat(getComputedStyle(viewport).paddingRight);
  function resize(fit = false) {
    if (!dialog.open || !image.naturalWidth) return;
    const availableWidth = Math.max(150, viewport.clientWidth - padding());
    fitWidth = Math.min(availableWidth, image.naturalWidth);
    if (fit) { scale = 1; viewport.scrollTop = 0; viewport.scrollLeft = 0; }
    image.style.width = Math.round(fitWidth * scale) + 'px';
    image.style.height = 'auto';
    level.value = Math.round(scale * 100) + '%';
    level.textContent = level.value;
    minus.disabled = scale <= .5;
    plus.disabled = scale >= 4;
  }
  image.addEventListener('load', () => resize(true));
  document.querySelectorAll('.open-chart').forEach(button => {
    button.addEventListener('click', () => {
      if (typeof dialog.showModal !== 'function') { window.open(button.dataset.image, '_blank', 'noopener'); return; }
      invoker = button;
      title.textContent = button.dataset.title;
      image.alt = button.dataset.alt;
      image.src = button.dataset.image;
      scale = 1;
      dialog.showModal();
      requestAnimationFrame(() => resize(true));
      document.querySelector('#close-chart').focus();
    });
  });
  minus.addEventListener('click', () => { scale = Math.max(.5, scale - .25); resize(); });
  plus.addEventListener('click', () => { scale = Math.min(4, scale + .25); resize(); });
  document.querySelector('#zoom-fit').addEventListener('click', () => resize(true));
  fullscreen.hidden = !dialog.requestFullscreen;
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await dialog.requestFullscreen();
      resize(true);
    } catch (_) { fullscreen.textContent = 'Full screen unavailable'; }
  });
  document.addEventListener('fullscreenchange', () => { fullscreen.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; requestAnimationFrame(() => resize(true)); });
  document.querySelector('#close-chart').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (invoker) invoker.focus();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog && event.clientY > dialog.getBoundingClientRect().bottom) dialog.close(); });
  window.addEventListener('resize', () => resize());
  const sections = [...document.querySelectorAll('.report-part, .evidence-appendix')];
  const links = [...document.querySelectorAll('.reading-nav nav a')];
  if ('IntersectionObserver' in window) {
    const visible = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visible.set(entry.target.id, entry.isIntersecting));
      const current = sections.find(section => visible.get(section.id));
      if (!current) return;
      links.forEach(link => {
        const active = link.hash === '#' + current.id;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      });
    }, {rootMargin:'-110px 0px -55% 0px'});
    sections.forEach(section => observer.observe(section));
  }
})();
