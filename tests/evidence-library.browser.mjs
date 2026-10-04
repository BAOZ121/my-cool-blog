import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve("public");
const data = JSON.parse(await readFile("data/evidence_library.json", "utf8"));
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".csv": "text/csv", ".pdf": "application/pdf" };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(root, "." + pathname);
    if (!file.startsWith(root + sep)) throw new Error("Invalid path");
    response.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const screenshotDir = process.env.EVIDENCE_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", colorScheme: "light" });
    await context.addInitScript(() => localStorage.setItem("StackColorScheme", "light"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/evidence-library/`);
    await page.waitForSelector('[data-enhanced="true"]');
    assert.equal(await page.locator("main h1").count(), 1);
    assert.match(await page.locator("[data-result-count]").textContent(), new RegExp(`${data.counts.materials} materials across ${data.counts.articles} articles`));
    assert.equal(await page.locator("[data-article]").count(), data.counts.articles);
    assert.equal(await page.locator("[data-evidence-item]").count(), data.counts.materials);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('[data-article][open]').count(), 0);
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/evidence-library-${width}-light.png`, fullPage: true });
    // Native disclosures work by keyboard; toggling twice remains reversible.
    const summary = page.locator(".el-article > summary").first();
    await summary.focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator(".el-article").first().getAttribute("open"), "");
    await page.keyboard.press("Space");
    assert.equal(await page.locator(".el-article").first().getAttribute("open"), null);
    const q = page.locator("#el-query");
    // Extensionless publisher PDFs remain discoverable in the Files filter.
    await q.fill("AAAI");
    await page.locator("#el-type").selectOption("file");
    const aaaipdf = page.locator('[data-evidence-item]:visible a[href="https://ojs.aaai.org/index.php/AAAI/article/view/41334/45295"]');
    assert.equal(await aaaipdf.count(), 1);
    await page.locator('button[type="reset"]').click();
    await q.fill("Content not confirmed in the 2026-10-03 review");
    assert.equal(await page.locator("[data-evidence-item]:visible").count(), 9);
    await page.locator('button[type="reset"]').click();
    await q.fill("NIST");
    assert.ok(await page.locator("[data-evidence-item]:visible").count() > 0);
    assert.ok((await page.locator("[data-result-count]").textContent()).includes("articles"));
    assert.equal(new URL(page.url()).searchParams.get("q"), "NIST");
    await page.locator("#el-type").selectOption("file");
    assert.equal(await page.locator('[data-kind="link"]:visible').count(), 0);
    assert.ok(await page.locator('[data-kind="file"]:visible').count() > 0);
    await page.goBack();
    assert.equal(await page.locator("#el-type").inputValue(), "");
    await page.goForward();
    assert.equal(await page.locator("#el-type").inputValue(), "file");
    await page.locator('button[type="reset"]').click();
    assert.equal(await q.inputValue(), "");
    assert.equal(await q.evaluate(element => element === document.activeElement), true);
    await q.fill('zzzz-no-such-material-<img src=x onerror=alert(1)>');
    assert.equal(await page.locator("[data-empty]").isVisible(), true);
    assert.equal(await page.locator("[data-article]:visible").count(), 0);
    assert.equal(await page.locator(".el img").count(), 0);
    await page.locator("[data-clear-empty]").click();
    assert.equal(await page.locator("[data-empty]").isVisible(), false);
    await page.locator("#el-article").selectOption("50-high-potential-industries");
    assert.equal(await page.locator("[data-article]:visible").count(), 1);
    assert.match(await page.locator(".el-article-notice:visible").textContent(), /other seven audited original ranges remain unverified/);
    await q.fill("internally inconsistent");
    assert.ok(await page.locator("[data-evidence-item]:visible").count() > 0, "Full citation notes must be searchable");
    await page.reload();
    assert.equal(await q.inputValue(), "internally inconsistent");
    assert.ok(await page.locator("[data-evidence-item]:visible").count() > 0);
    await page.locator('button[type="reset"]').click();
    await page.locator("#el-article").selectOption("ai-computing-infrastructure");
    await q.fill("NVIDIA revenue");
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/evidence-search-${width}-light.png`, fullPage: true });
    // Open exact article context, verify a real target, and return with retained filters.
    const citation = page.locator("[data-evidence-item]:visible .el-context").first();
    await citation.locator("summary").click();
    const target = await citation.locator(".el-citation-link").first().getAttribute("href");
    const targetURL = new URL(target, origin);
    const targetHTML = await (await page.request.get(targetURL.href)).text();
    assert.ok(targetHTML.includes(targetURL.hash.slice(1)), "Citation anchor must exist in its article");
    await page.goto(`${origin}/evidence-library/#article-cybersecurity-industry-report`);
    assert.equal(await page.locator("#article-cybersecurity-industry-report").getAttribute("open"), "");
    await page.goto(`${origin}/evidence-library/`);
    await page.locator("[data-expand-all]").click();
    assert.equal(await page.locator("[data-article][open]").count(), data.counts.articles);
    await page.locator("[data-expand-all]").click();
    assert.equal(await page.locator("[data-article][open]").count(), 0);
    // Both themes inherit the site's color tokens.
    await page.evaluate(() => document.documentElement.dataset.scheme = "dark");
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/evidence-library-${width}-dark.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    // All eight existing hosted assets resolve, without downloading third-party reports.
    for (const article of data.articles) for (const entry of article.entries) if (entry.local) {
      const response = await page.request.get(origin + entry.url);
      assert.equal(response.status(), 200, entry.url);
    }
    await context.close();
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const page = await noJS.newPage();
  await page.goto(`${origin}/evidence-library/`);
  assert.equal(await page.locator(".el-filters").isVisible(), false);
  assert.equal(await page.locator(".el-noscript").isVisible(), true);
  await page.locator(".el-article > summary").first().click();
  assert.ok(await page.locator("[data-evidence-item]:visible").count() > 0);
  assert.equal(await page.locator("[data-evidence-item] h4 a").count(), data.counts.materials);
  await noJS.close();
  console.log("Evidence Library browser checks passed: desktop/mobile, light/dark, no-JS, keyboard, search, filters, reset, history, share links, context and files.");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
