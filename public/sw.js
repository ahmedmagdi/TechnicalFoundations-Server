const CACHE = 'fruit-pwa-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // For API calls, always go network-first
  if (e.request.url.includes('/fruits') || e.request.url.includes('/recommend')) {
    e.respondWith(fetch(e.request).catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // For static assets, cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
