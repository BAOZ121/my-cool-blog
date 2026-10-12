// Preference only. Authentication never uses localStorage.
(() => {
  if (document.currentScript?.dataset.disabledCallback === 'true') history.replaceState(null, '', location.pathname);
  let scheme = 'auto';
  try { scheme = localStorage.getItem('StackColorScheme') || scheme; } catch { /* Optional preference. */ }
  document.documentElement.dataset.scheme = scheme === 'dark' || (scheme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
})();
