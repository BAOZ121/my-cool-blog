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

    const dialog = document.getElementById("nuclear-figure-dialog");
    const figureImage = document.getElementById("nuclear-figure-image");
    const canvas = document.getElementById("nuclear-figure-canvas");
    const title = document.getElementById("nuclear-figure-title");
    const close = document.getElementById("nuclear-close-figure");
    const zoom = document.getElementById("nuclear-zoom");
    const zoomValue = document.getElementById("nuclear-zoom-value");
    const fit = document.getElementById("nuclear-fit");
    const download = document.getElementById("nuclear-figure-download");
    if (!dialog || !figureImage || !canvas || !zoom || !zoomValue ||
        typeof dialog.showModal !== "function") return;

    let trigger = null;
    let bodyOverflow = "";
    let baseWidth = 0;
    let factor = 1;
    let wasLocked = false;

    function fitWidth() {
      const style = getComputedStyle(canvas);
      const innerWidth = canvas.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
      const innerHeight = canvas.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0");
      const naturalWidth = figureImage.naturalWidth || innerWidth;
      const naturalHeight = figureImage.naturalHeight || innerHeight;
      baseWidth = Math.max(1, Math.min(naturalWidth, innerWidth, innerHeight * naturalWidth / naturalHeight));
    }

    function applyZoom(value, preserveCenter) {
      const nextFactor = Math.max(1, Math.min(2.5, Number(value) / 100 || 1));
      const centerX = (canvas.scrollLeft + canvas.clientWidth / 2) / factor;
      const centerY = (canvas.scrollTop + canvas.clientHeight / 2) / factor;
      factor = nextFactor;
      zoom.value = String(Math.round(factor * 100));
      zoomValue.value = zoom.value + "%";
      zoomValue.textContent = zoom.value + "%";
      if (!baseWidth) fitWidth();
      figureImage.style.width = (baseWidth * factor) + "px";
      if (preserveCenter) {
        canvas.scrollLeft = centerX * factor - canvas.clientWidth / 2;
        canvas.scrollTop = centerY * factor - canvas.clientHeight / 2;
      } else {
        canvas.scrollLeft = 0;
        canvas.scrollTop = 0;
      }
    }

    function fitImage() {
      fitWidth();
      applyZoom(100, false);
    }

    function openFigure(control) {
      const src = control.dataset.src || control.getAttribute("href");
      if (!src) return;
      trigger = control;
      if (title) title.textContent = control.dataset.title || "Report figure";
      figureImage.alt = control.dataset.alt || control.dataset.title || "Report figure";
      figureImage.removeAttribute("width");
      figureImage.removeAttribute("height");
      figureImage.style.width = "";
      baseWidth = 0;
      factor = 1;
      if (download) {
        download.href = src;
        const filename = src.split("/").pop().split("?")[0].split("#")[0];
        download.download = filename || "nuclear-report-figure.svg";
      }
      figureImage.onload = () => { if (dialog.open) fitImage(); };
      figureImage.src = src;
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      wasLocked = true;
      dialog.showModal();
      requestAnimationFrame(() => {
        if (figureImage.complete && figureImage.naturalWidth) fitImage();
        if (close) close.focus({ preventScroll: true });
      });
    }

    report.querySelectorAll("[data-nuclear-figure]").forEach((control) => {
      control.setAttribute("aria-haspopup", "dialog");
      control.setAttribute("aria-controls", "nuclear-figure-dialog");
      control.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openFigure(control);
      });
    });
    zoom.addEventListener("input", () => applyZoom(zoom.value, true));
    if (fit) fit.addEventListener("click", fitImage);
    if (close) close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      if (wasLocked) document.body.style.overflow = bodyOverflow;
      wasLocked = false;
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    });
    // Native dialog supplies Escape handling and focus containment.
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    window.addEventListener("resize", () => { if (dialog.open) fitImage(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
