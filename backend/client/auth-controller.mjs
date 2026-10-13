/**
 * Default-disabled local integration preparation. No SDK client is created
 * until an explicitly enabled controller is used. See AUTH-INTEGRATION.md.
 */
import { createAuthStorage, resolveStorageKey } from './auth-storage.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z0-9._~-]{16,8192}$/;
const MESSAGES = Object.freeze({
  AUTH_DISABLED: 'Real sign-in is not enabled.', GOOGLE_DISABLED: 'Google sign-in is not enabled.', INVALID_CONFIG: 'Real sign-in is not configured.',
  INVALID_INPUT: 'Check the required fields.', AUTH_BUSY: 'A sign-in operation is already in progress.',
  AUTH_FAILED: 'Sign-in could not be completed. Check your details and try again.',
  RATE_LIMITED: 'Please wait before trying again.', EMAIL_VERIFICATION_REQUIRED: 'Check your email to verify your account, then sign in.',
  SESSION_EXPIRED: 'Your session has expired. Sign in again.', REQUEST_FAILED: 'The request could not be completed.',
  CALLBACK_INVALID: 'This sign-in link is invalid or expired. Restart sign-in in this tab.',
  STORAGE_UNAVAILABLE: 'Allow tab storage before starting this sign-in flow.',
  CANCELLED: 'The operation was cancelled.', MFA_REQUIRED: 'Complete multi-factor authentication.',
  MFA_CODE_INVALID: 'That authentication code could not be verified. Try a new challenge.',
  SIGN_OUT_UNCONFIRMED: 'You are signed out in this page. Server sign-out could not be confirmed.',
  RECOVERY_REQUIRED: 'Open a fresh password recovery link in the tab where you requested it.',
  MFA_PENDING: 'Continue the unfinished authenticator setup. If its setup key was lost, contact account support before starting again.',
});
const failure = (code) => Object.assign(new Error(MESSAGES[code] || MESSAGES.REQUEST_FAILED), { code });
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
function safeError(error) {
  if (Object.hasOwn(MESSAGES, error?.code)) return failure(error.code);
  if (error?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(error?.code)) return failure('RATE_LIMITED');
  if (error?.code === 'email_not_confirmed') return failure('EMAIL_VERIFICATION_REQUIRED');
  if (['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(error?.code)) return failure('SESSION_EXPIRED');
  if (['mfa_verification_failed', 'mfa_challenge_expired', 'mfa_factor_not_found'].includes(error?.code)) return failure('MFA_CODE_INVALID');
  return failure('AUTH_FAILED');
}
const unwrap = (result) => { if (result?.error) throw safeError(result.error); if (!object(result)) throw failure('AUTH_FAILED'); return result.data; };
const emptyAdmin = (status = 'signed_out') => ({ status, role: null, method: null, canRequestEmailStepup: false, admitted: false, idleExpiresAt: null, absoluteExpiresAt: null, canModerate: false, canManageUsers: false, canReadAudit: false });
const emptyMfa = () => ({ currentLevel: null, nextLevel: null, required: false, factors: [] });
const initial = (enabled) => ({ status: enabled ? 'signed_out' : 'disabled', busy: false, user: null, mfa: emptyMfa(), admin: emptyAdmin(), error: null, recovery: null });
function credentials(email, password, signup) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || typeof password !== 'string' || password.length < (signup ? 12 : 1) || password.length > 1024 || password.includes('\0')) throw failure('INVALID_INPUT');
  return { email: email.trim(), password };
}
function settings(options) {
  try {
    const site = new URL(options.origin);
    const upstream = new URL(options.supabaseUrl);
    if (site.protocol !== 'https:' || site.origin !== options.origin || site.username || site.password || !site.hostname.includes('.')
      || site.hostname.includes('*') || upstream.protocol !== 'https:' || upstream.port || upstream.username || upstream.password
      || !/^[a-z0-9-]+\.supabase\.co$/.test(upstream.hostname) || upstream.search || upstream.hash || upstream.pathname !== '/'
      || ![upstream.origin, `${upstream.origin}/`].includes(options.supabaseUrl)
      || !/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(options.publishableKey)
      || typeof options.createClient !== 'function') throw new Error();
    const path = options.callbackPath ?? '/auth/callback';
    if (!/^\/[A-Za-z0-9/_-]+$/.test(path) || path.includes('//') || path.includes('..')) throw new Error();
    const recoveryPath = options.recoveryPath ?? '/auth/recovery';
    if (!/^\/[A-Za-z0-9/_-]+$/.test(recoveryPath) || recoveryPath.includes('//') || recoveryPath.includes('..') || recoveryPath === path) throw new Error();
    return { origin: site.origin, upstream: upstream.origin, callbackUrl: `${site.origin}${path}`, callbackPath: path, recoveryUrl: `${site.origin}${recoveryPath}`, recoveryPath,
      namespace: `dex-community-auth:${upstream.hostname}` };
  } catch { throw failure('INVALID_CONFIG'); }
}

