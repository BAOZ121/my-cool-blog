import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setupCommunityUI, safeUiError } from '../assets/js/community-ui.mjs';
import { validateCommunityConfig, communityCsp, communityHeaders, COMMUNITY_PATHS } from '../assets/js/community-config.mjs';
import { createEmailStepupClient } from '../backend/client/email-stepup-client.mjs';
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
async function fixture({ mode = 'forum', role = null, auth: provided, respond, extraConfig = {}, callbackUrl, stepup, createStepup, configureDom } = {}) {
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
  configureDom?.(dom);
  const ui = setupCommunityUI({ ...dom, auth, api, config: { ...config, ...extraConfig }, callbackUrl, stepup, createStepup });
  await ui.ready; await flush(); return { ...dom, auth, api, calls, ui };
}

test('real mode fails closed and accepts only exact public project config', () => {
  assert.deepEqual(validateCommunityConfig({}), { enabled: false, googleEnabled: false, emailStepupEnabled: false });
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

// Deterministic doubles are confined to tests. Production receives the reviewed
// adapter and never inspects or invents an administrator identity or JWT claim.
const emailAuthState = ({ admitted = false, role = 'owner', generation = 1, eligible = true } = {}) => ({
  ...state(admitted ? role : ''), sessionGeneration: generation,
  admin: { ...admin(admitted ? role : ''), method: 'email', status: admitted ? 'available' : 'email_required', canRequestEmailStepup: eligible,
    idleExpiresAt: admitted ? Date.now() + 900000 : null, absoluteExpiresAt: admitted ? Date.now() + 3600000 : null },
});
function mockStepup(overrides = {}) {
  let current = { status: 'idle', busy: false, resendAt: 0, cancellationStatus: 'none', actionReady: false, actionExpiresAt: null }, disposed = false;
  const listeners = new Set(), calls = [];
  const adapter = { calls, getState: () => structuredClone(current), emit(patch) { current = { ...current, ...patch }; if (!disposed) for (const listener of listeners) listener(adapter.getState()); },
    subscribe(listener) { listeners.add(listener); listener(adapter.getState()); return () => listeners.delete(listener); },
    async begin(value) { calls.push(['begin', structuredClone(value)]); adapter.emit({ status: 'code_requested', scope: value.scope }); return adapter.getState(); },
    async verify(code) { calls.push(['verify', code]); adapter.emit({ status: 'verified', actionReady: current.scope === 'action', actionExpiresAt: current.scope === 'action' ? Date.now() + 120000 : null }); return adapter.getState(); },
    async status() { calls.push(['status']); return adapter.getState(); },
    async cancel() { calls.push(['cancel']); adapter.emit({ status: 'cancelled', cancellationStatus: 'confirmed', busy: false, actionReady: false }); return adapter.getState(); },
    async consumeAction(callback) { calls.push(['consumeAction']); adapter.emit({ status: 'consuming_action', actionReady: false }); const result = await callback(new AbortController().signal); adapter.emit({ status: 'consumed' }); return result; },
    suspend() { calls.push(['suspend']); adapter.emit({ status: 'suspended', actionReady: false, busy: false }); },
    async dispose() { calls.push(['dispose']); disposed = true; listeners.clear(); }, ...overrides,
  }; return adapter;
}
async function emailFixture(options = {}) {
  const auth = options.auth || mockAuth(emailAuthState({ admitted: options.admitted ?? true })), stepup = options.stepup || mockStepup();
  const f = await fixture({ ...options, mode: 'admin', auth, stepup, extraConfig: { emailStepupEnabled: true, ...options.extraConfig } });
  return { ...f, stepup };
}
function startEmailEdit(f, { operation = 'Edit', values = { title: 'Exact new title', body: 'Exact new body', reason: 'Correct this text' } } = {}) {
  f.$('rc-admin-list').querySelectorAll('button').find(button => button.textContent === operation).click();
  f.fill('rc-admin-edit-form', values); f.submit('rc-admin-edit-form');
}
async function verifyEmail(f) {
  f.$('rc-email-stepup-send').click(); await flush();
  f.fill('rc-email-stepup-form', { code: '123456' }); f.submit('rc-email-stepup-form'); await flush();
}

test('email admission is offered only for explicit config plus server method and capability', async () => {
  for (const [enabled, method, eligible, expected] of [[true, 'email', true, true], [false, 'email', true, false], [true, 'totp', true, false], [true, 'email', false, false], ['true', 'email', true, false]]) {
    const initial = emailAuthState({ eligible }); initial.admin.method = method;
    const f = await emailFixture({ auth: mockAuth(initial), extraConfig: { emailStepupEnabled: enabled } });
    assert.equal(f.$('rc-admin-email').hidden, !expected);
    assert.equal(f.stepup.calls.some(call => call[0] === 'begin'), false);
    if (!expected) assert.equal(f.$('rc-admin-verify').hidden, false);
    f.ui.dispose();
  }
});
test('email admission sends no automatic mail; verification requires authoritative Auth refresh', async () => {
  const auth = mockAuth(emailAuthState()), f = await emailFixture({ auth });
  assert.equal(f.$('rc-admin-tools').hidden, true); f.$('rc-admin-email').click(); await flush();
  assert.equal(f.stepup.calls.length, 0); assert.equal(f.$('rc-email-stepup').open, true);
  await verifyEmail(f); assert.deepEqual(f.stepup.calls.find(call => call[0] === 'begin')[1], { scope: 'admission' });
  assert.ok(auth.calls.some(call => call[0] === 'refresh')); assert.equal(f.$('rc-admin-tools').hidden, true);
  assert.equal(f.$('rc-email-stepup-code').value, ''); assert.equal(f.calls.some(call => call.options.method === 'POST'), false); f.ui.dispose();
});
test('server-confirmed email admission loads real admin records after code verification', async () => {
  const auth = mockAuth(emailAuthState()); auth.refresh = async () => { auth.calls.push(['refresh']); auth.emit(emailAuthState({ admitted: true })); return auth.getState(); };
  const f = await emailFixture({ auth }); f.$('rc-admin-email').click(); await verifyEmail(f);
  assert.equal(f.$('rc-admin-tools').hidden, false); assert.match(f.$('rc-admin-list').textContent, /synthetic discussion/); f.ui.dispose();
});
test('email edit freezes exact canonical action then waits for explicit final confirmation', async () => {
  const f = await emailFixture(); startEmailEdit(f); await flush();
  assert.equal(f.stepup.calls.length, 0); assert.equal(f.$('rc-admin-edit-form').querySelector('fieldset').disabled, true);
  assert.match(f.$('rc-email-stepup-summary').textContent, /Exact new body/);
  f.$('rc-admin-edit-body').value = 'Tampered later draft';
  await verifyEmail(f);
  assert.deepEqual(f.stepup.calls.find(call => call[0] === 'begin')[1], { scope: 'action', action: 'admin_edit_post', targetId: postId, expectedVersion: 3, payload: { title: 'Exact new title', body: 'Exact new body', reason: 'Correct this text' } });
  assert.equal(f.calls.some(call => call.options.method === 'POST'), false);
  assert.equal(f.$('rc-email-stepup-confirm').disabled, false); f.$('rc-email-stepup-confirm').click(); await flush();
  const sent = f.calls.find(call => call.options.method === 'POST'); assert.equal(sent.path, `/api/admin/posts/${postId}/edit`);
  assert.deepEqual(sent.options.body, { expected_version: 3, reason: 'Correct this text', title: 'Exact new title', body: 'Exact new body' });
  assert.equal(f.$('rc-email-stepup').open, false); assert.equal(f.$('rc-admin-editor').open, false); f.ui.dispose();
});
test('email moderation and user state bind exact server IDs, versions and canonical payloads', async () => {
  for (const operation of ['Hide', 'Pin', 'Lock', 'Suspend account', 'Restore account']) {
    const account = operation.includes('account');
    const f = await emailFixture({ respond: path => operation === 'Restore account' && path.startsWith('/api/admin/users') ? { data: [{ user_id: uid, role: 'member', state: 'suspended', version: 2 }] } : undefined });
    if (account) { f.document.querySelector('[data-admin-view="users"]').click(); await flush(); }
    startEmailEdit(f, { operation, values: { reason: 'Exact reason' } }); await flush(); await verifyEmail(f);
    const binding = f.stepup.calls.find(call => call[0] === 'begin')[1];
    assert.deepEqual(binding, { scope: 'action', action: account ? 'set_account_state' : 'moderate_post', targetId: account ? uid : postId, expectedVersion: account ? 2 : 3, payload: account ? { state: operation === 'Suspend account' ? 'suspended' : 'active', reason: 'Exact reason' } : { action: operation.toLowerCase(), reason: 'Exact reason' } });
    f.$('rc-email-stepup-confirm').click(); await flush();
    assert.deepEqual(f.calls.find(call => call.options.method === 'POST').options.body, { expected_version: account ? 2 : 3, reason: 'Exact reason' }); f.ui.dispose();
  }
});
test('repeated email sends, verifies and confirms cannot duplicate pending operations', async () => {
  const begin = deferred(), verify = deferred(), mutation = deferred();
  const adapter = mockStepup({ async begin(value) { this.calls.push(['begin', value]); this.emit({ status: 'requesting_code', busy: true, scope: 'action' }); await begin.promise; this.emit({ status: 'code_requested', busy: false }); return this.getState(); },
    async verify(code) { this.calls.push(['verify', code]); this.emit({ status: 'verifying', busy: true }); await verify.promise; this.emit({ status: 'verified', busy: false, actionReady: true, actionExpiresAt: Date.now() + 120000 }); return this.getState(); } });
  const f = await emailFixture({ stepup: adapter, respond: (path, options) => options.method === 'POST' ? mutation.promise : undefined });
  startEmailEdit(f); await flush(); f.$('rc-email-stepup-send').click(); f.$('rc-email-stepup-send').click(); assert.equal(adapter.calls.filter(call => call[0] === 'begin').length, 1);
  begin.resolve(); await flush(); f.fill('rc-email-stepup-form', { code: '123456' }); f.submit('rc-email-stepup-form'); assert.equal(f.$('rc-email-stepup-code').value, ''); f.fill('rc-email-stepup-form', { code: '123456' }); f.submit('rc-email-stepup-form'); assert.equal(adapter.calls.filter(call => call[0] === 'verify').length, 1);
  verify.resolve(); await flush(); f.$('rc-email-stepup-confirm').click(); f.$('rc-email-stepup-confirm').click(); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
  mutation.resolve({ data: post }); await flush(); f.ui.dispose();
});
test('cancellation remains visible and blocks action until server confirms or reports already used', async () => {
  let attempts = 0;
  const adapter = mockStepup({ async cancel() { this.calls.push(['cancel']); if (++attempts === 1) { this.emit({ status: 'cancellation_unconfirmed', cancellationStatus: 'unconfirmed', actionReady: false }); throw { code: 'CANCEL_UNCONFIRMED' }; } this.emit({ status: 'already_used', cancellationStatus: 'already_used' }); return this.getState(); } });
  const f = await emailFixture({ stepup: adapter }); startEmailEdit(f); await flush(); await verifyEmail(f);
  f.fill('rc-email-stepup-form', { code: '999999' }); f.$('rc-email-stepup-cancel').click(); await flush();
  assert.equal(f.$('rc-email-stepup').open, true); assert.equal(f.$('rc-email-stepup-code').value, ''); assert.match(f.$('rc-email-stepup-cancel').textContent, /Retry cancellation/); assert.equal(f.$('rc-email-stepup-confirm').disabled, true);
  assert.equal(f.$('rc-admin-edit-form').querySelector('fieldset').disabled, true);
  f.$('rc-email-stepup-cancel').click(); await flush(); assert.equal(f.$('rc-email-stepup').open, false); assert.match(f.$('rc-status').textContent, /already used/); assert.equal(f.calls.some(call => call.options.method === 'POST'), false); f.ui.dispose();
});
test('closing pending send warns when only local stopping is known and fences late begin', async () => {
  const pending = deferred(); const adapter = mockStepup({ async begin(value) { this.calls.push(['begin', value]); this.emit({ status: 'requesting_code', busy: true }); await pending.promise; this.emit({ status: 'code_requested', busy: false }); return this.getState(); },
    async cancel() { this.calls.push(['cancel']); this.emit({ status: 'stopped', cancellationStatus: 'local_only', busy: false }); return this.getState(); } });
  const f = await emailFixture({ admitted: false, stepup: adapter }); f.$('rc-admin-email').click(); f.$('rc-email-stepup-send').click();
  const event = f.$('rc-email-stepup').dispatch('cancel'); assert.equal(event.defaultPrevented, true); await flush();
  assert.match(f.$('rc-email-stepup-result').textContent, /email may still arrive/); assert.equal(f.$('rc-email-stepup').open, true);
  pending.resolve(); await flush(); assert.equal(f.$('rc-email-stepup-form').hidden, true); assert.equal(f.$('rc-email-stepup-confirm').disabled, true);
  f.$('rc-email-stepup-cancel').click(); await flush(); assert.equal(f.$('rc-email-stepup').open, false); assert.match(f.$('rc-status').textContent, /No server cancellation/); f.ui.dispose();
});
test('signout immediately disposes email flow without waiting for or claiming remote cancellation', async () => {
  const pending = deferred(); const adapter = mockStepup({ async verify(code) { this.calls.push(['verify', code]); await pending.promise; return { ...this.getState(), actionReady: true, actionExpiresAt: Date.now() + 120000 }; } });
  const f = await emailFixture({ stepup: adapter }); startEmailEdit(f); await flush(); f.$('rc-email-stepup-send').click(); await flush(); f.fill('rc-email-stepup-form', { code: '123456' }); f.submit('rc-email-stepup-form');
  f.document.querySelector('[data-signout]').click(); await flush(); assert.ok(f.auth.calls.some(call => call[0] === 'signOut')); assert.ok(adapter.calls.some(call => call[0] === 'dispose')); assert.equal(adapter.calls.some(call => call[0] === 'cancel'), false);
  pending.resolve(); await flush(); assert.equal(f.$('rc-email-stepup').open, false); assert.equal(f.$('rc-email-stepup-code').value, ''); assert.equal(f.$('rc-email-stepup-summary').textContent, ''); assert.equal(f.calls.some(call => call.options.method === 'POST'), false); f.ui.dispose();
});
test('same-user session swap disposes old challenge and fences its late verification', async () => {
  const pending = deferred(), fresh = mockStepup();
  const adapter = mockStepup({ async verify(code) { this.calls.push(['verify', code]); await pending.promise; return { ...this.getState(), actionReady: true, actionExpiresAt: Date.now() + 120000 }; } });
  const f = await emailFixture({ stepup: adapter, createStepup: () => fresh }); startEmailEdit(f); await flush(); f.$('rc-email-stepup-send').click(); await flush(); f.fill('rc-email-stepup-form', { code: '123456' }); f.submit('rc-email-stepup-form');
  f.auth.emit(emailAuthState({ admitted: true, generation: 2 })); pending.resolve(); await flush();
  assert.ok(adapter.calls.some(call => call[0] === 'dispose')); assert.equal(f.$('rc-email-stepup').open, false); assert.equal(f.$('rc-email-stepup-summary').textContent, ''); assert.equal(f.$('rc-admin-editor').open, false); assert.equal(f.calls.some(call => call.options.method === 'POST'), false); f.ui.dispose();
});
test('routine same-session refresh preserves email challenge and uses only live server capability', async () => {
  const f = await emailFixture(); startEmailEdit(f); await flush(); f.$('rc-email-stepup-send').click(); await flush();
  f.auth.emit({ ...emailAuthState({ admitted: true }), busy: true, admin: { ...admin(null), status: 'unchecked' } });
  f.auth.emit(emailAuthState({ admitted: true })); await flush(); assert.equal(f.$('rc-email-stepup').open, true); assert.equal(f.$('rc-email-stepup-form').querySelector('fieldset').disabled, false); assert.equal(f.stepup.calls.some(call => call[0] === 'dispose'), false); f.ui.dispose();
});
test('BFCache suspends locally without cancelling or submitting and requires explicit cancellation on return', async () => {
  const f = await emailFixture(); startEmailEdit(f); await flush(); await verifyEmail(f); f.fill('rc-email-stepup-form', { code: '123456' });
  f.window.dispatch('pagehide', { persisted: true }); await flush(); assert.ok(f.stepup.calls.some(call => call[0] === 'suspend')); assert.equal(f.stepup.calls.some(call => call[0] === 'cancel'), false); assert.equal(f.$('rc-email-stepup-code').value, ''); assert.equal(f.$('rc-email-stepup-summary').textContent, '');
  f.window.dispatch('pageshow', { persisted: true }); await flush(); assert.equal(f.$('rc-email-stepup').open, true); assert.equal(f.$('rc-email-stepup-confirm').disabled, true); assert.match(f.$('rc-email-stepup-result').textContent, /interrupted/); assert.equal(f.calls.some(call => call.options.method === 'POST'), false);
  f.$('rc-email-stepup-cancel').click(); await flush(); assert.equal(f.$('rc-email-stepup').open, false); f.ui.dispose();
});
test('expired action, changed server role and action transport failure never auto-submit or retry', async () => {
  const f = await emailFixture({ respond: (path, options) => { if (options.method === 'POST') throw { code: 'version_conflict' }; } });
  startEmailEdit(f); await flush(); await verifyEmail(f); f.$('rc-email-stepup-confirm').click(); await flush();
  assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1); assert.equal(f.$('rc-email-stepup-confirm').disabled, true); assert.match(f.$('rc-email-stepup-result').textContent, /changed on the server/); f.$('rc-email-stepup-confirm').click(); await flush(); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1); f.ui.dispose();
  const g = await emailFixture(); startEmailEdit(g); await flush(); await verifyEmail(g); g.stepup.emit({ actionExpiresAt: Date.now() - 1 }); g.$('rc-email-stepup-confirm').click(); await flush(); assert.equal(g.calls.some(call => call.options.method === 'POST'), false); g.ui.dispose();
  const h = await emailFixture(); startEmailEdit(h); await flush(); await verifyEmail(h); h.auth.emit(emailAuthState({ admitted: false, eligible: false })); await flush(); assert.equal(h.$('rc-email-stepup-confirm').disabled, true); assert.equal(h.$('rc-email-stepup-summary').textContent, ''); assert.equal(h.calls.some(call => call.options.method === 'POST'), false); h.ui.dispose();
});
test('linked adapter cancellation signal aborts original mutation transport', async () => {
  const aborter = new AbortController(), pending = deferred();
  const adapter = mockStepup({ async consumeAction(callback) { this.calls.push(['consumeAction']); this.emit({ actionReady: false }); return callback(aborter.signal); } });
  const f = await emailFixture({ stepup: adapter, respond: (path, options) => options.method === 'POST' ? pending.promise : undefined }); startEmailEdit(f); await flush(); await verifyEmail(f); f.$('rc-email-stepup-confirm').click(); await flush();
  const sent = f.calls.find(call => call.options.method === 'POST'); assert.equal(sent.options.signal.aborted, false); aborter.abort(); assert.equal(sent.options.signal.aborted, true); pending.resolve({ data: post }); await flush(); assert.doesNotMatch(f.$('rc-status').textContent, /saved and recorded/); f.ui.dispose();
});

