import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve('public');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const path = '/post/commercial-space-advanced-engineering/';
const screenshots = process.env.CHAPTER_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const [width, scheme, motion, js] of [[1440, 'dark', 'no-preference', true], [1920, 'light', 'reduce', true], [1024, 'dark', 'reduce', true], [390, 'dark', 'no-preference', true], [320, 'light', 'reduce', true], [1440, 'light', 'reduce', false], [390, 'light', 'reduce', false]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: motion, javaScriptEnabled: js });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    if (js) await context.addInitScript(scheme => {
      localStorage.setItem('StackColorScheme', scheme);
      window.__chapterLifecycle = [];
      for (const name of ['DOMContentLoaded', 'load', 'pageshow', 'pagehide', 'hashchange']) addEventListener(name, event => {
        window.__chapterLifecycle.push({ name, persisted: event.persisted, y: scrollY, height: document.documentElement.scrollHeight, disclosure: document.querySelector('.chapter-mobile details')?.open, disclosureHeight: document.querySelector('.chapter-mobile')?.getBoundingClientRect().height });
      });
    }, scheme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + path);
    await page.evaluate(() => document.fonts.ready);
    const mobile = width < 1024;
    const rail = page.locator(mobile ? '.chapter-mobile .chapter-rail' : '.chapter-widget .chapter-rail');
    const summary = page.locator('.chapter-mobile summary');
    if (mobile) {
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.chapter-mobile details').getAttribute('open'), '');
      assert.equal(await rail.evaluate(node => getComputedStyle(node).position), 'static');
    }
    const links = rail.locator('a');
    assert.ok(await links.count() >= 20, 'Real long TOC should preserve every heading');
    const anchors = await links.evaluateAll(nodes => nodes.map(node => ({ hash: new URL(node.href).hash, text: node.textContent })));
    assert.equal(new Set(anchors.map(anchor => anchor.hash)).size, anchors.length);
    for (const anchor of anchors) assert.equal(await page.locator('[id]').evaluateAll((nodes, id) => nodes.filter(node => node.id === id).length, decodeURIComponent(anchor.hash.slice(1))), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
    assert.equal(await rail.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
    if (!mobile) {
      assert.equal(await rail.evaluate(node => getComputedStyle(node.firstElementChild, '::before').width), '1px');
      const layout = await page.evaluate(() => ({ main: document.querySelector('.main-article').getBoundingClientRect().right, rail: document.querySelector('.chapter-widget').getBoundingClientRect().left }));
      assert.ok(layout.rail > layout.main, 'Rail remains beside the article, without overlap');
      const edge = await rail.evaluate(node => {
        const list = node.firstElementChild;
        const style = getComputedStyle(list, '::before');
        return document.documentElement.clientWidth - (list.getBoundingClientRect().right - parseFloat(style.right));
      });
      assert.ok(edge >= 8 && edge <= 36, `Chapter line stays at the viewport far-right edge with a safe inset: ${edge}`);
      assert.equal(await links.first().evaluate(node => getComputedStyle(node).textAlign), 'right');
    }
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `chapters-${width}-${scheme}-${js ? 'js' : 'no-js'}.png`) });
    // Keyboard traverses clipped/offscreen links; Enter uses native hash navigation.
    const target = links.nth(9);
    const href = await target.getAttribute('href');
    await target.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(new URL(href, origin).href, { waitUntil: 'commit' });
    const hash = new URL(page.url()).hash;
    const id = decodeURIComponent(hash.slice(1));
    await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top - 24) < 3, id);
    if (js) {
      await page.waitForFunction(id => [...document.querySelectorAll('.chapter-rail a[aria-current="location"]')].every(link => decodeURIComponent(new URL(link.href).hash.slice(1)) === id), id);
      assert.equal(await rail.locator('a[aria-current="location"]').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      assert.equal(await page.evaluate(() => history.scrollRestoration), 'auto');
      const url = page.url();
      // Manual document scrolling changes the active chapter without rewriting URL.
      await page.evaluate(() => scrollBy(0, 1600));
      await page.waitForTimeout(120);
      assert.equal(page.url(), url);
      assert.equal(await rail.locator('a[aria-current="location"]').count(), 1);
      if (motion === 'reduce') assert.equal(await target.evaluate(node => getComputedStyle(node).transitionDuration), '0s');
      const snapshot = () => page.evaluate(id => ({
        y: scrollY, height: document.documentElement.scrollHeight,
        targetTop: document.getElementById(id)?.getBoundingClientRect().top,
        details: { open: document.querySelector('.chapter-mobile details')?.open, height: document.querySelector('.chapter-mobile')?.getBoundingClientRect().height },
        article: document.querySelector('.article-content')?.getBoundingClientRect().toJSON(),
        visuals: [...document.querySelectorAll('figure.article-visual')].map(figure => ({ id: figure.id, state: figure.dataset.visualState, height: figure.getBoundingClientRect().height, top: figure.getBoundingClientRect().top, outlineOpen: figure.querySelector('details')?.open })),
        lifecycle: window.__chapterLifecycle,
      }), id);
      const beforeBack = await snapshot();
      const scroll = beforeBack.y;
      await page.goto(origin + '/');
      await page.goBack({ waitUntil: 'commit' });
      await page.evaluate(() => document.fonts.ready);
      if (mobile) await page.waitForFunction(() => document.querySelector('.chapter-mobile details').open);
      try { await page.waitForFunction(scroll => Math.abs(scrollY - scroll) < 4, scroll); }
      catch (error) {
        console.log('CHAPTER_BACK_DIAGNOSTICS', JSON.stringify({ width, before: beforeBack, after: await snapshot() }));
        throw error;
      }
      await page.waitForFunction(() => document.querySelector('.chapter-rail a[aria-current="location"]'));
    }
    // Direct deep links work independently of enhancement and preserve the heading ID.
    await page.goto(origin + path + hash);
    await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top - 24) < 3, id);
    assert.deepEqual(errors, [], 'No runtime errors');
    console.log(`PASS chapters ${width}px ${scheme} ${motion} ${js ? 'JS' : 'no JS'}: anchors, keyboard, long titles, overflow, direct links${js ? ', scroll spy and history restoration' : ''}`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
