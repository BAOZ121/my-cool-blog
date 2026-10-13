import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { createAdminStepupHandler } from '../api/admin-stepup.mjs';

const ORIGIN = 'https://community.example.com';
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const CHALLENGE = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';
const MAIL = '55555555-5555-4555-8555-555555555555';
const NOW = Date.parse('2026-10-12T06:00:00Z');
const TOKEN = 'fixture-original-password-jwt-not-a-real-token';
const CODE = '012345';
const ENV = Object.freeze({
  COMMUNITY_BACKEND_ENABLED: 'true', COMMUNITY_EMAIL_STEPUP_ENABLED: 'true',
  COMMUNITY_ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://stepupfixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_not_a_real_key',
  ADMIN_STEPUP_HMAC_KEY: 'test-only-hmac-key-not-a-real-secret-123456789',
  ADMIN_STEPUP_RESEND_KEY: 're_test_only_not_a_real_sending_key',
});
const USER_RECORD = { id: USER, role: 'authenticated', email: 'owner@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false };
const BASE_CONTEXT = { created: true, id: CHALLENGE, user_id: USER, email: USER_RECORD.email,
  original_session_id: SESSION, scope: 'admission', action: null, target_id: null, expected_version: null,
  payload_digest: null, binding_digest: 'b'.repeat(64), salt: 'c'.repeat(32),
  created_at: new Date(NOW).toISOString(), expires_at: new Date(NOW + 300_000).toISOString(),
  expires_epoch: (NOW + 300_000) / 1000, project: 'stepupfixture', generation: '7' };
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const hmac = (fields) => createHmac('sha256', ENV.ADMIN_STEPUP_HMAC_KEY).update(fields.join('\n'), 'utf8').digest('hex');

function request(route = 'begin', { method = route === 'status' ? 'GET' : 'POST', body,
  raw, headers = {}, token = TOKEN } = {}) {
  const initial = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
  if (method === 'POST') {
    initial.Origin ??= ORIGIN; initial['Sec-Fetch-Site'] ??= 'same-origin';
    initial['Content-Type'] ??= 'application/json';
  }
  const path = route.startsWith('/') ? route : `/api/admin/stepup/${route}`;
  return new Request(`${ORIGIN}${path}`, { method, headers: initial,
    ...(method === 'POST' ? { body: raw ?? JSON.stringify(body ?? { scope: 'admission' }) } : {}) });
}
function fixture({ resolve, user = USER_RECORD, context = {}, timeoutMs = 200, totalTimeoutMs = 20_000, draw = () => 12345 } = {}) {
  const calls = [], logs = [];
  const handler = createAdminStepupHandler({ timeoutMs, totalTimeoutMs, now: () => NOW,
    crypto: { subtle: webcrypto.subtle, getRandomValues(value) { value[0] = draw(); return value; } },
    logger: (value) => logs.push(value),
    fetch: async (input, init) => {
      const call = { url: new URL(input), init, body: init.body ? JSON.parse(init.body) : null };
      calls.push(call);
      const custom = await resolve?.(call, calls);
      if (custom) return custom;
      if (call.url.pathname === '/auth/v1/user') return answer(user);
      if (call.url.pathname.endsWith('/community_admin_stepup_begin')) return answer({ ...BASE_CONTEXT,
        scope: call.body.p_scope, action: call.body.p_action, target_id: call.body.p_target_id,
        expected_version: call.body.p_expected_version, payload_digest: call.body.p_scope === 'action' ? 'a'.repeat(64) : null, ...context });
      if (call.url.pathname.endsWith('/community_admin_stepup_register')) return answer({ registered: true });
      if (call.url.pathname.endsWith('/community_admin_stepup_activate')) return answer({ active: true });
      if (call.url.pathname.endsWith('/community_admin_stepup_cancel')) return answer({ cancelled: true, already_used: false });
      if (call.url.pathname.endsWith('/community_admin_stepup_verify')) return answer({ verified: true,
        id: CHALLENGE, scope: 'admission', original_session_id: SESSION, expires_epoch: (NOW + 3_600_000) / 1000 });
      if (call.url.pathname.endsWith('/community_admin_stepup_status')) return answer({ enabled: true, admitted: false,
        original_session_id: SESSION, idle_expires_epoch: null, absolute_expires_epoch: null });
      if (call.url.href === 'https://api.resend.com/emails') return answer({ id: MAIL });
      throw new Error('Unapproved mock destination');
    },
  });
  return { handler, calls, logs };
}

test('production step-up is closed by default and on missing/invalid configuration before any network', async () => {
  const { handler, calls } = fixture();
  const invalid = [undefined, {}, { ...ENV, COMMUNITY_EMAIL_STEPUP_ENABLED: false },
    { ...ENV, COMMUNITY_EMAIL_STEPUP_ENABLED: 'false' }, { ...ENV, COMMUNITY_BACKEND_ENABLED: 'false' },
    { ...ENV, ADMIN_STEPUP_HMAC_KEY: '' }, { ...ENV, ADMIN_STEPUP_RESEND_KEY: '' },
    { ...ENV, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed_here' },
    { ...ENV, SUPABASE_PUBLISHABLE_KEY: 'eyJlegacyServiceRoleJWT' },
    { ...ENV, SUPABASE_URL: 'https://evil.example' }, { ...ENV, SUPABASE_URL: 'https://stepupfixture.supabase.co/redirect' },
    { ...ENV, COMMUNITY_ALLOWED_ORIGIN: '*' }, { ...ENV, ADMIN_STEPUP_HMAC_KEY: 'a'.repeat(31) },
    { ...ENV, ADMIN_STEPUP_HMAC_KEY: `${'a'.repeat(32)}\n` }, { ...ENV, ADMIN_STEPUP_HMAC_KEY: '!'.repeat(43) },
    { ...ENV, ADMIN_STEPUP_HMAC_KEY: 'a'.repeat(129) }, { ...ENV, ADMIN_STEPUP_RESEND_KEY: 'not-a-resend-key' }];
  for (const env of invalid) assert.equal((await handler(request(), env)).status, 503);
  assert.equal(calls.length, 0);
});

test('exact HTTP routes exclude register/activate/native Auth endpoints and unexpected methods/queries', async () => {
  const { handler, calls } = fixture();
  for (const route of ['register', 'activate', 'complete', 'otp', 'password', 'sign-in', 'begin/']) {
    assert.equal((await handler(request(route), ENV)).status, 404);
  }
  assert.equal((await handler(request('begin', { method: 'GET' }), ENV)).status, 405);
  assert.equal((await handler(request('status', { method: 'POST' }), ENV)).status, 405);
  assert.equal((await handler(request('begin?email=other@example.test'), ENV)).status, 400);
  assert.equal(calls.length, 0);
});

test('same-origin writes and cross-origin read guards apply before Auth or mail', async () => {
  const { handler, calls } = fixture();
  for (const headers of [{ Origin: 'null' }, { Origin: 'https://evil.example' }, { Origin: `${ORIGIN}/` },
    { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'none' },
    { 'Sec-Fetch-Mode': 'navigate' }, { 'Sec-Fetch-Dest': 'document' }]) {
    assert.equal((await handler(request('begin', { headers }), ENV)).status, 403);
  }
  for (const header of ['Origin', 'Sec-Fetch-Site']) {
    const req = request(); req.headers.delete(header);
    assert.equal((await handler(req, ENV)).status, 403);
  }
  assert.equal((await handler(request('status', { headers: { Origin: 'https://evil.example' } }), ENV)).status, 403);
  assert.equal(calls.length, 0);
});

test('browser cannot choose identity, email, session, digest, signature or code when beginning', async () => {
  for (const key of ['email', 'user_id', 'original_session_id', 'session_id', 'role', 'generation', 'salt', 'code',
    'otp_digest', 'payload_digest', 'binding_digest', 'signature', 'hmac_key', 'resend_key', 'access_token', '__proto__']) {
    const { handler, calls } = fixture();
    const result = await handler(request('begin', { raw: `{"scope":"admission","${key}":"evil"}` }), ENV);
    assert.equal(result.status, 400, key);
    assert.equal(calls.length, 0);
  }
});

test('input JSON, UTF8, content type and byte bounds are strict', async () => {
  for (const [opts, status] of [[{ raw: '{bad' }, 400], [{ raw: '[]' }, 400], [{ raw: 'null' }, 400],
    [{ raw: 'x'.repeat(100_001) }, 413], [{ headers: { 'Content-Type': 'text/plain' } }, 415],
    [{ headers: { 'Content-Encoding': 'gzip' } }, 415], [{ body: { scope: 'owner' } }, 400],
    [{ body: { scope: 'admission', payload: {} } }, 400]]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('begin', opts), ENV)).status, status);
    assert.equal(calls.length, 0);
  }
});

