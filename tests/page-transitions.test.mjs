import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script = readFileSync(new URL('../assets/js/page-transitions.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/css/page-transitions.css', import.meta.url), 'utf8');
const partial = readFileSync(new URL('../layouts/_partials/page-transitions/assets.html', import.meta.url), 'utf8');

test('navigation never uses captured documents or delays; curtain is decorative and finite', () => {
  assert.match(css, /@view-transition\s*\{\s*navigation: none;/);
  assert.doesNotMatch(css, /navigation: auto|view-transition-name/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /opacity: 0/);
  assert.match(css, /dex-entry-blackout 180ms/);
  assert.match(script, /window.setTimeout\(stop, 900\)/);
  assert.doesNotMatch(script, /preventDefault|pushState|replaceState|startViewTransition|scrollTo|fetch\(|inert/);
  assert.match(script, /fill: "backwards"/);
  assert.match(partial, /<script id="dex-page-transition-script">/);
  assert.doesNotMatch(partial, /blocking=|<link|async|defer/);
});

function fixture(options = {}) {
  const events = {};
  const calls = [];
  const masks = [];
  const timers = [];
  const stored = new Map();
  const now = Date.now();
  if (options.marker !== false) stored.set('dex:page-entry', JSON.stringify({ from: 'https://dex.test/', to: 'https://dex.test/post/example/', time: now, ...options.marker }));
  const listen = (type, handler) => { (events[type] ||= []).push(handler); };
  const nodes = Array.from({ length: 7 }, (_, index) => ({
    complete: options.loaded !== false, naturalWidth: options.loaded === false ? 0 : 1200,
    contains: () => false,
    matches: () => index === 2,
    closest: () => index === 0 || index === 2 ? {} : null,
    querySelector: () => index === 1 || index === 3 ? {} : null,
    getBoundingClientRect: () => ({ width: 600, height: index === 0 ? 300 : 70, top: options.offscreen ? 1500 : 20 + index * 100, bottom: 350 + index * 100 }),
    animate: options.unsupported ? undefined : function(frames, timing) {
      const animation = { finished: new Promise(() => {}), cancelled: false, cancel() { this.cancelled = true; } };
      calls.push({ node: this, frames, timing, animation }); return animation;
    },
  }));
  const document = { readyState: 'loading', hidden: Boolean(options.hidden), referrer: options.referrer ?? 'https://dex.test/',
    addEventListener: listen,
    querySelector: () => ({ querySelector: () => nodes[0] }), querySelectorAll: () => nodes.slice(1),
    body: { append(node) { masks.push(node); } },
    createElement: () => ({ removed: false, setAttribute() {}, addEventListener() {}, remove() { this.removed = true; } }),
  };
  const motion = { matches: Boolean(options.reduced), addEventListener: (_, fn) => listen('motion', fn) };
  const window = { addEventListener: listen,
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
  };
  const context = { window, document, matchMedia: () => motion, URL, Date,
    location: new URL('https://dex.test/post/example/'), innerHeight: 900, scrollY: options.scroll ?? 0,
    performance: { getEntriesByType: () => [{ type: options.navigationType ?? 'navigate' }] },
    sessionStorage: { getItem(key) { if (options.storageFails) throw Error('disabled'); return stored.get(key) || null; }, removeItem(key) { if (options.storageFails) throw Error('disabled'); stored.delete(key); }, setItem(key, value) { if (options.storageFails) throw Error('disabled'); stored.set(key, value); } } };
  runInNewContext(script, context);
  const fire = (type, event = {}) => { for (const fn of events[type] || []) fn(event); };
  const link = { href: 'https://dex.test/archives/', target: '', hasAttribute: () => false };
  const click = overrides => fire('click', { defaultPrevented: false, button: 0, target: { closest: () => link }, ...overrides });
  return { calls, fire, stored, nodes, document, link, click, motion, masks, timers };
}

test('a fresh native navigation decorates at most five visible real elements', () => {
  const f = fixture(); f.fire('DOMContentLoaded');
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls[0].timing.id, 'dex-cover-pop');
  assert.equal(f.calls[0].timing.delay, 120);
  assert.equal(f.calls[0].timing.duration, 260);
  assert.equal(f.calls[1].timing.id, 'dex-content-enter');
  assert.equal(f.calls[1].timing.duration, 280);
  assert.equal(f.calls[1].timing.delay, 360);
  assert.ok(f.calls.every(call => call.timing.fill === 'backwards'));
  assert.equal(f.stored.size, 0);
});

test('input cancels decoration without cancelling or replaying the input', () => {
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'pagehide', 'motion']) {
    const f = fixture(); f.fire('DOMContentLoaded'); f.fire(type);
    assert.ok(f.calls.every(call => call.animation.cancelled));
  }
  const f = fixture(); f.fire('pointerdown'); f.fire('DOMContentLoaded'); assert.equal(f.calls.length, 0);
});

