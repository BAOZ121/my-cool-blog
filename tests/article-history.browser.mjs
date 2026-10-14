import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';

// Test only the generated static site. No authentication or external writes.
const root = resolve(process.env.ARTICLE_HISTORY_ROOT || 'public');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const article = '/post/commercial-space-advanced-engineering/';
const mapID = 'industry-map-commercial-space-value-chain';
const readingSelector = 'p,h1,h2,h3,h4,h5,h6,li,td';
const screenshots = process.env.ARTICLE_HISTORY_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
const cases = [
  { name: '1920-minimized', width: 1920, scheme: 'light', motion: 'reduce', minimized: true },
  { name: '1920-expanded', width: 1920, scheme: 'light', motion: 'reduce', minimized: false },
  { name: '1440-minimized', width: 1440, scheme: 'dark', motion: 'no-preference', minimized: true },
  { name: '390-open', width: 390, scheme: 'light', motion: 'reduce', mobileOpen: true },
  { name: '320-closed', width: 320, scheme: 'dark', motion: 'no-preference', mobileOpen: false },
].filter(test => !process.env.ARTICLE_HISTORY_CASE || test.name === process.env.ARTICLE_HISTORY_CASE);
assert.ok(cases.length, 'ARTICLE_HISTORY_CASE must select a known case');

// Observe the finished layout without moving the document or changing history.
// Waiting for ready graphics and stable frames avoids asserting during a lazy
// renderer's stage/outline swap, while still detecting its final reading drift.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.__articleHistoryLayout = null; });
  await page.waitForFunction(() => {
    const pending = !!document.querySelector('.article-visual[data-visual-state="loading"]');
    const key = [scrollY, document.documentElement.scrollHeight,
      document.querySelector('.article-content')?.getBoundingClientRect().top,
      ...[...document.querySelectorAll('figure.article-visual')].map(figure => `${figure.dataset.visualState}:${figure.getBoundingClientRect().height}`)].join('|');
    const previous = window.__articleHistoryLayout;
    const frames = !pending && previous?.key === key ? previous.frames + 1 : 0;
    window.__articleHistoryLayout = { key, frames };
    return !pending && frames >= 12;
  });
}

async function snapshot(page, index = null) {
  return page.evaluate(({ readingSelector, index, mapID }) => {
    const content = document.querySelector('.article-content');
    const texts = [...content.querySelectorAll(readingSelector)].filter(node => !node.closest('figure'));
    const selected = index ?? texts.findIndex(node => {
      const rect = node.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > 72 && rect.top < innerHeight;
    });
    const node = texts[selected];
    const map = document.getElementById(mapID);
    return {
      url: location.href, y: scrollY, documentHeight: document.documentElement.scrollHeight,
      anchor: node ? { index: selected, tag: node.tagName, text: node.textContent.trim(), top: node.getBoundingClientRect().top } : null,
      restoration: history.scrollRestoration,
      applicationState: history.state?.applicationHistoryProbe,
      desktopOpen: document.querySelector('.chapter-disclosure')?.open,
      mobileOpen: document.querySelector('.chapter-mobile details')?.open,
      map: map ? { state: map.dataset.visualState, top: map.getBoundingClientRect().top, height: map.getBoundingClientRect().height } : null,
      navigation: performance.getEntriesByType('navigation')[0]?.type,
    };
  }, { readingSelector, index, mapID });
}

