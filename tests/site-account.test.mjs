import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createAccountHintStore } from '../assets/js/site-account-hint.mjs';
import { setupSiteAccount } from '../assets/js/site-account.mjs';
import { createSiteAccountDom } from './helpers/site-account-dom.mjs';

const project = 'example-project.supabase.co';
const key = `dex-community-account-view:v1:${project}`;
const TTL = 5 * 60_000;
const start = 1_800_000_000_000;
const source = name => readFileSync(new URL(`../assets/js/${name}.mjs`, import.meta.url), 'utf8');
function storageFixture() {
  const values = new Map(), calls = [];
  return { values, calls, storage: {
    getItem(name) { calls.push(['get', name]); return values.get(name) ?? null; },
    setItem(name, value) { calls.push(['set', name, value]); values.set(name, value); },
    removeItem(name) { calls.push(['remove', name]); values.delete(name); },
  } };
}
function fixture({ initials, time = start } = {}) {
  const dom = createSiteAccountDom(), storage = storageFixture(); let clock = time;
  const now = () => clock;
  const hints = createAccountHintStore({ storage: storage.storage, project, now });
  if (initials) hints.write({ initials });
  const ui = setupSiteAccount({ ...dom, hints, now });
  return { ...dom, ...storage, hints, ui, now, advance(ms) { clock += ms; } };
}
function assertGuest(f) {
  assert.equal(f.nodes.guest.hidden, false);
  assert.equal(f.nodes.member.hidden, true);
  assert.equal(f.nodes.member.open, false);
  assert.equal(f.nodes.avatar.textContent, '');
  assert.equal(f.nodes.status.textContent, '');
}
function assertHint(f, initials = 'DX') {
  assert.equal(f.nodes.guest.hidden, true);
  assert.equal(f.nodes.member.hidden, false);
  assert.equal(f.nodes.avatar.textContent, initials);
  assert.equal(f.nodes.status.textContent, 'Open Account to check your session.');
}

test('hint writer stores exactly initials and a fixed five-minute expiry in its own project key', () => {
  const f = storageFixture(), hints = createAccountHintStore({ storage: f.storage, project, now: () => start });
  assert.equal(hints.write({ initials: 'DX', email: 'must-not-be-saved@example.test', token: 'must-not-be-saved' }), true);
  assert.deepEqual(JSON.parse(f.values.get(key)), { initials: 'DX', expiresAt: start + TTL });
  assert.deepEqual([...f.values.keys()], [key]);
  assert.equal(Object.isFrozen(hints.read()), true);
});

test('hint reads never extend expiry or write storage', () => {
  const f = storageFixture(); let time = start;
  const hints = createAccountHintStore({ storage: f.storage, project, now: () => time });
  hints.write({ initials: 'A' }); f.calls.length = 0;
  time += 100_000;
  assert.deepEqual(hints.read(), { initials: 'A', expiresAt: start + TTL });
  time += 100_000;
  assert.deepEqual(hints.read(), { initials: 'A', expiresAt: start + TTL });
  assert.deepEqual(f.calls, [['get', key], ['get', key]]);
});

test('missing, expired, malformed, extra-field and overlong hints are ignored', () => {
  const f = storageFixture(), hints = createAccountHintStore({ storage: f.storage, project, now: () => start });
  assert.equal(hints.read(), null);
  const invalid = [
    'bad json', 'null', '[]', '{}', 'x'.repeat(129),
    JSON.stringify({ initials: 'DX', expiresAt: start }),
    JSON.stringify({ initials: 'DX', expiresAt: start - 1 }),
    JSON.stringify({ initials: 'DX', expiresAt: start + TTL + 1 }),
    JSON.stringify({ initials: 'DX', expiresAt: String(start + TTL) }),
    JSON.stringify({ initials: 'DX', expiresAt: null }),
    JSON.stringify({ initials: 'DX', expiresAt: start + TTL, email: 'private@example.test' }),
    JSON.stringify({ initials: '<img>', expiresAt: start + TTL }),
    JSON.stringify({ initials: 'ab', expiresAt: start + TTL }),
    JSON.stringify({ initials: 'ABC', expiresAt: start + TTL }),
    JSON.stringify({ initials: '', expiresAt: start + TTL }),
  ];
  for (const value of invalid) { f.values.set(key, value); assert.equal(hints.read(), null, value); }
});

