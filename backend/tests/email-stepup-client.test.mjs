import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailStepupClient } from '../client/email-stepup-client.mjs';
const ID = '11111111-1111-4111-8111-111111111111', TARGET = '22222222-2222-4222-8222-222222222222';
const NOW = 2_000_000_000_000;
const action = { scope: 'action', action: 'moderate_post', targetId: TARGET, expectedVersion: 1, payload: { action: 'hide', reason: 'Review' } };
const hasCode = code => error => error.code === code;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options = {}) {
  let time = NOW, scope = 'action'; const calls = [];
  const client = createEmailStepupClient({ enabled: true, origin: 'https://synthetic.test', now: () => time, ...options,
    getAccessToken: async () => 'synthetic_primary_password_token', fetchImpl: async (url, init) => {
      calls.push({ url, body: init.body && JSON.parse(init.body) });
      if (url.endsWith('/begin')) scope = JSON.parse(init.body).scope;
      const data = url.endsWith('/begin') ? { id: ID, scope, expires_epoch: NOW / 1000 + 300 }
        : url.endsWith('/verify') ? { verified: true, id: ID, scope, expires_epoch: NOW / 1000 + (scope === 'action' ? 120 : 3600) }
        : url.endsWith('/cancel') ? { cancelled: true, already_used: false } : { enabled: true, admitted: false, idle_expires_epoch: null, absolute_expires_epoch: null };
      return new Response(JSON.stringify({ data }));
    } });
  return { client, calls, setTime: value => { time = value; } };
}
test('exact-action handoff is explicit, single-use, signal-only and emits no challenge ID', async () => {
  const f = fixture(); let invoked = 0; await f.client.begin(action); const verified = await f.client.verify('123456');
  assert.equal(verified.actionReady, true); assert.equal(verified.busy, false);
  assert.equal(f.client.getState().actionReady, true); assert.equal(f.client.getState().actionExpiresAt, NOW + 120_000);
  const result = await f.client.consumeAction(async (...args) => { invoked++; assert.equal(args.length, 1); assert.ok(args[0] instanceof AbortSignal); return { data: 'saved' }; });
  assert.deepEqual(result, { data: 'saved' }); assert.equal(invoked, 1); assert.equal(f.client.getState().actionReady, false);
  assert.doesNotMatch(JSON.stringify(f.client.getState()), new RegExp(ID));
  await assert.rejects(f.client.consumeAction(() => { invoked++; }), hasCode('ACTION_NOT_READY')); assert.equal(invoked, 1);
});
test('missing or expired exact-action proof never invokes a mutation', async () => {
  const f = fixture(); let invoked = false; await assert.rejects(f.client.consumeAction(() => { invoked = true; }), hasCode('ACTION_NOT_READY'));
  await f.client.begin(action); await f.client.verify('123456'); f.setTime(NOW + 120_000);
  assert.equal(f.client.getState().actionReady, false);
  await assert.rejects(f.client.consumeAction(() => { invoked = true; }), hasCode('ACTION_NOT_READY')); assert.equal(invoked, false);
});
test('uncertain mutation cannot be retried and retains cancellation handle', async () => {
  const f = fixture(); await f.client.begin(action); await f.client.verify('123456'); let attempts = 0;
  await assert.rejects(f.client.consumeAction(async () => { attempts++; throw Error('PRIVATE'); }), hasCode('REQUEST_FAILED'));
  await assert.rejects(f.client.consumeAction(async () => { attempts++; }), hasCode('ACTION_NOT_READY')); assert.equal(attempts, 1);
  await f.client.cancel(); assert.deepEqual(f.calls.at(-1).body, { challenge_id: ID }); assert.equal(f.client.getState().cancellationStatus, 'confirmed');
});
test('version conflict stays sanitized while blocking silent retry', async () => {
  const f = fixture(); await f.client.begin(action); await f.client.verify('123456');
  await assert.rejects(f.client.consumeAction(async () => { throw { code: 'version_conflict', message: 'PRIVATE' }; }), hasCode('version_conflict'));
  assert.doesNotMatch(JSON.stringify(f.client.getState()), /PRIVATE/); assert.equal(f.client.getState().actionReady, false);
});
test('cancel concurrent with a mutation aborts its signal and fences late success', async () => {
  const f = fixture(), gate = deferred(), started = deferred(); await f.client.begin(action); await f.client.verify('123456'); let signal;
  const work = f.client.consumeAction(async value => { signal = value; started.resolve(); await gate.promise; return { data: 'saved' }; });
  const rejected = assert.rejects(work, hasCode('CANCELLED')); await started.promise; await f.client.cancel();
  assert.equal(signal.aborted, true); gate.resolve(); await rejected; assert.equal(f.client.getState().status, 'cancelled');
});
test('BFCache suspension preserves cancellation ID but cannot confirm a stale action', async () => {
  const f = fixture(); await f.client.begin(action); await f.client.verify('123456'); const count = f.calls.length;
  f.client.suspend(); assert.equal(f.calls.length, count); assert.equal(f.client.getState().actionReady, false);
  await assert.rejects(f.client.consumeAction(() => assert.fail('Unexpected mutation')), hasCode('CANCELLATION_REQUIRED'));
  await f.client.cancel(); assert.deepEqual(f.calls.at(-1).body, { challenge_id: ID });
});
test('new controller has no permission from disposed prior session', async () => {
  const f = fixture(); await f.client.begin(action); await f.client.verify('123456'); await f.client.dispose();
  await assert.rejects(f.client.consumeAction(() => assert.fail()), hasCode('CANCELLED'));
  const next = fixture(); await assert.rejects(next.client.consumeAction(() => assert.fail()), hasCode('ACTION_NOT_READY'));
});

test('admission verification never hands out an action confirmation', async () => {
  const f = fixture(); await f.client.begin(); await f.client.verify('123456');
  assert.equal(f.client.getState().actionReady, false);
  await assert.rejects(f.client.consumeAction(() => assert.fail('Admission cannot mutate')), hasCode('ACTION_NOT_READY'));
});
test('stalled mutation is bounded, leaves permission unresolved, and never silently repeats', async () => {
  const f = fixture({ timeoutMs: 5 }); await f.client.begin(action); await f.client.verify('123456'); let signal, count = 0;
  await assert.rejects(f.client.consumeAction(value => { signal = value; count++; return new Promise(() => {}); }), hasCode('ACTION_UNCONFIRMED'));
  assert.equal(signal.aborted, true); assert.equal(count, 1); assert.equal(f.client.getState().actionReady, false);
  await f.client.cancel(); assert.deepEqual(f.calls.at(-1).body, { challenge_id: ID });
});
