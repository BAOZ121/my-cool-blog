/** A disclosure menu: native keyboard activation, state, and Escape focus return. */
export default function () {
    const toggle = document.getElementById('toggle-menu');
    const menu = document.getElementById('main-menu');
    if (!toggle || !menu || toggle.dataset.menuEnhanced) return;
    toggle.dataset.menuEnhanced = 'true';
    const desktop = window.matchMedia('(min-width: 768px)');
    let expanded = false;
    const sync = () => {
        menu.classList.toggle('show', expanded && !desktop.matches);
        document.body.classList.toggle('show-menu', expanded && !desktop.matches);
        toggle.classList.toggle('is-active', expanded && !desktop.matches);
        toggle.setAttribute('aria-expanded', String(desktop.matches || expanded));
    };
    toggle.addEventListener('click', () => {
        if (desktop.matches) return;
        expanded = !expanded;
        sync();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || desktop.matches || !expanded) return;
        if (document.activeElement !== toggle && !menu.contains(document.activeElement)) return;
        event.preventDefault();
        expanded = false;
        sync();
        toggle.focus();
    });
    desktop.addEventListener('change', () => {
        const focusedInMenu = menu.contains(document.activeElement);
        expanded = false;
        sync();
        if (!desktop.matches && focusedInMenu) toggle.focus();
    });
    sync();
}
