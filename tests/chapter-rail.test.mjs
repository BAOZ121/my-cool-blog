import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { chapterAtPosition, targetID, setupChapterRails } from '../assets/js/chapter-rail.mjs';

test('reading line selects the preceding chapter, including before and after the article', () => {
  assert.equal(chapterAtPosition([], 100), -1);
  assert.equal(chapterAtPosition([100, 240, 800], 0), 0);
  assert.equal(chapterAtPosition([100, 240, 800], 239), 0);
  assert.equal(chapterAtPosition([100, 240, 800], 240), 1);
  assert.equal(chapterAtPosition([100, 240, 800], 9000), 2);
});
test('chapter links preserve Unicode and punctuation without selector interpolation', () => {
  const base = 'https://thedexs.com/post/example/';
  assert.equal(targetID('/post/example/#part-2', base), 'part-2');
  assert.equal(targetID('#%E7%AB%A0%E8%8A%82%3Aone', base), '章节:one');
  assert.equal(targetID('#bad%escape', base), null);
  assert.equal(targetID('https://other.example/#part-2', base), null);
  assert.equal(targetID('/different/#part-2', base), null);
  assert.equal(targetID('?changed=1#part-2', base), null);
  assert.equal(targetID('#', base), null);
});
test('the progressive rail never intercepts navigation or changes history and restoration', () => {
  const script = readFileSync(new URL('../assets/js/chapter-rail.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /preventDefault\(|pushState|replaceState|scrollRestoration|scrollIntoView|window\.scrollTo/);
  assert.match(script, /aria-current/);
  assert.match(script, /pageshow/);
  assert.match(script, /ResizeObserver/);
  assert.doesNotMatch(script, /disclosure\.open\s*=/);
  assert.match(script, /pagehide/);
});
test('mobile keeps a native in-flow disclosure and rail avoids overlay controls', () => {
  const article = readFileSync(new URL('../layouts/_partials/article/article.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/css/chapter-rail.css', import.meta.url), 'utf8');
  assert.match(article, /<details>/);
  assert.match(article, /<summary>Chapters/);
  assert.doesNotMatch(article, /<button|dialog/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /left: auto; right: var\(--rail-axis\)/);
  assert.match(css, /text-align: right/);
});

test('native disclosure state survives a reload and tolerates disabled storage', () => {
  const events = {};
  const values = new Map([['dex-chapters-open:/post/example/', 'open']]);
  const disclosure = { open: false, addEventListener: (name, handler) => { events[name] = handler; } };
  const rail = { querySelectorAll: () => [] };
  const document = { querySelectorAll: () => [rail], querySelector: selector => selector === '.chapter-mobile details' ? disclosure : selector === '.article-content' ? {} : null };
  const window = {
    location: new URL('https://thedexs.com/post/example/'),
    addEventListener: (name, handler) => { events[name] = handler; },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
  };
  const article = readFileSync(new URL('../layouts/_partials/article/article.html', import.meta.url), 'utf8');
  const restoreScript = article.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(article.indexOf('<script>') < article.indexOf('partial "article/components/content"'), 'Restore before article content is parsed');
  const restore = storage => runInNewContext(restoreScript, {
    document: { currentScript: { previousElementSibling: disclosure } },
    sessionStorage: storage, location: window.location,
  });
  restore(window.sessionStorage);
  assert.equal(disclosure.open, true);
  setupChapterRails(document, window);
  assert.equal(disclosure.open, true);
  disclosure.open = false;
  events.toggle();
  assert.equal(values.get('dex-chapters-open:/post/example/'), 'closed');
  disclosure.open = true;
  events.pagehide();
  assert.equal(values.get('dex-chapters-open:/post/example/'), 'open');
  Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } });
  assert.doesNotThrow(() => setupChapterRails(document, window));
  assert.doesNotThrow(() => events.toggle());
  disclosure.open = false;
  assert.doesNotThrow(() => restore({ getItem() { throw new Error('Storage blocked'); } }));
  assert.equal(disclosure.open, false, 'Blocked storage does not change native layout');
});

test('desktop native toggle and parser-time state restore work without enhancement', () => {
  const template = readFileSync(new URL('../layouts/_partials/widget/toc.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/css/chapter-rail.css', import.meta.url), 'utf8');
  const restoreScript = template.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(template, /<details class="chapter-disclosure" open>/);
  assert.match(template, /<summary[^>]*aria-controls="ArticleChapters"/);
  assert.match(template, /Minimize chapters/);
  assert.match(template, /Expand chapters/);
  assert.match(css, /:has\(\.chapter-disclosure:not\(\[open\]\)\)/);
  assert.match(css, /--right-sidebar-max-width: 44px/);
  assert.match(css, /max-width: 1200px/);
  assert.match(css, /--chapter-prose-measure: calc\(var\(--article-font-size\) \* 50\)/);
  assert.doesNotMatch(css, /transition:[^;}]*\b(?:all|width|height|flex|margin)\b/);
  const disclosure = { open: true };
  const values = new Map([['dex-chapters-minimized:/post/one/', 'true']]);
  const restore = (pathname, storage = { getItem: key => values.get(key) }) => runInNewContext(restoreScript, {
    document: { currentScript: { parentElement: { querySelector: () => disclosure } } },
    sessionStorage: storage, location: { pathname },
  });
  restore('/post/one/');
  assert.equal(disclosure.open, false);
  restore('/post/two/');
  assert.equal(disclosure.open, true, 'Another article retains its own width');
  values.set('dex-chapters-minimized:/post/one/', 'false');
  restore('/post/one/');
  assert.equal(disclosure.open, true);
  assert.doesNotThrow(() => restore('/post/one/', { getItem() { throw new Error('Storage blocked'); } }));
  assert.equal(disclosure.open, true, 'Storage failure preserves usable native expanded layout');
});

test('desktop persistence is per article and blocked storage never disables native toggles', () => {
  const events = {};
  const pageEvents = {};
  const values = new Map();
  const disclosure = { open: true, addEventListener: (name, handler) => { events[name] = handler; } };
  const document = {
    querySelectorAll: () => [{ querySelectorAll: () => [] }],
    querySelector: selector => selector === '.chapter-disclosure' ? disclosure : selector === '.article-content' ? {} : null,
  };
  const window = {
    location: new URL('https://thedexs.com/post/example/'),
    addEventListener: (name, handler) => { pageEvents[name] = handler; },
    sessionStorage: { setItem: (key, value) => values.set(key, value) },
  };
  setupChapterRails(document, window);
  disclosure.open = false;
  events.toggle();
  assert.equal(values.get('dex-chapters-minimized:/post/example/'), 'true');
  disclosure.open = true;
  pageEvents.pagehide();
  assert.equal(values.get('dex-chapters-minimized:/post/example/'), 'false');
  Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } });
  assert.doesNotThrow(() => events.toggle());
  assert.equal(disclosure.open, true);
});
