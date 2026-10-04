/* Native links + small real-element entrances. No page snapshots or router. */
(() => {
  const key = "dex:page-entry";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let entry;
  let interrupted = false;
  let animations = [];
  try {
    entry = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    // Discard markers from the earlier snapshot-based preview too.
    sessionStorage.removeItem("dex:article-transition");
  } catch { /* Storage denial leaves normal navigation intact. */ }

  const stop = () => {
    interrupted = true;
    for (const animation of animations) animation.cancel();
    animations = [];
  };
  // Cancel only decorative movement. Never cancel or replay the input itself.
  for (const type of ["pointerdown", "touchstart", "wheel", "keydown"]) {
    window.addEventListener(type, stop, { capture: true, passive: true });
  }
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", event => { if (event.persisted) stop(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  motion.addEventListener?.("change", stop);

  document.addEventListener("click", event => {
    try { sessionStorage.removeItem(key); } catch { /* Optional enhancement. */ }
    if (motion.matches || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const to = new URL(link.href, location.href);
    if (to.origin !== location.origin || to.hash ||
        (to.pathname === location.pathname && to.search === location.search)) return;
    try {
      const from = new URL(location.href); from.hash = "";
      sessionStorage.setItem(key, JSON.stringify({ from: from.href, to: to.href, time: Date.now() }));
    } catch { /* Native link activation proceeds even without storage. */ }
  });

  function enter() {
    const navigationType = performance.getEntriesByType("navigation")[0]?.type;
    if (!entry || interrupted || motion.matches || document.hidden || scrollY > 1 ||
        navigationType !== "navigate" || location.hash || location.href !== entry.to ||
        document.referrer !== entry.from || !Number.isFinite(entry.time) ||
        Date.now() - entry.time < 0 || Date.now() - entry.time > 15000) return;
    const hero = document.querySelector(".main-article .article-image img");
    const nodes = [];
    if (hero?.complete && hero.naturalWidth) nodes.push(hero);
    for (const node of document.querySelectorAll(".main-article .article-details, .main-article .article-content > :first-child, .research-landing > h2, .research-landing > p, main > header, main > h1, main > h2, main .section-title")) {
      if (!nodes.some(parent => parent.contains(node))) nodes.push(node);
    }
    // Read geometry first, then animate at most four small, visible surfaces.
    const visible = nodes.filter(node => {
      const rect = node.getBoundingClientRect();
      return typeof node.animate === "function" && rect.width > 0 && rect.height > 0 &&
        rect.top < innerHeight && rect.bottom > 0 && rect.height <= innerHeight;
    }).slice(0, 4);
    try {
      for (const node of visible) {
        const cover = node === hero;
        const animation = node.animate(cover ? [
          { transform: "scale(1.025)" }, { transform: "scale(1)" },
        ] : [
          { opacity: .65, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" },
        ], { id: cover ? "dex-cover-settle" : "dex-content-enter", duration: cover ? 260 : 200,
          easing: "cubic-bezier(.22, 1, .36, 1)", fill: "none" });
        animations.push(animation);
        animation.finished.then(() => { animations = animations.filter(item => item !== animation); }, () => {});
      }
    } catch { stop(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enter, { once: true });
  else enter();
})();
