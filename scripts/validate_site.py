"""Check the industry export and generated internal links without extra dependencies."""
from __future__ import annotations

import csv
from datetime import date
import hashlib
import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BUILD = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "public").resolve()


class Links(HTMLParser):
    def __init__(self, path: Path):
        super().__init__()
        self.urls: list[str] = []
        self.ids: set[str] = set()
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        self.urls.extend(fields[key] for key in ("href", "src") if fields.get(key))
        if fields.get("id"):
            self.ids.add(fields["id"])


class IndustryTable(HTMLParser):
    def __init__(self, path: Path):
        super().__init__()
        self.dataset = ""
        self.research_links = ""
        self.in_dataset = False
        self.in_research_links = False
        self.in_table = False
        self.select = None
        self.ranks = []
        self.options = {"ix-category": [], "ix-maturity": []}
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "script" and fields.get("id") == "ix-dataset":
            self.in_dataset = True
        elif tag == "script" and fields.get("id") == "ix-research-links":
            self.in_research_links = True
        elif tag == "tbody" and fields.get("id") == "ix-tbody":
            self.in_table = True
        elif tag == "tr" and self.in_table:
            self.ranks.append(int(fields["data-rank"]))
        elif tag == "select":
            self.select = fields.get("id")
        elif tag == "option" and self.select in self.options:
            assert "value" in fields, f"Explicit value required for translated {self.select} option"
            self.options[self.select].append(fields["value"] or "")

    def handle_data(self, data):
        if self.in_dataset:
            self.dataset += data
        elif self.in_research_links:
            self.research_links += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_dataset = False
            self.in_research_links = False
        elif tag == "tbody":
            self.in_table = False
        elif tag == "select":
            self.select = None


