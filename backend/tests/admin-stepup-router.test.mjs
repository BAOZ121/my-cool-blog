import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createCommunityHandler } from '../api/handler.mjs';

const ORIGIN = 'https://community.example.com';
const USER = '11111111-1111-4111-8111-111111111111';
const SID = '22222222-2222-4222-8222-222222222222';
const POST = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'test-original-password-token-not-a-real-secret';
const ENV = { COMMUNITY_BACKEND_ENABLED: 'true', COMMUNITY_ALLOWED_ORIGIN: ORIGIN,
  SUPABASE_URL: 'https://stepupfixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_not_a_real_key' };
const EMAIL_ENV = { ...ENV, COMMUNITY_EMAIL_STEPUP_ENABLED: 'true',
  ADMIN_STEPUP_HMAC_KEY: 'test-only-hmac-key-not-a-real-secret-123456789',
  ADMIN_STEPUP_RESEND_KEY: 're_test_only_not_a_real_sending_key' };
const USER_RECORD = { id: USER, role: 'authenticated', email: 'owner@example.test', is_anonymous: false,
  email_confirmed_at: '2026-01-01T00:00:00Z' };
const TOTP = { user_id: USER, role: 'owner', state: 'active', email_verified: true,
  can_post: true, can_moderate: true, aal: 'aal2', version: 1 };
const EMAIL = { ...TOTP, aal: 'aal1', can_moderate: false,
  admin_auth_method: 'email', can_request_email_stepup: true };
