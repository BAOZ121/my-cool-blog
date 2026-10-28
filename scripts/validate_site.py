"""Check the industry export and generated internal links without extra dependencies."""
from __future__ import annotations

import hashlib
import json
import sys
import xml.etree.ElementTree as ET
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


def main() -> None:
    assert BUILD.is_dir(), "Build the site first"
    pages = list(BUILD.rglob("*.html"))
    assert pages, "No generated HTML"
    profiles = json.loads((ROOT / "data/breakdowns.json").read_text(encoding="utf-8"))["profiles"]
    retired = ("industries/index.html", "post/50-high-potential-industries/index.html", "data/industries.json", "data/industries.csv")
    for path in retired:
        assert not (BUILD / path).exists(), f"Withdrawn list still published: {path}"
    homepage = (BUILD / "index.html").read_text(encoding="utf-8")
    assert "See the structure. Check the evidence." not in homepage
    assert "research-home-query" not in homepage
    assert 'class="research-landing"' not in homepage
    search_index = json.loads((BUILD / "search/index.json").read_text(encoding="utf-8"))
    indexed_urls = {entry["permalink"] for entry in search_index}
    assert "/industry-breakdowns/" not in indexed_urls, "Retired directory remains in search"
    sitemap_urls = {
        urlsplit(node.text).path.rstrip("/")
        for path in BUILD.rglob("*sitemap*.xml")
        for node in ET.parse(path).getroot().iter()
        if node.tag.endswith("}loc") and node.text
    }
    assert "/industry-breakdowns" not in sitemap_urls, "Retired directory remains in sitemap"
    assert all(
        f"/industry-breakdowns/{profile['id']}" in sitemap_urls
        for profile in profiles
    ), "Individual industry maps must remain in sitemap"
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
    assert "/post/my-first-post/" not in indexed_urls
    for retired_url in ("/industries/", "/post/50-high-potential-industries/"):
        assert retired_url not in indexed_urls, f"Withdrawn list in search: {retired_url}"
        assert retired_url.rstrip("/") not in sitemap_urls, f"Withdrawn list in sitemap: {retired_url}"
    for path in BUILD.rglob("index.xml"):
        assert "50-high-potential-industries" not in path.read_text(encoding="utf-8"), f"Withdrawn list in feed: {path}"
    assert len(list((BUILD / "post").glob("*/index.html"))) == 24, "Expected all 24 unrelated articles"
    evidence = json.loads((ROOT / "data/evidence_library.json").read_text(encoding="utf-8"))
    assert not any(article["id"] == "50-high-potential-industries" for article in evidence["articles"])
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
    print(f"PASS: list withdrawal, 24 retained articles, {len(pages)} HTML pages, {checked} internal links")


if __name__ == "__main__":
    main()
