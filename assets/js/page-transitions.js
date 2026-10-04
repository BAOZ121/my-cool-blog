/* Progressive enhancement only: every link and history entry remains browser-owned. */
(() => {
  const root = document.documentElement;
  const key = "dex:article-transition";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let candidate;
  let namedCover;
  let generation = 0;
  const clearNames = () => {
    generation += 1;
    if (namedCover) namedCover.style.removeProperty("view-transition-name");
    namedCover = undefined;
    root.removeAttribute("data-dex-transition");
  };
  const discard = () => {
    try { sessionStorage.removeItem(key); } catch { /* Storage can be disabled. */ }
  };
  const visibleCover = cover => {
    const image = cover?.querySelector("img");
    if (!image?.complete || !image.naturalWidth) return false;
    const rect = cover.getBoundingClientRect();
    return rect.width > 80 && rect.height > 60 && rect.top >= -1 && rect.left >= -1 &&
      rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1;
  };
  const nameCover = cover => {
    namedCover = cover;
    cover.style.viewTransitionName = "dex-cover";
    root.dataset.dexTransition = "article";
  };
  const cleanAfter = (transition, incoming = false) => {
    const current = generation;
    const cleanup = () => { if (current === generation) clearNames(); };
    if (incoming) {
      const release = () => {
        if (current === generation && namedCover) {
          namedCover.style.removeProperty("view-transition-name");
          namedCover = undefined;
        }
      };
      transition.ready.then(release, release);
    }
    // On outgoing pages ready can reject normally once the document is hidden.
    transition.ready.catch(() => {});
    transition.finished.then(cleanup, cleanup);
  };

  // Observe an ordinary link activation without cancelling or delaying navigation.
  document.addEventListener("click", event => {
    candidate = undefined;
    if (motion.matches || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const header = link.closest("[data-article-url]");
    const cover = header?.querySelector("[data-transition-cover]");
    if (!header || header.closest(".main-article") || !visibleCover(cover)) return;
    const to = new URL(link.href, location.href);
    const article = new URL(header.dataset.articleUrl, location.href);
    if (to.origin !== location.origin || to.href !== article.href ||
        to.href === location.href || to.hash || to.search) return;
    candidate = { cover, from: location.href, to: to.href, time: Date.now() };
  });

  window.addEventListener("pageswap", event => {
    clearNames();
    discard();
    const selected = candidate;
    candidate = undefined;
    if (!event.viewTransition || !window.navigation || motion.matches || !selected ||
        event.activation?.navigationType !== "push" ||
        event.activation.entry?.url !== selected.to ||
        Date.now() - selected.time > 8000 || !visibleCover(selected.cover)) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ from: selected.from, to: selected.to, time: Date.now() }));
    } catch { return; }
    nameCover(selected.cover);
    cleanAfter(event.viewTransition);
  });

  window.addEventListener("pagereveal", event => {
    clearNames();
    let marker;
    try { marker = JSON.parse(sessionStorage.getItem(key)); } catch { /* Use the default fade. */ }
    discard();
    const activation = window.navigation?.activation;
    if (!event.viewTransition || motion.matches || !marker ||
        !Number.isFinite(marker.time) || activation?.navigationType !== "push" || activation.from?.url !== marker.from ||
        activation.entry?.url !== marker.to || location.href !== marker.to || Date.now() - marker.time < 0 ||
        Date.now() - marker.time > 15000) return;
    const cover = document.querySelector(".main-article [data-transition-cover]");
    if (!visibleCover(cover)) {
      // Never hold first paint for a late image, or fly a missing/offscreen image in.
      event.viewTransition.skipTransition();
      return;
    }
    nameCover(cover);
    cleanAfter(event.viewTransition, true);
  });

  // A cached document must never retain a named offscreen cover on Back/Forward.
  window.addEventListener("pageshow", event => {
    if (event.persisted) { candidate = undefined; clearNames(); discard(); }
  });
  motion.addEventListener?.("change", () => { candidate = undefined; clearNames(); discard(); });
})();
