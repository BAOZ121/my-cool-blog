/** Last chapter above the reading line; independent of URL/hash and scrolling. */
export function chapterAtPosition(positions, readingLine) {
  if (!positions.length) return -1;
  let active = 0;
  for (let index = 0; index < positions.length; index++) {
    if (positions[index] > readingLine) break;
    active = index;
  }
  return active;
}

export function targetID(href, base) {
  try {
    const url = new URL(href, base);
    const current = new URL(base);
    if (url.origin !== current.origin || url.pathname !== current.pathname || url.search !== current.search) return null;
    return decodeURIComponent(url.hash.slice(1)) || null;
  } catch { return null; }
}

export function setupChapterRails(document, window) {
  const rails = [...document.querySelectorAll('[data-chapter-rail]')];
  const content = document.querySelector('.article-content');
  if (!rails.length || !content) return;
  // Preserve an incoming query string (for example campaign attribution) when
  // following the canonical path+hash anchors rendered by Hugo.
  for (const rail of rails) for (const link of rail.querySelectorAll('a[href]')) {
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin && url.pathname === window.location.pathname) {
      url.search = window.location.search;
      link.href = url.href;
    }
  }
  const groups = rails.map(rail => ({
    rail,
    links: [...rail.querySelectorAll('a[href]')].map(link => ({ link, id: targetID(link.href, window.location.href) })),
    userUntil: 0,
  }));
  const headings = groups[0].links.map(({ id }) => document.getElementById(id)).filter(heading => heading && content.contains(heading));
  if (!headings.length) return;
  let frame = 0;
  let positions = [];
  let current = null;

  function measure() {
    positions = headings.map(heading => heading.getBoundingClientRect().top + window.scrollY);
    current = null;
    schedule();
  }

  function update() {
    frame = 0;
    const index = chapterAtPosition(positions, window.scrollY + 72);
    const id = headings[index]?.id;
    if (!id || current === id) return;
    current = id;
    for (const group of groups) {
      const { rail, links } = group;
      rail.querySelectorAll('[data-current-chapter]').forEach(item => item.removeAttribute('data-current-chapter'));
      let active;
      for (const item of links) {
        if (item.id === id) { item.link.setAttribute('aria-current', 'location'); active = item.link; }
        else item.link.removeAttribute('aria-current');
      }
      if (!active) continue;
      let chapter = active.closest('li');
      while (chapter && chapter.parentElement !== rail.firstElementChild) chapter = chapter.parentElement?.closest('li');
      chapter?.setAttribute('data-current-chapter', '');
      const position = rail.closest('.chapter-widget')?.querySelector('[data-chapter-position]');
      if (position && chapter) {
        const chapters = [...rail.firstElementChild.children];
        position.textContent = `${String(chapters.indexOf(chapter) + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`;
      }
      // Move only the rail, never the document, and never fight a reader who
      // is hovering, tabbing, touching or manually scrolling through chapters.
      if (!rail.closest('.chapter-mobile') && rail.clientHeight && !rail.matches(':hover') && !rail.contains(document.activeElement) && Date.now() > group.userUntil) {
        const bounds = rail.getBoundingClientRect();
        const linkBounds = active.getBoundingClientRect();
        if (linkBounds.top < bounds.top + 12) rail.scrollTop -= bounds.top + 12 - linkBounds.top;
        else if (linkBounds.bottom > bounds.bottom - 12) rail.scrollTop += linkBounds.bottom - bounds.bottom + 12;
      }
    }
  }

  function schedule() { if (!frame) frame = window.requestAnimationFrame(update); }
  for (const group of groups) {
    for (const event of ['wheel', 'touchstart', 'pointerdown']) group.rail.addEventListener(event, () => { group.userUntil = Date.now() + 1500; }, { passive: true });
    group.rail.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const link = event.target.closest('a[href]');
      const heading = link && document.getElementById(targetID(link.href, window.location.href));
      if (!heading || !content.contains(heading)) return;
      // The browser owns navigation, URL, history and scroll restoration.
      // Make the native destination usable for the next keyboard action.
      window.requestAnimationFrame(() => {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        schedule();
      });
    });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', measure);
  window.addEventListener('load', measure, { once: true });
  if (window.ResizeObserver) new window.ResizeObserver(measure).observe(content);
  document.fonts?.ready.then(measure);
  measure();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') setupChapterRails(document, window);
