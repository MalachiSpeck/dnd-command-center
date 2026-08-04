const CACHE_NAME = 'dm-cc-cache-v36';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/join',
    '/join.html',
    '/player-sheet.html',
    '/projector.html',
    '/mobile.html',
    '/clues.html',
    '/soundboard.html',
    '/style.css',
    '/css/envelopes.css',
    '/css/tavern-board.css',
    '/css/journal.css',
    '/app.js',
    '/app_pt2.js',
    '/app_pt3.js',
    '/app_pt4.js',
    '/app_pt5.js',
    '/app_pt6.js',
    '/app_pt7.js',
    '/app_pt8.js',
    '/app_pt9.js',
    '/app_pt10.js',
    '/app_pt11.js',
    '/app_pt12.js',
    '/app_pt13.js',
    '/app_scene_dm.js',
    '/app_player_extensions.js',
    '/app_wave2_core.js',
    '/app_wave2_dice.js',
    '/app_wave2_factions.js',
    '/app_wave2_inventory.js',
    '/app_wave2_morale.js',
    '/app_wave2_puzzles.js',
    '/app_wave2_quests.js',
    '/app_wave2_rest.js',
    '/app_wave2_review.js',
    '/app_wave2_timeline.js',
    '/app_wave2_utility.js',
    '/app_wave2_visuals.js',
    '/app_wave3.js',
    '/app_wave4.js',
    '/app_wave4_encounters.js',
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
    '/js/lighting_fog.js',
    '/js/scene_engine.js',
    '/js/dice_parser.js',
    '/js/player-sheet-engine-v2.js',
    '/js/wildshape-companion-engine.js',
    '/js/resource-vault-engine.js',
    '/js/procedural-music.js',
    '/socket.io/socket.io.js',
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/pixi.js@8.x/dist/pixi.min.js',
    '/manifest.json'
];

// Install Event - Resilient pre-caching using Promise.allSettled
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing Cache V36...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching app shell & dependencies...');
            return Promise.allSettled(
                ASSETS_TO_CACHE.map((url) => 
                    cache.add(url).catch((err) => {
                        console.warn(`[Service Worker] Non-critical cache skip for ${url}:`, err.message);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating Cache V36...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Clearing legacy cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Bypass active socket.io websocket polling, but NOT static socket.io client script
    if (url.pathname.includes('socket.io') && !url.pathname.endsWith('socket.io.js') && !url.pathname.endsWith('socket.io.min.js')) {
        return;
    }

    let cacheRequest = event.request;
    let isSheetRoute = false;
    if (url.pathname.startsWith('/sheet/') || url.pathname.includes('player-sheet.html')) {
        isSheetRoute = true;
        cacheRequest = '/player-sheet.html';
    }

    event.respondWith(
        caches.match(cacheRequest, { ignoreSearch: true }).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached copy immediately, update in background if online
                const fetchTarget = isSheetRoute ? '/player-sheet.html' : event.request;
                fetch(fetchTarget).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(cacheRequest, networkResponse);
                        });
                    }
                }).catch(() => { /* Ignore background network errors offline */ });

                return cachedResponse;
            }

            // Fallback to network fetch
            return fetch(event.request).then((response) => {
                if (response.status === 200 && (
                    url.pathname.startsWith('/api/') ||
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
                // If offline or server unreachable during navigation, serve cached player-sheet.html or join
                if (event.request.mode === 'navigate') {
                    if (url.pathname.includes('player-sheet') || url.pathname.startsWith('/sheet/')) {
                        return caches.match('/player-sheet.html', { ignoreSearch: true });
                    }
                    return caches.match('/join') || caches.match('/join.html');
                }
                throw err;
            });
        })
    );
});

