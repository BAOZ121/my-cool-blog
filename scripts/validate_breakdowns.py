"""Validate the source schema, published maps and internal links (standard library only)."""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BUILD = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "public").resolve()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


class Page(HTMLParser):
    def __init__(self, path: Path):
        super().__init__()
        self.ids: list[str] = []
        self.links: list[str] = []
        self.tags: list[tuple[str, dict]] = []
        self.main_tags: list[tuple[str, dict]] = []
        self.in_main = False
        self.text = path.read_text(encoding="utf-8")
        self.feed(self.text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == "main":
            self.in_main = True
        if self.in_main:
            self.main_tags.append((tag, attrs))
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        for name in ("href", "src"):
            if attrs.get(name):
                self.links.append(attrs[name])

    def handle_endtag(self, tag):
        if tag == "main":
            self.in_main = False


def main() -> None:
    data = json.loads((ROOT / "data/breakdowns.json").read_text(encoding="utf-8"))
    dataset = json.loads((ROOT / "static/data/industries.json").read_text(encoding="utf-8"))
    ranks = {item["rank"]: item for item in dataset["industries"]}
    require(data["schema_version"] == 1, "Unsupported breakdown schema")
    require(date.fromisoformat(data["reviewed"]) <= date.today(), "Review date is in the future")
    profiles = data["profiles"]
    require(bool(profiles), "No profiles")
    require(len({p["id"] for p in profiles}) == len(profiles), "Duplicate profile IDs")
    require(len({p["dataset_rank"] for p in profiles}) == len(profiles), "Duplicate dataset links")
    for p in profiles:
        require(bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", p["id"])), "Unsafe profile ID")
        for key in ("name", "summary", "question", "scope", "geography", "category", "keywords", "economics"):
            require(bool(p.get(key, "").strip()), f"{p['id']}: missing {key}")
        require(p["dataset_rank"] in ranks, f"{p['id']}: unknown dataset row")
        require(p["category"] == ranks[p["dataset_rank"]]["category"], f"{p['id']}: category mismatch")
        require(len(p["chain"]) == 3, f"{p['id']}: must have three readable stages")
        for stage in p["chain"]:
            require(all(stage.get(k) for k in ("title", "actors", "role", "revenue", "bottleneck")), "Incomplete stage")
        require(len(p["metrics"]) == 3, "Expected three suggested metrics")
        require(all(m.get("name") and m.get("meaning") for m in p["metrics"]), "Incomplete metric")
        require(bool(p["drivers"]) and bool(p["risks"]), "Missing balanced watchlist")
        source_ids = {s["id"] for s in p["sources"]}
        require(len(source_ids) == len(p["sources"]), "Duplicate source IDs")
        require(bool(p["evidence"]), "Missing evidence anchors")
        require(source_ids == {e["source"] for e in p["evidence"]}, "Unmapped evidence or orphan source")
        for source in p["sources"]:
            require(all(source.get(k) for k in ("publisher", "title", "published", "type", "supports")), "Incomplete provenance")
            require(bool(re.fullmatch(r"[a-z0-9-]+", source["id"])), "Unsafe source ID")
            url = urlsplit(source["url"])
            require(url.scheme == "https" and bool(url.netloc), "Source must use HTTPS")

    require(BUILD.is_dir(), f"Build first: {BUILD}")
    pages = {p.resolve(): Page(p) for p in BUILD.rglob("*.html")}
    require(bool(pages), "No generated HTML")
    for p in profiles:
        path = BUILD / "industry-breakdowns" / p["id"] / "index.html"
        require(path in pages, f"Missing page: {path}")
        parsed = pages[path]
        require(len(parsed.ids) == len(set(parsed.ids)), f"Duplicate IDs: {path}")
        require(sum(tag == "h1" for tag, _ in parsed.main_tags) == 1, f"Expected a single main-content h1: {path}")
        require(sum(tag == "details" for tag, _ in parsed.tags) == 3, f"Missing native disclosures: {path}")
        require(all("source-" + s["id"] in parsed.ids for s in p["sources"]), "Missing source anchors")
        require(all(s["url"] in parsed.links for s in p["sources"]), "Missing primary-source links")
        require(all(r["url"] in parsed.links for r in p["related"]), "Missing related report")
    hub = pages[BUILD / "industry-breakdowns/index.html"]
    require(sum("data-breakdown-card" in attrs for _, attrs in hub.tags) == len(profiles), "Hub/profile mismatch")
    industry_page = pages[BUILD / "industries/index.html"]
    for p in profiles:
        link = f"/industry-breakdowns/{p['id']}/"
        require(link in hub.links and link in industry_page.links, f"Missing integration: {link}")
    exported = json.loads((BUILD / "data/industry-breakdowns.json").read_text(encoding="utf-8"))
    require(exported == data, "Published JSON diverges from source data")

    checks = 0
    errors = []
    for path, page in pages.items():
        rel = path.relative_to(BUILD).as_posix()
        current = "/" + rel.removesuffix("index.html") if rel.endswith("index.html") else "/" + rel
        for link in page.links:
            parsed = urlsplit(urljoin("https://thedexs.com" + current, link))
            require(parsed.hostname not in {"localhost", "127.0.0.1"}, f"Local URL: {path}: {link}")
            if parsed.scheme not in {"http", "https"} or parsed.netloc != "thedexs.com":
                continue
            target = BUILD / unquote(parsed.path).lstrip("/")
            if target.is_dir() or parsed.path.endswith("/"):
                target = target / "index.html"
            checks += 1
            if not target.exists():
                errors.append(f"{rel}: missing {link}")
            # Check fragments within the feature; old article fragments are outside this change.
            elif parsed.fragment and "industry-breakdowns" in parsed.path and target in pages:
                if unquote(parsed.fragment) not in pages[target].ids:
                    errors.append(f"{rel}: missing fragment {link}")
    require(not errors, "\n".join(errors))
    print(f"PASS: {len(profiles)} profiles, {len(pages)} HTML pages, {checks} internal references; source mappings and JSON export verified.")


if __name__ == "__main__":
    main()
