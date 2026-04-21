// FocusTrack Service Worker — minimal offline caching
const CACHE_NAME = 'focustrack-v1';
const OFFLINE_URLS = ['/join'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
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
    // Network-first for API/WS, cache-first for app shell
    if (event.request.url.includes('/api/') || event.request.url.startsWith('ws')) return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
