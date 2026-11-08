/**
 * Service worker: cache app shell de choi voi may khi mat mang.
 * Khong cache Socket.IO hay /health; dieu huong dung network-first.
 */
const CACHE_NAME = 'meo-meo-caro-v11';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './assets/cats.js',
  './js/main.js',
  './js/api.js',
  './js/game-core.js',
  './js/ai.js',
  './js/ai-client.js',
  './js/ai-worker.js',
  './js/ui.js',
  './js/infinite-board.js',
  './js/online.js',
  './js/audio.js',
  './js/audio-logic.js',
  './js/audio-engine.js',
  './js/sfx.js',
  './js/music.js',
  './js/storage.js',
  './js/i18n.js',
  './js/wake.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isPrivateRequest(url) {
  return (
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health'
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match('./index.html');
    if (shell) return shell;
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await network;
  if (response) return response;
  throw new Error('offline');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivateRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
