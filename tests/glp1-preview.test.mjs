import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base='content/test/glp1-peptides/';
const md=readFileSync(base+'index.en.md','utf8');
const data=JSON.parse(readFileSync(base+'assets/web-visuals.json','utf8'));
const evidence=JSON.parse(readFileSync(base+'assets/supporting-evidence-en.json','utf8'));
test('GLP-1 preview is isolated and retains four parts and independent evidence',()=>{
 for(const s of ['testpage: true','list: "never"','disable: true','noindex, nofollow','/test/glp1-peptides/'])assert.ok(md.includes(s));
 assert.equal((md.match(/^## Part /gm)||[]).length,4);
 assert.ok(!/^## Part \d+: Industry History/m.test(md));
 assert.equal(evidence.length,29);
 const ids=new Set(evidence.map(e=>e.id));
 for(const m of md.matchAll(/href="#source-([A-Z]\d{2})"/g))assert.ok(ids.has(m[1]));
 assert.ok(md.includes('Appendix: Evidence and Methods'));
 assert.ok(md.includes('not a GLP-1 manufacturing site'));
 assert.ok(md.includes('party claims, not final judicial findings'));
});
test('GLP-1 chart keeps the historical diabetes-only denominator and residual',()=>{
 const c=data.shares['glp1-diabetes-value-mat-nov-2025'];
 assert.deepEqual(c.series.map(x=>x.value),[45.8,54.2]);
 assert.equal(c.series.reduce((a,x)=>a+x.value,0),100);
 assert.match(c.scope,/not all obesity medicines, peptide APIs or CDMOs/);
 assert.match(c.note,/not Lilly alone/);
 assert.equal(c.period,'MAT to November 2025');
});
const published=readFileSync('content/post/glp1-peptides/index.en.md','utf8');
test('GLP-1 formal article keeps full approved text, assets and source scope',()=>{
 assert.match(published,/url: "\/post\/glp1-peptides\/"/);
 for(const s of ['testpage: true','noindex','list: "never"','disable: true']) assert.ok(!published.includes(s));
 assert.match(published,/image: "assets\/cover-original.jpg"/);
 assert.match(published,/categories: \["Industry Report"\]/);
 assert.match(md,/Read the published industry report/);
 assert.equal(published.slice(published.indexOf('## Part 1:')),md.slice(md.indexOf('## Part 1:')));
 for(const name of ['DEX-GLP1-Industry-Report-Bilingual-v1.0.docx','DEX-GLP1-Industry-Report-Bilingual-v1.0.pdf','cover-original.jpg','web-tables.json','supporting-evidence-en.json']) assert.deepEqual(readFileSync('content/post/glp1-peptides/assets/'+name),readFileSync(base+'assets/'+name));
});