test('same-session periodic capability checks never reload admin lists or keep admission alive', async () => {
  const f = await emailFixture(); const initialReads = f.calls.filter(call => call.path.startsWith('/api/admin/')).length;
  for (let i = 0; i < 4; i++) {
    f.auth.emit({ ...emailAuthState({ admitted: true }), busy: true, admin: { ...admin(null), method: 'email', status: 'unchecked' } });
    f.auth.emit(emailAuthState({ admitted: true })); await flush();
  }
  assert.equal(f.calls.filter(call => call.path.startsWith('/api/admin/')).length, initialReads);
  f.auth.emit(emailAuthState({ admitted: false })); await flush();
  assert.equal(f.$('rc-admin-tools').hidden, true); assert.equal(f.$('rc-admin-list').textContent, '');
  assert.equal(f.calls.filter(call => call.path.startsWith('/api/admin/')).length, initialReads); f.ui.dispose();
});

test('production email adapter completes exact action through real UI only after explicit confirmation', async () => {
  const traffic = [], challengeId = '44444444-4444-4444-8444-444444444444';
  const stepup = createEmailStepupClient({ enabled: true, origin: config.allowedOrigin, getAccessToken: async () => 'synthetic-access-token-only',
    fetchImpl: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null; traffic.push({ url, body });
      const data = url.endsWith('/begin') ? { id: challengeId, scope: body.scope, expires_epoch: Math.floor(Date.now() / 1000) + 300 }
        : url.endsWith('/verify') ? { id: challengeId, scope: 'action', verified: true, expires_epoch: Math.floor(Date.now() / 1000) + 120 }
        : { cancelled: true, already_used: false };
      return new Response(JSON.stringify({ data }));
    } });
  const f = await emailFixture({ stepup }); startEmailEdit(f); await flush(); await verifyEmail(f);
  assert.equal(f.$('rc-email-stepup-confirm').disabled, false); assert.equal(f.calls.some(call => call.options.method === 'POST'), false);
  assert.deepEqual(traffic.find(row => row.url.endsWith('/begin')).body, { scope: 'action', action: 'admin_edit_post', target_id: postId, expected_version: 3, payload: { title: 'Exact new title', body: 'Exact new body', reason: 'Correct this text' } });
  f.$('rc-email-stepup-confirm').click(); await flush(); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1); assert.equal(f.$('rc-email-stepup').open, false); f.ui.dispose();
});
test('original mutation transport times out within 25 seconds and never retries a stalled send', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await emailFixture({ respond: (path, options) => options.method === 'POST' ? new Promise(() => {}) : undefined });
  startEmailEdit(f); await flush(); await verifyEmail(f); f.$('rc-email-stepup-confirm').click(); await flush();
  const sent = f.calls.find(call => call.options.method === 'POST'); assert.equal(sent.options.signal.aborted, false);
  t.mock.timers.tick(25000); await flush(); assert.equal(sent.options.signal.aborted, true); assert.equal(f.$('rc-email-stepup-confirm').disabled, true); assert.match(f.$('rc-email-stepup-result').textContent, /timed out/); assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1); f.ui.dispose();
});

