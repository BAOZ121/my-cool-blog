import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('left navigation scrollbar is theme-aware, draggable and scoped to the menu', () => {
  const css = readFileSync(new URL('../assets/scss/accessibility.scss', import.meta.url), 'utf8');
  assert.match(css, /#main-menu\s*\{\s*scrollbar-width: thin;\s*scrollbar-color: var\(--accent-color\) var\(--body-background\);/);
  assert.match(css, /#main-menu::\-webkit-scrollbar-thumb/);
  assert.match(css, /@media \(forced-colors: none\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.doesNotMatch(css, /scrollbar-width: none|overflow-y: hidden/);
  for (const line of css.split('\n').filter(line => line.includes('::-webkit-scrollbar'))) assert.ok(line.trim().startsWith('#main-menu'), line);
});