export function createSupabaseAuthController(options = {}) {
  const enabled = options.enabled === true;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((fn) => setTimeout(fn, 0));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  let config, client, storage, subscription, currentSession = null, active = null, signingOut = null;
  let disposed = false, epoch = 0, eventScheduled = false, enrollmentId = null, challenge = null, tokenRefresh = null, ownSignout = false;
  let recoveryMode = false, sessionGeneration = 0, sessionIdentity = null;
  let state = initial(enabled);
  const listeners = new Set();
  function snapshot() { const copy = structuredClone(state); copy.mfa.pendingFactorId = enrollmentId; copy.sessionGeneration = sessionGeneration; return copy; }
  function publish(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) { try { listener(snapshot()); } catch { /* UI listeners cannot break authentication. */ } }
  }
  function clearLocal(status = 'signed_out') {
    if (currentSession || sessionIdentity) sessionGeneration += 1;
    sessionIdentity = null; currentSession = null; enrollmentId = null; challenge = null; recoveryMode = false;
    publish({ status, recovery: null, user: null, mfa: emptyMfa(), admin: emptyAdmin(), error: null });
  }
  function assertOpen() { if (!enabled) throw failure('AUTH_DISABLED'); if (disposed) throw failure('CANCELLED'); }
  function checkpoint(generation) { if (disposed || signingOut || generation !== epoch) throw failure('CANCELLED'); }
  async function boundedFetch(input, init = {}, target = 'auth') {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const valid = target === 'auth' ? url.origin === config.upstream && url.pathname.startsWith('/auth/v1/')
      : url.href === `${config.origin}/api/admin/session`;
    if (!valid || url.username || url.password || url.hash) throw failure('REQUEST_FAILED');
    const controller = new AbortController();
    const signal = init.signal;
    let activeReader;
    const abort = () => { controller.abort(); void activeReader?.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(input, { ...init, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
          if (!response.body) return response;
          const reader = response.body.getReader();
          activeReader = reader;
          if (controller.signal.aborted) { await reader.cancel(); throw failure('REQUEST_FAILED'); }
          const chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 262_144) { abort(); throw failure('REQUEST_FAILED'); }
              chunks.push(value);
            }
          } finally { reader.releaseLock(); activeReader = null; }
          if (controller.signal.aborted) throw failure('REQUEST_FAILED');
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { abort(); reject(failure('REQUEST_FAILED')); }, timeoutMs); }),
      ]);
    } catch { throw failure('REQUEST_FAILED'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  function getClient() {
    assertOpen();
    if (client) return client;
    config = settings(options);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw failure('INVALID_CONFIG');
    const callbackUrls = [config.callbackUrl, config.recoveryUrl];
    const storageKey = resolveStorageKey({ tabStorage: options.tabStorage, namespace: config.namespace, callbackUrls, now, randomUUID: options.randomUUID });
    storage = createAuthStorage({ tabStorage: options.tabStorage, namespace: config.namespace, callbackUrls, storageKey, now });
    storage.assertAvailable();
    client = options.createClient(config.upstream, options.publishableKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: false,
        // This custom adapter persists sessions only in explicit per-tab sessionStorage.
        persistSession: true, storageKey, storage: storage.adapter, debug: false },
      global: { fetch: (input, init) => boundedFetch(input, init) },
    });
    if (!client?.auth) throw failure('INVALID_CONFIG');
    subscription = client.auth.onAuthStateChange((event) => {
      // Never await or call the SDK while its auth callback holds its lock.
      if (disposed || signingOut || ownSignout) return;
      if (event === 'SIGNED_OUT') {
        epoch += 1; storage.clear(); clearLocal(); return;
      }
      if (event === 'INITIAL_SESSION') return;
      if (event === 'PASSWORD_RECOVERY') { publish({ admin: emptyAdmin('unchecked') }); return; }
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
        publish({ admin: emptyAdmin('unchecked') });
        if (!active && currentSession && !eventScheduled) {
          eventScheduled = true;
          schedule(() => {
            eventScheduled = false;
            if (!disposed && !signingOut && !active && currentSession) void refresh().catch(() => {});
          });
        }
      }
    })?.data?.subscription;
    return client;
  }
  function run(status, work, { preserveSession = false } = {}) {
    try { assertOpen(); if (active || signingOut) throw failure('AUTH_BUSY'); getClient(); }
    catch (error) { return Promise.reject(safeError(error)); }
    const generation = epoch;
    // Reserve before notifying synchronous listeners; they may call back into us.
    active = Promise.resolve();
    publish({ status, busy: true, admin: emptyAdmin(currentSession ? 'unchecked' : 'signed_out'), error: null });
    const promise = Promise.resolve().then(() => { checkpoint(generation); return work(generation); }).then((result) => { checkpoint(generation); return result; })
      .catch((error) => {
        const safe = generation !== epoch || disposed || signingOut ? failure('CANCELLED') : safeError(error);
        if (generation === epoch && !disposed && !signingOut) {
          if (!preserveSession || !currentSession || safe.code === 'SESSION_EXPIRED') { currentSession = null; storage.clearMemory(); }
          publish({ status: safe.code === 'EMAIL_VERIFICATION_REQUIRED' ? 'verification_required' : currentSession ? (recoveryMode ? 'recovery_ready' : 'signed_in') : 'signed_out',
            ...(!currentSession ? { user: null, mfa: emptyMfa(), recovery: null } : {}), admin: emptyAdmin('unchecked'), error: { code: safe.code, message: safe.message } });
        }
        throw safe;
      }).finally(() => {
        if (active === promise) active = null;
        if (!disposed && !signingOut) publish({ busy: false });
      });
    active = promise;
    return promise;
  }
  async function adminState(session, user, aal, generation) {
    if (options.emailStepupEnabled !== true && aal.currentLevel !== 'aal2') return emptyAdmin('mfa_required');
    try {
      const response = await boundedFetch(`${config.origin}/api/admin/session`, { headers: { Accept: 'application/json', Authorization: `Bearer ${session.access_token}` } }, 'admin');
      checkpoint(generation);
      if (response.status === 401) throw failure('SESSION_EXPIRED');
      if (response.status === 403) return emptyAdmin(aal.currentLevel === 'aal2' ? 'denied' : 'mfa_required');
      if (!response.ok) return emptyAdmin('unavailable');
      const text = await response.text();
      checkpoint(generation);
      if (text.length > 64_000) return emptyAdmin('unavailable');
      const data = JSON.parse(text)?.data;
      if (!object(data) || data.user_id !== user.id || data.email_verified !== true || data.state !== 'active'
        || data.can_post !== true) return emptyAdmin('denied');
      if (data.admin_auth_method === 'email') {
        if (options.emailStepupEnabled !== true || data.role !== 'owner' || data.can_request_email_stepup !== true
          || typeof data.admitted !== 'boolean' || data.can_moderate !== data.admitted || data.aal !== aal.currentLevel
          || !UUID.test(data.session_id || '')) return emptyAdmin('denied');
        const idle = data.idle_expires_epoch, absolute = data.absolute_expires_epoch;
        if (data.admitted ? (!Number.isInteger(idle) || !Number.isInteger(absolute) || idle * 1000 <= now()
          || absolute * 1000 <= now() || idle > absolute || idle * 1000 - now() > 905_000 || absolute * 1000 - now() > 3_605_000)
          : (idle !== null || absolute !== null)) return emptyAdmin('denied');
        return { status: data.admitted ? 'available' : 'email_required', method: 'email', role: 'owner',
          canRequestEmailStepup: true, admitted: data.admitted, idleExpiresAt: idle === null ? null : idle * 1000,
          absoluteExpiresAt: absolute === null ? null : absolute * 1000, canModerate: data.admitted,
          canManageUsers: data.admitted, canReadAudit: data.admitted, sessionIdentity: data.session_id };
      }
      if ((data.admin_auth_method !== undefined && data.admin_auth_method !== 'totp') || data.aal !== 'aal2'
        || aal.currentLevel !== 'aal2' || data.can_moderate !== true || !['moderator', 'owner'].includes(data.role)) return emptyAdmin('denied');
      return { status: 'available', method: 'totp', role: data.role, canRequestEmailStepup: false, admitted: true,
        idleExpiresAt: null, absoluteExpiresAt: null, canModerate: true, canManageUsers: data.role === 'owner', canReadAudit: data.role === 'owner' };
    } catch (error) {
      if (['SESSION_EXPIRED', 'CANCELLED'].includes(error?.code)) throw error;
      return emptyAdmin('unavailable');
    }
  }
  async function synchronize(generation, suppliedSession) {
    const session = suppliedSession ?? unwrap(await client.auth.getSession())?.session;
    checkpoint(generation);
    if (!session) { clearLocal(); return snapshot(); }
    if (!TOKEN.test(session.access_token || '') || !Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now()) throw failure('SESSION_EXPIRED');
    const user = unwrap(await client.auth.getUser(session.access_token))?.user;
    checkpoint(generation);
    if (!object(user) || !UUID.test(user.id || '') || user.id !== session.user?.id || user.role !== 'authenticated' || user.is_anonymous === true) throw failure('SESSION_EXPIRED');
    if (!user.email || !Number.isFinite(Date.parse(user.email_confirmed_at))) throw failure('EMAIL_VERIFICATION_REQUIRED');
    const aal = unwrap(await client.auth.mfa.getAuthenticatorAssuranceLevel());
    const factors = unwrap(await client.auth.mfa.listFactors());
    checkpoint(generation);
    if (!['aal1', 'aal2'].includes(aal?.currentLevel) || !['aal1', 'aal2'].includes(aal?.nextLevel)) throw failure('AUTH_FAILED');
    if (Array.isArray(factors?.all)) {
      const pending = factors.all.filter((factor) => UUID.test(factor.id || '') && factor.factor_type === 'totp' && factor.status === 'unverified');
      enrollmentId = pending.find((factor) => factor.id === enrollmentId)?.id ?? pending[0]?.id ?? null;
    }
    const verifiedFactors = (Array.isArray(factors?.totp) ? factors.totp : []).filter((factor) => UUID.test(factor.id || '') && factor.status === 'verified')
      .map((factor) => ({ id: factor.id, type: 'totp' }));
    const recovery = storage.recovery();
    if (recovery && (recovery.pending || recovery.userId !== user.id || !Number.isFinite(recovery.expiresAt) || recovery.expiresAt <= now())) throw failure('RECOVERY_REQUIRED');
    recoveryMode = !!recovery;
    const admin = recoveryMode ? emptyAdmin('recovery') : await adminState(session, user, aal, generation);
    checkpoint(generation);
    // Only a server-validated same-session marker preserves an email workflow
    // across token rotation. It is an internal lifecycle marker, never a grant.
    const identity = admin.sessionIdentity ?? (session.access_token === currentSession?.access_token ? sessionIdentity : session.access_token);
    delete admin.sessionIdentity;
    if (identity !== sessionIdentity) sessionGeneration += 1;
    sessionIdentity = identity; currentSession = session;
    publish({ status: recoveryMode ? 'recovery_ready' : 'signed_in', recovery: recoveryMode ? { expiresAt: recovery.expiresAt } : null, user: { id: user.id, email: user.email, emailVerified: true },
      mfa: { currentLevel: aal.currentLevel, nextLevel: aal.nextLevel, required: aal.currentLevel !== 'aal2' && aal.nextLevel === 'aal2', factors: verifiedFactors }, admin, error: null });
    return snapshot();
  }
  function initialize() { return run('initializing', (generation) => synchronize(generation)); }
  function signIn({ email, password } = {}) {
    return run('signing_in', async (generation) => {
      if (currentSession) throw failure('AUTH_BUSY');
      const args = credentials(email, password, false);
      storage.clearPending(); storage.clearRecovery();
      const result = unwrap(await client.auth.signInWithPassword(args));
      checkpoint(generation);
      if (!result?.session) throw failure('AUTH_FAILED');
      return synchronize(generation, result.session);
    }, { preserveSession: true });
  }
  function signUp({ email, password } = {}) {
    return run('signing_up', async (generation) => {
      if (currentSession) throw failure('AUTH_BUSY');
      const args = credentials(email, password, true);
      storage.clearRecovery(); storage.beginFlow('signup', config.callbackUrl);
      try {
        const result = unwrap(await client.auth.signUp({ ...args, options: { emailRedirectTo: config.callbackUrl } }));
        checkpoint(generation);
        if (result?.session) {
          // PKCE sign-up requires email confirmation; auto-confirm is a release misconfiguration.
          ownSignout = true;
          try {
            const result = await client.auth.signOut({ scope: 'local' });
            if (result?.error) throw failure('SIGN_OUT_UNCONFIRMED');
          } catch { throw failure('SIGN_OUT_UNCONFIRMED'); }
          finally { ownSignout = false; storage.clear(); }
          throw failure('INVALID_CONFIG');
        }
        currentSession = null;
        publish({ status: 'verification_required', user: null, mfa: emptyMfa(), admin: emptyAdmin(), error: null });
        return snapshot();
      } catch (error) { storage.clearPending(); throw error; }
    }, { preserveSession: true });
  }
  function signInWithGoogle() {
    // Gate before SDK creation or storage access; provider enablement is separate.
    try { assertOpen(); if (options.googleEnabled !== true) throw failure('GOOGLE_DISABLED'); }
    catch (error) { return Promise.reject(safeError(error)); }
    return run('redirect_ready', async (generation) => {
      if (currentSession) throw failure('AUTH_BUSY');
      storage.clearRecovery(); storage.beginFlow('google', config.callbackUrl);
      try {
        const data = unwrap(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: config.callbackUrl, skipBrowserRedirect: true } }));
        checkpoint(generation);
        const url = new URL(data?.url);
        if (url.origin !== config.upstream || url.pathname !== '/auth/v1/authorize' || url.username || url.password || url.hash
          || url.searchParams.getAll('provider').length !== 1 || url.searchParams.get('provider') !== 'google'
          || url.searchParams.getAll('redirect_to').length !== 1 || url.searchParams.get('redirect_to') !== config.callbackUrl
          || url.searchParams.get('code_challenge_method') !== 's256' || !url.searchParams.get('code_challenge') || !storage.hasVerifier()) throw failure('CALLBACK_INVALID');
        publish({ status: 'redirect_ready' });
        // UI may assign this vetted Supabase URL only after a user's explicit click.
        return { url: url.href };
      } catch (error) { storage.clearPending(); throw error; }
    }, { preserveSession: true });
  }
  function handleCallback(callbackUrl) {
    let url;
    try {
      assertOpen();
      config ??= settings(options);
      url = new URL(callbackUrl);
      if (url.origin !== config.origin || ![config.callbackPath, config.recoveryPath].includes(url.pathname) || url.username || url.password || url.href.length > 4096) throw failure('CALLBACK_INVALID');
      // Scrub before constructing the SDK; initialization may read/refresh a
      // stored session. No callback code should reach referrers or early I/O.
      if (typeof options.replaceUrl !== 'function') throw failure('INVALID_CONFIG');
      options.replaceUrl(url.pathname);
    } catch (error) { return Promise.reject(safeError(error?.code ? error : failure('CALLBACK_INVALID'))); }
    return run('processing_callback', async (generation) => {
      const allowed = new Set(['code', 'sb_flow_id', 'error', 'error_code', 'error_description']);
      try {
        if (url.hash || [...url.searchParams.keys()].some((key) => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)
          || url.searchParams.has('error') || url.searchParams.has('error_code') || url.searchParams.has('error_description')
          || !/^[A-Za-z0-9_-]{8,512}$/.test(url.searchParams.get('code') || '')) throw failure('CALLBACK_INVALID');
        const flowId = url.searchParams.get('sb_flow_id');
        if (flowId !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)) throw failure('CALLBACK_INVALID');
        const pending = storage.pending();
        if (pending?.kind === 'google' && options.googleEnabled !== true) throw failure('GOOGLE_DISABLED');
        if (!pending || pending.callbackUrl !== `${config.origin}${url.pathname}` || !storage.hasVerifier(flowId)
          || ((pending.kind === 'recovery') !== (url.pathname === config.recoveryPath))) throw failure('CALLBACK_INVALID');
        if (pending.kind === 'recovery') storage.setRecovery({ pending: true, expiresAt: now() + 10 * 60_000 });
        const code = url.searchParams.get('code');
        const data = unwrap(await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined));
        checkpoint(generation);
        if (!data?.session || ((pending.kind === 'recovery') !== (data.redirectType === 'recovery'))) throw failure('CALLBACK_INVALID');
        if (pending.kind === 'recovery') storage.setRecovery({ userId: data.session.user?.id, expiresAt: now() + 10 * 60_000 });
        return await synchronize(generation, data.session);
      } finally { storage.clearPending(); }
    });
  }
  function refresh() {
    return run('refreshing', async (generation) => {
      const data = unwrap(await client.auth.getSession());
      checkpoint(generation);
      if (!data?.session) { clearLocal(); return snapshot(); }
      let session = data.session;
      if (!Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now() + 30_000) {
        session = unwrap(await client.auth.refreshSession())?.session;
        checkpoint(generation);
        if (!session) throw failure('SESSION_EXPIRED');
      }
      return synchronize(generation, session);
    });
  }
  async function getAccessToken() {
    if (!enabled || disposed || signingOut || recoveryMode || !currentSession || !state.user?.emailVerified) return null;
    if (active && !tokenRefresh) return null;
    if (tokenRefresh || currentSession.expires_at * 1000 <= now() + 30_000) {
      if (!tokenRefresh) {
        tokenRefresh = refresh();
        tokenRefresh.finally(() => { tokenRefresh = null; }).catch(() => {});
      }
      try { await tokenRefresh; } catch { return null; }
    }
    if (disposed || signingOut || !currentSession || currentSession.expires_at * 1000 <= now()) return null;
    return currentSession.access_token;
  }

  function requireSession() {
    if (!currentSession || !state.user?.emailVerified) throw failure('SESSION_EXPIRED');
    if (currentSession.expires_at * 1000 <= now()) throw failure('SESSION_EXPIRED');
  }
  function enrollMfa() {
    return run('enrolling_mfa', async (generation) => {
      requireSession();
      const factors = unwrap(await client.auth.mfa.listFactors());
      checkpoint(generation);
      if (Array.isArray(factors?.all)) {
        const pending = factors.all.filter((factor) => UUID.test(factor.id || '') && factor.factor_type === 'totp' && factor.status === 'unverified');
        enrollmentId = pending.find((factor) => factor.id === enrollmentId)?.id ?? pending[0]?.id ?? null;
      }
      if (enrollmentId) throw failure('MFA_PENDING');
      const data = unwrap(await client.auth.mfa.enroll({ factorType: 'totp' }));
      checkpoint(generation);
      if (!UUID.test(data?.id || '') || !object(data?.totp) || typeof data.totp.secret !== 'string'
        || typeof data.totp.qr_code !== 'string' || typeof data.totp.uri !== 'string') throw failure('AUTH_FAILED');
      enrollmentId = data.id;
      publish({ status: recoveryMode ? 'recovery_ready' : 'signed_in' });
      // Secret is returned once to the enrollment view; never logged or put in state/storage.
      return { factorId: data.id, secret: data.totp.secret, qrCode: data.totp.qr_code, uri: data.totp.uri };
    }, { preserveSession: true });
  }
  function challengeMfa(factorId) {
    return run('challenging_mfa', async (generation) => {
      requireSession();
      if (!UUID.test(factorId || '') || (factorId !== enrollmentId && !state.mfa.factors.some((factor) => factor.id === factorId))) throw failure('INVALID_INPUT');
      challenge = null;
      const data = unwrap(await client.auth.mfa.challenge({ factorId }));
      checkpoint(generation);
      if (!UUID.test(data?.id || '') || !Number.isFinite(data.expires_at) || data.expires_at * 1000 <= now()) throw failure('MFA_CODE_INVALID');
      challenge = { factorId, challengeId: data.id, expiresAt: data.expires_at * 1000 };
      publish({ status: recoveryMode ? 'recovery_ready' : 'signed_in' });
      return { ...challenge };
    }, { preserveSession: true });
  }
  function verifyMfa({ factorId, challengeId, code } = {}) {
    return run('verifying_mfa', async (generation) => {
      requireSession();
      if (!challenge || challenge.factorId !== factorId || challenge.challengeId !== challengeId
        || challenge.expiresAt <= now() || !/^\d{6}$/.test(code || '')) throw failure('MFA_CODE_INVALID');
      challenge = null; // A challenge attempt is not automatically retried.
      unwrap(await client.auth.mfa.verify({ factorId, challengeId, code }));
      checkpoint(generation);
      enrollmentId = null;
      return synchronize(generation);
    }, { preserveSession: true });
  }
  function requestPasswordReset({ email } = {}) {
    return run('requesting_reset', async (generation) => {
      if (currentSession) throw failure('AUTH_BUSY');
      const { email: address } = credentials(email, 'validation-only', false);
      storage.clearRecovery(); storage.beginFlow('recovery', config.recoveryUrl);
      try {
        unwrap(await client.auth.resetPasswordForEmail(address, { redirectTo: config.recoveryUrl }));
        checkpoint(generation);
        publish({ status: 'reset_email_sent', user: null, recovery: null, admin: emptyAdmin() });
        return snapshot();
      } catch (error) { storage.clearPending(); throw error; }
    }, { preserveSession: true });
  }
  function completePasswordReset({ password, confirmPassword } = {}) {
    return run('updating_password', async (generation) => {
      requireSession();
      const recovery = storage.recovery();
      if (!recoveryMode || recovery?.pending || recovery?.userId !== state.user?.id || recovery.expiresAt <= now()) throw failure('RECOVERY_REQUIRED');
      if (state.mfa.required) throw failure('MFA_REQUIRED');
      if (typeof password !== 'string' || password.length < 12 || password.length > 1024 || password.includes('\0') || password !== confirmPassword) throw failure('INVALID_INPUT');
      // Only the end user supplies/submits this new password in the approved UI.
      // Consume the recovery window before the mutation: uncertain results are not retried.
      storage.setRecovery({ pending: true, expiresAt: now() });
      try {
        unwrap(await client.auth.updateUser({ password }));
        checkpoint(generation);
        let confirmed = true;
        ownSignout = true;
        try { const result = await client.auth.signOut({ scope: 'local' }); confirmed = !result?.error; }
        catch { confirmed = false; }
        finally { ownSignout = false; storage.clear(); clearLocal(); }
        checkpoint(generation);
        publish({ status: 'password_updated', error: confirmed ? null : { code: 'SIGN_OUT_UNCONFIRMED', message: MESSAGES.SIGN_OUT_UNCONFIRMED } });
        return { passwordChanged: true, signOutConfirmed: confirmed };
      } catch (error) { storage.clear(); clearLocal(); throw error; }
    }, { preserveSession: true });
  }
  function signOut() {
    try { assertOpen(); } catch (error) { return Promise.reject(error); }
    if (signingOut) return signingOut;
    epoch += 1;
    const prior = active;
    // Exposed tokens are fenced immediately. Wait for an in-flight SDK write so a
    // late successful login is revoked, rather than racing it with local cleanup.
    signingOut = Promise.resolve().then(async () => {
      if (prior) await prior.catch(() => {});
      let error = null;
      try { if (client) { const result = await client.auth.signOut({ scope: 'local' }); if (result?.error) error = failure('SIGN_OUT_UNCONFIRMED'); } }
      catch { error = failure('SIGN_OUT_UNCONFIRMED'); }
      finally {
        if (storage && !storage.clear()) error = failure('SIGN_OUT_UNCONFIRMED');
        if (!disposed) { clearLocal(); publish({ busy: false, error: error ? { code: error.code, message: error.message } : null }); }
        signingOut = null;
      }
      if (error) throw error;
      return snapshot();
    });
    clearLocal();
    publish({ status: 'signing_out', busy: true });
    return signingOut;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; epoch += 1; sessionGeneration += 1; sessionIdentity = null; currentSession = null; enrollmentId = null; challenge = null;
    subscription?.unsubscribe(); storage?.close();
    try {
      const cleanup = typeof client?.auth.dispose === 'function' ? client.auth.dispose() : client?.auth.stopAutoRefresh?.();
      void Promise.resolve(cleanup).catch(() => {});
    } catch { /* Local fencing/closed storage still hold if SDK cleanup fails. */ }
    // Destruction does not claim a remote logout. UI should call signOut first.
    state = { ...initial(enabled), status: 'disposed' }; listeners.clear();
  }
  return Object.freeze({ initialize, signIn, signUp, signInWithGoogle, handleCallback, refresh, getAccessToken,
    enrollMfa, challengeMfa, verifyMfa, requestPasswordReset, completePasswordReset, signOut, dispose, getState: snapshot,
    subscribe(listener) { if (typeof listener !== 'function') throw failure('INVALID_INPUT'); listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); } });
}