async function checkReading(page, expected, label, test, deviations) {
  try {
    await page.waitForURL(expected.url, { waitUntil: 'commit' });
  } catch (error) {
    console.log('ARTICLE_HISTORY_NAVIGATION_DIAGNOSTICS', JSON.stringify({ test: test.name, label, expectedURL: expected.url, actual: await page.evaluate(() => ({ url: location.href, historyLength: history.length, trace: window.__articleHistoryNavigation })) }));
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `${test.name}-navigation-failure.png`) });
    throw error;
  }
  await settle(page);
  const actual = await snapshot(page, expected.anchor.index);
  try {
    assert.equal(actual.restoration, 'auto', `${label}: browser keeps native scroll restoration`);
    assert.equal(actual.applicationState, expected.applicationState, `${label}: unrelated application history state survives`);
    assert.equal(actual.anchor?.tag, expected.anchor.tag, `${label}: same static reading block`);
    assert.equal(actual.anchor?.text, expected.anchor.text, `${label}: same article text`);
    const deviation = Math.abs(actual.anchor.top - expected.anchor.top);
    assert.ok(deviation < 4, `${label}: reading block drift ${deviation}px must be under 4px`);
    deviations.push(deviation);
    if (actual.documentHeight === expected.documentHeight) {
      assert.ok(Math.abs(actual.y - expected.y) < 4, `${label}: equal geometry also restores exact scrollY`);
    }
    assert.equal(actual.desktopOpen, expected.desktopOpen, `${label}: desktop reading width retained`);
    assert.equal(actual.mobileOpen, expected.mobileOpen, `${label}: mobile outline layout retained`);
  } catch (error) {
    console.log('ARTICLE_HISTORY_DIAGNOSTICS', JSON.stringify({ test: test.name, label, expected, actual }));
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `${test.name}-failure.png`) });
    throw error;
  }
}

async function readAfterMap(page) {
  // Visit the actual graphic first, then read the following static paragraph.
  // This exercises a loaded graphic whose outline has a different height when
  // a history traversal creates a fresh document, without simulating hydration.
  await page.locator(`#${mapID}`).scrollIntoViewIfNeeded();
  await page.waitForFunction(mapID => document.getElementById(mapID)?.dataset.visualState === 'ready', mapID);
  await settle(page);
  const index = await page.evaluate(({ readingSelector, mapID }) => {
    const content = document.querySelector('.article-content');
    const figure = document.getElementById(mapID);
    const texts = [...content.querySelectorAll(readingSelector)].filter(node => !node.closest('figure'));
    const index = texts.findIndex(node => node.tagName === 'P' && !!(figure.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (index < 0) throw new Error('Real report needs a static paragraph after its value-chain map');
    scrollTo(0, scrollY + texts[index].getBoundingClientRect().top - 137);
    return index;
  }, { readingSelector, mapID });
  await settle(page);
  const reading = await snapshot(page, index);
  assert.ok(reading.anchor && reading.y > 1000, 'Capture a real long-article reading position');
  assert.equal(new URL(reading.url).hash, '', 'Non-hash reading position stays independent of chapters');
  return reading;
}

async function activateChapter(page, link) {
  const href = await link.getAttribute('href');
  const expectedURL = new URL(href, origin).href;
  const id = decodeURIComponent(new URL(expectedURL).hash.slice(1));
  // Focus without scrolling the mobile outline into view first, so Enter
  // navigates from the reading position being tested rather than a focus jump.
  await link.evaluate(node => node.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await page.waitForURL(expectedURL, { waitUntil: 'commit' });
  await settle(page);
  assert.ok(Math.abs(await page.locator('[id]').evaluateAll((nodes, id) => nodes.find(node => node.id === id).getBoundingClientRect().top, id) - 24) < 4, 'Native chapter destination retains the 24px reading inset');
  return expectedURL;
}

async function checkReaderInput(context, page) {
  await page.goto(origin + article);
  const previousReading = await readAfterMap(page);
  await context.addInitScript(() => {
    window.__articleHistoryInput = { trustedWheels: 0, scriptScrolls: [] };
    // Observe public scrolling APIs, forwarding every invocation unchanged.
    // No restoration state, private helper, or document geometry is modified.
    for (const name of ['scroll', 'scrollTo', 'scrollBy']) {
      const original = window[name];
      window[name] = function (...args) {
        if (window.__articleHistoryInput.trustedWheels) window.__articleHistoryInput.scriptScrolls.push(name);
        return original.apply(this, args);
      };
    }
    addEventListener('wheel', event => {
      if (event.isTrusted) window.__articleHistoryInput.trustedWheels++;
    }, { capture: true, passive: true });
  });
  let unlockVendor;
  let vendorArrived;
  const gate = new Promise(resolve => { unlockVendor = resolve; });
  const arrived = new Promise(resolve => { vendorArrived = resolve; });
  const holdVendor = async route => { vendorArrived(); await gate; await route.continue(); };
  await context.route('**/vendor/article-visuals/*.js', holdVendor);
  try {
    await page.goto(origin + '/');
    await page.goBack({ waitUntil: 'commit' });
    let timeout;
    try {
      await Promise.race([arrived, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('History return did not request its real lazy graphic vendor')), 10000); })]);
    } finally { clearTimeout(timeout); }
    await page.waitForFunction(() => document.querySelector('.article-visual[data-visual-state="loading"]'));
    const beforeInputY = await page.evaluate(() => scrollY);
    await page.mouse.move(600, 450);
    await page.mouse.wheel(0, 450);
    await page.waitForFunction(before => scrollY > before + 400, beforeInputY);
    assert.ok(await page.evaluate(() => window.__articleHistoryInput.trustedWheels > 0), 'Cancellation uses real trusted reader input');
    unlockVendor();
    await settle(page);
    const observation = await page.evaluate(() => window.__articleHistoryInput);
    assert.deepEqual(observation.scriptScrolls, [], 'A reader wheel cancels subsequent scripted history correction');
    const afterInput = await snapshot(page, previousReading.anchor.index);
    assert.ok(Math.abs(afterInput.anchor.top - previousReading.anchor.top) > 100, 'History restoration does not force the old reading line after reader input');
    assert.equal(afterInput.restoration, 'auto');
    console.log('PASS article history trusted reader input: delayed real lazy vendor, native wheel, no subsequent script scrolling');
  } finally {
    unlockVendor();
    await context.unroute('**/vendor/article-visuals/*.js', holdVendor);
  }
}

