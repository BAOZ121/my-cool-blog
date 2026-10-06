# Non-blocking page entrances

DEX remains a server-rendered Hugo multi-page site. Ordinary links, forms,
history and page initialization remain browser-owned. The shared head explicitly
opts **out** of native document View Transitions. Captured documents can lose
normal hit-testing during native snapshot animation; the previous preview's
reported click failure was not conclusively reproduced, so the replacement
removes that dependency rather than relying on an overlay timeout.

A tiny classic script observes ordinary same-origin links without cancelling
or delaying them. A one-time session marker permits an entrance only on a fresh
navigation with a matching source/destination. On ordinary pages, direct entry,
reload, Back/Forward, hashes, new tabs, disabled storage and reduced motion use
normal rendering. The explicitly opted-in NVIDIA article has the limited direct
entry and top-of-page reload exception described below.

The inline head script establishes an eligible curtain before the parser exposes
body content. The inline CSS is already present, so this does not depend on a
network stylesheet or DOMContentLoaded. The temporary fixed curtain is attached
to the document root without creating/replacing body. Its finite CSS animation
starts immediately after a style resolution, and the later real-element animation
joins that same clock rather than starting a second sequence.

An eligible article entry follows three bounded phases from that early start:
- A decorative black curtain normally holds for 1190 ms, then fades over 190 ms
- Ready cover pixels pop in at 1220–1770 ms
- Title and introductory content reveal at 1770–2340 ms

Only a visible article hero can extend the visual hold, while its existing request
and decode finish. The latest hold is 2850 ms, so the remaining phases finish by
about 4000 ms. A load error, rejected decode, missing hero or deadline skips the
cover animation and reveals readable content/its reserved image placeholder.
The wait never includes below-fold images, charts, fonts or window.load, and does
not defer navigation, start duplicate requests, or slow down downloads. Cached
ready images retain the normal 2340 ms sequence. “LOADING COVER” appears only
while the critical hero is pending; other panel labels are decorative, without
fake progress percentages.

At most five small visible real elements animate with transform/opacity. Cover
and title pixels move inside fixed, clipped links; control containers use opacity
only. Generic internal pages use the same normal hold and a shorter content reveal.
The small black/gold control panel retains one thin scan line, with no flashing,
repeating code effect or expensive filter. The curtain is aria-hidden,
pointer-events:none, and transparent by default. Its initial 4000 ms CSS safety
animation is finite even if JavaScript fails; after content is prepared behind
opaque black, a finite CSS release fade replaces that safety animation. A separate
4200 ms watchdog is armed before the curtain is installed. Animationend, input or
page exit also removes it and disposes the pending hero listeners/timer.

If DOM readiness arrives after the latest hold, or the curtain is already
transparent/dismissed/disabled, the enhancement fails open: article content is
never hidden again and the curtain is never restarted. Real content is visible in
normal CSS. Finite Web Animations fill backwards only during their short phase
delays, never retain final state, and are cancelled by pointer, keyboard, touch,
wheel, hidden/pagehide/BFCache events. The input itself is never cancelled or
replayed. A late image cannot restart a completed or cancelled sequence. No
document-sized content animation, snapshot, routing replacement, inert state or
scroll lock is used.

The theme now initializes menu/theme controls at DOM readiness rather than waiting
for window.load and every image. The early-pointer regression exposed that
independent source of temporarily unresponsive controls. Initialization is idempotent.

## NVIDIA article entrance

Only `/post/nvidia-company-research/` currently declares `entryBrand: nvidia`.
The head partial embeds `data-entry-brand="nvidia"` and a base64 image data URL
on its inline script before the body is parsed. `companyResearch: true` alone does
not select a brand. Other articles and the homepage retain the original DEX panel
and eligibility rules.

