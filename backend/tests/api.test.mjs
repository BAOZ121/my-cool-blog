import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityHandler } from '../api/handler.mjs';
import { onRequest } from '../api/pages-template.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const POST = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://community.example.com';
const TOKEN = 'test-user-bearer-not-a-real-token';
const ENV = Object.freeze({
  COMMUNITY_BACKEND_ENABLED: 'true',
  COMMUNITY_ALLOWED_ORIGIN: ORIGIN,
  SUPABASE_URL: 'https://localtestfixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_not_a_real_key',
});
const AUTH_USER = { id: USER, role: 'authenticated', email: 'fixture@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false };
const MEMBER = { user_id: USER, email_verified: true, state: 'active', role: 'member',
  aal: 'aal1', version: 1, can_post: true, can_moderate: false };
const MODERATOR = { ...MEMBER, role: 'moderator', aal: 'aal2', can_moderate: true };
const OWNER = { ...MODERATOR, role: 'owner' };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

function request(path, { method = 'GET', body, raw, headers = {}, token = TOKEN, origin = ORIGIN } = {}) {
  const initial = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
  if (method !== 'GET') {
    initial.Origin ??= origin;
    initial['Sec-Fetch-Site'] ??= 'same-origin';
    initial['Sec-Fetch-Mode'] ??= 'cors';
    initial['Sec-Fetch-Dest'] ??= 'empty';
    initial['Content-Type'] ??= 'application/json';
  }
  return new Request(`${ORIGIN}${path}`, {
    method, headers: initial, ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
  });
}

function fixture({ user = AUTH_USER, session = MEMBER, resolve, timeoutMs = 500 } = {}) {
  const calls = [];
  const logs = [];
  const handler = createCommunityHandler({
    timeoutMs,
    logger: (value) => logs.push(value),
    fetch: async (input, init) => {
      const url = new URL(input);
      const call = { url, init, body: init.body ? JSON.parse(init.body) : null };
      calls.push(call);
      const custom = await resolve?.(call, calls.length);
      if (custom) return custom;
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname === '/rest/v1/rpc/community_me') return json(session);
      if (url.pathname === '/rest/v1/community_posts') return json([]);
      return json({ id: POST, version: 2 });
    },
  });
  return { handler, calls, logs };
}

test('disabled by default and all incomplete/unsafe configuration fail closed before any fetch', async () => {
  const { handler, calls } = fixture();
  const invalid = [
    {}, { ...ENV, COMMUNITY_BACKEND_ENABLED: true }, { ...ENV, COMMUNITY_BACKEND_ENABLED: 'TRUE' },
    { ...ENV, SUPABASE_URL: '' }, { ...ENV, SUPABASE_URL: 'http://localtestfixture.supabase.co' },
    { ...ENV, SUPABASE_URL: 'https://evil.example.com' },
    { ...ENV, SUPABASE_URL: 'https://localtestfixture.supabase.co/redirect' },
    { ...ENV, SUPABASE_URL: 'https://user:password@localtestfixture.supabase.co' },
    { ...ENV, SUPABASE_URL: 'https://localtestfixture.supabase.co/?token=secret' },
    { ...ENV, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_this_must_never_be_accepted' },
    { ...ENV, SUPABASE_PUBLISHABLE_KEY: 'eyJlegacyAnonOrServiceRole.invalid.signature' },
    { ...ENV, COMMUNITY_ALLOWED_ORIGIN: '*' }, { ...ENV, COMMUNITY_ALLOWED_ORIGIN: `${ORIGIN}/` },
    { ...ENV, COMMUNITY_ALLOWED_ORIGIN: 'http://community.example.com' },
  ];
  for (const env of invalid) {
    const result = await handler(request('/api/community/topics'), env);
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error.code, 'backend_disabled');
  }
  assert.equal(calls.length, 0);
  const adapter = await onRequest({ request: request('/api/admin/session'), env: {} });
  assert.equal(adapter.status, 503);
});

