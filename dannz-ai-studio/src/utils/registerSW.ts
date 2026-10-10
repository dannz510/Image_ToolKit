/**
 * Registers the service worker.
 *
 * - Skips dev mode entirely: HMR + SW caches fight each other and the reload
 *   on update disrupts development.
 * - On update (a *new* worker takes control) the page reloads once so the
 *   freshly cached shell is used. The very first install does not reload.
 */

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/)
);

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV && !isLocalhost) return;
  if (import.meta.env.DEV) return; // never cache during development

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('[pwa] service worker registration failed:', error);
    });

    // Reload once when an *updated* worker starts controlling the page.
    let hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      window.location.reload();
    });
  });
}

/** Ask any waiting worker to activate immediately. */
export function applyPendingUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}
