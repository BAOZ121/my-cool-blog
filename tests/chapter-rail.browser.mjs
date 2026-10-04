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
const path = '/post/commercial-space-advanced-engineering/';
const screenshots = process.env.CHAPTER_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });

// A chapter jump can start a lazy graphic import. Its readable outline is
// replaced only after rendering, so a fixed sleep can sample transient height.
// Wait for pending graphics and five stable animation frames without moving
// the document, changing history, or weakening the position assertions.
async function settleArticleLayout(page) {
  await page.evaluate(() => { window.__chapterStableLayout = null; });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const loading = !!document.querySelector('.article-visual[data-visual-state="loading"]');
    const key = [scrollY, document.documentElement.scrollHeight,
      document.querySelector('.article-content')?.getBoundingClientRect().top,
      document.querySelector('.chapter-mobile')?.getBoundingClientRect().height].join(':');
    const previous = window.__chapterStableLayout;
    const frames = !loading && previous?.key === key ? previous.frames + 1 : 0;
    window.__chapterStableLayout = { key, frames };
    return !loading && frames >= 5;
  });
}
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const [width, scheme, motion, js] of [[1440, 'dark', 'no-preference', true], [1920, 'light', 'reduce', true], [1280, 'light', 'no-preference', true], [1024, 'dark', 'reduce', true], [390, 'dark', 'no-preference', true], [320, 'light', 'reduce', true], [1440, 'light', 'reduce', false], [390, 'light', 'reduce', false]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: motion, javaScriptEnabled: js });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    if (js) await context.addInitScript(scheme => {
      localStorage.setItem('StackColorScheme', scheme);
      window.__chapterLifecycle = [];
      window.__chapterGraphicTrace = [];
      // Failure-only evidence for native Back restoration versus lazy graphic
      // hydration. Read geometry in one rAF per change, cap storage, and never
      // move the document, alter graphic readiness, or change the assertion.
      addEventListener('DOMContentLoaded', () => {
        const figure = document.getElementById('industry-map-commercial-space-value-chain');
        if (!figure) return;
        let frame = 0;
        let previous = '';
        const pending = new Set();
        let observer;
        const sample = reason => {
          frame = 0;
          if (window.__chapterGraphicTrace.length >= 40) { observer?.disconnect(); return; }
          const rect = figure.getBoundingClientRect();
          const stage = figure.querySelector('.visual-stage');
          const entry = { reason, ms: Math.round(performance.now()), y: scrollY,
            documentHeight: document.documentElement.scrollHeight,
            state: figure.dataset.visualState || 'uninitialized', height: rect.height,
            top: rect.top, bottom: rect.bottom, stageHidden: stage?.hidden,
            stagePosition: stage?.style.position || '', outlineOpen: figure.querySelector('.visual-fallback')?.open };
          const key = [entry.y, entry.documentHeight, entry.state, entry.height, entry.top, entry.stageHidden, entry.stagePosition, entry.outlineOpen].join(':');
          if (key !== previous) { window.__chapterGraphicTrace.push(entry); previous = key; }
        };
        const queue = reason => {
          if (window.__chapterGraphicTrace.length >= 40) return;
          pending.add(reason);
          if (!frame) frame = requestAnimationFrame(() => { const reason = [...pending].join(','); pending.clear(); sample(reason); });
        };
        observer = new MutationObserver(() => queue('graphic-mutation'));
        observer.observe(figure, { subtree: true, childList: true, attributes: true,
          attributeFilter: ['data-visual-state', 'data-enhanced', 'open', 'hidden', 'style'] });
        addEventListener('scroll', () => queue('document-scroll'), { passive: true });
        addEventListener('pageshow', () => queue('pageshow'));
        addEventListener('load', () => queue('load'));
        sample('DOMContentLoaded');
      }, { once: true });
      for (const name of ['DOMContentLoaded', 'load', 'pageshow', 'pagehide', 'hashchange']) addEventListener(name, event => {
        window.__chapterLifecycle.push({ name, persisted: event.persisted, y: scrollY, height: document.documentElement.scrollHeight, disclosure: document.querySelector('.chapter-mobile details')?.open, disclosureHeight: document.querySelector('.chapter-mobile')?.getBoundingClientRect().height, desktopOpen: document.querySelector('.chapter-disclosure')?.open, cardWidth: document.querySelector('.main-article')?.getBoundingClientRect().width });
      });
    }, scheme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + path);
    await page.evaluate(() => document.fonts.ready);
    const mobile = width < 1024;
    const rail = page.locator(mobile ? '.chapter-mobile .chapter-rail' : '.chapter-disclosure .chapter-rail');
    const summary = page.locator('.chapter-mobile summary');
    const desktopSummary = page.locator('.chapter-widget summary');
    const desktopDisclosure = page.locator('.chapter-disclosure');
    const compact = page.locator('#ArticleChapterMarkers');
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
        return document.querySelector('.container.extended').getBoundingClientRect().right - (list.getBoundingClientRect().right - parseFloat(style.right));
      });
      assert.ok(Math.abs(edge - 20) < 1, `Chapter line keeps its20px safe inset inside the native gutter: ${edge}`);
      assert.equal(await links.first().evaluate(node => getComputedStyle(node).textAlign), 'right');
    }
    async function checkDesktopWidth(minimized) {
      const layout = await page.evaluate(() => {
        const article = document.querySelector('.main-article').getBoundingClientRect();
        const sidebar = document.querySelector('.right-sidebar').getBoundingClientRect();
        const container = document.querySelector('.container.extended');
        const style = getComputedStyle(container);
        return { width: article.width, right: article.right, railLeft: sidebar.left, railWidth: sidebar.width, viewport: document.documentElement.clientWidth, window: innerWidth,
          available: container.getBoundingClientRect().width, containerRight: container.getBoundingClientRect().right, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, gap: style.columnGap,
          leftWidth: document.querySelector('.left-sidebar').getBoundingClientRect().width };

      });
      const clamp = (min, value, max) => Math.max(min, Math.min(max, value));
      // Stack reserves a stable native scrollbar gutter. Its container can be
      // narrower than clientWidth in headless Chrome; measure available space,
      // while independently verifying every fixed part of the width formula.
      assert.equal(layout.paddingLeft, '20px');
      assert.equal(layout.paddingRight, '8px');
      assert.equal(layout.gap, '24px');
      assert.ok(Math.abs(layout.leftWidth - clamp(160, layout.window * .13, 200)) < 1);
      assert.ok(Math.abs(layout.railWidth - (minimized ? 44 : clamp(200, layout.window * .18, 280))) < 1);
      const expected = Math.min(1200, layout.available - 76 - clamp(160, layout.window * .13, 200) - (minimized ? 44 : clamp(200, layout.window * .18, 280)));
      assert.ok(Math.abs(layout.width - expected) < 2, `Article width ${layout.width} matches ${minimized ? 'minimized' : 'expanded'} ${expected}`);
      assert.ok(layout.railLeft - layout.right >= 23, 'Both states reserve separate, non-overlapping reading space');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (minimized) {
        assert.equal(layout.railWidth, 44);
        assert.equal(await rail.isVisible(), false, 'Native closed details removes chapter links from interaction');
        assert.equal(await compact.isVisible(), true, 'Compact chapter markers remain usable');
        const axis = await compact.evaluate(node => {
          const list = node.firstElementChild;
          const style = getComputedStyle(list, '::before');
          return { width: style.width, right: list.getBoundingClientRect().right - parseFloat(style.right) };
        });
        assert.equal(axis.width, '1px', 'Minimized nodes remain on one fine axis');
        assert.ok(Math.abs(layout.containerRight - axis.right - 20) < 1, 'Compact axis keeps the same20px usable-edge inset');
      }
      if (!minimized) assert.equal(await compact.isVisible(), false, 'Expanded and compact outlines are mutually exclusive');
      if (js) await page.waitForFunction(() => {
        const hero = document.querySelector('.main-article .article-image img');
        return hero.getAttribute('sizes') === `${Math.ceil(hero.getBoundingClientRect().width)}px`;
      });
    }
    if (!mobile) {
      await checkDesktopWidth(false);
      await desktopSummary.focus();
      await page.keyboard.press('Enter');
      await checkDesktopWidth(true);
      await expect(desktopSummary).toHaveAccessibleName('Expand chapters');
      const control = await desktopSummary.boundingBox();
      assert.ok(control.width >= 44 && control.height >= 44, 'Minimized toggle is a discoverable touch/keyboard target');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.closest('nav')?.id), 'ArticleChapterMarkers', 'Tab reaches compact native links while expanded links remain hidden');
      const compactLinks = compact.locator('a');
      assert.deepEqual(await compactLinks.evaluateAll(nodes => nodes.map(node => ({ hash: new URL(node.href).hash, text: node.textContent }))), anchors, 'Compact rail keeps every original heading and full name');
      for (const link of await compactLinks.all()) {
        const fullName = (await link.textContent()).trim();
        await expect(link).toHaveAccessibleName(fullName);
        assert.equal(await link.getAttribute('title'), fullName);
      }
      const targetSize = await compactLinks.first().boundingBox();
      assert.ok(targetSize.width >= 44 && targetSize.height >= 44, 'Fine nodes retain44px native hit areas');
      assert.equal(await compact.locator('.chapter-rail__label').first().evaluate(node => getComputedStyle(node).clipPath), 'inset(50%)', 'Full names are visually hidden, not removed');
      assert.equal(await compactLinks.first().evaluate(node => getComputedStyle(node, '::before').width), '25px');
      const haloClearance = await compactLinks.first().evaluate(node => node.closest('nav').getBoundingClientRect().right - (node.getBoundingClientRect().right - parseFloat(getComputedStyle(node, '::before').right)));
      assert.ok(haloClearance >= 4, 'Active main-node halo fits inside the compact scroller');
      assert.equal(await compact.locator('li li a').first().evaluate(node => getComputedStyle(node, '::before').width), '7px');
      // A compact subsection is a native keyboard destination, including no JS.
      const marker = compactLinks.nth(1);
      const markerHref = await marker.getAttribute('href');
      await marker.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(new URL(markerHref, origin).href, { waitUntil: 'commit' });
      const markerID = decodeURIComponent(new URL(page.url()).hash.slice(1));
      await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top - 24) < 3, markerID);
      if (js) {
        await page.waitForFunction(id => { const link = document.querySelector('#ArticleChapterMarkers a[aria-current="location"]'); return link && decodeURIComponent(new URL(link.href).hash.slice(1)) === id; }, markerID);
        assert.equal(await page.evaluate(() => document.activeElement.id), markerID);
        const parentFill = await compact.locator('[data-current-chapter] > a').evaluate(node => ({ color: getComputedStyle(node, '::before').backgroundColor, accent: getComputedStyle(node).color, shadow: getComputedStyle(node, '::before').boxShadow }));
        assert.equal(parentFill.color, parentFill.accent, 'Current main circle remains filled gold during subsection reading');
        assert.notEqual(parentFill.shadow, 'none', 'Parent chapter retains its filled halo while a subsection is current');
      }
      await desktopSummary.focus();
      await page.keyboard.press('Space');
      await checkDesktopWidth(false);
      await expect(desktopSummary).toHaveAccessibleName('Minimize chapters');
      if (motion === 'reduce') assert.equal(await rail.evaluate(node => getComputedStyle(node).animationName), 'none');
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
      await settleArticleLayout(page);
      assert.equal(page.url(), url);
      assert.equal(await rail.locator('a[aria-current="location"]').count(), 1);
      if (motion === 'reduce') assert.equal(await target.evaluate(node => getComputedStyle(node).transitionDuration), '0s');
      if (!mobile) {
        const beforeToggleURL = page.url();
        const historyLength = await page.evaluate(() => history.length);
        await desktopSummary.click();
        await settleArticleLayout(page);
        await checkDesktopWidth(true);
        assert.equal(page.url(), beforeToggleURL, 'Changing reading width leaves URL untouched');
        assert.equal(await page.evaluate(() => history.length), historyLength, 'Changing width creates no navigation');
        await page.waitForFunction(() => {
          const links = [...document.querySelectorAll('#ArticleChapterMarkers a')];
          let expected = links[0];
          for (const link of links) {
            const heading = document.getElementById(decodeURIComponent(new URL(link.href).hash.slice(1)));
            if (heading.getBoundingClientRect().top > 72) break;
            expected = link;
          }
          return expected?.getAttribute('aria-current') === 'location';
        });
      }
      const readingTextSelector = 'p,h1,h2,h3,h4,h5,h6,li,td';
      const snapshot = (readingIndex = null) => page.evaluate(({ id, readingIndex, readingTextSelector }) => {
        // Graphic internals change during progressive enhancement. Index only
        // static article text, then retain the exact block the reader can see.
        const texts = [...document.querySelector('.article-content').querySelectorAll(readingTextSelector)].filter(element => !element.closest('figure'));
        const visible = element => { const rect = element.getBoundingClientRect(); return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight; };
        const index = readingIndex ?? texts.findIndex(visible);
        const element = texts[index];
        return {
          y: scrollY, height: document.documentElement.scrollHeight,
          targetTop: document.getElementById(id)?.getBoundingClientRect().top,
          readingAnchor: element ? { index, tag: element.tagName, text: element.textContent.trim(), top: element.getBoundingClientRect().top } : null,
          desktop: { open: document.querySelector('.chapter-disclosure')?.open, width: document.querySelector('.main-article')?.getBoundingClientRect().width },
          details: { open: document.querySelector('.chapter-mobile details')?.open, height: document.querySelector('.chapter-mobile')?.getBoundingClientRect().height },
          article: document.querySelector('.article-content')?.getBoundingClientRect().toJSON(),
          visuals: [...document.querySelectorAll('figure.article-visual')].map(figure => ({ id: figure.id, state: figure.dataset.visualState, height: figure.getBoundingClientRect().height, top: figure.getBoundingClientRect().top, outlineOpen: figure.querySelector('details')?.open })),
          lifecycle: window.__chapterLifecycle,
          graphicTrace: window.__chapterGraphicTrace,
        };
      }, { id, readingIndex, readingTextSelector });
      const beforeBack = await snapshot();
      assert.ok(beforeBack.readingAnchor, 'Record a visible, stable article text block before leaving');
      const scroll = beforeBack.y;
      await page.goto(origin + '/');
      await page.goBack({ waitUntil: 'commit' });
      await page.evaluate(() => document.fonts.ready);
      if (mobile) await page.waitForFunction(() => document.querySelector('.chapter-mobile details').open);
      else assert.equal(await desktopDisclosure.evaluate(node => node.open), false, 'Back restores minimized width before article layout');
      await settleArticleLayout(page);
      try {
        // Native restoration can compensate for a taller, unenhanced graphic
        // above the viewport. The same text must return to the same screen
        // position; raw scrollY is comparable only when geometry is identical.
        await page.waitForFunction(({ anchor, readingTextSelector }) => {
          const texts = [...document.querySelector('.article-content').querySelectorAll(readingTextSelector)].filter(element => !element.closest('figure'));
          const element = texts[anchor.index];
          return element?.tagName === anchor.tag && element.textContent.trim() === anchor.text && Math.abs(element.getBoundingClientRect().top - anchor.top) < 4;
        }, { anchor: beforeBack.readingAnchor, readingTextSelector });
        const afterBack = await snapshot(beforeBack.readingAnchor.index);
        if (afterBack.height === beforeBack.height) assert.ok(Math.abs(afterBack.y - scroll) < 4, 'Identical document geometry must also restore exact scrollY');
        if (width === 1920) console.log('CHAPTER_BACK_1920', JSON.stringify({ y: afterBack.y, documentHeight: afterBack.height,
          readingTop: afterBack.readingAnchor.top,
          valueChain: afterBack.visuals.find(figure => figure.id === 'industry-map-commercial-space-value-chain') }));
      }
      catch (error) {
        console.log('CHAPTER_BACK_DIAGNOSTICS', JSON.stringify({ width, before: beforeBack, after: await snapshot(beforeBack.readingAnchor.index) }));
        throw error;
      }
      await page.waitForFunction(() => document.querySelector('.chapter-rail a[aria-current="location"]'));
      if (!mobile) {
        // Only after verifying native reading restoration: a deferred offscreen
        // graphic must still enhance when the reader explicitly returns to it.
        await page.locator('#industry-map-commercial-space-value-chain').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.getElementById('industry-map-commercial-space-value-chain').dataset.visualState === 'ready');
        await page.reload();
        assert.equal(await desktopDisclosure.evaluate(node => node.open), false, 'Reload preserves per-article minimized state');
        await checkDesktopWidth(true);
        await page.goto(origin + '/post/ai-computing-infrastructure/');
        assert.equal(await desktopDisclosure.evaluate(node => node.open), true, 'Another article starts expanded');
        await page.goto(origin + path);
        assert.equal(await desktopDisclosure.evaluate(node => node.open), false);
        // The desktop and mobile disclosures are independent on responsive resize.
        await page.setViewportSize({ width: 390, height: 900 });
        assert.equal(await page.locator('.chapter-mobile details').evaluate(node => node.open), false);
        await page.waitForFunction(() => document.querySelector('.main-article .article-image img').getAttribute('sizes').includes('(max-width: 767px)'), null);
        await summary.click();
        assert.equal(await page.locator('.chapter-mobile details').evaluate(node => node.open), true);
        await page.setViewportSize({ width, height: 900 });
        await checkDesktopWidth(true);
        assert.equal(await desktopDisclosure.evaluate(node => node.open), false);
      }
    }
    // Direct deep links work independently of enhancement and preserve the heading ID.
    await page.goto(origin + path + hash);
    await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top - 24) < 3, id);
    assert.deepEqual(errors, [], 'No runtime errors');
    console.log(`PASS chapters ${width}px ${scheme} ${motion} ${js ? 'JS' : 'no JS'}: anchors, keyboard, long titles, overflow, direct links${js ? ', scroll spy and history restoration' : ''}`);
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', hasTouch: true, forcedColors: 'active' });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage disabled for test'); } }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + path);
    const summary = page.locator('.chapter-widget summary');
    await summary.tap();
    assert.equal(await page.locator('.chapter-disclosure').evaluate(node => node.open), false);
    assert.equal(await page.locator('#ArticleChapterMarkers').evaluate(node => getComputedStyle(node.firstElementChild, '::before').backgroundColor), 'rgb(0, 0, 0)', 'Forced-colors retains a visible CanvasText axis');
    const marker = page.locator('#ArticleChapterMarkers a').nth(1);
    const markerHref = await marker.getAttribute('href');
    await marker.tap();
    await page.waitForURL(new URL(markerHref, origin).href, { waitUntil: 'commit' });
    await summary.tap();
    assert.equal(await page.locator('.chapter-disclosure').evaluate(node => node.open), true);
    assert.deepEqual(errors, [], 'Unavailable persistence never breaks the native outline');
    console.log('PASS chapters storage-disabled touch: native minimize and expand remain usable');
    await context.close();
  }

} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
