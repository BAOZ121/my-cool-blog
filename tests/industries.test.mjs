import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const data = JSON.parse(readFileSync(new URL("../static/data/industries.json", import.meta.url), "utf8"));
const script = readFileSync(new URL("../static/js/industries.js", import.meta.url), "utf8");

function page({ embeddedData = JSON.stringify(data), fetchData = () => { throw Error("Unexpected fetch"); } } = {}) {
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
  const root = {
    querySelector(selector) {
      if (selector === "#ix-dataset") return embeddedData == null ? null : { textContent: embeddedData };
      return elements.get(selector.slice(1));
    },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const document = { getElementById(id) { return id === "industry-explorer" ? root : null; } };
  vm.runInNewContext(script, { document, fetch: fetchData });
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

test("an early input event cannot clear static rows while a fallback fetch is pending", () => {
  const { elements, listeners } = page({ embeddedData: null, fetchData: () => new Promise(() => {}) });
  listeners.input({ target: elements.get("ix-q") });
  assert.match(elements.get("ix-tbody").innerHTML, /Static industry row/);
  assert.equal(elements.get("ix-count").textContent, "Full industry list");
});
