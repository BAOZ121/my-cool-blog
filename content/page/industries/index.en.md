---
title: "Industries"
description: "Filter 50 high-potential industries and estimate future market size with a simple CAGR calculator."
date: 2026-09-21
slug: "industries"
---

<link rel="stylesheet" href="/css/industries.css">

Filter the 50-industry list, click a row to load numbers, and estimate a future market size. Figures are from public reports and are **not investment advice**.

<div id="industry-explorer" class="ix">
  <div class="ix-actions">
    <a class="ix-btn ix-btn-primary" href="/data/industries.csv" download>Download CSV</a>
    <a class="ix-btn" href="/post/50-high-potential-industries/">Read the report</a>
  </div>
  <p class="ix-note">Updated September 2026. Market sizes in USD billions where available. CAGR ranges are approximate.</p>

  <div class="ix-filters">
    <label>Search
      <input id="ix-q" type="search" placeholder="Industry, technology, notes">
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
    <label>Min CAGR
      <select id="ix-cagr">
        <option value="">Any</option>
        <option value="10">10%+</option>
        <option value="20">20%+</option>
        <option value="25">25%+</option>
      </select>
    </label>
  </div>
  <p id="ix-count" class="ix-count">Loading…</p>

  <div class="ix-layout">
    <div class="ix-table-wrap">
      <table class="ix-table">
        <thead>
          <tr>
            <th data-sort="rank">#</th>
            <th data-sort="name">Industry</th>
            <th>Technology</th>
            <th>Market ~2025</th>
            <th data-sort="cagr">CAGR</th>
            <th data-sort="category">Category</th>
          </tr>
        </thead>
        <tbody id="ix-tbody"></tbody>
      </table>
    </div>

    <aside class="ix-calc">
      <h3>CAGR calculator</h3>
      <label for="ix-pv">Starting value (USD billion)</label>
      <input id="ix-pv" type="number" min="0" step="0.1" value="310">
      <label for="ix-rate">Annual growth rate (%)</label>
      <input id="ix-rate" type="number" step="0.1" value="30">
      <label for="ix-years">Years</label>
      <input id="ix-years" type="number" min="1" max="20" value="5">
      <p id="ix-result" class="ix-result">—</p>
      <ul id="ix-year-list" class="ix-years"></ul>
      <p id="ix-warn" class="ix-warn"></p>
      <p id="ix-loaded" class="ix-note"></p>
      <button type="button" id="ix-use" class="ix-btn">Use selected industry</button>
    </aside>
  </div>
</div>

<script src="/js/industries.js" defer></script>
