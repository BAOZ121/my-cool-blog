import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const css = readFileSync(new URL("../assets/css/page-transitions.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../assets/js/page-transitions.js", import.meta.url), "utf8");
const partial = readFileSync(new URL("../layouts/_partials/page-transitions/assets.html", import.meta.url), "utf8");
const head = readFileSync(new URL("../layouts/_partials/head/custom.html", import.meta.url), "utf8");

test("shared head registers native customization before first paint without extra requests", () => {
  assert.match(head, /partial "page-transitions\/assets.html"/);
  assert.match(partial, /resources.Get "css\/page-transitions.css" \| minify/);
  assert.match(partial, /resources.Get "js\/page-transitions.js" \| minify/);
  assert.match(partial, /<style id="dex-page-transitions">/);
  assert.match(partial, /<script id="dex-page-transition-script">/);
  assert.doesNotMatch(partial, /<link|preload|expect|blocking=|async|defer|type="module"/);
  assert.doesNotMatch(script, /preventDefault|pushState|replaceState|fetch\(|setTimeout|scrollTo|location\s*=/);
});

test("reduced motion opts out completely and only native snapshots animate", () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation: auto;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*@view-transition\s*\{\s*navigation: none;/);
  assert.match(css, /::view-transition-group\(root\)\s*\{\s*animation: none;/);
  assert.match(css, /animation: dex-article-rise 240ms.*320ms both;/);
  assert.match(css, /::view-transition\s*\{\s*pointer-events: none;/);
  assert.doesNotMatch(css, /visibility: hidden|\.main[^\{]*\{[^}]*opacity: 0/);
  assert.doesNotMatch(css, /view-transition-name:\s*dex-cover/);
});

function fixture({ reduced = false, storageFails = false, visible = true, loaded = true, current = "https://dex.test/", incoming = false } = {}) {
  const listeners = {};
  const data = new Map();
  const root = { dataset: {}, removeAttribute() { delete this.dataset.dexTransition; } };
  const image = { complete: loaded, naturalWidth: loaded ? 1200 : 0 };
  const cover = { style: { removeProperty() { delete this.viewTransitionName; } }, querySelector: () => image,
    getBoundingClientRect: () => ({ width: 600, height: 300, top: visible ? 100 : -100, left: 0, bottom: 400, right: 600 }) };
  const header = { dataset: { articleUrl: "/post/example/" }, querySelector: () => cover, closest: () => incoming ? {} : null };
  const link = { href: "https://dex.test/post/example/", target: "", hasAttribute: () => false, closest: () => header };
  const motion = { matches: reduced, addEventListener: (_, handler) => { listeners.motion = handler; } };
  const window = { navigation: { activation: { navigationType: "push", from: { url: "https://dex.test/" }, entry: { url: "https://dex.test/post/example/" } } },
    addEventListener: (type, handler) => { listeners[type] = handler; } };
  const document = { documentElement: root, querySelector: () => incoming ? cover : null,
    addEventListener: (type, handler) => { listeners[type] = handler; } };
  runInNewContext(script, { window, document, location: new URL(current), URL, Date, innerWidth: 1000, innerHeight: 900,
    matchMedia: () => motion, sessionStorage: { getItem: key => data.get(key) || null, setItem(key, value) { if (storageFails) throw Error("disabled"); data.set(key, value); }, removeItem: key => data.delete(key) } });
  const click = overrides => listeners.click({ defaultPrevented: false, button: 0, target: { closest: () => link }, ...overrides });
  return { listeners, root, cover, link, data, click, window };
}
function transition() {
  let ready, finish;
  return { ready: new Promise(resolve => { ready = resolve; }), finished: new Promise(resolve => { finish = resolve; }),
    start: () => ready(), finish: () => finish(), skipped: false, skipTransition() { this.skipped = true; } };
}
const swap = (f, t, type = "push", to = "https://dex.test/post/example/") => f.listeners.pageswap({ viewTransition: t, activation: { navigationType: type, entry: { url: to } } });

test("only a visible loaded forward-click cover is temporarily named", async () => {
  const f = fixture(); const t = transition(); f.click(); swap(f, t);
  assert.equal(f.cover.style.viewTransitionName, "dex-cover");
  assert.equal(f.root.dataset.dexTransition, "article");
  assert.ok(f.data.has("dex:article-transition"));
  t.finish(); await Promise.resolve();
  assert.equal(f.cover.style.viewTransitionName, undefined);
  assert.equal(f.root.dataset.dexTransition, undefined);
  assert.ok(f.data.has("dex:article-transition"), "Outgoing cleanup must leave the incoming marker intact");
});

test("modifiers, cancelled clicks, new tabs, downloads, offscreen images and Back stay native", () => {
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }, { button: 1 }]) {
    const f = fixture(); f.click(overrides); swap(f, transition()); assert.equal(f.data.size, 0);
  }
  for (const options of [{ reduced: true }, { storageFails: true }, { visible: false }, { loaded: false }]) {
    const f = fixture(options); f.click(); swap(f, transition()); assert.equal(f.cover.style.viewTransitionName, undefined);
  }
  for (const alter of [f => { f.link.target = "_blank"; }, f => { f.link.hasAttribute = () => true; }, f => { f.link.href += "#chapter"; }, f => { f.link.href += "?x=1"; }, f => { f.link.href = "https://other.test/post/example/"; }]) {
    const f = fixture(); alter(f); f.click(); swap(f, transition()); assert.equal(f.data.size, 0);
  }
  const f = fixture(); f.click(); swap(f, transition(), "traverse"); assert.equal(f.data.size, 0);
});

