/*!
*   Hugo Theme Stack
*
*   @author: Jimmy Cai
*   @website: https://jimmycai.com
*   @link: https://github.com/CaiJimmy/hugo-theme-stack
*/
import menu from './menu';
import createElement from './createElement';
import StackColorScheme from './colorScheme';
import { setupScrollspy } from './scrollspy';
import { setupSmoothAnchors } from './smoothAnchors';
import { setupPaginationJump } from './pagination';
import { setupCodeCopy } from './code-copy';

// Site override: controls are ready with the DOM, not after every image loads.
let initialized = false;
let Stack = {
    init: () => {
        if (initialized) return;
        initialized = true;
        /**
         * Bind menu event
         */
        menu();
        new StackColorScheme(document.getElementById('dark-mode-toggle')!);

        const articleContent = document.querySelector('.article-content') as HTMLElement;
        if (articleContent) {
            setupSmoothAnchors();
            setupScrollspy();
            setupCodeCopy();
        }

        setupPaginationJump();

    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Stack.init, { once: true });
} else {
    Stack.init();
}

declare global {
    interface Window {
        createElement: any;
        Stack: any
    }
}

window.Stack = Stack;
window.createElement = createElement;