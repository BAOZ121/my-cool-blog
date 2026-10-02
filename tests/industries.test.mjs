import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const data = JSON.parse(readFileSync(new URL("../static/data/industries.json", import.meta.url), "utf8"));
const script = readFileSync(new URL("../static/js/industries.js", import.meta.url), "utf8");

test("numeric provenance stays separate from contextual reading", () => {
  assert.equal(data.industries.length, 50);
  for (const row of data.industries) {
    for (const field of ["numeric_source_url", "source_date", "geography", "market_definition"]) {
      assert.equal(row[field], "", `Row ${row.rank} is not numerically verified`);
    }
  }
  assert.match(data.industries[7].context_url, /nist\.gov/);
  assert.match(data.industries[20].context_url, /fda\.gov/);
});

const researchLinks = {
  "2": [
    { label: "Read industry guide", url: "/industry-breakdowns/semiconductors/" },
    { label: "Read report", url: "/post/semiconductor-industry-report/" },
    { label: "View industry mind map", url: "/post/semiconductor-industry-report/#industry-map-semiconductors" },
    { label: "View share chart", url: "/post/semiconductor-industry-report/#market-share-foundry-q4-2025" }
  ]
};

function page({ embeddedData = JSON.stringify(data), embeddedLinks = JSON.stringify(researchLinks), locationHref, fetchData = () => { throw Error("Unexpected fetch"); } } = {}) {
  const listeners = {};
  const elements = new Map();
  const selectors = [
    "ix-q", "ix-category", "ix-maturity", "ix-cagr", "ix-coverage", "ix-count", "ix-tbody",
    "ix-pv", "ix-rate", "ix-years", "ix-result", "ix-year-list", "ix-warn", "ix-loaded", "ix-details"
  ];
  for (const id of selectors) {
    elements.set(id, { id, value: "", textContent: "", innerHTML: "" });
  }
  elements.get("ix-years").value = "5";
  elements.get("ix-count").textContent = "Full industry list";
  elements.get("ix-tbody").innerHTML = "<tr data-rank=\"1\">Static industry row</tr>";
  elements.get("ix-tbody").querySelectorAll = () => [];
  const root = {
    querySelector(selector) {
      if (selector === "#ix-dataset") return embeddedData == null ? null : { textContent: embeddedData };
      if (selector === "#ix-research-links") return embeddedLinks == null ? null : { textContent: embeddedLinks };
      return elements.get(selector.slice(1));
    },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const document = { getElementById(id) { return id === "industry-explorer" ? root : null; } };
  const navigation = locationHref ? { location: { href: locationHref } } : undefined;
  vm.runInNewContext(script, { document, fetch: fetchData, URL, window: navigation });
  return { elements, listeners };
}

test("inline data populates the full list without another network request", () => {
  const { elements } = page();
  assert.equal(elements.get("ix-count").textContent, "Showing 50 of 50");
  assert.match(elements.get("ix-tbody").innerHTML, /AI Software &amp; Services/);
  assert.match(elements.get("ix-tbody").innerHTML, /Sustainable Food &amp; Alternative Proteins/);
  assert.match(elements.get("ix-coverage").textContent, /\/50/);
});

test("translated option labels do not alter category filtering", () => {
  const { elements, listeners } = page();
  const category = elements.get("ix-category");
  category.textContent = "能源";
  category.value = "Energy";
  listeners.input({ target: category });
  const expected = data.industries.filter((row) => row.category === "Energy").length;
  assert.equal(elements.get("ix-count").textContent, `Showing ${expected} of 50`);
  category.textContent = "全部";
  category.value = "";
  listeners.change({ target: category });
  assert.equal(elements.get("ix-count").textContent, "Showing 50 of 50");
});

test("selected row separates an unverified numeric claim from relevant reading", () => {
  const { elements, listeners } = page();
  listeners.click({ target: {
    closest(selector) { return selector.startsWith(".ix-select") ? { getAttribute() { return "8"; } } : null; }
  } });
  const details = elements.get("ix-details").innerHTML;
  assert.match(details, /No numeric source recorded/);
  assert.match(details, /nist\.gov/);
  assert.match(details, /does not verify figures/);
});

test("an early input event cannot clear static rows while a fallback fetch is pending", () => {
  const { elements, listeners } = page({ embeddedData: null, fetchData: () => new Promise(() => {}) });
  listeners.input({ target: elements.get("ix-q") });
  assert.match(elements.get("ix-tbody").innerHTML, /Static industry row/);
  assert.equal(elements.get("ix-count").textContent, "Full industry list");
});

test("rendered rows retain stable destinations and a single details action per industry", () => {
  const { elements } = page();
  const table = elements.get("ix-tbody").innerHTML;
  assert.equal((table.match(/id="ix-industry-\d+"/g) || []).length, 50);
  assert.equal((table.match(/aria-haspopup="dialog"/g) || []).length, 50);
  assert.doesNotMatch(table, /<nav|Read industry guide|View share chart/);
  assert.doesNotMatch(table, /#industry-map-battery|#market-share-robotics/);
});

test("sourced baselines and broader context never validate or replace the original calculator estimates", () => {
  const row = data.industries.find((item) => item.rank === 2);
  const { elements } = page({ locationHref: "https://thedexs.com/industries/?industry=2#ix-industry-2" });
  assert.match(elements.get("ix-tbody").innerHTML, /Sourced baseline · 2025/);
  assert.match(elements.get("ix-tbody").innerHTML, /Sourced context · 2025/);
  const details = elements.get("ix-details").innerHTML;
  assert.match(details, /No numeric source recorded/);
  assert.match(details, /Separate|separate|does not|do not/);
  assert.ok(details.includes(row.sourced_baseline.source.url));
  assert.equal(elements.get("ix-pv").value, String(Math.round((row.market_low + row.market_high) / 2 * 10) / 10));
  assert.match(elements.get("ix-loaded").textContent, /unverified/);
  for (const link of researchLinks["2"]) assert.ok(details.includes('href="' + link.url + '"'));
});

test("related research rejects external, executable and malformed routes without creating fake destinations", () => {
  const malicious = { "2": [
    { label: "External", url: "//outside.example/report" },
    { label: "Executable", url: "javascript:alert(1)" },
    { label: "Malformed", url: "/\\outside.example/report" },
    { label: "Valid <tag>", url: "/post/semiconductor-industry-report/" }
  ] };
  const { elements } = page({ embeddedLinks: JSON.stringify(malicious), locationHref: "https://thedexs.com/industries/?industry=2" });
  const markup = elements.get("ix-details").innerHTML;
  assert.doesNotMatch(markup, /outside\.example|javascript:|Valid <tag>/);
  assert.match(markup, /Valid &lt;tag&gt;/);
  const missing = page({ embeddedLinks: "{invalid" });
  assert.doesNotMatch(missing.elements.get("ix-tbody").innerHTML, /Continue the research/);
});
