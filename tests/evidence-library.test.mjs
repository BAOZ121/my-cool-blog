import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { matches, normalize, readFilters } from "../assets/js/evidence-library.mjs";

const data = JSON.parse(readFileSync(new URL("../data/evidence_library.json", import.meta.url)));

test("search is case/diacritic insensitive, all-word and literal", () => {
  assert.equal(normalize("  CAFÉ  NVIDIA  "), "cafe nvidia");
  assert.ok(matches("NVIDIA Q2 • Revenue mix", "REVENUE nvidia"));
  assert.ok(!matches("NVIDIA revenue", "nvidia NIST"));
  assert.ok(matches("Evidence Library", "  "));
  assert.ok(!matches("NVIDIA revenue", "<script>"));
  assert.ok(matches("Kefauver–Harris", "harris"));
});

test("URL state permits only known articles and material types", () => {
  assert.deepEqual(readFilters("?q=NIST&type=file&article=cyber", ["cyber"]), { q: "NIST", type: "file", article: "cyber" });
  assert.deepEqual(readFilters("?q=%3Cimg%3E&type=script&article=unknown", ["cyber"]), { q: "<img>", type: "", article: "" });
});

test("index covers current published posts, preserves contexts, and only uses safe source URLs", () => {
  assert.equal(data.schema_version, 1);
  assert.equal(data.articles.length, data.counts.articles);
  assert.equal(data.articles.length, 7);
  let total = 0;
  let files = 0;
  const local = new Set();
  for (const article of data.articles) {
    assert.ok(article.title && article.url.startsWith("/post/"));
    assert.ok(!article.id.includes("my-first-post"));
    assert.equal(new Set(article.entries.map(entry => entry.url)).size, article.entries.length);
    for (const entry of article.entries) {
      total++;
      if (entry.kind === "file") files++;
      if (entry.local) local.add(entry.url);
      assert.match(entry.url, /^(https?:\/\/|\/(?!\/))/);
      assert.ok(entry.title && entry.citations.length);
      assert.ok(!entry.url.endsWith("asset-credits.txt"));
      for (const citation of entry.citations) assert.ok(citation.url.startsWith(article.url));
    }
  }
  assert.equal(total, data.counts.materials);
  assert.equal(files, data.counts.files);
  assert.equal(local.size, data.counts.hosted_files);
  assert.ok(local.has("/data/industries.csv"));
  assert.ok(local.has("/research-files/cybersecurity/NIST.SP.800-207.pdf"));
  assert.equal([...local].filter(url => url.startsWith("/data/charts/")).length, 5);
});

test("unverified ranges, reading leads and chart scope remain searchable", () => {
  const screening = data.articles.find(article => article.id === "50-high-potential-industries");
  assert.match(screening.notices.join(" "), /other seven audited original ranges remain unverified/);
  assert.match(screening.notices.join(" "), /2022–2040/);
  assert.match(JSON.stringify(screening.entries), /internally inconsistent/);
  const cyber = data.articles.find(article => article.id === "cybersecurity-industry-report");
  assert.match(cyber.notices.join(" "), /not all been independently verified/);
  const pharma = data.articles.find(article => article.id === "pharmaceutical-industry");
  assert.match(pharma.notices.join(" "), /reading leads, not independent verification/);
  const ai = data.articles.find(article => article.id === "ai-computing-infrastructure");
  assert.match(JSON.stringify(ai.entries), /not its industry market share/);
  assert.ok(ai.entries.some(entry => entry.citations.length > 1));
});
