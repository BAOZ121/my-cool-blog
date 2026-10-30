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
  const elements = { '[data-dex-paypal-preview]': root, '#support-load-paypal': button, '#support-paypal-status': status, '#paypal-container-YTJXE3R8LDUPL': container, '#support-reload': reload };
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
test('explicit review click gates all PayPal work; repeated clicks/setup render once', async () => {
  const f = fixture(); let loads = 0, renders = 0; let release;
  const loading = new Promise(resolve => { release = resolve; });
  const load = () => { loads++; return loading; };
  setupSupportPayPal(f.doc, f.win, load); setupSupportPayPal(f.doc, f.win, load);
  assert.equal(loads, 0); f.button.click(); f.button.click(); assert.equal(loads, 1); assert.equal(f.button.disabled, true);
  release({ HostedButtons: options => { assert.deepEqual(options, { hostedButtonId: HOSTED_BUTTON_ID }); return { render: selector => { assert.equal(selector, '#paypal-container-YTJXE3R8LDUPL'); renders++; } }; } });
  await tick(); f.button.click(); assert.equal(renders, 1); assert.equal(f.root.dataset.paypalState, 'ready');
  assert.match(f.status.textContent, /do not authorize or complete a payment/); assert.equal(f.container.attrs['aria-busy'], 'false');
});
test('SDK or render rejection is accessible, clears partial UI, and offers deliberate reload', async () => {
  for (const load of [async () => { throw new Error('offline'); }, async () => ({ HostedButtons: () => ({ render: async () => { throw new Error('render failed'); } }) })]) {
    const f = fixture(); setupSupportPayPal(f.doc, f.win, load); f.button.click(); await tick();
    assert.equal(f.root.dataset.paypalState, 'error'); assert.equal(f.container.cleared, true);
    assert.match(f.status.textContent, /has not confirmed any payment/); assert.equal(f.reload.hidden, false);
    assert.equal(f.container.attrs['aria-busy'], 'false'); f.reload.click(); assert.equal(f.reloads(), 1);
  }
});
test('native buttons, live warnings and noindex isolation preserve the existing shell', () => {
  const md = readFileSync('content/test/support-dex/index.en.md', 'utf8');
  for (const setting of ['testpage: true', 'robots: "noindex, nofollow"', 'list: "never"', 'sitemap:\n  disable: true', 'url: "/test/support-dex/"']) assert.ok(md.includes(setting), setting);
  const html = readFileSync('layouts/page/support.html', 'utf8');
  for (const phrase of ['not a sandbox', 'not a charitable fundraiser', 'No charitable tax receipt', 'does not buy coverage', 'does not confirm PayPal account approval', 'role="status"', '<noscript>']) assert.ok(html.includes(phrase), phrase);
  assert.equal((html.match(/id="paypal-container-YTJXE3R8LDUPL"/g) || []).length, 1);
  assert.doesNotMatch(html, /<form\b|<input\b|href="#"|onApprove|capture\(/);
  assert.match(html, /partialCached "footer\/footer"/); assert.equal((html.match(/<details(?:\s|>)/g) || []).length, 4);
  assert.doesNotMatch(readFileSync('hugo.toml', 'utf8'), /\/test\/support-dex\//);
  const css = readFileSync('assets/css/support.css', 'utf8');
  assert.match(css, /:focus-visible/); assert.match(css, /@media\(max-width:800px\)/); assert.match(css, /var\(--accent-color\)/);
});
test('built preview has no listing/feed/sitemap links and does not change production routes', { skip: !existsSync('public/test/support-dex/index.html') }, () => {
  const html = readFileSync('public/test/support-dex/index.html', 'utf8');
  assert.match(html, /noindex, nofollow/); assert.match(html, /support-paypal/); assert.match(html, /id=.?main-menu/);
  assert.doesNotMatch(html, /<script[^>]*src=["']?https:\/\/www.paypal.com/);
  assert.ok(!existsSync('public/support/index.html'));
  for (const file of ['sitemap.xml', 'index.xml', 'index.html', 'search/index.json', 'archives/index.html']) {
    if (existsSync('public/' + file)) assert.doesNotMatch(readFileSync('public/' + file, 'utf8'), /\/test\/support-dex\//, file);
  }
});
