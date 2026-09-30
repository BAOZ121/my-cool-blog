"""Expand article graphics to printable HTML without browser or PDF dependencies."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit


DATA_PATH = Path(__file__).resolve().parents[1] / "data/article_visuals.json"
SITE_URL = "https://thedexs.com/"
SHORTCODE = re.compile(
    r"\{\{<\s*(industry-map|market-share)\b(.*?)>\}\}", re.DOTALL
)
ID_ATTRIBUTE = re.compile(r"\s*id\s*=\s*([\"'])(.*?)\1\s*", re.DOTALL)


def _escape(value: object) -> str:
    return html.escape(str(value), quote=True)


def _source_link(source: dict) -> str:
    # Absolute links also work when WeasyPrint uses a local article as its base URL.
    url = urljoin(SITE_URL, source["url"])
    if urlsplit(url).scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported article graphic source URL: {source['url']!r}")
    title = source["title"]
    if source.get("publisher"):
        title = f"{source['publisher']} — {title}"
    link = f'<a href="{_escape(url)}">{_escape(title)}</a>'
    if source.get("published"):
        link += f" ({_escape(source['published'])})"
    return f"{link} — {_escape(url)}"


def _outline(node: dict) -> str:
    children = node.get("children", [])
    nested = "<ul>" + "".join(_outline(child) for child in children) + "</ul>" if children else ""
    return f"<li>{_escape(node['name'])}{nested}</li>"


def _map_html(data: dict) -> str:
    sources = "<ul>" + "".join(f"<li>{_source_link(source)}</li>" for source in data["sources"]) + "</ul>"
    return (
        '<div class="article-visual-pdf" data-visual="map">'
        f"<h3>{_escape(data['title'])}</h3>"
        f"<p>{_escape(data.get('description', ''))}</p>"
        f"<ul>{_outline(data['root'])}</ul>"
        f"<p>{_escape(data['note'])}</p>"
        f"<p><strong>Sources:</strong></p>{sources}"
        f"<p>Reviewed {_escape(data['reviewed'])}.</p></div>"
    )


def _share_html(data: dict) -> str:
    rows = "".join(
        f'<tr><th scope="row">{_escape(item["name"])}</th>'
        f'<td>{_escape(item["value"])}%</td></tr>'
        for item in data["series"]
    )
    source = data["source"]
    source_details = "".join(
        f"<p>{label}: {_escape(source[key])}</p>"
        for key, label in (("underlying", "Underlying research"), ("locator", "Source location"))
        if source.get(key)
    )
    rounding = f"<p>{_escape(data['rounding_note'])}</p>" if data.get("rounding_note") else ""
    return (
        '<div class="article-visual-pdf" data-visual="share">'
        f"<h3>{_escape(data['title'])}</h3>"
        f"<p><strong>Period:</strong> {_escape(data['period'])}<br>"
        f"<strong>Geography:</strong> {_escape(data['geography'])}<br>"
        f"<strong>Metric:</strong> {_escape(data['metric'])}</p>"
        f"<p><strong>Scope:</strong> {_escape(data['scope'])}</p>"
        f'<table><thead><tr><th scope="col">{_escape(data.get("dimension", "Company"))}</th>'
        f'<th scope="col">Share (%)</th></tr></thead><tbody>{rows}</tbody></table>'
        f"<p>{_escape(data['note'])}</p>{rounding}"
        f"<p><strong>Source:</strong> {_source_link(source)}</p>{source_details}"
        f"<p>Reviewed {_escape(data['reviewed'])}.</p></div>"
    )


def replace_article_visuals(body_markdown: str, data_path: Path = DATA_PATH) -> str:
    """Replace supported Hugo graphic shortcodes with complete, escaped HTML.

    Unknown IDs and malformed attributes fail explicitly so a PDF cannot silently
    omit a graphic or print an unresolved shortcode. Other Hugo shortcodes pass
    through unchanged for their existing rendering paths.
    """
    if not SHORTCODE.search(body_markdown):
        return body_markdown
    data = json.loads(Path(data_path).read_text(encoding="utf-8"))

    def replace(match: re.Match) -> str:
        kind, attributes = match.groups()
        identifier = ID_ATTRIBUTE.fullmatch(attributes)
        if not identifier:
            raise ValueError(f"Invalid {kind} shortcode attributes: {attributes!r}")
        key = identifier.group(2)
        collection = data["maps" if kind == "industry-map" else "shares"]
        if key not in collection:
            raise ValueError(f"Unknown {kind} ID: {key!r}")
        render = _map_html if kind == "industry-map" else _share_html
        return "\n\n" + render(collection[key]) + "\n\n"

    return SHORTCODE.sub(replace, body_markdown)
