import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";
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

async function observe(context, { scheme = "light", animationAvailable = true, measurePerformance = false } = {}) {
  await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  await context.addInitScript(({ scheme, animationAvailable, measurePerformance }) => {
    localStorage.setItem("StackColorScheme", scheme);
    window.__entry = { calls: [], inputs: [], reveals: 0, nativeTransitions: 0, performance: null };
    window.__entryAnimations = [];
    const active = () => window.__entryAnimations.filter(animation => animation.playState === "running" || animation.pending);
    // Observation only: no DOM writes, playback-rate changes or machine-speed threshold.
    function beginPerformanceObservation() {
      if (!measurePerformance || window.__entry.performance) return;
      const metrics = window.__entry.performance = {
        startedAt: performance.now(), endedAt: null, complete: false,
        frames: 0, maxRafGapMs: 0, longTaskSupported: false, longTasks: [],
      };
      const recordTasks = entries => {
        for (const entry of entries) {
          if (entry.startTime + entry.duration >= metrics.startedAt &&
              (metrics.endedAt === null || entry.startTime <= metrics.endedAt)) {
            metrics.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        }
      };
      let observer;
      if (typeof PerformanceObserver === "function" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        observer = new PerformanceObserver(list => recordTasks(list.getEntries()));
        observer.observe({ type: "longtask", buffered: false });
        metrics.longTaskSupported = true;
      }
      let previousFrame;
      const sample = timestamp => {
        metrics.frames++;
        if (previousFrame !== undefined) metrics.maxRafGapMs = Math.max(metrics.maxRafGapMs, timestamp - previousFrame);
        previousFrame = timestamp;
        if (active().length || document.querySelector(".dex-entry-curtain")) requestAnimationFrame(sample);
        else {
          metrics.endedAt = performance.now();
          if (observer) { recordTasks(observer.takeRecords()); observer.disconnect(); }
          metrics.complete = true;
        }
      };
      requestAnimationFrame(sample);
    }
    for (const type of ["pageswap", "pagereveal"]) {
      window.addEventListener(type, event => {
        if (type === "pagereveal") window.__entry.reveals++;
        if (!event.viewTransition) return;
        window.__entry.nativeTransitions++;
        sessionStorage.setItem("dex-test-native-transitions", String(Number(sessionStorage.getItem("dex-test-native-transitions") || 0) + 1));
        event.viewTransition.ready.catch(() => {});
      });
    }
    // Observe real input before the production cancellation handler runs.
    for (const type of ["pointerdown", "wheel", "keydown", "touchstart"]) {
      window.addEventListener(type, event => {
        const running = active();
        const anchor = event.target.closest?.("a");
        const curtain = document.querySelector(".dex-entry-curtain");
        const rectangle = element => {
          if (!element) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const input = { type, active: running.length, activeIds: running.map(animation => animation.id),
          control: event.target.closest?.("button, a")?.id || "", target: event.target.tagName,
          href: anchor?.href, titleLink: Boolean(anchor?.querySelector("[data-entry-title]")), anchorBefore: rectangle(anchor),
          curtain: curtain ? { pointerEvents: getComputedStyle(curtain).pointerEvents, position: getComputedStyle(curtain).position,
            opacity: getComputedStyle(curtain).opacity, ariaHidden: curtain.getAttribute("aria-hidden"),
            animationName: getComputedStyle(curtain).animationName, duration: getComputedStyle(curtain).animationDuration,
            fill: getComputedStyle(curtain).animationFillMode } : null };
        window.__entry.inputs.push(input);
        queueMicrotask(() => {
          input.anchorAfter = rectangle(anchor);
          sessionStorage.setItem("dex-test-last-input", JSON.stringify(input));
        });
      }, { capture: true, passive: true });
    }
    if (!animationAvailable) {
      Object.defineProperty(Element.prototype, "animate", { configurable: true, value: undefined });
      return;
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const rect = this.getBoundingClientRect();
      const animation = animate.apply(this, args);
      const timing = animation.effect.getTiming();
      const call = {
        tag: this.tagName, id: this.id, classes: this.className, animationId: animation.id,
        curtain: this.matches(".dex-entry-curtain"), titlePixels: this.matches("[data-entry-title]"),
        controlAncestor: this.closest("a,button,summary")?.tagName || null,
        controlTransform: this.closest("a,button,summary") ? getComputedStyle(this.closest("a,button,summary")).transform : null,
        clippedTitle: this.matches("[data-entry-title]") && getComputedStyle(this.closest("a")).overflow === "hidden",
        broadCapture: this.matches("html, body, main, .main, .main-article, .article-header"),
        visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight,
        imageLoaded: this.tagName !== "IMG" || (this.complete && this.naturalWidth > 0),
        interactive: Boolean(this.closest("a,button,summary") || this.querySelector("a,button,input,select,textarea,summary,[tabindex]")),
        duration: timing.duration, delay: timing.delay, iterations: timing.iterations, fill: timing.fill,
        properties: [...new Set(animation.effect.getKeyframes().flatMap(frame => Object.keys(frame)))],
        pseudo: animation.effect.pseudoElement, state: "running",
      };
      window.__entry.calls.push(call);
      window.__entryAnimations.push(animation);
      beginPerformanceObservation();
      animation.finished.then(() => { call.state = "finished"; }, () => { call.state = "cancelled"; });
      return animation;
    };
  }, { scheme, animationAvailable, measurePerformance });
}

async function assertNoNative(page) {
  assert.equal(await page.evaluate(() => window.__entry.nativeTransitions), 0, "No native document snapshot transition may start");
  assert.equal(await page.evaluate(() => Number(sessionStorage.getItem("dex-test-native-transitions") || 0)), 0, "Outgoing and incoming documents must both stay opted out");
  assert.equal(await page.evaluate(() => Boolean(document.activeViewTransition)), false);
  assert.equal(await page.locator("[style*=dex-cover]").count(), 0);
  assert.equal(await page.locator("html").getAttribute("data-dex-transition"), null);
}
async function finished(page) {
  await page.waitForFunction(() => window.__entryAnimations.every(animation => !animation.pending && animation.playState !== "running") && !document.querySelector(".dex-entry-curtain"), null, { timeout: 2200 });
}
function assertArticleTimeline(calls) {
  assert.ok(calls.some(call => call.animationId === "dex-content-enter"), "Article content must have its own reveal phase");
  for (const call of calls) {
    assert.ok(["dex-cover-pop", "dex-content-enter"].includes(call.animationId), `Unexpected entry animation: ${call.animationId}`);
    if (call.animationId === "dex-cover-pop") {
      assert.equal(call.tag, "IMG");
      assert.equal(call.delay, 520, "Cover starts after the approximately half-second black hold");
      assert.equal(call.duration, 400);
    } else {
      assert.equal(call.delay, 920, "Article content reveals after the cover pop");
      assert.equal(call.duration, 420);
    }
  }
}

async function internalArticle(page, articlePath) {
  await Promise.all([
    page.waitForURL(origin + articlePath, { waitUntil: "domcontentloaded" }),
    page.locator(".article-list .article-title a").first().click({ noWaitAfter: true }),
  ]);
}

// A 1×1 PNG screenshot has no preceding pixels/rows for PNG filter predictors.
function screenshotPixel(png) {
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      assert.equal(data.readUInt32BE(0), 1); assert.equal(data.readUInt32BE(4), 1);
      assert.equal(data[8], 8); assert.ok([2, 6].includes(data[9]));
    }
    if (type === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  return [...inflateSync(Buffer.concat(chunks)).subarray(1, 4)];
}

async function verifyFirstPaint(browser) {
  const css = await readFile("assets/css/page-transitions.css", "utf8");
  const script = await readFile("assets/js/page-transitions.js", "utf8");
  for (const mode of ["parser", "deferred", "script-failure"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: "no-preference" });
    await observe(context);
    await context.addInitScript(() => {
      window.__paintFrames = [];
      window.__probeDomReady = false;
      window.__probeDone = false;
      document.addEventListener("DOMContentLoaded", () => { window.__probeDomReady = true; });
      const sample = timestamp => {
        const article = document.querySelector(".main-article");
        if (article) {
          const curtain = document.querySelector(".dex-entry-curtain");
          const style = curtain && getComputedStyle(curtain);
          const rect = curtain?.getBoundingClientRect();
          window.__paintFrames.push({ timestamp, domReady: window.__probeDomReady,
            curtain: Boolean(curtain), opacity: style?.opacity || "0", background: style?.backgroundColor,
            coversViewport: Boolean(rect && rect.x <= 0 && rect.y <= 0 && rect.right >= innerWidth && rect.bottom >= innerHeight),
            rootChild: curtain?.parentElement === document.documentElement,
            contentOpacity: getComputedStyle(document.querySelector(".article-details")).opacity });
        }
        if (!window.__probeDone) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    let gate;
    let gateStarted;
    const requested = new Promise(resolve => { gateStarted = resolve; });
    const images = [];
    const destination = `${origin}/__dex-paint/${mode}/`;
    const gateURL = `${origin}/__dex-paint/gate.js`;
    let destinationScript = script;
    if (mode === "script-failure") {
      assert.ok(script.includes("  arm();\n"), "Fault injection must occur immediately after the real early arm");
      destinationScript = script.replace("  arm();\n", '  arm();\n  throw new Error("Injected failure after early arm");\n');
    }
    const shell = body => `<html><head><style>${css}</style><script>${script}</script></head><body>${body}</body></html>`;
    const deferred = mode === "deferred" ? `<script defer src="${gateURL}"></script>` : "";
    const blocking = mode === "deferred" ? "" : `<script src="${gateURL}"></script>`;
    const html = `<html><head><style>body{margin:0;background:white;color:red}.article-image{height:180px}.article-details{padding:20px}</style><style>${css}</style><script>${destinationScript}</script>${deferred}</head><body><main><article class="main-article"><div class="article-image"><a href="${destination}"><img src="/__dex-paint/slow-cover.svg" width="400" height="180"></a></div><div class="article-details"><h1 class="article-title"><a href="${destination}"><span data-entry-title>FIRST PAINT MUST NOT FLASH THIS ARTICLE</span></a></h1></div><div class="article-content"><p>Visible content must never precede the initial black frame.</p></div></article></main>${blocking}</body></html>`;
    await context.route(`${origin}/__dex-paint/**`, async route => {
      const url = route.request().url();
      if (url === gateURL) { gate = route; gateStarted(); return; }
      if (url.endsWith("slow-cover.svg")) { images.push(route); return; }
      if (url === destination) return route.fulfill({ contentType: "text/html", body: html });
      return route.fulfill({ contentType: "text/html", body: shell(`<a href="${destination}">Open article</a>`) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${origin}/__dex-paint/source/`);
      await page.locator("a").click({ noWaitAfter: true });
      let gateTimeout;
      try {
        await Promise.race([requested, new Promise((_, reject) => {
          gateTimeout = setTimeout(() => reject(new Error("The first-paint readiness gate was never requested")), 5000);
        })]);
      } finally { clearTimeout(gateTimeout); }
      await page.waitForFunction(() => window.__paintFrames?.length > 0, null, { polling: 1 });
      const first = await page.evaluate(() => window.__paintFrames[0]);
      assert.equal(first.domReady, false, "First-frame evidence must precede DOMContentLoaded");
      assert.equal(first.rootChild, true, "The head must establish its curtain before body parsing");
      assert.equal(first.opacity, "1", "Destination text must be covered on its very first render opportunity");
      assert.equal(first.background, "rgb(8, 9, 9)");
      assert.equal(first.coversViewport, true);
      assert.deepEqual(screenshotPixel(await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 }, animations: "allow" })), [8, 9, 9], "The rendered first-paint probe must actually be black, not merely contain a curtain node");
      // Hold parsing/deferred execution beyond the black phase, while image I/O stays pending.
      await page.waitForFunction(() => window.__paintFrames.some(frame => !frame.domReady && !frame.curtain), null, { timeout: 2200 });
      assert.equal(await page.evaluate(() => window.__entry.calls.length), 0, "No late content animation may begin while readiness is blocked");
      await gate.fulfill({ contentType: "text/javascript", body: "/* Readiness gate released. */" });
      gate = undefined;
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => window.__entry.calls.length), 0, "Late DOM readiness must never restart or re-hide the already visible article");
      assert.equal(await page.locator(".dex-entry-curtain").count(), 0);
      assert.equal(await page.locator(".article-details").evaluate(element => getComputedStyle(element).opacity), "1");
      assert.deepEqual(errors, mode === "script-failure" ? ["Injected failure after early arm"] : []);
      await page.evaluate(() => { window.__probeDone = true; });
      console.log(`PASS first paint ${mode}: black precedes article pixels, slow resources do not prolong it, and late readiness/failure stays visible`);
    } finally {
      if (gate) await gate.abort().catch(() => {});
      await Promise.all(images.map(route => route.abort().catch(() => {})));
      await context.close();
    }
  }
}

let browser;
let firstArticlePath;
try {
  browser = await chromium.launch({ headless: true, channel: "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"], ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  await verifyFirstPaint(browser);
  for (const [width, scheme, motion] of [[1440, "light", "no-preference"], [390, "dark", "no-preference"], [1440, "dark", "reduce"], [390, "light", "reduce"]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: motion });
    await observe(context, { scheme });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/");
    assert.equal(await page.locator("style#dex-page-transitions").count(), 1);
    assert.equal(await page.evaluate(() => window.__entry.calls.length), 0, "Direct entry never animates");
    assert.equal(await page.locator(".dex-entry-curtain").count(), 0);
    const controlId = width < 768 ? "toggle-menu" : "dark-mode-toggle";
    const controlBox = await page.locator(`#${controlId}`).boundingBox();
    assert.ok(controlBox && controlBox.y >= 0 && controlBox.y + controlBox.height <= 900, "The real site control must be on screen");
    const controlPoint = { x: controlBox.x + controlBox.width / 2, y: controlBox.y + controlBox.height / 2 };
    const article = page.locator(".article-list [data-transition-cover] a").first();
    const articlePath = await article.getAttribute("href");
    firstArticlePath ||= articlePath;
    await article.scrollIntoViewIfNeeded();
    await article.locator("img").evaluate(image => image.decode());
    const selectedCover = await article.locator("img").evaluate(image => ({ url: image.currentSrc, width: image.getBoundingClientRect().width, candidate: Number(image.srcset.split(/,\s*/).find(item => new URL(item.split(" ")[0], location.href).href === image.currentSrc)?.split(" ")[1].slice(0, -1)) }));
    assert.match(new URL(selectedCover.url).pathname, /\.webp$/);
    assert.ok(selectedCover.candidate >= selectedCover.width * .95 && selectedCover.candidate <= selectedCover.width * 1.6, `Avoid oversized cover selection: ${JSON.stringify(selectedCover)}`);
    const homeScroll = await page.evaluate(() => scrollY);
    await Promise.all([
      page.waitForURL(origin + articlePath, { waitUntil: "domcontentloaded" }),
      article.click({ noWaitAfter: true }),
    ]);
    if (motion === "no-preference") {
      await page.waitForFunction(() => window.__entryAnimations.some(animation => animation.playState === "running" || animation.pending), null, { polling: 1 });
    }
    // No locator stability wait: send a real click while the entry is playing.
    await page.mouse.click(controlPoint.x, controlPoint.y);
    const entry = await page.evaluate(() => window.__entry);
    const input = entry.inputs.find(event => event.type === "pointerdown" && event.control === controlId);
    assert.ok(input, `Pointer input must hit the real ${controlId}, not a snapshot or overlay: ${JSON.stringify(entry.inputs)}`);
    if (motion === "no-preference") {
      assert.ok(input.active > 0, "The real pointer click must occur during actual playback");
      assert.ok(input.curtain, "The real pointer must pass through the curtain while entry is active");
      assert.equal(input.curtain.pointerEvents, "none");
      assert.equal(input.curtain.position, "fixed");
      assert.equal(input.curtain.ariaHidden, "true");
      assert.equal(input.curtain.animationName, "dex-entry-blackout");
      assert.equal(input.curtain.duration, "0.68s");
      assert.equal(input.curtain.fill, "none");
      assert.ok(Number(input.curtain.opacity) > 0, "Input must pass through a currently visible curtain");
      assertArticleTimeline(entry.calls);
      assert.ok(entry.calls.filter(call => !call.curtain).length > 0 && entry.calls.filter(call => !call.curtain).length <= 5, "Animate only a bounded set of visible content elements");
      for (const call of entry.calls) {
        assert.equal(call.broadCapture, false, "Never animate the root, main container or whole article");
        assert.equal(call.visible, true);
        assert.equal(call.imageLoaded, true, "Unloaded images cannot gate or participate in entry");
        if (call.interactive && call.properties.includes("transform")) {
          assert.ok(call.tag === "IMG" || call.titlePixels, "Move only inner image/title pixels, never an interactive container");
          assert.equal(call.controlTransform, "none", "The interactive ancestor must keep a stationary hit box");
          if (call.titlePixels) assert.equal(call.clippedTitle, true, "Title pixels reveal inside their clipped anchor");
        }
        assert.equal(Boolean(call.pseudo), false, "Animate the real element, not a pseudo overlay");
        assert.ok(call.duration >= 0 && call.duration + call.delay <= 1400, `Entry must remain finite and bounded: ${JSON.stringify(call)}`);
        assert.equal(call.iterations, 1);
        assert.equal(call.fill, "backwards", "Finite delays may fill backwards, never retain final animation state");
        assert.ok(call.properties.every(property => ["offset", "computedOffset", "easing", "composite", "opacity", "transform"].includes(property)), "Only compositor-friendly transform/opacity properties animate");
      }
    } else {
      assert.equal(entry.calls.length, 0, "Reduced motion creates no entry animations");
      assert.equal(await page.locator(".dex-entry-curtain").count(), 0, "Reduced motion has no curtain");
    }
    await finished(page);
    if (motion === "no-preference") assert.equal(await page.evaluate(() => window.__entry.calls.some(call => call.state === "cancelled")), true, "Real input cancels ongoing decoration");
    assert.equal(await page.locator(".dex-entry-curtain").count(), 0, "Input removes the decorative curtain");
    assert.equal(await page.evaluate(() => window.__entryAnimations.filter(animation => !animation.effect.target.matches(".dex-entry-curtain")).every(animation => getComputedStyle(animation.effect.target).opacity === "1")), true, "Cancellation leaves real content fully visible");
    if (width < 768) {
      assert.equal(await page.locator("#toggle-menu").getAttribute("aria-expanded"), "true");
      await page.locator("#toggle-menu").click();
    } else {
      assert.equal(await page.locator("html").getAttribute("data-scheme"), scheme === "light" ? "dark" : "light");
      await page.locator("#dark-mode-toggle").click();
    }
    await assertNoNative(page);
    const hero = page.locator(".main-article [data-transition-cover] img");
    await hero.evaluate(image => image.decode());
    assert.equal(await hero.evaluate(image => image.currentSrc), selectedCover.url, "Homepage/article must select the same cacheable cover URL");
    assert.equal(await page.locator("html").getAttribute("data-scheme"), scheme);
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.evaluate(() => scrollY < 5), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".main-article .article-title").evaluate(element => getComputedStyle(element).opacity), "1", "Cancellation cannot leave the heading transparent");
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `article-${width}-${scheme}-${motion}.png`) });

    await page.evaluate(() => scrollTo(0, Math.min(2500, document.documentElement.scrollHeight - innerHeight)));
    const articleScroll = await page.evaluate(() => scrollY);
    const entryCount = await page.evaluate(() => window.__entry.calls.length);
    await page.goBack({ waitUntil: "commit" });
    await page.waitForURL(origin + "/", { waitUntil: "commit" });
    await page.waitForFunction(expected => Math.abs(scrollY - expected) < 5, homeScroll);
    assert.equal(await page.evaluate(() => window.__entry.calls.length), 0, "Back does not animate the restored homepage");
    await page.goForward({ waitUntil: "commit" });
    await page.waitForURL(origin + articlePath, { waitUntil: "commit" });
    await page.waitForFunction(expected => Math.abs(scrollY - expected) < 5, articleScroll);
    assert.ok(await page.evaluate(count => window.__entry.calls.length <= count, entryCount), "Forward must not replay entry on a cached document");
    await finished(page);
    await assertNoNative(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.evaluate(() => window.__entry.calls.length), 0, "Reload cannot replay a consumed marker");

    const anchor = page.locator('a[href^="#"]').filter({ visible: true }).first();
    if (await anchor.count()) {
      const reveals = await page.evaluate(() => window.__entry.reveals);
      const fragment = await anchor.getAttribute("href");
      await anchor.click();
      await page.waitForURL(url => url.hash === fragment, { waitUntil: "commit" });
      assert.equal(await page.evaluate(() => window.__entry.reveals), reveals);
      assert.equal(await page.evaluate(() => window.__entry.calls.length), 0);
      await page.goBack({ waitUntil: "commit" });
    }

    await page.goto(origin + "/");
    if (width < 768) await page.locator("#toggle-menu").click();
    await page.locator('#main-menu a[href="/archives/"]').first().focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(origin + "/archives/");
    assert.equal(await page.locator("main").isVisible(), true);
    await assertNoNative(page);

    await page.goto(origin + "/");
    await page.locator("#research-home-query").fill("space");
    await page.locator("#research-home-query").press("Enter");
    await page.waitForURL(url => url.pathname === "/search/" && url.searchParams.get("keyword") === "space");
    assert.equal(await page.locator('input[name="keyword"]').inputValue(), "space");
    await assertNoNative(page);

    await page.goto(origin + "/");
    const popupPromise = context.waitForEvent("page");
    await page.locator(".article-list .article-title a").first().click({ modifiers: ["Control"] });
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(new URL(popup.url()).pathname, articlePath);
    assert.equal(page.url(), origin + "/");
    assert.equal(await popup.evaluate(() => window.__entry.calls.length), 0, "New tabs do not inherit an entry marker");
    await popup.close();
    await page.evaluate(() => {
      const download = document.createElement("a");
      Object.assign(download, { href: "/data/industries.csv", download: "industries.csv", id: "test-native-download", textContent: "Download test fixture" });
      document.querySelector("main").prepend(download);
    });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#test-native-download").click();
    assert.equal((await downloadPromise).suggestedFilename(), "industries.csv");
    assert.equal(page.url(), origin + "/");

    for (const path of ["/evidence-library/", "/industries/", "/industry-breakdowns/", "/about/"]) {
      await page.goto(origin + "/");
      const link = page.locator(`a[href="${path}"]`).filter({ visible: true }).first();
      if (await link.count()) await link.click();
      else await page.goto(origin + path);
      await page.waitForURL(origin + path);
      assert.equal(await page.locator("main").isVisible(), true);
      if (path === "/evidence-library/") await page.waitForSelector('[data-enhanced="true"]');
      if (path === "/industries/") assert.equal(await page.locator("#industry-explorer").count(), 1);
      const pageEntry = await page.evaluate(() => ({ article: Boolean(document.querySelector(".main-article")), calls: window.__entry.calls }));
      if (pageEntry.calls.length) {
        if (pageEntry.article) assertArticleTimeline(pageEntry.calls);
        else for (const call of pageEntry.calls) {
          assert.equal(call.animationId, "dex-content-enter");
          assert.equal(call.delay, 560, "Generic pages reveal after the black hold");
          assert.equal(call.duration, 420);
          assert.equal(call.fill, "backwards");
        }
      }
      await assertNoNative(page);
    }

    // Retain the native overlapping-navigation regression; live input is tested above.
    await page.goto(origin + "/");
    const nextPath = await page.locator(".article-list .article-title a").nth(1).getAttribute("href");
    await page.evaluate(() => {
      const articles = document.querySelectorAll(".article-list .article-title a");
      articles[0].click(); articles[1].click();
    });
    await page.waitForFunction(path => location.pathname === path && document.querySelector("main h1"), nextPath);
    await finished(page);
    await assertNoNative(page);
    await page.evaluate(() => {
      const first = document.createElement("a"); first.href = "/archives/";
      const last = document.createElement("a"); last.href = "/evidence-library/";
      document.body.append(first, last); first.click(); last.click();
    });
    await page.waitForFunction(() => location.pathname === "/evidence-library/" && document.querySelector('[data-enhanced="true"]'));
    assert.equal(page.url(), origin + "/evidence-library/");
    await assertNoNative(page);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px ${scheme} ${motion}: real input during bounded element playback, no native snapshots, history/scroll, keyboard, anchors, forms, new tabs, downloads and rapid navigation`);
    await context.close();
  }

  // Click the fixed title anchor while its inner pixels are still revealing.
  const revealContext = await browser.newContext({ viewport: { width: 1440, height: 1200 }, reducedMotion: "no-preference" });
  await observe(revealContext, { measurePerformance: true });
  const revealPage = await revealContext.newPage();
  const revealErrors = [];
  revealPage.on("pageerror", error => revealErrors.push(error.message));
  await revealPage.goto(origin + firstArticlePath);
  await revealPage.locator(".main-article [data-transition-cover] img").evaluate(image => image.decode());
  const titleBox = await revealPage.locator(".main-article .article-title a").boundingBox();
  assert.ok(titleBox && titleBox.y >= 0 && titleBox.y + titleBox.height <= 1200, "Title link must be in the test viewport");
  await revealPage.goto(origin + "/");
  await internalArticle(revealPage, firstArticlePath);
  await revealPage.waitForFunction(() => window.__entryAnimations.some(animation =>
    animation.id === "dex-content-enter" && animation.effect.target.matches("[data-entry-title]") &&
    animation.currentTime >= 920 && animation.currentTime < 1340 && animation.playState === "running"), null, { polling: 1 });
  await Promise.all([
    revealPage.waitForNavigation({ waitUntil: "domcontentloaded" }),
    revealPage.mouse.click(titleBox.x + Math.min(12, titleBox.width / 2), titleBox.y + Math.min(6, titleBox.height / 2)),
  ]);
  const titleInput = await revealPage.evaluate(() => JSON.parse(sessionStorage.getItem("dex-test-last-input")));
  assert.equal(titleInput.type, "pointerdown");
  assert.equal(titleInput.titleLink, true, "The clipped title anchor must receive the first real click");
  assert.ok(titleInput.active > 0 && titleInput.activeIds.includes("dex-content-enter"));
  assert.equal(titleInput.curtain, null, "The curtain must already be gone during the body phase");
  assert.equal(titleInput.href, origin + firstArticlePath);
  for (const property of ["x", "y", "width", "height"]) {
    assert.ok(Math.abs(titleInput.anchorBefore[property] - titleInput.anchorAfter[property]) < .5, `Cancellation must preserve the title anchor ${property}`);
  }
  assert.equal(revealPage.url(), origin + firstArticlePath);
  assert.equal(await revealPage.evaluate(() => window.__entry.calls.length), 0, "Same-page native title navigation cannot replay entry");
  await assertNoNative(revealPage);

  // Let a complete sequence finish without input, including curtain disposal.
  await revealPage.goto(origin + "/");
  await internalArticle(revealPage, firstArticlePath);
  assertArticleTimeline(await revealPage.evaluate(() => window.__entry.calls));
  await finished(revealPage);
  assert.equal(await revealPage.evaluate(() => window.__entry.calls.every(call => call.state === "finished")), true, "The finite choreography must complete naturally");
  assert.equal(await revealPage.locator(".dex-entry-curtain").count(), 0, "Natural completion removes its decorative layer");
  assert.equal(await revealPage.locator(".main-article .article-details").evaluate(element => getComputedStyle(element).opacity), "1");
  await revealPage.waitForFunction(() => window.__entry.performance?.complete, null, { timeout: 2200 });
  const performanceMetrics = await revealPage.evaluate(() => window.__entry.performance);
  assert.ok(performanceMetrics.frames > 1, "Browser frames must continue throughout uninterrupted playback");
  console.log("OBSERVE uninterrupted entry performance", JSON.stringify({
    frames: performanceMetrics.frames,
    observedMs: Math.round(performanceMetrics.endedAt - performanceMetrics.startedAt),
    maxRafGapMs: Number(performanceMetrics.maxRafGapMs.toFixed(2)),
    longTaskSupported: performanceMetrics.longTaskSupported,
    longTaskCount: performanceMetrics.longTasks.length,
    totalLongTaskMs: Number(performanceMetrics.longTasks.reduce((total, task) => total + task.duration, 0).toFixed(2)),
    maxLongTaskMs: Number(Math.max(0, ...performanceMetrics.longTasks.map(task => task.duration)).toFixed(2)),
  }));
  assert.deepEqual(revealErrors, []);
  console.log("PASS title reveal: first real link click works with a stationary anchor; uninterrupted choreography finishes and removes the curtain");
  await revealContext.close();

  // Fresh high-density contexts: cached larger candidates cannot skew selection.
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(origin + firstArticlePath);
    const image = page.locator(".main-article [data-transition-cover] img");
    await image.evaluate(image => image.decode());
    const chosen = await image.evaluate(image => ({ url: image.currentSrc, srcset: image.srcset, width: image.getBoundingClientRect().width }));
    assert.match(new URL(chosen.url).pathname, /\.webp$/);
    const descriptor = Number(chosen.srcset.split(/,\s*/).find(item => new URL(item.split(" ")[0], origin).href === chosen.url).split(" ")[1].slice(0, -1));
    assert.ok(descriptor <= 1600 && descriptor <= chosen.width * 2.5);
    assert.ok(descriptor >= Math.min(chosen.width * 1.9, 1376));
    console.log(`PASS ${width}px 2x no JS: optimized cover candidate ${descriptor}px`);
    await context.close();
  }

  for (const mode of ["slow", "missing"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    await observe(context);
    const pending = new Set();
    await context.route("**/*", async route => {
      if (route.request().resourceType() !== "image" || !new URL(route.request().url()).pathname.startsWith(firstArticlePath)) return route.fallback();
      if (mode === "missing") return route.abort("failed");
      pending.add(route); // Deliberately unresolved until after the interactivity assertions.
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
      await internalArticle(page, firstArticlePath);
      assert.equal(await page.locator(".main-article [data-transition-cover] img").evaluate(image => image.complete && image.naturalWidth > 0), false);
      assert.equal(await page.locator("main h1").isVisible(), true, "A pending/failed image cannot hide article content");
      assert.equal(await page.evaluate(() => window.__entry.calls.some(call => call.tag === "IMG")), false, "Skip image animation rather than awaiting it");
      assertArticleTimeline(await page.evaluate(() => window.__entry.calls));
      await page.locator("#dark-mode-toggle").click();
      assert.equal(await page.locator("html").getAttribute("data-scheme"), "dark");
      await Promise.all([
        page.waitForURL(origin + "/archives/", { waitUntil: "domcontentloaded" }),
        page.locator('#main-menu a[href="/archives/"]').first().click({ noWaitAfter: true }),
      ]);
      assert.equal(await page.locator("main").isVisible(), true);
      await assertNoNative(page);
      assert.deepEqual(errors, []);
      console.log(`PASS ${mode} cover: content, real theme control and native link remain usable before image completion`);
    } finally {
      await Promise.all([...pending].map(route => route.abort().catch(() => {})));
      await context.close();
    }
  }

  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 }, reducedMotion: "no-preference" });
  await noJS.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  const page = await noJS.newPage();
  await page.goto(origin + "/");
  const link = page.locator(".article-list .article-title a").first();
  const path = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(origin + path);
  assert.equal(await page.locator("main h1").isVisible(), true);
  await page.goBack({ waitUntil: "commit" });
  await page.waitForURL(origin + "/", { waitUntil: "commit" });
  assert.equal(await page.locator("main").isVisible(), true);
  console.log("PASS no JavaScript: article navigation and Back remain visible and native");
  await noJS.close();

  const fallback = await browser.newContext();
  await observe(fallback, { animationAvailable: false });
  const plain = await fallback.newPage();
  await plain.goto(origin + "/");
  await internalArticle(plain, firstArticlePath);
  assert.equal(await plain.locator("main h1").isVisible(), true);
  assert.equal(await plain.evaluate(() => window.__entry.calls.length), 0);
  assert.equal(await plain.locator(".dex-entry-curtain").count(), 0, "Unavailable animation cannot leave a curtain");
  await plain.locator("#dark-mode-toggle").click();
  assert.equal(await plain.locator("html").getAttribute("data-scheme"), "dark");
  await assertNoNative(plain);
  console.log("PASS Web Animations unavailable: content, native navigation and controls remain usable");
  await fallback.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