The mark is the genuine green-symbol/white-wordmark SVG downloaded from
[NVIDIA's official asset library](https://www.nvidia.com/content/dam/en-zz/Solutions/about-nvidia/nvidia-brochure/images/nvidia-logo-white.svg).
`assets/images/nvidia-logo.svg` retains the original 2,122 bytes, three paths,
transforms and `0 0 974.7 179.71` viewBox. Its SHA-256 is
`201bed0f3fc1c7f83555fe448361a8bb278a049ad3970b3a6aed7fea0502ae55`;
the adjacent `nvidia-logo-source.json` records provenance. The browser tests check
both the preserved file hash and byte-for-byte equality between that file and the
embedded image. The logo is not redrawn. Opacity and a small transform animate
the intact image; the surrounding green halo and thin rays are decorative CSS.
The branded scene has no DEX labels, progress percentages or loading-panel text.
The inline data URL adds no logo request and no additional resource wait.

The brand entrance is available on an ordinary `navigate`, including a direct
link or a new tab, and on a top-of-page `reload`. It does not require session
storage. It continues to skip `back_forward`, anchored URLs, non-top reading
positions, hidden documents, reduced motion and unavailable Web Animations.
BFCache restoration invokes the same immediate cleanup. The feature never resets
the reader's scroll position.

With a ready cover, the brand timeline starts in the head and lasts 2,900 ms:

- Logo scene holds for 1,750 ms; the curtain then fades over 190 ms.
- Ready cover pixels appear at 1,780–2,330 ms.
- Title and introductory content appear at 2,330–2,900 ms.

The visible cover alone may extend that hold, with the same 2,850 ms latest hold
and 4,000 ms total content bound as ordinary entries. The transparent-by-default
CSS safety clock and independent 4,200 ms cleanup watchdog remain in place.
Input skips the logo immediately without cancelling or replaying the input.
A failed logo decode removes the scene and cancels pending hero work; a late
hero cannot restart it. A child logo/ray animation ending never removes the
parent curtain early. Late DOM readiness or unsupported CSS fails open, with no
second blackout over already readable content.

## Covers

Cover variants are generated by Hugo at 400/640/800/1200/1600px (bounded by source
width), using WebP quality 82 without changing original artwork or aspect ratio.
Already-efficient WebP is retained if re-encoding would increase bytes. The
fallback is an optimized 800px resource, not the original PNG/JPEG. The sizes
attribute follows the actual sidebar layout, with a separate no-sidebar case.
Homepage and article share candidate URLs, so the browser can reuse cached data.
Only the leading homepage cover and article hero are eager/high priority; other
homepage covers stay lazy. No bulk image preloads are added.

Commercial-space baseline: the 1180px/1× layout displayed 482.5px while declaring
950px and downloading 634,974 bytes. The corrected 640px WebP is 21,926 bytes
(96.5% fewer bytes); 800px is 31,130 bytes. AI computing's 640px WebP is 39,718 bytes
versus a 1,477,199-byte source PNG. These are byte comparisons, not a promise of
end-user network latency. Cloudflare's ETag revalidation worked in the audit;
proxy measurements of 4–7s TTFB were not representative speed benchmarks.

## Verification

```sh
node --test tests/page-transitions.test.mjs
hugo --environment production --minify --panicOnWarning
python3 scripts/validate_cover_images.py public
node tests/page-transitions.browser.mjs
```

Targeted first-paint probes hold the HTML parser or a deferred script while real
requestAnimationFrame samples inspect the first destination render opportunity.
A rendered 1×1 screenshot verifies the black pixel; the probe also holds cover
I/O pending and injects a script failure immediately after the early arm. These
cases verify first-frame coverage and that late DOM readiness cannot replay or
re-hide the article. Unit tests cover a missing body, shared elapsed timing,
expensive layout crossing the safety deadline, disabled CSS and early input.
Controlled hero tests cover cached completion, delayed load/decode, rejection,
missing images, timeout and input cancellation during the extended visual hold.

Tests also assert actual real-element playback and real pointer input during that
playback, with no native snapshot transition. They retain desktop/mobile,
light/dark, reduced-motion, history/scroll, reload, keyboard, forms, new-tab,
download, rapid navigation, bounded critical-hero loading, failed/missing image, no-JS and unavailable-animation
fallback coverage. The graphic renderer prepares its hidden stage out of normal flow and commits
the stage/outline swap atomically, avoiding a temporary height spike during native
history restoration. Existing article graphics, zoom, contact, industry and
Evidence Library suites still run against the same build.

The ordinary-page browser regressions explicitly select the commercial-space
article instead of whichever article happens to be newest. A separate NVIDIA
matrix checks desktop/mobile direct entry, native internal navigation, top
reload, the intact official data-URL logo, natural finite completion, a real
pointer click that skips the scene and still operates the control, reduced
motion, Back/Forward reading-position restoration, non-top reload and fresh
document hash entry. Unit fixtures track created children and cover invalid
brand/image configuration, logo errors, child-animation bubbling, cancellation
and the hard fail-open deadlines.

For an existing local browser runtime, `CHROME_PATH` may select its executable;
`PLAYWRIGHT_MODULE_PATH` may be a module specifier or file URL for the available
Playwright module. Without either override the CI launch and `@playwright/test`
dependency remain the defaults. These overrides do not change the assertions.

References:
- https://www.w3.org/TR/css-view-transitions-1/#view-transition-painting-order
- https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
- https://gohugo.io/content-management/image-processing/
