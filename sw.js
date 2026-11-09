// Bump this version whenever you change any cached file.
const CACHE = 'myspace-v2';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json',
               'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return; // never cache GitHub calls
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
