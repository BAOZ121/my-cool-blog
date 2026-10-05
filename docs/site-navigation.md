# Collapsible site navigation

The left avatar and site menu can be minimized on desktop (1024px and wider).
The native **Minimize navigation / Expand navigation** disclosure is always
available above the avatar. Its 64px compact column retains a 44px avatar link,
the site's social icons, every page-link icon and the theme button. Text labels
are visually hidden, not removed from accessible names; native title tooltips
identify icon destinations. Current-page styling remains visible. Controls use
44px minimum targets and ordinary Tab, Enter, Space and touch behavior.

The column stays in normal flow. Its released width goes to the article until
the existing 1200px card cap is reached. Left and right disclosures are
independent, so readers can choose either rail or both. There is no floating
panel, click-blocking overlay, width animation or scroll/history replacement.
The original mobile menu, theme initialization, chapter rail and page entrance
remain in place. Browsers without `:has()` retain the expanded navigation.

A small parser-time script restores the desktop preference from session storage
before article content is parsed. New navigation follows the site-wide choice;
Back/Forward restores the saved width of the returning page, even if the next
page was expanded, so browser cache eligibility cannot change the reading width.
The module only saves native changes, with
idempotent setup and a blocked-storage fallback. Compact preferences do not
hide mobile labels or change the mobile menu. Without JavaScript, the native
desktop disclosure and all ordinary links remain usable, without persistence.

## Verification

```sh
node --test tests/site-navigation.test.mjs
hugo --environment production --minify --panicOnWarning
node tests/site-navigation.browser.mjs
```

Run all existing browser suites too, particularly chapter-rail native Back
reading-position restoration (less than 4px) and deferred graphics re-entry,
page-entrance input cancellation, theme/menu controls and mobile navigation.
