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
      await page.goto(base + '/industry-breakdowns/');
      await page.locator('.bd-filters').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.bd-card:visible').count(), 6);
      assert.equal(await page.locator('.right-sidebar').count(), 0);
      if (width >= 1024) assert.ok((await page.locator('.bd-card').first().boundingBox()).y < 750, 'Guides should be visible on the first screen');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Guide page overflows');
      if (width !== 1024) await page.screenshot({ path: resolve(output, `industry-guides-${scheme}-${width}.png`), fullPage: false });
      await page.locator('#bd-query').fill('chips');
      assert.equal(await page.locator('.bd-card:visible').count(), 1);
      await page.locator('#bd-query').fill('no-such-industry');
      assert.equal(await page.locator('[data-breakdown-empty]').isVisible(), true);
      await page.getByRole('button', { name: 'Clear filters' }).click();
      assert.equal(await page.locator('.bd-card:visible').count(), 6);
      await page.locator('#bd-category').selectOption('Energy');
      assert.equal(await page.locator('.bd-card:visible').count(), 1);

      await page.goto(base + '/industries/');
      await page.locator('.ix-filters').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#ix-tbody tr').count(), 50);
      assert.equal(await page.locator('.right-sidebar').count(), 0);
      assert.equal(await page.locator('#ix-dialog').isVisible(), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Explorer page overflows');
      assert.ok(await page.locator('.ix-table-wrap').evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1), 'Table must not have nested scrolling');
      if (width >= 1024) assert.ok((await page.locator('#ix-tbody tr').first().boundingBox()).y < 750, 'Data should be visible on the first screen');
      if (width !== 1024) await page.screenshot({ path: resolve(output, `industry-explorer-${scheme}-${width}.png`), fullPage: false });
      await page.locator('#ix-q').fill('Semiconductors');
      assert.equal(await page.locator('#ix-tbody tr[data-rank]').count(), 2);
      await page.locator('#ix-category').selectOption('Energy');
      assert.equal(await page.locator('.ix-empty').isVisible(), true);
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      assert.equal(await page.locator('#ix-tbody tr').count(), 50);
      await page.locator('.ix-more-filters > summary').click();
      await page.locator('#ix-cagr').selectOption('25');
      assert.ok(await page.locator('#ix-tbody tr[data-rank]').count() < 50);
      await page.locator('#ix-maturity').selectOption('Growth');
      assert.ok(await page.locator('#ix-tbody tr[data-rank]').count() > 0);
      await page.locator('.ix-more-filters > summary').click();
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      assert.equal(await page.locator('#ix-tbody tr').count(), 50);
      await page.getByRole('button', { name: 'View details for Semiconductors', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await page.locator('#ix-detail-title').textContent(), 'Semiconductors');
      assert.equal(await dialog.getByRole('link', { name: 'Read industry guide', exact: true }).count(), 1);
      assert.equal(await dialog.getByRole('link', { name: 'View share chart', exact: true }).count(), 1);
      assert.match(await page.locator('#ix-details').textContent(), /No numeric source recorded/);
      assert.match(await page.locator('#ix-details').textContent(), /795.6/);
      assert.equal(await page.locator('#ix-scenario').getAttribute('open'), null);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('#ix-dialog').contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement === document.querySelector('.ix-select[data-rank="2"]'));
      assert.equal(await page.locator('.ix-select[data-rank="2"]').evaluate(e => e === document.activeElement), true);
      await page.getByRole('button', { name: 'View details for Semiconductors', exact: true }).click();
      await page.locator('#ix-scenario > summary').click();
      await page.locator('#ix-pv').fill('310');
      await page.locator('#ix-rate').fill('30');
      await page.locator('#ix-years').fill('5');
      assert.match(await page.locator('#ix-result').textContent(), /1.15T/);
      assert.equal(await page.locator('#ix-year-list li').count(), 5);
      assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Details overflow');
      if (width !== 1024 && scheme === 'dark') await page.screenshot({ path: resolve(output, `industry-details-${width}.png`), fullPage: false });
      await page.getByRole('button', { name: 'Close industry details' }).click();
      if (width === 390) {
        await page.locator('#ix-sort-mobile').selectOption('name');
        const names = await page.locator('.ix-industry-name').allTextContents();
        assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
      } else {
        await page.locator('th .ix-sort[data-sort="name"]').click();
        const names = await page.locator('.ix-industry-name').allTextContents();
        assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
      }
      await page.goto(base + '/industries/?industry=2#ix-industry-2');
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#ix-detail-title').textContent(), 'Semiconductors');
      await page.keyboard.press('Escape');
      await page.goto(base + '/industries/#source-review-notes');
      assert.equal(await page.locator('#source-review-notes').getAttribute('open'), '');
      assert.equal(await page.locator('.ix-source-body table').count(), 1);
      await context.close();
      console.log(`PASS ${width}px ${scheme}: layout, filtering, sorting, dialog, focus return, sources, calculator, and deep links`);
    }
  }
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const page = await nojs.newPage();
  await page.goto(base + '/industries/');
  assert.equal(await page.locator('#ix-tbody tr').count(), 50);
  assert.equal(await page.locator('.ix-filters').isVisible(), false);
  await page.locator('#ix-industry-2 summary').click();
  assert.equal(await page.locator('#ix-industry-2').getByRole('link', { name: 'Read industry guide', exact: true }).isVisible(), true);
  await page.goto(base + '/industry-breakdowns/');
  assert.equal(await page.locator('.bd-card').count(), 6);
  await nojs.close();
  assert.deepEqual(failures, [], 'Unexpected browser errors');
  console.log('PASS without JavaScript: industry list, native details, related research, and guides remain readable');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
