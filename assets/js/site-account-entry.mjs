import { createAccountHintStore } from './site-account-hint.mjs';
import { setupSiteAccount } from './site-account.mjs';

const root = document.querySelector('[data-site-account]');
if (root && !document.getElementById('rc-root')) {
  let storage;
  try { storage = window.sessionStorage; } catch { /* Native account links still work. */ }
  const hints = createAccountHintStore({ storage, project: root.dataset.project });
  setupSiteAccount({ document, window, hints });
}