test('eligible email administrator can find management from the forum before admission', async () => {
  const f = await fixture({ auth: mockAuth(emailAuthState()), stepup: mockStepup(), extraConfig: { emailStepupEnabled: true } });
  assert.equal(f.document.querySelector('[data-admin-link]').hidden, false);
  assert.match(f.$('rc-mfa-description').textContent, /separate email verification/); f.ui.dispose();
});
test('unconfirmed cancellation keeps an accessible signout button inside the modal', async () => {
  const stepup = mockStepup({ async cancel() { this.emit({ cancellationStatus: 'unconfirmed' }); throw { code: 'CANCEL_UNCONFIRMED' }; } });
  const f = await emailFixture({ stepup }); startEmailEdit(f); await flush(); await verifyEmail(f); f.$('rc-email-stepup-cancel').click(); await flush();
  const signout = f.$('rc-email-stepup').querySelector('[data-signout]'); assert.equal(signout.disabled, false); signout.click(); await flush(); assert.ok(f.auth.calls.some(call => call[0] === 'signOut')); assert.equal(f.$('rc-email-stepup').open, false); f.ui.dispose();
});

test('polling recovery after unavailable or denied access never reloads records until user requests it', async () => {
  const f = await emailFixture(); const initialReads = f.calls.filter(call => call.path.startsWith('/api/admin/')).length;
  for (const status of ['unavailable', 'denied']) {
    f.auth.emit({ ...emailAuthState({ admitted: false }), admin: { ...emailAuthState({ admitted: false }).admin, status } }); await flush();
    f.auth.emit(emailAuthState({ admitted: true })); await flush();
  }
  assert.equal(f.calls.filter(call => call.path.startsWith('/api/admin/')).length, initialReads);
  assert.equal(f.$('rc-admin-list').textContent, ''); assert.match(f.$('rc-status').textContent, /Use Refresh/);
  f.$('rc-admin-refresh').click(); await flush(); assert.equal(f.calls.filter(call => call.path.startsWith('/api/admin/')).length, initialReads + 1); assert.match(f.$('rc-admin-list').textContent, /synthetic discussion/); f.ui.dispose();
});

