import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { validateMap, validateShare, pieOptions } from "../assets/js/article-visuals.mjs";

const bundle = new URL("../content/test/healthcare-industry-report/", import.meta.url);
const read = (path) => readFileSync(new URL(path, bundle), "utf8");
const article = read("index.en.md");
const front = article.split("---", 3)[1];
const visuals = JSON.parse(read("assets/web-visuals.json"));
const evidence = JSON.parse(read("assets/evidence-en.json"));
const evidenceIDs = new Set(evidence.map((record) => record.id));

// These CSVs have single-line fields; retain commas inside quoted fields.
function csv(path) {
  const lines = read(path).trim().split(/\r?\n/);
  const fields = (line) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)]
    .map((match) => match[1].replace(/^"|"$/g, "").replaceAll('""', '"'));
  const headers = fields(lines.shift());
  return lines.map((line) => Object.fromEntries(fields(line).map((value, index) => [headers[index], value])));
}

test("healthcare stays a native, unlisted test page with four report parts and four sourced visuals", () => {
  for (const expected of [
    /^url:\s*"\/test\/healthcare-industry-report\/"$/m,
    /^type:\s*"post"$/m, /^layout:\s*"single"$/m,
    /^testpage:\s*true$/m, /^robots:\s*"noindex, nofollow"$/m,
    /^sitemap:\s*\n\s+disable:\s*true$/m,
    /^build:\s*\n\s+list:\s*"never"\s*\n\s+render:\s*"always"$/m,
  ]) assert.match(front, expected);
  assert.doesNotMatch(front, /^(?:categories|tags):/m);
  assert.doesNotMatch(article, /<(?:script|style)\b/i, "The test page must use the site's shared components");
  assert.deepEqual([...article.matchAll(/^## Part (\d): ([^{\n]+)/gm)].map((match) => [Number(match[1]), match[2].trim()]), [
    [1, "Industry Story"], [2, "Industry Value Chain"], [3, "Market Landscape"], [4, "Industry Problems"],
  ]);
  const calls = [...article.matchAll(/\{\{< (industry-map|market-share) id="([^"]+)" data="assets\/web-visuals.json" >\}\}/g)];
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((call) => call[1] === "industry-map").length, 1);
  assert.equal(new Set(calls.map((call) => call[2])).size, 4);
  for (const [, kind, id] of calls) {
    const data = visuals[kind === "industry-map" ? "maps" : "shares"][id];
    assert.ok(data, `Missing local visual ${id}`);
    (kind === "industry-map" ? validateMap : validateShare)(data);
  }
  assert.ok(existsSync(new URL("assets/cover.webp", bundle)));
  assert.match(article, /id="supporting-evidence"/);
});

test("all healthcare citations and chart provenance resolve to the complete 23-record appendix", () => {
  const expected = Array.from({ length: 23 }, (_, i) => `E${String(i + 1).padStart(2, "0")}`);
  assert.deepEqual([...evidenceIDs], expected);
  assert.deepEqual([...article.matchAll(/<section class="research-evidence" id="source-(E\d{2})"/g)].map((match) => match[1]), expected);
  const citations = [...article.matchAll(/href="#source-(E\d{2})"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(citations)].sort(), expected);
  assert.doesNotMatch(article, /\[E\d{2}[–—-]E\d{2}\]/, "Citation ranges must resolve to individual source links");
  for (const chart of Object.values(visuals.shares)) {
    const id = chart.source.title.match(/^\[(E\d{2})\]/)?.[1];
    const record = evidence.find((item) => item.id === id);
    assert.ok(record, `Unresolved chart source ${id}`);
    assert.equal(chart.source.url, record.url);
    assert.equal(chart.source.published, record.date);
  }
  for (const match of JSON.stringify(visuals.maps).matchAll(/\bE\d{2}\b/g)) assert.ok(evidenceIDs.has(match[0]));
});

test("native healthcare slices, percentage labels and downloadable data retain the same denominators", () => {
  const contracts = [
    ["healthcare-us-expenditure-2024", "us-spending-2024.csv", "category", "display_share_pct", "value_usd_bn", 1000, 5278600, "E05"],
    ["healthcare-us-medicare-advantage-mar-2026", "medicare-advantage-shares-2026.csv", "parent_organization", "share_pct", null, null, null, "E07"],
    ["healthcare-china-hospital-visits-2025", "china-hospital-visits-2025.csv", "ownership", "display_share_pct", "visits_100_million", 100, 4670, "E06"],
  ];
  for (const [id, file, name, percentage, amount, conversion, denominator, source] of contracts) {
    const data = visuals.shares[id], rows = csv(`assets/${file}`);
    assert.equal(data.totalUnits ?? null, denominator);
    assert.equal(data.series.length, rows.length);
    assert.equal(data.series.reduce((sum, item) => sum + item.value, 0), 100);
    const chart = pieOptions(data, { compact: true });
    data.series.forEach((item, i) => {
      assert.equal(item.name, rows[i][name]);
      assert.equal(item.value, Number(rows[i][percentage]));
      assert.equal(rows[i].source, source);
      assert.equal(data.geography, rows[i].region);
      assert.equal(data.period.replace(/^Calendar /, ""), rows[i].period);
      if (amount) assert.equal(item.units, Math.round(Number(rows[i][amount]) * conversion));
      else assert.equal(item.units, undefined, "Rounded enrollment shares must not invent enrollment counts");
      assert.equal(chart.series[0].data[i].value, item.units ?? item.value);
      assert.equal(chart.legend.formatter(item.name), `${item.name}  ${item.value.toFixed(data.percentDecimals)}%`);
    });
    if (denominator) assert.equal(data.series.reduce((sum, item) => sum + item.units, 0), denominator);
  }
  const facilities = csv("assets/china-hospital-counts-2025.csv");
  assert.equal(facilities.reduce((sum, row) => sum + Number(row.hospital_count), 0), 38159);
  const privateHospitals = facilities.find((row) => row.ownership === "Private hospitals");
  assert.equal((Number(privateHospitals.hospital_count) / 38159 * 100).toFixed(1), "69.4");
  assert.match(visuals.shares["healthcare-china-hospital-visits-2025"].note, /69\.4% of facilities and 15\.8% of visits/);
});
