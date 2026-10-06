#!/usr/bin/env python3
"""Validate build-time cover variants; no browser or third-party dependency."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse
import sys

class Covers(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.preloads = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and attrs.get("data-article-cover") == "true":
            self.images.append(attrs)
        if tag == "link" and attrs.get("as") == "image" and attrs.get("rel") == "preload":
            self.preloads.append(attrs)

def parse(path):
    parser = Covers()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser

root = Path(sys.argv[1] if len(sys.argv) > 1 else "public")
home = parse(root / "index.html")
assert home.images, "Homepage must retain its cover images"
assert not home.preloads, "Do not bulk preload article covers"
for index, image in enumerate(home.images):
    assert image.get("loading") == ("eager" if index == 0 else "lazy")
    assert image.get("fetchpriority") == ("high" if index == 0 else "auto")
    assert image.get("decoding") == "async"
    assert int(image["width"]) > 0 and int(image["height"]) > 0
    variants = image["srcset"].split(", ")
    widths = []
    for variant in variants:
        url, descriptor = variant.rsplit(" ", 1)
        width = int(descriptor[:-1])
        assert descriptor.endswith("w") and 0 < width <= 1600
        widths.append(width)
        parsed = urlparse(url)
        assert not parsed.netloc and parsed.path.endswith(".webp"), url
        file = root / unquote(parsed.path.lstrip("/"))
        assert file.is_file(), file
        assert file.stat().st_size <= 160_000, f"Cover variant exceeds byte budget: {file}"
    assert widths == sorted(set(widths))
    assert image["src"].endswith(".webp")
    assert (root / image["src"].lstrip("/")).stat().st_size <= 160_000
    article = root / Path(image["src"].lstrip("/")).parent / "index.html"
    hero = parse(article).images[0]
    assert hero["src"] == image["src"] and hero["srcset"] == image["srcset"], "List/article must reuse image URLs"
    assert hero["loading"] == "eager" and hero["fetchpriority"] == "high"
print(f"PASS: {len(home.images)} optimized cover sets, shared list/detail URLs, <=160KB variants, priority/lazy safeguards")
