"""Index public article citations from Hugo HTML; never fetch or copy source documents.

Run Hugo, then this script, then Hugo again. CI uses --check after a clean build.
The generated manifest contains only links/text already published in article bodies
and file links in their article tools. No private research directories are scanned.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "data/evidence_library.json"
ORIGIN = "https://thedexs.com"
FILE_TYPES = {".pdf", ".csv", ".json", ".xlsx", ".xls", ".docx", ".doc", ".txt", ".zip"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


def compact(text):
    return re.sub(r"\s+", " ", text).strip()


class Element:
    def __init__(self, tag="root", attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Element):
                yield from child.walk()

    def text(self):
        if self.tag in {"script", "style", "button", "iframe"}:
            return ""
        return compact(" ".join(child.text() if isinstance(child, Element) else child for child in self.children))

    def has_class(self, value):
        return value in self.attrs.get("class", "").split()

    def ancestors(self):
        current = self.parent
        while current:
            yield current
            current = current.parent


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Element()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs, self.current)
        self.current.children.append(element)
        if tag not in VOID:
            self.current = element

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for ancestor in [self.current, *self.current.ancestors()]:
            if ancestor.tag == tag:
                self.current = ancestor.parent or self.root
                break

    def handle_data(self, data):
        self.current.children.append(data)


def public_url(href, article_url):
    href = href.strip()
    if not href or href.startswith("#"):
        return None
    parsed = urlsplit(urljoin(ORIGIN + article_url, href))
    if parsed.scheme not in {"http", "https"}:
        return None
    local = parsed.netloc == urlsplit(ORIGIN).netloc
    extension = Path(unquote(parsed.path)).suffix.lower()
    if local and Path(parsed.path).name in {"asset-credits.txt", "simple-icons-license.txt", "lobe-icons-license.txt"}:
        return None  # Asset licenses are not article evidence.
    if local and extension not in FILE_TYPES:
        return None  # Navigation, internal reports, images and anchor links are not evidence assets.
    url = parsed._replace(scheme="", netloc="").geturl() if local else parsed.geturl()
    return url, extension, local


def title_for(link, block, url):
    for ancestor in link.ancestors():
        if ancestor.has_class("research-original"):
            title = next((item.text() for item in ancestor.walk() if item.has_class("research-original__title")), "")
            if title:
                return title
        if ancestor.has_class("article-visual") and Path(urlsplit(url).path).suffix == ".csv":
            title = next((item.text() for item in ancestor.walk() if item.tag == "h3"), "")
            if title:
                return title + " — data (CSV)"
    label = link.text()
    if label.startswith(("http://", "https://")):
        prefix = compact(block.text().split(label, 1)[0]).strip(" .—–")
        if prefix:
            return prefix
    return label or url


def title_score(title):
    if re.fullmatch(r"\[?[A-Z]?\d+\]?", title):
        return 0
    if title.startswith(("http://", "https://")):
        return 1
    return min(len(title), 160) + 2


def parse_article(path, build):
    doc = Document(path.read_text(encoding="utf-8")).root
    nodes = list(doc.walk())
    content = next((node for node in nodes if node.has_class("article-content")), None)
    if content is None:
        return None
    title = next(node.text() for node in nodes if node.tag == "h1" and node.has_class("article-title"))
    article_url = "/" + path.parent.relative_to(build).as_posix() + "/"
    article_id = path.parent.name
    published = next((node.attrs.get("content", "")[:10] for node in nodes if node.tag == "meta" and node.attrs.get("property") == "article:published_time"), "")
    section = {"title": "Article", "id": "", "notes": []}
    links = []
    notices = []
    def scan(node, section):
        # A chart/map heading is local to its figure, not the following article prose.
        outer = section
        isolated = node.tag == "figure"
        if isolated:
            section = {"title": section["title"], "id": section["id"], "notes": []}
        if re.fullmatch(r"h[2-6]", node.tag):
            section = {"title": node.text().rstrip(" #"), "id": node.attrs.get("id", ""), "notes": []}
        elif node.tag == "p":
            text = node.text()
            if not any(item.tag == "a" and public_url(item.attrs.get("href", ""), article_url) for item in node.walk()):
                section["notes"].append(text)
            if text.startswith("Evidence status (reviewed") or "have not all been independently verified" in text or "incident specifics remain unverified" in text or "reading leads, not independent verification" in text:
                notices.append(text)
        elif node.tag == "a":
            links.append((node, section))
        for child in node.children:
            if isinstance(child, Element):
                section = scan(child, section)
        return outer if isolated else section

    scan(content, section)
    # Frontmatter dataDownload is rendered outside the article body.
    for node in nodes:
        if node.has_class("research-actions"):
            links.extend((link, {"title": "Article downloads", "id": "", "notes": []}) for link in node.walk() if link.tag == "a" and "download" in link.attrs)
    entries = {}
    for link, section in links:
        parsed = public_url(link.attrs.get("href", ""), article_url)
        if not parsed:
            continue
        url, extension, local = parsed
        block = next((ancestor for ancestor in link.ancestors() if ancestor.tag in {"li", "p", "td", "figcaption"}), link)
        title_label = title_for(link, block, url)
        context = block.text()
        notes = list(dict.fromkeys(text for text in section["notes"] if text and text != context))
        # Do not silently truncate original scope notes or verification caveats.
        citation = {"section": section["title"], "url": article_url + ("#" + section["id"] if section["id"] else ""), "text": context, "notes": notes}
        if url not in entries:
            entry = {"id": hashlib.sha256(url.encode()).hexdigest()[:12], "url": url, "title": title_label,
                     "kind": "file" if extension in FILE_TYPES else "link", "format": extension.lstrip(".").upper() if extension in FILE_TYPES else "Web",
                     "host": "DEX Research" if local else urlsplit(url).netloc.removeprefix("www."), "local": local, "citations": []}
            entries[url] = entry
        entry = entries[url]
        if title_score(title_label) > title_score(entry["title"]):
            entry["title"] = title_label
        if citation not in entry["citations"]:
            entry["citations"].append(citation)
        if local:
            asset = build / unquote(urlsplit(url).path).lstrip("/")
            assert asset.is_file(), f"Missing published file: {url}"
    return {"id": article_id, "title": title, "url": article_url, "published": published,
            "notices": list(dict.fromkeys(notices)), "entries": list(entries.values())}


def generate(build):
    articles = [article for path in sorted((build / "post").glob("*/index.html")) if (article := parse_article(path, build))]
    articles.sort(key=lambda article: (article["published"], article["id"]), reverse=True)
    assert articles, "No published articles found; build Hugo first"
    all_entries = [entry for article in articles for entry in article["entries"]]
    return {"schema_version": 1, "articles": articles, "counts": {"articles": len(articles), "materials": len(all_entries),
            "files": sum(entry["kind"] == "file" for entry in all_entries), "hosted_files": len({entry["url"] for entry in all_entries if entry["local"]})}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("build", nargs="?", type=Path, default=ROOT / "public")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = generate(args.build.resolve())
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert DESTINATION.read_text(encoding="utf-8") == rendered, "Evidence index is stale. Run Hugo, python3 scripts/build_evidence_library.py, then Hugo again."
        print("Evidence index matches published article links, downloads and citation context.")
    else:
        DESTINATION.write_text(rendered, encoding="utf-8")
        print(json.dumps(result["counts"]))
        for article in result["articles"]:
            print(f"{article['id']}: {len(article['entries'])} materials")


if __name__ == "__main__":
    main()
