/** Progressive enhancement: all material links and citation notes exist in HTML. */
export function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

export function matches(text, query) {
  const haystack = normalize(text);
  return normalize(query).split(" ").filter(Boolean).every(word => haystack.includes(word));
}

export function readFilters(search, articleIds) {
  const params = new URLSearchParams(search);
  const article = params.get("article") || "";
  const type = params.get("type") || "";
  return { q: params.get("q") || "", article: articleIds.includes(article) ? article : "", type: ["link", "file"].includes(type) ? type : "" };
}

export function initEvidenceLibrary(root) {
  const form = root.querySelector(".el-filters");
  const query = root.querySelector("#el-query");
  const articleFilter = root.querySelector("#el-article");
  const typeFilter = root.querySelector("#el-type");
  const count = root.querySelector("[data-result-count]");
  const empty = root.querySelector("[data-empty]");
  const expand = root.querySelector("[data-expand-all]");
  const groups = [...root.querySelectorAll("[data-article]")].map(element => ({
    element, id: element.dataset.article, title: element.dataset.articleTitle,
    count: element.querySelector("[data-article-count]"),
    items: [...element.querySelectorAll("[data-evidence-item]")].map(item => ({ element: item, type: item.dataset.kind, text: item.textContent })),
  }));
  const articleIds = groups.map(group => group.id);
  const plural = (value, noun) => `${value} ${noun}${value === 1 ? "" : "s"}`;
  const updateExpandLabel = () => {
    const visible = groups.filter(group => !group.element.hidden);
    expand.hidden = !visible.length;
    expand.textContent = visible.every(group => group.element.open) ? "Collapse all" : "Expand all";
  };
  function apply({ updateURL = false, push = false } = {}) {
    let materials = 0;
    let articles = 0;
    const active = !!(query.value.trim() || articleFilter.value || typeFilter.value);
    for (const group of groups) {
      let shown = 0;
      for (const item of group.items) {
        const match = (!articleFilter.value || group.id === articleFilter.value)
          && (!typeFilter.value || item.type === typeFilter.value)
          && matches(`${group.title} ${item.text}`, query.value);
        item.element.hidden = !match;
        if (match) shown++;
      }
      group.element.hidden = active && shown === 0;
      if (!group.element.hidden) articles++;
      materials += shown;
      group.count.textContent = active ? `${shown} of ${plural(group.items.length, "material")}` : plural(shown, "material");
      group.element.open = active && shown > 0;
    }
    count.textContent = `${plural(materials, "material")} across ${plural(articles, "article")}`;
    empty.hidden = materials > 0;
    if (updateURL) {
      const url = new URL(window.location.href);
      for (const [key, value] of [["q", query.value.trim()], ["article", articleFilter.value], ["type", typeFilter.value]]) {
        if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      }
      // A previous collection anchor must not point at a now-hidden result.
      url.hash = "";
      if (url.href !== window.location.href) window.history[push ? "pushState" : "replaceState"](null, "", url);
    }
    updateExpandLabel();
  }
  function revealAnchor() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const group = groups.find(group => group.element.id === id);
    if (!group || group.element.hidden) return;
    group.element.open = true;
    updateExpandLabel();
  }
  function restore() {
    const state = readFilters(window.location.search, articleIds);
    query.value = state.q;
    articleFilter.value = state.article;
    typeFilter.value = state.type;
    apply();
    revealAnchor();
  }
  function clear() {
    query.value = articleFilter.value = typeFilter.value = "";
    apply({ updateURL: true, push: true });
    query.focus();
  }
  query.addEventListener("input", () => apply({ updateURL: true }));
  articleFilter.addEventListener("change", () => apply({ updateURL: true, push: true }));
  typeFilter.addEventListener("change", () => apply({ updateURL: true, push: true }));
  form.addEventListener("submit", event => { event.preventDefault(); apply({ updateURL: true }); });
  form.addEventListener("reset", event => { event.preventDefault(); clear(); });
  root.querySelector("[data-clear-empty]").addEventListener("click", clear);
  expand.addEventListener("click", () => {
    const visible = groups.filter(group => !group.element.hidden);
    const open = !visible.every(group => group.element.open);
    visible.forEach(group => { group.element.open = open; });
    updateExpandLabel();
  });
  groups.forEach(group => group.element.addEventListener("toggle", updateExpandLabel));
  window.addEventListener("popstate", restore);
  window.addEventListener("hashchange", revealAnchor);
  form.hidden = false;
  restore();
  root.dataset.enhanced = "true";
}

if (typeof document !== "undefined") {
  const root = document.querySelector("[data-evidence-library]");
  if (root) initEvidenceLibrary(root);
}
