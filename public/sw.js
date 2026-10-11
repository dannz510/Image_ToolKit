/* eslint-disable no-undef */
/**
 * Dannz AI Studio - service worker.
 *
 * Strategy per request type:
 *   - API calls (/api/*)              -> network only (never cache image jobs)
 *   - navigations (HTML)              -> network-first, fallback to cached shell
 *   - hashed build assets (/assets)   -> cache-first (immutable), revalidate in bg
 *   - fonts + other same-origin files -> stale-while-revalidate
 *   - cross-origin media              -> passthrough (CDN video)
 *
 * Cache-poisoning hardening: only same-origin, 2xx, "basic" (non-opaque)
 * responses are stored, and only in response to GET requests. Opaque
 * cross-origin responses (which cannot be validated) are never cached.
 * A version bump in VERSION prunes every previous cache.
 *
 * The generic stale-while-revalidate branch is deliberately narrow (known
 * shell files only): caching *every* same-origin request would swallow the
 * Vite dev server's unbundled modules (/src/**, /@vite/**, /node_modules/**)
 * if a worker is ever registered during development, and a stale cached
 * module survives every HMR update. Dev paths therefore bypass the worker.
 */

const VERSION = "dannz-v6";

/**
 * Same-origin paths that may be served from cache. Everything else under the
 * same origin - notably the Vite dev server's unbundled modules - is left to
 * the network so a cached module can never shadow an edit.
 */
const CACHEABLE_SHELL_PATHS =
  /^\/(?:offline\.html|manifest\.webmanifest|favicon\.(?:svg|ico)|apple-touch-icon\.png|icon-(?:192|512)(?:-maskable)?\.png|theme-init\.js)$/;

const SHELL_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/theme-init.js",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-192-maskable.png",
  "/icon-512-maskable.png",
  "/fonts/oswald-latin.woff2",
  "/fonts/oswald-vietnamese.woff2",
  "/fonts/jbmono-latin.woff2",
  "/fonts/jbmono-vietnamese.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(`shell-${VERSION}`);
      // addAll fails the whole install if one URL 404s; add individually.
      await Promise.allSettled(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
      );
      // Do NOT skipWaiting automatically: an activated worker can change page
      // behaviour mid-edit. The app calls SKIP_WAITING when the user asks.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.endsWith(`-${VERSION}`))
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "GET_VERSION" && event.ports?.[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

/** True when a response is safe to persist: same-origin, verifiable, 2xx. */
function isCacheable(request, response) {
  if (!response) return false;
  if (request.method !== "GET") return false;
  if (response.type !== "basic") return false; // rejects opaque cross-origin bodies
  if (!response.ok) return false;
  if (response.status === 206) return false;
  return true;
}

async function networkFirst(request) {
  const cache = await caches.open(`shell-${VERSION}`);
  try {
    const fresh = await fetch(request);
    if (isCacheable(request, fresh)) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("/index.html");
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirstImmutable(request) {
  const cache = await caches.open(`assets-${VERSION}`);
  const cached = await cache.match(request);
  if (cached) {
    // Validate in the background: if the served bytes differ, replace them.
    fetch(request)
      .then((fresh) => {
        if (isCacheable(request, fresh)) {
          cache.put(request, fresh).catch(() => {});
        }
      })
      .catch(() => {});
    return cached;
  }
  const fresh = await fetch(request);
  if (isCacheable(request, fresh)) {
    cache.put(request, fresh.clone()).catch(() => {});
  }
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(`${cacheName}-${VERSION}`);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((fresh) => {
      if (isCacheable(request, fresh)) {
        cache.put(request, fresh.clone()).catch(() => {});
      }
      return fresh;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle http(s); ignore chrome-extension:, data:, blob: etc.
  if (!request.url.startsWith("http")) return;

  const url = new URL(request.url);

  // Never touch API traffic.
  if (url.pathname.startsWith("/api/")) return;

  // Only GET is cacheable.
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Same-origin static resources.
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirstImmutable(request));
      return;
    }
    if (url.pathname.startsWith("/fonts/")) {
      event.respondWith(staleWhileRevalidate(request, "fonts"));
      return;
    }
    // Only the known shell files above are cached; dev modules and any other
    // same-origin request go straight to the network.
    if (CACHEABLE_SHELL_PATHS.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(request, "shell"));
    }
    return;
  }

  // Cross-origin (CDN video): pass straight through, never cached.
});