def main() -> None:
    data = json.loads((ROOT / "static/data/industries.json").read_text(encoding="utf-8"))
    with (ROOT / "static/data/industries.csv").open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    items = data["industries"]
    assert len(items) == len(rows) == 50, "Expected 50 industry records in both formats"
    assert [int(row["rank"]) for row in rows] == [item["rank"] for item in items] == list(range(1, 51))
    baseline_fields = (
        "year", "value", "unit", "currency", "metric", "geography",
        "market_definition", "relationship_to_estimate",
    )
    source_fields = ("publisher", "title", "published", "url")
    for item, row in zip(items, rows):
        flat = {key: value for key, value in item.items() if key != "sourced_baseline"}
        flat.update({f"baseline_{key}": "" for key in baseline_fields})
        flat.update({f"baseline_source_{key}": "" for key in source_fields})
        baseline = item.get("sourced_baseline")
        status = item.get("verification_status")
        assert status in {"unverified", "partial", "context"}, f"Row {item['rank']}: unsupported evidence status"
        assert item.get("estimate_verification_status") == "unverified", "Original screening estimates remain unverified"
        for key in ("numeric_source_url", "source_date", "geography", "market_definition"):
            assert item[key] == "", f"Row {item['rank']}: original estimate provenance changed"
        if baseline is None:
            assert status == "unverified" and item["reviewed"] == "", "Missing evidence must not imply source review"
        else:
            assert status in {"partial", "context"}, "Separate evidence must not verify the original estimate"
            assert all(baseline.get(key) not in (None, "") for key in baseline_fields), "Incomplete baseline scope"
            assert all(baseline["source"].get(key) for key in source_fields), "Incomplete baseline source"
            assert isinstance(baseline["value"], (int, float)) and baseline["value"] > 0
            assert baseline["currency"] == "USD" and baseline["unit"] == "billion", "Unexpected source unit"
            reviewed = date.fromisoformat(item["reviewed"])
            published = baseline["source"]["published"]
            assert len(published) in {4, 7, 10}, "Publication date precision must be explicit"
            publication_date = date.fromisoformat(published + {4: "-01-01", 7: "-01", 10: ""}[len(published)])
            assert publication_date <= reviewed and baseline["year"] <= reviewed.year, "Source cannot postdate review"
            assert urlsplit(baseline["source"]["url"]).scheme == "https", "Source requires HTTPS"
            flat.update({f"baseline_{key}": baseline[key] for key in baseline_fields})
            flat.update({f"baseline_source_{key}": baseline["source"][key] for key in source_fields})
        assert set(row) == set(flat), f"Row {item['rank']}: CSV fields diverge from JSON"
        for key, value in flat.items():
            assert row[key] == ("" if value is None else str(value)), f"Row {item['rank']}: {key} mismatch"

    assert BUILD.is_dir(), "Build the site first"
    pages = list(BUILD.rglob("*.html"))
    assert pages, "No generated HTML"
    industry_page = IndustryTable(BUILD / "industries/index.html")
    assert json.loads(industry_page.dataset) == data, "Embedded industry JSON diverges from the download"
    assert industry_page.ranks == list(range(1, 51)), "Static industry rows are missing or out of order"
    for select, field in (("ix-category", "category"), ("ix-maturity", "maturity")):
        assert set(industry_page.options[select]) == {"", *(item[field] for item in items)}, select
    parsed_industry = Links(BUILD / "industries/index.html")
    assert all(f"ix-industry-{item['rank']}" in parsed_industry.ids for item in items), "Missing stable dataset destinations"
    research_links = json.loads(industry_page.research_links)
    profiles = json.loads((ROOT / "data/breakdowns.json").read_text(encoding="utf-8"))["profiles"]
    assert all(str(profile["dataset_rank"]) in research_links for profile in profiles), "Missing dataset-to-breakdown navigation"
    assert "47" in research_links, "XR report must be reachable from the broader XR dataset row"
    for rank, links in research_links.items():
        assert int(rank) in {item["rank"] for item in items}, "Research linked to an unknown dataset row"
        for link in links:
            parsed = urlsplit(link["url"])
            assert not parsed.netloc and not parsed.scheme and parsed.path.startswith("/"), "Research routes must be internal"
            target = BUILD / unquote(parsed.path).lstrip("/") / "index.html"
            assert target.is_file(), f"Research route has no generated page: {link['url']}"
            assert link["url"] in parsed_industry.urls, f"Research route unavailable without JavaScript: {link['url']}"
            if parsed.fragment:
                assert unquote(parsed.fragment) in Links(target).ids, f"Research route has no rendered graphic: {link['url']}"
    for rank in (2, 8, 21, 47):
        labels = {link["label"] for link in research_links[str(rank)]}
        assert {"Read report", "View industry mind map", "View share chart"} <= labels, f"Incomplete article/graphic navigation for row {rank}"
    search_index = json.loads((BUILD / "search/index.json").read_text(encoding="utf-8"))
    indexed_urls = {entry["permalink"] for entry in search_index}
    assert all(
        f"/industry-breakdowns/{profile['id']}/" in indexed_urls
        for profile in profiles
    ), "Industry maps must be searchable"
    for profile in profiles:
        content = next(entry["content"] for entry in search_index if entry["permalink"] == f"/industry-breakdowns/{profile['id']}/")
        searchable = [profile[key] for key in ("summary", "scope", "question", "geography", "economics")]
        searchable += profile["drivers"] + profile["risks"]
        searchable += [stage[key] for stage in profile["chain"] for key in ("title", "actors", "role", "revenue", "bottleneck")]
        searchable += [metric[key] for metric in profile["metrics"] for key in ("name", "meaning")]
        searchable += [evidence["text"] for evidence in profile["evidence"]]
        searchable += [source[key] for source in profile["sources"] for key in ("publisher", "title", "published", "type", "supports")]
        assert all(value in content for value in searchable), f"Search omits visible breakdown content: {profile['id']}"
    assert "/industries/" in indexed_urls and "/post/my-first-post/" not in indexed_urls
    assert "See the structure. Check the evidence." in (BUILD / "index.html").read_text(encoding="utf-8")
    for slug in ("pharmaceutical-industry", "cybersecurity-industry-report", "vr-industry-report-2026"):
        article = (BUILD / "post" / slug / "index.html").read_text(encoding="utf-8")
        assert "Source notes and primary materials" in article, f"Missing article bibliography: {slug}"
    originals = {
        "pharmaceutical-industry": (
            "research-files/pharmaceutical/STATUTE-76-Pg780.pdf",
            "6c91250d39a8bac71edefb40689eaf4027f87a38d98611a98faf86ae071c299d",
        ),
        "cybersecurity-industry-report": (
            "research-files/cybersecurity/NIST.SP.800-207.pdf",
            "0290d6ece24874287316f4bf430fef770aa4ec08a2227c8f2c1e5b2ff975e03d",
        ),
    }
    assert {
        p.relative_to(ROOT / "static").as_posix()
        for p in (ROOT / "static/research-files").rglob("*") if p.is_file()
    } == {path for path, _ in originals.values()}, "Unexpected research file in public assets"
    for slug, (path, expected_sha256) in originals.items():
        source = (ROOT / "static" / path).read_bytes()
        assert source.startswith(b"%PDF-"), f"Not a PDF: {path}"
        assert hashlib.sha256(source).hexdigest() == expected_sha256, f"Original altered: {path}"
        assert (BUILD / path).read_bytes() == source, f"Built PDF differs from original: {path}"
        article = (BUILD / "post" / slug / "index.html").read_text(encoding="utf-8")
        assert f'src="/{path}#view=FitH"' in article, f"Missing PDF preview: {slug}"
        assert f"href=/{path} download" in article, f"Missing PDF download: {slug}"
    checked = 0
    errors = []
    for page in pages:
        current = "/" + page.relative_to(BUILD).as_posix().removesuffix("index.html")
        for link in Links(page).urls:
            parsed = urlsplit(urljoin("https://thedexs.com" + current, link))
            assert parsed.hostname not in {"localhost", "127.0.0.1"}, f"Local URL: {page}: {link}"
            if parsed.scheme not in {"http", "https"} or parsed.netloc != "thedexs.com":
                continue
            target = BUILD / unquote(parsed.path).lstrip("/")
            if target.is_dir() or parsed.path.endswith("/"):
                target = target / "index.html"
            checked += 1
            if not target.exists():
                errors.append(f"{page.relative_to(BUILD)}: {link}")
    assert not errors, "Missing internal links:\n" + "\n".join(errors)
    print(f"PASS: {len(items)} matched CSV/JSON and static HTML rows, {len(pages)} HTML pages, {checked} internal links")


if __name__ == "__main__":
    main()