test('server signout failure remains visible after local email flow and session are cleared', async () => {
  const auth = mockAuth(emailAuthState({ admitted: true })); auth.signOut = async () => { auth.calls.push(['signOut']); auth.emit({ ...state(null), error: { code: 'SIGN_OUT_UNCONFIRMED' } }); throw { code: 'SIGN_OUT_UNCONFIRMED' }; };
  const f = await emailFixture({ auth }); startEmailEdit(f); await flush(); await verifyEmail(f); f.$('rc-email-stepup').querySelector('[data-signout]').click(); await flush();
  assert.equal(f.$('rc-email-stepup').open, false); assert.match(f.$('rc-status').textContent, /server sign-out could not be confirmed/i); assert.doesNotMatch(f.$('rc-status').textContent, /verification.*cancelled/i); f.ui.dispose();
});
test('recovery transition clears old email flow even if a fixture omits session generation change', async () => {
  const f = await emailFixture(); startEmailEdit(f); await flush(); await verifyEmail(f);
  f.auth.emit({ ...emailAuthState({ admitted: false }), status: 'recovery_ready', recovery: { expiresAt: Date.now() + 10000 } }); await flush();
  assert.equal(f.$('rc-email-stepup').open, false); assert.equal(f.$('rc-email-stepup-summary').textContent, ''); assert.ok(f.stepup.calls.some(call => call[0] === 'dispose')); f.ui.dispose();
});

