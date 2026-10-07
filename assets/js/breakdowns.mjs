// Progressive enhancement only: all maps, evidence and links are rendered by Hugo.
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
  initStages(document);
}