test("incoming marker is consumed, name released at ready, and state cleared at finish", async () => {
  const f = fixture({ incoming: true, current: "https://dex.test/post/example/" }); const t = transition();
  f.data.set("dex:article-transition", JSON.stringify({ from: "https://dex.test/", to: "https://dex.test/post/example/", time: Date.now() }));
  f.listeners.pagereveal({ viewTransition: t });
  assert.equal(f.cover.style.viewTransitionName, "dex-cover"); assert.equal(f.data.size, 0);
  t.start(); await Promise.resolve();
  assert.equal(f.cover.style.viewTransitionName, undefined); assert.equal(f.root.dataset.dexTransition, "article");
  t.finish(); await Promise.resolve(); assert.equal(f.root.dataset.dexTransition, undefined);
});

test("stale markers, reloads, missing images and competing completion cannot animate stale covers", async () => {
  for (const change of [f => { f.window.navigation.activation.navigationType = "reload"; }, f => { f.window.navigation.activation.from.url = "https://dex.test/other/"; }, f => { f.window.navigation.activation.entry.url = "https://dex.test/other/"; }]) {
    const f = fixture({ incoming: true, current: "https://dex.test/post/example/" });
    f.data.set("dex:article-transition", JSON.stringify({ from: "https://dex.test/", to: "https://dex.test/post/example/", time: Date.now() })); change(f);
    f.listeners.pagereveal({ viewTransition: transition() }); assert.equal(f.cover.style.viewTransitionName, undefined); assert.equal(f.data.size, 0);
  }
  for (const time of [Date.now() - 30000, Date.now() + 30000, null, "invalid"]) {
    const stale = fixture({ incoming: true, current: "https://dex.test/post/example/" });
    stale.data.set("dex:article-transition", JSON.stringify({ from: "https://dex.test/", to: "https://dex.test/post/example/", time }));
    stale.listeners.pagereveal({ viewTransition: transition() });
    assert.equal(stale.cover.style.viewTransitionName, undefined); assert.equal(stale.data.size, 0);
  }
  const missing = fixture({ incoming: true, loaded: false, current: "https://dex.test/post/example/" }); const skipped = transition();
  missing.data.set("dex:article-transition", JSON.stringify({ from: "https://dex.test/", to: "https://dex.test/post/example/", time: Date.now() }));
  missing.listeners.pagereveal({ viewTransition: skipped });
  assert.equal(skipped.skipped, true); assert.equal(missing.cover.style.viewTransitionName, undefined);
  const f = fixture(); const first = transition(); const second = transition();
  f.click(); swap(f, first); f.click(); swap(f, second); first.finish(); await Promise.resolve();
  assert.equal(f.cover.style.viewTransitionName, "dex-cover", "Superseded cleanup cannot erase the new capture");
  second.finish(); await Promise.resolve(); assert.equal(f.cover.style.viewTransitionName, undefined);
});
