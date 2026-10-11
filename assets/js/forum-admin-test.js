// Local UI demonstration only. The role gate is not authentication or security.
const keys = { discussions: 'dex-onsite-forum-test-v1', board: 'dex-onsite-message-board-test-v1' };
const roleKey = 'dex-forum-demo-role';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const collections = {
  discussions: { items: [], raw: null, error: '', missing: true },
  board: { items: [], raw: null, error: '', missing: true }
};
let active = false;
let panel = 'discussions';
let editor = null;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('#toast').style.display = 'none'; }, 4500);
}

function validCollection(value, kind) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.author !== 'string' || typeof item.body !== 'string') return false;
    ids.add(item.id);
    if (item.hidden !== undefined && typeof item.hidden !== 'boolean') return false;
    if (kind === 'board') return true;
    return typeof item.title === 'string' && typeof item.category === 'string'
      && (item.stamp === undefined || (typeof item.stamp === 'number' && Number.isFinite(item.stamp)))
      && ['pinned', 'locked'].every(field => item[field] === undefined || typeof item[field] === 'boolean')
      && Array.isArray(item.replies)
      && item.replies.every(reply => reply && typeof reply === 'object' && typeof reply.author === 'string' && typeof reply.body === 'string');
  });
}

function readCollection(kind) {
  const state = collections[kind];
  const name = kind === 'board' ? 'Message-board' : 'Discussion';
  try {
    const raw = localStorage.getItem(keys[kind]);
    if (raw === null || raw === undefined) {
      Object.assign(state, { items: [], raw: null, error: '', missing: true });
      return true;
    }
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('invalid-data'); }
    if (!validCollection(value, kind)) throw new Error('invalid-data');
    Object.assign(state, { items: value, raw, error: '', missing: false });
    return true;
  } catch (error) {
    const detail = error.message === 'invalid-data'
      ? 'saved data is invalid. It has not been replaced. Restore a valid copy in this browser, then refresh.'
      : 'browser storage is unavailable. Allow storage for this site, then refresh.';
    Object.assign(state, { items: [], error: `${name} ${detail} Changes to this section are disabled.` });
    return false;
  }
}

function closeEditor() {
  editor = null;
  $('#admin-editor').close();
  $('#admin-edit-error').hidden = true;
}

function readRole() {
  try { return sessionStorage.getItem(roleKey) === 'admin'; } catch { return false; }
}

function updateRole() {
  active = readRole();
  $('#admin-gate').hidden = active;
  $('#admin-tools').hidden = !active;
  $('#admin-session-status').textContent = active
    ? 'Moderator demo · UI simulation only, with no real authentication.'
    : 'Visitor or member mode · enter the moderator demo to open management tools.';
  if (!active) {
    if (editor) closeEditor();
    $('#admin-discussions').innerHTML = '';
    $('#admin-board').innerHTML = '';
  }
  return active;
}

function editError(message) {
  $('#admin-edit-error').textContent = message;
  $('#admin-edit-error').hidden = false;
}

function reload(message = '') {
  readCollection('discussions');
  readCollection('board');
  updateRole();
  if (editor) {
    const latest = collections[editor.kind].items.find(item => item.id === editor.id);
    if (!latest || JSON.stringify(latest) !== editor.original) {
      editError('This item changed elsewhere. Your draft is still here, but cannot overwrite newer content. Cancel editing and reopen the item to use the latest version.');
    }
  }
  $('#admin-sync-notice').textContent = message;
  render();
}

function matches(item, kind) {
  const query = $('#admin-search').value.trim().toLowerCase();
  const status = $('#admin-status-filter').value;
  if (status === 'hidden' && !item.hidden) return false;
  if (status === 'visible' && item.hidden) return false;
  if (status === 'pinned' && (kind !== 'discussions' || !item.pinned)) return false;
  if (status === 'locked' && (kind !== 'discussions' || !item.locked)) return false;
  const replies = kind === 'discussions' ? item.replies.map(reply => `${reply.author} ${reply.body}`).join(' ') : '';
  return `${item.title || ''} ${item.category || ''} ${item.author} ${item.body} ${replies}`.toLowerCase().includes(query);
}

function actionButton(kind, id, action, label, replyIndex) {
  const reply = replyIndex === undefined ? '' : ` data-reply-index="${replyIndex}"`;
  return `<button type="button" class="outline" data-kind="${kind}" data-id="${escape(id)}" data-action="${action}"${reply}>${label}</button>`;
}