test('direct loads, history, reload, disabled motion/storage and stale markers stay visible and still', () => {
  for (const options of [{ marker: false }, { navigationType: 'reload' }, { navigationType: 'back_forward' }, { reduced: true }, { storageFails: true }, { hidden: true }, { scroll: 100 }, { offscreen: true }, { unsupported: true }, { referrer: 'https://other.test/' }, { marker: { time: Date.now() - 30000 } }, { marker: { time: null } }]) {
    const f = fixture(options); f.fire('DOMContentLoaded'); assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
});

test('late/missing cover images never postpone content or start a new animation later', () => {
  const f = fixture({ loaded: false }); f.fire('DOMContentLoaded');
  assert.ok(f.calls.length > 0);
  assert.ok(f.calls.every(call => call.timing.id === 'dex-content-enter'));
  f.nodes[0].complete = true; f.nodes[0].naturalWidth = 1200; f.fire('load');
  assert.ok(f.calls.every(call => call.timing.id === 'dex-content-enter'));
});

test('only ordinary same-origin links store an optional one-time entry marker', () => {
  const f = fixture({ marker: false }); f.click(); assert.ok(f.stored.has('dex:page-entry'));
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const f = fixture({ marker: false }); f.click(overrides); assert.equal(f.stored.size, 0);
  }
  for (const alter of [f => { f.link.target = '_blank'; }, f => { f.link.hasAttribute = () => true; }, f => { f.link.href = 'https://other.test/'; }, f => { f.link.href += '#chapter'; }]) {
    const f = fixture({ marker: false }); alter(f); f.click(); assert.equal(f.stored.size, 0);
  }
});


test('interactive elements never move their hit boxes during cancellation', () => {
  const f = fixture();
  f.fire('DOMContentLoaded');
  assert.ok(f.calls.filter(call => call.node === f.nodes[1] || call.node === f.nodes[3]).every(call => call.frames.every(frame => !('transform' in frame))));
});

test('theme controls initialize once at DOM readiness without waiting for image load', () => {
  const source = readFileSync(new URL('../assets/ts/main.ts', import.meta.url), 'utf8');
  assert.match(source, /DOMContentLoaded/);
  assert.match(source, /if \(initialized\) return;/);
  assert.doesNotMatch(source, /addEventListener\('load'|setTimeout/);
});


test('curtain disappears on input and the independent cleanup deadline', () => {
  for (const interrupt of [f => f.fire('pointerdown'), f => f.timers[0].fn()]) {
    const f = fixture(); f.fire('DOMContentLoaded');
    assert.equal(f.masks.length, 1); assert.equal(f.masks[0].className, 'dex-entry-curtain');
    assert.equal(f.timers[0].delay, 900);
    interrupt(f);
    assert.equal(f.masks[0].removed, true);
    assert.ok(f.calls.every(call => call.animation.cancelled));
  }
  const reduced = fixture({ reduced: true }); reduced.fire('DOMContentLoaded'); assert.equal(reduced.masks.length, 0);
});
