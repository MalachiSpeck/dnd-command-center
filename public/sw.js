const CACHE_NAME = 'dm-cc-cache-v9'; // Bumped cache name to v9 for homebrew exhaustion rules
const ASSETS_TO_CACHE = [
    '/join',
    '/player-sheet.html',
    '/style.css',
    '/js/offline-store.js',
    '/js/character-engine.js',
    '/js/sync-engine.js',
    '/js/envelope-receiver.js',
    '/js/envelope-presenters.js',
    '/js/gdrive-client.js',
    '/js/between-session-sync.js',
    '/js/gdrive-auth-ui.js',
    '/js/tavern-board.js',
    '/js/journal.js',
    '/js/session-reconnect.js',
    '/js/conflict-resolver.js',
    '/css/envelopes.css',
    '/css/tavern-board.css',
    '/css/journal.css',
    '/app_wave3.js',
    '/app_wave4.js',
    '/socket.io/socket.io.js',
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&display=swap',
    'https://apis.google.com/js/api.js',
    '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching app shell...');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Bypass socket.io polling to avoid blocking WebSockets, but NOT the socket.io client library script itself
    if (url.pathname.includes('socket.io') && !url.pathname.endsWith('socket.io.js') && !url.pathname.endsWith('socket.io.min.js')) {
        return;
    }

    // Determine cache key
    let cacheRequest = event.request;
    let isSheetRoute = false;
    if (url.pathname.startsWith('/sheet/')) {
        isSheetRoute = true;
        cacheRequest = '/player-sheet.html';
    }

    event.respondWith(
        caches.match(cacheRequest).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version, but update cache in the background (Stale-While-Revalidate)
                // If it is a sheet route, we fetch '/player-sheet.html' to get the fresh shell,
                // otherwise we fetch the original request.
                const fetchRequest = isSheetRoute ? '/player-sheet.html' : event.request;
                fetch(fetchRequest).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(cacheRequest, networkResponse);
                        });
                    }
                }).catch(() => { /* Ignore background update failures offline */ });

                return cachedResponse;
            }

            // Fallback to network
            return fetch(event.request).then((response) => {
                // Cache successful responses for dynamic API references (spells, feats, party, conditions, bazaar) & fonts
                if (response.status === 200 && (
                    url.pathname.startsWith('/api/spells') ||
                    url.pathname.startsWith('/api/feats') ||
                    url.pathname.startsWith('/api/reference/conditions') ||
                    url.pathname.startsWith('/api/party') ||
                    url.pathname.startsWith('/api/reference') ||
                    url.pathname.startsWith('/api/bazaar') ||
                    url.hostname === 'fonts.gstatic.com' ||
                    url.hostname.includes('unsplash.com') ||
                    url.pathname.endsWith('.woff2') ||
                    url.pathname.endsWith('.woff') ||
                    url.pathname.endsWith('.ttf') ||
                    url.pathname.endsWith('.png') ||
                    url.pathname.endsWith('.jpg') ||
                    url.pathname.endsWith('.jpeg') ||
                    url.pathname.endsWith('.svg') ||
                    url.pathname.endsWith('.gif')
                )) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch((err) => {
                // If the dynamic load fails and we are looking for a page, return cached join or sheet if possible
                if (event.request.mode === 'navigate') {
                    if (url.pathname.includes('player-sheet') || url.pathname.startsWith('/sheet/')) {
                        return caches.match('/player-sheet.html');
                    }
                    return caches.match('/join');
                }
                throw err;
            });
        })
    );
});