function recordMarkup(item, kind) {
  const topic = kind === 'discussions';
  const flags = `<span class="admin-flag">${item.hidden ? 'Hidden' : 'Visible'}</span>`
    + (topic ? `<span class="admin-flag">${item.pinned ? 'Pinned' : 'Not pinned'}</span><span class="admin-flag">${item.locked ? 'Locked' : 'Open'}</span>` : '');
  const replies = topic && item.replies.length ? `<details class="admin-replies"><summary>${item.replies.length} ${item.replies.length === 1 ? 'reply' : 'replies'} · view and edit</summary>${item.replies.map((reply, index) => `<article class="reply"><small>${escape(reply.author)} · local demo</small><p class="reply-body">${escape(reply.body)}</p>${actionButton(kind, item.id, 'edit-reply', 'Edit reply', index)}</article>`).join('')}</details>` : '';
  return `<article class="admin-record${item.hidden ? ' is-hidden' : ''}"><div class="admin-meta">${topic ? `<span class="badge">${escape(item.category)}</span><span>·</span>` : ''}<span>${escape(item.author)}</span><span>· local demo</span></div>${topic ? `<h3>${escape(item.title)}</h3>` : ''}<div class="admin-flags">${flags}</div><p class="admin-body">${escape(item.body)}</p><div class="admin-actions">${actionButton(kind, item.id, 'edit', topic ? 'Edit discussion' : 'Edit message')}${actionButton(kind, item.id, 'hide', item.hidden ? 'Restore locally' : 'Hide locally')}${topic ? actionButton(kind, item.id, 'pin', item.pinned ? 'Unpin locally' : 'Pin locally') + actionButton(kind, item.id, 'lock', item.locked ? 'Unlock locally' : 'Lock locally') : ''}</div>${replies}</article>`;
}

function renderCollection(kind) {
  const state = collections[kind];
  const rows = state.items.filter(item => matches(item, kind));
  if (kind === 'discussions') rows.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.stamp || 0) - (a.stamp || 0));
  const singular = kind === 'board' ? 'message' : 'discussion';
  $(`#admin-${kind === 'board' ? 'board' : 'discussion'}-count`).textContent = state.error
    ? 'Saved data unavailable · editing disabled'
    : `${rows.length} of ${state.items.length} ${state.items.length === 1 ? singular : `${singular}s`} · saved in this browser`;
  const empty = state.error ? 'This section cannot load safely. Check the storage notice above.'
    : state.missing ? 'No local content has been saved yet. Go Back to community and use its management link to load sample content, or create a local post first.'
      : 'No matching content. Try another search or status.';
  $(`#admin-${kind}`).innerHTML = rows.length ? rows.map(item => recordMarkup(item, kind)).join('') : `<p class="empty">${empty}</p>`;
}

function render() {
  if (!active) return;
  const errors = Object.values(collections).map(state => state.error).filter(Boolean);
  $('#admin-data-error').textContent = errors.join(' ');
  $('#admin-data-error').hidden = !errors.length;
  const topics = collections.discussions.items;
  const board = collections.board.items;
  $('#admin-topic-total').textContent = collections.discussions.error ? '—' : String(topics.length);
  $('#admin-reply-total').textContent = collections.discussions.error ? '—' : String(topics.reduce((total, item) => total + item.replies.length, 0));
  $('#admin-board-total').textContent = collections.board.error ? '—' : String(board.length);
  $('#admin-hidden-total').textContent = errors.length ? '—' : String([...topics, ...board].filter(item => item.hidden).length);
  renderCollection('discussions');
  renderCollection('board');
}

function saveCollection(kind, next) {
  try {
    const raw = JSON.stringify(next);
    localStorage.setItem(keys[kind], raw);
    Object.assign(collections[kind], { items: next, raw, error: '', missing: false });
    return true;
  } catch {
    collections[kind].error = 'Browser storage could not save this change. Existing saved data has not been replaced. Free up storage or allow it for this site, then refresh and try again.';
    render();
    return false;
  }
}

function openEditor(kind, id, replyIndex) {
  if (!updateRole() || !readCollection(kind)) { render(); return; }
  const item = collections[kind].items.find(row => row.id === id);
  if (!item || (replyIndex !== undefined && (!Number.isInteger(replyIndex) || !item.replies?.[replyIndex]))) return;
  editor = { kind, id, replyIndex, original: JSON.stringify(item) };
  const topic = kind === 'discussions' && replyIndex === undefined;
  $('#admin-editor-title').textContent = replyIndex !== undefined ? 'Edit reply' : topic ? 'Edit discussion' : 'Edit message';
  $('#admin-title-label').hidden = !topic;
  $('#admin-edit-title').required = topic;
  $('#admin-edit-title').disabled = !topic;
  $('#admin-edit-title').value = topic ? item.title : '';
  $('#admin-edit-body').value = replyIndex !== undefined ? item.replies[replyIndex].body : item.body;
  $('#admin-edit-body').minLength = topic ? 10 : 2;
  $('#admin-edit-body').maxLength = topic ? 6000 : replyIndex !== undefined ? 4000 : 2000;
  $('#admin-edit-error').hidden = true;
  if (!$('#admin-editor').open) $('#admin-editor').showModal();
  $(topic ? '#admin-edit-title' : '#admin-edit-body').focus();
}

function handleAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button || !updateRole()) return;
  const { kind, id, action } = button.dataset;
  if (!Object.hasOwn(collections, kind)) return;
  if (action === 'edit' || action === 'edit-reply') {
    openEditor(kind, id, action === 'edit-reply' ? Number(button.dataset.replyIndex) : undefined);
    return;
  }
  const field = { hide: 'hidden', pin: 'pinned', lock: 'locked' }[action];
  if (!field || (kind === 'board' && field !== 'hidden') || !readCollection(kind)) { render(); return; }
  const next = structuredClone(collections[kind].items);
  const item = next.find(row => row.id === id);
  if (!item) { reload('That item is no longer available. Local data has been refreshed.'); return; }
  item[field] = !item[field];
  if (saveCollection(kind, next)) {
    render();
    toast('Local preview updated. No live content was changed.');
  }
}

$('#admin-edit-form').onsubmit = event => {
  event.preventDefault();
  if (!editor || !updateRole()) return;
  const { kind, id, replyIndex, original } = editor;
  if (!readCollection(kind)) { editError('Saved data cannot be read safely. Your draft has not been saved.'); render(); return; }
  const next = structuredClone(collections[kind].items);
  const item = next.find(row => row.id === id);
  if (!item || JSON.stringify(item) !== original) {
    editError('This item changed elsewhere. Nothing was overwritten. Cancel editing and reopen the item before making your change.');
    render();
    return;
  }
  const topic = kind === 'discussions' && replyIndex === undefined;
  const title = $('#admin-edit-title').value.trim();
  const body = $('#admin-edit-body').value.trim();
  const minBody = topic ? 10 : 2;
  const maxBody = topic ? 6000 : replyIndex !== undefined ? 4000 : 2000;
  if (body.length < minBody || body.length > maxBody || (topic && (title.length < 5 || title.length > 140))) {
    editError(`Use ${minBody}–${maxBody} characters for the body${topic ? ' and 5–140 characters for the title' : ''}.`);
    return;
  }
  if (replyIndex !== undefined) item.replies[replyIndex].body = body;
  else { item.body = body; if (topic) item.title = title; }
  if (!saveCollection(kind, next)) { editError('The change could not be saved to browser storage. Your draft is still here.'); return; }
  closeEditor();
  render();
  toast('Changes saved in this browser only.');
};

$('#admin-enter').onclick = () => {
  try { sessionStorage.setItem(roleKey, 'admin'); } catch {
    toast('Session storage is unavailable. Allow browser storage to enter the moderator demo.');
    return;
  }
  reload('Moderator demo opened. All changes remain local to this browser.');
};
$('#admin-exit').onclick = () => {
  try { sessionStorage.removeItem(roleKey); } catch {
    toast('The demo session could not be cleared. Close this tab to end the session.');
    return;
  }
  updateRole();
  toast('Moderator demo ended. Local content is still saved.');
};
$('#admin-refresh').onclick = () => reload('Local data refreshed.');
$('#admin-search').oninput = render;
$('#admin-status-filter').onchange = render;
$('#admin-discussions').onclick = handleAction;
$('#admin-board').onclick = handleAction;
$('#admin-edit-cancel').onclick = closeEditor;
$('#admin-editor-close').onclick = closeEditor;
$('#admin-editor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('#admin-editor').addEventListener('close', () => { editor = null; });
function showPanel(name) {
  panel = name;
  for (const value of ['discussions', 'board']) {
    $(`#admin-${value}-panel`).hidden = value !== panel;
    $(`#admin-show-${value}`).setAttribute('aria-pressed', String(value === panel));
  }
}
$('#admin-show-discussions').onclick = () => showPanel('discussions');
$('#admin-show-board').onclick = () => showPanel('board');
addEventListener('storage', event => {
  if (event.key === null || event.key === keys.discussions || event.key === keys.board || event.key === roleKey) reload('Local data refreshed after a change in another page.');
});
addEventListener('focus', () => reload());
addEventListener('pageshow', () => reload());
reload();
