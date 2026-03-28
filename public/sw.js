// PowerBuild Tracker — Service Worker v1
// Minimal offline shell: caches the app shell for fast load on mobile

const CACHE_NAME = "powerbuild-v3";
const STATIC_ASSETS = ["/", "/dashboard", "/manifest.json"];

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

  // Network first, fall back to cache for navigation requests
  // Must use redirect:'follow' so 307s from the proxy are transparently followed
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { redirect: "follow" }).catch(() =>
        caches.match("/dashboard") || caches.match("/")
      )
    );
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
