import test from "node:test";
import assert from "node:assert/strict";
import { matchesProfile, readFilters, filterURL, initDirectory, initStages } from "../assets/js/breakdowns.mjs";

const chip = { search: "Semiconductors AI Foundation chips integrated circuits 半导体", category: "AI Foundation" };

test("search is case-insensitive, tokenized and supports Chinese aliases", () => {
  assert.equal(matchesProfile(chip, "  CHIPS  circuits "), true);
  assert.equal(matchesProfile(chip, "半导体"), true);
  assert.equal(matchesProfile(chip, "chips storage"), false);
});
test("category and query combine; empty searches include every profile", () => {
  assert.equal(matchesProfile(chip), true);
  assert.equal(matchesProfile(chip, "chips", "AI Foundation"), true);
  assert.equal(matchesProfile(chip, "chips", "Energy"), false);
});
test("unknown category falls back without injecting arbitrary URL values", () => {
  assert.deepEqual(readFilters("?q=chips&category=wrong", ["", "Energy"]), { query: "chips", category: "" });
  assert.deepEqual(readFilters("?q=%3Cscript%3E&category=Energy", ["Energy"]), { query: "<script>", category: "Energy" });
});
test("shareable filters preserve unrelated query and fragment values", () => {
  const url = filterURL("https://example.com/industry-breakdowns/?utm_source=test#catalog", " chips ", "AI Foundation");
  assert.equal(url.searchParams.get("q"), "chips");
  assert.equal(url.searchParams.get("category"), "AI Foundation");
  assert.equal(url.searchParams.get("utm_source"), "test");
  assert.equal(url.hash, "#catalog");
  assert.equal(filterURL(url.href, "", "").search, "?utm_source=test");
});

class Control extends EventTarget {
  constructor(props = {}) { super(); Object.assign(this, { hidden: true, value: "", textContent: "", attributes: {} }, props); }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
}
function directory(search = "") {
  const form = new Control();
  const query = new Control();
  const category = new Control({ options: [{ value: "" }, { value: "AI Foundation" }, { value: "Energy" }] });
  const count = new Control();
  const empty = new Control();
  const cards = [new Control({ dataset: chip }), new Control({ dataset: { search: "Battery storage Energy", category: "Energy" } })];
  const selectors = { form, "#bd-query": query, "#bd-category": category, "[data-breakdown-count]": count, "[data-breakdown-empty]": empty };
  const root = { querySelector: (key) => selectors[key], querySelectorAll: () => cards };
  const nav = new Control({ location: new URL("https://example.com/industry-breakdowns/" + search) });
  nav.history = { replaceState: (_state, _title, url) => { nav.location = new URL(url); } };
  initDirectory(root, nav);
  return { form, query, category, count, empty, cards, nav };
}
test("directory initializes from a shared URL and reveals progressive controls", () => {
  const d = directory("?q=CHIPS");
  assert.equal(d.form.hidden, false);
  assert.equal(d.count.textContent, "Showing 1 of 2 breakdowns");
  assert.deepEqual(d.cards.map((card) => card.hidden), [false, true]);
});
test("empty state and reset recover all cards and focus the search field", () => {
  const d = directory();
  d.query.value = "missing-industry";
  d.query.dispatchEvent(new Event("input"));
  assert.equal(d.empty.hidden, false);
  assert.equal(d.count.textContent, "Showing 0 of 2 breakdowns");
  d.form.dispatchEvent(new Event("reset", { cancelable: true }));
  assert.equal(d.empty.hidden, true);
  assert.equal(d.query.focused, true);
  assert.equal(d.count.textContent, "Showing 2 of 2 breakdowns");
  assert.equal(d.nav.location.search, "");
});
test("category changes and popstate restore the visible result set", () => {
  const d = directory();
  d.category.value = "Energy";
  d.category.dispatchEvent(new Event("change"));
  assert.deepEqual(d.cards.map((card) => card.hidden), [true, false]);
  d.nav.location = new URL("https://example.com/industry-breakdowns/?q=chips");
  d.nav.dispatchEvent(new Event("popstate"));
  assert.deepEqual(d.cards.map((card) => card.hidden), [false, true]);
});
test("HTML-like search remains plain text and cannot create a result", () => {
  const d = directory("?q=%3Cimg%20onerror%3Dalert(1)%3E");
  assert.equal(d.query.value, "<img onerror=alert(1)>");
  assert.equal(d.count.textContent, "Showing 0 of 2 breakdowns");
});
test("native disclosures, expand/collapse control and print restore state", () => {
  const savedWindow = global.window;
  const events = new Control();
  global.window = events;
  try {
    const toggle = new Control();
    const details = [new Control({ open: false }), new Control({ open: true }), new Control({ open: false })];
    initStages({ querySelector: () => toggle, querySelectorAll: () => details });
    assert.equal(toggle.hidden, false);
    toggle.dispatchEvent(new Event("click"));
    assert.equal(details.every((item) => item.open), true);
    assert.equal(toggle.attributes["aria-expanded"], "true");
    details[0].open = false;
    details[0].dispatchEvent(new Event("toggle"));
    assert.equal(toggle.attributes["aria-expanded"], "false");
    events.dispatchEvent(new Event("beforeprint"));
    assert.equal(details.every((item) => item.open), true);
    events.dispatchEvent(new Event("afterprint"));
    assert.deepEqual(details.map((item) => item.open), [false, true, true]);
    toggle.dispatchEvent(new Event("click"));
    toggle.dispatchEvent(new Event("click"));
    assert.equal(details.every((item) => !item.open), true);
  } finally { global.window = savedWindow; }
});
test("enhancement safely skips unrelated pages", () => {
  initDirectory(null, {});
  initStages({ querySelector: () => null });
});
