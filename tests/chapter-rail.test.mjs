import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterAtPosition, targetID } from '../assets/js/chapter-rail.mjs';

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
});
test('mobile keeps a native in-flow disclosure; rail does not create sliding controls', () => {
  const article = readFileSync(new URL('../layouts/_partials/article/article.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/css/chapter-rail.css', import.meta.url), 'utf8');
  assert.match(article, /<details>/);
  assert.match(article, /<summary>Chapters/);
  assert.doesNotMatch(article, /<button|dialog/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /forced-colors: active/);
});
