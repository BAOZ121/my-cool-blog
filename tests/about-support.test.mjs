import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('About appends the shared support entry without replacing its introduction or support options', () => {
  const about = readFileSync('content/page/about/index.en.md', 'utf8');
  assert.match(about, /DEX is an independent, student-led business research and publishing project/);
  assert.match(about, /## Research Methodology/);
  assert.match(about, /## Support the Research/);
  assert.match(about, /GitHub Sponsors/);
  assert.equal(about.match(/{{< reader-support >}}/g)?.length, 1);
  assert.ok(about.trimEnd().endsWith('{{< reader-support >}}'));
});
test('About reuses the live homepage entry and never embeds payment scripts', () => {
  const shortcode = readFileSync('layouts/_shortcodes/reader-support.html', 'utf8');
  const partial = readFileSync('layouts/_partials/home/support.html', 'utf8');
  assert.match(shortcode, /partial "home\/support.html" .Page/);
  assert.match(shortcode, /resources.Get "css\/home-support.css"/);
  assert.doesNotMatch(shortcode, /<script|paypal.com|\/test\//);
  assert.match(partial, /href="\/support\/"/);
  assert.match(partial, /lang="zh-CN"/);
  assert.match(partial, /如果您觉得对您有帮助，请支持我。/);
});