const STATUS = { enabled: true, admitted: false, original_session_id: SID,
  idle_expires_epoch: null, absolute_expires_epoch: null };
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status });
function request(path = '/api/admin/session', { method = 'GET', body, headers = {}, signal } = {}) {
  return new Request(`${ORIGIN}${path}`, { method, signal,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(method === 'POST'
      ? { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function fixture({ session = EMAIL, status = STATUS, user = USER_RECORD, resolve, ...dependencies } = {}) {
  const calls = [], logs = [];
  const handler = createCommunityHandler({ crypto: webcrypto, logger: value => logs.push(value), ...dependencies,
    fetch: async (url, init) => {
      const call = { url: new URL(url), init, body: init.body ? JSON.parse(init.body) : null };
      calls.push(call);
      const custom = await resolve?.(call, calls);
      if (custom) return custom;
      if (call.url.pathname === '/auth/v1/user') return answer(user);
      if (call.url.pathname.endsWith('/community_me')) return answer(session);
      if (call.url.pathname.endsWith('/community_admin_stepup_status')) return answer(status);
      if (call.url.pathname.endsWith('/community_admin_stepup_cancel')) return answer({ cancelled: true, already_used: false });
      if (call.url.pathname === '/rest/v1/community_posts' || call.url.pathname.endsWith('/community_admin_list')) return answer([]);
      return answer({ id: POST, version: 2 });
    } });
  return { handler, calls, logs };
}

test('production flag missing/off/non-string and obsolete review flag preserve genuine legacy MFA', async () => {
  for (const extra of [{}, { COMMUNITY_EMAIL_STEPUP_ENABLED: 'false' }, { COMMUNITY_EMAIL_STEPUP_ENABLED: true },
    { COMMUNITY_EMAIL_STEPUP_REVIEW_ENABLED: 'true' }]) {
    const legacy = fixture({ session: TOTP });
    const response = await legacy.handler(request(), { ...ENV, ...extra });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.admin_auth_method, 'totp');
    assert.equal(legacy.calls.length, 2);
    const aal1 = fixture({ session: { ...TOTP, aal: 'aal1' } });
    assert.equal((await aal1.handler(request(), { ...ENV, ...extra })).status, 403);
    assert.equal((await legacy.handler(request('/api/admin/stepup/status'), { ...ENV, ...extra })).status, 503);
  }
});

test('flag-off DB email mode cannot become legacy MFA even with an admitted stale aal2 token', async () => {
  for (const env of [ENV, { ...EMAIL_ENV, COMMUNITY_EMAIL_STEPUP_ENABLED: 'false' }]) {
    const { handler, calls } = fixture({ session: { ...EMAIL, aal: 'aal2', can_moderate: true } });
    const result = await handler(request(), env);
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error.code, 'stepup_disabled');
    assert.equal(calls.length, 2);
  }
});

test('enabled incomplete mail/HMAC configuration closes admin APIs without disabling public community', async () => {
  for (const key of ['ADMIN_STEPUP_HMAC_KEY', 'ADMIN_STEPUP_RESEND_KEY']) {
    const env = { ...EMAIL_ENV, [key]: '' };
    const { handler, calls } = fixture();
    for (const path of ['/api/admin/session', '/api/admin/posts', '/api/admin/users', '/api/admin/audit']) {
      assert.equal((await handler(request(path), env)).status, 503);
    }
    assert.equal(calls.length, 0);
    assert.equal((await handler(request('/api/community/topics'), env)).status, 200);
    assert.equal((await handler(request('/api/admin/stepup/cancel', { method: 'POST', body: { challenge_id: POST } }), env)).status, 200);
    assert.ok(!calls.some(call => call.url.hostname === 'api.resend.com'));
  }
});

test('email pre-admission exposes only same-user eligible-owner capability and opaque self-session', async () => {
  const { handler, calls } = fixture({ session: { ...EMAIL, private_email: 'hidden@example.test', session_id: POST },
    status: { ...STATUS, hmac_key: 'must-never-leak' } });
  const result = await handler(request(), EMAIL_ENV);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { data: { ...EMAIL, admitted: false, session_id: SID,
    idle_expires_epoch: null, absolute_expires_epoch: null } });
  assert.deepEqual(calls.map(call => call.url.pathname), ['/auth/v1/user', '/rest/v1/rpc/community_me',
    '/rest/v1/rpc/community_admin_stepup_status']);
  for (const call of calls) assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  for (const path of ['/api/admin/posts', '/api/admin/users', '/api/admin/audit', `/api/admin/posts/${POST}/history`]) {
    assert.equal((await handler(request(path), EMAIL_ENV)).status, 403);
  }
});

test('pre-admission requires verified same user, live owner/active/password capability, regardless of browser role hints', async () => {
  for (const override of [{ user_id: POST }, { role: 'member' }, { role: 'moderator' }, { state: 'suspended' },
    { email_verified: false }, { can_post: false }, { can_request_email_stepup: false }, { aal: 'aal2', can_request_email_stepup: false }]) {
    const { handler, calls } = fixture({ session: { ...EMAIL, ...override } });
    assert.equal((await handler(request('/api/admin/session', { headers: { 'X-Role': 'owner' } }), EMAIL_ENV)).status, 403);
    assert.equal(calls.length, 2);
  }
  const invalidUser = fixture({ user: { ...USER_RECORD, email_confirmed_at: null } });
  assert.equal((await invalidUser.handler(request(), EMAIL_ENV)).status, 403);
  assert.equal(invalidUser.calls.length, 1);
});

test('enabled migration/config mismatches, missing capability and failed status never fall back to AAL2', async () => {
  for (const session of [TOTP, { ...EMAIL, admin_auth_method: 'invented' }, { ...EMAIL, can_request_email_stepup: undefined },
    { ...TOTP, admin_auth_method: 'totp', can_request_email_stepup: true }]) {
    const { handler } = fixture({ session });
    assert.equal((await handler(request(), EMAIL_ENV)).status, 503);
  }
  const disabled = fixture({ status: { ...STATUS, enabled: false } });
  assert.equal((await disabled.handler(request(), EMAIL_ENV)).status, 503);
  const forbidden = fixture({ session: { ...EMAIL, aal: 'aal2' }, resolve: ({ url }) => url.pathname.endsWith('_status')
    ? answer({ code: 'PT403', message: 'recovery_or_revocation_private' }, 403) : undefined });
  assert.equal((await forbidden.handler(request(), EMAIL_ENV)).status, 403);
  assert.equal(forbidden.calls.length, 3);
});

test('invalid self-session UUIDs and inconsistent admission are rejected without leaking upstream details', async () => {
  for (const sid of [null, '', 'not-a-uuid', `${SID}\n`, '11111111-1111-0111-8111-111111111111']) {
    const { handler, logs } = fixture({ status: { ...STATUS, original_session_id: sid } });
    const result = await handler(request(), EMAIL_ENV);
    assert.equal(result.status, 503);
    if (sid) assert.ok(!JSON.stringify(logs).includes(sid));
  }
  const mismatch = fixture({ session: { ...EMAIL, can_moderate: true } });
  assert.equal((await mismatch.handler(request(), EMAIL_ENV)).status, 403);
});

test('admitted email owner uses original aal1 bearer and unchanged mutations; grant authority stays in SQL', async () => {
  const expiry = Math.floor(Date.now() / 1000) + 900;
  const { handler, calls } = fixture({ session: { ...EMAIL, can_moderate: true },
    status: { ...STATUS, admitted: true, idle_expires_epoch: expiry, absolute_expires_epoch: expiry + 2700 },
    resolve: ({ url }) => url.pathname.endsWith('/community_moderate_post')
      ? answer({ code: 'PT403', message: 'no_exact_unconsumed_action_grant' }, 403) : undefined });
  assert.equal((await handler(request('/api/admin/posts'), EMAIL_ENV)).status, 200);
  const result = await handler(request(`/api/admin/posts/${POST}/hide`, { method: 'POST',
    body: { expected_version: 1, reason: ' Reviewed reason ' } }), EMAIL_ENV);
  assert.equal(result.status, 403);
  assert.deepEqual(calls.at(-1).body, { p_expected_version: 1, p_reason: 'Reviewed reason', p_post_id: POST, p_action: 'hide' });
  assert.equal(calls.at(-1).init.headers.Authorization, `Bearer ${TOKEN}`);
  const withBrowserGrant = await handler(request(`/api/admin/posts/${POST}/hide`, { method: 'POST',
    body: { expected_version: 1, reason: 'Reason', challenge_id: SID } }), EMAIL_ENV);
  assert.equal(withBrowserGrant.status, 400);
});

test('unrelated live AAL2 admins keep TOTP when email runtime is enabled', async () => {
  const { handler, calls } = fixture({ session: { ...TOTP, role: 'moderator',
    admin_auth_method: 'totp', can_request_email_stepup: false } });
  const response = await handler(request(), EMAIL_ENV);
  const data = (await response.json()).data;
  assert.equal(response.status, 200);
  assert.equal(data.admin_auth_method, 'totp');
  assert.equal(data.admitted, true);
  assert.equal(data.session_id, undefined);
  assert.equal(calls.length, 2);
});

test('mounted cancellation keeps all method/origin/field guards before Auth or mail', async () => {
  const { handler, calls } = fixture();
  for (const [req, code] of [
    [request('/api/admin/stepup/cancel'), 405],
    [request('/api/admin/stepup/cancel', { method: 'POST', body: { challenge_id: POST }, headers: { Origin: 'https://evil.example' } }), 403],
    [request('/api/admin/stepup/cancel', { method: 'POST', body: { challenge_id: POST, user_id: USER } }), 400],
    [request('/api/admin/stepup/register', { method: 'POST', body: {} }), 404],
  ]) assert.equal((await handler(req, EMAIL_ENV)).status, code);
  assert.equal(calls.length, 0);
});

test('whole community/admin operation deadline prevents a late preflight from starting a mutation', async () => {
  const { handler, calls } = fixture({ session: TOTP, timeoutMs: 100, totalTimeoutMs: 12,
    resolve: async ({ url, init }) => {
      if (url.pathname.endsWith('/community_me')) {
        await new Promise(resolve => setTimeout(resolve, 35));
        assert.equal(init.signal.aborted, true);
        return answer(TOTP);
      }
    } });
  const result = await handler(request(`/api/admin/posts/${POST}/hide`, { method: 'POST',
    body: { expected_version: 1, reason: 'Reason' } }), ENV);
  assert.equal(result.status, 503);
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(calls.length, 2);
});

test('request abort and already-aborted requests cannot start or continue protected work', async () => {
  const controller = new AbortController();
  const { handler, calls } = fixture({ session: TOTP, resolve: ({ url }) => {
    if (url.pathname === '/auth/v1/user') { controller.abort(); return new Promise(() => {}); }
  } });
  assert.equal((await handler(request('/api/admin/session', { signal: controller.signal }), ENV)).status, 503);
  assert.equal(calls.length, 1);
  assert.equal((await handler(request('/api/admin/session', { signal: controller.signal }), ENV)).status, 503);
  assert.equal(calls.length, 1);
});
