/* Progressive article graphics. The server-rendered outline/table is the source of truth. */
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${field}`);
  return value.trim();
}

export function validateMap(data) {
  if (!data || typeof data !== "object") throw new Error("Missing map");
  requiredText(data.title, "title");
  const seen = new Set();
  let count = 0;
  function visit(node, depth) {
    if (!node || typeof node !== "object" || seen.has(node) || depth > 12 || ++count > 800) throw new Error("Invalid tree");
    seen.add(node);
    requiredText(node.name, "node name");
    if (node.children != null) {
      if (!Array.isArray(node.children)) throw new Error("Invalid children");
      node.children.forEach((child) => visit(child, depth + 1));
    }
  }
  visit(data.root, 0);
  return data;
}

export function toMarkmapTree(root, expand = false, depth = 0, branch = 0) {
  const children = root.children || [];
  return {
    content: escapeHTML(root.name),
    payload: { fold: !expand && depth >= 2 && children.length ? 1 : 0, branch },
    children: children.map((child, index) => toMarkmapTree(child, expand, depth + 1, depth === 0 ? index : branch)),
  };
}

export function validateShare(data) {
  if (!data || typeof data !== "object" || data.unit !== "%") throw new Error("Shares must use percentages");
  for (const key of ["title", "scope", "geography", "metric", "period"]) requiredText(data[key], key);
  if (!Array.isArray(data.series) || data.series.length < 2 || data.series.length > 30) throw new Error("Invalid share series");
  const names = new Set();
  let total = 0;
  for (const item of data.series) {
    const name = requiredText(item?.name, "company name");
    if (names.has(name.toLowerCase()) || typeof item.value !== "number" || !Number.isFinite(item.value) || item.value < 0 || item.value > 100) throw new Error("Invalid share value");
    names.add(name.toLowerCase());
    total += item.value;
  }
  const tolerance = typeof data.rounding_note === "string" && data.rounding_note.trim() ? 0.2 : 0.01;
  if (Math.abs(total - 100) > tolerance + 1e-8) throw new Error("Incomplete market denominator");
  for (const key of ["title", "publisher", "url", "published"]) requiredText(data.source?.[key], `source ${key}`);
  if (!/^https?:\/\//i.test(data.source.url)) throw new Error("Invalid source URL");
  return data;
}

export function safeVendorURL(value, base) {
  const url = new URL(value, base);
  if (url.origin !== new URL(base).origin || !/^https?:$/.test(url.protocol)) throw new Error("Vendor must be self-hosted");
  return url.href;
}

// Wheel deltaMode is pixels (0), lines (1), or pages (2). Do not use D3's
// Ctrl-wheel multiplier: Ctrl+wheel is also our documented desktop shortcut.
export function mapWheelPixels(event, pageHeight = 470) {
  if (!Number.isFinite(event.deltaY)) return 0;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
  return Math.max(-80, Math.min(80, event.deltaY * unit));
}

export function mapScaleExtent(fitScale) {
  // Keep even very large expanded trees fit-able, while limiting text to 3×.
  return [Math.min(0.25, Math.max(Number.EPSILON, fitScale / 2)), 3];
}

const palettes = {
  light: ["#d6b56f", "#67b8b0", "#7ea5dc", "#e58b78", "#a995d3", "#a4bd7e", "#d78fb3", "#8baeb8"],
  dark: ["#d6b56f", "#67b8b0", "#7ea5dc", "#e58b78", "#a995d3", "#a4bd7e", "#d78fb3", "#8baeb8"],
};
// Keep maps gold; thin connections need deeper gold on the light background.
const mapPalettes = {
  light: ["#89651e", "#9b742d", "#76551e", "#94723a", "#886026", "#a37c39", "#71521f", "#806633"],
  dark: ["#d6b56f", "#f0dfb3", "#a8874a", "#dec799", "#bf9855", "#f4e9cf", "#9d7841", "#c9b78c"],
};

export function pieOptions(data, { dark = false, compact = false, reducedMotion = false, width = 700, height = 360 } = {}) {
  validateShare(data);
  const centerPeriod = typeof data.center_label === "string" && data.center_label.trim()
    ? data.center_label
    : compact ? data.period.replace(/^Full year\s+/i, "").replace(/^(Q\d)\s+(\d{4})$/, "$1\n$2") : data.period;
  const ink = dark ? "#f5f3ed" : "#211d16";
  const muted = dark ? "#c3bcae" : "#6b6254";
  const surface = dark ? "#161616" : "#ffffff";
  return {
    animation: !reducedMotion,
    animationDuration: 350,
    color: palettes[dark ? "dark" : "light"],
    textStyle: { fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: ink },
    aria: { enabled: true, label: { description: `${data.title}. ${data.period}. ${data.geography}. ${data.metric}. ${data.series.map((item) => `${item.name}: ${item.value}%`).join("; ")}.` } },
    tooltip: {
      trigger: "item", confine: true, renderMode: "html", backgroundColor: surface, borderColor: dark ? "#494136" : "#e5d7b8", textStyle: { color: ink },
      formatter: (item) => `${escapeHTML(item.name)}<br><strong>${Number(item.value)}%</strong>`,
    },
    legend: {
      show: !compact, orient: "vertical", right: "3%", top: "center", selectedMode: false,
      itemWidth: 11, itemHeight: 11, itemGap: 16, textStyle: { color: ink, fontSize: 13 },
      formatter: (name) => `${name}  ${data.series.find((item) => item.name === name)?.value}%`,
    },
    series: [{
      type: "pie", radius: compact ? ["37%", "64%"] : ["38%", "66%"], center: compact ? ["50%", "48%"] : ["32%", "50%"],
      avoidLabelOverlap: true, minAngle: 0, padAngle: 1, selectedMode: false,
      itemStyle: { borderRadius: 3, borderWidth: 2, borderColor: surface },
      label: { show: compact, position: "inside", formatter: (item) => item.value >= 5 ? `${item.value}%` : "", fontSize: 13, color: "#101010", textBorderWidth: 0 },
      labelLine: { show: false }, emphasis: { scale: !reducedMotion, scaleSize: 4, label: { show: compact }, itemStyle: { shadowBlur: 0 } },
      data: data.series.map((item) => ({ name: item.name, value: item.value })),
    }],
    graphic: [{ type: "text", x: width * (compact ? .5 : .32), y: height * (compact ? .44 : .46), style: { text: centerPeriod, fill: ink, fontSize: compact ? 16 : 18, lineHeight: 20, fontWeight: 650, align: "center", verticalAlign: "middle" } }, { type: "text", x: width * (compact ? .5 : .32), y: height * (compact ? .57 : .55), style: { text: "%", fill: muted, fontSize: 14, align: "center", verticalAlign: "middle" } }],
  };
}

const strings = {
  en: { loading: "Loading interactive graphic…", failed: "The interactive view is unavailable. The full information is shown below.", interact: "Enable pan & zoom", stop: "Stop pan & zoom", enter: "Fullscreen", exit: "Exit fullscreen", zoomIn: "Zoom in", zoomOut: "Zoom out", zoomLevel: "Zoom level", mapHint: "Use − / + for fine zoom, or Ctrl / ⌘ + scroll. Enable pan & zoom to drag or pinch. Keyboard: + / − to zoom, 0 to fit.", enabled: "Drag to move; scroll or pinch to zoom. Turn pan & zoom off to scroll the page. Keyboard: arrows to move, 0 to fit.", chartReady: "Select a segment for its reported share. Complete values are in the table below." },
  zh: { loading: "正在加载交互图表…", failed: "交互视图暂不可用，完整内容已在下方展示。", interact: "开启拖动缩放", stop: "关闭拖动缩放", enter: "全屏查看", exit: "退出全屏", zoomIn: "放大", zoomOut: "缩小", zoomLevel: "缩放比例", mapHint: "使用 − / + 精细缩放，或按 Ctrl / ⌘ 滚动。开启拖动缩放后可拖动或双指缩放。键盘：+ / − 缩放，0 适应视图。", enabled: "拖动平移，滚动或双指缩放；关闭后可继续滑动页面。键盘：方向键平移，0 适应视图。", chartReady: "点击图块查看原始份额；完整数值见下方数据表。" },
};

function isDark() { return document.documentElement.dataset.scheme === "dark"; }
function motionReduced() { return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false; }
function nextFrame() { return new Promise((resolve) => requestAnimationFrame(resolve)); }

function fullscreenControl(figure, toolbar, resize, labels) {
  const button = toolbar.querySelector('[data-action="fullscreen"]');
  if (!button) return;
  let previousOverflow = "";
  const active = () => document.fullscreenElement === figure || figure.classList.contains("is-expanded");
  const sync = () => {
    button.textContent = active() ? labels.exit : labels.enter;
    button.setAttribute("aria-pressed", String(active()));
    requestAnimationFrame(resize);
  };
  const closeFallback = () => {
    if (!figure.classList.contains("is-expanded")) return;
    figure.classList.remove("is-expanded");
    figure.removeAttribute("aria-modal");
    figure.removeAttribute("role");
    document.body.style.overflow = previousOverflow;
    sync();
    button.focus();
  };
  button.addEventListener("click", async () => {
    if (document.fullscreenElement === figure) { await document.exitFullscreen().catch(() => {}); return; }
    if (figure.classList.contains("is-expanded")) { closeFallback(); return; }
    if (figure.requestFullscreen) {
      try { await figure.requestFullscreen(); sync(); button.focus(); return; } catch { /* The expanded view also works where native fullscreen is unavailable. */ }
    }
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    figure.classList.add("is-expanded");
    figure.setAttribute("role", "dialog");
    figure.setAttribute("aria-modal", "true");
    sync();
    button.focus();
  });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("keydown", (event) => {
    if (!figure.classList.contains("is-expanded")) return;
    if (event.key === "Escape") { event.preventDefault(); closeFallback(); }
    if (event.key === "Tab") {
      const controls = [...figure.querySelectorAll('button, a[href], summary, [tabindex="0"]')].filter((item) => item.getClientRects().length);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
}

function observeView(figure, stage, resize, theme) {
  let scheduled = false;
  const update = () => {
    if (scheduled || !figure.isConnected) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; resize(); });
  };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(update).observe(stage);
  else window.addEventListener("resize", update, { passive: true });
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });
}

async function renderMap(figure, stage, toolbar, data, vendor, labels) {
  validateMap(data);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-label", data.title);
  svg.setAttribute("role", "group");
  svg.setAttribute("tabindex", "0");
  stage.append(svg);
  let interacting = false;
  const compact = stage.clientWidth < 480;
  const customMapColors = getComputedStyle(figure).getPropertyValue("--visual-map-palette")
    .split(",").map(color => color.trim()).filter(color => /^#[0-9a-f]{6}$/i.test(color));
  const map = new vendor.Markmap(svg, {
    autoFit: false, duration: motionReduced() ? 0 : 200, maxWidth: compact ? 105 : 190, paddingX: compact ? 6 : 12,
    spacingHorizontal: compact ? 20 : 65, spacingVertical: compact ? 24 : 14, fitRatio: 0.94, maxInitialScale: 1,
    initialExpandLevel: -1, scrollForPan: false, zoom: true, pan: false,
    color: (node) => {
      const colors = customMapColors.length ? customMapColors : mapPalettes[isDark() ? "dark" : "light"];
      return colors[(node.payload?.branch || 0) % colors.length];
    },
  });
  const fittedScale = () => {
    const { x1, y1, x2, y2 } = map.state.rect;
    return Math.min(1, svg.clientWidth * 0.94 / Math.max(1, x2 - x1), svg.clientHeight * 0.94 / Math.max(1, y2 - y1));
  };
  const updateExtent = () => map.zoom.scaleExtent(mapScaleExtent(fittedScale()));
  // Keep ordinary article scrolling and browser zoom outside the map untouched.
  // D3 still owns drag/pinch and the transform math, but not wheel or double-click.
  map.zoom.filter((event) => interacting && !event.button && event.type !== "wheel" && event.type !== "dblclick");
  map.svg.on("wheel.zoom", null).on("dblclick.zoom", null);
  let wheelFrame = 0;
  let wheelPixels = 0;
  let wheelAnchor;
  const cancelWheel = () => {
    cancelAnimationFrame(wheelFrame);
    wheelFrame = 0;
    wheelPixels = 0;
  };
  const scaleBy = (factor, anchor) => {
    updateExtent();
    map.svg.interrupt().call(map.zoom.scaleBy, factor, anchor);
  };
  svg.addEventListener("wheel", (event) => {
    if (!(interacting || event.ctrlKey || event.metaKey)) return;
    const pixels = mapWheelPixels(event, svg.clientHeight);
    // Prevent browser zoom even at the map's limits; never let it escape to the page.
    event.preventDefault();
    if (!pixels) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    wheelAnchor = [local.x, local.y];
    wheelPixels = Math.max(-80, Math.min(80, wheelPixels + pixels));
    if (wheelFrame) return;
    wheelFrame = requestAnimationFrame(() => {
      const factor = Math.exp(-wheelPixels * 0.001);
      wheelFrame = 0; wheelPixels = 0;
      scaleBy(factor, wheelAnchor);
    });
  }, { passive: false });
  // A gesture, fit, mode change or navigation must not leave queued zoom behind.
  map.zoom.on("start.controls", cancelWheel);
  window.addEventListener("pagehide", cancelWheel);
  const zoomControls = document.createElement("div");
  zoomControls.className = "visual-zoom-controls";
  zoomControls.setAttribute("role", "group");
  zoomControls.setAttribute("aria-label", labels.zoomLevel);
  const zoomOut = document.createElement("button");
  const zoomIn = document.createElement("button");
  for (const [button, action, text, label] of [[zoomOut, "zoom-out", "−", labels.zoomOut], [zoomIn, "zoom-in", "+", labels.zoomIn]]) {
    button.type = "button"; button.dataset.action = action; button.textContent = text;
    button.setAttribute("aria-label", label); button.title = label;
  }
  const zoomValue = document.createElement("output");
  zoomValue.className = "visual-zoom-value";
  zoomValue.setAttribute("aria-label", labels.zoomLevel);
  zoomValue.setAttribute("aria-live", "off");
  zoomControls.append(zoomOut, zoomValue, zoomIn);
  toolbar.prepend(zoomControls);
  const zoomStep = (direction) => { cancelWheel(); scaleBy(1.1 ** direction); };
  zoomOut.addEventListener("click", () => zoomStep(-1));
  zoomIn.addEventListener("click", () => zoomStep(1));
  const syncZoom = ({ transform }) => {
    const [min, max] = map.zoom.scaleExtent();
    zoomValue.value = `${Math.round(transform.k * 100)}%`;
    zoomOut.disabled = transform.k <= min + 1e-8;
    zoomIn.disabled = transform.k >= max - 1e-8;
  };
  map.zoom.on("zoom.controls", syncZoom);
  const hint = figure.querySelector(".visual-status");
  const interaction = document.createElement("button");
  interaction.type = "button"; interaction.dataset.action = "interact"; interaction.textContent = labels.interact;
  interaction.setAttribute("aria-pressed", "false");
  toolbar.append(interaction);
  interaction.addEventListener("click", () => {
    cancelWheel();
    interacting = !interacting;
    figure.classList.toggle("is-interacting", interacting);
    interaction.textContent = interacting ? labels.stop : labels.interact;
    interaction.setAttribute("aria-pressed", String(interacting));
    if (hint) hint.textContent = interacting ? labels.enabled : labels.mapHint;
  });
  const accessibleNodes = () => {
    svg.querySelectorAll(".markmap-node circle").forEach((circle) => {
      const node = circle.__data__;
      if (!node?.children?.length) return;
      circle.setAttribute("role", "button");
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("aria-label", circle.parentElement.textContent.trim());
      circle.setAttribute("aria-expanded", String(!node.payload?.fold));
    });
  };
  svg.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.getAttribute("role") === "button") {
      event.preventDefault(); event.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault(); zoomStep(event.key === "-" ? -1 : 1);
    } else if (event.key === "0") {
      event.preventDefault(); void fit();
    } else if (interacting && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); cancelWheel();
      const amount = 40 / svg.__zoom.k;
      map.svg.interrupt().call(map.zoom.translateBy, event.key === "ArrowLeft" ? amount : event.key === "ArrowRight" ? -amount : 0, event.key === "ArrowUp" ? amount : event.key === "ArrowDown" ? -amount : 0);
    }
  });
  svg.addEventListener("click", () => requestAnimationFrame(accessibleNodes));
  const fit = async () => {
    cancelWheel(); map.svg.interrupt();
    if (!svg.clientWidth || !svg.clientHeight) return;
    updateExtent();
    await map.fit().catch(() => {});
  };
  let treeRevision = 0;
  const showTree = async (expanded) => {
    const revision = ++treeRevision;
    cancelWheel(); map.svg.interrupt();
    const tree = toMarkmapTree(data.root, expanded);
    if (!expanded && stage.clientWidth < 480) tree.children.forEach(child => { child.payload.fold = 1; });
    await map.setData(tree);
    if (revision !== treeRevision) return;
    await fit(); accessibleNodes();
  };
  await showTree(false);
  toolbar.querySelector('[data-action="fit"]')?.addEventListener("click", fit);
  toolbar.querySelector('[data-action="expand"]')?.addEventListener("click", () => { showTree(true).catch(() => {}); });
  toolbar.querySelector('[data-action="collapse"]')?.addEventListener("click", () => { showTree(false).catch(() => {}); });
  observeView(figure, stage, fit, () => { map.renderData().then(accessibleNodes).catch(() => {}); });
  return { resize: fit, hint: labels.mapHint };
}

async function renderShare(figure, stage, _toolbar, data, vendor, labels) {
  validateShare(data);
  const canvas = document.createElement("div");
  canvas.className = "visual-chart";
  stage.append(canvas);
  const chart = vendor.init(canvas, null, { renderer: "svg" });
  const legend = document.createElement("ul");
  legend.className = "visual-mobile-legend";
  data.series.forEach((item, index) => {
    const row = document.createElement("li");
    const dot = document.createElement("span"); dot.className = "visual-dot"; dot.style.setProperty("--dot-light", palettes.light[index % 8]); dot.style.setProperty("--dot-dark", palettes.dark[index % 8]);
    const name = document.createElement("span"); name.textContent = item.name;
    const value = document.createElement("strong"); value.textContent = `${item.value}%`;
    row.append(dot, name, value); legend.append(row);
  });
  stage.append(legend);
  const update = () => {
    if (!figure.isConnected || !canvas.clientWidth) return;
    const compact = canvas.clientWidth < 560;
    legend.hidden = !compact;
    chart.resize();
    chart.setOption(pieOptions(data, { dark: isDark(), compact, reducedMotion: motionReduced(), width: canvas.clientWidth, height: canvas.clientHeight }), { notMerge: true });
  };
  update();
  observeView(figure, stage, update, update);
  return { resize: update, hint: labels.chartReady };
}

// Measure/render the replacement without briefly adding a second graphic's
// height to the document. This preserves native history scroll anchoring.
export function stageVisualOffFlow(stage, width) {
  const previous = { position: stage.style.position, width: stage.style.width, visibility: stage.style.visibility };
  Object.assign(stage.style, { position: "absolute", width: `${Math.max(0, width)}px`, visibility: "hidden" });
  stage.hidden = false;
  return () => Object.assign(stage.style, previous);
}

export function commitVisualLayout(figure, commit) {
  const height = figure.style.height;
  // A position change suppresses scroll anchoring for its layout window.
  // Keep the document's height unchanged while bringing the stage into flow,
  // then finish that window before releasing its final natural height.
  figure.style.height = `${figure.getBoundingClientRect().height}px`;
  try {
    commit();
    figure.getBoundingClientRect();
  } finally {
    figure.style.height = height;
  }
}

export function visualNearViewport(rect, viewportHeight) {
  return rect.width > 0 && rect.height > 0 && rect.bottom >= -240 && rect.top <= viewportHeight + 240;
}

export async function initVisual(figure, stillRelevant = () => true) {
  if (figure.dataset.visualState) return;
  if (!stillRelevant()) return "deferred";
  figure.dataset.visualState = "loading";
  const stage = figure.querySelector(".visual-stage");
  const toolbar = figure.querySelector(".visual-toolbar");
  const fallback = figure.querySelector(".visual-fallback");
  const status = figure.querySelector(".visual-status");
  const previousStatus = status?.textContent;
  const labels = strings[document.documentElement.lang.startsWith("zh") ? "zh" : "en"];
  if (status) status.textContent = labels.loading;
  let restoreStage = () => {};
  try {
    if (!stage || !toolbar || !fallback) throw new Error("Missing graphic containers");
    const data = JSON.parse(figure.querySelector("script.visual-data").textContent);
    const render = figure.dataset.visual === "map" ? renderMap : figure.dataset.visual === "share" ? renderShare : null;
    if (!render) throw new Error("Unknown graphic type");
    if (figure.dataset.visual === "map") validateMap(data); else validateShare(data);
    const vendor = await import(safeVendorURL(figure.dataset.vendor, document.baseURI));
    // Intersection notifications and module downloads are asynchronous. Native
    // Back restoration or a fast reader may have moved this figure away since
    // it was queued. Keep its readable outline; observe it again when needed.
    if (!stillRelevant()) {
      delete figure.dataset.visualState;
      if (status) status.textContent = previousStatus;
      return "deferred";
    }
    const padding = getComputedStyle(figure);
    const width = figure.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
    restoreStage = stageVisualOffFlow(stage, width);
    await nextFrame();
    const view = await render(figure, stage, toolbar, data, vendor, labels);
    // Commit without a temporary double-height layout or an unstable anchor.
    commitVisualLayout(figure, () => {
      restoreStage();
      toolbar.hidden = false;
      fallback.open = false;
      figure.dataset.visualState = "ready";
      figure.dataset.enhanced = "true";
      if (status) status.textContent = view.hint;
    });
    fullscreenControl(figure, toolbar, view.resize, labels);
    requestAnimationFrame(view.resize);
  } catch (error) {
    console.warn("Article graphic unavailable; readable content retained.", error);
    figure.dataset.visualState = "fallback";
    figure.dataset.enhanced = "false";
    if (stage) { stage.hidden = true; restoreStage(); stage.replaceChildren(); }
    if (toolbar) toolbar.hidden = true;
    if (fallback) fallback.open = true;
    if (status) status.textContent = labels.failed;
  }
}

export function initArticleVisuals(root = document) {
  const figures = [...root.querySelectorAll("figure.article-visual[data-visual]")];
  if (!figures.length) return;
  if (typeof IntersectionObserver === "undefined") { figures.forEach(figure => { void initVisual(figure); }); return; }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const figure = entry.target;
      const stillRelevant = () => figure.isConnected && visualNearViewport(figure.getBoundingClientRect(), innerHeight);
      if (!entry.isIntersecting || !stillRelevant()) return;
      observer.unobserve(figure);
      void initVisual(figure, stillRelevant).then(result => {
        if (result === "deferred" && figure.isConnected) observer.observe(figure);
      });
    });
  }, { rootMargin: "240px 0px" });
  figures.forEach((figure) => observer.observe(figure));
  // Opening details for print also works in browsers that hide closed <details> descendants.
  let printState = [];
  window.addEventListener("beforeprint", () => {
    printState = figures.map((figure) => { const detail = figure.querySelector(".visual-fallback"); const open = detail?.open; if (detail) detail.open = true; return [detail, open]; });
  });
  window.addEventListener("afterprint", () => { printState.forEach(([detail, open]) => { if (detail) detail.open = open; }); });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initArticleVisuals(), { once: true });
  else initArticleVisuals();
}
