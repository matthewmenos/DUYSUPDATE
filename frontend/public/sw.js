/* DUYS PWA service worker — SPA shell + offline fallback.
   Vite emits hashed asset URLs into /assets/*.js|css,so we cache-on-fetch
   (stale-while-revalidate) rather than precache a fixed list. */
const CACHE_STATIC = "duys-static-v1";
const CACHE_PAGES   = "duys-pages-v1";
const MAX_PAGES      = 20;
const OFFLINE_URL    = "/offline.html";

self.addEventListener("install", (event) => {
  /* Precache the offline fallback + app shell immediacy */
  event.waitUntil(
    caches.open(CACHE_PAGES)
      .then((c) => c.addAll([OFFLINE_URL]).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const KEEP = new Set([CACHE_STATIC, CACHE_PAGES]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigation requests: network-first, cache shell as offline fallback */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_PAGES).then((c) => {
              c.put(req, clone);
              c.keys().then((keys) => {
                if (keys.length > MAX_PAGES)
                  keys.slice(0, keys.length - MAX_PAGES).forEach((k) => c.delete(k));
              });
            });
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL)))
        )
    );
    return;
  }

  /* API requests: network-only, no caching */
  if (url.pathname.startsWith("/api/")) return;

  /* Hashed build assets: stale-while-revalidate (cache-first, background refresh) */
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE_STATIC).then((cache) =>
        cache.match(req).then((cached) => {
          const refresh = fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
            return res;
          }).catch(() => null);
          return cached || refresh;
        })
      )
    );
    return;
  }

  /* Static media: cache-first, stale-while-revalidate */
  if (url.pathname.startsWith("/") && (/\.(png|jpe?g|gif|svg|webp|ico|webmanifest|woff2?)$/.test(url.pathname))) {
    event.respondWith(
      caches.open(CACHE_STATIC].then((cache) =>
        cache.match(req).then((cached) => {
          const refresh = fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
            return res;
          }).catch(() => null);
          return cached || refresh;
        })
      )
    );
  }
});