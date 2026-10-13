(() => {
  'use strict';
  const root = document.querySelector('.amd-research');
  if (!root) return;
  const data = root.querySelector('#amd-finance-data');
  if (!data) return;
  let finance;
  try { finance = JSON.parse(data.textContent); } catch (_) { return; }
  const number = value => Number(value).toLocaleString('en-US');
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function annualChart(metric) {
    const records = finance.annual;
    const label = metric === 'revenue' ? 'Revenue' : 'GAAP operating income';
    const largest = Math.max(...records.map(row => row[metric]));
    const unit = metric === 'revenue' ? 10000 : 1000;
    const ceiling = Math.ceil(largest / unit) * unit;
    let svg = `<svg viewBox="0 0 720 330" role="img" aria-label="${label} by fiscal year, in US dollars millions"><title>${label}, fiscal 2021–2025, US$ million</title>`;
    for (let tick = 0; tick < 5; tick++) {
      const value = ceiling * tick / 4;
      const y = 265 - tick * 52;
      svg += `<line x1="74" x2="690" y1="${y}" y2="${y}" class="chart-grid"/><text x="63" y="${y + 5}" text-anchor="end" class="chart-axis">${number(value)}</text>`;
    }
    records.forEach((row, index) => {
      const height = row[metric] / ceiling * 208;
      const x = 100 + index * 118;
      const y = 265 - height;
      svg += `<g tabindex="0" class="chart-bar"><title>Fiscal ${row.fiscal_year}: ${label} US$ ${number(row[metric])} million; year ended ${escape(row.period_end)}</title><rect x="${x}" y="${y}" width="70" height="${height}" rx="3"/><text x="${x + 35}" y="${y - 12}" text-anchor="middle" class="chart-value">${number(row[metric])}</text><text x="${x + 35}" y="293" text-anchor="middle" class="chart-axis">FY ${row.fiscal_year}</text></g>`;
    });
    svg += '<text x="74" y="22" class="chart-unit">US$ million</text></svg>';
    root.querySelector('#amd-annual-chart').innerHTML = svg;
    root.querySelector('#amd-annual-chart-title').textContent = `${label}, fiscal 2021–2025`;
    const latest = records[records.length - 1];
    root.querySelector('#amd-annual-chart-reading').textContent = `FY 2025 ${label.toLowerCase()}: US$ ${number(latest[metric])} million.`;
    root.querySelectorAll('[data-annual]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.annual === metric)));
  }

  function mixChart(period) {
    const row = period === '2025' ? finance.segment_revenue.find(row => row.fiscal_year === 2025) : finance.quarterly_and_half_year.find(row => row.period === 'Q2 2026');
    const total = row.total || row.revenue;
    const label = period === '2025' ? 'FY 2025' : 'Q2 2026';
    const segments = [['Data Center','data_center','dc'],['Client and Gaming','client_gaming','cg'],['Embedded','embedded','em']];
    let content = `<div class="mix-strip" role="img" aria-label="Share of AMD revenue by reported segment, ${label}">`;
    segments.forEach(([name,key,color]) => {
      const percentage = row[key] / total * 100;
      content += `<span class="mix-${color}" style="width:${percentage}%" title="${name}: ${percentage.toFixed(1)}%"><span>${percentage.toFixed(1)}%</span></span>`;
    });
    content += '</div><div class="mix-legend">';
    segments.forEach(([name,key,color]) => {
      content += `<div><span class="legend-swatch mix-${color}"></span><span>${name}</span><strong>${(row[key] / total * 100).toFixed(1)}%</strong><small>US$ ${number(row[key])} million</small></div>`;
    });
    content += '</div>';
    root.querySelector('#amd-mix-chart').innerHTML = content;
    root.querySelector('#amd-mix-chart-title').textContent = `Reported segments, ${label}`;
    root.querySelector('#amd-mix-chart-reading').textContent = `${label} total revenue: US$ ${number(total)} million.`;
    root.querySelectorAll('[data-mix]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mix === period)));
  }

  root.querySelectorAll('[data-annual]').forEach(button => button.addEventListener('click', () => annualChart(button.dataset.annual)));
  root.querySelectorAll('[data-mix]').forEach(button => button.addEventListener('click', () => mixChart(button.dataset.mix)));

})();
