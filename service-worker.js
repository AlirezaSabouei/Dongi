/**
 * Dongi service worker — minimal app-shell cache.
 *
 * Strategy:
 *  - install: precache the shell (document, styles, modules, manifest, icons)
 *  - navigation requests: network first, falling back to the cached shell so
 *    every hash route opens offline after the first visit
 *  - same-origin shell assets: cache first, refreshed in the background
 *  - everything else (API calls, other origins): untouched
 *
 * Bump CACHE_VERSION whenever a cached shell asset changes so clients pick up
 * the new files; `index.html` and app modules are served from this cache.
 */

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `dongi-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `dongi-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/app.js',
  './js/router.js',
  './js/views.js',
  './js/api.js',
  './js/pwa.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

const SHELL_ASSET_PATHS = new Set(
  SHELL_ASSETS.map((asset) => {
    const url = new URL(asset, self.registration.scope);
    return url.pathname;
  }),
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_ASSETS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (SHELL_ASSET_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirstWithRefresh(request, event));
  }
});

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache
        .put(
          new URL('./index.html', self.registration.scope),
          response.clone(),
        )
        .catch(() => {
          /* A failed cache refresh must not break the navigation response. */
        });
    }
    return response;
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(new URL('./index.html', self.registration.scope))) ||
      (await cache.match('./'));
    return cached || offlineResponse();
  }
}

async function cacheFirstWithRefresh(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const fresh = await network;
  return fresh || offlineResponse();
}

function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>آفلاین · دنگی</title></head><body style="font-family: \'Vazirmatn\', \'Segoe UI\', Tahoma, sans-serif; direction: rtl; padding: 2rem; line-height: 1.8"><h1>شما آفلاین هستید</h1><p>دنگی هنوز این صفحه را در حافظهٔ نهان ذخیره نکرده است. دوباره وصل شوید و صفحه را بازخوانی کنید تا نصب برنامه کامل شود.</p></body></html>',
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
