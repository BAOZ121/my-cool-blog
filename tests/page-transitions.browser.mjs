import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve("public");
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
const screenshots = process.env.TRANSITION_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"], ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const [width, scheme, motion] of [[1440, "light", "no-preference"], [390, "dark", "no-preference"], [1440, "dark", "reduce"], [390, "light", "reduce"]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: motion });
    // Keep this timing-sensitive check independent of external font availability.
    await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
    await context.addInitScript(({ scheme }) => {
      localStorage.setItem("StackColorScheme", scheme);
      window.__transition = { started: false, finished: false, reveals: 0 };
      window.addEventListener("pageswap", event => {
        event.viewTransition?.ready.catch(error => console.log("Outgoing transition:", error.name, error.message));
        sessionStorage.setItem("dex-test-outgoing", JSON.stringify({
          started: Boolean(event.viewTransition), visibility: document.visibilityState, time: Date.now(),
          type: event.activation?.navigationType, from: location.href, to: event.activation?.entry?.url,
          reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          root: getComputedStyle(document.documentElement).viewTransitionName,
          sidebar: getComputedStyle(document.querySelector(".left-sidebar")).viewTransitionName,
        }));
      });
      // Observe the actual browser event; production ships no navigation script.
      window.addEventListener("pagereveal", event => {
        const state = window.__transition = { started: Boolean(event.viewTransition), finished: !event.viewTransition, ready: false, reveals: window.__transition.reveals + 1, time: Date.now(), stylesheetReady: Boolean(document.querySelector('#dex-page-transitions')?.sheet) };
        if (!event.viewTransition) return;
        event.viewTransition.ready.then(() => {
          state.ready = true;
          state.duration = getComputedStyle(document.documentElement, "::view-transition-new(root)").animationDuration;
        }, error => { state.error = error.name; });
        event.viewTransition.finished.then(() => { state.finished = true; });
      });
    }, { scheme });
    const page = await context.newPage();
    const errors = [];
    const consoleMessages = [];
    page.on("console", message => consoleMessages.push(message.text()));
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/");
    assert.equal(await page.locator('style#dex-page-transitions').count(), 1);
    const article = page.locator(".article-list .article-title a").first();
    const articlePath = await article.getAttribute("href");
    await article.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    // A screenshot waits for a real compositor frame before the navigation test.
    await page.screenshot();
    const homeScroll = await page.evaluate(() => scrollY);
    await article.click();
    await page.waitForURL(origin + articlePath);
    await page.waitForFunction(() => window.__transition.finished);
    const first = await page.evaluate(() => window.__transition);
    if (first.started !== (motion === "no-preference")) {
      console.log("Native transition diagnostics", consoleMessages, await page.evaluate(() => ({ outgoing: sessionStorage.getItem("dex-test-outgoing"), incoming: window.__transition, visibility: document.visibilityState, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, styles: [...document.querySelector('#dex-page-transitions').sheet.cssRules].map(rule => rule.cssText) })));
      const diagnostics = await browser.newBrowserCDPSession();
      console.log("Chromium transition skip reasons", await diagnostics.send("Browser.getHistograms", { query: "Blink.ViewTransitions.SkipReason", delta: false }));
      await diagnostics.detach();
    }
    assert.equal(first.started, motion === "no-preference", `Native cross-document opt-in must respect reduced motion: ${JSON.stringify(first)}`);
    if (first.started) {
      assert.equal(first.ready, true, `The browser must run, not skip, the transition: ${JSON.stringify(first)}`);
      assert.equal(first.duration, "0.18s");
    }
    assert.equal(await page.locator("html").getAttribute("data-scheme"), scheme);
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.evaluate(() => scrollY < 5), true, "New articles start at the top");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const named = await page.locator(".left-sidebar").evaluate(element => getComputedStyle(element).viewTransitionName);
    assert.equal(named, width >= 768 && motion === "no-preference" ? "dex-navigation" : "none");
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `article-${width}-${scheme}-${motion}.png`) });

    // Same-document anchors remain immediate native history entries.
    const anchor = page.locator('main a[href^="#"]').first();
    if (await anchor.count()) {
      const reveals = await page.evaluate(() => window.__transition.reveals);
      const fragment = await anchor.getAttribute("href");
      await anchor.click();
      await page.waitForURL(url => url.hash === fragment);
      assert.equal(await page.evaluate(() => window.__transition.reveals), reveals);
      await page.goBack();
    }
    await page.evaluate(() => scrollTo(0, Math.min(2500, document.documentElement.scrollHeight - innerHeight)));
    const articleScroll = await page.evaluate(() => scrollY);
    await page.goBack();
    await page.waitForURL(origin + "/");
    await page.waitForFunction(expected => Math.abs(scrollY - expected) < 5, homeScroll);
    await page.goForward();
    await page.waitForURL(origin + articlePath);
    await page.waitForFunction(expected => Math.abs(scrollY - expected) < 5, articleScroll);
    await page.waitForFunction(() => window.__transition.finished);

    // An ordinary Enter key activation also follows a real link to a fresh document.
    await page.goto(origin + "/");
    const archives = page.locator('#main-menu a[href="/archives/"]').first();
    if (width < 768) await page.locator("#toggle-menu").click();
    await archives.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(origin + "/archives/");
    assert.equal(await page.locator("main").isVisible(), true);

    // Search remains a native GET form, including its query and fresh initialization.
    await page.goto(origin + "/");
    await page.locator("#research-home-query").fill("space");
    await page.locator("#research-home-query").press("Enter");
    await page.waitForURL(url => url.pathname === "/search/" && url.searchParams.get("keyword") === "space");
    await page.waitForFunction(() => window.__transition.finished);
    assert.equal(await page.locator('input[name="keyword"]').inputValue(), "space");

    // New tabs and downloads are browser-owned; no click listener rewrites them.
    await page.goto(origin + "/");
    const popupPromise = context.waitForEvent("page");
    await page.locator(".article-list .article-title a").first().click({ modifiers: ["Control"] });
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(new URL(popup.url()).pathname, articlePath);
    assert.equal(page.url(), origin + "/");
    await popup.close();
    await page.evaluate(() => {
      const download = document.createElement("a");
      download.href = "/data/industries.csv";
      download.download = "industries.csv";
      download.id = "test-native-download";
      download.textContent = "Download test fixture";
      document.querySelector("main").prepend(download);
    });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#test-native-download").click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "industries.csv");
    assert.equal(page.url(), origin + "/");

    for (const path of ["/evidence-library/", "/industries/", "/industry-breakdowns/", "/about/"]) {
      await page.goto(origin + "/");
      const link = page.locator(`a[href="${path}"]`).filter({ visible: true }).first();
      if (await link.count()) await link.click();
      else await page.goto(origin + path);
      await page.waitForURL(origin + path);
      await page.waitForFunction(() => window.__transition.finished);
      assert.equal(await page.locator("main").isVisible(), true);
      if (path === "/evidence-library/") await page.waitForSelector('[data-enhanced="true"]');
      if (path === "/industries/") assert.equal(await page.locator("#industry-explorer").count(), 1);
    }

    // Overlapping navigations must finish at the last destination without an overlay.
    await page.evaluate(() => {
      const first = document.createElement("a"); first.href = "/archives/";
      const last = document.createElement("a"); last.href = "/evidence-library/";
      document.body.append(first, last); first.click(); last.click();
    });
    await page.waitForURL(origin + "/evidence-library/");
    await page.waitForFunction(() => window.__transition.finished);
    await page.waitForSelector('[data-enhanced="true"]');
    assert.equal(await page.locator("main").isVisible(), true);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px ${scheme} ${motion}: native ${first.started ? "180ms transition" : "reduced-motion opt-out"}, keyboard, anchors, history/scroll, new tab, rapid navigation, search and page initialization`);
    await context.close();
  }

  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 }, reducedMotion: "no-preference" });
  const page = await noJS.newPage();
  await page.goto(origin + "/");
  const link = page.locator(".article-list .article-title a").first();
  const path = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(origin + path);
  assert.equal(await page.locator("main h1").isVisible(), true);
  await page.goBack();
  await page.waitForURL(origin + "/");
  assert.equal(await page.locator("main").isVisible(), true);
  console.log("PASS no JavaScript: article navigation and Back stay usable");
  await noJS.close();

  // A failed/unsupported enhancement cannot hide content or hijack navigation.
  const fallback = await browser.newContext();
  await fallback.route("**/*", async route => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/<style id=["']?dex-page-transitions["']?>[\s\S]*?<\/style>/, "") });
  });
  const plain = await fallback.newPage();
  await plain.goto(origin + "/");
  const plainLink = plain.locator(".article-list .article-title a").first();
  const plainPath = await plainLink.getAttribute("href");
  await plainLink.click();
  await plain.waitForURL(origin + plainPath);
  assert.equal(await plain.locator("main h1").isVisible(), true);
  console.log("PASS enhancement stylesheet unavailable: ordinary navigation remains visible");
  await fallback.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
