/** Local preview QA: every network request is fulfilled from files or fixtures. */
import assert from 'node:assert/strict';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = 'https://thedexs.com';
const realRoot = resolve(process.env.BUILT_SITE_DIR || 'public');
const demoRoot = process.env.DEMO_SITE_DIR ? resolve(process.env.DEMO_SITE_DIR) : null;
const screenshots = resolve(process.env.NAVIGATION_MERGER_SCREENSHOT_DIR || 'test-results/navigation-merger');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
const configBefore = await readFile('data/community.json', 'utf8');
const uid = '11111111-1111-4111-8111-111111111111';
const topics = [
  { id: '22222222-2222-4222-8222-222222222222', kind: 'topic', title: 'Preview sample: following the evidence', body: 'Which sources help explain how an industry changes? This is local browser QA sample content.', author_id: uid, pinned: true, hidden: false, locked: false, created_at: '2026-10-14T10:00:00Z', version: 1 },
  { id: '33333333-3333-4333-8333-333333333333', kind: 'topic', title: 'Preview sample: a research question', body: 'Compare the market structure and the technology behind it. Local QA sample content only.', author_id: uid, pinned: false, hidden: false, locked: false, created_at: '2026-10-14T09:00:00Z', version: 1 },
];
const messages = [
  { id: '44444444-4444-4444-8444-444444444444', kind: 'message', body: 'Preview sample: what should DEX research next?', author_id: uid, hidden: false, created_at: '2026-10-14T10:00:00Z', version: 1 },
  { id: '55555555-5555-4555-8555-555555555555', kind: 'message', body: 'Preview sample: a question, a suggestion, or a quick hello.', author_id: uid, hidden: false, created_at: '2026-10-14T09:00:00Z', version: 1 },
];
const demoTopics = topics.map((post, index) => ({ id: `saved-${index}`, title: post.title, body: post.body, author: 'Preview reader', initials: 'PR', category: 'Industry research', stamp: 2 - index, pinned: post.pinned, hidden: false, locked: false, replies: [] }));
const demoMessages = messages.map((post, index) => ({ id: `saved-note-${index}`, body: post.body, author: 'Preview reader', hidden: false }));

await access(resolve(realRoot, 'library/index.html'));
await mkdir(screenshots, { recursive: true });
let chromePath = process.env.CHROME_PATH;
if (!chromePath && process.platform === 'win32') {
  for (const candidate of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) {
    try { await access(candidate); chromePath = candidate; break; } catch { /* Try next installed browser. */ }
  }
}
const report = { localOnly: true, realScreenshots: [], demoScreenshots: [], cases: [], apiReads: [], blockedExternal: [], unexpectedApi: [], missingFiles: [] };