test('local admission deadline clears private UI and blocks action without network or Auth refresh', async t => {
  const now = Date.now(); t.mock.timers.enable({ apis: ['Date', 'setInterval'], now });
  const initial = emailAuthState({ admitted: true }); initial.admin.idleExpiresAt = now + 1500;
  const auth = mockAuth(initial);
  const f = await emailFixture({ auth, configureDom: ({ window }) => { window.setInterval = setInterval; window.clearInterval = clearInterval; } });
  startEmailEdit(f); await flush(); await verifyEmail(f); assert.equal(f.$('rc-email-stepup-confirm').disabled, false);
  const requestsBefore = f.calls.length, authCallsBefore = auth.calls.length, adapterCallsBefore = f.stepup.calls.length;
  const stateBefore = auth.getState(); t.mock.timers.tick(2000); await flush();
  assert.deepEqual(auth.getState(), stateBefore); assert.equal(f.calls.length, requestsBefore); assert.equal(auth.calls.length, authCallsBefore); assert.equal(f.stepup.calls.length, adapterCallsBefore);
  assert.equal(f.$('rc-admin-tools').hidden, true); assert.equal(f.$('rc-admin-gate').hidden, false); assert.equal(f.$('rc-admin-list').textContent, ''); assert.equal(f.$('rc-admin-editor').open, false);
  assert.equal(f.$('rc-email-stepup').open, true); assert.equal(f.$('rc-email-stepup-summary').textContent, ''); assert.equal(f.$('rc-email-stepup-confirm').disabled, true); assert.match(f.$('rc-status').textContent, /expired/);
  f.$('rc-email-stepup-confirm').click(); await flush(); assert.equal(f.calls.length, requestsBefore); assert.equal(f.stepup.calls.some(call => call[0] === 'cancel'), false);
  f.$('rc-email-stepup-cancel').click(); await flush(); assert.ok(f.stepup.calls.some(call => call[0] === 'cancel')); f.ui.dispose();
});
test('email admin access requires both finite future server deadlines while TOTP remains unaffected', async () => {
  for (const change of [{ idleExpiresAt: null }, { absoluteExpiresAt: null }, { idleExpiresAt: NaN }, { absoluteExpiresAt: Infinity }, { idleExpiresAt: Date.now() - 1 }, { absoluteExpiresAt: Date.now() - 1 }]) {
    const initial = emailAuthState({ admitted: true }); Object.assign(initial.admin, change);
    const f = await emailFixture({ auth: mockAuth(initial) }); assert.equal(f.$('rc-admin-tools').hidden, true); assert.equal(f.calls.some(call => call.path.startsWith('/api/admin/')), false); f.ui.dispose();
  }
  const f = await fixture({ mode: 'admin', role: 'owner', extraConfig: { emailStepupEnabled: true } }); assert.equal(f.$('rc-admin-tools').hidden, false); assert.match(f.$('rc-admin-list').textContent, /synthetic discussion/); f.ui.dispose();
});

