/** CI-only browser/layout QA. Synthetic presentation hints, never real accounts. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';

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
const screenshotDirectory = process.env.SITE_ACCOUNT_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
async function openMobileNavigation(page, width) {
  if (width >= 768) return;
  const menu = page.locator('#main-menu');
  if (!await menu.isVisible()) await page.locator('#toggle-menu').click();
  await expect(menu).toBeVisible();
}
let browser;
try {
  browser = await chromium.launch();
  for (const width of [1280, 485]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const authRequests = [];
    page.on('request', request => { if (/\/auth\/v1\/|\/api\/admin\/|resend\.com/.test(request.url())) authRequests.push(request.url()); });
    // Do not send real external analytics, Auth or provider traffic during QA.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin, { waitUntil: 'networkidle' });
    await openMobileNavigation(page, width);
    const widget = page.locator('[data-site-account]');
    await expect(widget).toBeVisible();
    await expect(widget.locator('[data-site-account-guest]')).toBeVisible();
    for (const label of ['Sign in', 'Register']) {
      const link = widget.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const key = await widget.evaluate(node => `dex-community-account-view:v1:${node.dataset.project}`);
    const expiresAt = Date.now() + 240_000;
    await page.evaluate(({ key, expiresAt }) => { sessionStorage.setItem(key, JSON.stringify({ initials: 'QA', expiresAt })); window.dispatchEvent(new Event('focus')); }, { key, expiresAt });
    await expect(widget.locator('[data-site-account-avatar]')).toHaveText('QA');
    await expect(widget.locator('[data-site-account-member]')).toBeVisible();
    const summary = widget.locator('summary'); await summary.click();
    await expect(widget.getByRole('link', { name: 'Account & sign out' })).toBeVisible();
    await page.keyboard.press('Escape');
    assert.equal(await widget.locator('details').evaluate(node => node.open), false);
    await expect(summary).toBeFocused();
    await summary.click(); await summary.click(); await summary.click();
    assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).expiresAt, key), expiresAt, 'Opening and closing never renews the display hint');
    if (width >= 1024) {
      await page.locator('#site-navigation-disclosure > summary').click();
      await expect(summary).toBeVisible();
      const box = await summary.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#site-navigation-disclosure > summary').click();
    }
    if (!await widget.locator('details').evaluate(node => node.open)) await summary.click();
    await widget.getByRole('link', { name: 'Account & sign out' }).click();
    await page.waitForURL('**/test/forum-v1/#account');
    // The local HTTP fixture cannot initialize production HTTPS Auth. Only the
    // allowlisted native destination/Back behavior is tested here; real intent
    // view handling is covered by the HTTPS synthetic DOM tests.
    await page.evaluate(key => sessionStorage.removeItem(key), key); // synthetic community signout clears only the hint
    await page.goBack({ waitUntil: 'networkidle' });
    await openMobileNavigation(page, width);
    await expect(page.locator('[data-site-account-guest]')).toBeVisible();
    await expect(page.locator('[data-site-account-avatar]')).toHaveText('');
    for (const [label, hash] of [['Sign in', '#signin'], ['Register', '#register']]) {
      await page.locator('[data-site-account]').getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`**/test/forum-v1/${hash}`);
      await page.goBack({ waitUntil: 'networkidle' });
      await openMobileNavigation(page, width);
      await expect(page.locator('[data-site-account-guest]')).toBeVisible();
    }
    assert.deepEqual(authRequests, [], 'Global hints and URL navigation never start Auth/OTP/admin requests');
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, `site-account-${width}.png`), fullPage: false });
    console.log(`PASS passive global account ${width}px: targets, hint, Escape, repeat, fixed intents, Back and synthetic logout clear`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
