---
title: "Industry Explorer"
description: "Explore 50 industries, compare available market-size and growth estimates, and find related industry guides and research."
date: 2026-09-21
lastmod: 2026-10-02
slug: "industries"
layout: "explorer"
comments: false
toc: false
---

<section id="industry-list" class="ix-directory" aria-labelledby="ix-list-title">
<div class="ix-section-heading">
<div><h2 id="ix-list-title">Find an industry to research</h2><p class="ix-note">Open an industry for its details, sources, and related research.</p></div>
<a class="ix-download" href="/data/industries.csv" download>Download CSV <span aria-hidden="true">↓</span></a>
</div>
<p class="ix-data-status"><span class="ix-status-dot" aria-hidden="true"></span>Original screening estimates are unverified. Sourced records are shown separately. <a href="#source-review-notes">About the data</a></p>
<div class="ix-filters" role="search" aria-label="Filter industries" hidden>
<label>Search
<input id="ix-q" type="search" placeholder="Try chips, energy, or cybersecurity" autocomplete="off">
</label>
<label>Category
<select id="ix-category">
<option value="">All categories</option>
<option value="AI Foundation">AI Foundation</option>
<option value="Digitization">Digitization</option>
<option value="Energy">Energy</option>
<option value="Hard Tech">Hard Tech</option>
<option value="Bio & Health">Bio & Health</option>
<option value="Manufacturing">Manufacturing</option>
</select>
</label>
<details class="ix-more-filters"><summary>More filters</summary><div class="ix-secondary-filters"><label>Maturity
<select id="ix-maturity">
<option value="">All stages</option>
<option value="Early">Early</option>
<option value="Growth">Growth</option>
<option value="Mature">Mature</option>
</select>
</label>
<label>Minimum growth (CAGR)
<select id="ix-cagr">
<option value="">Any</option>
<option value="10">10%+</option>
<option value="20">20%+</option>
<option value="25">25%+</option>
</select>
</label>
 </div></details>
</div>
<div class="ix-list-controls"><p id="ix-count" class="ix-count" aria-live="polite">50 industries</p><button type="button" class="ix-reset" id="ix-reset" hidden>Clear filters</button><label class="ix-mobile-sort" hidden>Sort by<select id="ix-sort-mobile"><option value="rank">Original order</option><option value="name">Industry name</option><option value="cagr">Growth rate (low to high)</option><option value="category">Category</option></select></label></div>
<noscript><p class="ix-note">All industries and research links are available below. Enable JavaScript to filter, sort, and explore growth scenarios.</p></noscript>
<div class="ix-table-wrap" role="region" aria-label="Industry comparison">
<table class="ix-table">
<caption class="ix-sr-only">Original industry screening estimates, unverified. Market values are approximately 2025. Open an industry to inspect its sources and research.</caption>
<thead>
<tr>
<th data-sort="rank" aria-sort="ascending"><button type="button" class="ix-sort" data-sort="rank">#</button></th>
<th data-sort="name" aria-sort="none"><button type="button" class="ix-sort" data-sort="name">Industry</button></th>
<th>Key technologies</th>
<th>Market size · ~2025</th>
<th data-sort="cagr" aria-sort="none"><button type="button" class="ix-sort" data-sort="cagr">Growth · CAGR</button></th>
</tr>
</thead>
{{< industries-table-data >}}
</table>
</div>
</section>

<dialog id="ix-dialog" class="ix-dialog" aria-labelledby="ix-detail-title">
<div class="ix-dialog-header"><p class="ix-eyebrow">INDUSTRY DETAILS</p><form method="dialog"><button class="ix-btn ix-close" aria-label="Close industry details" autofocus>Close <span aria-hidden="true">×</span></button></form></div>
<h2 id="ix-detail-title">Industry details</h2>
<div id="ix-details" class="ix-details" aria-live="polite"></div>
<details class="ix-calc" id="ix-scenario">
<summary>Explore a growth scenario <span aria-hidden="true">+</span></summary>
<div class="ix-calc-body">
<p class="ix-note">Adjust the starting value, annual growth rate, and time period to explore a mathematical scenario.</p>
<p id="ix-loaded" class="ix-note"></p>
<div class="ix-calc-fields"><div>
<label for="ix-pv">Starting value (USD billion)</label>
<input id="ix-pv" type="number" min="0" step="0.1" inputmode="decimal" placeholder="e.g. 310">
</div><div>
<label for="ix-rate">Annual growth rate (%)</label>
<input id="ix-rate" type="number" min="-99.9" step="0.1" inputmode="decimal" placeholder="e.g. 30">
</div><div>
<label for="ix-years">Years</label>
<input id="ix-years" type="number" min="1" max="50" step="1" value="5" inputmode="numeric">
</div></div>
<p id="ix-result" class="ix-result" aria-live="polite">Enter values to calculate</p>
<ul id="ix-year-list" class="ix-years"></ul>
<p id="ix-warn" class="ix-warn" role="status"></p>
<p class="ix-disclaimer">The result is a mathematical scenario, not a market forecast.</p>
</div>
</details>
</dialog>

<details class="ix-source-notes" id="source-review-notes">
<summary>About the data &amp; source review</summary>
<div class="ix-source-body">
<p id="ix-coverage" class="ix-coverage" aria-live="polite">The full screening list contains 50 industries. Numeric coverage appears when the interactive controls load.</p>
<p>Original market ranges, growth rates, and projections are unverified research leads. Categories and maturity labels are editorial classifications. Separately sourced records have their own years, geography, and market definitions; these records do not validate the original estimates or make different definitions comparable.</p>
<p>File updated September 2026. Added source records were reviewed on September 30, 2026; the review date is separate from the measurement year and publication date. Original numeric market sizes are in USD billions where available. Filters and scenarios use the original indicative estimates. The growth filter uses a midpoint when both CAGR bounds exist and a lower bound for a one-sided value.</p>

### Separately sourced records

The original screening estimates are unchanged. The following records are shown separately so their boundaries remain visible:

| Industry row | Sourced figure | What it establishes |
| --- | --- | --- |
| Semiconductors | USD 795.6 billion in 2025 | Annual semiconductor product sales in [WSTS's March 6, 2026 release](https://www.wsts.org/76/103/Global-Semiconductor-Market-grows-26-in-2025-to-796B). This is above the original screening range and does not establish its CAGR or forecast. |
| Cybersecurity | USD 193.408 billion in 2024 | Gartner's historical estimate of worldwide information security end-user spending, from its [July 29, 2025 release](https://www.gartner.com/en/newsroom/press-releases/2025-07-29-gartner-forecasts-worldwide-end-user-spending-on-information-security-to-total-213-billion-us-dollars-in-2025). The source's later-year numbers are forecasts. End-user spending is not necessarily vendor revenue. |
| Biopharmaceuticals | USD 1,667.671 billion in 2025 | Broader global prescription-medicine sales at ex-manufacturer prices, reported by [EFPIA / IQVIA MIDAS, Key Data 2026, page 14](https://www.efpia.eu/media/uj0popel/the-pharmaceutical-industry-in-figures-2026.pdf#page=14). Includes medicines beyond biological products and does not measure the biopharmaceutical-only market. |

The downloadable CSV includes separate `baseline_*` columns for these records. Empty original-source fields still mean the original estimate has not been verified. A sourced baseline or broader-market context is not a forecast validation.

<div class="ix-actions"><a class="ix-btn" href="/post/50-high-potential-industries/">Read the screening report</a><a class="ix-btn" href="/about/#research-methodology">Research methodology</a></div>
</div>
</details>