test('public reads use fixed anonymous PostgREST queries and never forward an admin token/cookie', async () => {
  const { handler, calls } = fixture();
  const result = await handler(request('/api/community/topics?limit=10&offset=20', {
    headers: { Cookie: 'session=do-not-forward' },
  }), ENV);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/rest/v1/community_posts');
  assert.equal(calls[0].url.searchParams.get('kind'), 'eq.topic');
  assert.equal(calls[0].url.searchParams.get('hidden'), 'eq.false');
  assert.equal(calls[0].url.searchParams.get('limit'), '10');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.equal(calls[0].init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.deepEqual((await result.json()).page, { limit: 10, offset: 20 });
});

test('all successes and errors are JSON no-store with no CORS or cookies', async () => {
  const { handler } = fixture();
  for (const env of [ENV, {}]) {
    const result = await handler(request('/api/community/topics'), env);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(result.headers.get('CDN-Cache-Control'), 'no-store');
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(result.headers.get('Access-Control-Allow-Credentials'), null);
    assert.equal(result.headers.get('Set-Cookie'), null);
    assert.equal(result.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
    assert.match(result.headers.get('Content-Type'), /^application\/json/);
  }
});

test('topic detail returns a bounded public topic and reply page', async () => {
  const { handler, calls } = fixture({ resolve: ({ url }) => {
    if (url.pathname !== '/rest/v1/community_posts') return;
    return json(url.searchParams.get('kind') === 'eq.topic'
      ? [{ id: POST, kind: 'topic', title: 'Topic' }] : [{ id: OTHER, kind: 'reply', topic_id: POST }]);
  } });
  const result = await handler(request(`/api/community/topics/${POST}?limit=5&offset=10`), ENV);
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.data.topic.id, POST);
  assert.equal(data.data.replies[0].topic_id, POST);
  assert.equal(calls[1].url.searchParams.get('topic_id'), `eq.${POST}`);
  assert.equal(calls[1].url.searchParams.get('limit'), '5');
});

test('missing/hidden topic returns not found without querying replies', async () => {
  const { handler, calls } = fixture();
  const result = await handler(request(`/api/community/topics/${POST}`), ENV);
  assert.equal(result.status, 404);
  assert.equal(calls.length, 1);
});

test('writes require exact same Origin and same-origin Fetch Metadata', async () => {
  const { handler, calls } = fixture();
  for (const headers of [
    { Origin: 'https://evil.example.com' }, { Origin: 'null' }, { Origin: `${ORIGIN}/` },
    { Origin: 'https://community.example.com.evil.test' }, { Origin: '' },
    { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' },
    { 'Sec-Fetch-Site': 'none' }, { 'Sec-Fetch-Site': '' },
    { 'Sec-Fetch-Mode': 'navigate' }, { 'Sec-Fetch-Dest': 'document' },
  ]) {
    const result = await handler(request('/api/community/messages', { method: 'POST', body: { body: 'test' }, headers }), ENV);
    assert.equal(result.status, 403, JSON.stringify(headers));
  }
  for (const header of ['Origin', 'Sec-Fetch-Site']) {
    const req = request('/api/community/messages', { method: 'POST', body: { body: 'test' } });
    req.headers.delete(header);
    assert.equal((await handler(req, ENV)).status, 403);
  }
  const wrongHost = new Request('https://other.example.com/api/community/messages', {
    method: 'POST', headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal((await handler(wrongHost, ENV)).status, 403);
  assert.equal(calls.length, 0);
});

test('read endpoints reject cross-origin browser reads and preflights', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request('/api/community/topics', { headers: { Origin: 'https://evil.test' } }), ENV)).status, 403);
  assert.equal((await handler(request('/api/admin/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), ENV)).status, 403);
  assert.equal((await handler(request('/api/community/topics', { method: 'OPTIONS' }), ENV)).status, 405);
  assert.equal(calls.length, 0);
});

test('method/path allowlist refuses credential collection, direct SQL, arbitrary RPC and deletions', async () => {
  const { handler, calls } = fixture();
  for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/callback', '/api/admin/delete',
    '/api/community/rpc/community_set_role', '/api/community/topics/', `/api/community/posts/${POST}/delete`]) {
    assert.equal((await handler(request(path), ENV)).status, 404);
  }
  assert.equal((await handler(request('/api/community/topics', { method: 'PUT', body: {} }), ENV)).status, 405);
  assert.equal((await handler(request(`/api/community/posts/${POST}`, { method: 'DELETE' }), ENV)).status, 405);
  assert.equal(calls.length, 0);
});

test('UUID and public pagination/query validation rejects injection before DB reads', async () => {
  const { handler, calls } = fixture();
  for (const path of [
    '/api/community/topics/not-a-uuid', '/api/community/topics/%32bad',
    '/api/community/topics?select=*', '/api/community/topics?hidden=true',
    '/api/community/topics?limit=0', '/api/community/topics?limit=51',
    '/api/community/topics?limit=1&limit=2', '/api/community/messages?offset=10001',
    '/api/community/topics?offset=-1', '/api/community/topics?limit=1.5',
    `/api/community/topics?${'x'.repeat(2048)}`,
  ]) assert.equal((await handler(request(path), ENV)).status, 400, path);
  assert.equal(calls.length, 0);
});

test('missing and malformed bearer do not authenticate', async () => {
  const { handler, calls } = fixture();
  for (const authorization of ['', 'Basic c2VjcmV0', 'Bearer x', `Bearer ${TOKEN},other`, 'Bearer sb_secret_abc\tbad']) {
    const result = await handler(request('/api/community/messages', {
      method: 'POST', body: { body: 'test' }, token: null, headers: { Authorization: authorization },
    }), ENV);
    assert.equal(result.status, 401);
  }
  assert.equal(calls.length, 0);
});

test('fake JWT owner claims cannot authenticate: network Auth verification must succeed', async () => {
  const fake = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoib3duZXIifQ.fake-signature';
  const { handler, calls } = fixture({ resolve: ({ url }) => {
    if (url.pathname === '/auth/v1/user') return json({ message: `JWT rejected: ${fake}` }, 401);
  } });
  const result = await handler(request('/api/admin/session', { token: fake }), ENV);
  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${fake}`);
  assert.ok(!(await result.text()).includes(fake));
});

test('verified Auth identity and live DB session are mandatory; unverified/anonymous/banned are forbidden', async () => {
  for (const override of [
    { email_confirmed_at: null }, { email_confirmed_at: 'not-a-date' }, { email: '' },
    { is_anonymous: true }, { banned_until: '2999-01-01T00:00:00Z' },
  ]) {
    const { handler, calls } = fixture({ user: { ...AUTH_USER, ...override } });
    const result = await handler(request('/api/community/messages', { method: 'POST', body: { body: 'test' } }), ENV);
    assert.equal(result.status, 403);
    assert.equal(calls.length, 1);
  }
  for (const user of [{ ...AUTH_USER, id: 'fake' }, { ...AUTH_USER, role: 'service_role' }, null]) {
    assert.equal((await fixture({ user }).handler(request('/api/admin/session'), ENV)).status, 401);
  }
});

test('inactive, mismatched, unverified and revoked live sessions cannot mutate', async () => {
  for (const override of [
    { state: 'suspended' }, { user_id: OTHER }, { can_post: false }, { email_verified: false },
  ]) {
    const { handler, calls } = fixture({ session: { ...MEMBER, ...override } });
    const result = await handler(request('/api/community/messages', { method: 'POST', body: { body: 'test' } }), ENV);
    assert.equal(result.status, 403);
    assert.equal(calls.length, 2);
  }
  const { handler, calls } = fixture({ resolve: ({ url }) => {
    if (url.pathname.endsWith('/community_me')) return json({ code: 'PT401', details: 'private session deleted' }, 401);
  } });
  assert.equal((await handler(request('/api/community/messages', { method: 'POST', body: { body: 'test' } }), ENV)).status, 401);
  assert.equal(calls.length, 2);
});

test('user-editable metadata cannot elevate role or replace database MFA', async () => {
  for (const session of [MEMBER, { ...MODERATOR, aal: 'aal1' }, { ...MODERATOR, can_moderate: false },
    { ...MODERATOR, role: 'administrator' }, { ...MODERATOR, state: 'suspended' }]) {
    const { handler, calls } = fixture({ session,
      user: { ...AUTH_USER, user_metadata: { role: 'owner', aal: 'aal2', is_admin: true } } });
    assert.equal((await handler(request('/api/admin/session'), ENV)).status, 403);
    assert.equal(calls.length, 2);
  }
});

test('member writes carry exact caller token to independent DB authority and never actor/role fields', async () => {
  const { handler, calls } = fixture();
  const result = await handler(request('/api/community/topics', {
    method: 'POST', body: { title: '  New topic  ', body: '  Plain text body  ' },
  }), ENV);
  assert.equal(result.status, 201);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.pathname, '/auth/v1/user');
  assert.equal(calls[1].url.pathname, '/rest/v1/rpc/community_me');
  assert.equal(calls[2].url.pathname, '/rest/v1/rpc/community_create_post');
  assert.deepEqual(calls[2].body, { p_kind: 'topic', p_title: 'New topic', p_body: 'Plain text body', p_topic_id: null });
  for (const call of calls) assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
});

test('reply/topic/message creation dispatches the narrow SQL contract', async () => {
  for (const [path, kind, topic] of [[`/api/community/topics/${POST}/replies`, 'reply', POST],
    ['/api/community/messages', 'message', null]]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request(path, { method: 'POST', body: { body: 'text' } }), ENV)).status, 201);
    assert.deepEqual(calls.at(-1).body, { p_kind: kind, p_title: '', p_body: 'text', p_topic_id: topic });
  }
});

test('forbidden payload fields never reach mutation RPCs', async () => {
  for (const field of ['author_id', 'user_id', 'role', 'actor', 'hidden', 'pinned', 'locked', 'version', 'is_admin', '__proto__']) {
    const { handler, calls } = fixture();
    const raw = `{"body":"text","${field}":"bad"}`;
    const result = await handler(request('/api/community/messages', { method: 'POST', raw }), ENV);
    assert.equal(result.status, 400, field);
    assert.equal(calls.length, 2);
  }
});

test('bounded JSON content-type, size, encoding, shape and lengths are enforced', async () => {
  const cases = [
    [{ raw: '{broken' }, 400], [{ raw: '[]' }, 400], [{ raw: 'null' }, 400],
    [{ body: {} }, 400], [{ body: { body: 42 } }, 400], [{ body: { body: '   ' } }, 400],
    [{ body: { body: 'a\u0000b' } }, 400], [{ body: { body: 'a'.repeat(5001) } }, 400],
    [{ body: { body: 'text' }, headers: { 'Content-Type': 'text/plain' } }, 415],
    [{ body: { body: 'text' }, headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }, 415],
    [{ body: { body: 'text' }, headers: { 'Content-Encoding': 'gzip' } }, 415],
    [{ raw: 'a'.repeat(100_001) }, 413],
    [{ body: { body: 'text' }, headers: { 'Content-Length': '100001' } }, 413],
  ];
  for (const [options, expected] of cases) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request('/api/community/messages', { method: 'POST', ...options }), ENV)).status, expected);
    assert.equal(calls.length, 2);
  }
  const { handler } = fixture();
  assert.equal((await handler(request('/api/community/topics', {
    method: 'POST', body: { title: '😀'.repeat(160), body: 'a'.repeat(20_000) },
  }), ENV)).status, 201);
  assert.equal((await handler(request('/api/community/topics', {
    method: 'POST', body: { title: '😀'.repeat(161), body: 'a' },
  }), ENV)).status, 400);
});

test('self edit requires expected integer version and never chooses an admin RPC', async () => {
  for (const bad of [0, -1, '1', 1.5, 2_147_483_648, null]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request(`/api/community/posts/${POST}`, {
      method: 'PATCH', body: { title: '', body: 'edit', expected_version: bad },
    }), ENV)).status, 400);
    assert.equal(calls.length, 2);
  }
  const { handler, calls } = fixture({ session: OWNER });
  assert.equal((await handler(request(`/api/community/posts/${POST}`, {
    method: 'PATCH', body: { title: '', body: 'edit', expected_version: 1 },
  }), ENV)).status, 200);
  assert.equal(calls.at(-1).url.pathname, '/rest/v1/rpc/community_edit_post');
  assert.deepEqual(calls.at(-1).body, { p_post_id: POST, p_expected_version: 1, p_title: '', p_body: 'edit' });
});

test('version conflicts, rate limits and SQL permission failures use sanitized fixed errors', async () => {
  for (const [code, status, expected] of [['PT409', 409, 'version_conflict'], ['PT429', 429, 'rate_limited'],
    ['PT403', 403, 'forbidden'], ['PT404', 404, 'not_found'], ['PT422', 422, 'invalid_request'],
    ['42501', 403, 'forbidden']]) {
    const { handler, logs } = fixture({ resolve: ({ url }) => {
      if (url.pathname.endsWith('/community_edit_post')) return json({ code, message: `secret ${TOKEN}`, details: 'auth.sessions', hint: 'private' }, status);
    } });
    const result = await handler(request(`/api/community/posts/${POST}`, {
      method: 'PATCH', body: { title: '', body: 'edit', expected_version: 1 },
    }), ENV);
    assert.equal(result.status, code === 'PT422' ? 400 : status);
    assert.equal((await result.json()).error.code, expected);
    assert.ok(!JSON.stringify(logs).includes(TOKEN));
    assert.ok(!JSON.stringify(logs).includes('auth.sessions'));
  }
});

test('admin edits require reason, version and fresh admin preflight', async () => {
  const { handler, calls } = fixture({ session: MODERATOR });
  assert.equal((await handler(request(`/api/admin/posts/${POST}/edit`, {
    method: 'POST', body: { title: 'Title', body: 'Edited body', expected_version: 3, reason: 'Correction' },
  }), ENV)).status, 200);
  assert.equal(calls.at(-1).url.pathname, '/rest/v1/rpc/community_admin_edit_post');
  assert.deepEqual(calls.at(-1).body, {
    p_post_id: POST, p_expected_version: 3, p_title: 'Title', p_body: 'Edited body', p_reason: 'Correction',
  });
  const missing = fixture({ session: MODERATOR });
  assert.equal((await missing.handler(request(`/api/admin/posts/${POST}/edit`, {
    method: 'POST', body: { title: '', body: 'edit', expected_version: 3 },
  }), ENV)).status, 400);
  assert.equal(missing.calls.length, 2);
});

test('every moderation action uses versioned authoritative RPC with a nonempty bounded reason', async () => {
  for (const action of ['hide', 'restore', 'pin', 'unpin', 'lock', 'unlock']) {
    const { handler, calls } = fixture({ session: MODERATOR });
    assert.equal((await handler(request(`/api/admin/posts/${POST}/${action}`, {
      method: 'POST', body: { expected_version: 2, reason: 'Test moderation' },
    }), ENV)).status, 200);
    assert.deepEqual(calls.at(-1).body, { p_expected_version: 2, p_reason: 'Test moderation', p_post_id: POST, p_action: action });
  }
  for (const reason of ['', ' '.repeat(20), 'x'.repeat(501)]) {
    const { handler, calls } = fixture({ session: MODERATOR });
    assert.equal((await handler(request(`/api/admin/posts/${POST}/hide`, {
      method: 'POST', body: { expected_version: 2, reason },
    }), ENV)).status, 400);
    assert.equal(calls.length, 2);
  }
});

test('live role revocation between API preflight and mutation is enforced by RPC', async () => {
  const { handler, calls } = fixture({ session: OWNER, resolve: ({ url }) => {
    if (url.pathname.endsWith('/community_moderate_post')) return json({ code: 'PT403', message: 'role revoked' }, 403);
  } });
  assert.equal((await handler(request(`/api/admin/posts/${POST}/hide`, {
    method: 'POST', body: { expected_version: 2, reason: 'Review' },
  }), ENV)).status, 403);
  assert.equal(calls.length, 3);
});

test('suspension and restore are owner-only app-account actions; never Auth Admin calls', async () => {
  const moderator = fixture({ session: MODERATOR });
  assert.equal((await moderator.handler(request(`/api/admin/users/${OTHER}/suspend`, {
    method: 'POST', body: { expected_version: 1, reason: 'Abuse' },
  }), ENV)).status, 403);
  assert.equal(moderator.calls.length, 2);
  for (const [action, state] of [['suspend', 'suspended'], ['restore', 'active']]) {
    const { handler, calls } = fixture({ session: OWNER });
    assert.equal((await handler(request(`/api/admin/users/${OTHER}/${action}`, {
      method: 'POST', body: { expected_version: 1, reason: 'Account review' },
    }), ENV)).status, 200);
    assert.equal(calls.at(-1).url.pathname, '/rest/v1/rpc/community_set_account_state');
    assert.deepEqual(calls.at(-1).body, { p_expected_version: 1, p_reason: 'Account review', p_user_id: OTHER, p_state: state });
    assert.ok(calls.every(({ url }) => !url.pathname.includes('/auth/v1/admin')));
  }
});

test('admin session, posts, users, audit and history dispatch constrained read RPCs', async () => {
  for (const [path, rpc] of [
    ['/api/admin/session', 'me'], ['/api/admin/posts?kind=message&include_hidden=false&limit=5', 'admin_list'],
    ['/api/admin/users?search=Alice', 'admin_accounts'], ['/api/admin/audit?limit=5', 'admin_audit'],
    [`/api/admin/posts/${POST}/history`, 'post_history'],
  ]) {
    const { handler, calls } = fixture({ session: OWNER });
    assert.equal((await handler(request(path), ENV)).status, 200);
    assert.equal(calls.at(-1).url.pathname, `/rest/v1/rpc/community_${rpc}`);
  }
  for (const path of ['/api/admin/users', '/api/admin/audit']) {
    assert.equal((await fixture({ session: MODERATOR }).handler(request(path), ENV)).status, 403);
  }
});

test('unknown admin query, unsupported kind and duplicate paging never reach read RPC', async () => {
  for (const path of ['/api/admin/posts?kind=evil', '/api/admin/posts?include_hidden=1',
    '/api/admin/posts?search=x&search=y', '/api/admin/users?select=email', '/api/admin/audit?limit=51',
    '/api/admin/session?role=owner', `/api/admin/posts/${POST}/history?select=*`]) {
    const { handler, calls } = fixture({ session: OWNER });
    assert.equal((await handler(request(path), ENV)).status, 400);
    assert.equal(calls.length, 2);
  }
});

test('upstream error text and thrown errors never leak to response or logs; no automatic mutation retry', async () => {
  for (const throwing of [false, true]) {
    const { handler, calls, logs } = fixture({ resolve: ({ url }) => {
      if (!url.pathname.endsWith('/community_create_post')) return;
      if (throwing) throw new Error(`request failed ${TOKEN} ${ENV.SUPABASE_PUBLISHABLE_KEY}`);
      return json({ code: 'XX000', message: TOKEN, details: ENV.SUPABASE_PUBLISHABLE_KEY, hint: 'private SQL' }, 500);
    } });
    const result = await handler(request('/api/community/messages', { method: 'POST', body: { body: 'test' } }), ENV);
    assert.equal(result.status, 503);
    const combined = (await result.text()) + JSON.stringify(logs);
    assert.ok(!combined.includes(TOKEN));
    assert.ok(!combined.includes(ENV.SUPABASE_PUBLISHABLE_KEY));
    assert.ok(!combined.includes('private SQL'));
    assert.equal(calls.length, 3);
    assert.deepEqual(Object.keys(logs[0]).sort(), ['code', 'event', 'route', 'status']);
  }
});

test('invalid or oversized upstream JSON fails closed', async () => {
  for (const payload of ['<html>private failure</html>', 'x'.repeat(8_000_001)]) {
    const { handler } = fixture({ resolve: () => new Response(payload) });
    const result = await handler(request('/api/community/topics'), ENV);
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes('private failure'));
  }
  const { handler } = fixture({ resolve: () => json({ unexpected: 'object' }) });
  assert.equal((await handler(request('/api/community/topics'), ENV)).status, 502);
});

test('upstream fetch timeout aborts and gives a sanitized unavailable error', async () => {
  let aborted = false;
  let count = 0;
  const handler = createCommunityHandler({ timeoutMs: 10, fetch: async (_url, options) => {
    count += 1;
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
      aborted = true;
      reject(new Error(`abort with token ${TOKEN}`));
    }, { once: true }));
  } });
  const result = await handler(request('/api/community/topics'), ENV);
  assert.equal(result.status, 503);
  assert.equal(aborted, true);
  assert.equal(count, 1);
  assert.ok(!(await result.text()).includes(TOKEN));
});

test('request streaming byte bound cancels excessive input without a mutation', async () => {
  const { handler, calls } = fixture();
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(100_001)); },
    cancel() { cancelled = true; },
  });
  const req = new Request(`${ORIGIN}/api/community/messages`, {
    method: 'POST', duplex: 'half', body,
    headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
  });
  assert.equal((await handler(req, ENV)).status, 413);
  assert.equal(calls.length, 2);
  assert.equal(cancelled, true);
});

test('maximal escaped-text pages fit upstream bounds for posts, history and metadata audit', async () => {
  // U+0001 is valid stored text but occupies six bytes per character in JSON.
  const record = { id: POST, title: '😀'.repeat(160), body: '\u0001'.repeat(20_000),
    author_id: USER, kind: 'topic', version: 1, hidden: false };
  for (const [path, rows] of [
    ['/api/community/topics?limit=50', Array(50).fill(record)],
    [`/api/admin/posts/${POST}/history?limit=50&offset=25`, Array(50).fill({ snapshot: record })],
    ['/api/admin/audit?limit=50', Array(50).fill({ id: POST, actor_id: USER, action: 'edit', entity_id: POST, reason: '😀'.repeat(500) })],
  ]) {
    const { handler, calls } = fixture({ session: OWNER, resolve: ({ url }) => {
      if (url.pathname === '/rest/v1/community_posts' || url.pathname.endsWith('/community_post_history')
        || url.pathname.endsWith('/community_admin_audit')) return json(rows);
    } });
    const result = await handler(request(path), ENV);
    assert.equal(result.status, 200, path);
    assert.equal((await result.json()).data.length, rows.length);
    if (path.includes('/history')) assert.deepEqual(calls.at(-1).body, { p_post_id: POST, p_limit: 50, p_offset: 25 });
  }
  const { handler, calls } = fixture({ session: OWNER });
  assert.equal((await handler(request('/api/admin/audit?limit=51'), ENV)).status, 400);
  assert.equal(calls.length, 2);
});

test('stalled request bodies and stalled upstream bodies time out and cancel', async () => {
  let requestCancelled = false;
  const fixture1 = fixture({ timeoutMs: 15 });
  const req = new Request(`${ORIGIN}/api/community/messages`, {
    method: 'POST', duplex: 'half',
    body: new ReadableStream({ cancel() { requestCancelled = true; } }),
    headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
  });
  assert.equal((await fixture1.handler(req, ENV)).status, 503);
  assert.equal(requestCancelled, true);
  assert.equal(fixture1.calls.length, 2);
  let upstreamCancelled = false;
  const fixture2 = fixture({ timeoutMs: 15, resolve: () => new Response(new ReadableStream({
    cancel() { upstreamCancelled = true; },
  })) });
  assert.equal((await fixture2.handler(request('/api/community/topics'), ENV)).status, 503);
  assert.equal(upstreamCancelled, true);
});

test('invalid UTF-8 request JSON is refused before mutation', async () => {
  const { handler, calls } = fixture();
  const req = new Request(`${ORIGIN}/api/community/messages`, {
    method: 'POST', body: new Uint8Array([0xff]),
    headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
  });
  assert.equal((await handler(req, ENV)).status, 400);
  assert.equal(calls.length, 2);
});
