(function () {
  const DATA_URL = "/data/industries.json";
  const root = document.getElementById("industry-explorer");
  if (!root) return;

  const els = {
    q: root.querySelector("#ix-q"),
    category: root.querySelector("#ix-category"),
    maturity: root.querySelector("#ix-maturity"),
    cagr: root.querySelector("#ix-cagr"),
    coverage: root.querySelector("#ix-coverage"),
    count: root.querySelector("#ix-count"),
    tbody: root.querySelector("#ix-tbody"),
    pv: root.querySelector("#ix-pv"),
    rate: root.querySelector("#ix-rate"),
    years: root.querySelector("#ix-years"),
    result: root.querySelector("#ix-result"),
    yearList: root.querySelector("#ix-year-list"),
    warn: root.querySelector("#ix-warn"),
    loaded: root.querySelector("#ix-loaded"),
    details: root.querySelector("#ix-details"),
  };

  let items = [];
  let selected = null;
  let sortKey = "rank";
  let sortDir = 1;

  const fmtMoney = (n) => {
    if (!Number.isFinite(n)) return "—";
    if (n >= 1000) return "$" + (n / 1000).toFixed(2) + "T";
    return "$" + n.toFixed(1) + "B";
  };

  const midpoint = (lo, hi) => {
    if (lo == null && hi == null) return null;
    if (lo == null) return Number(hi);
    if (hi == null) return Number(lo);
    return (Number(lo) + Number(hi)) / 2;
  };

  const cagrValue = (row) => {
    if (row.cagr_low == null || row.cagr_high == null) return null;
    return midpoint(row.cagr_low, row.cagr_high);
  };
  const cagrFilterValue = (row) => cagrValue(row) ?? (row.cagr_low == null ? null : Number(row.cagr_low));
  const marketValue = (row) => midpoint(row.market_low, row.market_high);

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeSourceLink(url, label) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return "";
      return '<a href="' + escapeHtml(parsed.href) + '">' + escapeHtml(label) + "</a>";
    } catch (_) {
      return "";
    }
  }

  function updateSortState() {
    root.querySelectorAll("th[data-sort]").forEach((header) => {
      const active = header.getAttribute("data-sort") === sortKey;
      header.setAttribute(
        "aria-sort",
        active ? (sortDir === 1 ? "ascending" : "descending") : "none"
      );
    });
  }

  function compareRows(a, b) {
    let av = sortKey === "cagr" ? cagrFilterValue(a) : a[sortKey];
    let bv = sortKey === "cagr" ? cagrFilterValue(b) : b[sortKey];

    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return av.localeCompare(bv) * sortDir;
    return (Number(av) - Number(bv)) * sortDir;
  }

  function applyFilters() {
    if (!items.length) return;
    const q = (els.q.value || "").trim().toLowerCase();
    const cat = els.category.value;
    const mat = els.maturity.value;
    const cagrMin = els.cagr.value ? Number(els.cagr.value) : null;

    const rows = items
      .filter((row) => {
        if (cat && row.category !== cat) return false;
        if (mat && row.maturity !== mat) return false;
        if (cagrMin != null) {
          const cagr = cagrFilterValue(row);
          if (cagr == null || cagr < cagrMin) return false;
        }
        if (q) {
          const searchable = [row.name, row.tech, row.notes, row.category, row.maturity]
            .join(" ")
            .toLowerCase();
          if (!searchable.includes(q)) return false;
        }
        return true;
      })
      .sort(compareRows);

    els.count.textContent = "Showing " + rows.length + " of " + items.length;
    updateSortState();
    renderTable(rows);
  }

  function renderTable(rows) {
    if (!rows.length) {
      els.tbody.innerHTML = '<tr><td colspan="6" class="ix-empty">No matching industries.</td></tr>';
      return;
    }

    els.tbody.innerHTML = rows
      .map((row) => {
        const isSelected = selected && selected.rank === row.rank;
        const calcReady = marketValue(row) != null && cagrValue(row) != null;
        const action = calcReady ? "Inspect and load indicative values" : "Inspect; calculator inputs are incomplete";

        return (
          '<tr data-rank="' +
          row.rank +
          '" class="' +
          (isSelected ? "is-selected" : "") +
          '">' +
          "<td>" +
          row.rank +
          "</td>" +
          '<td><button type="button" class="ix-select" data-rank="' + row.rank +
          '" aria-label="' + escapeHtml(action + ": " + row.name) +
          '" aria-pressed="' + (isSelected ? "true" : "false") + '">' +
          escapeHtml(row.name) + "</button></td>" +
          "<td>" +
          escapeHtml(row.tech) +
          "</td>" +
          "<td>" +
          escapeHtml(row.market_label) +
          "</td>" +
          "<td>" +
          escapeHtml(row.cagr_label) +
          "</td>" +
          '<td><span class="ix-chip">' +
          escapeHtml(row.category) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function clearScenario(message) {
    els.pv.value = "";
    els.rate.value = "";
    els.result.textContent = "Enter values to calculate";
    els.yearList.innerHTML = "";
    els.warn.textContent = message || "";
  }

  function selectRank(rank) {
    selected = items.find((item) => item.rank === rank) || null;
    applyFilters();
    if (!selected) return;
    const selectedButton = Array.from(els.tbody.querySelectorAll(".ix-select"))
      .find((button) => Number(button.dataset.rank) === rank);
    if (selectedButton) selectedButton.focus({ preventScroll: true });

    const pv = marketValue(selected);
    const rate = cagrValue(selected);
    els.loaded.textContent = "Selected: " + selected.name;
    els.details.innerHTML =
      "<strong>" + escapeHtml(selected.name) + "</strong>" +
      "<dl><dt>Category</dt><dd>" + escapeHtml(selected.category) +
      "</dd><dt>Maturity</dt><dd>" + escapeHtml(selected.maturity) +
      " (editorial)</dd><dt>Projected size</dt><dd>" + escapeHtml(selected.projected_label) +
      "</dd><dt>Notes</dt><dd>" + escapeHtml(selected.notes) +
      "</dd><dt>Market definition</dt><dd>" + escapeHtml(selected.market_definition || "Not recorded") +
      "</dd><dt>Geography</dt><dd>" + escapeHtml(selected.geography || "Not recorded") +
      "</dd><dt>Numeric source and date</dt><dd>" +
      (safeSourceLink(selected.numeric_source_url, "Open numeric source") || "No numeric source recorded") +
      "; " + escapeHtml(selected.source_date || "date not recorded") +
      "</dd><dt>Related primary material</dt><dd>" +
      (safeSourceLink(selected.context_url, "Read category context (does not verify figures)") || "None linked") +
      "</dd></dl>";

    if (pv == null || rate == null) {
      clearScenario(
        "This row lacks a usable market value or a two-sided CAGR range. Previous values were cleared; enter your own assumptions to run a scenario."
      );
      return;
    }

    els.warn.textContent = "";
    els.pv.value = String(Math.round(pv * 10) / 10);
    els.rate.value = String(Math.round(rate * 10) / 10);
    els.loaded.textContent = "Loaded indicative, unverified values for " + selected.name + ". Check definitions and sources before use.";
    calculate();
  }

  function calculate() {
    const pvRaw = els.pv.value.trim();
    const rateRaw = els.rate.value.trim();
    const yearsRaw = els.years.value.trim();
    const pv = Number(pvRaw);
    const ratePercent = Number(rateRaw);
    const years = Number(yearsRaw);

    const valid =
      pvRaw !== "" &&
      rateRaw !== "" &&
      yearsRaw !== "" &&
      Number.isFinite(pv) &&
      pv >= 0 &&
      Number.isFinite(ratePercent) &&
      ratePercent > -100 &&
      Number.isInteger(years) &&
      years >= 1 &&
      years <= 50;

    if (!valid) {
      els.result.textContent = "Enter valid values to calculate";
      els.yearList.innerHTML = "";
      return;
    }

    const rate = ratePercent / 100;
    const fv = pv * Math.pow(1 + rate, years);
    els.result.textContent =
      "≈ " + fmtMoney(fv) + " after " + years + (years === 1 ? " year" : " years");

    let html = "";
    for (let year = 1; year <= years; year += 1) {
      html += "<li>Year " + year + ": " + fmtMoney(pv * Math.pow(1 + rate, year)) + "</li>";
    }
    els.yearList.innerHTML = html;
  }

  root.addEventListener("input", (event) => {
    if (["ix-q", "ix-category", "ix-maturity", "ix-cagr"].includes(event.target.id)) {
      applyFilters();
    }
    if (["ix-pv", "ix-rate", "ix-years"].includes(event.target.id)) {
      els.warn.textContent = "";
      calculate();
    }
  });

  root.addEventListener("change", (event) => {
    if (["ix-category", "ix-maturity", "ix-cagr"].includes(event.target.id)) applyFilters();
  });

  root.addEventListener("click", (event) => {
    const sortButton = event.target.closest(".ix-sort[data-sort]");
    if (sortButton) {
      const key = sortButton.getAttribute("data-sort");
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = 1;
      }
      applyFilters();
      return;
    }

    const button = event.target.closest(".ix-select[data-rank]");
    if (button) selectRank(Number(button.getAttribute("data-rank")));
  });

  function loadData(payload) {
    if (!payload || !Array.isArray(payload.industries) || !payload.industries.length) {
      throw new Error("Invalid industry data");
    }
    items = payload.industries;
    const cagrCount = items.filter((item) => cagrFilterValue(item) != null).length;
    const calculatorCount = items.filter(
      (item) => marketValue(item) != null && cagrValue(item) != null
    ).length;
    els.coverage.textContent =
      "Data coverage: numeric CAGR or lower bound for " +
      cagrCount +
      "/" +
      items.length +
      "; rows with market and two-sided CAGR values for " +
      calculatorCount +
      "/" +
      items.length +
      ".";
    applyFilters();
    calculate();
  }

  try {
    const embedded = root.querySelector("#ix-dataset");
    if (!embedded) throw new Error("Embedded industry data missing");
    loadData(JSON.parse(embedded.textContent));
  } catch (error) {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Industry data request failed");
        return response.json();
      })
      .then(loadData)
      .catch(() => {
        els.count.textContent = "The full industry list remains available below.";
        els.coverage.textContent = "Interactive data is temporarily unavailable.";
        els.warn.textContent = "Refresh the page or download the CSV to inspect the data.";
      });
  }
})();
