---
title: "Industries"
description: "Explore a provisional 50-industry screening list, inspect sourced baselines and their limits, and test CAGR scenarios."
date: 2026-09-21
lastmod: 2026-09-30
slug: "industries"
---

<link rel="stylesheet" href="/css/industries.css">

Explore a provisional 50-industry screening list and test CAGR scenarios. **The original market ranges, growth rates and projections remain unverified research leads.** The semiconductor and cybersecurity rows now include separately sourced historical baselines; the biopharmaceutical row includes broader prescription-medicine market context. Each has its own year, geography, definition and source. These additions do not validate the original estimates or make different market definitions comparable. Select a row to inspect the evidence and its limits. Categories and maturity labels are editorial classifications.

{{< breakdown-links >}}

<div id="industry-explorer" class="ix">
<div class="ix-actions">
<a class="ix-btn ix-btn-primary" href="/data/industries.csv" download>Download CSV</a>
<a class="ix-btn" href="/post/50-high-potential-industries/">Read the report</a>
<a class="ix-btn" href="/about/#research-methodology">Research methodology</a>
</div>
<p class="ix-note">File updated September 2026. Added source records were reviewed on September 30, 2026; this is separate from the measurement year and publication date. Original numeric market sizes are in USD billions where available. Filters and scenarios still use the original indicative estimates, not the separately sourced baselines. The CAGR filter uses a range midpoint only when both bounds exist; a one-sided value is treated as a lower bound.</p>
<p id="ix-coverage" class="ix-coverage" aria-live="polite">The full screening list is available below. Numeric coverage appears when the interactive controls load.</p>
<div class="ix-filters">
<label>Search
<input id="ix-q" type="search" placeholder="Industry, technology, notes" autocomplete="off">
</label>
<label>Category
<select id="ix-category">
<option value="">All</option>
<option value="AI Foundation">AI Foundation</option>
<option value="Digitization">Digitization</option>
<option value="Energy">Energy</option>
<option value="Hard Tech">Hard Tech</option>
<option value="Bio & Health">Bio & Health</option>
<option value="Manufacturing">Manufacturing</option>
</select>
</label>
<label>Maturity
<select id="ix-maturity">
<option value="">All</option>
<option value="Early">Early</option>
<option value="Growth">Growth</option>
<option value="Mature">Mature</option>
</select>
</label>
<label>Minimum indicative CAGR
<select id="ix-cagr">
<option value="">Any</option>
<option value="10">10%+</option>
<option value="20">20%+</option>
<option value="25">25%+</option>
</select>
</label>
</div>
<p id="ix-count" class="ix-count" aria-live="polite">Full industry list</p>
<noscript><p class="ix-note">Search, sorting and scenarios require JavaScript; the list remains readable below.</p></noscript>
<div class="ix-layout">
<div class="ix-table-wrap" role="region" aria-label="Industry data table" tabindex="0">
<table class="ix-table">
<caption class="ix-sr-only">Provisional industry screening list. Use an industry's Select button to inspect its data and prepare a scenario.</caption>
<thead>
<tr>
<th data-sort="rank" aria-sort="ascending"><button type="button" class="ix-sort" data-sort="rank">#</button></th>
<th data-sort="name" aria-sort="none"><button type="button" class="ix-sort" data-sort="name">Industry</button></th>
<th>Technology</th>
<th>Market ~2025</th>
<th data-sort="cagr" aria-sort="none"><button type="button" class="ix-sort" data-sort="cagr">CAGR</button></th>
<th data-sort="category" aria-sort="none"><button type="button" class="ix-sort" data-sort="category">Category</button></th>
</tr>
</thead>
{{< industries-table-data >}}
</table>
</div>
<aside class="ix-calc">
<h3>Scenario calculator</h3>
<p class="ix-note">Select an industry to inspect its fields and load indicative numbers, or enter your own assumptions.</p>
<label for="ix-pv">Starting value (USD billion)</label>
<input id="ix-pv" type="number" min="0" step="0.1" inputmode="decimal" placeholder="e.g. 310">
<label for="ix-rate">Annual growth rate (%)</label>
<input id="ix-rate" type="number" min="-99.9" step="0.1" inputmode="decimal" placeholder="e.g. 30">
<label for="ix-years">Years</label>
<input id="ix-years" type="number" min="1" max="50" step="1" value="5" inputmode="numeric">
<p id="ix-result" class="ix-result" aria-live="polite">Enter values to calculate</p>
<ul id="ix-year-list" class="ix-years"></ul>
<p id="ix-warn" class="ix-warn" role="status"></p>
<p id="ix-loaded" class="ix-note"></p>
<div id="ix-details" class="ix-details" aria-live="polite">Select an industry to inspect its scope and source limitations.</div>
<p class="ix-disclaimer">The result is a mathematical scenario, not a market forecast.</p>
</aside>
</div>
</div>

<script src="/js/industries.js" defer></script>

## Source review notes

The original screening estimates are unchanged. The following records are shown separately so their boundaries remain visible:

| Industry row | Sourced figure | What it establishes |
| --- | --- | --- |
| Semiconductors | USD 795.6 billion in 2025 | Annual semiconductor product sales in [WSTS's March 6, 2026 release](https://www.wsts.org/76/103/Global-Semiconductor-Market-grows-26-in-2025-to-796B). This is above the original screening range and does not establish its CAGR or forecast. |
| Cybersecurity | USD 193.408 billion in 2024 | Gartner's historical estimate of worldwide information security end-user spending, from its [July 29, 2025 release](https://www.gartner.com/en/newsroom/press-releases/2025-07-29-gartner-forecasts-worldwide-end-user-spending-on-information-security-to-total-213-billion-us-dollars-in-2025). The source's later-year numbers are forecasts. End-user spending is not necessarily vendor revenue. |
| Biopharmaceuticals | USD 1,667.671 billion in 2025 | Broader global prescription-medicine sales at ex-manufacturer prices, reported by [EFPIA / IQVIA MIDAS, Key Data 2026, page 14](https://www.efpia.eu/media/uj0popel/the-pharmaceutical-industry-in-figures-2026.pdf#page=14). Includes medicines beyond biological products and does not measure the biopharmaceutical-only market. |

The downloadable CSV includes separate `baseline_*` columns for these records. Empty original-source fields still mean the original estimate has not been verified. A sourced baseline or broader-market context is not a forecast validation.
