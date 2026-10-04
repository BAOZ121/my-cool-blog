import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../assets/css/page-transitions.css", import.meta.url), "utf8");
const partial = readFileSync(new URL("../layouts/_partials/page-transitions/assets.html", import.meta.url), "utf8");
const head = readFileSync(new URL("../layouts/_partials/head/custom.html", import.meta.url), "utf8");

test("all HTML pages get a small inline CSS-only progressive enhancement", () => {
  assert.match(head, /partial "page-transitions\/assets.html"/);
  assert.match(partial, /resources.Get "css\/page-transitions.css" \| minify/);
  assert.match(partial, /<style id="dex-page-transitions">/);
  assert.match(partial, /\$style.Content \| safeCSS/);
  assert.doesNotMatch(partial, /<script|<link|preload|expect|blocking=/);
});

test("motion is opt-in and reduced motion disables the native transition", () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation: auto;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*@view-transition\s*\{\s*navigation: none;/);
  assert.doesNotMatch(css, /animation-delay|visibility: hidden|opacity: 0/);
  assert.match(css, /::view-transition\s*\{\s*pointer-events: none;/);
});

test("viewport snapshots fade without morphing long content or offscreen covers", () => {
  assert.match(css, /::view-transition-group\(root\)\s*\{\s*animation: none;/);
  assert.doesNotMatch(css, /view-transition-name:\s*(none|dex-content|dex-cover)/);
  assert.match(css, /animation-duration: 180ms;/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) and \(min-width: 768px\)/);
  assert.match(css, /\.left-sidebar\s*\{\s*view-transition-name: dex-navigation;/);
});
