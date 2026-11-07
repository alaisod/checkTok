/**
 * Service Worker for checkTok SPA
 * Supports 100% Offline usage & Hot Refresh mechanism
 */
const CACHE_NAME = 'checktok-v2.6.9';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.json',
  './css/style.css',
  './core/storage.js',
  './core/cloud.js',
  './core/merge.js',
  './core/export.js',
  './js/sound.js',
  './js/app.js',
  './app-icons/icon-192.png',
  './app-icons/icon-512.png',
  './app-icons/favicon.png'
];

// Install: Cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate: Clean up older caches & take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network First with Cache Fallback for HTML, Stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // ปล่อยให้ API endpoints วิ่งตรงไปยังเซิร์ฟเวอร์ ไม่แคชทับข้อมูล
  if (request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback to cache when offline
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Listen for message from client to activate immediately (Hot Refresh)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
