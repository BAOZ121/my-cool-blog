import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
const template = read('layouts/page/home-support-preview.html');
test('preview retains the exact current homepage feed and existing sidebar components', () => {
  const main = read('layouts/home.html').split('{{ define "main" }}\n')[1].split('{{ end }}\n\n{{ define "right-sidebar" }}')[0];
  assert.ok(template.includes(main));
  assert.ok(template.includes('partial "sidebar/left.html" .Site.Home'));
  assert.ok(template.includes('"Context" .Site.Home "Scope" "homepage"'));
});
test('homepage preview is unlisted, noindex and test-only', () => {
  const page = read('content/test/home-support/index.en.md');
  for (const marker of ['testpage: true', 'robots: "noindex, nofollow"', 'list: "never"', 'disable: true']) assert.ok(page.includes(marker));
  assert.ok(template.includes('TEST PREVIEW'));
  assert.ok(template.includes('production is unchanged'));
});
test('support is a native keyboard link to the existing consent-gated preview, not a checkout', () => {
  assert.match(template, /<a class="dex-home-support__button" href="\/test\/support-dex\/"/);
  assert.ok(template.includes('Please do not complete a payment'));
  assert.ok(!template.includes('paypal.com'));
  assert.ok(!template.includes('support-paypal.mjs'));
  assert.ok(read('assets/css/home-support-preview.css').includes(':focus-visible'));
  assert.ok(read('assets/css/home-support-preview.css').includes('max-width:600px'));
});