test('fixed sign-in/register/account intents open views only after real session initialization', async () => {
  for (const [hash, expected] of [['#signin', 'Sign in'], ['#register', 'Create account'], ['#account', 'Sign in']]) {
    const replaced = []; const f = await fixture({ configureDom(dom) { dom.window.location.href += hash; dom.window.location.hash = hash; dom.window.history = { replaceState(...args) { replaced.push(args); } }; } });
    assert.equal(f.$('rc-auth').open, true); assert.equal(f.$('rc-auth-submit').textContent, expected);
    assert.equal(replaced[0][2], '/test/forum-v1/#discussion');
    assert.deepEqual(f.auth.calls.map(call => call[0]), ['initialize']); assert.ok(f.calls.every(call => !call.options.method));
    f.ui.dispose();
  }
  const f = await fixture({ role: '', configureDom(dom) { dom.window.location.href += '#account'; dom.window.history = { replaceState() {} }; } });
  assert.equal(f.$('rc-profile').open, true); assert.equal(f.$('rc-auth').open, false); assert.equal(f.auth.calls.some(call => call[0] === 'signOut'), false); f.ui.dispose();
});
test('URL intents reject arbitrary redirects, codes, other pages and repeated hash events never authenticate', async () => {
  for (const suffix of ['#signout', '#reset', '#signin?next=https://evil.invalid', '?next=https://evil.invalid#signin', '#register&code=123456', '#%73ignin']) {
    const f = await fixture({ configureDom(dom) { dom.window.location.href += suffix; } }); assert.equal(f.$('rc-auth').open, false); assert.equal(f.$('rc-profile').open, false); f.ui.dispose();
  }
  const f = await fixture(); f.window.location.href += '#register'; f.window.location.hash = '#register'; f.window.history = { replaceState() {} };
  f.window.dispatch('hashchange'); f.window.dispatch('hashchange'); assert.equal(f.$('rc-auth').open, true);
  f.$('rc-auth').close(); await flush(); assert.equal(f.$('rc-auth').open, false);
  assert.deepEqual(f.auth.calls.map(call => call[0]), ['initialize']); f.ui.dispose();
});

