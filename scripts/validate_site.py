"""Check the industry export and generated internal links without extra dependencies."""
from __future__ import annotations

import csv
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
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        self.urls.extend(fields[key] for key in ("href", "src") if fields.get(key))


class IndustryTable(HTMLParser):
    def __init__(self, path: Path):
        super().__init__()
        self.dataset = ""
        self.in_dataset = False
        self.in_table = False
        self.select = None
        self.ranks = []
        self.options = {"ix-category": [], "ix-maturity": []}
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "script" and fields.get("id") == "ix-dataset":
            self.in_dataset = True
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

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_dataset = False
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
    for item, row in zip(items, rows):
        for key, value in item.items():
            assert row[key] == ("" if value is None else str(value)), f"Row {item['rank']}: {key} mismatch"

    assert BUILD.is_dir(), "Build the site first"
    pages = list(BUILD.rglob("*.html"))
    assert pages, "No generated HTML"
    industry_page = IndustryTable(BUILD / "industries/index.html")
    assert json.loads(industry_page.dataset) == data, "Embedded industry JSON diverges from the download"
    assert industry_page.ranks == list(range(1, 51)), "Static industry rows are missing or out of order"
    for select, field in (("ix-category", "category"), ("ix-maturity", "maturity")):
        assert set(industry_page.options[select]) == {"", *(item[field] for item in items)}, select
    search_index = json.loads((BUILD / "search/index.json").read_text(encoding="utf-8"))
    indexed_urls = {entry["permalink"] for entry in search_index}
    assert all(
        f"/industry-breakdowns/{profile['id']}/" in indexed_urls
        for profile in json.loads((ROOT / "data/breakdowns.json").read_text(encoding="utf-8"))["profiles"]
    ), "Industry maps must be searchable"
    assert "/industries/" in indexed_urls and "/post/my-first-post/" not in indexed_urls
    assert "See the structure. Check the evidence." in (BUILD / "index.html").read_text(encoding="utf-8")
    for slug in ("pharmaceutical-industry", "cybersecurity-industry-report", "vr-industry-report-2026"):
        article = (BUILD / "post" / slug / "index.html").read_text(encoding="utf-8")
        assert "Source notes and primary materials" in article, f"Missing article bibliography: {slug}"
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
