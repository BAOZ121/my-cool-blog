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
  assert.match(css, /dex-entry-blackout 4000ms/);
  assert.match(script, /window.setTimeout\(stop, 4200\)/);
  assert.doesNotMatch(script, /preventDefault|pushState|replaceState|startViewTransition|scrollTo|fetch\(|inert/);
  assert.match(script, /fill: "backwards"/);
  assert.match(partial, /<script\b[^>]*\bid="dex-page-transition-script"[^>]*>/);
  assert.doesNotMatch(partial, /blocking=|<link|async|defer/);
  assert.ok(partial.indexOf("<style") < partial.indexOf("<script"), "Critical entry CSS precedes the head script");
  assert.ok(script.indexOf("  arm();") < script.indexOf('document.addEventListener("DOMContentLoaded", enter'), "Curtain arming cannot wait for DOM readiness");
});

function fixture(options = {}) {
  const events = {};
  const calls = [];
  const masks = [];
  const created = [];
  const timers = [];
  const stored = new Map();
  const now = Date.now();
  let elapsed = 0;
  if (options.marker !== false) stored.set('dex:page-entry', JSON.stringify({ from: 'https://dex.test/', to: 'https://dex.test/post/example/', time: now, ...options.marker }));
  const listen = (type, handler) => { (events[type] ||= []).push(handler); };
  const nodes = Array.from({ length: 7 }, (_, index) => ({
    complete: options.loaded !== false, naturalWidth: options.loaded === false || options.failed ? 0 : 1200,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= new Set()).add(fn); },
    removeEventListener(type, fn) { this.listeners[type]?.delete(fn); },
    contains: () => false,
    matches: () => index === 2,
    closest: () => index === 0 || index === 2 ? {} : null,
    querySelector: () => index === 1 || index === 3 ? {} : null,
    getBoundingClientRect: () => { elapsed += options.layoutCost || 0; return { width: 600, height: index === 0 ? 300 : 70, top: options.offscreen || (options.heroOffscreen && index === 0) ? 1500 : 20 + index * 100, bottom: 350 + index * 100 }; },
    animate: options.unsupported ? undefined : function(frames, timing) {
      const animation = { finished: new Promise(() => {}), cancelled: false, cancel() { this.cancelled = true; } };
      calls.push({ node: this, frames, timing, animation }); return animation;
    },
  }));
  let resolveDecode, rejectDecode;
  if (options.decode === 'pending') nodes[0].decode = () => new Promise((resolve, reject) => { resolveDecode = resolve; rejectDecode = reject; });
  if (options.decode === 'reject') nodes[0].decode = () => Promise.reject(new Error('decode failed'));
  if (options.decode === 'ready') nodes[0].decode = () => Promise.resolve();
  const root = { animate: options.unsupported ? undefined : () => {}, append(node) { node.isConnected = true; masks.push(node); } };
  const testLogo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
  const document = { documentElement: root, readyState: 'loading', hidden: Boolean(options.hidden), referrer: options.referrer ?? 'https://dex.test/',
    currentScript: options.currentScript === false ? null : { dataset: options.brand ? { entryBrand: options.brand, entryLogo: options.logo ?? testLogo } : {} },
    addEventListener: listen,
    querySelector: selector => selector === 'script[data-page-entry]'
      ? options.entryView === undefined ? null : { textContent: typeof options.entryView === 'string' ? options.entryView : JSON.stringify(options.entryView) }
      : { querySelector: () => nodes[0] }, querySelectorAll: () => nodes.slice(1),
    body: null,
    createElement: tag => {
      const node = { tagName: tag.toUpperCase(), style: {}, removed: false, isConnected: false, listeners: {}, attributes: {}, children: [],
        get classList() { return { add: name => { this.className = [this.className, name].join(' '); } }; },
        querySelector(selector) {
          const descendants = child => [child, ...child.children.flatMap(descendants)];
          return this.children.flatMap(descendants).find(child => child.className?.split(' ').includes(selector.slice(1))) || null;
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        append(...children) { this.children.push(...children); for (const child of children) child.parentElement = this; },
        remove() { this.removed = true; this.isConnected = false; },
      };
      created.push(node);
      return node;
    },
  };
  const motion = { matches: Boolean(options.reduced), addEventListener: (_, fn) => listen('motion', fn) };
  const window = { addEventListener: listen,
    getComputedStyle: node => ({ opacity: options.cssDisabled ? "0" : "1", animationName: options.cssDisabled ? "none" : node.style.animationName || "dex-entry-blackout" }),
    setTimeout(fn, delay) { timers.push({ fn, delay, at: elapsed + delay, active: true }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].active = false; },
  };
  const context = { window, document, matchMedia: () => motion, URL, Date,
    location: new URL((options.url || 'https://dex.test/post/example/') + (options.hash || '')), innerHeight: 900, scrollY: options.scroll ?? 0,
    performance: { now: () => elapsed, getEntriesByType: () => [{ type: options.navigationType ?? 'navigate' }] },
    sessionStorage: { getItem(key) { if (options.storageFails) throw Error('disabled'); return stored.get(key) || null; }, removeItem(key) { if (options.storageFails) throw Error('disabled'); stored.delete(key); }, setItem(key, value) { if (options.storageFails) throw Error('disabled'); stored.set(key, value); } } };
  runInNewContext(script, context);
  const fire = (type, event = {}) => { for (const fn of events[type] || []) fn(event); };
  const link = { href: 'https://dex.test/archives/', target: '', hasAttribute: () => false };
  const click = overrides => fire('click', { defaultPrevented: false, button: 0, target: { closest: () => link }, ...overrides });
  return { calls, fire, stored, nodes, document, link, click, motion, masks, timers, created,
    advance(time) {
      const target = elapsed + time;
      for (;;) {
        const next = timers.filter(timer => timer.active && timer.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        elapsed = Math.max(elapsed, next.at); next.active = false; next.fn();
      }
      elapsed = target;
    },
    image(type, loaded = type === 'load') {
      nodes[0].complete = true; nodes[0].naturalWidth = loaded ? 1200 : 0;
      for (const listener of [...(nodes[0].listeners[type] || [])]) listener();
    },
    resolveDecode() { resolveDecode?.(); }, rejectDecode() { rejectDecode?.(new Error('decode failed')); },
  };
}

test('a fresh native navigation decorates at most five visible real elements', () => {
  const f = fixture(); f.fire('DOMContentLoaded');
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls[0].timing.id, 'dex-cover-pop');
  assert.equal(f.calls[0].timing.delay, 1220);
  assert.equal(f.calls[0].timing.duration, 550);
  assert.equal(f.calls[1].timing.id, 'dex-content-enter');
  assert.equal(f.calls[1].timing.duration, 570);
  assert.equal(f.calls[1].timing.delay, 1770);
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

test('a normally loaded hero uses the 2340ms baseline and leaves only the cleanup watchdog', async () => {
  const f = fixture({ decode: 'ready' }); f.fire('DOMContentLoaded');
  await new Promise(setImmediate);
  assert.ok(f.calls.some(call => call.timing.id === 'dex-cover-pop'));
  assert.equal(Math.max(...f.calls.map(call => call.timing.delay + call.timing.duration)), 2340);
  assert.equal(f.masks[0].style.animationName, 'dex-entry-release');
  assert.equal(f.masks[0].style.animationDuration, '190ms');
  assert.equal(f.masks[0].style.animationDelay, '1190ms');
  assert.equal(f.nodes[0].listeners.load.size, 0); assert.equal(f.nodes[0].listeners.error.size, 0);
  assert.deepEqual(f.timers.filter(timer => timer.active).map(timer => timer.delay), [4200]);
});

test('only the critical hero may extend black while its load and decode finish', async () => {
  const f = fixture({ loaded: false, decode: 'pending' }); f.fire('DOMContentLoaded');
  f.advance(1600); assert.equal(f.calls.length, 0); assert.equal(f.masks[0].removed, false);
  f.image('load'); f.advance(200); assert.equal(f.calls.length, 0, 'Load alone must not bypass pending decode');
  f.resolveDecode(); await new Promise(setImmediate);
  assert.equal(f.calls[0].timing.delay, 1830);
  assert.equal(f.calls[1].timing.delay, 2380);
  assert.equal(Math.max(...f.calls.map(call => call.timing.delay + call.timing.duration)), 2950);
  assert.equal(f.nodes[0].listeners.load.size, 0); assert.equal(f.nodes[0].listeners.error.size, 0);
});

test('a below-fold hero cannot extend the entry or install readiness listeners', () => {
  const f = fixture({ loaded: false, heroOffscreen: true }); f.fire('DOMContentLoaded');
  assert.ok(f.calls.length > 0);
  assert.ok(f.calls.every(call => call.timing.id === 'dex-content-enter' && call.timing.delay === 1770));
  assert.equal(f.nodes[0].listeners.load, undefined);
  assert.deepEqual(f.timers.filter(timer => timer.active).map(timer => timer.delay), [4200]);
});

test('failed or undecodable heroes release content without animating broken pixels', async () => {
  for (const options of [{ failed: true }, { decode: 'reject' }]) {
    const f = fixture(options); f.fire('DOMContentLoaded');
    await new Promise(setImmediate);
    assert.ok(f.calls.length > 0); assert.ok(f.calls.every(call => call.timing.id === 'dex-content-enter'));
    assert.ok(f.calls.every(call => call.timing.delay === 1770));
  }
  const error = fixture({ loaded: false }); error.fire('DOMContentLoaded'); error.advance(1600); error.image('error');
  assert.ok(error.calls.every(call => call.timing.id === 'dex-content-enter' && call.timing.delay === 2180));
});

test('never-completing hero load or decode reaches the hard 4000ms total bound', async () => {
  for (const options of [{ loaded: false }, { decode: 'pending' }]) {
    const f = fixture(options); f.fire('DOMContentLoaded'); f.advance(2849);
    assert.equal(f.calls.length, 0);
    f.advance(1);
    assert.ok(f.calls.length > 0);
    assert.ok(f.calls.every(call => call.timing.id === 'dex-content-enter' && call.timing.delay === 3430));
    assert.equal(Math.max(...f.calls.map(call => call.timing.delay + call.timing.duration)), 4000);
    const count = f.calls.length;
    f.image('load'); f.resolveDecode(); await new Promise(setImmediate);
    assert.equal(f.calls.length, count, 'A late resource cannot restart the completed decision');
    assert.equal(f.nodes[0].listeners.load.size, 0); assert.equal(f.nodes[0].listeners.error.size, 0);
  }
});

test('input during an extended hero hold disposes waits and pending decode cannot resume entry', async () => {
  for (const options of [{ loaded: false }, { decode: 'pending' }]) {
    const f = fixture(options); f.fire('DOMContentLoaded'); f.advance(1600); f.fire('pointerdown');
    assert.equal(f.masks[0].removed, true); assert.equal(f.timers.filter(timer => timer.active).length, 0);
    assert.equal(f.nodes[0].listeners.load.size, 0); assert.equal(f.nodes[0].listeners.error.size, 0);
    f.image('load'); f.resolveDecode(); await new Promise(setImmediate); f.advance(5000);
    assert.equal(f.calls.length, 0);
  }
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
    assert.equal(f.timers[0].delay, 4200);
    interrupt(f);
    assert.equal(f.masks[0].removed, true);
    assert.ok(f.calls.every(call => call.animation.cancelled));
  }
  const reduced = fixture({ reduced: true }); reduced.fire('DOMContentLoaded'); assert.equal(reduced.masks.length, 0);
});


test('decorative child animation endings cannot dismiss the black phase early', () => {
  const f = fixture(); f.fire('DOMContentLoaded'); const mask = f.masks[0];
  mask.listeners.animationend({ target: {} }); assert.equal(mask.removed, false);
  mask.listeners.animationend({ target: mask }); assert.equal(mask.removed, true);
});


test('eligible head execution installs the curtain before body or DOM readiness exists', () => {
  const f = fixture();
  assert.equal(f.document.body, null);
  assert.equal(f.masks.length, 1);
  assert.equal(f.masks[0].isConnected, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers[0].delay, 4200, 'The watchdog is already armed before DOM readiness');
});

test('prompt DOM readiness joins the original clock instead of restarting the black phase', () => {
  const f = fixture(); f.advance(300); f.fire('DOMContentLoaded');
  assert.equal(f.masks.length, 1);
  assert.ok(f.calls.length > 0);
  assert.ok(f.calls.every(call => call.animation.currentTime === 300));
  assert.equal(f.calls[0].timing.delay, 1220);
});

test('late readiness, expensive layout or transparent CSS fails open without re-hiding content', () => {
  const late = fixture(); late.advance(2850); late.fire('DOMContentLoaded');
  assert.equal(late.calls.length, 0); assert.equal(late.masks[0].removed, true);
  const layout = fixture({ layoutCost: 650 }); layout.fire('DOMContentLoaded');
  assert.equal(layout.calls.length, 0); assert.equal(layout.masks[0].removed, true);
  const cssDisabled = fixture({ cssDisabled: true }); cssDisabled.fire('DOMContentLoaded');
  assert.equal(cssDisabled.calls.length, 0); assert.equal(cssDisabled.masks[0].removed, true);
  const interrupted = fixture(); interrupted.fire('pointerdown'); interrupted.fire('DOMContentLoaded');
  assert.equal(interrupted.calls.length, 0); assert.equal(interrupted.masks.length, 1); assert.equal(interrupted.masks[0].removed, true);
});

test('NVIDIA opt-in shows only its logo on direct entry and top reload, with a bounded 2900ms sequence', () => {
  for (const navigationType of ['navigate', 'reload']) {
    const f = fixture({ brand: 'nvidia', marker: false, navigationType });
    assert.equal(f.document.body, null, 'Brand selection is available before the body exists');
    assert.equal(f.masks.length, 1);
    assert.match(f.masks[0].className, /\bdex-entry-curtain--nvidia-company\b/);
    assert.equal(f.masks[0].attributes['aria-hidden'], 'true');
    const logo = f.created.find(node => node.className === 'nvidia-entry__logo');
    assert.ok(logo);
    assert.equal(logo.tagName, 'IMG');
    assert.equal(logo.src, f.document.currentScript.dataset.entryLogo);
    assert.equal(logo.alt, '');
    assert.equal(logo.draggable, false);
    assert.ok(!f.created.some(node => node.className === 'dex-entry-curtain__panel'));
    assert.ok(!f.created.some(node => node.textContent));
    f.fire('DOMContentLoaded');
    assert.equal(f.calls.length, 5);
    assert.equal(f.calls[0].timing.delay, 1780);
    assert.equal(f.calls[1].timing.delay, 2330);
    assert.equal(Math.max(...f.calls.map(call => call.timing.delay + call.timing.duration)), 2900);
    assert.equal(f.masks[0].style.animationDelay, '1750ms');
    assert.equal(f.stored.size, 0, 'A direct brand entry does not manufacture a navigation marker');
  }
  const deniedStorage = fixture({ brand: 'nvidia', marker: false, storageFails: true });
  deniedStorage.fire('DOMContentLoaded');
  assert.ok(deniedStorage.calls.length > 0, 'Explicit brand entry does not depend on optional session storage');
});

test('NVIDIA direct entry requires the explicit brand and an embedded image; unknown settings stay normal', () => {
  for (const options of [
    { brand: 'other-company' },
    { brand: 'nvidia', currentScript: false },
    { brand: 'nvidia', logo: '' },
    { brand: 'nvidia', logo: 'https://external.test/logo.svg' },
    { brand: 'nvidia', logo: 'javascript:alert(1)' },
    { brand: 'nvidia', logo: 'data:text/html;base64,PHNjcmlwdD4=' },
  ]) {
    const f = fixture({ marker: false, ...options });
    f.fire('DOMContentLoaded');
    assert.equal(f.masks.length, 0, JSON.stringify(options));
    assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
  const defaultReload = fixture({ navigationType: 'reload' });
  defaultReload.fire('DOMContentLoaded');
  assert.equal(defaultReload.masks.length, 0, 'The brand exception must not enable ordinary-page reloads');
});

test('NVIDIA history, anchors, non-top reads, reduced motion and unavailable animation bypass the logo', () => {
  for (const options of [
    { navigationType: 'back_forward' }, { navigationType: 'reload', scroll: 500 },
    { hash: '#evidence-24' }, { reduced: true }, { hidden: true }, { unsupported: true },
  ]) {
    const f = fixture({ brand: 'nvidia', marker: false, ...options });
    f.fire('DOMContentLoaded');
    assert.equal(f.masks.length, 0, JSON.stringify(options));
    assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
  const restored = fixture({ brand: 'nvidia', marker: false });
  restored.fire('DOMContentLoaded');
  restored.fire('pageshow', { persisted: true });
  assert.equal(restored.masks[0].removed, true);
  assert.ok(restored.calls.every(call => call.animation.cancelled));
});

test('NVIDIA input skips the logo and late hero completion cannot revive it', async () => {
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'pagehide', 'motion']) {
    const f = fixture({ brand: 'nvidia', marker: false });
    f.fire('DOMContentLoaded'); f.fire(type);
    assert.equal(f.masks[0].removed, true, type);
    assert.ok(f.calls.every(call => call.animation.cancelled), type);
    assert.equal(f.timers.filter(timer => timer.active).length, 0, type);
  }
  const pending = fixture({ brand: 'nvidia', marker: false, decode: 'pending' });
  pending.fire('DOMContentLoaded'); pending.advance(1000); pending.fire('pointerdown');
  pending.resolveDecode(); await new Promise(setImmediate); pending.advance(5000);
  assert.equal(pending.masks[0].removed, true);
  assert.equal(pending.calls.length, 0);
  assert.equal(pending.nodes[0].listeners.load.size, 0);
  assert.equal(pending.nodes[0].listeners.error.size, 0);
});

test('a broken NVIDIA embedded logo fails open and disposes all pending work', async () => {
  for (const options of [{}, { decode: 'pending' }]) {
    const f = fixture({ brand: 'nvidia', marker: false, logo: 'data:image/svg+xml;base64,YnJva2Vu', ...options });
    f.fire('DOMContentLoaded');
    const logo = f.created.find(node => node.className === 'nvidia-entry__logo');
    logo.listeners.error({ target: logo });
    assert.equal(f.masks[0].removed, true);
    assert.ok(f.calls.every(call => call.animation.cancelled));
    assert.equal(f.timers.filter(timer => timer.active).length, 0);
    const count = f.calls.length;
    f.resolveDecode(); await new Promise(setImmediate); f.advance(5000);
    assert.equal(f.calls.length, count, 'The decode callback cannot restart a failed logo entry');
  }
});

test('NVIDIA logo child animation endings cannot dismiss the parent black phase', () => {
  const f = fixture({ brand: 'nvidia', marker: false });
  const mask = f.masks[0];
  const logo = f.created.find(node => node.className === 'nvidia-entry__logo');
  mask.listeners.animationend({ target: logo });
  assert.equal(mask.removed, false);
  f.fire('DOMContentLoaded');
  mask.listeners.animationend({ target: logo });
  assert.equal(mask.removed, false);
  mask.listeners.animationend({ target: mask });
  assert.equal(mask.removed, true);
});

test('NVIDIA pending heroes and late readiness retain the same hard fail-open deadlines', async () => {
  for (const options of [{ loaded: false }, { decode: 'pending' }]) {
    const f = fixture({ brand: 'nvidia', marker: false, ...options });
    f.fire('DOMContentLoaded'); f.advance(2850);
    assert.ok(f.calls.length > 0);
    assert.equal(Math.max(...f.calls.map(call => call.timing.delay + call.timing.duration)), 4000);
    const count = f.calls.length;
    f.image('load'); f.resolveDecode(); await new Promise(setImmediate);
    assert.equal(f.calls.length, count);
    f.advance(1350);
    assert.equal(f.masks[0].removed, true);
  }
  const late = fixture({ brand: 'nvidia', marker: false });
  late.advance(2850); late.fire('DOMContentLoaded');
  assert.equal(late.masks[0].removed, true);
  assert.equal(late.calls.length, 0);
});

const biographyView = { theme: 'nvidia', image: '/post/jensen-huang-biography/loading-card.jpg', width: 304, height: 320, label: 'DEX / BIOGRAPHY', name: 'JENSEN HUANG' };

test('the existing biography uses its photograph, copy and original 1690ms hold on native entry', () => {
  const f = fixture({ entryView: biographyView });
  assert.equal(f.masks[0].className, 'dex-entry-curtain dex-entry-curtain--nvidia');
  assert.ok(!f.created.some(node => node.className === 'nvidia-entry__logo'));
  const portrait = f.created.find(node => node.className === 'dex-entry-curtain__portrait');
  assert.ok(portrait);
  const image = portrait.children[0];
  assert.equal(image.src, biographyView.image);
  assert.equal(image.width, biographyView.width);
  assert.equal(image.height, biographyView.height);
  assert.equal(image.alt, '');
  assert.equal(image.decoding, 'async');
  assert.equal(image.fetchPriority, 'low');
  assert.equal(portrait.children[1].textContent, 'JENSEN HUANG');
  assert.equal(f.created.find(node => node.className === 'dex-entry-curtain__label').textContent, 'DEX / BIOGRAPHY');
  f.fire('DOMContentLoaded');
  assert.equal(f.calls.length, 5);
  assert.equal(f.masks[0].style.animationDelay, '1690ms');
  assert.equal(Math.max(...f.calls.map(call => call.timing.delay + call.timing.duration)), 2840);
  image.listeners.error({ target: image });
  assert.equal(portrait.removed, true);
  assert.match(f.created.find(node => node.className?.startsWith('dex-entry-curtain__panel')).className, /panel--no-photo/);
  assert.equal(f.masks[0].removed, false, 'A failed photograph keeps the biography copy and finite release');
  f.fire('keydown');
  assert.equal(f.masks[0].removed, true);
  assert.ok(f.calls.every(call => call.animation.cancelled));
});

test('biography direct loads and reloads remain still except for the existing local preview option', () => {
  for (const options of [
    { marker: false }, { navigationType: 'reload' }, { navigationType: 'back_forward' },
    { reduced: true }, { hash: '#sources' }, { scroll: 500 },
    { url: 'https://dex.test/post/example/?preview=loading', marker: false },
  ]) {
    const f = fixture({ entryView: biographyView, ...options });
    f.fire('DOMContentLoaded');
    assert.equal(f.masks.length, 0, JSON.stringify(options));
    assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
  for (const hostname of ['127.0.0.1', 'localhost']) for (const navigationType of ['navigate', 'reload']) {
    const f = fixture({ entryView: biographyView, marker: false, navigationType, url: `http://${hostname}/post/example/?preview=loading` });
    f.fire('DOMContentLoaded');
    assert.equal(f.masks[0].className, 'dex-entry-curtain dex-entry-curtain--nvidia');
    assert.equal(f.masks[0].style.animationDelay, '1690ms');
    assert.ok(f.calls.length > 0);
  }
});

test('company logo metadata wins over biography metadata without changing either CSS scope', () => {
  const f = fixture({ brand: 'nvidia', entryView: biographyView, marker: false });
  f.fire('DOMContentLoaded');
  assert.equal(f.masks[0].className, 'dex-entry-curtain dex-entry-curtain--nvidia-company');
  assert.ok(f.created.some(node => node.className === 'nvidia-entry__logo'));
  assert.ok(!f.created.some(node => node.className === 'dex-entry-curtain__portrait'));
  assert.ok(!f.created.some(node => node.className === 'dex-entry-curtain__panel'));
  assert.equal(f.masks[0].style.animationDelay, '1750ms');
  assert.match(css, /\.dex-entry-curtain--nvidia-company\s*\{\s*background: #050805/);
  assert.match(css, /\.dex-entry-curtain--nvidia\s+\.dex-entry-curtain__panel\s*\{/);
  assert.match(partial, /data-page-entry/);
  assert.match(partial, /data-entry-brand="nvidia"/);
});

test('invalid company logo settings fall back to the existing biography policy and malformed JSON stays normal', () => {
  const native = fixture({ brand: 'nvidia', logo: '', entryView: biographyView });
  native.fire('DOMContentLoaded');
  assert.equal(native.masks[0].className, 'dex-entry-curtain dex-entry-curtain--nvidia');
  assert.equal(native.masks[0].style.animationDelay, '1690ms');
  const direct = fixture({ brand: 'nvidia', logo: '', entryView: biographyView, marker: false });
  direct.fire('DOMContentLoaded');
  assert.equal(direct.masks.length, 0);
  const malformed = fixture({ entryView: '{invalid json' });
  malformed.fire('DOMContentLoaded');
  assert.equal(malformed.masks[0].className, 'dex-entry-curtain');
  assert.equal(malformed.masks[0].style.animationDelay, '1190ms');
});