test('getUser is mandatory; forged/missing bearer and unverified/anonymous users cannot send codes', async () => {
  const missing = fixture();
  assert.equal((await missing.handler(request('begin', { token: null }), ENV)).status, 401);
  assert.equal(missing.calls.length, 0);
  for (const changed of [{ email_confirmed_at: null }, { is_anonymous: true }, { banned_until: '2999-01-01T00:00:00Z' },
    { email: 'bad\nrecipient@example.test' }]) {
    const { handler, calls } = fixture({ user: { ...USER_RECORD, ...changed } });
    assert.equal((await handler(request(), ENV)).status, 403);
    assert.equal(calls.length, 1);
  }
  const forged = fixture({ resolve: ({ url }) => url.pathname === '/auth/v1/user' ? answer({ message: TOKEN }, 401) : undefined });
  assert.equal((await forged.handler(request(), ENV)).status, 401);
  assert.equal(forged.calls.length, 1);
});

test('live DB owner/password/session authority refuses recovered/revoked/non-owner callers before mail', async () => {
  const { handler, calls } = fixture({ user: { ...USER_RECORD, user_metadata: { role: 'owner' } },
    resolve: ({ url }) => url.pathname.endsWith('_begin') ? answer({ code: 'PT403', message: 'password_or_owner_required' }, 403) : undefined });
  assert.equal((await handler(request(), ENV)).status, 403);
  assert.equal(calls.length, 2);
});

