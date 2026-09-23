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
    print(f"PASS: {len(items)} matched CSV/JSON rows, {len(pages)} HTML pages, {checked} internal links")


if __name__ == "__main__":
    main()
