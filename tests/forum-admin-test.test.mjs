import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/forum-admin-test.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../layouts/page/forum-admin-test.html', import.meta.url), 'utf8');
const forumKey = 'dex-onsite-forum-test-v1';
const boardKey = 'dex-onsite-message-board-test-v1';
const roleKey = 'dex-forum-demo-role';
const topic = { id: 'topic-1', title: 'A research question', category: 'Industry research', body: 'The original discussion body.', author: 'Research desk', stamp: 7, hidden: false, pinned: false, locked: false, replies: [{ author: 'Demo member', body: 'A useful first reply.' }], extra: { preserved: true } };
const boardMessage = { id: 'board-1', author: 'Demo member', body: 'A local message-board entry.', hidden: false };

function fixture({ role = null, topics = [topic], board = [boardMessage], rawTopics, blocked = false, sessionBlocked = false, writeBlocked = false } = {}) {
  const nodes = new Map();
  const events = new Map();
  const storage = new Map();
  const session = new Map(role ? [[roleKey, role]] : []);
  if (topics !== null) storage.set(forumKey, rawTopics ?? JSON.stringify(topics));
  if (board !== null) storage.set(boardKey, JSON.stringify(board));
  const writes = [];
  const failures = { blocked, sessionBlocked, writeBlocked };
  function el(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', textContent: '', innerHTML: '', hidden: false, style: {}, attrs: {}, open: false,
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, handler) { this[`on${name}`] = handler; },
      focus() { this.focused = true; },
      showModal() { this.open = true; },
      close() { this.open = false; this.onclose?.(); }
    });
    return nodes.get(selector);
  }
  el('#admin-status-filter').value = 'all';
  const context = {
    document: { querySelector: el }, structuredClone, setTimeout: () => 0, clearTimeout() {},
    addEventListener: (name, handler) => events.set(name, handler),
    localStorage: {
      getItem(key) { if (failures.blocked) throw Error('denied'); return storage.get(key) ?? null; },
      setItem(key, value) { if (failures.writeBlocked) throw Error('quota'); storage.set(key, value); writes.push(key); }
    },
    sessionStorage: {
      getItem(key) { if (failures.sessionBlocked) throw Error('denied'); return session.get(key) ?? null; },
      setItem(key, value) { if (failures.sessionBlocked) throw Error('denied'); session.set(key, value); },
      removeItem(key) { if (failures.sessionBlocked) throw Error('denied'); session.delete(key); }
    }
  };
  vm.runInNewContext(source, context);
  function action(kind, id, action, replyIndex) {
    el(`#admin-${kind}`).onclick({ target: { closest: () => ({ dataset: { kind, id, action, ...(replyIndex === undefined ? {} : { replyIndex: String(replyIndex) }) } }) } });
  }
  return {
    el, storage, session, writes, failures, events, action,
    enter() { el('#admin-enter').onclick(); },
    submit({ title, body }) { if (title !== undefined) el('#admin-edit-title').value = title; if (body !== undefined) el('#admin-edit-body').value = body; el('#admin-edit-form').onsubmit({ preventDefault() {} }); },
    topics() { return JSON.parse(storage.get(forumKey)); },
    board() { return JSON.parse(storage.get(boardKey)); }
  };
}

test('standalone management route is noindex, unlisted, and avoids frontend-only account controls', () => {
  const front = readFileSync(new URL('../content/test/forum-admin-v1/index.en.md', import.meta.url), 'utf8');
  assert.match(front, /url: "\/test\/forum-admin-v1\/"/);
  assert.match(front, /type: "page"/);
  assert.match(front, /testpage: true/);
  assert.match(front, /robots: "noindex, nofollow"/);
  assert.match(front, /disable: true/);
  assert.match(front, /list: never/);
  assert.doesNotMatch(front, /forumtest: true/);
  assert.match(html, /css\/forum-test.css/);
  assert.match(html, /css\/forum-admin-test.css/);
  assert.doesNotMatch(html, /js\/forum-test.js/);
  assert.match(html, /Back to community/);
  assert.match(html, /No real authentication or security/);
  assert.match(html, /This is a UI simulation/);
  assert.match(html, /id="admin-tools" hidden/);
  assert.match(html, /partialCached "footer\/footer"/);
});

test('visitor and member roles have no tools or mutation ability before the explicit gate', () => {
  for (const role of [null, 'member', 'unrecognized']) {
    const f = fixture({ role });
    assert.equal(f.el('#admin-tools').hidden, true);
    assert.equal(f.el('#admin-gate').hidden, false);
    assert.equal(f.el('#admin-discussions').innerHTML, '');
    f.action('discussions', 'topic-1', 'hide');
    assert.equal(f.writes.length, 0);
  }
});