test('begin orchestrates pending→prepared→accepted mail→active with fixed same-JWT RPCs', async () => {
  const { handler, calls, logs } = fixture();
  const result = await handler(request(), ENV);
  assert.equal(result.status, 200);
  assert.deepEqual(calls.map(({ url }) => url.pathname), ['/auth/v1/user', '/rest/v1/rpc/community_admin_stepup_begin',
    '/rest/v1/rpc/community_admin_stepup_register', '/emails', '/rest/v1/rpc/community_admin_stepup_activate']);
  for (const call of calls.filter(({ url }) => url.hostname.endsWith('.supabase.co'))) {
    assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(call.init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(call.init.headers.Cookie, undefined);
  }
  for (const call of calls) {
    assert.equal(call.init.cache, undefined);
    assert.equal(call.init.redirect, 'manual');
    assert.deepEqual(call.init.cf, { cacheTtlByStatus: { '100-599': -1 } });
    assert.equal(call.init.headers['Cache-Control'], 'no-store, no-cache, max-age=0');
  }
  assert.deepEqual(await result.json(), { data: { id: CHALLENGE, scope: 'admission', expires_epoch: BASE_CONTEXT.expires_epoch } });
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(result.headers.get('Set-Cookie'), null);
  assert.equal(logs.length, 0);
});

test('HMAC canonical envelope binds project/generation/session/scope/digest/expiry with domain separation', async () => {
  const { handler, calls } = fixture();
  await handler(request(), ENV);
  const digest = hmac(['otp-v1', BASE_CONTEXT.project, '7', CHALLENGE, USER, SESSION, BASE_CONTEXT.salt, CODE]);
  const base = [BASE_CONTEXT.project, '7', CHALLENGE, USER, SESSION, 'admission', BASE_CONTEXT.binding_digest,
    String(BASE_CONTEXT.expires_epoch), BASE_CONTEXT.salt, digest];
  assert.deepEqual(calls[2].body, { p_challenge_id: CHALLENGE, p_otp_digest: digest, p_signature: hmac(['register-v1', ...base]) });
  assert.deepEqual(calls[4].body, { p_challenge_id: CHALLENGE, p_signature: hmac(['activate-v1', ...base]) });
  assert.notEqual(calls[2].body.p_signature, calls[4].body.p_signature);
  assert.ok(calls.every(({ init }) => !JSON.stringify(init).includes(ENV.ADMIN_STEPUP_HMAC_KEY)));
});

test('mail only uses verified Auth recipient, fixed sender, challenge idempotency and code purpose', async () => {
  const { handler, calls } = fixture();
  const result = await handler(request(), ENV);
  const mail = calls[3];
  assert.equal(mail.url.href, 'https://api.resend.com/emails');
  assert.deepEqual(mail.body.to, [USER_RECORD.email]);
  assert.equal(mail.body.from, 'noreply@thedexs.com');
  assert.equal(mail.init.headers['Idempotency-Key'], `dex-admin-stepup/${CHALLENGE}`);
  assert.equal(mail.init.headers.Authorization, `Bearer ${ENV.ADMIN_STEPUP_RESEND_KEY}`);
  assert.equal(mail.init.headers.apikey, undefined);
  assert.ok(mail.body.text.includes(CODE));
  assert.ok(!JSON.stringify(mail.body).includes(TOKEN));
  assert.deepEqual(Object.keys(mail.body).sort(), ['from', 'subject', 'text', 'to']);
  const publicText = await result.text();
  for (const value of [CODE, USER_RECORD.email, BASE_CONTEXT.salt, SESSION, MAIL, ENV.ADMIN_STEPUP_HMAC_KEY,
    ENV.ADMIN_STEPUP_RESEND_KEY, calls[2].body.p_otp_digest, calls[2].body.p_signature]) assert.ok(!publicText.includes(value));
});

test('mismatched/malformed challenge context cannot be signed or emailed', async () => {
  for (const context of [{ created: false }, { user_id: TARGET }, { email: 'other@example.test' }, { original_session_id: 'bad' },
    { project: 'otherproject' }, { generation: 7 }, { generation: '7\nforged' }, { scope: 'action' },
    { salt: 'A'.repeat(32) }, { binding_digest: 'not-a-digest' }, { expires_epoch: NOW / 1000 - 1 },
    { expires_epoch: NOW / 1000 + 1000 }]) {
    const { handler, calls } = fixture({ context });
    assert.equal((await handler(request(), ENV)).status, 503, JSON.stringify(context));
    assert.equal(calls.length, 2);
  }
});

test('action request normalizes only allowlisted payload fields and signs DB-owned digest', async () => {
  for (const [action, payload] of [['admin_edit_post', { title: 'Title', body: 'Body', reason: 'Correction' }],
    ['moderate_post', { action: 'hide', reason: 'Moderation' }],
    ['set_account_state', { state: 'suspended', reason: 'Abuse' }]]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('begin', { body: { scope: 'action', action, target_id: TARGET,
      expected_version: 3, payload } }), ENV)).status, 200);
    assert.deepEqual(calls[1].body, { p_scope: 'action', p_action: action, p_target_id: TARGET, p_expected_version: 3, p_payload: payload });
    assert.match(calls[3].body.text, new RegExp(`Action: ${action}`));
    assert.ok(calls[3].body.text.includes(TARGET));
    const operation = action === 'moderate_post' ? payload.action : action === 'set_account_state' ? 'suspend' : 'edit';
    assert.ok(calls[3].body.text.includes(`Operation: ${operation}`));
    assert.ok(!calls[3].body.text.includes(payload.reason));
    assert.equal(calls[2].body.p_signature, hmac(['register-v1', BASE_CONTEXT.project, '7', CHALLENGE, USER, SESSION,
      'action', BASE_CONTEXT.binding_digest, String(BASE_CONTEXT.expires_epoch), BASE_CONTEXT.salt, calls[2].body.p_otp_digest]));
  }
});