async function fencedContext(browser, root, width, scheme, { demo = false, js = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', javaScriptEnabled: js, serviceWorkers: 'block' });
  await context.addInitScript(({ scheme, demo, demoTopics, demoMessages }) => {
    localStorage.setItem('StackColorScheme', scheme);
    if (demo) {
      if (localStorage.getItem('dex-onsite-forum-test-v1') === null) localStorage.setItem('dex-onsite-forum-test-v1', JSON.stringify(demoTopics));
      if (localStorage.getItem('dex-onsite-message-board-test-v1') === null) localStorage.setItem('dex-onsite-message-board-test-v1', JSON.stringify(demoMessages));
    }
  }, { scheme, demo, demoTopics, demoMessages });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      report.blockedExternal.push({ origin: url.origin, path: url.pathname, method: request.method() });
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') { report.unexpectedApi.push({ path: url.pathname, method: request.method() }); return route.fulfill({ status: 403, json: { error: { code: 'forbidden' } } }); }
      if (url.pathname === '/api/community/topics' || url.pathname === '/api/community/messages') {
        report.apiReads.push(url.pathname);
        return route.fulfill({ json: { data: url.pathname.endsWith('/topics') ? topics : messages } });
      }
      report.unexpectedApi.push({ path: url.pathname, method: request.method() });
      return route.fulfill({ status: 403, json: { error: { code: 'forbidden' } } });
    }
    if (request.method() !== 'GET') { report.unexpectedApi.push({ path: url.pathname, method: request.method() }); return route.abort('blockedbyclient'); }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return route.fulfill({ status: 400, body: 'Invalid path' }); }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) return route.fulfill({ status: 403, body: 'Invalid path' });
    try { return route.fulfill({ contentType: types[extname(file)] || 'application/octet-stream', body: await readFile(file) }); }
    catch { report.missingFiles.push(pathname); return route.fulfill({ status: 404, body: 'Not found in local build' }); }
  });
  return context;
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const key = [document.documentElement.scrollHeight, document.documentElement.scrollWidth, innerWidth].join(':');
    const previous = window.__mergerLayout;
    window.__mergerLayout = { key, frames: previous?.key === key ? previous.frames + 1 : 0 };
    return window.__mergerLayout.frames >= 5;
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
}
async function screenshot(page, name, demo = false) {
  await page.evaluate(() => scrollTo(0, 0));
  await settle(page);
  const path = resolve(screenshots, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  report[demo ? 'demoScreenshots' : 'realScreenshots'].push(path);
}
async function assertMenu(page, active) {
  const links = page.locator('#main-menu > li > a');
  assert.deepEqual(await links.evaluateAll(nodes => nodes.map(node => node.textContent.trim())), ['Forum', 'Home', 'Library', 'Search', 'Contact', 'About & Methodology']);
  assert.deepEqual(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['/test/forum-v1/', '/', '/library/', '/search/', '/contact/', '/about/']);
  await expect(page.locator(`#main-menu > li > a[href="${active}"]`)).toHaveAttribute('aria-current', 'page');
  assert.equal(await page.locator('#main-menu > li > a[aria-current="page"]').count(), 1);
}
async function nativeActivate(link, page) {
  await link.focus();
  await page.keyboard.press('Enter');
}

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
  for (const [width, scheme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']]) {
    const context = await fencedContext(browser, realRoot, width, scheme);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/test/forum-v1/', { waitUntil: 'networkidle' });
    await expect(page.locator('#rc-topics')).toContainText(topics[0].title);
    await expect(page.locator('#rc-topics')).toContainText(topics[1].title);
    await assertMenu(page, '/test/forum-v1/');
    await expect(page.locator('#rc-discussions-link')).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('#rc-forum-panel')).toBeVisible();
    await expect(page.locator('#rc-board-panel')).toBeHidden();
    await screenshot(page, `forum-discussions-${width}-${scheme}`);
    await nativeActivate(page.locator('#rc-board-link'), page);
    await page.waitForURL(origin + '/test/forum-v1/#message-board');
    await expect(page.locator('#rc-board-panel')).toBeVisible();
    await expect(page.locator('#rc-forum-panel')).toBeHidden();
    await expect(page.locator('#rc-board-link')).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('#rc-messages')).toContainText(messages[0].body);
    await expect(page.locator('#rc-messages')).toContainText(messages[1].body);
    await expect(page.locator('#rc-board-form fieldset')).toHaveJSProperty('disabled', true);
    await expect(page.locator('#rc-board-form textarea')).toBeDisabled();
    await expect(page.locator('#rc-board-form button[type="submit"]')).toBeDisabled();
    await expect(page.locator('[data-admin-link]:visible')).toHaveCount(0);
    await screenshot(page, `forum-message-board-${width}-${scheme}`);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#rc-board-panel')).toBeVisible();
    await nativeActivate(page.locator('#rc-discussions-link'), page);
    await page.waitForURL(origin + '/test/forum-v1/#discussion');
    await page.goBack();
    await expect(page.locator('#rc-board-panel')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#rc-forum-panel')).toBeVisible();
    await page.goto(origin + '/test/forum-v1/#signin', { waitUntil: 'networkidle' });
    await expect(page.locator('#rc-auth')).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#rc-auth')).toHaveJSProperty('open', false);
    await page.goto(origin + '/library/', { waitUntil: 'networkidle' });
    await expect(page.locator('.library-hub h1')).toHaveText('Library');
    await assertMenu(page, '/library/');
    assert.deepEqual(await page.locator('.library-category').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['/archives/', '/evidence-library/']);
    assert.deepEqual(await page.locator('.library-category h2').allTextContents(), ['Archives', 'Evidence Library']);
    await screenshot(page, `library-${width}-${scheme}`);
    if (width < 768) {
      await page.locator('#toggle-menu').click();
      await expect(page.locator('#main-menu')).toBeVisible();
      await screenshot(page, `library-menu-${width}-${scheme}`);
      await page.locator('#toggle-menu').click();
    }
    for (const [name, path] of [['Archives', '/archives/'], ['Evidence Library', '/evidence-library/']]) {
      await nativeActivate(page.locator(`.library-category[href="${path}"]`), page);
      await page.waitForURL(origin + path);
      await assertMenu(page, '/library/');
      await expect(page.locator('.library-nav__links a[aria-current="page"]')).toHaveText(name);
      await expect(page.locator('main h1').first()).toHaveText(name);
      await settle(page);
      if (width === 1440 && scheme === 'light') await screenshot(page, `library-category-${path.split('/')[1]}-${width}-${scheme}`);
      await page.goBack({ waitUntil: 'networkidle' });
      await expect(page.locator('.library-hub')).toBeVisible();
    }
    assert.deepEqual(errors, [], 'No runtime errors in merged navigation');
    report.cases.push(`PASS real UI ${width}px ${scheme}: single entries, native sections, old fragments, reload/history, visitor gate, sign-in intent, 3 categories and old paths`);
    console.log(report.cases.at(-1));
    await context.close();
  }
  if (demoRoot) {
    await access(resolve(demoRoot, 'test/forum-v1/index.html'));
    const context = await fencedContext(browser, demoRoot, 1440, 'light', { demo: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const readsBefore = report.apiReads.length;
    await page.goto(origin + '/test/forum-v1/#message-board', { waitUntil: 'networkidle' });
    await expect(page.locator('#board-panel')).toBeVisible();
    await expect(page.locator('#forum-panel')).toBeHidden();
    await expect(page.locator('#show-board')).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('#board-messages')).toContainText(messages[0].body);
    await expect(page.locator('#board-messages')).toContainText(messages[1].body);
    await screenshot(page, 'forum-demo-existing-message-board-1440-light', true);
    await nativeActivate(page.locator('#show-forum'), page);
    await expect(page.locator('#topics')).toContainText(topics[0].title);
    await expect(page.locator('#topics')).toContainText(topics[1].title);
    await expect(page.locator('#show-forum')).toHaveAttribute('aria-current', 'location');
    await screenshot(page, 'forum-demo-existing-discussions-1440-light', true);
    await page.goBack();
    await expect(page.locator('#board-panel')).toBeVisible();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dex-onsite-message-board-test-v1')).length), 2);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dex-onsite-forum-test-v1')).length), 2);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#board-messages')).toContainText(messages[1].body);
    assert.equal(report.apiReads.length, readsBefore, 'Demo mode never accesses connected data');
    assert.deepEqual(errors, []);
    report.cases.push('PASS demo UI: existing local discussions/messages survive merge, deep link, native switch, Back and reload; no API requests');
    console.log(report.cases.at(-1));
    await context.close();
  }
  const context = await fencedContext(browser, realRoot, 1440, 'light', { js: false });
  const page = await context.newPage();
  await page.goto(origin + '/library/');
  await expect(page.locator('.library-category')).toHaveCount(3);
  await page.locator('.library-category[href="/archives/"]').click();
  await page.waitForURL(origin + '/archives/');
  await expect(page.locator('.library-nav__links a[aria-current="page"]')).toHaveText('Archives');
  await page.locator('.library-nav__home').click();
  await page.waitForURL(origin + '/library/');
  report.cases.push('PASS Library no-JavaScript native category navigation');
  console.log(report.cases.at(-1));
  await context.close();
  assert.deepEqual(report.unexpectedApi, [], 'No Auth/admin/write actions were requested');
  assert.deepEqual(report.missingFiles, [], 'Every same-origin resource was served from the local build');
  assert.equal(report.blockedExternal.some(request => /supabase\.co$/.test(new URL(request.origin).hostname)), false, 'Guest navigation does not start Supabase Auth');
  assert.equal(await readFile('data/community.json', 'utf8'), configBefore, 'Production connection config unchanged');
} finally {
  await browser?.close();
  await writeFile(resolve(screenshots, 'qa-report.json'), JSON.stringify(report, null, 2) + '\n');
}
