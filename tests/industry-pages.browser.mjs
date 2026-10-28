import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(process.env.PREVIEW_ROOT || 'public');
const output = resolve(process.env.SCREENSHOT_DIR || 'test-results/industry-pages');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.csv': 'text/csv' };
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = resolve(root, '.' + pathname);
    if (!target.startsWith(root + sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream');
    res.end(await readFile(target));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const failures = [];
try {
  for (const width of [1440, 1024, 390]) {
    for (const scheme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('StackColorScheme', 'auto'));
      const page = await context.newPage();
      page.on('pageerror', e => failures.push(e.message));
      await page.goto(base + '/');
      assert.equal(await page.locator('a[href="/industry-breakdowns/"]').count(), 0, 'Retired directory must disappear from home and navigation');
      await page.goto(base + '/industry-breakdowns/semiconductors/');
      assert.equal(await page.locator('.bd-detail h1').textContent(), 'Semiconductors');
      assert.equal(await page.locator('.bd-breadcrumb a').getAttribute('href'), '/library/');
      assert.equal(await page.locator('a[href="/industry-breakdowns/"]').count(), 0, 'Profile must not link to retired directory');
      const expand = page.locator('[data-expand-chain]');
      await expand.waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-chain-detail][open]').count(), 0);
      await expand.click();
      assert.equal(await page.locator('[data-chain-detail][open]').count(), 3);
      await expand.click();
      assert.equal(await page.locator('[data-chain-detail][open]').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Profile page overflows');
      if (width !== 1024) await page.screenshot({ path: resolve(output, `industry-profile-${scheme}-${width}.png`), fullPage: false });

      for (const path of ['/industries/', '/post/50-high-potential-industries/', '/data/industries.json', '/data/industries.csv']) {
        const response = await page.request.get(base + path);
        assert.equal(response.status(), 404, `Withdrawn route still served: ${path}`);
      }
      await page.goto(base + '/');
      assert.equal(await page.locator('.research-landing').count(), 0);
      assert.equal(await page.locator('a[href="/industries/"]').count(), 0);
      await context.close();
      console.log(`PASS ${width}px ${scheme}: retained profile disclosures, responsive layout, and list withdrawal`);
    }
  }
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const page = await nojs.newPage();
  await page.goto(base + '/industry-breakdowns/semiconductors/');
  assert.equal(await page.locator('[data-chain-detail]').count(), 3);
  assert.equal(await page.locator('[data-expand-chain]').isVisible(), false);
  await page.locator('[data-chain-detail] summary').first().click();
  assert.equal(await page.locator('[data-chain-detail][open]').count(), 1);
  assert.equal(await page.locator('.bd-breadcrumb a').getAttribute('href'), '/library/');
  await nojs.close();
  assert.deepEqual(failures, [], 'Unexpected browser errors');
  console.log('PASS without JavaScript: native details and retained profiles remain readable');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
