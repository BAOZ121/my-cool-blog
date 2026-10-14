import test from 'node:test';
import assert from 'node:assert/strict';
import { setupArticleReadingHistory } from '../assets/js/article-visuals.mjs';

function fixture({ history = { state: { applicationProbe: 'keep' }, replaceState(state) { this.state = state; } }, returning = false, top = 11 } = {}) {
  const events = new Map();
  const listen = (name, handler) => { const handlers = events.get(name) || []; handlers.push(handler); events.set(name, handlers); };
  const node = { tagName: 'P', textContent: 'A stable public article paragraph.', isConnected: true, closest() { return null; },
    getBoundingClientRect() { return { top, height: 200, bottom: top + 200 }; } };
  const content = { clientWidth: 1200, querySelectorAll() { return [node]; }, querySelector() { return null; } };
  const document = { hidden: false, documentElement: { scrollHeight: 40000 }, fonts: { ready: new Promise(() => {}) },
    querySelector() { return content; }, addEventListener: listen };
  const window = { history, location: { href: 'https://example.test/post/report/' }, innerHeight: 900,
    performance: { now: () => 0, getEntriesByType: () => [{ type: returning ? 'back_forward' : 'navigate' }] },
    addEventListener: listen, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
    scrollBy() { throw new Error('No correction should happen while fonts are pending'); } };
  setupArticleReadingHistory(document, window);
  return { history, document, position(value) { top = value; }, fire(name, event = {}) { for (const handler of events.get(name) || []) handler(event); } };
}

test('rapid departure and hiding during a pending history restore retain the saved reading line', () => {
  const original = fixture(); original.fire('pagehide');
  const saved = structuredClone(original.history.state);
  const returning = fixture({ history: original.history, returning: true, top: 777 });
  returning.fire('pageshow', { persisted: false });
  returning.document.hidden = true; returning.fire('visibilitychange');
  returning.fire('pagehide');
  assert.deepEqual(returning.history.state, saved, 'Temporary tall-outline geometry cannot overwrite the original reading entry');
});

test('reader input cancels the old target and lets the new position replace it', () => {
  const original = fixture(); original.fire('pagehide');
  const saved = structuredClone(original.history.state);
  const returning = fixture({ history: original.history, returning: true, top: 777 });
  returning.fire('pageshow', { persisted: false });
  returning.fire('wheel'); returning.position(32); returning.fire('pagehide');
  assert.notDeepEqual(returning.history.state, saved);
  assert.equal(returning.history.state.applicationProbe, 'keep');
});

test('graphic-only and hero views clear stale article text without losing other history state', () => {
  const f = fixture(); f.fire('pagehide'); f.position(-1800); f.fire('pagehide');
  assert.deepEqual(f.history.state, { applicationProbe: 'keep' });
});

test('primitive and non-plain application history state retain their original type and value', () => {
  for (const state of ['state', 42, ['entry'], new Date(0)]) {
    const f = fixture({ history: { state, replaceState() { throw new Error('Must not change application state'); } } });
    f.fire('pagehide'); assert.equal(f.history.state, state);
  }
});
