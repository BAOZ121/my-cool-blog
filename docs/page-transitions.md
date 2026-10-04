# Page transitions

DEX remains a server-rendered Hugo multi-page site. Shared minified CSS and a
small classic head script progressively customize native View Transitions.
Neither the script nor the animation delays or replaces a navigation.

## Article entry

An ordinary click or Enter activation on an article card's cover/title can pair
its fully visible, loaded cover with the article hero. The cover grows into its
new position for 320 ms; then the remaining viewport rises 28 px and fades in
for 240 ms. Desktop navigation stays steady. This sequence uses only native
snapshots, never an overlay DOM element or a hidden real article.

The script observes clicks without cancelling them. A cover is named just in
time at `pageswap`, only for a forward push to the exact article URL. A small,
short-lived session marker is checked and consumed at `pagereveal`; the exact
source, destination and activation type must match. Names are released after
capture, with generation-guarded cleanup for interrupted navigation and BFCache.
No cover is permanently named, so Back cannot pull an offscreen image across
the reader's restored viewport. Long document-height content is never morphed.

## Fallbacks

Other internal links, history traversal, offscreen covers, unavailable storage
and browsers missing the required navigation activation API use the original
180 ms viewport fade when native View Transitions are supported. A late or
missing destination image skips the animation instead of holding first paint.
Direct loads and reloads do not replay entry markers. Reduced-motion readers
opt out of all transition animation. Unsupported browsers navigate normally;
with JavaScript off, links still work and native CSS fading remains optional.

There is no router, fetch replacement, `preventDefault`, history mutation,
pre-navigation delay, prefetch, persistent overlay or scroll/focus manipulation.
Modifier/new-tab clicks, external links, downloads, hash links, forms, metadata,
analytics and each page's script initialization keep their native behavior.

## Verification

```sh
node --test tests/page-transitions.test.mjs
hugo --environment production --minify --panicOnWarning
node tests/page-transitions.browser.mjs
```

Unit tests exercise click eligibility, storage denial, reduced motion, temporary
names and interrupted cleanup. Browser tests require an actual native
transition and actual cover/content CSS animations with the intended sequence;
they also cover desktop/mobile, light/dark, reduced motion, Back/Forward scroll,
reload, keyboard anchors, new tabs, rapid article selection, search, per-page
initialization, no JavaScript and absent CSS. Existing suites cover contact,
article graphics/zoom, industry pages and the Evidence Library.

Set `CHROME_PATH` for an installed Chromium. `TRANSITION_SCREENSHOT_DIR` optionally
saves review screenshots. No contact data is submitted by these tests.

## Platform references

- [MDN: @view-transition](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@view-transition)
- [Chrome: cross-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)

Cross-document transitions and Navigation activation have different browser
support. Keep the basic fade or normal navigation on older browsers; do not add
a client router or rendering wait just to make the richer effect universal.
