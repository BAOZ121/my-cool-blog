import { createClient } from '@supabase/supabase-js';
import { createSupabaseAuthController } from '../../backend/client/auth-controller.mjs';
import { createEmailStepupClient } from '../../backend/client/email-stepup-client.mjs';
import { createCommunityClient } from '../../backend/client/community-client.mjs';
import { validateCommunityConfig, COMMUNITY_PATHS } from './community-config.mjs';
import { setupCommunityUI } from './community-ui.mjs';

const root = document.getElementById('rc-root');
if (root) {
  const callbackUrl = location.href;
  const callback = [COMMUNITY_PATHS.callback, COMMUNITY_PATHS.recovery].includes(location.pathname);
  // Scrub link secrets even when runtime configuration or storage is unavailable.
  if (callback) history.replaceState(null, '', location.pathname);
  try {
    const meta = name => document.querySelector(`meta[name="dex-community-${name}"]`)?.content || '';
    const config = validateCommunityConfig({ enabled: true, allowedOrigin: meta('origin'), supabaseUrl: meta('supabase'), publishableKey: meta('publishable-key'), googleEnabled: meta('google') === 'true', emailStepupEnabled: meta('email-stepup') === 'true' }, location.origin);
    let tabStorage;
    try { tabStorage = window.sessionStorage; } catch { throw Object.assign(new Error('Tab storage is unavailable.'), { code: 'STORAGE_UNAVAILABLE' }); }
    const auth = createSupabaseAuthController({ enabled: config.enabled, createClient, origin: config.allowedOrigin, supabaseUrl: config.supabaseUrl,
      publishableKey: config.publishableKey, emailStepupEnabled: config.emailStepupEnabled, callbackPath: COMMUNITY_PATHS.callback, recoveryPath: COMMUNITY_PATHS.recovery, tabStorage,
      replaceUrl: path => history.replaceState(null, '', path) });
    const api = createCommunityClient({ enabled: true, origin: config.allowedOrigin, tokenProvider: () => auth.getAccessToken() });
    const createStepup = () => createEmailStepupClient({ enabled: config.emailStepupEnabled, origin: config.allowedOrigin,
      fetchImpl: window.fetch.bind(window), getAccessToken: () => auth.getAccessToken() });
    setupCommunityUI({ document, window, auth, api, config, callbackUrl,
      stepup: config.emailStepupEnabled ? createStepup() : null, createStepup });
  } catch (error) {
    const status = document.getElementById('rc-status');
    if (status) status.textContent = error?.code === 'STORAGE_UNAVAILABLE' ? 'Sign-in needs browser tab storage. Allow it and reload this page.' : 'The community backend is not configured for this site. Account and posting forms are disabled.';
    for (const node of root.querySelectorAll('fieldset, button, input, textarea, select')) node.disabled = true;
  }
}
