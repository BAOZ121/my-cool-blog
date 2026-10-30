import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('About preview dynamically uses the real About article without editing existing content or Support page', () => {
  const template = read('layouts/page/about-support-preview.html');
  assert.match(template, /\.Site\.GetPage "\/page\/about"/);
  assert.match(template, /partial "article\/components\/content" \$about/);
  assert.match(template, /partial "article\/components\/header"/);
  assert.match(template, /partial "article\/components\/footer" \$about/);
  assert.match(template, /partial "sidebar\/right.html"/);
  assert.match(template, /partialCached "footer\/footer"/);
  assert.equal(read('content/test/about-support/index.en.md').split('---').slice(2).join('---').trim(), '');
});
test('About support is an embedded live PayPal channel with explicit load, accessible status and truthful terms', () => {
  const template = read('layouts/page/about-support-preview.html');
  assert.match(template, /resources.Get "js\/support-paypal.mjs"/);
  for (const phrase of ['data-dex-paypal-preview', 'id="support-load-paypal" type="button"', 'id="support-paypal-status"', 'role="status"', 'aria-live="polite"', 'id="support-reload" type="button" hidden', 'not a sandbox', 'not authorize or complete a payment', 'research stays free', 'not buy coverage', 'not a charitable donation', 'No charitable tax receipt', 'does not confirm PayPal account approval', '<noscript>']) assert.ok(template.includes(phrase), phrase);
  assert.equal((template.match(/id="paypal-container-YTJXE3R8LDUPL"/g) || []).length, 1);
  assert.doesNotMatch(template, /<form\b|<input\b|capture\(|onApprove|href="#"/);
  assert.ok(template.indexOf('id="support-paypal"') > template.indexOf('partial "article/components/content" $about'));
  const css = read('assets/css/about-support-preview.css');
  assert.match(css, /minmax\(0,1fr\)/); assert.match(css, /@media\(max-width:600px\)/); assert.match(css, /var\(--card-background\)/);
});
test('About preview has no discovery or production navigation changes', () => {
  const md = read('content/test/about-support/index.en.md');
  for (const phrase of ['url: "/test/about-support/"', 'testpage: true', 'robots: "noindex, nofollow"', 'list: "never"', 'sitemap:\n  disable: true']) assert.ok(md.includes(phrase), phrase);
  assert.doesNotMatch(read('hugo.toml'), /\/test\/about-support\//);
});
test('built About preview preserves all article HTML and uses preview-local chapter links', { skip: !existsSync('public/test/about-support/index.html') }, () => {
  const prod = read('public/about/index.html'), preview = read('public/test/about-support/index.html');
  const article = /<section class=["']?article-content["']?>([\s\S]*?)<\/section>/;
  const source = prod.match(article), reviewed = preview.match(article);
  assert.ok(source); assert.ok(reviewed); assert.equal(reviewed[1], source[1]);
  for (const section of ['about-dex','what-this-site-publishes','research-methodology','use-of-ai','independence-and-disclaimer','contact-and-collaboration','support-the-research']) {
    assert.match(preview, new RegExp(`href=["']?/test/about-support/#${section}`), section);
  }
  assert.match(preview, /class=["']?sidebar right-sidebar/);
  assert.match(preview, /noindex, nofollow/);
  assert.equal((preview.match(/id=["']?paypal-container-YTJXE3R8LDUPL/g) || []).length, 1);
  assert.equal((preview.match(/src=["']?[^ >"']*support-paypal[^ >"']*\.mjs/g) || []).length, 1);
  assert.doesNotMatch(preview, /<script[^>]*src=["']?https:\/\/www.paypal.com/);
  assert.doesNotMatch(prod, /support-paypal|data-dex-paypal-preview|about-support-preview/);
  for (const file of ['sitemap.xml','index.xml','index.html','search/index.json','archives/index.html']) {
    if (existsSync('public/' + file)) assert.doesNotMatch(read('public/' + file), /\/test\/about-support\//, file);
  }
});
