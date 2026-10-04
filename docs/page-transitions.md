# Page transitions

DEX remains a server-rendered Hugo multi-page site. A shared, fingerprinted CSS
asset opts same-origin document navigations into the browser's View Transition
API. The viewport cross-fades for 180 ms; desktop navigation is captured
separately so it stays visually steady. Mobile headers participate in the fade.

There is no navigation JavaScript, router, fetch replacement, click interception,
pre-navigation delay, prefetch, persistent overlay, or state to clean up. Native
links, modifier/new-tab clicks, downloads, anchors, forms, focus, back/forward,
scroll restoration, per-page initialization, metadata and analytics are unchanged.
Readers requesting reduced motion opt out completely. Unsupported browsers
ignore the enhancement and navigate normally, including with JavaScript off.

## Why viewport snapshots

Long reports and Back navigation must retain the reader's viewport. Morphing a
document-height main element can stretch or reposition text. Permanently naming
all article covers can also pull an offscreen cover across the screen on Back.
This implementation deliberately uses a restrained viewport fade instead.
The browser skips the effect itself if a navigation cannot be animated; page
visibility never depends on a script or animation completing.

## Verification

```sh
node --test tests/page-transitions.test.mjs
hugo --environment production --minify --panicOnWarning
node tests/page-transitions.browser.mjs
```

The browser suite verifies an actual native cross-document transition, its
duration, reduced-motion opt-out, desktop/mobile and light/dark navigation,
history/scroll, anchors, new tabs, fast repeated navigation, search, script
initialization and a no-JavaScript fallback. Existing browser suites continue
to cover contact submission and the article/industry/Evidence Library controls.
Set `CHROME_PATH` to use an installed Chromium. `TRANSITION_SCREENSHOT_DIR`
optionally saves review screenshots. No contact data is sent by these tests.

## Platform references

- [MDN: @view-transition](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@view-transition)
- [Chrome: cross-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)

Support varies by browser. Do not replace the graceful fallback with a client
router solely to make an animation universal, and do not add a render-blocking
wait to hold a page for an effect.