test('moderator gate persists the demo role, refresh resumes it, and exit closes tools', () => {
  const f = fixture();
  f.enter();
  assert.equal(f.session.get(roleKey), 'admin');
  assert.equal(f.el('#admin-tools').hidden, false);
  assert.match(f.el('#admin-discussions').innerHTML, /A research question/);
  f.action('discussions', 'topic-1', 'edit');
  f.el('#admin-exit').onclick();
  assert.equal(f.session.has(roleKey), false);
  assert.equal(f.el('#admin-tools').hidden, true);
  assert.equal(f.el('#admin-editor').open, false);
  assert.equal(fixture({ role: 'admin' }).el('#admin-tools').hidden, false);
});

test('topic title and body edits persist while preserving other fields', () => {
  const f = fixture({ role: 'admin' });
  f.action('discussions', 'topic-1', 'edit');
  f.submit({ title: 'An updated research question', body: 'An updated body for a local discussion.' });
  const saved = f.topics()[0];
  assert.equal(saved.title, 'An updated research question');
  assert.equal(saved.body, 'An updated body for a local discussion.');
  assert.deepEqual(saved.replies, topic.replies);
  assert.deepEqual(saved.extra, { preserved: true });
  assert.equal(saved.stamp, 7);
  assert.equal(f.el('#admin-editor').open, false);
});

test('reply and board body edits use their existing schemas and authors', () => {
  const f = fixture({ role: 'admin' });
  f.action('discussions', 'topic-1', 'edit-reply', 0);
  assert.equal(f.el('#admin-title-label').hidden, true);
  f.submit({ body: 'Updated reply text.' });
  assert.equal(f.topics()[0].replies[0].body, 'Updated reply text.');
  assert.equal(f.topics()[0].replies[0].author, 'Demo member');
  f.action('board', 'board-1', 'edit');
  f.submit({ body: 'Updated board message.' });
  assert.equal(f.board()[0].body, 'Updated board message.');
  assert.equal(f.board()[0].author, 'Demo member');
});

test('cancel, close, Escape, and reopening never save an abandoned edit', () => {
  const f = fixture({ role: 'admin' });
  for (const close of ['#admin-edit-cancel', '#admin-editor-close', 'escape']) {
    f.action('discussions', 'topic-1', 'edit');
    f.el('#admin-edit-body').value = 'An abandoned editing draft.';
    if (close === 'escape') f.el('#admin-editor').oncancel({ preventDefault() {} });
    else f.el(close).onclick();
    assert.equal(f.el('#admin-editor').open, false);
    assert.equal(f.writes.length, 0);
    f.action('discussions', 'topic-1', 'edit');
    assert.equal(f.el('#admin-edit-body').value, topic.body);
    f.el('#admin-edit-cancel').onclick();
  }
});

test('hide/restore, pin/unpin, and lock/unlock are reversible persistent changes', () => {
  const f = fixture({ role: 'admin' });
  for (const [action, field] of [['hide', 'hidden'], ['pin', 'pinned'], ['lock', 'locked']]) {
    f.action('discussions', 'topic-1', action);
    assert.equal(f.topics()[0][field], true);
    f.action('discussions', 'topic-1', action);
    assert.equal(f.topics()[0][field], false);
  }
  f.action('board', 'board-1', 'hide');
  assert.equal(f.board()[0].hidden, true);
  f.action('board', 'board-1', 'hide');
  assert.equal(f.board()[0].hidden, false);
  assert.equal(f.topics().length, 1);
  assert.equal(f.board().length, 1);
  assert.doesNotMatch(source, /localStorage\.removeItem|fetch\(|XMLHttpRequest|sendBeacon/);
});

test('search includes replies and status filters work across both sections', () => {
  const f = fixture({ role: 'admin' });
  f.el('#admin-search').value = 'first reply';
  f.el('#admin-search').oninput();
  assert.match(f.el('#admin-discussion-count').textContent, /1 of 1/);
  assert.match(f.el('#admin-board-count').textContent, /0 of 1/);
  f.el('#admin-search').value = '';
  f.el('#admin-status-filter').value = 'hidden';
  f.el('#admin-status-filter').onchange();
  assert.match(f.el('#admin-discussion-count').textContent, /0 of 1/);
  f.action('discussions', 'topic-1', 'hide');
  assert.match(f.el('#admin-discussion-count').textContent, /1 of 1/);
  f.el('#admin-show-board').onclick();
  assert.equal(f.el('#admin-board-panel').hidden, false);
  assert.equal(f.el('#admin-discussions-panel').hidden, true);
  f.el('#admin-show-discussions').onclick();
  assert.equal(f.el('#admin-show-discussions').attrs['aria-pressed'], 'true');
});

test('all saved text and IDs are escaped before rendering', () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const f = fixture({ role: 'admin', topics: [{ ...topic, id: '" onclick="alert(1)', title: malicious, body: malicious, author: malicious, category: malicious, replies: [{ author: malicious, body: malicious }] }], board: [{ ...boardMessage, body: malicious, author: malicious }] });
  for (const section of ['#admin-discussions', '#admin-board']) {
    assert.match(f.el(section).innerHTML, /&lt;img/);
    assert.doesNotMatch(f.el(section).innerHTML, /<img|data-id="" onclick=/);
  }
});

