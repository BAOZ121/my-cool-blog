/** Production retirement QA. Never sends Auth or backend traffic. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
const retiredPaths = ['/test/forum-v1/', '/test/forum-admin-v1/', '/test/auth/callback-v1/', '/test/auth/recovery-v1/'];
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  for (const width of [1280, 390]) for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled });
    const page = await context.newPage();
    const forbiddenRequests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/supabase|resend\.com|\/api\/(community|admin)|community-real|forum-test\.|forum-admin-test\.|site-account\.[a-f0-9]+\.js/.test(request.url())) forbiddenRequests.push(request.url());
    });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    for (const path of ['/', '/library/', '/post/commercial-space-advanced-engineering/', ...retiredPaths]) {
      // Old email links must not start an exchange or preserve callback credentials.
      const suffix = path.includes('/auth/') ? '?code=synthetic-only#access_token=synthetic-only' : '';
      await page.goto(origin + path + suffix, { waitUntil: 'networkidle' });
      await expect(page.locator('[data-community-entry], [data-site-account]')).toHaveCount(0);
      await expect(page.locator('#main-menu a[href*="/test/forum"], #main-menu a[href*="/test/auth"]')).toHaveCount(0);
      if (retiredPaths.includes(path)) {
        await expect(page.locator('[data-community-retired]')).toBeVisible();
        await expect(page.locator('form, input, textarea, [data-community-mode]')).toHaveCount(0);
        if (javaScriptEnabled && path.includes('/auth/')) assert.equal(page.url(), origin + path, 'Retired callback removes URL credentials without Auth');
      }
    }
    assert.deepEqual(forbiddenRequests, [], 'No community, Auth, admin or legacy UI network activity');
    assert.deepEqual(errors, [], 'Retired pages remain free of runtime errors');
    console.log(`PASS retirement ${width}px ${javaScriptEnabled ? 'JS' : 'no JS'}: old routes closed, navigation removed, no forms or service requests`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