test('mail distinguishes every validated moderation and account restore operation without including content', async () => {
  for (const operation of ['hide', 'restore', 'pin', 'unpin', 'lock', 'unlock']) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('begin', { body: { scope: 'action', action: 'moderate_post', target_id: TARGET,
      expected_version: 2, payload: { action: operation, reason: 'private moderator notes' } } }), ENV)).status, 200);
    assert.ok(calls[3].body.text.includes(`Operation: ${operation}`));
    assert.ok(!calls[3].body.text.includes('private moderator notes'));
  }
  const { handler, calls } = fixture();
  assert.equal((await handler(request('begin', { body: { scope: 'action', action: 'set_account_state', target_id: TARGET,
    expected_version: 2, payload: { state: 'active', reason: 'private account notes' } } }), ENV)).status, 200);
  assert.ok(calls[3].body.text.includes('Operation: restore'));
  assert.ok(!calls[3].body.text.includes('private account notes'));
});

test('action scope rejects arbitrary actions, actor fields, invalid versions and payload changes', async () => {
  const base = { scope: 'action', action: 'moderate_post', target_id: TARGET, expected_version: 1,
    payload: { action: 'hide', reason: 'Review' } };
  for (const override of [{ action: 'delete_user' }, { expected_version: 0 }, { expected_version: '1' },
    { target_id: 'bad' }, { payload: { action: 'hide', reason: 'Review', actor: USER } },
    { payload: { action: 'delete', reason: 'Review' } }, { payload: { action: 'hide', reason: '' } }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('begin', { body: { ...base, ...override } }), ENV)).status, 400);
    assert.equal(calls.length, 0);
  }
});

