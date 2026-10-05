import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setupSiteNavigation } from '../assets/js/site-navigation.mjs';

const source = readFileSync(new URL('../assets/js/site-navigation.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/css/site-navigation.css', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../layouts/_partials/sidebar/left.html', import.meta.url), 'utf8');
const restoreScript = sidebar.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function fixture({ open = true, width = 1280, blocked = false } = {}) {
  const events = new Map();
  const pageEvents = new Map();
  const documentEvents = new Map();
  const mediaEvents = new Map();
  const stored = new Map();
  const listen = (map, name, handler) => { const handlers = map.get(name) || []; handlers.push(handler); map.set(name, handlers); };
  const summary = { visible: true, getClientRects() { return this.visible ? [{}] : []; } };
  const siteName = { visible: true, getClientRects() { return this.visible ? [{}] : []; } };
  const disclosure = { open, dataset: {}, contains: node => node === summary, addEventListener: (name, handler) => listen(events, name, handler) };
  const meta = { contains: node => node === siteName };
  const focused = [];
  const avatar = { focus(options) { document.activeElement = this; focused.push({ target: 'avatar', options }); } };
  const hamburger = { focus(options) { document.activeElement = this; focused.push({ target: 'hamburger', options }); } };
  const nodes = { '.site-navigation-disclosure': disclosure, '.left-sidebar .site-meta': meta, '.left-sidebar .site-avatar a': avatar, '#toggle-menu': hamburger };
  const document = { body: {}, documentElement: {}, activeElement: null,
    querySelector: selector => nodes[selector] || null,
    addEventListener: (name, handler) => listen(documentEvents, name, handler),
  };
  const window = {
    innerWidth: width,
    location: new URL('https://thedexs.com/post/example/'),
    addEventListener: (name, handler) => listen(pageEvents, name, handler),
    matchMedia: () => ({ addEventListener: (name, handler) => listen(mediaEvents, name, handler) }),
    sessionStorage: {
      getItem() { throw new Error('Enhancement must not restore layout after parsing'); },
      setItem(key, value) { if (blocked) throw new Error('Storage blocked'); stored.set(key, value); },
    },
  };
  return { disclosure, document, window, stored, events, pageEvents, summary, siteName, avatar, hamburger, focused,
    focus(target) { document.activeElement = target; for (const handler of documentEvents.get('focusin') || []) handler({ target }); },
    blur(target, relatedTarget = null) { document.activeElement = relatedTarget || document.body; for (const handler of documentEvents.get('focusout') || []) handler({ target, relatedTarget }); },
    resize(width) { window.innerWidth = width; for (const handler of mediaEvents.get('change') || []) handler({ matches: width >= 1024 }); },
    fire(name) { for (const handler of events.get(name) || []) handler(); },
    firePage(name) { for (const handler of pageEvents.get(name) || []) handler(); },
  };
}

test('the native disclosure only contains its summary, leaving real navigation usable when closed', () => {
  const native = sidebar.match(/<details\b[^>]*\bclass="site-navigation-disclosure"[^>]*\bopen>([\s\S]*?)<\/details>/);
  assert.ok(native, 'Expanded by default, including without JavaScript');
  assert.match(native[0], /id="site-navigation-disclosure"/);
  assert.match(native[1], /^\s*<summary\b[^>]*>[\s\S]*<\/summary>\s*$/);
  assert.doesNotMatch(native[1], /<nav\b|<header\b|<ol\b|<button\b/);
  assert.match(native[1], /Minimize navigation/);
  assert.match(native[1], /Expand navigation/);
  assert.match(native[1], /aria-controls="site-navigation-header main-menu"/);
  assert.ok(sidebar.indexOf('</details>') < sidebar.indexOf('<header'), 'Avatar, branding and all links are outside the closed disclosure');
  assert.match(sidebar, /id="site-navigation-header"/);
  assert.match(sidebar, /id="main-menu"/);
  assert.match(sidebar, /id="dark-mode-toggle"/);
});

test('parser-time restore uses one global preference before sidebar and article layout', () => {
  assert.ok(restoreScript);
  assert.ok(sidebar.indexOf('<script>') > sidebar.indexOf('</details>'));
  assert.ok(sidebar.indexOf('</script>') < sidebar.indexOf('<header'));
  const base = readFileSync(new URL('../themes/stack/layouts/baseof.html', import.meta.url), 'utf8');
  assert.ok(base.indexOf('partial "sidebar/left.html"') < base.indexOf('<main'), 'Site sidebar restores before main content is parsed');
  const values = new Map();
  const disclosure = { open: true };
  const restore = (pathname, storage = { getItem: key => values.get(key) }, type = 'navigate') => runInNewContext(restoreScript, {
    document: { currentScript: { previousElementSibling: disclosure } },
    sessionStorage: storage, location: { pathname }, performance: { getEntriesByType: () => [{ type }] },
  });
  for (const pathname of ['/post/one/', '/post/two/', '/archives/', '/']) {
    values.set('dex-site-navigation', 'compact');
    disclosure.open = true;
    restore(pathname);
    assert.equal(disclosure.open, false, `${pathname} follows the same global compact preference`);
    for (const value of ['expanded', 'unexpected', undefined]) {
      values.set('dex-site-navigation', value);
      restore(pathname);
      assert.equal(disclosure.open, true, `${pathname} defaults safely to expanded with ${value}`);
    }
  }
  values.set('dex-site-navigation', 'expanded');
  values.set('dex-site-navigation-return:/post/one/', 'compact');
  restore('/post/one/', undefined, 'back_forward');
  assert.equal(disclosure.open, false, 'Back restores the geometry the reader left, even after another page expanded the global preference');
  restore('/post/one/', undefined, 'navigate');
  assert.equal(disclosure.open, true, 'Fresh navigation follows the global preference, not a stale return state');
  restore('/post/one/', undefined, 'reload');
  assert.equal(disclosure.open, true, 'Reload follows the saved global preference');
  values.set('dex-site-navigation', 'compact');
  values.set('dex-site-navigation-return:/post/one/', 'expanded');
  restore('/post/one/', undefined, 'back_forward');
  assert.equal(disclosure.open, true, 'Back also restores an expanded article after another page compacted');
  restore('/post/two/', undefined, 'back_forward');
  assert.equal(disclosure.open, false, 'Missing return state falls back to the current global choice');
  disclosure.open = true;
  assert.doesNotThrow(() => restore('/', { getItem() { throw new Error('Storage blocked'); } }));
  assert.equal(disclosure.open, true);
  const context = { document: { currentScript: { previousElementSibling: disclosure } }, performance: { getEntriesByType: () => [{ type: 'navigate' }] }, location: { pathname: '/' } };
  Object.defineProperty(context, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } });
  assert.doesNotThrow(() => runInNewContext(restoreScript, context));
  assert.equal(disclosure.open, true, 'A denied storage getter preserves the default native layout');
});

