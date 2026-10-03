# Evidence Library

`/evidence-library/` indexes the existing public source links and file downloads in
published posts. A main-menu entry and each article's tools link to the library.
No source document is fetched or copied by the indexer. Existing appendices remain
unchanged and authoritative for claim scope.

## Single source of truth

The article bodies and existing shortcode data remain the editorial sources.
`scripts/build_evidence_library.py` uses Python's standard-library HTML parser to
extract the rendered article body plus article-tool downloads. This catches raw
HTML evidence anchors, Markdown references, PDF shortcodes and chart CSVs without
inventing source titles, dates, publisher names or verification statuses.

The committed `data/evidence_library.json` is generated, not hand edited. Hugo
renders it as static HTML. CI regenerates it in memory and fails on drift, missing
local files, unsafe source links or an incomplete index. Keep it in the same commit
as changes to article citations, source notes or shortcodes. After editing:

```sh
hugo --environment production --minify --panicOnWarning --cleanDestinationDir
python3 scripts/build_evidence_library.py public
hugo --environment production --minify --panicOnWarning
python3 scripts/build_evidence_library.py public --check
```

Hugo can build directly from the committed index with no npm install or runtime
network request. Use a clean output directory when removing/unpublishing posts,
so a stale generated article cannot be re-indexed.

## Inclusion and interpretation

The initial index contains 7 published posts and 191 article-specific materials:
183 external source records and 8 existing DEX-hosted file downloads. Of these,
26 paths identify PDF/CSV files. Identical exact URLs within one article share a
record while retaining all citation contexts. The same URL across different
articles appears in each collection. URL fragments and query strings are retained.

- Include external HTTP(S) links in article content and linked public document/data files
- Exclude drafts, images, navigation, internal report/guide links, asset credits,
  font/icon licenses, executable URLs and private research files
- Keep source titles as written in the article. For raw-URL reference lists, use
  the surrounding reference text; generic inline citation labels lose to descriptive labels
- Keep article publication dates separate from dates mentioned in original source notes
- Keep original paragraphs and scope notes in expandable citation contexts
- Show the 50-industry article's evidence-status notice and the pharma/cyber reading-list qualifications
- Do not reinterpret source checking as independent verification
- CSV chart files are DEX data exports; locally hosted PDFs are the existing originals

The separate Industry Guides hub and its shared JSON are not article appendices;
they remain available through their own sourced pages. The JSON counterpart of the
50-row dataset remains on the Explorer; the article's existing CSV is indexed here.
No external URL availability or permission to redistribute third-party files is
inferred from inclusion.

## Search and accessibility

All links and citation contexts are server-rendered; native `details` disclosures
work without JavaScript. Search and article/type filters are a small self-hosted
module loaded only on this page. Search is literal, all-word, case- and
accent-insensitive across article titles, source titles, domains and citation text.
User input is never inserted into HTML. Status updates are announced by a polite
live region. Reset restores focus to search. Filters persist in `q`, `article` and
`type` URL parameters; Back/Forward and article anchors are supported. Light/dark
colors use existing site tokens.

## Verification

```sh
npm test
python3 -m unittest discover -s tests -p 'test_evidence_library.py'
hugo --environment production --minify --panicOnWarning
python3 scripts/build_evidence_library.py public --check
python3 scripts/validate_site.py public
python3 scripts/validate_breakdowns.py public
python3 scripts/validate_article_visuals.py public
node tests/evidence-library.browser.mjs
git diff --check
```

Browser tests cover desktop/mobile, keyboard disclosures, both themes, literal
search, empty results, reset focus, file/article filters, URL reload/history,
collection anchors, citation anchors, hosted files and no-JavaScript browsing.
Set `CHROME_PATH` for a local browser and `EVIDENCE_SCREENSHOT_DIR` to save screenshots.
