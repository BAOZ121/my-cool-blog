import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuthController } from '../client/auth-controller.mjs';

const ORIGIN = 'https://community.example';
const UPSTREAM = 'https://synthetic-auth.supabase.co';
const KEY = 'sb_publishable_SYNTHETIC_TEST_KEY_ONLY_0123456789';
const USER = '11111111-1111-4111-8111-111111111111';
const FACTOR = '22222222-2222-4222-8222-222222222222';
const CHALLENGE = '33333333-3333-4333-8333-333333333333';
const TAB = '44444444-4444-4444-8444-444444444444';
const NOW = 2_000_000_000_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const defer = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const memoryTab = () => { const values = new Map(); return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }; };
function fixture(overrides = {}) {
  const tabStorage = overrides.tabStorage ?? memoryTab();
  const calls = [];
  let opts, listener, instanceCount = 0, currentTime = NOW;
  let aal = overrides.aal ?? 'aal1';
  let verifiedFactor = overrides.verifiedFactor ?? false;
  let pendingFactor = overrides.pendingFactor ?? false;
  const user = { id: USER, email: 'synthetic@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', role: 'authenticated', is_anonymous: false, ...overrides.user };
  const session = (suffix = 'original') => ({ access_token: `synthetic_access_token_${suffix}`, refresh_token: 'synthetic_refresh_token', expires_at: Math.floor(currentTime / 1000) + 3600, user });
  const saved = () => JSON.parse(opts.auth.storage.getItem(opts.auth.storageKey) || 'null');
  const save = (s, event = 'SIGNED_IN') => { opts.auth.storage.setItem(opts.auth.storageKey, JSON.stringify(s)); listener?.(event, s); return s; };
  const setVerifier = () => opts.auth.storage.setItem(`${opts.auth.storageKey}-code-verifier`, '"synthetic_pkce_verifier"');
  const sdk = { auth: {
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { listener = null; calls.push('unsubscribe'); } } } }; },
    async getSession() { calls.push('getSession'); return { data: { session: saved() }, error: null }; },
    async getUser() { calls.push('getUser'); if (overrides.getUser) await overrides.getUser(); return { data: { user }, error: overrides.userError ?? null }; },
    async signInWithPassword(args) { calls.push(['signIn', args]); if (overrides.signIn) await overrides.signIn(); if (overrides.signInError) return { error: overrides.signInError }; return { data: { session: save(session()) }, error: null }; },
    async signUp(args) { calls.push(['signUp', args]); setVerifier(); return { data: { user, session: overrides.autoConfirm ? save(session()) : null }, error: null }; },
    async signInWithOAuth(args) { calls.push(['oauth', args]); setVerifier(); return { data: { url: overrides.oauthUrl ?? `${UPSTREAM}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(ORIGIN + '/auth/callback')}&code_challenge_method=s256&code_challenge=synthetic` }, error: null }; },
    async exchangeCodeForSession(...args) { calls.push(['exchange', ...args]); if (overrides.exchange) await overrides.exchange(); return { data: { session: save(session('callback')), redirectType: overrides.recovery ? 'recovery' : null }, error: null }; },
    async resetPasswordForEmail(email, args) { calls.push(['reset', email, args]); setVerifier(); return { data: {}, error: null }; },
    async updateUser(args) { calls.push(['updatePassword', args]); if (overrides.updatePassword) await overrides.updatePassword(); return { data: { user }, error: overrides.updateError ?? null }; },
    async refreshSession() { calls.push('refreshSession'); if (overrides.refresh) await overrides.refresh(); if (overrides.refreshError) return { error: overrides.refreshError }; return { data: { session: save(session('refreshed'), 'TOKEN_REFRESHED') }, error: null }; },
    async signOut(args) { calls.push(['signOut', args, saved()?.access_token]); if (overrides.signOutError) return { error: overrides.signOutError }; opts.auth.storage.removeItem(opts.auth.storageKey); listener?.('SIGNED_OUT', null); return { error: null }; },
    stopAutoRefresh() { calls.push('stopAutoRefresh'); },
    mfa: {
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: aal, nextLevel: verifiedFactor ? 'aal2' : aal }, error: null }; },
      async listFactors() { return { data: { totp: verifiedFactor ? [{ id: FACTOR, status: 'verified' }] : [], all: [...(verifiedFactor ? [{ id: FACTOR, factor_type: 'totp', status: 'verified' }] : []), ...(pendingFactor ? [{ id: FACTOR, factor_type: 'totp', status: 'unverified' }] : [])] }, error: null }; },
      async enroll(args) { pendingFactor = true; calls.push(['enroll', args]); return { data: { id: FACTOR, totp: { secret: 'SYNTHETICSECRET', qr_code: '<svg>synthetic</svg>', uri: 'otpauth://totp/synthetic' } }, error: null }; },
      async challenge(args) { calls.push(['challenge', args]); return { data: { id: CHALLENGE, expires_at: Math.floor(currentTime / 1000) + 30 }, error: null }; },
      async verify(args) { calls.push(['verify', args]); if (overrides.verify) await overrides.verify(); if (overrides.verifyError) return { error: overrides.verifyError }; aal = 'aal2'; verifiedFactor = true; pendingFactor = false; save(session('mfa'), 'MFA_CHALLENGE_VERIFIED'); return { data: {}, error: null }; },
    },
  } };
  const fetchImpl = overrides.fetchImpl ?? (async (url, init) => {
    calls.push(['fetch', url, init]);
    return new Response(JSON.stringify({ data: { user_id: USER, email_verified: true, state: 'active', role: overrides.adminRole ?? 'owner', aal: 'aal2', can_post: true, can_moderate: true, ...overrides.adminData } }), { status: overrides.adminStatus ?? 200 });
  });
  const controller = createSupabaseAuthController({ enabled: true, origin: ORIGIN, supabaseUrl: UPSTREAM, publishableKey: KEY,
    tabStorage, now: () => currentTime, randomUUID: () => TAB, fetchImpl, timeoutMs: 100,
    replaceUrl: (url) => calls.push(['replaceUrl', url]),
    createClient(url, key, options) { instanceCount += 1; calls.push(['createClient', url, key]); opts = options; return sdk; },
    ...overrides.controller,
  });
  return { controller, calls, tabStorage, user, sdk, session, save, emit: (e, s) => listener?.(e, s), options: () => opts,
    count: () => instanceCount, setTime: (t) => { currentTime = t; } };
}
const login = (f) => f.controller.signIn({ email: 'synthetic@example.invalid', password: 'synthetic-password-only' });
const signup = (f) => f.controller.signUp({ email: 'synthetic@example.invalid', password: 'synthetic-password-only' });
const codeError = (code) => (error) => error.code === code;

