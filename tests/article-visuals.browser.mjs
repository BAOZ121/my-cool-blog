import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';

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
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const slugs = ['cybersecurity-industry-report', 'pharmaceutical-industry', 'vr-industry-report-2026', 'semiconductor-industry-report'];
const captures = process.env.VISUAL_SCREENSHOT_DIR;
if (captures) await mkdir(captures, { recursive: true });
const failures = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width < 600, isMobile: width < 600 });
    for (const slug of slugs) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') console.log(`[browser ${slug}] ${message.text()}`); });
      await page.goto(`${base}/post/${slug}/`, { waitUntil: 'domcontentloaded' });
      const figures = page.locator('figure.article-visual');
      assert.equal(await figures.count(), 2);
      for (let index = 0; index < 2; index++) {
        const figure = figures.nth(index);
        await figure.scrollIntoViewIfNeeded();
        await page.waitForFunction(index => document.querySelectorAll('figure.article-visual')[index]?.dataset.visualState === 'ready', index, { timeout: 20000 });
        assert.ok(await figure.locator('.visual-stage svg').count());
        assert.equal(await figure.locator('.visual-fallback').evaluate(el => el.open), false);
        const box = await figure.boundingBox();
        assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${slug}: graphic overflows at ${width}px`);
        if (index === 0) {
          const initial = await figure.locator('foreignObject').count();
          await figure.locator('[data-action="expand"]').click();
          await page.waitForFunction(({ index, initial }) => document.querySelectorAll('figure.article-visual')[index].querySelectorAll('foreignObject').length > initial, { index, initial });
          await figure.locator('[data-action="collapse"]').click();
          await page.waitForFunction(({ index, initial }) => document.querySelectorAll('figure.article-visual')[index].querySelectorAll('foreignObject').length === initial, { index, initial });
          const branch = figure.locator('circle[role="button"]').first();
          assert.ok(await branch.count(), 'Map branches need keyboard controls');
          await figure.locator('[data-action="fit"]').click();
          if (width < 600) {
            const size = await figure.locator('foreignObject').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) * el.getScreenCTM().a);
            assert.ok(size >= 10.5, `${slug}: mobile node text too small (${size}px)`);
          } else {
            await figure.locator('.visual-stage').hover();
            const before = await page.evaluate(() => scrollY);
            await page.mouse.wheel(0, 250);
            await page.waitForTimeout(100);
            assert.ok(await page.evaluate(() => scrollY) > before, 'Ordinary wheel must scroll the article');
          }
        }
        await figure.locator('.visual-fallback summary').click();
        assert.equal(await figure.locator('.visual-fallback').evaluate(el => el.open), true);
        await figure.locator('.visual-fallback summary').click();
        if (captures && slug === 'vr-industry-report-2026') await figure.screenshot({ path: resolve(captures, `xr-${index ? 'share' : 'map'}-${width}.png`) });
      }
      const share = figures.nth(1);
      const light = await share.evaluate(el => getComputedStyle(el).backgroundColor);
      await page.evaluate(() => document.documentElement.dataset.scheme = 'dark');
      await page.waitForTimeout(100);
      assert.notEqual(await share.evaluate(el => getComputedStyle(el).backgroundColor), light);
      if (captures && slug === 'vr-industry-report-2026') await share.screenshot({ path: resolve(captures, `xr-share-dark-${width}.png`) });
      await share.locator('[data-action="fullscreen"]').click();
      assert.ok(await share.evaluate(el => document.fullscreenElement === el || el.classList.contains('is-expanded')));
      await share.locator('[data-action="fullscreen"]').click();
      assert.equal(await share.evaluate(el => document.fullscreenElement === el || el.classList.contains('is-expanded')), false);
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({ media: 'print' });
      assert.equal(await share.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)', 'Dark mode must print on white');
      assert.equal(await share.locator('.visual-stage').evaluate(el => getComputedStyle(el).display), 'none');
      for (let index = 0; index < 2; index++) assert.equal(await figures.nth(index).locator('.visual-fallback').evaluate(el => el.open), true);
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      assert.deepEqual(errors, [], `${slug} browser errors`);
      console.log(`PASS ${slug}: ${width}px, both charts, controls, dark theme and print`);
      await page.close();
    }
    await context.close();
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await noJS.newPage();
  await page.goto(`${base}/post/vr-industry-report-2026/`);
  for (const details of await page.locator('.visual-fallback').all()) assert.equal(await details.evaluate(el => el.open), true);
  assert.match(await page.locator('.visual-table').innerText(), /74\.6%/);
  assert.equal(await page.locator('.visual-toolbar:visible').count(), 0);
  await noJS.close();
  const blocked = await browser.newContext();
  await blocked.route('**/vendor/article-visuals/*.js', route => route.abort());
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(`${base}/post/vr-industry-report-2026/`);
  for (const figure of await blockedPage.locator('.article-visual').all()) {
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('[role="status"]').filter({ hasText: 'unavailable' }).waitFor();
    assert.equal(await figure.locator('.visual-fallback').evaluate(el => el.open), true);
  }
  await blocked.close();
  console.log('PASS no-JavaScript and blocked-library fallbacks');
} catch (error) {
  failures.push(error);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
if (failures.length) throw failures[0];
