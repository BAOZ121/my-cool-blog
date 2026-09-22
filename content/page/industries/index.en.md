---
title: "Industries"
description: "Explore 50 high-potential industries, inspect the underlying data, and run transparent CAGR scenarios."
date: 2026-09-21
slug: "industries"
---

<link rel="stylesheet" href="/css/industries.css">

Explore the 50-industry dataset, compare reported ranges, and test transparent CAGR scenarios. Categories and maturity labels are editorial classifications; source definitions and coverage vary. This tool is **not investment advice**.

{{< breakdown-links >}}

<div id="industry-explorer" class="ix">
<div class="ix-actions">
<a class="ix-btn ix-btn-primary" href="/data/industries.csv" download>Download CSV</a>
<a class="ix-btn" href="/post/50-high-potential-industries/">Read the report</a>
<a class="ix-btn" href="/about/#research-methodology">Research methodology</a>
</div>
<p class="ix-note">Updated September 2026. Market sizes are in USD billions where available. CAGR ranges are approximate and the filter uses their midpoint.</p>
<p id="ix-coverage" class="ix-coverage" aria-live="polite">Checking data coverage…</p>
<div class="ix-filters">
<label>Search
<input id="ix-q" type="search" placeholder="Industry, technology, notes" autocomplete="off">
</label>
<label>Category
<select id="ix-category">
<option value="">All</option>
<option>AI Foundation</option>
<option>Digitization</option>
<option>Energy</option>
<option>Hard Tech</option>
<option>Bio & Health</option>
<option>Manufacturing</option>
</select>
</label>
<label>Maturity
<select id="ix-maturity">
<option value="">All</option>
<option>Early</option>
<option>Growth</option>
<option>Mature</option>
</select>
</label>
<label>Minimum CAGR midpoint
<select id="ix-cagr">
<option value="">Any</option>
<option value="10">10%+</option>
<option value="20">20%+</option>
<option value="25">25%+</option>
</select>
</label>
</div>
<p id="ix-count" class="ix-count" aria-live="polite">Loading…</p>
<div class="ix-layout">
<div class="ix-table-wrap">
<table class="ix-table">
<caption class="ix-sr-only">High-potential industries. Activate a row to load its available numeric data into the calculator.</caption>
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
<tbody id="ix-tbody"></tbody>
</table>
</div>
<aside class="ix-calc">
<h3>Scenario calculator</h3>
<p class="ix-note">Click or press Enter on a row to load its numeric midpoint. You can also enter your own assumptions.</p>
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
<p class="ix-disclaimer">The result is a mathematical scenario, not a market forecast.</p>
</aside>
</div>
</div>

<script src="/js/industries.js" defer></script>
