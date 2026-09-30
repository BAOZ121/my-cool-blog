type colorScheme = 'light' | 'dark' | 'auto';

/** Site override: native button activation and an exposed, synchronized state. */
export default class StackColorScheme {
    private localStorageKey = 'StackColorScheme';
    private currentScheme: colorScheme;
    private media = window.matchMedia('(prefers-color-scheme: dark)');

    constructor(private toggleEl: HTMLElement | null) {
        this.currentScheme = this.getSavedScheme();
        this.applyScheme();
        this.media.addEventListener('change', () => this.applyScheme());
        this.toggleEl?.addEventListener('click', () => {
            this.currentScheme = this.isDark() ? 'light' : 'dark';
            // Preserve Stack's automatic mode when the choice matches the system.
            if (this.currentScheme === (this.media.matches ? 'dark' : 'light')) this.currentScheme = 'auto';
            this.applyScheme();
            try { localStorage.setItem(this.localStorageKey, this.currentScheme); } catch { /* The button also works when storage is unavailable. */ }
        });
        if (!document.body.style.transition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.body.style.setProperty('transition', 'background-color .3s ease');
        }
    }

    private isDark() {
        return this.currentScheme === 'dark' || this.currentScheme === 'auto' && this.media.matches;
    }

    private applyScheme() {
        const dark = this.isDark();
        const scheme = dark ? 'dark' : 'light';
        document.documentElement.dataset.scheme = scheme;
        this.toggleEl?.setAttribute('aria-pressed', String(dark));
        window.dispatchEvent(new CustomEvent('onColorSchemeChange', { detail: scheme }));
    }

    private getSavedScheme(): colorScheme {
        try {
            const saved = localStorage.getItem(this.localStorageKey);
            if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
        } catch { /* Fall back to the system preference. */ }
        return 'auto';
    }
}
