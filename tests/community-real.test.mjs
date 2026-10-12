import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setupCommunityUI, safeUiError } from '../assets/js/community-ui.mjs';
import { validateCommunityConfig, communityCsp, communityHeaders, COMMUNITY_PATHS } from '../assets/js/community-config.mjs';
import { createCommunityClient } from '../backend/client/community-client.mjs';
import { createDom } from './helpers/community-dom.mjs';
const config = { enabled: true, googleEnabled: false, allowedOrigin: 'https://community.test', supabaseUrl: 'https://test-project.supabase.co', publishableKey: 'sb_publishable_' + 'x'.repeat(24) };
const uid = '11111111-1111-4111-8111-111111111111', postId = '22222222-2222-4222-8222-222222222222', factorId = '33333333-3333-4333-8333-333333333333';
const post = { id: postId, kind: 'topic', title: '<img src=x onerror=alert(1)>', body: 'A synthetic discussion body.', author_id: uid, version: 3, hidden: false, pinned: false, locked: false, created_at: '2026-10-12T00:00:00Z' };
const admin = role => ({ status: role ? 'available' : 'mfa_required', role: role || null, canModerate: !!role, canManageUsers: role === 'owner', canReadAudit: role === 'owner' });
const state = role => ({ status: role === null ? 'signed_out' : 'signed_in', busy: false, user: role === null ? null : { id: uid, email: 'synthetic@example.test', emailVerified: true }, mfa: { currentLevel: role ? 'aal2' : 'aal1', nextLevel: role ? 'aal2' : 'aal1', required: false, factors: [{ id: factorId, type: 'totp' }] }, admin: admin(role), error: null, recovery: null });
const flush = async () => { for (let n = 0; n < 12; n++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { resolve, reject, promise }; };
function mockAuth(initial = state(null), overrides = {}) {
  let current = structuredClone(initial); const listeners = new Set(), calls = [];
  const mock = { calls, getState: () => structuredClone(current), emit(next) { current = structuredClone(next); for (const listener of listeners) listener(mock.getState()); }, subscribe(listener) { listeners.add(listener); listener(mock.getState()); return () => listeners.delete(listener); },
    async initialize() { calls.push(['initialize']); return mock.getState(); }, async refresh() { calls.push(['refresh']); return mock.getState(); },
    async signIn(args) { calls.push(['signIn', args]); mock.emit(state('')); }, async signUp(args) { calls.push(['signUp', args]); mock.emit({ ...state(null), status: 'verification_required' }); },
    async requestPasswordReset(args) { calls.push(['requestPasswordReset', args]); mock.emit({ ...state(null), status: 'reset_email_sent' }); },
    async signInWithGoogle() { calls.push(['google']); return { url: 'https://test-project.supabase.co/auth/v1/authorize?provider=google' }; },
    async signOut() { calls.push(['signOut']); mock.emit(state(null)); }, dispose() { calls.push(['dispose']); },
    async challengeMfa(id) { calls.push(['challengeMfa', id]); return { factorId: id, challengeId: factorId, expiresAt: Date.now() + 100000 }; },
    async enrollMfa() { calls.push(['enrollMfa']); return { factorId, secret: 'SYNTHETICSETUPKEY', qrCode: '<svg onload=bad()></svg>' }; },
    async verifyMfa(args) { calls.push(['verifyMfa', args]); }, async handleCallback(url) { calls.push(['handleCallback', url]); mock.emit({ ...state(''), status: 'recovery_ready', recovery: { expiresAt: Date.now() + 100000 } }); },
    async completePasswordReset(args) { calls.push(['completePasswordReset', args]); mock.emit({ ...state(null), status: 'password_updated' }); return { passwordChanged: true, signOutConfirmed: true }; }, ...overrides };
  return mock;
}
async function fixture({ mode = 'forum', role = null, auth: provided, respond, extraConfig = {}, callbackUrl } = {}) {
  const dom = createDom(mode), auth = provided || mockAuth(state(role)), calls = [];
  const api = { async request(path, options = {}) {
    calls.push({ path, options }); if (respond) { const value = await respond(path, options); if (value !== undefined) return value; }
    if (options.method === 'POST') return { data: post };
    if (path.includes('/history')) return { data: [{ version: 3, actor_id: uid, action: 'edit', reason: 'Synthetic reason', snapshot: post }] };
    if (path.startsWith('/api/admin/users')) return { data: [{ user_id: uid, role: 'member', state: 'active', version: 2 }] };
    if (path.startsWith('/api/admin/')) return { data: [post] };
    if (path.startsWith(`/api/community/topics/${postId}`)) return { data: { topic: post, replies: [] } };
    return { data: path.includes('/topics') ? [post] : [] };
  } };
  const ui = setupCommunityUI({ ...dom, auth, api, config: { ...config, ...extraConfig }, callbackUrl });
  await ui.ready; await flush(); return { ...dom, auth, api, calls, ui };
}

test('real mode fails closed and accepts only exact public project config', () => {
  assert.deepEqual(validateCommunityConfig({}), { enabled: false, googleEnabled: false });
  assert.equal(validateCommunityConfig(config, config.allowedOrigin).enabled, true);
  for (const change of [{ publishableKey: 'sb_secret_hidden' }, { supabaseUrl: 'https://test-project.supabase.co.evil.test' }, { allowedOrigin: 'http://community.test' }, { supabaseUrl: 'https://test-project.supabase.co/' }]) assert.throws(() => validateCommunityConfig({ ...config, ...change }));
  assert.throws(() => validateCommunityConfig(config, 'https://other.test'));
  assert.equal(validateCommunityConfig({ ...config, googleEnabled: 'true' }).googleEnabled, false);
});
test('strict CSP and exact test-path response headers contain no wildcard network/script permissions', () => {
  const policy = communityCsp(config); assert.match(policy, /connect-src 'self' https:\/\/test-project\.supabase\.co;/); assert.match(policy, /form-action 'none'/); assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https:;|\*|fonts\.google/);
  const headers = communityHeaders(config); for (const path of Object.values(COMMUNITY_PATHS)) assert.ok(headers.includes(path + '*\n'));
  assert.match(headers, /frame-ancestors 'none'/); assert.match(headers, /Cache-Control: no-store/);
  assert.doesNotMatch(communityHeaders({ enabled: false }), /supabase/);
});
test('disabled build ships no real keys, real credential inputs, or SDK entry', () => {
  const saved = JSON.parse(readFileSync(new URL('../data/community.json', import.meta.url))); assert.equal(typeof saved.enabled, 'boolean'); validateCommunityConfig(saved); if (!saved.enabled) assert.equal(saved.publishableKey, '');
  const configSource = readFileSync(new URL('../layouts/_partials/community/config.html', import.meta.url), 'utf8'); assert.match(configSource, /errorf/);
  const entry = readFileSync(new URL('../assets/js/community-entry.mjs', import.meta.url), 'utf8'); assert.ok(entry.indexOf('history.replaceState') < entry.indexOf('const config ='));
});
test('disabled callback scrubs URL even when credentials cannot be collected', () => {
  const script = readFileSync(new URL('../assets/js/community-theme-init.js', import.meta.url), 'utf8'), paths = [];
  vm.runInNewContext(script, { document: { currentScript: { dataset: { disabledCallback: 'true' } }, documentElement: { dataset: {} } }, history: { replaceState: (...args) => paths.push(args) }, location: { pathname: COMMUNITY_PATHS.recovery }, localStorage: { getItem: () => 'light' }, matchMedia: () => ({ matches: false }) });
  assert.deepEqual([...paths[0]], [null, '', COMMUNITY_PATHS.recovery]);
});
test('UI uses plain text and credential forms cannot fall back to GET', () => {
  const source = readFileSync(new URL('../assets/js/community-ui.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|localStorage|console\./);
  for (const file of ['auth', 'forum', 'admin']) { const html = readFileSync(new URL(`../layouts/_partials/community/${file}.html`, import.meta.url), 'utf8'); for (const match of html.matchAll(/<form\b[^>]*>/g)) assert.match(match[0], /method="post"/); }
  assert.equal(safeUiError({ message: '<script>raw upstream</script>' }), 'The request could not be completed. Please try again.');
});
test('visitor rendering is text-only and posting opens sign-in; Google stays disabled', async () => {
  const f = await fixture(); assert.match(f.$('rc-topics').textContent, /<img src=x/); assert.equal(f.$('rc-topics').querySelector('img'), null);
  f.$('rc-new-topic').click(); assert.equal(f.$('rc-auth').open, true); assert.equal(f.$('rc-google').disabled, true); f.$('rc-google').click(); assert.equal(f.auth.calls.some(call => call[0] === 'google'), false); f.ui.dispose();
});
test('sign-in captures exact synthetic credentials before fieldset disables and clears password', async () => {
  const f = await fixture(); f.$('rc-new-topic').click(); f.fill('rc-auth-form', { email: 'only-fixture@example.test', password: 'synthetic-pass' }); f.submit('rc-auth-form'); await flush();
  assert.deepEqual(f.auth.calls.find(call => call[0] === 'signIn')[1], { email: 'only-fixture@example.test', password: 'synthetic-pass' }); assert.equal(f.$('rc-password').value, ''); assert.equal(f.$('rc-auth').open, false); f.ui.dispose();
});
test('signup checks password match and sends only supported fields with generic verification guidance', async () => {
  const f = await fixture(); f.document.querySelector('[data-auth-open="signup"]').click(); f.fill('rc-auth-form', { email: 'fixture@example.test', password: 'synthetic-long-password', confirm: 'different' }); f.submit('rc-auth-form'); await flush(); assert.equal(f.auth.calls.some(call => call[0] === 'signUp'), false);
  f.fill('rc-auth-form', { email: 'fixture@example.test', password: 'synthetic-long-password', confirm: 'synthetic-long-password' }); f.submit('rc-auth-form'); await flush(); assert.deepEqual(f.auth.calls.find(call => call[0] === 'signUp')[1], { email: 'fixture@example.test', password: 'synthetic-long-password' }); assert.match(f.$('rc-auth-result').textContent, /same browser tab/); f.ui.dispose();
});
test('reset request captures email and gives enumeration-resistant same-tab instructions', async () => {
  const f = await fixture(); f.document.querySelector('[data-auth-view="reset"]').click(); f.fill('rc-auth-form', { email: 'fixture@example.test' }); f.submit('rc-auth-form'); await flush();
  assert.deepEqual(f.auth.calls.find(call => call[0] === 'requestPasswordReset')[1], { email: 'fixture@example.test' }); assert.match(f.$('rc-auth-result').textContent, /If the account is eligible/); f.ui.dispose();
});
test('repeated submit cannot duplicate a pending sign-in and dismissal cancels hidden completion', async () => {
  const pending = deferred(), auth = mockAuth(); auth.signIn = async args => { auth.calls.push(['signIn', args]); auth.emit({ ...state(null), status: 'signing_in', busy: true }); await pending.promise; };
  const f = await fixture({ auth }); f.$('rc-new-topic').click(); f.fill('rc-auth-form', { email: 'fixture@example.test', password: 'synthetic' }); f.submit('rc-auth-form'); f.submit('rc-auth-form'); assert.equal(auth.calls.filter(call => call[0] === 'signIn').length, 1);
  f.$('rc-auth').close(); await flush(); assert.equal(auth.calls.some(call => call[0] === 'signOut'), true); pending.resolve(); await flush(); f.ui.dispose();
});
test('member posts exact topic/message/reply data and disabled forms never submit as guests', async () => {
  const f = await fixture({ role: '' }); f.fill('rc-topic-form', { title: 'Synthetic title', body: 'Synthetic body' }); f.submit('rc-topic-form'); await flush();
  assert.deepEqual(f.calls.find(call => call.path === '/api/community/topics' && call.options.method === 'POST').options.body, { title: 'Synthetic title', body: 'Synthetic body' });
  f.fill('rc-board-form', { body: 'Synthetic board message' }); f.submit('rc-board-form'); await flush(); assert.deepEqual(f.calls.find(call => call.path === '/api/community/messages' && call.options.method === 'POST').options.body, { body: 'Synthetic board message' });
  f.$('rc-topics').querySelector('button').click(); await flush(); f.fill('rc-reply-form', { body: 'Synthetic reply' }); f.submit('rc-reply-form'); await flush(); assert.deepEqual(f.calls.find(call => call.path.endsWith('/replies')).options.body, { body: 'Synthetic reply' });
  f.auth.emit(state(null)); const count = f.calls.length; f.submit('rc-board-form'); await flush(); assert.equal(f.calls.length, count); f.ui.dispose();
});
test('closing a thread fences a late response and clears its content', async () => {
  const pending = deferred(); const f = await fixture({ respond: path => path.startsWith(`/api/community/topics/${postId}`) ? pending.promise : undefined });
  f.$('rc-topics').querySelector('button').click(); f.$('rc-thread').close(); await flush(); pending.resolve({ data: { topic: post, replies: [] } }); await flush(); assert.equal(f.$('rc-thread').open, false); assert.equal(f.$('rc-thread-content').textContent, ''); f.ui.dispose();
});
test('admin list crosses actual transport with include_hidden and encoded search', async () => {
  const requests = []; const client = createCommunityClient({ enabled: true, origin: config.allowedOrigin, tokenProvider: async () => 'synthetic-only-token', fetchImpl: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ data: [] }), { status: 200 }); } });
  const f = await fixture({ mode: 'admin', role: 'owner', respond: (path, options) => client.request(path, options) }); assert.ok(requests.some(row => row.url.includes('include_hidden=true')));
  f.$('rc-admin-search').value = 'A sentence. * with spaces'; f.submit('rc-admin-filter'); await flush(); const url = new URL(requests.at(-1).url); assert.equal(url.searchParams.get('search'), 'A sentence. * with spaces'); assert.equal(requests.at(-1).options.credentials, 'omit'); f.ui.dispose();
});
test('admin edits preserve expected version and required reason; conflict retains draft', async () => {
  const f = await fixture({ mode: 'admin', role: 'owner', respond: (path, options) => { if (options.method === 'POST') throw { code: 'version_conflict' }; } });
  f.$('rc-admin-list').querySelectorAll('button').find(button => button.textContent === 'Edit').click(); f.fill('rc-admin-edit-form', { title: 'Revised title', body: 'Revised synthetic body', reason: 'Correct a typo' }); f.submit('rc-admin-edit-form'); await flush();
  assert.deepEqual(f.calls.find(call => call.options.method === 'POST').options.body, { expected_version: 3, reason: 'Correct a typo', title: 'Revised title', body: 'Revised synthetic body' }); assert.equal(f.$('rc-admin-editor').open, true); assert.equal(f.$('rc-admin-edit-body').value, 'Revised synthetic body'); assert.match(f.$('rc-admin-edit-result').textContent, /changed on the server/); f.ui.dispose();
});
test('owner user suspension uses server user UUID/version and does not send role/email', async () => {
  const f = await fixture({ mode: 'admin', role: 'owner' }); f.document.querySelector('[data-admin-view="users"]').click(); await flush(); f.$('rc-admin-list').querySelector('button').click(); f.fill('rc-admin-edit-form', { reason: 'Synthetic moderation reason' }); f.submit('rc-admin-edit-form'); await flush();
  const call = f.calls.find(call => call.path.endsWith('/suspend')); assert.equal(call.path, `/api/admin/users/${uid}/suspend`); assert.deepEqual(call.options.body, { expected_version: 2, reason: 'Synthetic moderation reason' }); f.ui.dispose();
});
test('MFA challenge sends exact six-digit code and setup secret is cleared on dismissal', async () => {
  const auth = mockAuth({ ...state(''), mfa: { ...state('').mfa, factors: [] } }); const f = await fixture({ auth }); f.document.querySelector('[data-profile-open]').click(); f.$('rc-mfa-open').click(); f.$('rc-mfa-enroll').click(); await flush(); assert.equal(f.$('rc-mfa-secret').textContent, 'SYNTHETICSETUPKEY'); assert.equal(f.$('rc-mfa-enrollment').querySelector('svg'), null);
  f.fill('rc-mfa-form', { code: '123456' }); f.submit('rc-mfa-form'); await flush(); assert.equal(auth.calls.find(call => call[0] === 'verifyMfa')[1].code, '123456'); assert.equal(f.$('rc-mfa-secret').textContent, ''); f.ui.dispose();
});
test('recovery handles callback before initialization and only enables reset, never content access', async () => {
  const f = await fixture({ mode: 'recovery', callbackUrl: 'https://community.test/test/auth/recovery-v1/?code=synthetic-code' }); assert.equal(f.auth.calls[0][0], 'handleCallback'); assert.equal(f.auth.calls.some(call => call[0] === 'initialize'), false); assert.equal(f.calls.length, 0);
  f.fill('rc-recovery-form', { password: 'synthetic-new-password', confirmPassword: 'synthetic-new-password' }); f.submit('rc-recovery-form'); await flush(); assert.deepEqual(f.auth.calls.find(call => call[0] === 'completePasswordReset')[1], { password: 'synthetic-new-password', confirmPassword: 'synthetic-new-password' }); assert.match(f.$('rc-status').textContent, /updated and you are signed out/); f.ui.dispose();
});
test('definitive AAL downgrade clears private dialogs and fences late history', async () => {
  const pending = deferred(); const f = await fixture({ mode: 'admin', role: 'owner', respond: path => path.includes('/history') ? pending.promise : undefined });
  f.$('rc-admin-list').querySelectorAll('button').find(button => button.textContent === 'History').click(); await flush(); assert.equal(f.$('rc-history').open, true);
  f.auth.emit({ ...state('owner'), busy: true, admin: { ...admin(null), status: 'unchecked' } }); f.auth.emit(state(''));
  pending.resolve({ data: [{ version: 4, snapshot: { title: 'Private late title', body: 'Private late body' } }] }); await flush(); assert.equal(f.$('rc-history').open, false); assert.equal(f.$('rc-history-list').textContent, ''); assert.equal(f.$('rc-admin-list').textContent, ''); assert.equal(f.$('rc-admin-tools').hidden, true); f.ui.dispose();
});
test('owner-to-moderator downgrade clears owner editor and user list', async () => {
  const f = await fixture({ mode: 'admin', role: 'owner' }); f.document.querySelector('[data-admin-view="users"]').click(); await flush(); f.$('rc-admin-list').querySelector('button').click(); f.fill('rc-admin-edit-form', { reason: 'Unsaved private reason' });
  f.auth.emit({ ...state('owner'), busy: true, admin: { ...admin(null), status: 'unchecked' } }); f.auth.emit(state('moderator')); await flush(); assert.equal(f.$('rc-admin-editor').open, false); assert.equal(f.$('rc-admin-edit-form').querySelector('[name="reason"]').value, ''); assert.equal(f.document.querySelector('[data-admin-view="users"]').hidden, true); f.ui.dispose();
});
test('history denial clears all other private content and triggers live recheck', async () => {
  const f = await fixture({ mode: 'admin', role: 'owner', respond: path => { if (path.includes('/history')) throw { code: 'forbidden' }; } }); f.$('rc-admin-list').querySelectorAll('button').find(button => button.textContent === 'History').click(); await flush(); assert.equal(f.$('rc-history').open, false); assert.equal(f.$('rc-admin-list').textContent, ''); assert.ok(f.auth.calls.some(call => call[0] === 'refresh')); f.ui.dispose();
});
test('logout fences late mutation success and clears private fields/passwords', async () => {
  const pending = deferred(); const f = await fixture({ mode: 'admin', role: 'owner', respond: (path, options) => options.method === 'POST' ? pending.promise : undefined });
  f.$('rc-admin-list').querySelectorAll('button').find(button => button.textContent === 'Edit').click(); f.fill('rc-admin-edit-form', { title: 'Synthetic changed title', body: 'Synthetic changed body', reason: 'Synthetic reason' }); f.submit('rc-admin-edit-form'); f.document.querySelector('[data-signout]').click(); await flush(); pending.resolve({ data: post }); await flush(); assert.equal(f.$('rc-admin-list').textContent, ''); assert.equal(f.$('rc-admin-editor').open, false); assert.match(f.$('rc-status').textContent, /Sign in|Signed out/); assert.doesNotMatch(f.$('rc-status').textContent, /saved and recorded/); f.ui.dispose();
});
test('BFCache departure clears private views and return requires a new live check', async () => {
  const f = await fixture({ mode: 'admin', role: 'owner' }); f.$('rc-admin-list').querySelectorAll('button').find(button => button.textContent === 'History').click(); await flush(); assert.match(f.$('rc-history-list').textContent, /Synthetic reason/);
  f.window.dispatch('pagehide', { persisted: true }); await flush(); assert.equal(f.$('rc-history').open, false); assert.equal(f.$('rc-history-list').textContent, ''); assert.equal(f.$('rc-admin-list').textContent, ''); assert.equal(f.$('rc-admin-tools').hidden, true); assert.equal(f.auth.calls.some(call => call[0] === 'dispose'), false);
  f.window.dispatch('pageshow', { persisted: true }); await flush(); assert.ok(f.auth.calls.some(call => call[0] === 'refresh')); assert.equal(f.$('rc-admin-tools').hidden, true); f.auth.emit(state('owner')); await flush(); assert.equal(f.$('rc-admin-tools').hidden, false); assert.match(f.$('rc-admin-list').textContent, /synthetic discussion/); f.ui.dispose();
});
test('failed storage initialization keeps credential fields disabled while public browsing works', async () => {
  const auth = mockAuth(state(null), { async initialize() { throw { code: 'STORAGE_UNAVAILABLE' }; } }); const f = await fixture({ auth });
  assert.equal(f.$('rc-auth-form').querySelector('fieldset').disabled, true); assert.equal(f.$('rc-google').disabled, true); assert.equal(f.$('rc-new-topic').disabled, true); assert.match(f.$('rc-status').textContent, /tab storage/); assert.match(f.$('rc-topics').textContent, /synthetic discussion/); f.ui.dispose();
});
test('pending MFA enrollment resumes without creating or deleting a factor or redisplaying its key', async () => {
  const initial = state(''); initial.mfa.factors = []; initial.mfa.pendingFactorId = factorId;
  const f = await fixture({ auth: mockAuth(initial) }); f.document.querySelector('[data-profile-open]').click(); f.$('rc-mfa-open').click();
  assert.equal(f.$('rc-mfa-enroll').hidden, true); assert.equal(f.$('rc-mfa-secret').textContent, ''); assert.match(f.$('rc-mfa-challenge').textContent, /unfinished/); assert.match(f.$('rc-mfa-result').textContent, /cannot safely restart/);
  f.$('rc-mfa-factor').value = factorId; f.$('rc-mfa-challenge').click(); await flush(); assert.deepEqual(f.auth.calls.find(call => call[0] === 'challengeMfa'), ['challengeMfa', factorId]); assert.equal(f.auth.calls.some(call => call[0] === 'enrollMfa'), false); f.ui.dispose();
});
