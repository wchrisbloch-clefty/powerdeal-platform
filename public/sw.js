/* PowerDeal service worker — offline app shell.
 *
 * Deliberately conservative. Two rules keep it from ever serving something
 * misleading:
 *
 *   1. API responses are NEVER cached. Stale intelligence that reads as live
 *      is worse than no intelligence — a cached rate move could put someone on
 *      a call with month-old numbers.
 *   2. Only GET requests to same-origin static assets are cached.
 */

const VERSION = 'powerdeal-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/app', '/offline', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll rejects the whole batch if one URL 404s; add individually.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(svg|png|jpg|jpeg|webp|woff2?|css|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic — see rule 1 above.
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first. They are content-hashed, so they never go stale.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, falling back to the cached shell only when
  // genuinely offline. Live data always wins when the network is up.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/app');
          if (shell) return shell;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
              '<body style="font-family:system-ui;padding:2rem">' +
              '<h1>Offline</h1><p>PowerDeal needs a connection to load this view.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
          );
        }),
    );
  }
});
