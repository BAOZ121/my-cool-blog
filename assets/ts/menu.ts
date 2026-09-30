/** A disclosure menu: native keyboard activation, state, and Escape focus return. */
export default function () {
    const toggle = document.getElementById('toggle-menu');
    const menu = document.getElementById('main-menu');
    if (!toggle || !menu || toggle.dataset.menuEnhanced) return;
    toggle.dataset.menuEnhanced = 'true';
    const desktop = window.matchMedia('(min-width: 768px)');
    let expanded = false;
    let lastMenuFocus: Element | null = menu.contains(document.activeElement) ? document.activeElement : null;
    const isPageFallback = (target: EventTarget | null) => target === null || target === document.body || target === document.documentElement;
    document.addEventListener('focusin', event => {
        if (menu.contains(event.target as Node)) lastMenuFocus = event.target as Element;
        else if (!isPageFallback(event.target) || menu.getClientRects().length > 0) lastMenuFocus = null;
    });
    menu.addEventListener('focusout', event => {
        const next = event.relatedTarget;
        if (!isPageFallback(next)) lastMenuFocus = menu.contains(next as Node) ? next as Element : null;
        // Some browsers blur a CSS-hidden menu before dispatching the media change.
        // Remember that loss only while the menu is hidden, not an intentional blur.
        else if (menu.getClientRects().length > 0) lastMenuFocus = null;
    });
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
        const active = document.activeElement;
        const focusedInMenu = menu.contains(active) ||
            (lastMenuFocus !== null && isPageFallback(active) && menu.getClientRects().length === 0);
        expanded = false;
        sync();
        if (!desktop.matches && focusedInMenu) toggle.focus();
    });
    sync();
}
