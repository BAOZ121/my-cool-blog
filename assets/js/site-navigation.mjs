/** Native disclosure owns interaction. Remember only the reader's desktop
 * preference; never replace navigation, history or browser scroll restoration. */
export function setupSiteNavigation(document, window) {
  const disclosure = document.querySelector('.site-navigation-disclosure');
  if (!disclosure || disclosure.dataset.navigationReady) return;
  disclosure.dataset.navigationReady = 'true';
  const save = () => {
    if (window.innerWidth < 1024) return;
    try {
      const state = disclosure.open ? 'expanded' : 'compact';
      window.sessionStorage.setItem('dex-site-navigation', state);
      window.sessionStorage.setItem(`dex-site-navigation-return:${window.location.pathname}`, state);
    }
    catch { /* The native control works even when storage is unavailable. */ }
  };
  disclosure.addEventListener('toggle', save);
  window.addEventListener('pagehide', save);

  // A responsive layout must not leave keyboard focus in a CSS-hidden control.
  // Remember only the two regions whose visibility this disclosure changes;
  // Stack still owns the phone menu and its separate 768px breakpoint.
  const meta = document.querySelector('.left-sidebar .site-meta');
  const isFallback = node => !node || node === document.body || node === document.documentElement;
  let lastResponsiveFocus = null;
  document.addEventListener('focusin', event => {
    if (disclosure.contains(event.target) || meta?.contains(event.target)) lastResponsiveFocus = event.target;
    else if (!isFallback(event.target)) lastResponsiveFocus = null;
  });
  document.addEventListener('focusout', event => {
    // Clicking ordinary article text is an intentional blur. Only retain a
    // fallback blur when CSS has already hidden the responsive control.
    if (event.target === lastResponsiveFocus && isFallback(event.relatedTarget) && event.target.getClientRects().length) lastResponsiveFocus = null;
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', () => {
    const active = document.activeElement;
    const candidate = disclosure.contains(active) || meta?.contains(active) ? active : isFallback(active) ? lastResponsiveFocus : null;
    if (!candidate || candidate.getClientRects().length) return;
    const target = document.querySelector(window.innerWidth < 768 ? '#toggle-menu' : '.left-sidebar .site-avatar a');
    target?.focus({ preventScroll: true });
    lastResponsiveFocus = null;
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') setupSiteNavigation(document, window);