async function checkRapidTraversal(context, page, test, deviations) {
  await page.goto(origin + article);
  const reading = await readAfterMap(page);
  let unlockVendor;
  let vendorArrived;
  let abandoning = false;
  const gate = new Promise(resolve => { unlockVendor = resolve; });
  const arrived = new Promise(resolve => { vendorArrived = resolve; });
  const holdVendor = async route => {
    vendorArrived();
    await gate;
    try { await route.continue(); }
    catch (error) {
      // The old document's pending import is deliberately abandoned by the
      // immediate Forward. An aborted interception is expected only there.
      if (!abandoning) throw error;
    }
  };
  await context.route('**/vendor/article-visuals/*.js', holdVendor);
  try {
    await page.goto(origin + '/library/');
    await page.goBack({ waitUntil: 'commit' });
    let timeout;
    try {
      await Promise.race([arrived, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Rapid history return did not request its real lazy graphic vendor')), 10000); })]);
    } finally { clearTimeout(timeout); }
    await page.waitForFunction(() => document.querySelector('.article-visual[data-visual-state="loading"]'));
    abandoning = true;
    await page.goForward({ waitUntil: 'commit' });
    await page.waitForURL(origin + '/library/', { waitUntil: 'domcontentloaded' });
    unlockVendor();
    await context.unroute('**/vendor/article-visuals/*.js', holdVendor);
    await page.goBack({ waitUntil: 'commit' });
    await checkReading(page, reading, 'Rapid Forward before Back layout completes, then Back again', test, deviations);
    console.log('PASS article history rapid traversal: pending real graphic import cannot overwrite the saved reading line');
  } finally {
    unlockVendor();
    await context.unroute('**/vendor/article-visuals/*.js', holdVendor);
  }
}

async function checkGraphicReading(page) {
  // A viewport occupied by the actual large graphic is a valid reading
  // position. It must not inherit a previously saved paragraph snapshot.
  await page.evaluate(mapID => {
    const map = document.getElementById(mapID);
    scrollTo(0, scrollY + map.getBoundingClientRect().top + 40);
  }, mapID);
  await settle(page);
  const before = await snapshot(page);
  const visibleStaticTexts = await page.evaluate(readingSelector => [...document.querySelector('.article-content').querySelectorAll(readingSelector)].filter(node => {
    if (node.closest('figure')) return false;
    const rect = node.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  }).length, readingSelector);
  assert.equal(visibleStaticTexts, 0, 'The real map fills the viewport without visible static paragraphs');
  assert.ok(before.map.height > 900 && Math.abs(before.map.top + 40) < 2);
  await page.goto(origin + '/library/');
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForFunction(mapID => document.getElementById(mapID)?.dataset.visualState === 'ready', mapID);
  await settle(page);
  const after = await snapshot(page);
  assert.equal(after.url, before.url);
  assert.equal(after.restoration, 'auto');
  assert.ok(Math.abs(after.map.top - before.map.top) < 4, `Native graphic reading position must not jump to a stale paragraph (${after.map.top - before.map.top}px drift)`);
  console.log('PASS article history graphic-only viewport: no stale paragraph restoration');
}

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const test of cases) {
    const mobile = test.width < 1024;
    const context = await browser.newContext({ viewport: { width: test.width, height: 900 }, colorScheme: test.scheme, reducedMotion: test.motion, hasTouch: mobile, isMobile: mobile });
    const externalWrites = [];
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin === origin) return route.continue();
      if (!['GET', 'HEAD'].includes(request.method())) externalWrites.push({ url: request.url(), method: request.method() });
      if (request.url().startsWith('https://fonts.googleapis.com/')) return route.fulfill({ contentType: 'text/css', body: '' });
      return route.abort();
    });
    await context.addInitScript(scheme => {
      localStorage.setItem('StackColorScheme', scheme);
      window.__articleHistoryNavigation = [];
      window.navigation?.addEventListener('navigate', event => {
        window.__articleHistoryNavigation.push({ type: event.navigationType, destination: event.destination.url, source: location.href });
        if (window.__articleHistoryNavigation.length > 30) window.__articleHistoryNavigation.shift();
      });
      addEventListener('popstate', () => window.__articleHistoryNavigation.push({ type: 'popstate', url: location.href }));
    }, test.scheme);
    const page = await context.newPage();
    const errors = [];
    const deviations = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    await page.goto(origin + article);
    await page.waitForFunction(() => document.querySelector('.chapter-rail a[aria-current="location"]'));
    if (mobile && test.mobileOpen) await page.locator('.chapter-mobile summary').click();
    if (!mobile && test.minimized) await page.locator('.chapter-widget summary').click();
    await settle(page);
    await page.evaluate(() => history.replaceState({ ...history.state, applicationHistoryProbe: 'first article entry' }, '', location.href));
    const reading = await readAfterMap(page);

    // Forward into the article must restore a manually scrolled, non-hash
    // reading position just as precisely as Back into it.
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForURL(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.goForward({ waitUntil: 'commit' });
    await checkReading(page, reading, 'Forward to non-hash reading position', test, deviations);

    // Repeated cross-document Back/Forward must not accumulate graphic drift.
    // Let each intermediate document attach before issuing another history
    // command; navigation commit alone can still leave CDP on the old target.
    for (let round = 1; round <= 2; round++) {
      await page.goto(origin + '/library/');
      await page.goBack({ waitUntil: 'commit' });
      await checkReading(page, reading, `Repeated Back ${round}`, test, deviations);
      await page.goForward({ waitUntil: 'commit' });
      await page.waitForURL(origin + '/library/', { waitUntil: 'domcontentloaded' });
      await page.goBack({ waitUntil: 'commit' });
      await checkReading(page, reading, `Repeated Forward/Back ${round}`, test, deviations);
    }

    // Native navigation can create several entries with the same URL. Each
    // entry owns its own reading position and unrelated application state.
    await page.goto(origin + '/library/');
    await page.goto(origin + article);
    await page.waitForFunction(() => document.querySelector('.chapter-rail a[aria-current="location"]'));
    await page.evaluate(() => history.replaceState({ ...history.state, applicationHistoryProbe: 'second article entry' }, '', location.href));
    await readAfterMap(page);
    await page.evaluate(() => scrollBy(0, 600));
    await settle(page);
    const secondReading = await snapshot(page);
    assert.equal(secondReading.url, reading.url, 'Both independent history entries use the same article URL');
    assert.ok(Math.abs(secondReading.y - reading.y) > 400, 'Same-URL entries have distinct reading positions');
    await page.goto(origin + '/library/');
    await page.goBack({ waitUntil: 'commit' });
    await checkReading(page, secondReading, 'Back to second same-URL article entry', test, deviations);
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForURL(origin + '/library/', { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'commit' });
    await checkReading(page, reading, 'Back to first same-URL article entry', test, deviations);
    await page.goForward({ waitUntil: 'commit' });
    await page.waitForURL(origin + '/library/', { waitUntil: 'domcontentloaded' });
    await page.goForward({ waitUntil: 'commit' });
    await checkReading(page, secondReading, 'Forward to second same-URL article entry', test, deviations);

    // A hash identifies a chapter, but subsequent manual reading does not
    // rewrite it. Traversal must return to that reading line, not force the
    // hash heading back to the top or silently replace the URL/history.
    if (mobile && !test.mobileOpen) await page.locator('.chapter-mobile summary').click();
    const rail = page.locator(mobile ? '.chapter-mobile .chapter-rail' : test.minimized ? '#ArticleChapterMarkers' : '.chapter-disclosure .chapter-rail');
    const chapterURL = await activateChapter(page, rail.locator('a').nth(9));
    await page.evaluate(() => scrollBy(0, 1600));
    await settle(page);
    assert.equal(page.url(), chapterURL, 'Manual article scrolling keeps the chapter URL');
    const chapterReading = await snapshot(page);
    assert.ok(chapterReading.anchor, 'Capture visible static text after a chapter jump');
    await page.goto(origin + '/');
    await page.goBack({ waitUntil: 'commit' });
    await checkReading(page, chapterReading, 'Back to manually read chapter', test, deviations);
    await page.goForward({ waitUntil: 'commit' });
    await page.waitForURL(origin + '/', { waitUntil: 'domcontentloaded' });
    await page.goBack({ waitUntil: 'commit' });
    await checkReading(page, chapterReading, 'Repeated Back to manually read chapter', test, deviations);

    const secondURL = await activateChapter(page, rail.locator('a').nth(11));
    const secondChapter = await snapshot(page);
    await page.goBack({ waitUntil: 'commit' });
    await checkReading(page, chapterReading, 'Same-document chapter Back', test, deviations);
    await page.goForward({ waitUntil: 'commit' });
    await checkReading(page, secondChapter, 'Same-document chapter Forward', test, deviations);
    assert.equal(page.url(), secondURL);
    if (test.name === '1920-minimized') {
      await checkReaderInput(context, page);
      await checkRapidTraversal(context, page, test, deviations);
      await checkGraphicReading(page);
    }
    assert.deepEqual(errors, [], 'No runtime errors during history traversal');
    assert.deepEqual(externalWrites, [], 'No external authentication or data writes');
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `${test.name}-restored.png`) });
    console.log(`PASS article history ${test.name}: non-hash Forward, repeated Back/Forward, independent same-URL entries, application history state, manual chapter reading, same-document anchors; ${deviations.length} restorations, max drift ${Math.max(...deviations).toFixed(3)}px`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
