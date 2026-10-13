/** Passive navigation only. The community page checks the actual account. */
const instances = new WeakMap();

export function setupSiteAccount({ document, window, hints, now = Date.now } = {}) {
  const root = document?.querySelector('[data-site-account]');
  if (!root || document.getElementById('rc-root')) return null;
  if (instances.has(root)) return instances.get(root);
  const guest = root.querySelector('[data-site-account-guest]');
  const member = root.querySelector('[data-site-account-member]');
  const avatar = root.querySelector('[data-site-account-avatar]');
  const status = root.querySelector('[data-site-account-status]');
  if (!guest || !member || !avatar) return null;
  let disposed = false, suspended = false, expiryTimer;
  const visible = () => !document.hidden && document.visibilityState !== 'hidden';
  function clearView() {
    window.clearTimeout(expiryTimer); expiryTimer = undefined;
    member.open = false; member.hidden = true; guest.hidden = false;
    avatar.textContent = '';
    if (status) status.textContent = '';
  }
  function render() {
    if (disposed || suspended || !visible()) return;
    clearView();
    let hint;
    try { hint = hints?.read(); } catch { return; }
    const time = now();
    // Recheck the presentation contract even when the store is injected.
    if (!hint || typeof hint.initials !== 'string' || !/^[A-Z0-9]{1,2}$/.test(hint.initials)
      || !Number.isFinite(time) || !Number.isFinite(hint.expiresAt)
      || hint.expiresAt <= time || hint.expiresAt > time + 5 * 60_000) return;
    avatar.textContent = hint.initials;
    guest.hidden = true; member.hidden = false;
    if (status) status.textContent = 'Open Account to check your session.';
    // A single local expiry timer clears the hint even if the page stays idle.
    // It never polls, renews the hint, or checks the account in the background.
    expiryTimer = window.setTimeout(clearView, hint.expiresAt - time);
  }
  const onFocus = () => render();
  const onVisibility = () => { if (visible()) render(); else clearView(); };
  const onPageShow = () => { suspended = false; render(); };
  const onPageHide = event => {
    suspended = true; clearView();
    if (!event.persisted) dispose();
  };
  const onKeyDown = event => {
    if (event.key !== 'Escape' || !member.open) return;
    member.open = false;
    member.querySelector('summary')?.focus({ preventScroll: true });
    event.preventDefault();
  };
  function dispose() {
    if (disposed) return;
    disposed = true; clearView();
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
    member.removeEventListener('keydown', onKeyDown);
    instances.delete(root);
  }
  const ui = Object.freeze({ dispose });
  instances.set(root, ui);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);
  member.addEventListener('keydown', onKeyDown);
  clearView();
  render();
  return ui;
}
