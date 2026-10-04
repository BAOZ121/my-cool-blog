/* Native links + small real-element entrances. No page snapshots or router. */
(() => {
  const key = "dex:page-entry";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let entry;
  let interrupted = false;
  let animations = [];
  let curtain;
  let cleanupTimer;
  let startedAt;
  // Do not start/re-hide content once the opaque phase has already elapsed.
  const blackHold = 680 * .72;
  try {
    entry = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    // Discard markers from the earlier snapshot-based preview too.
    sessionStorage.removeItem("dex:article-transition");
  } catch { /* Storage denial leaves normal navigation intact. */ }

  const stop = () => {
    interrupted = true;
    window.clearTimeout(cleanupTimer);
    curtain?.remove();
    curtain = undefined;
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

  function eligible() {
    const navigationType = performance.getEntriesByType("navigation")[0]?.type;
    return entry && !interrupted && !motion.matches && !document.hidden && scrollY <= 1 &&
      navigationType === "navigate" && !location.hash && location.href === entry.to &&
      document.referrer === entry.from && Number.isFinite(entry.time) &&
      Date.now() - entry.time >= 0 && Date.now() - entry.time <= 15000 &&
      typeof document.documentElement.animate === "function";
  }

  function arm() {
    if (!eligible()) return;
    try {
      // This watchdog is armed before installation; it never delays navigation.
      cleanupTimer = window.setTimeout(stop, 1700);
      curtain = document.createElement("div");
      curtain.className = "dex-entry-curtain";
      curtain.setAttribute("aria-hidden", "true");
      const panel = document.createElement("div");
      panel.className = "dex-entry-curtain__panel";
      for (const [name, text] of [["label", "DEX / RESEARCH"], ["status", "OPENING VIEW"], ["mode", "READING MODE"]]) {
        const line = document.createElement("div");
        line.className = `dex-entry-curtain__${name}`;
        line.textContent = text;
        panel.append(line);
      }
      curtain.append(panel);
      const mask = curtain;
      mask.addEventListener("animationend", event => { if (event.target === mask) mask.remove(); });
      // The head script runs before body exists. This temporary fixed root child
      // is present before the parser can expose article content on a first paint.
      document.documentElement.append(mask);
      // Establish the finite CSS clock now, not when DOM readiness finally runs.
      window.getComputedStyle(mask).opacity;
      startedAt = performance.now();
      if (!covered()) stop();
    } catch { stop(); }
  }

  function covered() {
    if (!curtain?.isConnected) return false;
    const style = window.getComputedStyle(curtain);
    return style.animationName === "dex-entry-blackout" && Number(style.opacity) >= .99;
  }

  function enter() {
    if (startedAt === undefined || !eligible()) { stop(); return; }
    const elapsed = performance.now() - startedAt;
    // Slow parsing/deferred resources may outlive the black phase. Fail open:
    // never restart a curtain or conceal content the reader can already see.
    if (elapsed >= blackHold || !covered()) { stop(); return; }
    const article = document.querySelector(".main-article");
    const hero = article?.querySelector(".article-image img");
    const nodes = [];
    if (hero?.complete && hero.naturalWidth) nodes.push(hero);
    const selector = article
      ? ".main-article .article-details, .main-article [data-entry-title], .main-article .research-actions, .main-article .article-content > :first-child"
      : ".research-landing > h2, .research-landing > p, main > header, main > h1, main > h2, main .section-title";
    for (const node of document.querySelectorAll(selector)) nodes.push(node);
    // All geometry reads precede animation writes. Never animate a whole report.
    const visible = nodes.filter(node => {
      const rect = node.getBoundingClientRect();
      return typeof node.animate === "function" && rect.width > 0 && rect.height > 0 &&
        rect.top < innerHeight && rect.bottom > 0 && rect.height <= innerHeight;
    }).slice(0, 5);
    if (!visible.length || performance.now() - startedAt >= blackHold || !covered()) { stop(); return; }
    try {
      const status = curtain?.querySelector(".dex-entry-curtain__status");
      if (status && article) status.textContent = "OPENING ARTICLE";
      for (const node of visible) {
        if (performance.now() - startedAt >= blackHold || !covered()) { stop(); return; }
        const cover = node === hero;
        const title = node.matches("[data-entry-title]");
        const interactive = node.closest("a,button,summary") || node.querySelector("a,button,input,select,textarea,summary,[tabindex]");
        // Image/title pixels move inside fixed clipped links; actual controls
        // and every anchor's layout box remain stationary during cancellation.
        const frames = cover ? [
          { opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "scale(1)" },
        ] : title ? [
          { transform: "translateY(28px)" }, { transform: "translateY(0)" },
        ] : interactive ? [
          { opacity: 0 }, { opacity: 1 },
        ] : [
          { opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "translateY(0)" },
        ];
        const animation = node.animate(frames, {
          id: cover ? "dex-cover-pop" : "dex-content-enter", duration: cover ? 400 : 420,
          delay: cover ? 520 : article ? 920 : 560,
          easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards",
        });
        // Join the head-established timeline instead of restarting at DOM ready.
        animation.currentTime = performance.now() - startedAt;
        animations.push(animation);
        animation.finished.then(() => { animations = animations.filter(item => item !== animation); }, () => {});
      }
    } catch { stop(); }
  }
  arm();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enter, { once: true });
  else enter();
})();