test('DB throttling maps to a bounded Retry-After and never triggers registration/mail', async () => {
  const { handler, calls } = fixture({ context: { created: false, error: 'challenge_rate_limited', retry_after_seconds: 60 } });
  const response = await handler(request(), ENV);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal((await response.json()).error.retry_after_seconds, 60);
  assert.equal(calls.length, 2);
});

test('failed registration leaves pending state and never sends or activates', async () => {
  const { handler, calls } = fixture({ resolve: ({ url }) => url.pathname.endsWith('_register')
    ? answer({ registered: false, error: 'invalid_signature' }) : undefined });
  assert.equal((await handler(request(), ENV)).status, 503);
  assert.equal(calls.length, 3);
});

test('mail failure, uncertain send, missing ID and redirects never activate or retry', async () => {
  for (const mode of ['error', 'throw', 'missing-id', 'redirect']) {
    const { handler, calls, logs } = fixture({ resolve: ({ url }) => {
      if (url.hostname !== 'api.resend.com') return;
      if (mode === 'error') return answer({ message: `${CODE} ${ENV.ADMIN_STEPUP_RESEND_KEY}` }, 500);
      if (mode === 'throw') throw new Error(`${TOKEN} ${CODE} ${USER_RECORD.email}`);
      if (mode === 'missing-id') return answer({ id: 'invalid' });
      return new Response(null, { status: 307, headers: { Location: 'https://evil.example' } });
    } });
    const response = await handler(request(), ENV);
    assert.equal(response.status, 503, mode);
    assert.equal(calls.length, 4);
    assert.equal(calls.filter(({ url }) => url.hostname === 'api.resend.com').length, 1);
    const output = (await response.text()) + JSON.stringify(logs);
    for (const value of [TOKEN, CODE, USER_RECORD.email, ENV.ADMIN_STEPUP_HMAC_KEY, ENV.ADMIN_STEPUP_RESEND_KEY]) assert.ok(!output.includes(value));
  }
});

