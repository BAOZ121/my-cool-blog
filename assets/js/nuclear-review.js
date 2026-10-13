/* Local-only enhancement of native links, evidence disclosures and an SVG viewer. */
(() => {
  "use strict";

  function initialize() {
    const report = document.querySelector(".nuclear-report");
    if (!report) return;
    const records = Array.from(report.querySelectorAll("details.nuclear-evidence-record"));
    const expand = document.getElementById("nuclear-expand-evidence");
    const collapse = document.getElementById("nuclear-collapse-evidence");

    function revealEvidence(hash, focus) {
      if (!hash || !hash.startsWith("#source-")) return false;
      let id;
      try { id = decodeURIComponent(hash.slice(1)); } catch (_) { return false; }
      const record = document.getElementById(id);
      if (!record || !record.matches("details.nuclear-evidence-record")) return false;
      record.open = true;
      requestAnimationFrame(() => {
        record.scrollIntoView({ behavior: "auto", block: "start" });
        if (focus) {
          const summary = record.querySelector("summary");
          if (summary) summary.focus({ preventScroll: true });
        }
      });
      return true;
    }

    report.addEventListener("click", (event) => {
      const citation = event.target.closest("a.nuclear-cite");
      if (!citation || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const hash = citation.getAttribute("href");
      if (!revealEvidence(hash, true)) return;
      event.preventDefault();
      try { history.replaceState(null, "", hash); }
      catch (_) { location.hash = hash; }
    });
    if (expand) expand.addEventListener("click", () => records.forEach((record) => { record.open = true; }));
    if (collapse) collapse.addEventListener("click", () => records.forEach((record) => { record.open = false; }));
    window.addEventListener("hashchange", () => revealEvidence(location.hash, false));
    revealEvidence(location.hash, false);

    let printStates = null;
    function beforePrint() {
      if (printStates) return;
      printStates = records.map((record) => record.open);
      records.forEach((record) => { record.open = true; });
    }
    function afterPrint() {
      if (!printStates) return;
      records.forEach((record, index) => { record.open = printStates[index]; });
      printStates = null;
    }
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);

  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