test('only exact project hostnames select a hint namespace', () => {
  for (const invalid of [undefined, '', 'https://' + project, project + '/', project + '.evil.test', 'EXAMPLE.supabase.co', '../' + project, 'a.b.supabase.co']) {
    const f = storageFixture(), hints = createAccountHintStore({ storage: f.storage, project: invalid });
    assert.equal(hints.read(), null); assert.equal(hints.write({ initials: 'DX' }), false); assert.equal(hints.clear(), false);
    assert.deepEqual(f.calls, []);
  }
});

test('blocked, absent and throwing storage is fail-closed and never escapes', () => {
  for (const storage of [undefined, {}, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } }]) {
    const hints = createAccountHintStore({ storage, project });
    assert.equal(hints.read(), null); assert.equal(hints.write({ initials: 'DX' }), false); assert.equal(hints.clear(), false);
  }
  const f = storageFixture(), hints = createAccountHintStore({ storage: f.storage, project, now: () => Number.NaN });
  assert.equal(hints.write({ initials: 'DX' }), false);
  for (const value of [null, undefined, {}, { initials: 'x' }, { initials: 'LONG' }, { initials: '<' }]) assert.equal(hints.write(value), false);
});

test('clearing a hint leaves all other storage entries untouched', () => {
  const f = storageFixture(), hints = createAccountHintStore({ storage: f.storage, project, now: () => start });
  f.values.set('unrelated-key', 'unchanged'); hints.write({ initials: 'DX' }); f.calls.length = 0;
  assert.equal(hints.clear(), true); assert.deepEqual([...f.values], [['unrelated-key', 'unchanged']]);
  assert.deepEqual(f.calls, [['remove', key]]);
});

test('missing hint leaves working native sign-in/register/account anchors', () => {
  const f = fixture(); assertGuest(f);
  assert.equal(f.signin.getAttribute('href'), '/test/forum-v1/#signin');
  assert.equal(f.register.getAttribute('href'), '/test/forum-v1/#register');
  assert.equal(f.account.getAttribute('href'), '/test/forum-v1/#account');
  assert.equal(f.signin.click().defaultPrevented, false);
  assert.equal(f.register.click().defaultPrevented, false);
  f.ui.dispose();
});

test('passive hint shows initials and neutral account guidance without asserting a session', () => {
  const f = fixture({ initials: 'DX' }); assertHint(f);
  assert.equal(f.nodes.member.open, false);
  f.nodes.member.open = true;
  assert.equal(f.account.click().defaultPrevented, false);
  assert.equal(f.account.getAttribute('href'), '/test/forum-v1/#account');
  assert.doesNotMatch(f.nodes.root.textContent, /signed in|verified|@|owner|moderator/i);
  assert.equal(f.calls.every(call => call[1] === key), true);
  f.ui.dispose();
});

test('one local expiry timer clears visible initials and the open menu without polling', () => {
  const f = fixture({ initials: 'DX' }); f.nodes.member.open = true;
  assert.equal(f.timers.size, 1); assert.equal([...f.timers.values()][0].delay, TTL);
  const reads = f.calls.length; f.advance(TTL); f.runTimers();
  assertGuest(f); assert.equal(f.calls.length, reads); assert.equal(f.timers.size, 0);
  f.ui.dispose();
});

test('Escape closes an open native menu and returns focus to its summary', () => {
  const f = fixture({ initials: 'DX' }); const summary = f.nodes.member.querySelector('summary');
  f.nodes.member.open = true;
  assert.equal(f.nodes.member.dispatch('keydown', { key: 'Enter' }).defaultPrevented, false);
  assert.equal(f.nodes.member.open, true);
  assert.equal(f.nodes.member.dispatch('keydown', { key: 'Escape' }).defaultPrevented, true);
  assert.equal(f.nodes.member.open, false); assert.equal(summary.focused, true);
  assert.deepEqual(summary.focusOptions, { preventScroll: true });
  assert.equal(f.nodes.member.dispatch('keydown', { key: 'Escape' }).defaultPrevented, false);
  f.ui.dispose(); assert.equal(f.nodes.member.events.get('keydown').size, 0);
});

