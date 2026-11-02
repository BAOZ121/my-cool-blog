import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SDK_URL, HOSTED_BUTTON_ID, loadPayPalSdk, setupSupportPayPal } from '../assets/js/support-paypal.mjs';

class Element extends EventTarget {
  dataset = {}; disabled = false; hidden = false; textContent = ''; attrs = {};
  setAttribute(k, v) { this.attrs[k] = v; }
  replaceChildren() { this.cleared = true; }
  click() { this.dispatchEvent(new Event('click')); }
}
function fixture() {
  const root = new Element(), button = new Element(), status = new Element(), container = new Element(), reload = new Element();
  reload.hidden = true;
  const elements = { '[data-dex-paypal-support]': root, '#support-load-paypal': button, '#support-paypal-status': status, '#paypal-container-YTJXE3R8LDUPL': container, '#support-reload': reload };
  const scripts = [], timers = new Map(); let sequence = 0, reloads = 0;
  const doc = { querySelector: q => elements[q] || (q.startsWith('script[') ? scripts[0] : null), createElement: () => new Element(), head: { appendChild: s => scripts.push(s) } };
  const win = { setTimeout: fn => { const n = ++sequence; timers.set(n, fn); return n; }, clearTimeout: n => timers.delete(n), location: { reload: () => reloads++ } };
  return { root, button, status, container, reload, doc, win, scripts, timers, reloads: () => reloads };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('uses the exact owner-provided live SDK and hosted button, without extra credentials', () => {
  assert.equal(SDK_URL, 'https://www.paypal.com/sdk/js?client-id=BAABfpXYLqPFYyqPtg7WTcVDzdX-UGF1bv8M0Y31s3p8ECDU4IGgR7IMmV2cTgn71zaJuaoVQqfl56zZSk&components=hosted-buttons&disable-funding=venmo&currency=USD');
  assert.equal(HOSTED_BUTTON_ID, 'YTJXE3R8LDUPL');
});
test('SDK is loaded once, concurrent requests share the promise, and listeners/timer finish', async () => {
  const f = fixture(); const p = loadPayPalSdk(f.doc, f.win);
  assert.equal(loadPayPalSdk(f.doc, f.win), p); assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, SDK_URL);
  f.win.paypal = { HostedButtons() {} }; f.scripts[0].dispatchEvent(new Event('load'));
  assert.equal(await p, f.win.paypal); assert.equal(f.timers.size, 0);
});
test('SDK network failure is rejected without an automatic duplicate request', async () => {
  const f = fixture(); const p = loadPayPalSdk(f.doc, f.win); const rejected = assert.rejects(p, /could not be loaded/);
  f.scripts[0].dispatchEvent(new Event('error')); await rejected;
  assert.equal(loadPayPalSdk(f.doc, f.win), p); assert.equal(f.scripts.length, 1); assert.equal(f.timers.size, 0);
});
test('SDK timeout fails closed and a late load does not restart the integration', async () => {
  const f = fixture(); const p = loadPayPalSdk(f.doc, f.win); const rejected = assert.rejects(p, /timed out/);
  [...f.timers.values()][0](); await rejected;
  f.win.paypal = { HostedButtons() {} }; f.scripts[0].dispatchEvent(new Event('load'));
  assert.equal(f.scripts.length, 1); assert.equal(f.timers.size, 0);
});
test('missing HostedButtons and a conflicting SDK fail instead of pretending ready', async () => {
  const f = fixture(); const p = loadPayPalSdk(f.doc, f.win); const rejected = assert.rejects(p, /unavailable/);
  f.scripts[0].dispatchEvent(new Event('load')); await rejected;
  const g = fixture(); g.scripts.push({ src: 'https://www.paypal.com/sdk/js?client-id=other' });
  await assert.rejects(loadPayPalSdk(g.doc, g.win), /Another PayPal/); assert.equal(g.scripts.length, 1);
});
test('explicit consent click gates all PayPal work; repeated clicks/setup render once', async () => {
  const f = fixture(); let loads = 0, renders = 0; let release;
  const loading = new Promise(resolve => { release = resolve; });
  const load = () => { loads++; return loading; };
  setupSupportPayPal(f.doc, f.win, load); setupSupportPayPal(f.doc, f.win, load);
  assert.equal(loads, 0); f.button.click(); f.button.click(); assert.equal(loads, 1); assert.equal(f.button.disabled, true);
  release({ HostedButtons: options => { assert.deepEqual(options, { hostedButtonId: HOSTED_BUTTON_ID }); return { render: selector => { assert.equal(selector, '#paypal-container-YTJXE3R8LDUPL'); renders++; } }; } });
  await tick(); f.button.click(); assert.equal(renders, 1); assert.equal(f.root.dataset.paypalState, 'ready');
  assert.match(f.status.textContent, /Review your amount and details/); assert.equal(f.container.attrs['aria-busy'], 'false');
});
test('SDK or render rejection is accessible, clears partial UI, and offers deliberate reload', async () => {
  for (const load of [async () => { throw new Error('offline'); }, async () => ({ HostedButtons: () => ({ render: async () => { throw new Error('render failed'); } }) })]) {
    const f = fixture(); setupSupportPayPal(f.doc, f.win, load); f.button.click(); await tick();
    assert.equal(f.root.dataset.paypalState, 'error'); assert.equal(f.container.cleared, true);
    assert.match(f.status.textContent, /has not confirmed any payment/); assert.equal(f.reload.hidden, false);
    assert.equal(f.container.attrs['aria-busy'], 'false'); f.reload.click(); assert.equal(f.reloads(), 1);
  }
});

test('published homepage has the exact CTA and a real support route, while preserving Lisa Su', () => {
  const card = readFileSync('layouts/_partials/home/support.html', 'utf8');
  assert.ok(card.includes('如果您觉得对您有帮助，请支持我。'));
  assert.ok(card.includes('href="/support/"'));
  assert.ok(card.includes('lang="zh-CN"'));
  assert.doesNotMatch(card, /\/test\/|PREVIEW/);
  assert.match(readFileSync('content/test/lisa-su/index.en.md', 'utf8'), /homeCard: true/);
  const template = readFileSync('layouts/page/support.html', 'utf8');
  assert.match(template, /data-dex-paypal-support/);
  assert.match(template, /Loading connects your browser to PayPal/);
  assert.doesNotMatch(template, /REVIEW PREVIEW|review only|do not complete a payment/i);
  for (const phrase of ['not a charitable fundraiser', 'No charitable tax receipt', 'does not buy coverage', 'does not confirm PayPal account approval']) assert.ok(template.includes(phrase));
});
test('built production is consent gated, preserves research and has no test links', { skip: !existsSync('public/support/index.html') }, () => {
  const home = readFileSync('public/index.html', 'utf8');
  const support = readFileSync('public/support/index.html', 'utf8');
  assert.ok(home.includes('如果您觉得对您有帮助，请支持我。'));
  assert.ok(home.includes('/test/lisa-su/'));
  assert.ok(home.includes('/support/'));
  assert.doesNotMatch(home, /\/test\/(?:home-support|about-support|support-dex)\//);
  assert.doesNotMatch(support, /noindex|REVIEW PREVIEW/);
  assert.doesNotMatch(support, /<script[^>]*src=["']?https:\/\/www.paypal.com/);
  assert.equal((support.match(/id=["']?paypal-container-YTJXE3R8LDUPL/g) || []).length, 1);
});