test('corrupt JSON, invalid schemas, and duplicate IDs never get overwritten', () => {
  for (const rawTopics of ['not JSON', '{}', JSON.stringify([{ ...topic, replies: [null] }]), JSON.stringify([topic, topic])]) {
    const f = fixture({ role: 'admin', rawTopics });
    assert.equal(f.el('#admin-data-error').hidden, false);
    assert.match(f.el('#admin-data-error').textContent, /has not been replaced/);
    f.action('discussions', 'topic-1', 'hide');
    assert.equal(f.storage.get(forumKey), rawTopics);
    assert.equal(f.writes.length, 0);
    f.action('board', 'board-1', 'hide');
    assert.equal(f.board()[0].hidden, true, 'Unaffected board section still works');
  }
});

test('missing local data has a helpful empty state and never initializes conflicting seeds', () => {
  const f = fixture({ role: 'admin', topics: null, board: null });
  assert.match(f.el('#admin-discussions').innerHTML, /Back to community/);
  assert.match(f.el('#admin-board').innerHTML, /No local content has been saved/);
  assert.equal(f.writes.length, 0);
});

test('blocked local or session storage fails safely without a fake successful save', () => {
  const f = fixture({ role: 'admin', blocked: true });
  assert.match(f.el('#admin-data-error').textContent, /storage is unavailable/);
  f.action('discussions', 'topic-1', 'hide');
  assert.equal(f.writes.length, 0);
  const gate = fixture({ sessionBlocked: true });
  gate.enter();
  assert.equal(gate.el('#admin-tools').hidden, true);
  assert.match(gate.el('#toast').textContent, /Session storage is unavailable/);
  const quota = fixture({ role: 'admin', writeBlocked: true });
  quota.action('discussions', 'topic-1', 'edit');
  quota.submit({ body: 'A valid edit which cannot be stored.' });
  assert.equal(quota.topics()[0].body, topic.body);
  assert.equal(quota.el('#admin-editor').open, true);
  assert.match(quota.el('#admin-edit-error').textContent, /could not be saved/);
});

test('storage, focus and pageshow reload persisted frontend changes', () => {
  const f = fixture({ role: 'admin' });
  for (const event of ['storage', 'focus', 'pageshow']) {
    const title = `Updated through ${event}`;
    f.storage.set(forumKey, JSON.stringify([{ ...topic, title }]));
    f.events.get(event)({ key: forumKey });
    assert.match(f.el('#admin-discussions').innerHTML, new RegExp(title));
  }
  f.session.set(roleKey, 'member');
  f.events.get('focus')();
  assert.equal(f.el('#admin-tools').hidden, true);
});

test('editing detects stale records and keeps the draft without overwriting external changes', () => {
  const f = fixture({ role: 'admin' });
  f.action('discussions', 'topic-1', 'edit');
  f.el('#admin-edit-body').value = 'My unsaved editing draft.';
  f.storage.set(forumKey, JSON.stringify([{ ...topic, title: 'Changed by another page' }]));
  f.events.get('storage')({ key: forumKey });
  assert.equal(f.el('#admin-edit-body').value, 'My unsaved editing draft.');
  assert.equal(f.el('#admin-edit-error').hidden, false);
  f.submit({ body: 'My unsaved editing draft.' });
  assert.equal(f.topics()[0].title, 'Changed by another page');
  assert.equal(f.topics()[0].body, topic.body);
  assert.equal(f.writes.length, 0);
});

test('mutations reread the latest collection and preserve newly added posts', () => {
  const f = fixture({ role: 'admin' });
  f.storage.set(forumKey, JSON.stringify([topic, { ...topic, id: 'new-2', title: 'A newer topic' }]));
  f.action('discussions', 'topic-1', 'pin');
  assert.equal(f.topics().length, 2);
  assert.equal(f.topics()[0].pinned, true);
});

test('invalid editor lengths and revoked demo roles cannot mutate saved content', () => {
  const f = fixture({ role: 'admin' });
  f.action('discussions', 'topic-1', 'edit');
  f.submit({ title: 'x', body: 'x' });
  assert.match(f.el('#admin-edit-error').textContent, /5–140/);
  assert.equal(f.writes.length, 0);
  f.session.delete(roleKey);
  f.submit({ title: 'A valid title again', body: 'A valid body that must not be saved.' });
  assert.equal(f.writes.length, 0);
  assert.equal(f.el('#admin-editor').open, false);
});

test('management styling follows existing DEX palette with a responsive layout', () => {
  const css = readFileSync(new URL('../assets/css/forum-admin-test.css', import.meta.url), 'utf8');
  assert.match(css, /var\(--df-accent\)/);
  assert.match(css, /var\(--card-background\)/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});
