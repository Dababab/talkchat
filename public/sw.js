const CACHE = 'talkchat-v2';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network first (Voice Chat braucht immer aktuelle Socket.io Version)
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/socket.io')) return; // Socket.io nie cachen
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
