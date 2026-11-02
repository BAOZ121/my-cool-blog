import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const route = '/test/lisa-su/';

test('biography opts into the normal homepage feed without changing publication controls', () => {
  const source = read('content/test/lisa-su/index.en.md');
  for (const line of ['homeCard: false', 'homeFeed: true', 'date: "2026-10-13T17:00:00+08:00"', 'url: "/test/lisa-su/"', 'testpage: true', 'robots: "noindex, nofollow"', '  list: "never"', '  render: "always"']) assert.ok(source.includes(line), line);
  const home = read('layouts/home.html');
  assert.doesNotMatch(home, /homeCard|GetPage/);
  assert.match(home, /range \$index, \$element := \$paginator.Pages/);
  const paginator = read('layouts/_partials/helper/paginator.html');
  assert.match(paginator, /if .IsHome/);
  assert.match(paginator, /\$pages \| union \(slice .\)/);
  assert.match(paginator, /\$pages.ByDate.Reverse/);
});

test('built homepage pagination contains Lisa Su exactly once in descending actual-date order', () => {
  const pageFiles = ['public/index.html'];
  if (existsSync('public/page')) {
    for (const n of readdirSync('public/page').filter(n => /^\d+$/.test(n) && Number(n) > 1).sort((a,b) => Number(a)-Number(b))) pageFiles.push(`public/page/${n}/index.html`);
  }
  const cards = pageFiles.flatMap(file => [...read(file).matchAll(/<article\b[\s\S]*?<\/article>/g)].map(([html]) => {
    const url = html.match(/<h2 class=["']?article-title["']?><a href=["']?([^\s>"']+)/)?.[1];
    const date = html.match(/<time class=["']?article-time--published["']? datetime=["']?([^\s>"']+)/)?.[1];
    assert.ok(url && date, `article metadata in ${file}`);
    return { url, date, file };
  }));
  assert.equal(cards.filter(c => c.url === route).length, 1);
  assert.equal(new Set(cards.map(c => c.url)).size, cards.length);
  for (let i=1; i<cards.length; i++) assert.ok(Date.parse(cards[i-1].date) >= Date.parse(cards[i].date), `${cards[i-1].url} before ${cards[i].url}`);
  const lisa = cards.findIndex(c => c.url === route);
  assert.ok(lisa > 0, 'Lisa Su is not pinned first');
  assert.equal(cards[lisa].date, '2026-10-13T17:00:00+08:00');
  assert.ok(cards.findIndex(c => c.url === '/post/nuclear-equipment-services/') < lisa);
  assert.ok(cards.findIndex(c => c.url === '/post/amd-company-research/') > lisa);
  assert.ok(read('public/index.html').includes('如果您觉得对您有帮助，请支持我。'));
  assert.ok(read('public/about/index.html').includes('/support/'));
  assert.ok(read('public/support/index.html').includes('data-dex-paypal-support'));
  console.log(`Lisa Su: ${cards[lisa].file}, overall position ${lisa+1}, date ${cards[lisa].date}`);
});
