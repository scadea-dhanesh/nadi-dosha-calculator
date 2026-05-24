/**
 * Service Worker for Nadi Dosh Calculator
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'nadi-dosh-calculator-v2.3';
const STATIC_CACHE_NAME = 'nadi-dosh-static-v2.3';
const API_CACHE_NAME = 'nadi-dosh-api-v1.0';

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/translations-regional.js',
  '/air-datepicker-theme.css',
  '/manifest.json',
  '/og-image.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/air-datepicker@3.5.0/air-datepicker.css',
  'https://cdn.jsdelivr.net/npm/air-datepicker@3.5.0/air-datepicker.js'
];

// API endpoints to cache (with strategy)
const API_ENDPOINTS = [
  '/api/health'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        // Cache with network-first fallback (don't fail if some fail)
        return Promise.allSettled(
          STATIC_ASSETS.map((url) => {
            return fetch(url)
              .then((response) => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch((err) => {
                console.warn(`[Service Worker] Failed to cache ${url}:`, err);
              });
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Static assets cached');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches
              return cacheName !== STATIC_CACHE_NAME &&
                     cacheName !== API_CACHE_NAME &&
                     cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activated');
        return self.clients.claim(); // Take control of all pages
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip Chrome extensions and external scripts that shouldn't be cached
  if (url.protocol === 'chrome-extension:' || 
      url.hostname === 'chrome-extension' ||
      url.searchParams.has('no-cache')) {
    return;
  }
  
  // API endpoints - Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses (except calculation endpoints)
          if (response.ok && API_ENDPOINTS.includes(url.pathname)) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Return offline response for calculation endpoints
              if (url.pathname.includes('calculate')) {
                return new Response(
                  JSON.stringify({
                    error: 'Offline',
                    message: 'This feature requires internet connection. Please check your connection and try again.'
                  }),
                  {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                  }
                );
              }
              return new Response('Offline', { status: 503 });
            });
        })
    );
    return;
  }
  
  // Static assets - Cache first, fallback to network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Cache the response
            const responseToCache = response.clone();
            caches.open(STATIC_CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Message handler for cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(
      caches.open(STATIC_CACHE_NAME)
        .then((cache) => {
          return cache.addAll(STATIC_ASSETS);
        })
    );
  }
});

// Background sync (for offline form submissions - future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('[Service Worker] Background sync');
    // Future: Sync offline calculations
  }
});

// Push notifications (future enhancement)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');
  // Future: Show notifications for updates
});

