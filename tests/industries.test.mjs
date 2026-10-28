import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
test("withdrawn screening list and public dataset are absent from source", () => {
  for (const path of ["content/page/industries/index.en.md", "content/post/50-high-potential-industries/index.en.md", "static/data/industries.json", "static/data/industries.csv"]) {
    assert.equal(existsSync(new URL(path, root)), false, path);
  }
});
test("homepage card and library Explorer entry remain removed", () => {
  const home = readFileSync(new URL("layouts/home.html", root), "utf8");
  assert.doesNotMatch(home, /See the structure|research-home-query|START HERE/);
  const library = readFileSync(new URL("layouts/_partials/library/categories.html", root), "utf8");
  assert.doesNotMatch(library, /Industry Explorer|\/industries\//);
  assert.match(library, /Archives/);
  assert.match(library, /Evidence Library/);
});
