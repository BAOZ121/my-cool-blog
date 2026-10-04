# Chapter rail

The right article sidebar is a one-pixel chapter line at the viewport's
far-right safe edge, with chapter labels to its left, numbered main chapters
and smaller subsection nodes. It replaces Stack's boxed table of
contents and visible scrollbar. Hugo still owns every heading ID, TOC level,
label and link; article text and industry history sections are unchanged.

The rail is sticky with the existing right sidebar. Long outlines can be
scrolled with a wheel, touchpad or keyboard without a bulky scrollbar. The
active link has `aria-current="location"`; its parent chapter and position
counter update as the document scrolls. The rail only moves enough to keep an
active link visible and does not auto-scroll during pointer or keyboard
interaction. Nothing replaces browser history, scroll restoration or link
navigation. Resize, image/font loads and BFCache returns remeasure positions.

On screens below 1024px, the complete outline lives in a native, keyboard
operable `details` disclosure above the article. It stays in document flow,
expands to its natural height, and never floats over the text. Its open/closed
state is retained for the browser session so a Back navigation can restore the
same layout even when the browser has evicted the page from BFCache. Links and the
mobile disclosure work with JavaScript disabled. Reduced motion disables the
small color transitions; links use native scrolling in every mode. The rail
also has print and forced-colors fallbacks.

## Implementation boundaries

- `layouts/_partials/widget/toc.html` overrides the desktop widget
- `layouts/_partials/article/article.html` retains the upstream header,
  content, footer and math calls, replacing only its mobile TOC
- `chapter-rail/nav.html` reuses the theme's generated TOC and original IDs
- `chapter-rail/assets.html` conditionally loads the self-hosted CSS/module
- `head/custom.html` includes that asset partial

The desktop navigation ID is `ArticleChapters` instead of `TableOfContents`
to avoid two competing scrollspy implementations. Heading IDs are unchanged.
Path+hash links intentionally bypass Stack's legacy smooth-anchor handler,
which intercepts fragment-only links and forces smooth motion. The module
preserves the current query string on these links. No page transition names
or styles are used by the rail.

## Checks

```sh
node --test tests/chapter-rail.test.mjs
hugo --environment production --minify --panicOnWarning
node tests/chapter-rail.browser.mjs
```

The browser suite covers the long commercial-space report at 1920, 1440, 1024, 390
and 320px; light/dark palettes; reduced motion; JavaScript disabled; all
heading targets; keyboard navigation/focus; direct deep links; overflow;
scroll highlighting; and Back scroll restoration. Set `CHROME_PATH` for an
installed Chromium and `CHAPTER_SCREENSHOT_DIR` to retain visual evidence.
