const CACHE_NAME = 'jc-tennis-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Parse the URL of the request
  const url = new URL(event.request.url);
  
  // Always bypass Service Worker for API endpoints to ensure they reach the backend directly
  if (url.pathname.startsWith('/api')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Setup Background Web Push Notification listeners
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data = { title: "JC Tennis Alert 🎾", body: event.data.text() };
    }
  }
  
  const title = data.title || "JC Tennis Alert 🎾";
  const options = {
    body: data.body || "A tennis player update has been received.",
    icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s",
    badge: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTElZ9tTIVQ-qQzRwpEyM5aC2JlP2NbaHA6yR9rObvF7g&s",
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data ? (event.notification.data.url || '/') : '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