test('failed or uncertain activation never reports a usable challenge and is not retried', async () => {
  for (const mode of ['failure', 'throw']) {
    const { handler, calls } = fixture({ resolve: ({ url }) => {
      if (!url.pathname.endsWith('_activate')) return;
      if (mode === 'throw') throw new Error('unobserved commit');
      return answer({ active: false, error: 'challenge_expired' });
    } });
    const response = await handler(request(), ENV);
    assert.equal(response.status, 503);
    assert.equal(calls.length, 5);
    assert.ok(!(await response.text()).includes(CHALLENGE));
  }
});

test('unbiased six-digit generator rejects out-of-range draws and preserves leading zeroes', async () => {
  const draws = [0xffffffff, 12345];
  const { handler, calls } = fixture({ draw: () => draws.shift() });
  assert.equal((await handler(request(), ENV)).status, 200);
  assert.ok(calls[3].body.text.includes(CODE));
  assert.equal(draws.length, 0);
  const broken = fixture({ draw: () => 0xffffffff });
  assert.equal((await broken.handler(request(), ENV)).status, 503);
  assert.equal(broken.calls.length, 2);
});

test('verify only forwards challenge/code under original JWT; successful output strips session internals', async () => {
  const { handler, calls } = fixture();
  const response = await handler(request('verify', { body: { challenge_id: CHALLENGE, code: CODE } }), ENV);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.pathname, '/rest/v1/rpc/community_admin_stepup_verify');
  assert.deepEqual(calls[1].body, { p_challenge_id: CHALLENGE, p_code: CODE });
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(await response.json(), { data: { verified: true, id: CHALLENGE, scope: 'admission', expires_epoch: (NOW + 3_600_000) / 1000 } });
  assert.ok(calls.every(({ url }) => !['/auth/v1/otp', '/auth/v1/verify', '/auth/v1/logout'].includes(url.pathname)));
});

test('wrong-code/expired/consumed failure data preserves persistent attempt counts without pretending success', async () => {
  for (const error of ['challenge_unavailable', 'challenge_expired', 'challenge_not_active', 'attempts_exhausted', 'invalid_code', 'admission_expired']) {
    const { handler, calls } = fixture({ resolve: ({ url }) => url.pathname.endsWith('_verify')
      ? answer({ verified: false, error, attempts_remaining: 0, private_debug: TOKEN }) : undefined });
    const result = await handler(request('verify', { body: { challenge_id: CHALLENGE, code: CODE } }), ENV);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { data: { verified: false, error, attempts_remaining: 0 } });
    assert.equal(calls.length, 2);
  }
});

test('malformed verify payloads and forged verification successes fail closed', async () => {
  for (const body of [{ challenge_id: CHALLENGE, code: '12345' }, { challenge_id: CHALLENGE, code: 123456 },
    { challenge_id: CHALLENGE, code: CODE, original_token: TOKEN }, { challenge_id: 'bad', code: CODE }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('verify', { body }), ENV)).status, 400);
    assert.equal(calls.length, 0);
  }
  for (const data of [{ verified: true, id: TARGET }, { verified: false, error: TOKEN, attempts_remaining: 5 },
    { verified: false, error: 'invalid_code', attempts_remaining: 6 }]) {
    const { handler } = fixture({ resolve: ({ url }) => url.pathname.endsWith('_verify') ? answer(data) : undefined });
    assert.equal((await handler(request('verify', { body: { challenge_id: CHALLENGE, code: CODE } }), ENV)).status, 503);
  }
});

