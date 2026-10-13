import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCommunityAccountHint } from '../assets/js/community-account-hint.mjs';
import { communityIntent } from '../assets/js/community-intents.mjs';

test('hint writer stores initials only from verified community Auth and clears logout/recovery', () => {
  let emit; const written = []; let cleared = 0;
  const auth = { subscribe(listener) { emit = listener; return () => { emit = null; }; } };
  const stop = bindCommunityAccountHint(auth, { write: value => written.push(value), clear: () => { cleared++; } });
  const user = { id: 'PRIVATE_UUID', email: 'synthetic.person@example.invalid', emailVerified: true };
  emit({ status: 'signed_in', busy: false, user, role: 'owner', access_token: 'PRIVATE_TOKEN' });
  assert.deepEqual(written, [{ initials: 'SY' }]); assert.doesNotMatch(JSON.stringify(written), /PRIVATE|example|owner/);
  emit({ status: 'refreshing', busy: true, user }); assert.equal(written.length, 1);
  emit({ status: 'signed_in', busy: false, user: { ...user, emailVerified: false } });
  emit({ status: 'signing_out', busy: true, user }); emit({ status: 'recovery_ready', recovery: {}, user }); emit({ status: 'signed_out' });
  emit({ status: 'signed_in', user, error: { code: 'AUTH_FAILED' } });
  assert.equal(cleared, 5); assert.equal(written.length, 1); stop(); assert.equal(emit, null);
});
test('navigation intent is an exact same-origin forum fragment, never a redirect or action', () => {
  const origin = 'https://community.test', base = origin + '/test/forum-v1/';
  assert.equal(communityIntent(base + '#signin', origin), 'signin'); assert.equal(communityIntent(base + '#register', origin), 'signup');
  assert.equal(communityIntent(base + '#account', origin), 'account');
  for (const url of [base + '#signout', base + '#reset', base + '#signin&next=/admin', base + '?next=https://evil.invalid#signin', base + '#%73ignin', 'https://evil.invalid/test/forum-v1/#signin', origin + '/post/article/#account', 'not-a-url']) assert.equal(communityIntent(url, origin), null);
});
