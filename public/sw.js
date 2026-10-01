// PowerBuild Tracker service worker
// Cache only public static assets. Authenticated HTML may contain private data.

const CACHE_NAME = "powerbuild-v5";
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-maskable-512.png",
];

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
            .filter((key) => key.startsWith("powerbuild-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only cache GET requests
  if (event.request.method !== "GET") return;

  // Never intercept another origin, API calls, or authenticated data requests.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache authenticated HTML. Failed navigation gets a public fallback.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await caches.match(OFFLINE_URL)) || Response.error()
      )
    );
    return;
  }

  const isStaticAsset = STATIC_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/_next/static/");
  if (!isStaticAsset) return;

  // Cache only explicitly public assets and immutable Next.js bundles.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && !response.redirected && response.type === "basic") {
        event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
      }
      return response;
    })
  );
});