test('enhancement saves native desktop changes and departure without reapplying layout', () => {
  const f = fixture({ open: false });
  setupSiteNavigation(f.document, f.window);
  assert.equal(f.disclosure.open, false, 'Do not reopen a parser-restored compact disclosure');
  assert.equal(f.stored.size, 0, 'Initialization does not overwrite the restored preference');
  f.fire('toggle');
  assert.equal(f.stored.get('dex-site-navigation'), 'compact');
  f.disclosure.open = true;
  f.fire('toggle');
  assert.equal(f.stored.get('dex-site-navigation'), 'expanded');
  assert.equal(f.stored.get('dex-site-navigation-return:/post/example/'), 'expanded');
  f.disclosure.open = false;
  f.firePage('pagehide');
  assert.equal(f.stored.get('dex-site-navigation'), 'compact', 'Departure records the latest native state even before a queued toggle');
  assert.equal(f.stored.get('dex-site-navigation-return:/post/example/'), 'compact', 'Save the geometry needed for native Back separately from the global preference');
  assert.deepEqual([...f.stored.keys()].sort(), ['dex-site-navigation', 'dex-site-navigation-return:/post/example/'], 'Only global and current-page return geometry are stored, leaving chapter state independent');
  assert.doesNotMatch(source, /preventDefault\(|pushState|replaceState|scrollRestoration|scrollIntoView|scrollTo\(|\.open\s*=/);
});

test('phone and tablet activity cannot overwrite the desktop preference at the responsive boundary', () => {
  const f = fixture({ open: false });
  setupSiteNavigation(f.document, f.window);
  f.fire('toggle');
  assert.equal(f.stored.get('dex-site-navigation'), 'compact');
  for (const width of [320, 390, 768, 1023]) {
    f.window.innerWidth = width;
    f.disclosure.open = true;
    f.fire('toggle');
    f.firePage('pagehide');
    assert.equal(f.stored.get('dex-site-navigation'), 'compact', `${width}px leaves desktop preference intact`);
    assert.equal(f.stored.get('dex-site-navigation-return:/post/example/'), 'compact', `${width}px leaves the article's desktop return geometry intact`);
  }
  f.window.innerWidth = 1024;
  f.fire('toggle');
  assert.equal(f.stored.get('dex-site-navigation'), 'expanded', 'The desktop boundary is inclusive at 1024px');
});

test('enhancement is idempotent, tolerates absent controls and fails open with disabled persistence', () => {
  const f = fixture({ blocked: true });
  assert.doesNotThrow(() => setupSiteNavigation({ querySelector: () => null }, f.window));
  setupSiteNavigation(f.document, f.window);
  setupSiteNavigation(f.document, f.window);
  assert.equal(f.events.get('toggle').length, 1);
  assert.equal(f.pageEvents.get('pagehide').length, 1);
  f.disclosure.open = false;
  assert.doesNotThrow(() => f.fire('toggle'));
  assert.doesNotThrow(() => f.firePage('pagehide'));
  assert.equal(f.disclosure.open, false);
  Object.defineProperty(f.window, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } });
  f.disclosure.open = true;
  assert.doesNotThrow(() => f.fire('toggle'));
  assert.doesNotThrow(() => f.firePage('pagehide'));
  assert.equal(f.disclosure.open, true, 'Neither storage failure changes the native state');
});

