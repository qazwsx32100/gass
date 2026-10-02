// Service Worker for 盛隆瓦斯 PWA
const CACHE_NAME = 'gass-pwa-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.jpg',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache failed, continuing:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

// Network-first with cache fallback for navigation and static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Don't intercept API calls or non-GET requests
  if (request.method !== 'GET' || request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('離線中', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Handle incoming Web Push notifications
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: '盛隆系統通知', body: event.data.text() };
    }
  }

  const title = data.title || '盛隆瓦斯 - 系統通知';
  const options = {
    body: data.body || '您有一則新的系統訊息。',
    icon: data.icon || '/logo.jpg',
    badge: '/logo.jpg',
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' },
    tag: data.tag || 'gass-notification'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click: Open or focus window and route
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
