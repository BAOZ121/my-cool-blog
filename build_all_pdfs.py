"""Generate printable PDF copies of published Hugo posts.

The website also exposes a browser-native "Print / Save PDF" action. This
script is for maintainers who want static PDF files under ``static/pdf``.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

import markdown
import weasyprint
import yaml


CONTENT_DIR = Path("content/post")
OUTPUT_DIR = Path("static/pdf")

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    @page {
        size: A4;
        margin: 18mm 15mm;
        background-color: #f8fafc;
        @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8.5pt; color: #64748b; }
        @bottom-left { content: "DEX Business Research | thedexs.com"; font-size: 8.5pt; color: #64748b; }
    }
    body {
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: #1e293b;
        line-height: 1.6;
        font-size: 10pt;
    }
    .header {
        background: #0f172a;
        color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
    }
    .header h1 { margin: 0 0 8px; font-size: 18pt; line-height: 1.3; color: #ffffff; }
    .header .meta { font-size: 9pt; color: #bfdbfe; }
    .content { background: #ffffff; padding: 22px; border-radius: 6px; border: 1px solid #e2e8f0; }
    h1, h2, h3 { color: #0f172a; page-break-after: avoid; }
    h2 { border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; margin-top: 20px; }
    blockquote { border-left: 4px solid #2563eb; margin: 0; padding-left: 12px; color: #475569; }
    img { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 8pt; text-align: left; }
    th { background: #0f172a; color: white; }
</style>
</head>
<body>
<div class="header">
    <h1>__TITLE__</h1>
    <div class="meta">Author: DEX | Date: __DATE__ | Website: thedexs.com</div>
</div>
<div class="content">__BODY__</div>
</body>
</html>
"""


def parse_markdown_file(filepath: Path) -> tuple[dict, str]:
    """Return Hugo front matter and Markdown body for one post."""
    content = filepath.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)$", content, re.DOTALL)
    if not match:
        return {}, content

    metadata = yaml.safe_load(match.group(1)) or {}
    if not isinstance(metadata, dict):
        raise ValueError(f"Front matter must be a mapping: {filepath}")
    return metadata, match.group(2)


def output_slug(filepath: Path, metadata: dict) -> str:
    """Build a stable, unique-friendly slug for leaf bundles and Markdown files."""
    explicit = metadata.get("slug")
    if explicit:
        candidate = str(explicit)
    elif filepath.name in {"index.md", "index.en.md"}:
        candidate = filepath.parent.name
    else:
        candidate = filepath.stem.removesuffix(".en")

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", candidate).strip("-").lower()
    if not slug:
        raise ValueError(f"Could not derive an output slug for {filepath}")
    return slug


def render_html(title: str, date: str, body_markdown: str) -> str:
    body_html = markdown.markdown(
        body_markdown,
        extensions=["tables", "fenced_code", "toc"],
        output_format="html5",
    )
    return (
        HTML_TEMPLATE.replace("__TITLE__", html.escape(title))
        .replace("__DATE__", html.escape(date))
        .replace("__BODY__", body_html)
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    used_slugs: set[str] = set()
    errors: list[str] = []

    for filepath in sorted(CONTENT_DIR.rglob("*.md")):
        if filepath.name.startswith("_index"):
            continue

        try:
            metadata, body_markdown = parse_markdown_file(filepath)
            if metadata.get("draft") is True:
                continue

            slug = output_slug(filepath, metadata)
            if slug in used_slugs:
                raise ValueError(f"Duplicate PDF slug: {slug}")
            used_slugs.add(slug)

            title = str(metadata.get("title", "Business Research"))
            date = str(metadata.get("date", ""))[:10]
            full_html = render_html(title, date, body_markdown)
            output_path = OUTPUT_DIR / f"{slug}.pdf"

            print(f"Generating PDF: {output_path}")
            weasyprint.HTML(
                string=full_html,
                base_url=str(filepath.parent.resolve()),
            ).write_pdf(output_path)
        except Exception as exc:  # Continue so one bad post does not hide other failures.
            errors.append(f"{filepath}: {exc}")

    if errors:
        raise SystemExit("PDF generation failed:\n- " + "\n- ".join(errors))


if __name__ == "__main__":
    main()
