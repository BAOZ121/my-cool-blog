const printButtons = document.querySelectorAll<HTMLButtonElement>("[data-print-article]");

printButtons.forEach((button) => {
    button.addEventListener("click", () => window.print());
});

const progress = document.querySelector<HTMLElement>("[data-reading-progress]");
const article = document.querySelector<HTMLElement>(".article-content");

if (progress && article) {
    let ticking = false;

    const updateProgress = () => {
        const articleTop = window.scrollY + article.getBoundingClientRect().top;
        const readableDistance = Math.max(article.offsetHeight - window.innerHeight, 1);
        const amountRead = window.scrollY - articleTop;
        const ratio = Math.min(Math.max(amountRead / readableDistance, 0), 1);

        progress.style.transform = `scaleX(${ratio})`;
        ticking = false;
    };

    const requestUpdate = () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateProgress);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    updateProgress();
}
