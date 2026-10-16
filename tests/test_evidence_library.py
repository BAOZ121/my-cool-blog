"""Regression tests for the dependency-free rendered citation extractor."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("evidence", Path(__file__).parents[1] / "scripts/build_evidence_library.py")
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class EvidenceExtractionTests(unittest.TestCase):
    def test_research_evidence_records_keep_titles_anchors_and_independent_notes(self):
        source_ids = ([f"H{number:02}" for number in range(1, 16)]
                      + [f"C{number:02}" for number in range(1, 20)]
                      + ["M01", "M02", "I01"])
        records = []
        for source_id in source_ids:
            records.append(f'''<section class="research-evidence" id="source-{source_id}" data-source-id="{source_id}">
            <h3>[{source_id}] Original source &amp; reporting scope {source_id}</h3>
            <p class="research-source-identity">Publisher and dates for {source_id}.</p>
            <p>Supports only {source_id}; no market-share conclusion. Retain the complete limitation.</p>
            <p><a href="https://publisher.test/{source_id}">Publisher original</a></p></section>''')
        html = '''<h1 class="article-title">Agricultural evidence fixture</h1>
        <section class="article-content"><h2 id="appendix">Supporting Evidence</h2>
        <p>Appendix introduction outside individual sources.</p>''' + "".join(records) + '''
        <p>Ordinary note following the source records.</p>
        <p><a href="https://publisher.test/following">Following material</a></p></section>'''
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            article = build / "post/agricultural-technology-equipment/index.html"
            article.parent.mkdir(parents=True)
            article.write_text(html, encoding="utf-8")
            result = evidence.parse_article(article, build)
        entries = {entry["url"]: entry for entry in result["entries"]}
        self.assertEqual(len(source_ids), 37)
        self.assertEqual(len(entries), 38)
        for source_id in source_ids:
            with self.subTest(source_id=source_id):
                entry = entries[f"https://publisher.test/{source_id}"]
                self.assertEqual(entry["title"], f"[{source_id}] Original source & reporting scope {source_id}")
                citation, = entry["citations"]
                self.assertEqual(citation["url"], "/post/agricultural-technology-equipment/#source-" + source_id)
                self.assertEqual(citation["section"], entry["title"])
                self.assertEqual(citation["notes"], [
                    f"Publisher and dates for {source_id}.",
                    f"Supports only {source_id}; no market-share conclusion. Retain the complete limitation.",
                ])
        following, = entries["https://publisher.test/following"]["citations"]
        self.assertEqual(following["url"], "/post/agricultural-technology-equipment/#appendix")
        self.assertEqual(following["notes"], [
            "Appendix introduction outside individual sources.",
            "Ordinary note following the source records.",
        ])

    def test_shared_research_source_keeps_each_record_anchor_and_scope(self):
        html = '''<h1 class="article-title">Shared source fixture</h1><section class="article-content">
        <section class="research-evidence" id="source-C01" data-source-id="C01"><h3>[C01] Shared filing: annual scope</h3>
        <p>Annual scope only.</p><p><a href="https://publisher.test/shared">Publisher original</a></p></section>
        <section class="research-evidence" id="source-C02" data-source-id="C02"><h3>[C02] Shared filing: interim scope</h3>
        <p>Interim scope only.</p><p><a href="https://publisher.test/shared">Publisher original</a></p></section>
        </section>'''
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            article = build / "post/example/index.html"
            article.parent.mkdir(parents=True)
            article.write_text(html, encoding="utf-8")
            result = evidence.parse_article(article, build)
        entry, = result["entries"]
        self.assertNotEqual(entry["title"], "Publisher original")
        self.assertEqual([citation["url"] for citation in entry["citations"]], [
            "/post/example/#source-C01", "/post/example/#source-C02",
        ])
        self.assertEqual([citation["notes"] for citation in entry["citations"]], [
            ["Annual scope only."], ["Interim scope only."],
        ])

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

    def test_amd_source_scopes_keep_independent_citations_and_complete_notes(self):
        shared_url = "https://publisher.test/shared-filing"
        h01_notes = [
            "Dates and location: Historical incorporation section, page 1.",
            "Support and limits: Supports the incorporation date only; "
            "does not establish an offering price or later financial results.",
        ]
        f01_notes = [
            "Dates and location: Audited financial statements, pages 40-54.",
            "Support and limits: " + "Retain each qualification without truncation. " * 30
            + "This source does not establish subsequent quarterly results.",
        ]
        op01_notes = [
            "Dates and location: Manufacturing disclosures, page 12.",
            "Support and limits: A supplier relationship does not establish model-specific quantities.",
        ]
        html = f'''<h1 class="article-title">AMD scope regression</h1>
        <section class="article-content"><h2 id="history">History</h2>
        <p>Ordinary historical section note.</p>
        <p><a href="https://publisher.test/history">Historical source</a></p>
        <h2 id="sources">Sources and reading scope</h2>
        <p class="source-entry">General appendix introduction.</p>
        <p class="source-entry"><span class="source-label" id="amd-source-H01">[H01]</span>
        Historical reading of <a href="{shared_url}">Shared filing</a></p>
        <p class="source-entry">{h01_notes[0]}</p><p class="source-entry">{h01_notes[1]}</p>
        <p class="source-entry"><span class="source-label" id="amd-source-F01">[F01]</span>
        Financial reading of <a href="{shared_url}">Shared filing</a></p>
        <p class="source-entry">{f01_notes[0]}</p><p class="source-entry">{f01_notes[1]}</p>
        <p class="source-entry"><span class="source-label" id="amd-source-OP01">[OP01]</span>
        <a href="https://publisher.test/manufacturing">Manufacturing source</a></p>
        <p class="source-entry">{op01_notes[0]}</p><p class="source-entry">{op01_notes[1]}</p>
        <h2 id="ordinary">Ordinary section</h2><p>Ordinary section qualification.</p>
        <p><span class="source-label" id="ordinary-source-1">[1]</span>
        <a href="https://publisher.test/ordinary">Ordinary source</a></p>
        <p>Ordinary trailing limitation.</p></section>'''
        with tempfile.TemporaryDirectory() as directory:
            build = Path(directory)
            article = build / "post/amd-company-research/index.html"
            article.parent.mkdir(parents=True)
            article.write_text(html, encoding="utf-8")
            result = evidence.parse_article(article, build)

        entries = {entry["url"]: entry for entry in result["entries"]}
        self.assertEqual(len(entries), 4)
        shared = entries[shared_url]
        self.assertEqual(len(shared["citations"]), 2)
        for citation, source_id, notes in zip(
            shared["citations"], ("H01", "F01"), (h01_notes, f01_notes)
        ):
            with self.subTest(source_id=source_id):
                self.assertEqual(citation["url"], "/post/amd-company-research/#amd-source-" + source_id)
                self.assertEqual(citation["section"], "Sources and reading scope — [" + source_id + "]")
                self.assertIn("[" + source_id + "]", citation["text"])
                self.assertEqual(citation["notes"], notes)
        manufacturing = entries["https://publisher.test/manufacturing"]["citations"][0]
        self.assertEqual(manufacturing["url"], "/post/amd-company-research/#amd-source-OP01")
        self.assertEqual(manufacturing["notes"], op01_notes)

        history = entries["https://publisher.test/history"]["citations"][0]
        self.assertEqual(history["url"], "/post/amd-company-research/#history")
        self.assertEqual(history["notes"], ["Ordinary historical section note."])
        ordinary = entries["https://publisher.test/ordinary"]["citations"][0]
        self.assertEqual(ordinary["url"], "/post/amd-company-research/#ordinary")
        self.assertEqual(ordinary["section"], "Ordinary section")
        self.assertEqual(ordinary["notes"], [
            "Ordinary section qualification.", "Ordinary trailing limitation."
        ])


if __name__ == "__main__":
    unittest.main()