test('focus rereads the current hint and clears a removed or changed menu', () => {
  const f = fixture({ initials: 'DX' }); f.nodes.member.open = true;
  f.hints.write({ initials: 'AB' }); f.window.dispatch('focus'); assertHint(f, 'AB'); assert.equal(f.nodes.member.open, false);
  f.nodes.member.open = true; f.hints.clear(); f.window.dispatch('focus'); assertGuest(f);
  f.ui.dispose();
});

test('hidden documents clear their hint immediately and reread only after becoming visible', () => {
  const f = fixture({ initials: 'DX' }); f.nodes.member.open = true;
  f.visibility(true); assertGuest(f); assert.equal(f.timers.size, 0);
  const reads = f.calls.length; f.window.dispatch('focus'); assert.equal(f.calls.length, reads);
  f.hints.clear(); f.visibility(false); assertGuest(f);
  f.ui.dispose();
});

test('BFCache departure clears initials and a restored page rereads rather than restoring stale state', () => {
  const f = fixture({ initials: 'DX' }); f.nodes.member.open = true;
  f.window.dispatch('pagehide', { persisted: true }); assertGuest(f);
  const reads = f.calls.length; f.window.dispatch('focus'); assert.equal(f.calls.length, reads);
  f.hints.clear(); f.window.dispatch('pageshow', { persisted: true }); assertGuest(f);
  f.hints.write({ initials: 'B2' }); f.window.dispatch('focus'); assertHint(f, 'B2');
  f.ui.dispose();
});

test('expired hints remain guests after pageshow and focus without renewing their record', () => {
  const f = fixture({ initials: 'DX' }); const saved = f.values.get(key);
  f.window.dispatch('pagehide', { persisted: true }); f.advance(TTL);
  f.window.dispatch('pageshow', { persisted: true }); f.window.dispatch('focus'); assertGuest(f);
  assert.equal(f.values.get(key), saved); f.ui.dispose();
});

test('nonpersisted pagehide disposes listeners and preserves only the original hint store', () => {
  const f = fixture({ initials: 'DX' }); const saved = f.values.get(key);
  f.window.dispatch('pagehide', { persisted: false }); assertGuest(f);
  assert.equal(f.window.events.get('focus').size, 0);
  assert.equal(f.window.events.get('pagehide').size, 0);
  assert.equal(f.document.events.get('visibilitychange').size, 0);
  const reads = f.calls.length;
  f.window.dispatch('pageshow', { persisted: true }); f.window.dispatch('focus'); assert.equal(f.calls.length, reads);
  assert.equal(f.values.get(key), saved); f.ui.dispose();
});

test('setup is idempotent, absent widgets are harmless and community pages are untouched', () => {
  const f = fixture({ initials: 'DX' });
  assert.equal(setupSiteAccount({ ...f, hints: f.hints, now: f.now }), f.ui);
  assert.equal(f.window.events.get('focus').size, 1); f.ui.dispose();
  const empty = createSiteAccountDom(); empty.document.children = [];
  assert.equal(setupSiteAccount({ ...empty }), null);
  const community = createSiteAccountDom(), node = community.document.createElement('main'); node.setAttribute('id', 'rc-root'); community.document.append(node);
  let read = false;
  assert.equal(setupSiteAccount({ ...community, hints: { read() { read = true; } } }), null);
  assert.equal(read, false);
});

test('initially hidden documents scrub stale presentation without reading a hint', () => {
  const f = createSiteAccountDom(); f.document.hidden = true;
  f.nodes.avatar.textContent = 'OLD'; f.nodes.member.hidden = false; f.nodes.member.open = true;
  let reads = 0;
  const ui = setupSiteAccount({ ...f, hints: { read() { reads += 1; } } });
  assertGuest(f); assert.equal(reads, 0); ui.dispose();
});

