import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(await readFile(resolve('public','.'+p)));}catch{res.statusCode=404;res.end('Missing');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});await mkdir('test-results/glp1',{recursive:true});
for(const [name,w,h] of [['desktop',1440,1000],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width:w,height:h}});await page.goto(base+'/post/glp1-peptides/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('meta[name="robots"][content*="noindex"]').count(),0);
 assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://thedexs.com/post/glp1-peptides/');
 assert.equal(await page.locator('.article-content h2').count(),5);assert.equal(await page.locator('.research-evidence').count(),29);
 assert.ok(await page.locator('.article-header img[data-article-cover]').evaluate(x=>x.complete&&x.naturalWidth>0));
 await page.screenshot({path:`test-results/glp1/${name}-top.png`});
 const map=page.locator('[data-visual="map"]');await map.scrollIntoViewIfNeeded();await page.waitForTimeout(1500);assert.ok(await map.locator('svg').count());await map.locator('[data-action="expand"]').click();await page.waitForTimeout(500);await map.screenshot({path:`test-results/glp1/${name}-map.png`});
 await map.locator('[data-action="fit"]').click();
 const pie=page.locator('[data-visual="share"]');await pie.scrollIntoViewIfNeeded();await page.waitForTimeout(1500);assert.ok(await pie.locator('svg').count());await pie.screenshot({path:`test-results/glp1/${name}-chart.png`});
 const table=page.locator('.research-table');await table.scrollIntoViewIfNeeded();await table.screenshot({path:`test-results/glp1/${name}-table.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 const missing=await page.locator('a[href^="#"]').evaluateAll(as=>as.map(a=>a.getAttribute('href')).filter(h=>h.length>1&&!document.getElementById(decodeURIComponent(h.slice(1)))));assert.deepEqual(missing,[]);
 await page.close();
}
const p=await browser.newPage({javaScriptEnabled:false});await p.goto(base+'/post/glp1-peptides/');assert.equal(await p.locator('.visual-fallback[open]').count(),2);assert.equal(await p.locator('.research-data-table tbody tr').count(),10);await p.close();await browser.close();server.close();console.log('GLP1 desktop/mobile, no-JS, map/chart/table, anchor and overflow checks passed.');
