(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || document.hidden || location.hash || scrollY > 1) return;
  const cover = document.getElementById('cover-photo');
  if (!cover) return;
  const curtain = document.createElement('div');
  curtain.className = 'dex-entry-curtain';
  curtain.style.setProperty('pointer-events', 'auto', 'important');
  curtain.setAttribute('role', 'dialog');
  curtain.setAttribute('aria-label', 'Opening Lisa Su biography');
  curtain.innerHTML = '<div class="dex-entry-curtain__panel"><div class="dex-entry-curtain__portrait"><img src="assets/lisa-su-cover.jpg" alt=""><div class="dex-entry-curtain__portrait-label">LISA SU</div></div><div class="dex-entry-curtain__copy"><div class="dex-entry-curtain__label">LIFE &amp; LEADERSHIP</div><div class="dex-entry-curtain__status">OPENING THE REPORT</div><div class="dex-entry-curtain__mode">ENGLISH READING EDITION</div><button class="dex-entry-curtain__skip" type="button">Skip introduction →</button></div></div>';
  const begun = performance.now();
  const animations = [];
  const timers = [];
  let ended = false;
  let revealed = false;
  let ready = false;
  const listeners = [];
  const listen = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  };
  const close = () => {
    if (ended) return;
    ended = true;
    timers.forEach(clearTimeout);
    listeners.forEach(remove => remove());
    animations.forEach(animation => animation.cancel());
    curtain.remove();
  };
  const schedule = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  try {
    // This deadline is armed before any decoding or animation work.
    schedule(close, 3800);
    document.body.append(curtain);
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(type => listen(window, type, close, {capture: true, passive: true}));
    listen(window, 'pagehide', close);
    listen(window, 'pageshow', event => { if (event.persisted) close(); });
    listen(document, 'visibilitychange', () => { if (document.hidden) close(); });
    if (typeof preference.addEventListener === 'function') listen(preference, 'change', close);
    listen(curtain.querySelector('button'), 'click', close);
    listen(curtain.querySelector('img'), 'error', close, {once: true});
    listen(cover, 'error', close, {once: true});
    const reveal = () => {
      if (ended || revealed) return;
      revealed = true;
      if (preference.matches || document.hidden) { close(); return; }
      curtain.querySelector('.dex-entry-curtain__status').textContent = 'READY TO READ';
      if (typeof cover.animate === 'function') {
        animations.push(cover.animate([{opacity: 0, transform: 'scale(.94)'}, {opacity: 1, transform: 'scale(1)'}], {duration: 550, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'}));
        document.querySelectorAll('.hero-copy .eyebrow, .hero-copy h1, .hero-subtitle').forEach((element, i) => {
          animations.push(element.animate([{opacity: 0, transform: 'translateY(24px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 570, delay: 65 + i * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'}));
        });
      }
      curtain.style.animation = 'none';
      curtain.style.transition = 'opacity 190ms ease-out';
      curtain.style.opacity = '0';
      schedule(() => { curtain.remove(); }, 200);
      schedule(close, 800);
    };
    const markReady = () => {
      ready = true;
      if (performance.now() - begun >= 1750) reveal();
    };
    const decodeCover = () => {
      if (!cover.naturalWidth) { close(); return; }
      if (typeof cover.decode === 'function') Promise.resolve(cover.decode()).then(markReady, close);
      else markReady();
    };
    listen(cover, 'load', decodeCover, {once: true});
    if (cover.complete) decodeCover();
    schedule(() => {
      if (ready) reveal();
      else if (!ended) curtain.querySelector('.dex-entry-curtain__status').textContent = 'OPENING THE COVER';
    }, 1750);
    // Readable content wins even if an image is delayed or decoding never settles.
    schedule(reveal, 2850);
  } catch { close(); }
})();
