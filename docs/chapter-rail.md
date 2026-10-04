# Chapter rail

The right article sidebar is a one-pixel chapter line at the viewport's
far-right safe edge, with chapter labels to its left, numbered main chapters
and smaller subsection nodes. It replaces Stack's boxed table of
contents and visible scrollbar. Hugo still owns every heading ID, TOC level,
label and link; article text and industry history sections are unchanged.

On desktop (1024px and wider), the English **Minimize chapters / Expand
chapters** summary controls a native `details` disclosure. Minimizing preserves the same one-pixel axis, numbered main-chapter circles
and small subsection dots at the far-right safe edge, matching the supplied
reference. The current main chapter stays filled gold with a halo, including
while a subsection is active. Every compact marker is an ordinary heading link
with a full accessible name and native title; labels are only visually hidden.
Its44px-wide,44px-high targets remain usable with touch, Tab and Enter, and a
long compact outline scrolls naturally. The visible
vertical “Chapters” label and chevron remain a 44px-wide keyboard/touch target;
the expanded text outline is excluded by native disclosure semantics while
the compact markers remain reachable. Enter and
Space toggle it, including without JavaScript. No floating panel covers text.

The article uses the available horizontal space: 20px left / 8px right outer
padding, 24px column gaps, a `clamp(160px, 13vw, 200px)` left sidebar, and a
`clamp(200px, 18vw, 280px)` expanded or 44px minimized right sidebar. The main
card is capped at 1200px; remaining space becomes its auto margins. At viewport
widths 1024 / 1280 / 1440 / 1920px, expected card widths are approximately
588 / 807 / 918 / 1200px expanded and 744 / 994 / 1133 / 1200px minimized,
less any native scrollbar gutter (15px in the CI Chromium) until the cap.
Headings and prose share an approximately 100-character body-font measure
(850px at the current 17px font), while tables and charts use the full card.
Mobile layout is unchanged. Browsers without `:has()` retain the theme's
reserved sidebar space and usable native disclosure rather than overlaying it.

Desktop state is saved per article for the browser session. A small parser-time
script beside the right widget restores it before `<main>` is parsed, keeping
native Back restoration on the correct reading width. The module only saves
state and remeasures headings. Blocked storage falls back to the working native
control. The hero's `sizes` value tracks measured desktop width, restoring its
original responsive expression on mobile without changing candidate URLs.

Only label opacity and the control chevron receive brief 160ms transitions;
column widths are never animated. Reduced motion removes both. The rail is
sticky with the existing right sidebar. Long outlines can be
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
- `chapter-rail/nav.html` reuses the theme's generated TOC and original IDs;
  compact links have a separate navigation ID without duplicating heading IDs
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

The browser suite covers the long commercial-space report at 1920, 1440, 1280, 1024, 390
and 320px; light/dark palettes; reduced motion; JavaScript disabled; all
heading targets; keyboard navigation/focus; direct deep links; overflow;
scroll highlighting; expanded/minimized widths and non-overlap; no-JS keyboard
toggling; per-article reload/state isolation; independent mobile/desktop state;
blocked storage; compact-node anchor/name parity, active main/subsection states,
halo clearance and keyboard/touch activation; and strict semantic Back reading-position restoration after
minimizing (under 4px, plus exact scrollY when geometry is unchanged). Set `CHROME_PATH` for an
installed Chromium and `CHAPTER_SCREENSHOT_DIR` to retain visual evidence.