test('status only reports bounded capability data; no browser AAL assertion, writes, or implicit polling', async () => {
  const { handler, calls } = fixture();
  const result = await handler(request('status'), ENV);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { data: { enabled: true, admitted: false, idle_expires_epoch: null, absolute_expires_epoch: null } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.pathname, '/rest/v1/rpc/community_admin_stepup_status');
  assert.deepEqual(calls[1].body, {});
});

test('redirects and oversized upstream responses fail without onward requests or secret leakage', async () => {
  for (const mode of ['redirect', 'oversized']) {
    const { handler, calls } = fixture({ resolve: () => mode === 'redirect'
      ? new Response(null, { status: 302, headers: { Location: 'https://evil.example' } })
      : new Response('a'.repeat(65_537)) });
    assert.equal((await handler(request(), ENV)).status, 503);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'manual');
  }
});

test('network deadline aborts with fixed error, no retry or raw logging', async () => {
  let aborted = false;
  const { handler, calls, logs } = fixture({ timeoutMs: 10, resolve: ({ init }) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error(TOKEN)); }, { once: true });
  }) });
  const result = await handler(request(), ENV);
  assert.equal(result.status, 503); assert.equal(aborted, true); assert.equal(calls.length, 1);
  assert.ok(!(await result.text()).includes(TOKEN));
  assert.deepEqual(Object.keys(logs[0]).sort(), ['code', 'event', 'route', 'status']);
});

test('one total deadline covers all stages and a late accepted mail cannot start activation', async () => {
  let mailSignal;
  const { handler, calls } = fixture({ totalTimeoutMs: 25, timeoutMs: 200,
    resolve: async ({ url, init }) => {
      if (url.hostname !== 'api.resend.com') return;
      mailSignal = init.signal;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return answer({ id: MAIL }); // Deliberately ignores abort to simulate uncertain provider outcome.
    } });
  const result = await handler(request(), ENV);
  assert.equal(result.status, 503);
  assert.equal(mailSignal.aborted, true);
  await new Promise((resolve) => setTimeout(resolve, 65));
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url }) => !url.pathname.endsWith('_activate')));
});

test('incoming request cancellation aborts the active stage and never starts later stages', async () => {
  const controller = new AbortController();
  const { handler, calls } = fixture({ resolve: async ({ url, init }) => {
    if (url.pathname !== '/auth/v1/user') return;
    queueMicrotask(() => controller.abort());
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error(TOKEN)), { once: true }));
  } });
  const original = request();
  const req = new Request(original, { signal: controller.signal });
  assert.equal((await handler(req, ENV)).status, 503);
  assert.equal(calls.length, 1);
});

test('known-ID cancellation uses only the same original JWT and no mail/HMAC credentials or calls', async () => {
  const env = { ...ENV }; delete env.ADMIN_STEPUP_HMAC_KEY; delete env.ADMIN_STEPUP_RESEND_KEY;
  const { handler, calls } = fixture();
  const result = await handler(request('cancel', { body: { challenge_id: CHALLENGE } }), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { data: { cancelled: true, already_used: false } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.pathname, '/rest/v1/rpc/community_admin_stepup_cancel');
  assert.deepEqual(calls[1].body, { p_challenge_id: CHALLENGE });
  assert.ok(calls.every(({ init }) => init.headers.Authorization === `Bearer ${TOKEN}`));
  for (const route of ['begin', 'verify', 'status']) {
    assert.equal((await handler(request(route, { body: route === 'verify' ? { challenge_id: CHALLENGE, code: CODE } : undefined }), env)).status, 503);
  }
  assert.equal(calls.length, 2, 'Missing send/signing configuration must not issue or verify capabilities.');
});

test('cancellation preserves authoritative pending/prepared/active/verified-action outcomes', async () => {
  for (const state of ['pending', 'prepared', 'active', 'verified_action']) {
    const { handler, calls } = fixture({ resolve: ({ url }) => url.pathname.endsWith('_cancel')
      ? answer({ cancelled: true, already_used: false, private_state: state }) : undefined });
    const result = await handler(request('cancel', { body: { challenge_id: CHALLENGE } }), ENV);
    assert.deepEqual(await result.json(), { data: { cancelled: true, already_used: false } });
    assert.equal(calls.length, 2);
  }
});

test('cancel never claims to undo a committed action or completed admission', async () => {
  for (const completed of ['committed_action', 'completed_admission']) {
    const { handler } = fixture({ resolve: ({ url }) => url.pathname.endsWith('_cancel')
      ? answer({ cancelled: false, already_used: true, private_state: completed }) : undefined });
    const result = await handler(request('cancel', { body: { challenge_id: CHALLENGE } }), ENV);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { data: { cancelled: false, already_used: true } });
  }
});

