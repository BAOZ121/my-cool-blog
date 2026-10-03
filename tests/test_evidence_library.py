"""Regression tests for the dependency-free rendered citation extractor."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("evidence", Path(__file__).parents[1] / "scripts/build_evidence_library.py")
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class EvidenceExtractionTests(unittest.TestCase):
    def test_safe_urls_and_file_formats(self):
        self.assertIsNone(evidence.public_url("javascript:alert(1)", "/post/example/"))
        self.assertIsNone(evidence.public_url("#source-1", "/post/example/"))
        self.assertIsNone(evidence.public_url("asset-credits.txt", "/post/example/"))
        self.assertIsNone(evidence.public_url("/industry-breakdowns/cybersecurity/", "/post/example/"))
        self.assertEqual(evidence.public_url("https://publisher.test/report.PDF#page=4", "/post/example/"), ("https://publisher.test/report.PDF#page=4", ".pdf", False))
        self.assertEqual(evidence.public_url("https://www.sec.gov/Archives/edgar/data/a.htm", "/post/example/")[2], False)
        self.assertEqual(evidence.file_format("https://ojs.aaai.org/index.php/AAAI/article/view/41334/45295", ""), "PDF")
        self.assertEqual(evidence.file_format("https://publisher.test/unknown/123", ""), "Web")

    def test_pdf_preview_metadata_does_not_leak_to_next_source(self):
        html = '''<h1 class="article-title">Cybersecurity</h1>
        <section class="article-content"><h2 id="originals">Originals</h2>
        <section class="research-original"><p class="research-original__title">NIST SP 800-207</p>
        <p>Original PDF · NIST, 59 pages</p><p><a href="https://nist.test/report.pdf">Open PDF</a></p></section>
        <p><a href="https://menlo.test/map.pdf">Menlo market map</a> is a 2-page category map.</p></section>'''
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            article = build / "post/example/index.html"
            article.parent.mkdir(parents=True)
            article.write_text(html)
            result = evidence.parse_article(article, build)
        nist, menlo = result["entries"]
        self.assertIn("Original PDF · NIST, 59 pages", nist["citations"][0]["notes"])
        self.assertNotIn("59 pages", str(menlo))
        self.assertNotIn("NIST", str(menlo))

    def test_reference_titles_context_dedup_and_article_downloads(self):
        html = '''<h1 class="article-title">Example report</h1>
        <meta property="article:published_time" content="2026-10-01T00:00:00Z">
        <nav class="research-actions"><a download href="/data/example.csv">Download data (CSV)</a></nav>
        <section class="article-content"><h2 id="history">History</h2>
        <p>Claim <a href="https://publisher.test/source">H01</a>.</p>
        <figure><h3 id="chart">A chart</h3><p>Chart scope only.</p><p>Source: <a href="https://publisher.test/chart">Chart report</a></p></figure>
        <p>Body paragraph outside the chart.</p>
        <h2 id="references">References</h2><p>[H01] Publisher, “Original Source.” <a href="https://publisher.test/source">https://publisher.test/source</a></p>
        <h3 id="evidence-1">Evidence 1</h3><ul><li><a href="https://publisher.test/report.pdf">A report</a></li></ul><p>Location: p. 4. Not a market share.</p>
        <p><a href="javascript:alert(1)">Unsafe</a></p></section>'''
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            article = build / "post/example/index.html"
            article.parent.mkdir(parents=True)
            article.write_text(html)
            (build / "data").mkdir()
            (build / "data/example.csv").write_text("a,b\n")
            result = evidence.parse_article(article, build)
        self.assertEqual(len(result["entries"]), 4)
        self.assertEqual(result["published"], "2026-10-01")
        source = result["entries"][0]
        self.assertEqual(source["title"], '[H01] Publisher, “Original Source.”')
        self.assertEqual(len(source["citations"]), 2)
        chart = result["entries"][1]
        self.assertIn("Chart scope only.", chart["citations"][0]["notes"])
        self.assertNotIn("Body paragraph outside the chart.", chart["citations"][0]["notes"])
        report = result["entries"][2]
        self.assertIn("Location: p. 4. Not a market share.", report["citations"][0]["notes"])
        self.assertEqual(result["entries"][3]["url"], "/data/example.csv")


if __name__ == "__main__":
    unittest.main()
