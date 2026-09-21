(function () {
  const DATA_URL = "/data/industries.json";
  const root = document.getElementById("industry-explorer");
  if (!root) return;

  const els = {
    q: root.querySelector("#ix-q"),
    category: root.querySelector("#ix-category"),
    maturity: root.querySelector("#ix-maturity"),
    cagr: root.querySelector("#ix-cagr"),
    count: root.querySelector("#ix-count"),
    tbody: root.querySelector("#ix-tbody"),
    pv: root.querySelector("#ix-pv"),
    rate: root.querySelector("#ix-rate"),
    years: root.querySelector("#ix-years"),
    result: root.querySelector("#ix-result"),
    yearList: root.querySelector("#ix-year-list"),
    warn: root.querySelector("#ix-warn"),
    useBtn: root.querySelector("#ix-use"),
    loaded: root.querySelector("#ix-loaded"),
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
    if (lo == null) return hi;
    if (hi == null) return lo;
    return (lo + hi) / 2;
  };

  const cagrValue = (row) => midpoint(row.cagr_low, row.cagr_high);

  function applyFilters() {
    const q = (els.q.value || "").trim().toLowerCase();
    const cat = els.category.value;
    const mat = els.maturity.value;
    const cagrMin = els.cagr.value ? Number(els.cagr.value) : null;

    let rows = items.filter((row) => {
      if (cat && row.category !== cat) return false;
      if (mat && row.maturity !== mat) return false;
      if (cagrMin != null) {
        const c = cagrValue(row);
        if (c == null || c < cagrMin) return false;
      }
      if (q) {
        const blob = [row.name, row.tech, row.notes, row.category].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "cagr") {
        av = cagrValue(a);
        bv = cagrValue(b);
      }
      if (av == null) av = sortDir > 0 ? Infinity : -Infinity;
      if (bv == null) bv = sortDir > 0 ? Infinity : -Infinity;
      if (typeof av === "string") return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });

    els.count.textContent = "Showing " + rows.length + " of " + items.length;
    renderTable(rows);
  }

  function renderTable(rows) {
    if (!rows.length) {
      els.tbody.innerHTML = '<tr><td colspan="6" class="ix-empty">No matching industries.</td></tr>';
      return;
    }
    els.tbody.innerHTML = rows
      .map((row) => {
        const sel = selected && selected.rank === row.rank ? " is-selected" : "";
        return (
          "<tr data-rank=\"" +
          row.rank +
          "\" class=\"" +
          sel +
          "\">" +
          "<td>" +
          row.rank +
          "</td>" +
          "<td><strong>" +
          escapeHtml(row.name) +
          "</strong></td>" +
          "<td>" +
          escapeHtml(row.tech) +
          "</td>" +
          "<td>" +
          escapeHtml(row.market_label) +
          "</td>" +
          "<td>" +
          escapeHtml(row.cagr_label) +
          "</td>" +
          "<td><span class=\"ix-chip\">" +
          escapeHtml(row.category) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function selectRank(rank) {
    selected = items.find((x) => x.rank === rank) || null;
    applyFilters();
    if (!selected) return;
    const pv = midpoint(selected.market_low, selected.market_high);
    const rate = cagrValue(selected);
    if (pv == null || rate == null) {
      els.warn.textContent = "This row has no usable market size or CAGR for the calculator.";
      els.loaded.textContent = "Selected: " + selected.name;
      return;
    }
    els.warn.textContent = "";
    els.pv.value = String(Math.round(pv * 10) / 10);
    els.rate.value = String(Math.round(rate * 10) / 10);
    els.loaded.textContent = "Loaded midpoint from " + selected.name;
    calculate();
  }

  function calculate() {
    const pv = Number(els.pv.value);
    const rate = Number(els.rate.value) / 100;
    const years = Number(els.years.value);
    if (!Number.isFinite(pv) || !Number.isFinite(rate) || !Number.isFinite(years) || years < 1) {
      els.result.textContent = "—";
      els.yearList.innerHTML = "";
      return;
    }
    const fv = pv * Math.pow(1 + rate, years);
    els.result.textContent = "≈ " + fmtMoney(fv);
    let html = "";
    for (let i = 1; i <= years; i++) {
      html += "<li>Year " + i + ": " + fmtMoney(pv * Math.pow(1 + rate, i)) + "</li>";
    }
    els.yearList.innerHTML = html;
  }

  root.addEventListener("input", (e) => {
    if (["ix-q", "ix-category", "ix-maturity", "ix-cagr"].includes(e.target.id)) applyFilters();
    if (["ix-pv", "ix-rate", "ix-years"].includes(e.target.id)) calculate();
  });
  root.addEventListener("change", (e) => {
    if (["ix-category", "ix-maturity", "ix-cagr"].includes(e.target.id)) applyFilters();
  });
  root.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th) {
      const key = th.getAttribute("data-sort");
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = 1;
      }
      applyFilters();
      return;
    }
    const tr = e.target.closest("tbody tr[data-rank]");
    if (tr) selectRank(Number(tr.getAttribute("data-rank")));
  });
  els.useBtn.addEventListener("click", () => {
    if (selected) selectRank(selected.rank);
    else els.warn.textContent = "Click a row in the table first.";
  });

  fetch(DATA_URL)
    .then((r) => r.json())
    .then((payload) => {
      items = payload.industries || [];
      applyFilters();
      calculate();
    })
    .catch(() => {
      els.count.textContent = "Could not load industry data.";
    });
})();
