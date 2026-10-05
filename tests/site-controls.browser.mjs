import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve("public");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png" };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const path = resolve(root, "." + pathname);
    if (!path.startsWith(root + sep)) throw new Error("Invalid path");
    response.setHeader("Content-Type", mime[extname(path)] || "application/octet-stream");
    response.end(await readFile(path));
  } catch { response.statusCode = 404; response.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      localStorage.setItem("StackColorScheme", "auto");
      // Exercise Chromium's CSS-hide-before-media-callback order on every platform.
      window.matchMedia("(min-width: 768px)").addEventListener("change", event => {
        const menu = document.getElementById("main-menu");
        const active = document.activeElement;
        if (!event.matches && menu?.contains(active) && menu.getClientRects().length === 0) active.blur();
      });
    });
    let submissions = 0;
    let scenario = "delayed-rejection";
    let pendingRoute;
    let requestStarted;
    const started = new Promise(resolve => { requestStarted = resolve; });
    // Contact POSTs are always fulfilled or aborted locally; no message reaches the service.
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname === "api.web3forms.com" && url.pathname === "/submit") {
        submissions++;
        if (scenario === "delayed-rejection") { pendingRoute = route; requestStarted(); return; }
        if (scenario === "network-error") return route.abort("failed");
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ success: true }) });
      }
      if (route.request().method() === "POST" && url.hostname !== "127.0.0.1") return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/contact/`, { waitUntil: "load" });
    const menuToggle = page.locator("#toggle-menu");
    await page.waitForFunction(() => document.getElementById("toggle-menu")?.dataset.menuEnhanced === "true");
    assert.equal(await menuToggle.getAttribute("aria-controls"), "main-menu");
    assert.equal(await menuToggle.getAttribute("aria-expanded"), width < 768 ? "false" : "true");
    if (width < 768) {
      await menuToggle.focus();
      await page.keyboard.press("Enter");
      assert.equal(await menuToggle.getAttribute("aria-expanded"), "true");
      await page.locator("#main-menu a").first().focus();
      await page.keyboard.press("Escape");
      assert.equal(await menuToggle.getAttribute("aria-expanded"), "false");
      assert.equal(await menuToggle.evaluate(element => element === document.activeElement), true);
      await page.keyboard.press("Space");
    }

    const themeToggle = page.locator("button#dark-mode-toggle");
    const menuScroller = page.locator('#main-menu');
    const assertMenuScrollbar = async () => {
      const style = await menuScroller.evaluate(element => {
        const css = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        return { width: css.scrollbarWidth, color: css.scrollbarColor, accent: root.getPropertyValue('--accent-color').trim(), overflow: css.overflowY };
      });
      assert.equal(style.width, 'thin');
      assert.notEqual(style.color, 'auto');
      assert.equal(style.overflow, 'auto', 'Keep the native draggable scroller');
      return style.color;
    };
    const lightScrollbar = await assertMenuScrollbar();
    const assertAvatar = async dark => {
      assert.equal(await page.locator(".site-logo-dark").isVisible(), dark);
      assert.equal(await page.locator(".site-logo-light").isVisible(), !dark);
      const avatar = page.locator(dark ? ".site-logo-dark" : ".site-logo-light");
      assert.equal(await avatar.evaluate(image => image.complete && image.naturalWidth > 0), true);
    };
    await themeToggle.focus();
    assert.equal(await themeToggle.getAttribute("aria-pressed"), "false");
    await assertAvatar(false);
    await page.keyboard.press("Space");
    assert.equal(await themeToggle.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("html").getAttribute("data-scheme"), "dark");
    await assertAvatar(true);
    assert.notEqual(await assertMenuScrollbar(), lightScrollbar, 'Scrollbar follows the black/gold theme');
    await page.keyboard.press("Enter");
    assert.equal(await themeToggle.getAttribute("aria-pressed"), "false");
    await assertAvatar(false);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() => document.getElementById("dark-mode-toggle").getAttribute("aria-pressed") === "true");
    assert.equal(await page.locator("html").getAttribute("data-scheme"), "dark");
    await assertAvatar(true);
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.getElementById("dark-mode-toggle").getAttribute("aria-pressed") === "false");
    await assertAvatar(false);
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await menuScroller.evaluate(element => getComputedStyle(element).scrollbarColor), 'auto');
    assert.equal(await menuScroller.evaluate(element => getComputedStyle(element).scrollbarWidth), 'auto');
    await page.emulateMedia({ forcedColors: 'none' });

    if (width < 768) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.getElementById("toggle-menu").getAttribute("aria-expanded") === "true");
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.getElementById("toggle-menu").getAttribute("aria-expanded") === "false");
      assert.equal(await menuToggle.evaluate(element => element === document.activeElement), true);

      // A previous menu focus must not steal focus back from a reader typing a message.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.getElementById("toggle-menu").getAttribute("aria-expanded") === "true");
      await themeToggle.focus();
      const message = page.getByLabel("Message", { exact: true });
      await message.fill("Keep this draft focused during a resize.");
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.getElementById("toggle-menu").getAttribute("aria-expanded") === "false");
      assert.equal(await message.evaluate(element => element === document.activeElement), true, "Closing the menu at a breakpoint must not steal form focus");
      assert.equal(await message.inputValue(), "Keep this draft focused during a resize.");
    }

    const form = page.locator("#contact-form");
    const formAction = new URL(await form.getAttribute("action"));
    assert.equal(formAction.hostname, "api.web3forms.com");
    assert.equal(formAction.pathname, "/submit");
    const status = page.locator("#form-status");
    assert.equal(await status.getAttribute("role"), "status");
    assert.equal(await status.getAttribute("aria-live"), "polite");
    await page.getByLabel("Name", { exact: true }).fill("Browser fixture");
    await form.getByLabel("Email", { exact: true }).fill("test@example.invalid");
    await page.getByLabel("Message", { exact: true }).fill("This message is intercepted locally.");
    const submit = form.locator('button[type="submit"]');
    const assertDraftAndButton = async () => {
      assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Browser fixture");
      assert.equal(await form.getByLabel("Email", { exact: true }).inputValue(), "test@example.invalid");
      assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "This message is intercepted locally.");
      assert.equal(await submit.isEnabled(), true);
      assert.equal((await submit.textContent()).trim(), "Send Message");
      assert.equal(await form.getAttribute("aria-busy"), "false");
    };
    await submit.click();
    let startTimeout;
    try {
      await Promise.race([started, new Promise((_, reject) => { startTimeout = setTimeout(() => reject(new Error("The mocked submission never started")), 10000); })]);
    } finally { clearTimeout(startTimeout); }
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await form.getAttribute("aria-busy"), "true");
    await form.evaluate(element => { element.requestSubmit(); element.requestSubmit(); });
    await page.waitForTimeout(100);
    assert.equal(submissions, 1, "A pending request must not be sent twice");
    await pendingRoute.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ success: false, message: "Fixture rejection" }) });
    await page.waitForFunction(() => document.getElementById("form-status").dataset.state === "rejected");
    assert.match(await status.textContent(), /Fixture rejection/);
    await assertDraftAndButton();

    scenario = "network-error";
    await submit.click();
    await page.waitForFunction(() => document.getElementById("form-status").dataset.state === "error");
    assert.match(await status.textContent(), /could not confirm delivery/i);
    await assertDraftAndButton();

    scenario = "success";
    await submit.click();
    await page.waitForFunction(() => document.getElementById("form-status").dataset.state === "success");
    assert.equal(await page.getByLabel("Message", { exact: true }).inputValue(), "");
    assert.equal(await submit.isEnabled(), true);
    assert.equal(await form.getAttribute("aria-busy"), "false");
    assert.equal(submissions, 3);
    console.log(`PASS ${width}px: theme keyboard/avatar/system state, menu controls, and mocked delayed/rejected/network/success contact requests`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
