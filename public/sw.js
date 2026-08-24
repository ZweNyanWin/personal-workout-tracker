// PowerBuild Tracker service worker
// Cache only public static assets. Authenticated HTML may contain private data.

const CACHE_NAME = "powerbuild-v4";
const STATIC_ASSETS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only cache GET requests
  if (event.request.method !== "GET") return;

  // Skip Supabase API calls — always need fresh data
  const url = new URL(event.request.url);
  if (url.hostname.includes("supabase")) return;

  // Authenticated pages are always network-only to avoid caching user data.
  if (event.request.mode === "navigate") {
    return;
  }

  // Cache first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful static asset responses
        if (
          response.ok &&
          (event.request.url.includes("/_next/static/") ||
            event.request.url.includes("/icons/"))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
