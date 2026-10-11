/**
 * Registers the service worker.
 *
 * - Skipped in development: HMR and SW caches fight each other. Any worker
 *   left over from a previous production run on this origin is unregistered
 *   and its caches deleted, otherwise it keeps serving stale modules to the
 *   dev server (a classic source of "my edit is not applying" and of the app
 *   appearing to jump to an old build).
 * - An updated worker does NOT force a page reload. The page can ask for the
 *   update at a moment of the user's choosing via `applyPendingUpdate()`,
 *   so unsaved canvas work is never thrown away by a background reload.
 */

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) {
    // Development: tear down any leftover worker + caches for this origin.
    window.addEventListener("load", () => {
      void (async () => {
        try {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.unregister()),
          );
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        } catch {
          /* nothing to clean up */
        }
      })();
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((error) => {
        console.warn("[pwa] service worker registration failed:", error);
      });
  });
}

/** True when a new SW has been downloaded and is waiting to activate. */
export function hasPendingUpdate(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  return navigator.serviceWorker
    .getRegistration()
    .then((registration) => Boolean(registration?.waiting));
}

/** Activate a waiting worker and reload into the freshly cached shell. */
export function applyPendingUpdate(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  });
}

/** Remove the worker and its caches (used by "clear local data"). */
export function unregisterServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return Promise.resolve();
  return navigator.serviceWorker
    .getRegistration()
    .then(async (registration) => {
      await registration?.unregister();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    });
}
