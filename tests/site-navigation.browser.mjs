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
const articlePath = '/post/commercial-space-advanced-engineering/';
const disclosureSelector = '#site-navigation-disclosure';
const summarySelector = `${disclosureSelector} > summary`;
const screenshots = process.env.SITE_NAVIGATION_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });

// As in chapter-rail.browser.mjs, wait for actual layout stability rather than
// sleeping through a lazy graphic import or adjusting the browser's scroll.
async function settleArticleLayout(page) {
  await page.evaluate(() => { window.__siteNavigationStableLayout = null; });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const loading = !!document.querySelector('.article-visual[data-visual-state="loading"]');
    const key = [scrollY, document.documentElement.scrollHeight,
      document.querySelector('.article-content')?.getBoundingClientRect().top,
      document.querySelector('.main-article')?.getBoundingClientRect().width,
      document.querySelector('.chapter-mobile')?.getBoundingClientRect().height].join(':');
    const previous = window.__siteNavigationStableLayout;
    const frames = !loading && previous?.key === key ? previous.frames + 1 : 0;
    window.__siteNavigationStableLayout = { key, frames };
    return !loading && frames >= 5;
  });
}

async function desktopLayout(page, compact, chaptersCompact) {
  const layout = await page.evaluate(() => {
    const container = document.querySelector('.container.extended');
    const style = getComputedStyle(container);
    return {
      container: container.getBoundingClientRect().toJSON(),
      left: document.querySelector('.left-sidebar').getBoundingClientRect().toJSON(),
      article: document.querySelector('.main-article').getBoundingClientRect().toJSON(),
      right: document.querySelector('.right-sidebar').getBoundingClientRect().toJSON(),
      paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, gap: style.columnGap,
      window: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
  const left = compact ? 64 : clamp(160, layout.window * .13, 200);
  const right = chaptersCompact ? 44 : clamp(200, layout.window * .18, 280);
  assert.equal(layout.paddingLeft, '20px');
  assert.equal(layout.paddingRight, '8px');
  assert.equal(layout.gap, '24px');
  assert.ok(Math.abs(layout.left.width - left) < 1, `Left navigation width ${layout.left.width} matches ${left}`);
  assert.ok(Math.abs(layout.right.width - right) < 1, `Chapter rail width ${layout.right.width} matches ${right}`);
  const expected = Math.min(1200, layout.container.width - 76 - left - right);
  assert.ok(Math.abs(layout.article.width - expected) < 2, `Article reclaims sidebar space: ${layout.article.width} vs ${expected}`);
  assert.ok(layout.article.left - layout.left.right >= 23, 'Left navigation never overlaps article');
  assert.ok(layout.right.left - layout.article.right >= 23, 'Chapter rail never overlaps article');
  assert.equal(layout.overflow, false, 'No horizontal document overflow');
  return layout;
}

async function assertCompactControls(page, names) {
  const summary = page.locator(summarySelector);
  await expect(summary).toHaveAccessibleName('Expand navigation');
  const target = await summary.boundingBox();
  assert.ok(target.width >= 44 && target.height >= 44, 'Summary keeps a 44px pointer/touch target');
  assert.equal(await page.locator(disclosureSelector).evaluate(node => node.children.length === 1 && node.firstElementChild.tagName === 'SUMMARY'), true, 'Closing details never hides the real navigation');
  const avatar = page.locator('.left-sidebar .site-avatar');
  const avatarBox = await avatar.boundingBox();
  assert.ok(Math.abs(avatarBox.width - 44) < 1 && Math.abs(avatarBox.height - 44) < 1, 'Compact navigation retains a 44px avatar');
  await expect(avatar.locator('a')).toHaveAccessibleName(/DEX Research/);
  const links = page.locator('#main-menu > li > a');
  assert.deepEqual(await links.evaluateAll(nodes => nodes.map(node => node.textContent.trim())), names, 'Every original navigation label remains in the DOM');
  for (const [index, link] of (await links.all()).entries()) {
    await expect(link).toHaveAccessibleName(names[index]);
    assert.equal(await link.getAttribute('title'), names[index]);
    assert.equal(await link.locator('svg').isVisible(), true, `${names[index]} retains its icon`);
    const size = await link.boundingBox();
    assert.ok(size.width >= 44 && size.height >= 44, `${names[index]} keeps a 44px target`);
    const labelStyle = await link.locator('span').evaluate(node => ({ clip: getComputedStyle(node).clipPath, display: getComputedStyle(node).display }));
    assert.equal(labelStyle.clip, 'inset(50%)', 'Labels are visually hidden without losing accessible names');
    assert.notEqual(labelStyle.display, 'none');
    await link.focus();
    assert.equal(await link.evaluate(node => node === document.activeElement), true, `${names[index]} remains keyboard-reachable`);
  }
  const social = page.locator('.left-sidebar .menu-social a');
  assert.ok(await social.count() >= 3);
  for (const link of await social.all()) {
    const name = await link.getAttribute('title');
    assert.ok(name);
    await expect(link).toHaveAccessibleName(name);
    assert.equal(await link.locator('svg').isVisible(), true);
    const box = await link.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'Social icons retain 44px targets');
  }
  const theme = page.locator('#dark-mode-toggle');
  const themeName = (await theme.textContent()).trim();
  await expect(theme).toHaveAccessibleName(themeName);
  assert.equal(await theme.getAttribute('title'), themeName);
  const themeBox = await theme.boundingBox();
  assert.ok(themeBox.width >= 44 && themeBox.height >= 44, 'Theme toggle stays usable when compact');
  const containment = await page.locator('.left-sidebar').evaluate(sidebar => {
    const bounds = sidebar.getBoundingClientRect();
    return [...sidebar.querySelectorAll('.site-avatar, .menu-social a, #main-menu > li > a, #dark-mode-toggle')].every(node => {
      const rect = node.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    });
  });
  assert.equal(containment, true, 'Compact controls remain inside the left rail');
}

const readingTextSelector = 'p,h1,h2,h3,h4,h5,h6,li,td';
async function readingSnapshot(page, readingIndex = null) {
  return page.evaluate(({ readingTextSelector, readingIndex }) => {
    // Ignore figure internals: hydration can replace those nodes, but not the
    // actual article paragraph or heading a person is currently reading.
    const texts = [...document.querySelector('.article-content').querySelectorAll(readingTextSelector)].filter(node => !node.closest('figure'));
    const visible = node => { const rect = node.getBoundingClientRect(); return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight; };
    const index = readingIndex ?? texts.findIndex(visible);
    const node = texts[index];
    return { y: scrollY, height: document.documentElement.scrollHeight,
      readingAnchor: node ? { index, tag: node.tagName, text: node.textContent.trim(), top: node.getBoundingClientRect().top } : null,
      leftOpen: document.querySelector('#site-navigation-disclosure').open,
      rightOpen: document.querySelector('.chapter-disclosure').open,
      width: document.querySelector('.main-article').getBoundingClientRect().width,
      visuals: [...document.querySelectorAll('figure.article-visual')].map(figure => ({ id: figure.id, state: figure.dataset.visualState, height: figure.getBoundingClientRect().height, top: figure.getBoundingClientRect().top, outlineOpen: figure.querySelector('details')?.open })),
      lifecycle: window.__siteNavigationLifecycle,
    };
  }, { readingTextSelector, readingIndex });
}

async function checkNativeBack(page, width) {
  const marker = page.locator('#ArticleChapterMarkers a').nth(9);
  await marker.focus();
  await page.keyboard.press('Enter');
  const markerHref = await marker.getAttribute('href');
  await page.waitForURL(new URL(markerHref, origin).href, { waitUntil: 'commit' });
  const id = decodeURIComponent(new URL(page.url()).hash.slice(1));
  await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top - 24) < 3, id);
  await page.evaluate(() => scrollBy(0, 1600));
  await settleArticleLayout(page);
  const url = page.url();
  const before = await readingSnapshot(page);
  assert.ok(before.readingAnchor, 'Record the exact visible article text before leaving');
  assert.equal(await page.evaluate(() => history.scrollRestoration), 'auto');
  await page.goto(origin + '/');
  await expect(page.locator(disclosureSelector)).toHaveJSProperty('open', false);
  // The next page may change the global preference. Back must recover the
  // article's prior geometry, rather than reflowing the reader's old position.
  await page.locator(summarySelector).click();
  await expect(page.locator(disclosureSelector)).toHaveJSProperty('open', true);
  await page.waitForFunction(() => sessionStorage.getItem('dex-site-navigation') === 'expanded');
  await page.goBack({ waitUntil: 'commit' });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(page.url(), url);
  await expect(page.locator(disclosureSelector)).toHaveJSProperty('open', false);
  await expect(page.locator('.chapter-disclosure')).toHaveJSProperty('open', false);
  await settleArticleLayout(page);
  try {
    await page.waitForFunction(({ anchor, readingTextSelector }) => {
      const texts = [...document.querySelector('.article-content').querySelectorAll(readingTextSelector)].filter(node => !node.closest('figure'));
      const node = texts[anchor.index];
      return node?.tagName === anchor.tag && node.textContent.trim() === anchor.text && Math.abs(node.getBoundingClientRect().top - anchor.top) < 4;
    }, { anchor: before.readingAnchor, readingTextSelector });
    const after = await readingSnapshot(page, before.readingAnchor.index);
    if (before.height === after.height) assert.ok(Math.abs(before.y - after.y) < 4, 'Identical geometry also restores exact native scrollY');
  } catch (error) {
    console.log('SITE_NAVIGATION_BACK_DIAGNOSTICS', JSON.stringify({ width, before, after: await readingSnapshot(page, before.readingAnchor.index) }));
    throw error;
  }
  // Never hydrate or scroll the map before the strict native Back assertion.
  // Returning to the offscreen graphic must still permit its lazy enhancement.
  await page.locator('#industry-map-commercial-space-value-chain').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.getElementById('industry-map-commercial-space-value-chain').dataset.visualState === 'ready');
}

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const [width, scheme, motion, js] of [[1024, 'dark', 'reduce', true], [1280, 'light', 'no-preference', true], [1440, 'dark', 'no-preference', true], [1920, 'light', 'reduce', true], [1440, 'light', 'reduce', false]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: motion, javaScriptEnabled: js });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    if (js) await context.addInitScript(scheme => {
      localStorage.setItem('StackColorScheme', scheme);
      window.__siteNavigationLifecycle = [];
      for (const name of ['DOMContentLoaded', 'load', 'pageshow', 'pagehide']) addEventListener(name, event => {
        window.__siteNavigationLifecycle.push({ name, persisted: event.persisted, y: scrollY, height: document.documentElement.scrollHeight,
          leftOpen: document.querySelector('#site-navigation-disclosure')?.open,
          rightOpen: document.querySelector('.chapter-disclosure')?.open,
          articleWidth: document.querySelector('.main-article')?.getBoundingClientRect().width });
      });
    }, scheme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + articlePath);
    await page.evaluate(() => document.fonts.ready);
    const disclosure = page.locator(disclosureSelector);
    const summary = page.locator(summarySelector);
    const chapters = page.locator('.chapter-disclosure');
    const chapterSummary = page.locator('.chapter-widget summary');
    const names = await page.locator('#main-menu > li > a').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
    assert.deepEqual(names, ['Home', 'Industry Explorer', 'Evidence Library', 'Archives', 'Search', 'Contact', 'About & Methodology'], 'Exercise every surviving menu item without the retired directory');
    assert.deepEqual(await page.locator('#main-menu > li > a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['/', '/industries/', '/evidence-library/', '/archives/', '/search/', '/contact/', '/about/'], 'All seven menu destinations remain intact');
    await expect(disclosure).toHaveJSProperty('open', true);
    await expect(summary).toHaveAccessibleName('Minimize navigation');
    const expanded = await desktopLayout(page, false, false);
    const initialURL = page.url();
    const historyLength = await page.evaluate(() => history.length);
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveJSProperty('open', false);
    const compact = await desktopLayout(page, true, false);
    if (expanded.article.width < 1200) assert.ok(compact.article.width > expanded.article.width, 'Left collapse visibly returns width to the article');
    assert.equal(page.url(), initialURL, 'Sidebar toggle does not navigate');
    assert.equal(await page.evaluate(() => history.length), historyLength, 'Sidebar toggle adds no history entry');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.site-avatar')), true, 'Tab after summary reaches the retained avatar home link');
    await assertCompactControls(page, names);
    if (js) {
      const theme = page.locator('#dark-mode-toggle');
      const pressed = await theme.getAttribute('aria-pressed');
      await theme.focus();
      await page.keyboard.press('Space');
      assert.notEqual(await theme.getAttribute('aria-pressed'), pressed, 'Compact theme control still changes the scheme');
      await page.keyboard.press('Enter');
      assert.equal(await theme.getAttribute('aria-pressed'), pressed);
    }
    await chapterSummary.click();
    await desktopLayout(page, true, true);
    await expect(disclosure).toHaveJSProperty('open', false);
    await summary.focus();
    await page.keyboard.press('Space');
    await desktopLayout(page, false, true);
    await expect(chapters).toHaveJSProperty('open', false);
    await expect(summary).toHaveAccessibleName('Minimize navigation');
    await summary.click();
    await chapterSummary.click();
    await desktopLayout(page, true, false);
    await expect(disclosure).toHaveJSProperty('open', false);
    await chapterSummary.click();
    await desktopLayout(page, true, true);
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `navigation-${width}-${scheme}-${js ? 'js' : 'no-js'}.png`) });
    if (js) {
      await checkNativeBack(page, width);
      await page.reload();
      await expect(disclosure).toHaveJSProperty('open', false);
      await desktopLayout(page, true, true);
      await page.goto(origin + '/post/ai-computing-infrastructure/');
      await expect(disclosure).toHaveJSProperty('open', false);
      await expect(chapters).toHaveJSProperty('open', true);
      await desktopLayout(page, true, false);
      // A real keyboard-activated icon link must work after collapse, and the
      // site-wide choice must follow it even onto a non-article page.
      const archives = page.locator('#main-menu > li > a[href="/archives/"]');
      await archives.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(origin + '/archives/');
      await expect(disclosure).toHaveJSProperty('open', false);
      assert.ok(Math.abs((await page.locator('.left-sidebar').boundingBox()).width - 64) < 1, 'Compact preference is global, including non-article pages');
      await summary.click();
      await expect(disclosure).toHaveJSProperty('open', true);
      await page.reload();
      await expect(disclosure).toHaveJSProperty('open', true);
    }
    assert.deepEqual(errors, [], 'No runtime errors');
    console.log(`PASS site navigation ${width}px ${scheme} ${motion} ${js ? 'JS' : 'no JS'}: keyboard, accessible icons, geometry, independent rails${js ? ', global persistence and strict native Back' : ''}`);
    await context.close();
  }
  // The desktop preference cannot affect either phone or tablet layout. Seed
  // it by actually using the native control, then cross the 1024px boundary.
  for (const [width, js] of [[320, true], [390, true], [768, true], [1023, true], [390, false]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', javaScriptEnabled: js });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    const page = await context.newPage();
    await page.goto(origin + articlePath);
    const summary = page.locator(summarySelector);
    const disclosure = page.locator(disclosureSelector);
    await expect(summary).toBeHidden();
    const mobileBefore = await page.locator('.left-sidebar').boundingBox();
    const articleBefore = await page.locator('.main-article').boundingBox();
    await page.setViewportSize({ width: 1280, height: 900 });
    await summary.click();
    await expect(disclosure).toHaveJSProperty('open', false);
    await page.setViewportSize({ width, height: 900 });
    await expect(summary).toBeHidden();
    if (js) await expect(page.locator(width < 768 ? '#toggle-menu' : '.left-sidebar .site-avatar a')).toBeFocused();
    const mobileAfter = await page.locator('.left-sidebar').boundingBox();
    const articleAfter = await page.locator('.main-article').boundingBox();
    assert.ok(Math.abs(mobileAfter.width - mobileBefore.width) < 1, 'Desktop state does not narrow phone/tablet navigation');
    assert.ok(Math.abs(articleAfter.width - articleBefore.width) < 1, 'Desktop state leaves mobile article width unchanged');
    assert.equal(await page.locator('.site-meta').evaluate(node => getComputedStyle(node).clipPath), 'none', 'Mobile keeps the site name and description');
    if (width < 768 && js) {
      const hamburger = page.locator('#toggle-menu');
      await hamburger.click();
      await expect(hamburger).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#main-menu > li > a').first()).toBeVisible();
      assert.equal(await page.locator('#main-menu > li > a span').first().evaluate(node => getComputedStyle(node).clipPath), 'none');
      await page.locator('#main-menu > li > a').first().focus();
      await page.keyboard.press('Escape');
      await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    }
    const mobileChapters = page.locator('.chapter-mobile details');
    await expect(mobileChapters).toHaveJSProperty('open', false);
    await page.locator('.chapter-mobile summary').click();
    await expect(mobileChapters).toHaveJSProperty('open', true);
    if (js) await page.locator('.left-sidebar .site-name a').focus();
    await page.setViewportSize({ width: 1280, height: 900 });
    if (js) await expect(page.locator('.left-sidebar .site-avatar a')).toBeFocused();
    await expect(disclosure).toHaveJSProperty('open', false);
    await desktopLayout(page, true, false);
    if (js) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(summary).toBeHidden();
      await expect(mobileChapters).toHaveJSProperty('open', true);
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(disclosure).toHaveJSProperty('open', false);
      await desktopLayout(page, true, false);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log(`PASS site navigation responsive independence ${width}px ${js ? 'JS' : 'no JS'}`);
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', hasTouch: true, forcedColors: 'active' });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage disabled for test'); } }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + articlePath);
    const summary = page.locator(summarySelector);
    await summary.tap();
    await expect(page.locator(disclosureSelector)).toHaveJSProperty('open', false);
    await desktopLayout(page, true, false);
    await expect(summary).toHaveAccessibleName('Expand navigation');
    await summary.tap();
    await expect(page.locator(disclosureSelector)).toHaveJSProperty('open', true);
    await desktopLayout(page, false, false);
    await summary.tap();
    await page.reload();
    await expect(page.locator(disclosureSelector)).toHaveJSProperty('open', true);
    await summary.tap();
    await desktopLayout(page, true, false);
    assert.deepEqual(errors, [], 'Blocked storage never disables native touch controls');
    console.log('PASS site navigation storage-disabled touch and forced colors');
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
