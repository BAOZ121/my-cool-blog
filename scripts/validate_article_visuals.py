"""Check sourced percentages and parity between editorial data, HTML and CSV."""
from __future__ import annotations

import csv
import json
import math
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'public').resolve()
DATA = json.loads((ROOT / 'data/article_visuals.json').read_text(encoding='utf-8'))


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.in_data = False
        self.buffer = ''
        self.datasets = []
        self.fallbacks = 0
        self.ids = []
        self.feed(path.read_text(encoding='utf-8'))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'script' and attrs.get('class') == 'visual-data':
            assert attrs.get('type') == 'application/json'
            self.in_data = True
            self.buffer = ''
        if tag == 'details' and attrs.get('class') == 'visual-fallback':
            assert 'open' in attrs, 'Fallback must be visible before JavaScript'
            self.fallbacks += 1

    def handle_data(self, value):
        if self.in_data:
            self.buffer += value

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_data:
            self.datasets.append(json.loads(self.buffer))
            self.in_data = False


def check_node(node, depth=0):
    assert depth <= 12 and isinstance(node.get('name'), str) and node['name'].strip()
    for child in node.get('children', []):
        check_node(child, depth + 1)


def main():
    for item in DATA['maps'].values():
        check_node(item['root'])
        assert item['title'] and item['note'] and item['sources'] and item['reviewed']
    for chart_id, item in DATA['shares'].items():
        assert item['unit'] == '%'
        for field in ('title', 'scope', 'geography', 'period', 'metric', 'note', 'reviewed'):
            assert item[field].strip(), (chart_id, field)
        for field in ('publisher', 'title', 'published', 'url'):
            assert item['source'][field].strip(), (chart_id, field)
        assert item['source']['url'].startswith('https://')
        values = [row['value'] for row in item['series']]
        assert len(values) >= 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and 0 <= v <= 100 for v in values)
        assert abs(sum(values) - 100) < 0.01, (chart_id, sum(values))
        assert len({row['name'] for row in item['series']}) == len(values)
        rows = list(csv.DictReader((BUILD / f'data/charts/{chart_id}.csv').open(encoding='utf-8', newline='')))
        assert [(r['Name'], float(r['Share (%)'])) for r in rows] == [(r['name'], r['value']) for r in item['series']]
        assert all(r['Source URL'] == item['source']['url'] and r['Period'] == item['period'] for r in rows)

    count = 0
    for post in (ROOT / 'content/post').rglob('*.md'):
        text = post.read_text(encoding='utf-8')
        calls = re.findall(r'\{\{<\s*(industry-map|market-share)\s+id="([\w-]+)"\s*>\}\}', text)
        if not calls:
            continue
        page = Page(BUILD / 'post' / post.parent.name / 'index.html')
        assert len(page.ids) == len(set(page.ids)), f'Duplicate HTML IDs: {post}'
        assert len(page.datasets) == len(calls) == page.fallbacks
        for (kind, key), rendered in zip(calls, page.datasets):
            assert rendered == DATA['maps' if kind == 'industry-map' else 'shares'][key]
        count += len(calls)
    assert count >= 8, 'Expected four maps and four sourced share charts'
    for name in ('markmap', 'echarts'):
        assert (BUILD / f'vendor/article-visuals/{name}.js').is_file()
    print(f'Article visuals validated: {count} components; source, percentage, CSV and HTML parity passed.')


if __name__ == '__main__':
    main()
