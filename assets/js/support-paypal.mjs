// Public client ID supplied by the owner. This is LIVE PayPal, not sandbox.
export const SDK_URL = 'https://www.paypal.com/sdk/js?client-id=BAABfpXYLqPFYyqPtg7WTcVDzdX-UGF1bv8M0Y31s3p8ECDU4IGgR7IMmV2cTgn71zaJuaoVQqfl56zZSk&components=hosted-buttons&disable-funding=venmo&currency=USD';
export const HOSTED_BUTTON_ID = 'YTJXE3R8LDUPL';
const sdkLoads = new WeakMap();

/** One script and one load attempt per document; reload is the explicit retry. */
export function loadPayPalSdk(doc, win) {
  if (sdkLoads.has(doc)) return sdkLoads.get(doc);
  const promise = new Promise((resolve, reject) => {
    const existing = doc.querySelector('script[src*="paypal.com/sdk/js"]');
    if (existing && existing.src !== SDK_URL) {
      reject(new Error('Another PayPal SDK configuration is already present.'));
      return;
    }
    if (win.paypal?.HostedButtons) { resolve(win.paypal); return; }
    const script = existing || doc.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
      if (error) reject(error);
      else if (win.paypal?.HostedButtons) resolve(win.paypal);
      else reject(new Error('PayPal HostedButtons is unavailable.'));
    };
    const loaded = () => finish();
    const failed = () => finish(new Error('PayPal could not be loaded.'));
    const timer = win.setTimeout(() => finish(new Error('PayPal loading timed out.')), 20000);
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.id = 'dex-paypal-sdk';
      script.src = SDK_URL;
      script.async = true;
      doc.head.appendChild(script);
    }
  });
  sdkLoads.set(doc, promise);
  return promise;
}

export function setupSupportPayPal(doc, win, loadSdk = loadPayPalSdk) {
  const root = doc.querySelector('[data-dex-paypal-preview]');
  if (!root || root.dataset.paypalSetup) return;
  root.dataset.paypalSetup = 'true';
  root.dataset.paypalState = 'idle';
  const button = doc.querySelector('#support-load-paypal');
  const status = doc.querySelector('#support-paypal-status');
  const container = doc.querySelector('#paypal-container-YTJXE3R8LDUPL');
  const reload = doc.querySelector('#support-reload');
  if (!button || !status || !container || !reload) return;
  reload.addEventListener('click', () => win.location.reload());
  button.addEventListener('click', async () => {
    if (root.dataset.paypalState !== 'idle') return;
    root.dataset.paypalState = 'loading';
    button.disabled = true;
    button.textContent = 'Loading PayPal…';
    container.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading live PayPal. Do not complete a payment during this review.';
    try {
      const paypal = await loadSdk(doc, win);
      await paypal.HostedButtons({ hostedButtonId: HOSTED_BUTTON_ID }).render('#paypal-container-YTJXE3R8LDUPL');
      root.dataset.paypalState = 'ready';
      button.textContent = 'Live PayPal loaded';
      status.textContent = 'Live PayPal options loaded below. Check the checkout entry only; do not authorize or complete a payment.';
    } catch {
      root.dataset.paypalState = 'error';
      button.textContent = 'PayPal is unavailable';
      container.replaceChildren();
      status.textContent = 'PayPal could not load. This page has not confirmed any payment. Check your connection or browser settings, then reload this preview to try again.';
      reload.hidden = false;
    } finally {
      container.setAttribute('aria-busy', 'false');
    }
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') setupSupportPayPal(document, window);
