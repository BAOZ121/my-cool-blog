import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {validateMap, validateShare, pieOptions} from '../assets/js/article-visuals.mjs';

const base='content/post/minor-metals-industry-report/';
const md=readFileSync(base+'index.en.md','utf8');
const visuals=JSON.parse(readFileSync(base+'assets/web-visuals.json','utf8'));
const evidence=JSON.parse(readFileSync(base+'assets/evidence-en.json','utf8'));

test('published article has four parts, complete source anchors and canonical routing',()=>{
  for(const s of ['categories: ["Industry Report"]','url: "/post/minor-metals-industry-report/"','reportversion: "1.1"']) assert.ok(md.includes(s));
  assert.doesNotMatch(md, /testpage:|noindex|Website test edition|Prepared for editorial review/);
  assert.match(md, /Jurii \/ Wikimedia Commons/);
  const redirects=readFileSync('static/_redirects','utf8');
  for(const suffix of ['', '/', '/*']) assert.ok(redirects.includes(`/test/minor-metals-industry-report${suffix} /post/minor-metals-industry-report/${suffix==='/*'?':splat':''} 301`));
  for(const map of Object.values(visuals.maps)) for(const source of map.sources) assert.ok(source.url.startsWith('/post/minor-metals-industry-report/#'));
  assert.equal((md.match(/^## Part /gm)||[]).length,4);
  assert.match(md,/^## Appendix: Evidence and Methods \{#supporting-evidence\}/m);
  assert.equal(evidence.length,24);
  const ids=new Set(evidence.map(e=>e.id));
  for(const m of md.matchAll(/href="#source-(E\d{2})"/g)) assert.ok(ids.has(m[1]),m[1]);
  for(const e of evidence){
    assert.ok(md.includes(`id="source-${e.id}"`));
    assert.ok(md.includes(e.url.replaceAll('&','&amp;')));
  }
  assert.match(md,/prohibition on dual-use exports/);
  assert.match(md,/Undated; accessed 2026-10-27/);
  assert.ok(!existsSync('content/test/minor-metals-industry-report/index.en.md'));
});

test('native graphics preserve contained-metal denominators and rounding residuals',()=>{
  assert.equal(Object.keys(visuals.maps).length,1);
  assert.equal(Object.keys(visuals.shares).length,2);
  for(const map of Object.values(visuals.maps)) assert.equal(validateMap(map),map);
  const expected={antimony:[105000,45000,27500,15000,4817,4548,8135],tungsten:[75500,59000,5394,2127,1800,1587,5592]};
  for(const [metal,[total,...units]] of Object.entries(expected)){
    const c=visuals.shares[`minor-metals-${metal}-2024`];
    assert.equal(validateShare(c),c);
    assert.equal(c.totalUnits,total);
    assert.deepEqual(c.series.map(s=>s.units),units);
    assert.equal(units.reduce((a,b)=>a+b,0),total);
    assert.deepEqual(c.series.map(s=>s.value),units.map(n=>Math.round(n/total*1000)/10));
    assert.deepEqual(pieOptions(c).series[0].data.map(s=>s.value),units);
    assert.match(c.series.at(-1).name,/Other and rounding/);
    assert.ok(c.rounding_note);
  }
});

test('production build includes article in discovery without test metadata',()=>{
  const path='/post/minor-metals-industry-report/';
  const html=readFileSync('public'+path+'index.html','utf8');
  assert.doesNotMatch(html, /noindex|Website test edition|Prepared for editorial review/);
  assert.ok(html.includes(`rel=canonical href=https://thedexs.com${path}`));
  assert.equal((html.match(/class=visual-data/g)||[]).length,3);
  assert.equal((html.match(/data-source-id=E\d{2}/g)||[]).length,24);
  for(const file of ['index.html','index.xml','sitemap.xml','search/index.json','evidence-library/index.html']){
    assert.ok(readFileSync('public/'+file,'utf8').includes(path),file);
  }
});
