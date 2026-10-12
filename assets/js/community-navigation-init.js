(() => {
  try {
    const disclosure = document.getElementById('site-navigation-disclosure');
    const returning = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
    const prior = returning && sessionStorage.getItem(`dex-site-navigation-return:${location.pathname}`);
    if (disclosure) disclosure.open = (prior || sessionStorage.getItem('dex-site-navigation')) !== 'compact';
  } catch { /* Native disclosure remains usable. */ }
})();
