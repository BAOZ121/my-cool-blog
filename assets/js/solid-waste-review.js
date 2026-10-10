(() => {
  const entries = [...document.querySelectorAll('[data-evidence]')];
  const search = document.querySelector('#evidence-search');
  if (!search) return;
  const count = document.querySelector('#evidence-count');
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const entry of entries) {
      entry.hidden = !entry.dataset.search.includes(query);
      if (!entry.hidden) visible++;
    }
    count.textContent = `${visible} of ${entries.length} research sources`;
    document.querySelector('#no-evidence-results').hidden = visible !== 0;
  };
  search.addEventListener('input', filter);
  document.querySelector('#clear-evidence-search').addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  document.querySelectorAll('[data-evidence-action]').forEach(button => button.addEventListener('click', () => {
    for (const entry of entries) if (!entry.hidden) entry.open = button.dataset.evidenceAction === 'expand';
  }));
  document.querySelectorAll('a.citation').forEach(link => link.addEventListener('click', () => {
    search.value = ''; filter();
    const target = document.getElementById(link.hash.slice(1));
    if (target) target.open = true;
  }));
  let printState = [];
  addEventListener('beforeprint', () => {
    printState = [...document.querySelectorAll('.evidence-entry')].map(node => [node, node.open, node.hidden]);
    printState.forEach(([node]) => { node.open = true; node.hidden = false; });
  });
  addEventListener('afterprint', () => { printState.forEach(([node, open, hidden]) => { node.open = open; node.hidden = hidden; }); printState = []; });
})();
