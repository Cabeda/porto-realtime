// Build timestamp - updated on each deployment
const BUILD_VERSION = '1770743446809'; // Will be replaced during build
const CACHE_NAME = `porto-realtime-v${BUILD_VERSION}`;
const RUNTIME_CACHE = `porto-realtime-runtime-v${BUILD_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/stations',
  '/station',
  '/offline',
];

// Listen for SKIP_WAITING message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version:', BUILD_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.error('[Service Worker] Cache failed:', err);
    })
  );
  // Don't skip waiting automatically - let the user decide
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version:', BUILD_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Notify all clients about the update
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: BUILD_VERSION
          });
        });
      });
    })
  );
  // Take control of all pages immediately
  return self.clients.claim();
});

// Fetch event - Network first with update strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // API requests - Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the API response for offline use
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[Service Worker] Serving API from cache:', request.url);
              return cachedResponse;
            }
            // Return offline response for API
            return new Response(
              JSON.stringify({ error: 'Offline', offline: true }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 503
              }
            );
          });
        })
    );
    return;
  }

  // Static assets - Stale-while-revalidate strategy
  // Serve from cache immediately, but fetch fresh copy in background
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Update the cache with fresh resource
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Network failed, return cached or offline page
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('/offline');
        });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});

// Background sync for offline actions (future enhancement)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  // Future: Sync favorites to server when back online
  console.log('[Service Worker] Syncing favorites...');
}

// Push notification support (future enhancement)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'New update available',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Porto Realtime', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
