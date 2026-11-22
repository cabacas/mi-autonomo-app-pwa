const CACHE_NAME = 'mi-autonomo-pwa-v4';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/storage.js',
  './js/fiscal.js',
  './js/charts.js',
  './js/ocr.js',
  './js/einvoice.js',
  './js/benchmark.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;

  // No interceptar llamadas dinámicas a APIs de mapas / datos abiertos (dejar que el navegador las gestione directo)
  if (
    url.hostname.includes('overpass') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('agenciatributaria.gob.es')
  ) {
    return;
  }

  if (isLocal) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response('Sin conexión', { status: 503, statusText: 'Offline' });
        })
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            }
            return networkResponse;
          })
          .catch(() => cached || new Response('', { status: 504 }));
        return cached || fetchPromise;
      })
    );
  }
});
