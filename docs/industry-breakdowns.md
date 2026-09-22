# Industry breakdowns

## Decision

Use native Hugo pages backed by `data/breakdowns.json`. This fits a solo research
publisher: no database, SaaS subscription, graph library, runtime API or new build
package is needed. It preserves the simplified report body rather than embedding
an enormous dashboard inside each report.

Alternatives considered:

| Option | Strength | Trade-off |
| --- | --- | --- |
| Static diagrams in posts | Small implementation cost | Poor searching, reuse and source linking |
| **Structured maps and individual pages** | Searchable, linkable, accessible, expandable | A consistent editorial schema must be maintained |
| Company/technology knowledge graph | Many-to-many exploration | Much higher research and engineering maintenance |

## First release

Six scoped starter maps: AI software, semiconductors, battery storage,
cybersecurity, industrial robotics and biopharmaceuticals. These are not six
completed investment reports and do not upgrade the evidence status of the old
50-row CSV/JSON dataset. No new market-size numbers or stock recommendations are
introduced. Source evidence and DEX interpretation are explicitly separated.

The sidebar and Industries page link to the hub and profiles. Each profile has:

- a permanent `/industry-breakdowns/<id>/` URL;
- scope, geography and source-review date;
- a three-stage map with native, keyboard-operable disclosures;
- revenue/bottleneck questions, risks and three metrics to investigate;
- factual evidence anchors mapped to source URLs, titles, publishers and dates;
- related reports where available, methodology and a JSON export.

## Add or update a profile

1. Edit `data/breakdowns.json`. Keep the ID stable. Link exactly one existing
   dataset rank and preserve its category. Explain narrower scope explicitly.
2. Create a page under `content/page/` with `layout: breakdown`, the corresponding
   `industryId`, a title/description and an explicit URL matching the ID.
3. Use official/primary sources. Each `evidence[].source` must match a source ID.
   The `supports` field must say exactly what the source supports and what it does
   not. Do not present commercial hypotheses as sourced facts.
4. Review every published profile before advancing the shared review date. If
   coverage grows, migrate to per-profile dates before switching to rolling updates.
5. Run the commands below. Verify the preview at desktop and phone widths, keyboard
   operation, dark mode, empty search, shared filters and no-JavaScript reading.

Hugo generates the public JSON download from the same source; do not maintain a
second copy. The search enhancement modifies only hidden states/text and URL
parameters. It never inserts query strings into HTML.

## Validation

```sh
node --test tests/breakdowns.test.mjs
hugo --environment production --minify --panicOnWarning
python3 scripts/validate_breakdowns.py public
git diff --check
```

Use Hugo Extended 0.166.0, Node 22+ and Python 3.11+. The validation script has no
third-party Python dependencies. It checks schema, evidence-to-source mappings,
dataset relationships, one main-content H1 per profile, native disclosures, duplicate IDs,
JSON export parity, feature fragments and generated internal links.

The workflow builds and tests only. It does not deploy production or touch DNS.
Cloudflare's existing branch previews remain the visual review surface. Original
PR #4 review findings outside this feature (old table interaction, CSV provenance,
PDF pagination and reading progress) are not claimed as fixed here.