test('wrong-user/session and unknown challenges return unavailable, never arbitrary grant revocation success', async () => {
  const { handler, calls } = fixture({ resolve: ({ url }) => url.pathname.endsWith('_cancel')
    ? answer({ cancelled: false, already_used: false, error: 'challenge_unavailable' }) : undefined });
  const result = await handler(request('cancel', { body: { challenge_id: TARGET } }), ENV);
  assert.deepEqual(await result.json(), { data: { cancelled: false, already_used: false, error: 'challenge_unavailable' } });
  assert.deepEqual(calls[1].body, { p_challenge_id: TARGET });
  const forbidden = fixture({ resolve: ({ url }) => url.pathname.endsWith('_cancel') ? answer({ code: 'PT403', message: 'not_password' }, 403) : undefined });
  assert.equal((await forbidden.handler(request('cancel', { body: { challenge_id: CHALLENGE } }), ENV)).status, 403);
});

test('cancel requires an exact known ID and cannot use cancel-latest, supplied session or mutation undo fields', async () => {
  for (const body of [{}, { challenge_id: 'latest' }, { challenge_id: CHALLENGE, session_id: SESSION },
    { challenge_id: CHALLENGE, user_id: USER }, { challenge_id: CHALLENGE, undo: true },
    { challenge_id: CHALLENGE, code: CODE }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('cancel', { body }), ENV)).status, 400);
    assert.equal(calls.length, 0);
  }
});

test('cancel remains available for safe DB-checked revocation after verified email or role changes', async () => {
  const { handler, calls } = fixture({ user: { ...USER_RECORD, email: 'new@example.test', email_confirmed_at: null,
    user_metadata: { role: 'member' } } });
  assert.equal((await handler(request('cancel', { body: { challenge_id: CHALLENGE } }), ENV)).status, 200);
  assert.equal(calls.length, 2);
  assert.equal((await handler(request('begin'), ENV)).status, 403);
});

test('cancel still fails closed on flag/origin/auth guards and malformed authoritative result', async () => {
  const { handler, calls } = fixture();
  const body = { challenge_id: CHALLENGE };
  assert.equal((await handler(request('cancel', { body }), { ...ENV, COMMUNITY_EMAIL_STEPUP_ENABLED: 'false' })).status, 503);
  assert.equal((await handler(request('cancel', { body, headers: { Origin: 'https://evil.example' } }), ENV)).status, 403);
  assert.equal((await handler(request('cancel', { body, token: null }), ENV)).status, 401);
  assert.equal(calls.length, 0);
  for (const value of [{ cancelled: true, already_used: true }, { cancelled: false, already_used: false, error: TOKEN },
    { cancelled: true, already_used: false, error: 'challenge_unavailable' },
    { cancelled: false, already_used: true, error: 'challenge_unavailable' }, {}]) {
    const broken = fixture({ resolve: ({ url }) => url.pathname.endsWith('_cancel') ? answer(value) : undefined });
    assert.equal((await broken.handler(request('cancel', { body }), ENV)).status, 503);
  }
});