test('disabled default never constructs an SDK or captures fields', async () => {
  let creates = 0;
  const auth = createSupabaseAuthController({ createClient() { creates++; } });
  assert.equal(auth.getState().status, 'disabled');
  await assert.rejects(auth.signIn({ email: 'x', password: 'x' }), codeError('AUTH_DISABLED'));
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(creates, 0);
});
test('strict config rejects secrets, insecure/cross-path upstreams and callbacks before SDK creation', async () => {
  for (const controller of [
    { publishableKey: 'sb_secret_SYNTHETIC_ONLY' }, { publishableKey: 'eyJhbGciOiJIUzI1NiJ9.synthetic.jwt' },
    { origin: 'http://community.example' }, { origin: `${ORIGIN}/path` }, { supabaseUrl: `${UPSTREAM}/extra` },
    { supabaseUrl: 'https://other.example' }, { supabaseUrl: `https://x@synthetic-auth.supabase.co` },
    { callbackPath: '//evil.example' }, { callbackPath: '/auth/../elsewhere' }, { callbackPath: '/auth/callback?next=elsewhere' },
  ]) {
    const f = fixture({ controller });
    await assert.rejects(login(f), codeError('INVALID_CONFIG'));
    assert.equal(f.count(), 0);
  }
});
test('SDK options enforce manual PKCE, tab-only sessions and no token in UI state', async () => {
  const f = fixture(); await login(f);
  const a = f.options().auth;
  assert.equal(a.flowType, 'pkce'); assert.equal(a.detectSessionInUrl, false); assert.equal(a.autoRefreshToken, false); assert.equal(a.persistSession, true);
  assert.match(await f.controller.getAccessToken(), /synthetic_access/);
  assert.equal(f.tabStorage.values.size, 1);
  assert.match(JSON.stringify([...f.tabStorage.values]), /synthetic_access_token/);
  assert.doesNotMatch(JSON.stringify(f.controller.getState()), /access_token|refresh_token|synthetic-password/);
  assert.equal(f.controller.getState().admin.canModerate, false);
  f.controller.dispose(); assert.equal(a.storage.getItem(a.storageKey), null);
});
test('email sign-up is verification pending, uses exact redirect, and does not assume user means session', async () => {
  const f = fixture(); await signup(f);
  assert.equal(f.controller.getState().status, 'verification_required');
  assert.equal(await f.controller.getAccessToken(), null);
  assert.equal(f.controller.getState().user, null);
  assert.equal(f.calls.find((x) => x[0] === 'signUp')[1].options.emailRedirectTo, ORIGIN + '/auth/callback');
  const stored = JSON.stringify([...f.tabStorage.values]);
  assert.match(stored, /verifier/); assert.doesNotMatch(stored, /password|synthetic_access|synthetic_refresh|synthetic@example/);
});
test('auto-confirm signup misconfiguration fails closed and revokes returned session', async () => {
  const f = fixture({ autoConfirm: true });
  await assert.rejects(signup(f), codeError('INVALID_CONFIG'));
  assert.equal(await f.controller.getAccessToken(), null);
  assert.equal(f.calls.filter((x) => x[0] === 'signOut').length, 1);
});
test('unverified / anonymous / mismatched identity never provides API token', async () => {
  for (const user of [{ email_confirmed_at: null }, { is_anonymous: true }, { role: 'service_role' }, { id: 'bad-id' }]) {
    const f = fixture({ user }); await assert.rejects(login(f)); assert.equal(await f.controller.getAccessToken(), null);
  }
});
test('Google URL is vetted and callback exchanges once after reload in initiating tab', async () => {
  const f = fixture(); const result = await f.controller.signInWithGoogle();
  assert.equal(new URL(result.url).origin, UPSTREAM);
  const g = fixture({ tabStorage: f.tabStorage });
  await g.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-auth-code');
  assert.equal(g.controller.getState().status, 'signed_in');
  assert.equal([...g.tabStorage.values.keys()].some((key) => key.endsWith(':pkce')), false);
  assert.deepEqual(g.calls.filter((x) => x[0] === 'replaceUrl'), [['replaceUrl', '/auth/callback']]);
  await assert.rejects(g.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-auth-code'), codeError('CALLBACK_INVALID'));
  assert.equal(g.calls.filter((x) => x[0] === 'exchange').length, 1);
});
test('unsolicited callback, duplicate parameters, fragments, injected next URL and errors are rejected', async () => {
  const noFlow = fixture(); await assert.rejects(noFlow.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-auth-code'), codeError('CALLBACK_INVALID'));
  for (const tail of ['?code=synthetic-code&code=other-code', '?code=synthetic-code#access_token=secret', '?code=synthetic-code&next=https://evil.example', '?error=access_denied&error_description=PRIVATE_ERROR', '?code=short']) {
    const f = fixture(); await f.controller.signInWithGoogle();
    await assert.rejects(f.controller.handleCallback(ORIGIN + '/auth/callback' + tail), (e) => e.code === 'CALLBACK_INVALID' && !e.message.includes('PRIVATE_ERROR'));
    assert.equal(f.calls.filter((x) => x[0] === 'exchange').length, 0);
    assert.equal([...f.tabStorage.values.keys()].some((key) => key.endsWith(':pkce')), false);
    assert.equal(f.calls.filter((x) => x[0] === 'replaceUrl').length, 1);
  }
});
test('cross-origin or different callback path never exchanges or navigates', async () => {
  for (const url of ['https://evil.example/auth/callback?code=synthetic-code', ORIGIN + '/elsewhere?code=synthetic-code']) {
    const f = fixture(); await f.controller.signInWithGoogle(); await assert.rejects(f.controller.handleCallback(url), codeError('CALLBACK_INVALID'));
    assert.equal(f.calls.filter((x) => x[0] === 'exchange').length, 0);
    assert.equal(f.calls.filter((x) => x[0] === 'replaceUrl').length, 0);
  }
});
test('expired PKCE verifier fails locally and new login clears pending flows', async () => {
  const f = fixture(); await f.controller.signInWithGoogle(); f.setTime(NOW + 31 * 60_000);
  await assert.rejects(f.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-code'), codeError('CALLBACK_INVALID'));
  assert.equal(f.calls.filter((x) => x[0] === 'exchange').length, 0);
  await f.controller.signInWithGoogle(); await login(f); assert.equal([...f.tabStorage.values.keys()].some((key) => key.endsWith(':pkce')), false);
});
test('Google provider, origin, exact redirect and PKCE are checked before returning URL', async () => {
  for (const oauthUrl of ['https://evil.example/authorize', `${UPSTREAM}/auth/v1/authorize?provider=google&redirect_to=https://evil.example`, `${UPSTREAM}/auth/v1/authorize?provider=github`, `${UPSTREAM}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(ORIGIN + '/auth/callback')}`]) {
    const f = fixture({ oauthUrl }); await assert.rejects(f.controller.signInWithGoogle(), codeError('CALLBACK_INVALID')); assert.equal([...f.tabStorage.values.keys()].some((key) => key.endsWith(':pkce')), false);
  }
});
test('duplicate login is rejected without a second credential submission', async () => {
  const pending = defer(); const f = fixture({ signIn: () => pending.promise });
  const first = login(f); await flush(); await assert.rejects(login(f), codeError('AUTH_BUSY'));
  pending.resolve(); await first;
  assert.equal(f.calls.filter((x) => x[0] === 'signIn').length, 1);
});
test('sign-out fences immediately, cancels late login, then revokes late created SDK session', async () => {
  const pending = defer(); const f = fixture({ signIn: () => pending.promise });
  const first = login(f); const firstResult = assert.rejects(first, codeError('CANCELLED')); await flush();
  const out = f.controller.signOut(); assert.equal(await f.controller.getAccessToken(), null);
  await assert.rejects(login(f), codeError('AUTH_BUSY'));
  pending.resolve(); await firstResult; await out;
  assert.equal(await f.controller.getAccessToken(), null);
  assert.equal(f.controller.getState().status, 'signed_out');
  assert.match(f.calls.find((x) => x[0] === 'signOut')[2], /synthetic_access/);
  assert.deepEqual(f.calls.find((x) => x[0] === 'signOut')[1], { scope: 'local' });
});
test('sign-out during getUser / MFA verification cannot repopulate state', async () => {
  const pending = defer(); const f = fixture({ getUser: () => pending.promise });
  const first = login(f); const rejected = assert.rejects(first, codeError('CANCELLED')); await flush();
  const out = f.controller.signOut(); pending.resolve(); await rejected; await out;
  assert.equal(f.controller.getState().user, null);
  const m = defer(); const g = fixture({ verifiedFactor: true, verify: () => m.promise }); await login(g);
  const c = await g.controller.challengeMfa(FACTOR); const verifying = g.controller.verifyMfa({ ...c, code: '123456' });
  const denied = assert.rejects(verifying, codeError('CANCELLED')); await flush(); const signedOut = g.controller.signOut(); m.resolve(); await denied; await signedOut;
  assert.equal(g.controller.getState().admin.canModerate, false); assert.equal(await g.controller.getAccessToken(), null);
});
test('unconfirmed server logout still clears local memory and reports precise safe warning', async () => {
  const f = fixture({ signOutError: { message: 'private remote details' } }); await login(f);
  await assert.rejects(f.controller.signOut(), codeError('SIGN_OUT_UNCONFIRMED'));
  assert.equal(await f.controller.getAccessToken(), null); assert.equal(f.controller.getState().status, 'signed_out');
  assert.equal(f.options().auth.storage.getItem(f.options().auth.storageKey), null);
  assert.doesNotMatch(JSON.stringify(f.controller.getState()), /private remote/);
});
test('near-expiry token retrieval coalesces refresh, expired/failed refresh fails closed', async () => {
  const p = defer(); const f = fixture({ refresh: () => p.promise }); await login(f); f.setTime(NOW + 3590_000);
  const a = f.controller.getAccessToken(); const b = f.controller.getAccessToken(); await flush(); p.resolve();
  assert.equal(await a, 'synthetic_access_token_refreshed'); assert.equal(await b, 'synthetic_access_token_refreshed');
  assert.equal(f.calls.filter((x) => x === 'refreshSession').length, 1);
  const g = fixture({ refreshError: { code: 'refresh_token_not_found', message: 'PRIVATE' } }); await login(g); g.setTime(NOW + 3700_000);
  assert.equal(await g.controller.getAccessToken(), null); assert.equal(g.controller.getState().error.code, 'SESSION_EXPIRED');
});
test('MFA enrollment/challenge/verify re-checks live admin endpoint and keeps secrets out of state', async () => {
  const f = fixture(); await login(f);
  assert.equal(f.calls.filter((x) => x[0] === 'fetch').length, 0);
  const enrollment = await f.controller.enrollMfa(); assert.equal(enrollment.factorId, FACTOR);
  assert.doesNotMatch(JSON.stringify(f.controller.getState()), /SYNTHETICSECRET|otpauth|<svg>/);
  const c = await f.controller.challengeMfa(FACTOR); await f.controller.verifyMfa({ ...c, code: '123456' });
  assert.equal(f.controller.getState().mfa.currentLevel, 'aal2'); assert.equal(f.controller.getState().admin.canManageUsers, true);
  const call = f.calls.find((x) => x[0] === 'fetch'); assert.equal(call[1], ORIGIN + '/api/admin/session'); assert.equal(call[2].credentials, 'omit'); assert.equal(call[2].redirect, 'error');
  assert.match(call[2].headers.Authorization, /synthetic_access_token_mfa/);
});
test('MFA verified factor gating / challenge expiration / failed verify do not grant admin', async () => {
  const f = fixture({ verifiedFactor: true, verifyError: { code: 'mfa_verification_failed' } }); await login(f);
  assert.equal(f.controller.getState().mfa.required, true);
  await assert.rejects(f.controller.challengeMfa(USER), codeError('INVALID_INPUT'));
  let c = await f.controller.challengeMfa(FACTOR);
  await assert.rejects(f.controller.verifyMfa({ ...c, code: 'bad' }), codeError('MFA_CODE_INVALID'));
  await assert.rejects(f.controller.verifyMfa({ ...c, code: '123456' }), codeError('MFA_CODE_INVALID'));
  c = await f.controller.challengeMfa(FACTOR); f.setTime(NOW + 31_000);
  await assert.rejects(f.controller.verifyMfa({ ...c, code: '123456' }), codeError('MFA_CODE_INVALID'));
  assert.equal(f.controller.getState().admin.canModerate, false);
});
test('live admin capability never comes from email, profile metadata or AAL alone', async () => {
  for (const overrides of [{ adminStatus: 403 }, { adminData: { user_id: FACTOR } }, { adminData: { aal: 'aal1' } }, { adminData: { state: 'suspended' } }, { adminData: { can_moderate: false } }, { adminData: { role: 'member' } }]) {
    const f = fixture({ aal: 'aal2', ...overrides, user: { app_metadata: { role: 'owner' }, user_metadata: { role: 'owner' } } });
    await login(f); assert.equal(f.controller.getState().admin.canModerate, false);
  }
  const f = fixture({ aal: 'aal2', adminRole: 'moderator' }); await login(f);
  assert.equal(f.controller.getState().admin.canModerate, true); assert.equal(f.controller.getState().admin.canManageUsers, false);
});
test('SDK events revoke capability synchronously but never call SDK inside listener', async () => {
  const scheduled = []; const f = fixture({ aal: 'aal2', controller: { schedule: (fn) => scheduled.push(fn) } }); await login(f);
  const before = f.calls.length; f.emit('TOKEN_REFRESHED', f.session('event'));
  assert.equal(f.calls.length, before); assert.equal(f.controller.getState().admin.canModerate, false);
  assert.equal(scheduled.length, 1);
  f.emit('SIGNED_OUT', null); assert.equal(await f.controller.getAccessToken(), null);
  scheduled[0](); assert.equal(f.controller.getState().status, 'signed_out');
});
test('dispose cancels late login, closes storage, removes listener without claiming remote sign-out', async () => {
  const p = defer(); const f = fixture({ signIn: () => p.promise }); const work = login(f); const cancelled = assert.rejects(work, codeError('CANCELLED')); await flush();
  f.controller.dispose(); p.resolve(); await cancelled;
  assert.equal(f.controller.getState().status, 'disposed'); assert.equal(await f.controller.getAccessToken(), null);
  assert.equal(f.options().auth.storage.getItem(f.options().auth.storageKey), null);
  assert.equal(f.calls.filter((x) => x[0] === 'signOut').length, 0);
});
test('SDK fetch is pinned to exact Auth origin and bounded through response body', async () => {
  let requests = 0;
  const f = fixture({ fetchImpl: async () => { requests++; return new Response('ok'); } }); await f.controller.initialize();
  const fetch = f.options().global.fetch;
  await assert.rejects(fetch('https://evil.example/auth/v1/token'), codeError('REQUEST_FAILED'));
  await assert.rejects(fetch(UPSTREAM + '/rest/v1/accounts'), codeError('REQUEST_FAILED'));
  assert.equal(requests, 0);
  await fetch(UPSTREAM + '/auth/v1/token'); assert.equal(requests, 1);
  const stalled = fixture({ controller: { timeoutMs: 5 }, fetchImpl: async () => new Response(new ReadableStream({ start() {} })) }); await stalled.controller.initialize();
  await assert.rejects(stalled.options().global.fetch(UPSTREAM + '/auth/v1/token'), codeError('REQUEST_FAILED'));
  const huge = fixture({ fetchImpl: async () => new Response('x'.repeat(262_145)) }); await huge.controller.initialize();
  await assert.rejects(huge.options().global.fetch(UPSTREAM + '/auth/v1/token'), codeError('REQUEST_FAILED'));
});
test('safe failures do not disclose raw SDK error, password, email or query', async () => {
  const f = fixture({ signInError: { message: 'PRIVATE_STACK user@example.invalid password=secret', code: 'unknown_code' } });
  await assert.rejects(login(f), (error) => error.code === 'AUTH_FAILED' && !error.message.includes('PRIVATE'));
  assert.doesNotMatch(JSON.stringify(f.controller.getState()), /PRIVATE|password=secret|user@example/);
});

test('auto-confirm signup rejection cannot be resurrected when server signout fails', async () => {
  const f = fixture({ autoConfirm: true, signOutError: { code: 'network_failure' } });
  await assert.rejects(signup(f), codeError('SIGN_OUT_UNCONFIRMED'));
  assert.equal(f.options().auth.storage.getItem(f.options().auth.storageKey), null);
  await f.controller.initialize();
  assert.equal(f.controller.getState().status, 'signed_out');
  assert.equal(await f.controller.getAccessToken(), null);
});
test('reentrant state subscribers cannot initiate another credential submission', async () => {
  const f = fixture(); let reentrant;
  f.controller.subscribe((state) => { if (state.status === 'signing_in' && !reentrant) reentrant = login(f).catch((error) => error.code); });
  await login(f); assert.equal(await reentrant, 'AUTH_BUSY');
  assert.equal(f.calls.filter((x) => x[0] === 'signIn').length, 1);
});
test('reentrant signout cancels before credentials leave and cannot recursively sign out', async () => {
  const f = fixture(); let out;
  f.controller.subscribe((state) => { if (state.status === 'signing_in' && !out) out = f.controller.signOut(); });
  await assert.rejects(login(f), codeError('CANCELLED')); await out;
  assert.equal(f.calls.filter((x) => x[0] === 'signIn').length, 0);
  assert.equal(await f.controller.getAccessToken(), null);
});
test('SDK stalled response reader is cancelled when deadline expires', async () => {
  let cancelled = false;
  const f = fixture({ controller: { timeoutMs: 5 }, fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
  await f.controller.initialize();
  await assert.rejects(f.options().global.fetch(UPSTREAM + '/auth/v1/token'), codeError('REQUEST_FAILED'));
  assert.equal(cancelled, true);
});

test('current SDK per-flow verifier survives redirect but unknown flow never falls back to legacy key', async () => {
  const f = fixture(); await f.controller.signInWithGoogle();
  const { storage, storageKey } = f.options().auth;
  const flow = 'syntheticflow12345678';
  storage.setItem(`${storageKey}-flow-${flow}-code-verifier`, '"synthetic_flow_verifier"');
  storage.setItem(`${storageKey}-flows-code-verifier`, JSON.stringify([flow]));
  const g = fixture({ tabStorage: f.tabStorage });
  await g.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-code&sb_flow_id=' + flow);
  assert.deepEqual(g.calls.find((x) => x[0] === 'exchange'), ['exchange', 'synthetic-code', { flowId: flow }]);
  assert.equal([...g.tabStorage.values.keys()].some((key) => key.endsWith(':pkce')), false);
  const h = fixture(); await h.controller.signInWithGoogle();
  await assert.rejects(h.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-code&sb_flow_id=unrelated_flow_12345'), codeError('CALLBACK_INVALID'));
  assert.equal(h.calls.filter((x) => x[0] === 'exchange').length, 0);
});
test('unavailable tab storage blocks signup / Google without submitting credentials', async () => {
  const tabStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
  const f = fixture({ tabStorage }); await assert.rejects(signup(f), codeError('STORAGE_UNAVAILABLE'));
  await assert.rejects(f.controller.signInWithGoogle(), codeError('STORAGE_UNAVAILABLE'));
  assert.equal(f.calls.filter((x) => ['signUp', 'oauth'].includes(x[0])).length, 0);
  await assert.rejects(login(f), codeError('STORAGE_UNAVAILABLE'));
  assert.equal(f.calls.filter((x) => x[0] === 'signIn').length, 0);
});
test('a second sign-in flow while already signed in is refused without losing existing session', async () => {
  const f = fixture(); await login(f);
  await assert.rejects(login(f), codeError('AUTH_BUSY'));
  assert.equal(await f.controller.getAccessToken(), 'synthetic_access_token_original');
  await assert.rejects(signup(f), codeError('AUTH_BUSY'));
  assert.equal(await f.controller.getAccessToken(), 'synthetic_access_token_original');
});

test('dispose uses current SDK lifecycle cleanup when available and ignores cleanup rejection', async () => {
  const f = fixture(); await login(f); let cleanup = 0;
  f.sdk.auth.dispose = async () => { cleanup++; throw Error('synthetic cleanup failure'); };
  f.controller.dispose(); await flush();
  assert.equal(cleanup, 1); assert.equal(f.controller.getState().status, 'disposed');
  assert.equal(await f.controller.getAccessToken(), null);
});

test('per-tab session survives full navigation and refresh; signout clears it for next page', async () => {
  const f = fixture(); await login(f); f.controller.dispose();
  const g = fixture({ tabStorage: f.tabStorage }); await g.controller.initialize();
  assert.equal(await g.controller.getAccessToken(), 'synthetic_access_token_original');
  assert.equal(g.calls.filter((x) => x[0] === 'signIn').length, 0);
  await g.controller.signOut();
  assert.equal(g.tabStorage.values.size, 0);
  const h = fixture({ tabStorage: g.tabStorage }); await h.controller.initialize(); assert.equal(await h.controller.getAccessToken(), null);
});
test('recovery requires an initiated matching recovery callback and quarantines API tokens across reload', async () => {
  const f = fixture({ recovery: true });
  await f.controller.requestPasswordReset({ email: 'synthetic@example.invalid' });
  assert.equal(f.controller.getState().status, 'reset_email_sent');
  assert.equal(f.calls.find((x) => x[0] === 'reset')[2].redirectTo, ORIGIN + '/auth/recovery');
  await f.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code');
  assert.equal(f.controller.getState().status, 'recovery_ready'); assert.equal(await f.controller.getAccessToken(), null);
  assert.equal(f.controller.getState().admin.canModerate, false);
  f.controller.dispose();
  const g = fixture({ tabStorage: f.tabStorage }); await g.controller.initialize();
  assert.equal(g.controller.getState().status, 'recovery_ready'); assert.equal(await g.controller.getAccessToken(), null);
  const result = await g.controller.completePasswordReset({ password: 'new-synthetic-password', confirmPassword: 'new-synthetic-password' });
  assert.deepEqual(result, { passwordChanged: true, signOutConfirmed: true });
  assert.equal(g.controller.getState().status, 'password_updated'); assert.equal(g.tabStorage.values.size, 0);
  assert.doesNotMatch(JSON.stringify(g.controller.getState()), /new-synthetic-password/);
});
test('unsolicited, wrong-kind, stale and replayed password recovery never update password', async () => {
  const f = fixture(); await assert.rejects(f.controller.completePasswordReset({ password: 'synthetic-secret', confirmPassword: 'synthetic-secret' }));
  await f.controller.signInWithGoogle(); await assert.rejects(f.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code'), codeError('CALLBACK_INVALID'));
  const g = fixture({ recovery: false }); await g.controller.requestPasswordReset({ email: 'synthetic@example.invalid' });
  await assert.rejects(g.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code'), codeError('CALLBACK_INVALID'));
  const h = fixture({ recovery: true }); await h.controller.requestPasswordReset({ email: 'synthetic@example.invalid' }); await h.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code');
  h.setTime(NOW + 11 * 60_000);
  await assert.rejects(h.controller.completePasswordReset({ password: 'synthetic-secret', confirmPassword: 'synthetic-secret' }), codeError('RECOVERY_REQUIRED'));
  for (const entry of [f, g, h]) assert.equal(entry.calls.filter((x) => x[0] === 'updatePassword').length, 0);
});
test('password mismatch / MFA gating block submission; update errors consume recovery window', async () => {
  const f = fixture({ recovery: true, verifiedFactor: true }); await f.controller.requestPasswordReset({ email: 'synthetic@example.invalid' }); await f.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code');
  await assert.rejects(f.controller.completePasswordReset({ password: 'synthetic-secret', confirmPassword: 'synthetic-secret' }), codeError('MFA_REQUIRED'));
  const c = await f.controller.challengeMfa(FACTOR); await f.controller.verifyMfa({ ...c, code: '123456' });
  assert.equal(f.controller.getState().status, 'recovery_ready'); assert.equal(await f.controller.getAccessToken(), null);
  await assert.rejects(f.controller.completePasswordReset({ password: 'synthetic-secret', confirmPassword: 'different' }), codeError('INVALID_INPUT'));
  assert.equal(f.calls.filter((x) => x[0] === 'updatePassword').length, 0);
  const g = fixture({ recovery: true, updateError: { code: 'unknown' } }); await g.controller.requestPasswordReset({ email: 'synthetic@example.invalid' }); await g.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code');
  await assert.rejects(g.controller.completePasswordReset({ password: 'synthetic-secret', confirmPassword: 'synthetic-secret' }));
  assert.equal(g.tabStorage.values.size, 0); await g.controller.initialize(); assert.equal(g.controller.getState().status, 'signed_out');
});

test('callback URL is scrubbed before SDK construction can perform initialization I/O', async () => {
  const f = fixture(); await f.controller.signInWithGoogle();
  const g = fixture({ tabStorage: f.tabStorage }); await g.controller.handleCallback(ORIGIN + '/auth/callback?code=synthetic-code');
  const scrub = g.calls.findIndex((item) => item[0] === 'replaceUrl');
  const construct = g.calls.findIndex((item) => item[0] === 'createClient');
  assert.ok(scrub >= 0 && scrub < construct);
});

test('signout during submitted password update cannot restore a recovery session', async () => {
  const pending = defer(); const f = fixture({ recovery: true, updatePassword: () => pending.promise });
  await f.controller.requestPasswordReset({ email: 'synthetic@example.invalid' });
  await f.controller.handleCallback(ORIGIN + '/auth/recovery?code=synthetic-recovery-code');
  const update = f.controller.completePasswordReset({ password: 'new-synthetic-password', confirmPassword: 'new-synthetic-password' });
  const cancelled = assert.rejects(update, codeError('CANCELLED')); await flush();
  const out = f.controller.signOut(); pending.resolve(); await cancelled; await out;
  assert.equal(await f.controller.getAccessToken(), null); assert.equal(f.tabStorage.values.size, 0);
  assert.equal(f.controller.getState().status, 'signed_out');
});

test('dismissed MFA enrollment resumes without exposing its secret or creating duplicate factors', async () => {
  const f = fixture(); await login(f); const enrollment = await f.controller.enrollMfa();
  assert.equal(enrollment.factorId, FACTOR);
  // The view discards secret/QR on close; only nonsecret factor identity survives.
  assert.equal(f.controller.getState().mfa.pendingFactorId, FACTOR);
  assert.doesNotMatch(JSON.stringify(f.controller.getState()), /SYNTHETICSECRET|otpauth|<svg>/);
  await assert.rejects(f.controller.enrollMfa(), codeError('MFA_PENDING'));
  assert.equal(f.calls.filter((x) => x[0] === 'enroll').length, 1);
  const challenge = await f.controller.challengeMfa(f.controller.getState().mfa.pendingFactorId);
  await f.controller.verifyMfa({ ...challenge, code: '123456' });
  assert.equal(f.controller.getState().mfa.pendingFactorId, null);
  assert.equal(f.controller.getState().mfa.currentLevel, 'aal2');
});
test('authoritative unfinished factor resumes after navigation instead of silently creating another', async () => {
  const f = fixture(); await login(f); await f.controller.enrollMfa(); f.controller.dispose();
  const g = fixture({ tabStorage: f.tabStorage, pendingFactor: true }); await g.controller.initialize();
  assert.equal(g.controller.getState().mfa.pendingFactorId, FACTOR);
  await assert.rejects(g.controller.enrollMfa(), codeError('MFA_PENDING'));
  assert.equal(g.calls.filter((x) => x[0] === 'enroll').length, 0);
  assert.equal(typeof g.controller.discardPendingMfa, 'undefined');
});
