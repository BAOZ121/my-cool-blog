// Progressive enhancement only: all maps, evidence and links are rendered by Hugo.
export function matchesProfile(profile, query = "", category = "") {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = (profile.search || "").toLocaleLowerCase();
  return (!category || profile.category === category) && terms.every((term) => text.includes(term));
}

export function readFilters(search, categories) {
  const params = new URLSearchParams(search);
  const category = params.get("category") || "";
  return { query: params.get("q") || "", category: categories.includes(category) ? category : "" };
}

export function filterURL(href, query, category) {
  const url = new URL(href);
  for (const [key, value] of [["q", query.trim()], ["category", category]]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url;
}

export function initDirectory(root, navigation = window) {
  if (!root) return;
  const form = root.querySelector("form");
  const query = root.querySelector("#bd-query");
  const category = root.querySelector("#bd-category");
  const count = root.querySelector("[data-breakdown-count]");
  const empty = root.querySelector("[data-breakdown-empty]");
  const cards = Array.from(root.querySelectorAll("[data-breakdown-card]"));
  const categories = Array.from(category.options, (option) => option.value);
  const restore = () => {
    const state = readFilters(navigation.location.search, categories);
    query.value = state.query;
    category.value = state.category;
  };
  const update = (syncURL = true) => {
    let visible = 0;
    cards.forEach((card) => {
      card.hidden = !matchesProfile(card.dataset, query.value, category.value);
      if (!card.hidden) visible += 1;
    });
    count.textContent = `Showing ${visible} of ${cards.length} breakdowns`;
    empty.hidden = visible !== 0;
    if (syncURL) {
      navigation.history.replaceState(null, "", filterURL(navigation.location.href, query.value, category.value));
    }
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); update(); });
  query.addEventListener("input", () => update());
  category.addEventListener("change", () => update());
  form.addEventListener("reset", (event) => {
    event.preventDefault();
    query.value = "";
    category.value = "";
    update();
    query.focus();
  });
  navigation.addEventListener("popstate", () => { restore(); update(false); });
  restore();
  update(false);
  form.hidden = false;
}

export function initStages(root) {
  const toggle = root.querySelector("[data-expand-chain]");
  if (!toggle) return;
  const details = Array.from(root.querySelectorAll("[data-chain-detail]"));
  const sync = () => {
    const allOpen = details.every((detail) => detail.open);
    toggle.textContent = allOpen ? "Collapse all stage details" : "Expand all stage details";
    toggle.setAttribute("aria-expanded", String(allOpen));
  };
  toggle.addEventListener("click", () => {
    const open = !details.every((detail) => detail.open);
    details.forEach((detail) => { detail.open = open; });
    sync();
  });
  details.forEach((detail) => detail.addEventListener("toggle", sync));
  toggle.hidden = false;
  sync();
  // Print all stage content without changing the reader's saved open/closed state.
  let previous = null;
  window.addEventListener("beforeprint", () => {
    previous = details.map((detail) => detail.open);
    details.forEach((detail) => { detail.open = true; });
  });
  window.addEventListener("afterprint", () => {
    if (previous) details.forEach((detail, index) => { detail.open = previous[index]; });
    previous = null;
    sync();
  });
}

if (typeof document !== "undefined") {
  initDirectory(document.querySelector("[data-breakdown-directory]"));
  initStages(document);
}
