import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAuthController } from '../client/auth-controller.mjs';

const ORIGIN = 'https://sdk-test.example';
const UPSTREAM = 'https://sdk-synthetic.supabase.co';
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const FACTOR = '33333333-3333-4333-8333-333333333333';
const CHALLENGE = '44444444-4444-4444-8444-444444444444';
const tab = () => { const values = new Map(); return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }; };
function harness({ storage = tab(), aal = 'aal1', providerTokens = false } = {}) {
  const requests = [], replacements = [];
  let sdk, sdkOptions, factor = false, pendingFactor = false, sequence = 0, authMethod = 'password';
  const user = () => ({ id: USER, aud: 'authenticated', role: 'authenticated', email: 'sdk-synthetic@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, factors: factor ? [{ id: FACTOR, factor_type: 'totp', status: 'verified' }] : pendingFactor ? [{ id: FACTOR, factor_type: 'totp', status: 'unverified' }] : [] });
  const token = () => {
    const seconds = Math.floor(Date.now() / 1000);
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: USER, aud: 'authenticated', role: 'authenticated', session_id: SESSION, aal, exp: seconds + 3600, iat: seconds, amr: [{ method: authMethod, timestamp: seconds }, ...(factor ? [{ method: 'totp', timestamp: seconds }] : [])] })}.synthetic_signature_only`;
  };
  const session = () => ({ access_token: token(), refresh_token: `sdk_synthetic_refresh_${++sequence}`, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: user(), ...(providerTokens ? { provider_token: 'synthetic_provider_access', provider_refresh_token: 'synthetic_provider_refresh' } : {}) });
  const response = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const controller = createSupabaseAuthController({ enabled: true, origin: ORIGIN, supabaseUrl: UPSTREAM,
    publishableKey: 'sb_publishable_SYNTHETIC_SDK_TEST_ONLY_0123456789', tabStorage: storage,
    callbackPath: '/test/auth/callback-v1/', recoveryPath: '/test/auth/recovery-v1/',
    replaceUrl: (url) => replacements.push(url),
    createClient(url, key, options) { sdkOptions = options; sdk = createClient(url, key, options); return sdk; },
    fetchImpl: async (input, init) => {
      const url = new URL(input); const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ path: url.pathname, query: url.searchParams, method, body });
      if (url.origin === ORIGIN && url.pathname === '/api/admin/session') return response({ data: { user_id: USER, state: 'active', email_verified: true, role: 'owner', aal: 'aal2', can_post: true, can_moderate: true } });
      assert.equal(url.origin, UPSTREAM, 'every actual SDK fetch is intercepted; no other origin is allowed');
      if (url.pathname === '/auth/v1/token' && method === 'POST') {
        if (url.searchParams.get('grant_type') === 'password') authMethod = 'password';
        if (body?.auth_code?.includes('reset')) authMethod = 'recovery';
        return response(session());
      }
      if (url.pathname === '/auth/v1/user' && method === 'GET') return response(user());
      if (url.pathname === '/auth/v1/user' && method === 'PUT') return response(user());
      if (url.pathname === '/auth/v1/signup' && method === 'POST') return response(user());
      if (url.pathname === '/auth/v1/recover' && method === 'POST') return response({});
      if (url.pathname === '/auth/v1/logout' && method === 'POST') return response(null, 204);
      if (url.pathname === '/auth/v1/factors' && method === 'POST') { pendingFactor = true; return response({ id: FACTOR, type: 'totp', totp: { secret: 'SYNTHETICSECRET', qr_code: '<svg>synthetic</svg>', uri: 'otpauth://totp/synthetic' } }); }
      if (url.pathname === `/auth/v1/factors/${FACTOR}/challenge`) return response({ id: CHALLENGE, expires_at: Math.floor(Date.now() / 1000) + 60 });
      if (url.pathname === `/auth/v1/factors/${FACTOR}/verify`) { aal = 'aal2'; factor = true; pendingFactor = false; return response(session()); }
      throw new Error(`Unexpected intercepted SDK route ${method} ${url.pathname}`);
    },
  });
  return { controller, storage, requests, replacements, sdk: () => sdk, options: () => sdkOptions };
}
const login = (h) => h.controller.signIn({ email: 'sdk-synthetic@example.invalid', password: 'synthetic-password-only' });
const errorCode = (code) => (error) => error.code === code;

test('pinned real SDK password sign-in, user/MFA calls, same-tab navigation and local logout', async () => {
  const a = harness(); await login(a);
  assert.equal(a.controller.getState().status, 'signed_in'); assert.ok(await a.controller.getAccessToken());
  assert.equal(a.requests[0].query.get('grant_type'), 'password');
  assert.match(a.options().auth.storageKey, /^dex-auth-[a-f0-9-]{36}$/);
  a.controller.dispose();
  const b = harness({ storage: a.storage }); await b.controller.initialize();
  assert.equal(b.controller.getState().status, 'signed_in'); assert.ok(await b.controller.getAccessToken());
  assert.equal(b.requests.some((r) => r.query.get('grant_type') === 'password'), false);
  await b.controller.signOut(); assert.equal(b.storage.values.size, 0); b.controller.dispose();
  assert.equal(b.requests.find((r) => r.path === '/auth/v1/logout').query.get('scope'), 'local');
});
test('pinned SDK generates S256 Google PKCE per-flow keys; callback scrubs and exchanges matching verifier', async () => {
  const a = harness(); const { url } = await a.controller.signInWithGoogle();
  assert.equal(new URL(url).searchParams.get('code_challenge_method'), 's256');
  const pending = JSON.parse(a.storage.getItem('dex-community-auth:sdk-synthetic.supabase.co:pkce'));
  assert.ok(Object.keys(pending.verifiers).some((key) => key.includes('-flow-') && key.endsWith('-code-verifier')));
  assert.ok(Object.keys(pending.verifiers).some((key) => key.endsWith('-flows-code-verifier')));
  const flowKey = Object.keys(pending.verifiers).find((key) => key.includes('-flow-'));
  const flowId = flowKey.slice('-flow-'.length, -'-code-verifier'.length);
  a.controller.dispose();
  const b = harness({ storage: a.storage }); await b.controller.handleCallback(`${ORIGIN}/test/auth/callback-v1/?code=synthetic-code-123&sb_flow_id=${flowId}`);
  assert.deepEqual(b.replacements, ['/test/auth/callback-v1/']);
  const exchange = b.requests.find((r) => r.query.get('grant_type') === 'pkce');
  assert.equal(exchange.body.auth_code, 'synthetic-code-123'); assert.equal(typeof exchange.body.code_verifier, 'string');
  assert.ok(exchange.body.code_verifier.length > 40); assert.equal(b.controller.getState().status, 'signed_in');
  b.controller.dispose();
});
test('pinned SDK email signup produces pending verification and exact callback', async () => {
  const a = harness(); await a.controller.signUp({ email: 'sdk-synthetic@example.invalid', password: 'synthetic-password-only' });
  assert.equal(a.controller.getState().status, 'verification_required'); assert.equal(await a.controller.getAccessToken(), null);
  const request = a.requests.find((r) => r.path === '/auth/v1/signup');
  assert.equal(request.query.get('redirect_to'), ORIGIN + '/test/auth/callback-v1/'); assert.equal(request.body.code_challenge_method, 's256');
  a.controller.dispose();
});
test('pinned SDK recovery suffix enters isolated reset flow; updateUser then logout consumes it', async () => {
  const a = harness(); await a.controller.requestPasswordReset({ email: 'sdk-synthetic@example.invalid' });
  const request = a.requests.find((r) => r.path === '/auth/v1/recover');
  assert.equal(request.query.get('redirect_to'), ORIGIN + '/test/auth/recovery-v1/');
  const stored = JSON.stringify([...a.storage.values]); assert.match(stored, /recovery/); assert.doesNotMatch(stored, /sdk-synthetic@example|password-only/);
  a.controller.dispose();
  const b = harness({ storage: a.storage }); await b.controller.handleCallback(ORIGIN + '/test/auth/recovery-v1/?code=synthetic-reset-code');
  assert.equal(b.controller.getState().status, 'recovery_ready'); assert.equal(await b.controller.getAccessToken(), null);
  const recoverySession = JSON.parse(b.storage.getItem('dex-community-auth:sdk-synthetic.supabase.co:session'));
  assert.equal(JSON.parse(Buffer.from(recoverySession.access_token.split('.')[1], 'base64url')).amr[0].method, 'recovery');
  assert.equal(b.requests.some((r) => r.path === '/api/admin/session'), false);
  const result = await b.controller.completePasswordReset({ password: 'new-synthetic-password', confirmPassword: 'new-synthetic-password' });
  assert.equal(result.passwordChanged, true); assert.equal(b.storage.values.size, 0);
  assert.equal(b.requests.filter((r) => r.path === '/auth/v1/user' && r.method === 'PUT').length, 1);
  await assert.rejects(b.controller.completePasswordReset({ password: 'new-synthetic-password', confirmPassword: 'new-synthetic-password' }));
  b.controller.dispose();
});
test('pinned SDK MFA verify refreshes bearer and only live API result enables admin', async () => {
  const a = harness(); await login(a);
  const enrollment = await a.controller.enrollMfa(); const challenge = await a.controller.challengeMfa(enrollment.factorId);
  await a.controller.verifyMfa({ ...challenge, code: '123456' });
  assert.equal(a.controller.getState().mfa.currentLevel, 'aal2'); assert.equal(a.controller.getState().admin.canManageUsers, true);
  assert.equal(a.requests.filter((r) => r.path === '/api/admin/session').length, 1);
  a.controller.dispose();
});

test('pinned SDK browser BroadcastChannels remain distinct even for cloned sessionStorage', async () => {
  const previous = { window: globalThis.window, document: globalThis.document, BroadcastChannel: globalThis.BroadcastChannel };
  const channels = new Set(), deliveries = [];
  class SyntheticBroadcastChannel {
    constructor(name) { this.name = name; this.listeners = []; channels.add(this); }
    addEventListener(type, listener) { if (type === 'message') this.listeners.push(listener); }
    postMessage(data) {
      for (const channel of channels) if (channel !== this && channel.name === this.name) {
        deliveries.push(data.event);
        for (const listener of channel.listeners) queueMicrotask(() => listener({ data }));
      }
    }
    close() { channels.delete(this); }
  }
  globalThis.window = { location: { href: ORIGIN + '/test/community/', hostname: 'sdk-test.example' }, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { visibilityState: 'visible' };
  globalThis.BroadcastChannel = SyntheticBroadcastChannel;
  let a, b;
  try {
    a = harness(); await login(a);
    const copy = tab(); for (const [key, value] of a.storage.values) copy.setItem(key, value);
    b = harness({ storage: copy }); await b.controller.initialize();
    assert.notEqual(a.options().auth.storageKey, b.options().auth.storageKey);
    assert.equal(channels.size, 2);
    await a.controller.signOut(); await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(deliveries, []);
    assert.equal(b.controller.getState().status, 'signed_in');
    // A cloned tab can intrinsically carry the SAME server session. This test
    // proves event isolation, not that server logout won't revoke a copied JWT.
  } finally {
    a?.controller.dispose(); b?.controller.dispose();
    await Promise.all([a?.sdk()?.auth.dispose(), b?.sdk()?.auth.dispose()]);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
  assert.equal(channels.size, 0);
});


test('pinned SDK session persistence excludes unused OAuth provider credentials', async () => {
  const a = harness({ providerTokens: true }); await login(a);
  assert.doesNotMatch(JSON.stringify([...a.storage.values]), /synthetic_provider|provider_token|provider_refresh_token/);
  assert.ok(await a.controller.getAccessToken()); a.controller.dispose();
});

test('legacy full-prefixed PKCE records upgrade without reusing old SDK BroadcastChannel key', async () => {
  const a = harness(); await a.controller.signInWithGoogle();
  const recordKey = 'dex-community-auth:sdk-synthetic.supabase.co:pkce';
  const record = JSON.parse(a.storage.getItem(recordKey));
  const legacyKey = a.options().auth.storageKey;
  record.storageKey = legacyKey;
  record.verifiers = Object.fromEntries(Object.entries(record.verifiers).map(([suffix, value]) => [legacyKey + suffix, value]));
  a.storage.setItem(recordKey, JSON.stringify(record)); a.controller.dispose();
  const b = harness({ storage: a.storage }); await b.controller.handleCallback(ORIGIN + '/test/auth/callback-v1/?code=synthetic-legacy-code');
  assert.notEqual(b.options().auth.storageKey, legacyKey);
  assert.equal(b.controller.getState().status, 'signed_in'); assert.equal(b.storage.getItem(recordKey), null);
  b.controller.dispose();
});

test('pinned SDK exposes unfinished TOTP factor for resume and prevents duplicate enrollment', async () => {
  const a = harness(); await login(a); await a.controller.enrollMfa();
  await a.controller.refresh();
  assert.equal(a.controller.getState().mfa.pendingFactorId, FACTOR);
  await assert.rejects(a.controller.enrollMfa(), errorCode('MFA_PENDING'));
  assert.equal(a.requests.filter((r) => r.path === '/auth/v1/factors' && r.method === 'POST').length, 1);
  const challenge = await a.controller.challengeMfa(FACTOR); await a.controller.verifyMfa({ ...challenge, code: '123456' });
  assert.equal(a.controller.getState().mfa.pendingFactorId, null);
  assert.equal(a.requests.some((r) => r.method === 'DELETE'), false);
  a.controller.dispose();
});
