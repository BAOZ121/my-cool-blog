# Article industry maps and market shares

Reports can contain inline Markmap industry maps and ECharts share charts. The components enhance server-rendered outlines and data tables.
They do not require a database, external chart service or runtime CDN.

## Editing content

The single editorial source is `data/article_visuals.json`.

- `maps`: nested `name` / `children` nodes, title, explanation, source links and
  review date. The outline and interactive map use exactly the same tree.
- `shares`: percentages, time period, geography, metric, market boundary,
  source publication and URL, review date, and notes. The chart, accessible
  table and downloadable CSV use exactly the same values.

Insert in the relevant article section:

```text
{{< industry-map id="semiconductors" >}}
{{< market-share id="foundry-q4-2025" >}}
```

Keep dated dataset IDs stable. Add a new ID for a new period rather than quietly
changing a historical snapshot. Shares must total 100%; never normalize an
incomplete vendor sample into a market-share claim. A calculated Other category
must be documented. The pharmaceutical chart measures sales regions, not company
rankings; endpoint security is a subset of cybersecurity; AR/VR shipments are
neither revenue nor installed base. The foundry chart shows five published
supplier shares plus a documented residual, not a top-ten normalization.

Map labels are plain text and are HTML-escaped before Markmap renders them.
Company examples are illustrative and may span several stages. A map is not a
verified supplier-contract network.

## Delivery and accessibility

Hugo includes the enhancement assets only on articles using these shortcodes.
Both vendor modules are self-hosted and loaded near the viewport. A failed
script leaves complete information visible. A reader can open the text outline
or data table at any time. Printing expands this content. On touch screens,
normal vertical scrolling is preserved until pan/zoom is explicitly enabled.
Full screen, fit, expand/collapse, light/dark colors and reduced motion are
supported. Mind maps have keyboard-accessible − / + controls (10% relative steps)
and an absolute zoom percentage. Ctrl/⌘ + wheel and trackpad pinch use the same
pixel/line/page normalization, with no Ctrl acceleration. Accepted wheel input
is coalesced per animation frame and limited to an 8.3% scale change per frame;
there is no queued inertia after fit, mode changes or navigation. Zoom stays
between half the fitted overview (at most 25%) and 300%. The lower bound adapts
to large expanded trees, so Fit never jumps back to an unrelated minimum.
Native touch pinch and drag are enabled only with **Enable pan & zoom**; ordinary
page scrolling remains available otherwise. Double-click no longer doubles the
map scale. With the map focused, + / − zoom, 0 fits, and arrow keys pan while
interaction is enabled. The full text outline remains keyboard-readable.

Browser Print / Save PDF is the supported graphical article export.

## Dependencies

Hugo builds consume committed vendor bundles; production does not need npm.
Maintainers can reproduce them with `npm ci` then `npm run build:visuals`.
Versions are locked; the generated license inventory accompanies the bundles.
Do not hand-edit generated vendor modules. An upgrade requires rebuilding and
rerunning browser checks.

## Verification

```sh
npm test
hugo --environment production --minify --panicOnWarning
python scripts/validate_site.py public
python scripts/validate_breakdowns.py public
python scripts/validate_article_visuals.py public
node tests/article-visuals.browser.mjs
node tests/mindmap-zoom.browser.mjs
```

The browser check uses Playwright Chromium by default. Set `CHROME_PATH` to an
existing Chrome executable to avoid downloading a browser locally. Set
`VISUAL_SCREENSHOT_DIR` to save visual review screenshots. A writable Hugo cache
directory may be needed in a sandbox.