test('promoted discussion and message-board routes select their HTTPS panels without account side effects', async () => {
  for (const role of [null, '']) {
    for (const hash of ['#discussion', '#message-board']) {
      const f = await fixture({ role, configureDom(dom) { dom.window.location.href += hash; dom.window.location.hash = hash; } });
      const board = hash === '#message-board';
      assert.equal(f.$('rc-forum-panel').hidden, board);
      assert.equal(f.$('rc-board-panel').hidden, !board);
      assert.equal(f.$('rc-auth').open, false); assert.equal(f.$('rc-profile').open, false);
      assert.deepEqual(f.auth.calls.map(call => call[0]), ['initialize']);
      assert.ok(f.calls.every(call => !call.options.method && call.path.startsWith('/api/community/')));
      f.window.location.hash = board ? '#discussion' : '#message-board';
      f.window.dispatch('hashchange');
      assert.equal(f.$('rc-forum-panel').hidden, !board);
      assert.equal(f.$('rc-board-panel').hidden, board);
      assert.deepEqual(f.auth.calls.map(call => call[0]), ['initialize']);
      f.ui.dispose();
    }
  }
});

test('Google enablement is forwarded and explicit click navigates current tab only', async () => {
  const entry = readFileSync(new URL('../assets/js/community-entry.mjs', import.meta.url), 'utf8');
  assert.match(entry, /googleEnabled: config\.googleEnabled/);
  const f = await fixture({ extraConfig: { googleEnabled: true } });
  assert.equal(f.auth.calls.some(call => call[0] === 'google'), false);
  assert.equal(f.window.assigned, undefined); assert.equal(f.$('rc-google').disabled, false);
  f.$('rc-google').click(); await flush();
  assert.equal(f.auth.calls.filter(call => call[0] === 'google').length, 1);
  assert.equal(f.window.assigned, 'https://test-project.supabase.co/auth/v1/authorize?provider=google');
  f.ui.dispose();
});


