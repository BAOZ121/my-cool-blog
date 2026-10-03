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

test("review corrections preserve file typing, isolated PDF metadata and unresolved limits", () => {
  const ai = data.articles.find(article => article.id === "ai-computing-infrastructure");
  const retrospective = ai.entries.find(entry => entry.url === "https://ojs.aaai.org/index.php/AAAI/article/view/41334/45295");
  assert.equal(retrospective.kind, "file");
  assert.equal(retrospective.format, "PDF");
  assert.ok(ai.entries.some(entry => entry.url === "https://developer.nvidia.com/blog/programming-tensor-cores-in-cuda-9/"));
  const cyber = data.articles.find(article => article.id === "cybersecurity-industry-report");
  const menlo = cyber.entries.find(entry => entry.url.includes("cybersecurity_market_map-091922.pdf"));
  assert.doesNotMatch(JSON.stringify(menlo), /59 pages|NIST SP 800-207/);
  const screening = data.articles.find(article => article.id === "50-high-potential-industries");
  assert.ok(screening.entries.some(entry => entry.url === "https://ifr.org/ifr-press-releases/news/service-robots-see-global-growth-boom"));
  assert.ok(!screening.entries.some(entry => entry.url === "https://ifr.org/ifr-press-releases/news/robot-race-"));
  const chips = data.articles.find(article => article.id === "semiconductor-industry-report");
  const asml = chips.entries.find(entry => entry.url.endsWith("/tsmc-selects-asml-for-industry-first-immersion-tool-order"));
  assert.match(JSON.stringify(asml.citations), /not a currently accessible live copy of the release/);
  assert.match(JSON.stringify(asml.citations), /no verified equivalent live replacement/);
  const unresolved = [
    ["pharmaceutical-industry", "https://endpts.com/"],
    ["pharmaceutical-industry", "https://www.bayer.com/en/history/cl0n3-of-history"],
    ["cybersecurity-industry-report", "https://archive.org/details/malwaremuseum"],
    ["cybersecurity-industry-report", "https://www.cisa.gov/news-events/news/apache-log4j-vulnerability-guidance"],
    ["cybersecurity-industry-report", "https://www.csoonline.com/search/?q=Target+data+breach+2013+timeline"],
    ["cybersecurity-industry-report", "https://youtu.be/b_Cbfh0_9Ws?si=Nnc074hC6b-Ai_hp"],
    ["cybersecurity-industry-report", "https://youtu.be/O4fpqXjkdQM?si=cvrBatlQCwLvKdbC"],
    ["cybersecurity-industry-report", "https://youtu.be/tpBXSCMJXq4?si=omqdLRt6QzxRT2km"],
    ["cybersecurity-industry-report", "https://youtu.be/PWVN3Rq4gzw?si=pIolrzQdIUM3Dgcb"]
  ];
  for (const [articleId, url] of unresolved) {
    const entry = data.articles.find(article => article.id === articleId).entries.find(entry => entry.url === url);
    assert.ok(entry, url);
    assert.match(JSON.stringify(entry.citations), /Content not confirmed in the 2026-10-03 review/i, url);
  }
});