test('a malformed or throwing injected hint store cannot display arbitrary text', () => {
  for (const read of [() => { throw Error('unavailable'); }, () => ({ initials: '<img>', expiresAt: start + TTL }), () => ({ initials: 'DX', expiresAt: start + TTL + 1 })]) {
    const f = createSiteAccountDom(), ui = setupSiteAccount({ ...f, hints: { read }, now: () => start });
    assertGuest(f); ui.dispose();
  }
});

test('global entry reads only the public project selector and skips community pages', () => {
  const entry = source('site-account-entry').replace(/^import .*;\n/gm, '');
  const f = createSiteAccountDom(), calls = []; f.nodes.root.dataset.project = project;
  let storageReads = 0;
  Object.defineProperty(f.window, 'sessionStorage', { get() { storageReads += 1; return 'storage-fixture'; } });
  runInNewContext(entry, { ...f, createAccountHintStore: options => { calls.push(options); return 'hints-fixture'; }, setupSiteAccount: options => calls.push(options) });
  assert.equal(storageReads, 1); assert.equal(calls[0].project, project); assert.equal(calls[0].storage, 'storage-fixture'); assert.equal(calls[1].hints, 'hints-fixture');
  const node = f.document.createElement('main'); node.setAttribute('id', 'rc-root'); f.document.append(node);
  calls.length = 0;
  runInNewContext(entry, { ...f, createAccountHintStore() { throw Error('must not initialize'); }, setupSiteAccount() { throw Error('must not initialize'); } });
  assert.equal(storageReads, 1); assert.deepEqual(calls, []);
});

test('blocked entry storage preserves the native guest links', () => {
  const entry = source('site-account-entry').replace(/^import .*;\n/gm, '');
  const f = createSiteAccountDom(); f.nodes.root.dataset.project = project;
  Object.defineProperty(f.window, 'sessionStorage', { get() { throw Error('denied'); } });
  assert.doesNotThrow(() => runInNewContext(entry, { ...f, createAccountHintStore, setupSiteAccount }));
  assertGuest(f); assert.equal(f.signin.getAttribute('href'), '/test/forum-v1/#signin');
});

test('global entry bundles only the three passive modules and contains no auth/network/credential workflow', async () => {
  const result = await build({ absWorkingDir: new URL('..', import.meta.url).pathname,
    entryPoints: ['assets/js/site-account-entry.mjs'], bundle: true, write: false, platform: 'browser', format: 'esm', metafile: true });
  assert.deepEqual(Object.keys(result.metafile.inputs).sort(), ['assets/js/site-account-entry.mjs', 'assets/js/site-account-hint.mjs', 'assets/js/site-account.mjs']);
  const code = ['site-account', 'site-account-entry', 'site-account-hint'].map(source).join('\n');
  assert.doesNotMatch(code, /@supabase|auth-controller|community-ui|email-stepup|createClient|getAccessToken|access_token|refresh_token|publishableKey|fetch\(|XMLHttpRequest|WebSocket|setInterval|localStorage|document\.cookie|console\.|innerHTML|insertAdjacentHTML|signOut\(|cancel\(/);
  assert.doesNotMatch(code, /window\.[A-Za-z_$][\w$]*\s*=/, 'No controller or SDK global exports');
  assert.match(code, /dex-community-account-view:/);
});

test('actual global template has only fixed account links and no credentials, email, administrator or signout controls', () => {
  const template = readFileSync(new URL('../layouts/_partials/site-navigation/account.html', import.meta.url), 'utf8');
  for (const hash of ['signin', 'register', 'account']) assert.ok(template.includes(`/test/forum-v1/#${hash}`));
  assert.doesNotMatch(template, /<form\b|<input\b|<textarea\b|data-site-account-(?:email|admin|signout)|publishableKey|access_token|refresh_token/);
  const assets = readFileSync(new URL('../layouts/_partials/site-navigation/assets.html', import.meta.url), 'utf8');
  assert.match(assets, /not \(partial "community\/is-test.html"/);
  assert.match(assets, /js\/generated\/site-account\.js/);
});