test('responsive focus follows hidden sidebar controls without stealing unrelated focus', () => {
  for (const [width, target] of [[390, 'hamburger'], [900, 'avatar']]) {
    for (const browserBlursFirst of [false, true]) {
      const f = fixture({ open: false });
      setupSiteNavigation(f.document, f.window);
      f.focus(f.summary);
      f.summary.visible = false;
      if (browserBlursFirst) f.blur(f.summary);
      f.resize(width);
      assert.deepEqual(f.focused, [{ target, options: { preventScroll: true } }], 'Hidden desktop summary hands off to a visible navigation control');
    }
  }
  const f = fixture({ open: false, width: 390 });
  setupSiteNavigation(f.document, f.window);
  f.focus(f.siteName);
  f.siteName.visible = false;
  f.resize(1280);
  assert.deepEqual(f.focused, [{ target: 'avatar', options: { preventScroll: true } }], 'An expanded mobile brand link disappearing on desktop hands off to its avatar');
  f.focused.length = 0;
  f.focus(f.summary);
  const input = {};
  f.focus(input);
  f.summary.visible = false;
  f.resize(390);
  assert.equal(f.document.activeElement, input);
  assert.equal(f.focused.length, 0, 'A reader using unrelated content keeps their focus');
  f.document.activeElement = f.document.body;
  f.resize(1280);
  assert.equal(f.focused.length, 0, 'Stale sidebar focus cannot steal focus after another interaction');
  f.summary.visible = true;
  f.focus(f.summary);
  f.blur(f.summary);
  f.summary.visible = false;
  f.resize(390);
  assert.equal(f.focused.length, 0, 'Clicking non-focusable article text deliberately blurs a visible control without a later focus steal');
});

test('desktop CSS uses progressive native state, compact geometry and accessible labels without resizing animation', () => {
  assert.match(css, /\.site-navigation-disclosure\s*\{\s*display:\s*none/);
  assert.match(css, /@supports selector\(:has\(\*\)\)/);
  assert.match(css, /@media\s*\(min-width:\s*1024px\)/);
  assert.match(css, /:has\(\.site-navigation-disclosure:not\(\[open\]\)\)/);
  assert.match(css, /--left-sidebar-max-width:\s*64px/);
  assert.match(css, /--sidebar-avatar-size:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /clip-path:\s*inset\(50%\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /transition:[^;}]*\b(?:all|width|height|flex|margin)\b/);
  assert.match(sidebar, /href='\{\{ \.URL \}\}' title="\{\{ \.Name \}\}"/);
  assert.match(sidebar, /title="\{\{ \. \}\}" aria-label="\{\{ \. \}\}"/);
  assert.match(sidebar, /<button id="dark-mode-toggle"[^>]*title=/);
  assert.match(sidebar, /with default "link" \.Params.Icon/, 'Future menu entries without an explicit icon stay discoverable');
});

test('navigation assets are site-wide and loaded after chapter geometry', () => {
  const head = readFileSync(new URL('../layouts/_partials/head/custom.html', import.meta.url), 'utf8');
  const assets = readFileSync(new URL('../layouts/_partials/site-navigation/assets.html', import.meta.url), 'utf8');
  assert.ok(head.indexOf('partial "site-navigation/assets.html"') > head.indexOf('partial "chapter-rail/assets.html"'));
  assert.match(assets, /css\/site-navigation\.css/);
  assert.match(assets, /js\/site-navigation\.mjs/);
  assert.match(assets, /<script type="module"/);
  assert.match(assets, /fingerprint/);
});