test('unified forum has native section links and switching preserves public content and permissions', async () => {
  const f = await fixture();
  const discussions = f.$('rc-discussions-link'), board = f.$('rc-board-link');
  assert.equal(discussions.getAttribute('href'), '#discussion');
  assert.equal(board.getAttribute('href'), '#message-board');
  assert.equal(discussions.getAttribute('aria-controls'), 'rc-forum-panel');
  assert.equal(board.getAttribute('aria-controls'), 'rc-board-panel');
  assert.equal(discussions.getAttribute('aria-current'), 'location');
  const topics = f.$('rc-topics').textContent, callCount = f.calls.length;
  board.dispatch('click', { ctrlKey: true });
  assert.equal(f.$('rc-board-panel').hidden, true);
  board.click();
  assert.equal(f.$('rc-board-panel').hidden, false);
  assert.equal(board.getAttribute('aria-current'), 'location');
  assert.equal(discussions.getAttribute('aria-current'), null);
  assert.equal(f.$('rc-board-form').querySelector('fieldset').disabled, true);
  f.window.location.hash = '#message-board'; f.window.dispatch('hashchange');
  assert.equal(f.$('rc-board-panel').hidden, false);
  f.window.location.hash = '#discussion'; f.window.dispatch('hashchange');
  assert.equal(f.$('rc-forum-panel').hidden, false);
  assert.equal(discussions.getAttribute('aria-current'), 'location');
  assert.equal(f.$('rc-topics').textContent, topics);
  assert.equal(f.calls.length, callCount);
  assert.deepEqual(f.auth.calls.map(call => call[0]), ['initialize']);
  f.ui.dispose();
});
