import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';

// Run after the production Hugo build. This suite inspects the real bundled
// Markmap transform, not just the wheel-normalization helper in isolation.
const root = resolve('public');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const path = resolve(root, '.' + pathname);
    if (!path.startsWith(root + sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', (mime[extname(path)] || 'application/octet-stream') + '; charset=utf-8');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const base = `http://127.0.0.1:${server.address().port}`;
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);

try {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/post/ai-computing-infrastructure/`, { waitUntil: 'domcontentloaded' });
    const figure = page.locator('figure.article-visual[data-visual="map"]').first();
    const svg = figure.locator('.visual-stage > svg');
    const fit = figure.locator('[data-action="fit"]');
    const zoomIn = figure.locator('[data-action="zoom-in"]');
    const zoomOut = figure.locator('[data-action="zoom-out"]');
    const interaction = figure.locator('[data-action="interact"]');
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('[data-action="zoom-in"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('figure.article-visual[data-visual="map"]')?.dataset.visualState === 'ready');

    const transform = () => svg.evaluate(el => ({ k: el.__zoom.k, x: el.__zoom.x, y: el.__zoom.y }));
    const settle = async () => {
      // Fit is animated for readers without a reduced-motion preference.
      await page.waitForTimeout(reducedMotion === 'reduce' ? 70 : 300);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const reset = async () => { await fit.click(); await settle(); return transform(); };
    const wheel = async (options = {}) => svg.evaluate((el, options) => {
      const rect = el.getBoundingClientRect();
      const { count = 1, fractionX = .63, fractionY = .37, ...init } = options;
      const position = { clientX: rect.left + rect.width * fractionX, clientY: rect.top + rect.height * fractionY };
      let canceled = 0;
      for (let i = 0; i < count; i++) {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, deltaMode: 0, ctrlKey: true, ...position, ...init });
        if (!el.dispatchEvent(event)) canceled++;
      }
      return { canceled, point: [position.clientX - rect.left, position.clientY - rect.top] };
    }, options);
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    assert.match(await zoomIn.getAttribute('aria-label') || await zoomIn.innerText(), /zoom in/i);
    assert.match(await zoomOut.getAttribute('aria-label') || await zoomOut.innerText(), /zoom out/i);
    const baseline = await reset();
    assert.ok(Number.isFinite(baseline.k) && baseline.k > 0);

    // Off means an unmodified wheel remains available to article scrolling.
    const ignored = await wheel({ ctrlKey: false, deltaY: 120 });
    await frame();
    assert.equal(ignored.canceled, 0);
    close((await transform()).k, baseline.k);
    await svg.hover();
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => scrollY) > scrollBefore, 'Ordinary wheel must still scroll the article');
    await figure.scrollIntoViewIfNeeded();

    const ratios = [];
    for (const modifier of [{ ctrlKey: true }, { ctrlKey: false, metaKey: true }]) {
      const before = await reset();
      const { canceled, point } = await wheel(modifier);
      await frame();
      const after = await transform();
      assert.equal(canceled, 1, 'Accepted zoom wheel must prevent native browser/page zoom');
      assert.ok(after.k > before.k && after.k / before.k <= 1.084, 'One wheel notch must make a small bounded change');
      close((point[0] - before.x) / before.k, (point[0] - after.x) / after.k, .02);
      close((point[1] - before.y) / before.k, (point[1] - after.y) / after.k, .02);
      ratios.push(after.k / before.k);
    }
    close(ratios[0], ratios[1], 1e-6);
    for (const deltaMode of [0, 1, 2]) {
      const before = await reset();
      await wheel({ deltaY: -1000, deltaMode });
      await frame();
      const after = await transform();
      assert.ok(after.k > before.k && after.k / before.k <= 1.084, `deltaMode ${deltaMode} must be normalized and capped`);
    }
    {
      const before = await reset();
      await wheel({ deltaY: -1 });
      await frame();
      const after = await transform();
      assert.ok(after.k > before.k && after.k / before.k < 1.005, 'Fine trackpad input must retain fine increments');
    }
    {
      const before = await reset();
      assert.equal((await wheel({ count: 100 })).canceled, 100);
      await frame();
      const after = await transform();
      assert.ok(after.k > before.k && after.k / before.k <= 1.084, 'Same-frame wheel burst must not compound into a jump');
    }

    await reset();
    await interaction.click();
    assert.equal(await interaction.getAttribute('aria-pressed'), 'true');
    const activeBefore = await transform();
    assert.equal((await wheel({ ctrlKey: false })).canceled, 1);
    await frame();
    assert.ok((await transform()).k > activeBefore.k);
    await interaction.click();
    assert.equal(await interaction.getAttribute('aria-pressed'), 'false');

    // Real keyboard buttons are a fine-grained alternative to wheel gestures.
    const buttonBefore = await reset();
    await zoomIn.focus();
    await page.keyboard.press('Enter');
    await settle();
    const buttonAfter = await transform();
    close(buttonAfter.k / buttonBefore.k, 1.1, .002);
    await zoomOut.focus();
    await page.keyboard.press('Space');
    await settle();
    close((await transform()).k, buttonBefore.k, .002);
    const beforeDoubleClick = await transform();
    await svg.dispatchEvent('dblclick', { button: 0, bubbles: true, cancelable: true });
    await settle();
    close((await transform()).k, beforeDoubleClick.k);

    // Fit must cancel pending input; it must not be overwritten one frame later.
    await reset();
    await figure.evaluate(el => {
      const svg = el.querySelector('.visual-stage > svg');
      const r = svg.getBoundingClientRect();
      svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      el.querySelector('[data-action="fit"]').click();
    });
    await settle();
    close((await transform()).k, baseline.k, .002);

    // Both wheel and buttons must respect limits. Accepted Ctrl-wheel stays
    // canceled at a limit rather than leaking through to browser page zoom.
    for (const [deltaY, control, expected] of [[-1000, zoomIn, 3], [1000, zoomOut, Math.min(.25, baseline.k * .5)]]) {
      for (let i = 0; i < 110 && !(await control.isDisabled()); i++) {
        await wheel({ deltaY, count: 10 });
        await frame();
      }
      assert.equal(await control.isDisabled(), true, 'Limit control must be disabled');
      close((await transform()).k, expected, .002);
      assert.equal((await wheel({ deltaY })).canceled, 1, 'Ctrl-wheel must be canceled even at scale bounds');
      await frame();
      close((await transform()).k, expected, .002);
    }
    await reset();
    assert.equal(await zoomIn.isDisabled(), false);
    assert.equal(await zoomOut.isDisabled(), false);

    // CDP touch input takes Chromium's real touch path and the installed D3
    // listeners. The same two-finger gesture is ignored while interaction is off.
    const cdp = await context.newCDPSession(page);
    const pinch = async () => {
      const box = await svg.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const touch = distance => [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(40) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(60) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frame();
    };
    const touchOff = await reset();
    await pinch();
    close((await transform()).k, touchOff.k, .002);
    await interaction.click();
    const touchOn = await transform();
    await pinch();
    const afterPinch = await transform();
    assert.ok(afterPinch.k > touchOn.k * 1.1, 'Enabled two-finger pinch must zoom');
    {
      const box = await svg.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 40, y: y + 15, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frame();
      const afterPan = await transform();
      close(afterPan.k, afterPinch.k, .002);
      assert.ok(Math.abs(afterPan.x - afterPinch.x) > 20, 'Enabled single-finger gesture must pan');
    }
    await interaction.click();
    await cdp.detach();
    await reset();

    const fullscreen = figure.locator('[data-action="fullscreen"]');
    for (let cycle = 0; cycle < 2; cycle++) {
      await fullscreen.click();
      await page.waitForFunction(() => !!document.fullscreenElement || !!document.querySelector('figure.article-visual.is-expanded'));
      await settle();
      assert.ok(Number.isFinite((await transform()).k) && (await transform()).k > 0);
      await fullscreen.click();
      await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('figure.article-visual.is-expanded'));
      await settle();
      close((await transform()).k, baseline.k, .002);
    }
    // Explicitly cover the fallback dialog and its Escape/focus-return path.
    await figure.evaluate(el => { el.requestFullscreen = undefined; });
    await fullscreen.click();
    assert.equal(await figure.getAttribute('role'), 'dialog');
    await page.keyboard.press('Escape');
    await settle();
    assert.equal(await figure.evaluate(el => el.classList.contains('is-expanded')), false);
    assert.equal(await fullscreen.evaluate(el => el === document.activeElement), true);
    close((await transform()).k, baseline.k, .002);

    // Printing hides the stage and emits resize callbacks. Restoring screen
    // media must never leave a zero/NaN scale or stale animated fit behind.
    await page.emulateMedia({ media: 'print' });
    await settle();
    await page.emulateMedia({ media: 'screen' });
    await settle();
    const restored = await transform();
    assert.ok(Number.isFinite(restored.k) && restored.k > 0);
    await reset();
    close((await transform()).k, baseline.k, .002);
    assert.deepEqual(errors, [], `Unexpected browser errors (${reducedMotion})`);
    console.log(`PASS mindmap zoom (${reducedMotion}): modifiers, units, fine input, bursts, anchor, keyboard, bounds, touch, fit races, fullscreen, print`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
