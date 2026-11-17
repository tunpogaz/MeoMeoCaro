/**
 * Service worker: cache app shell de choi voi may khi mat mang.
 * Khong cache Socket.IO hay /health; dieu huong dung network-first.
 */
const CACHE_NAME = 'meo-meo-caro-v14';
const META_KEY = './__mmc-push-meta';

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
  './js/haptics.js',
  './js/push.js',
  './js/audio-logic.js',
  './js/audio-engine.js',
  './js/sfx.js',
  './js/music.js',
  './js/storage.js',
  './js/i18n.js',
  './js/wake.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
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

// ---------------------------------------------------------------------------
// Thong bao day
// ---------------------------------------------------------------------------
const ROOM_CODE_RE = /^[A-Z0-9]{5}$/i;
const DEFAULT_PUSH_BODY = 'Đến lượt bạn rồi! 😺';

function safeJson(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function pushData(event) {
  if (!event.data) return {};
  try {
    if (typeof event.data.json === 'function') {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* thu doc dang text */
  }
  try {
    const text = typeof event.data.text === 'function' ? event.data.text() : '';
    if (!text) return {};
    const parsed = safeJson(text);
    if (Object.keys(parsed).length) return parsed;
    return { body: text };
  } catch {
    return {};
  }
}

function cleanRoomId(value) {
  return typeof value === 'string' && ROOM_CODE_RE.test(value) ? value.toUpperCase() : '';
}

async function showPush(event) {
  const data = pushData(event);
  const roomId = cleanRoomId(data.roomId);
  const title =
    typeof data.title === 'string' && data.title.trim() ? data.title.slice(0, 80) : 'Meo Meo Caro';
  const body =
    typeof data.body === 'string' && data.body.trim()
      ? data.body.slice(0, 180)
      : DEFAULT_PUSH_BODY;

  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-180.png',
    tag: roomId ? `turn-${roomId}` : 'turn',
    renotify: true,
    // Chi Android dung thuoc tinh nay; iOS tu quyet dinh kieu rung.
    vibrate: [80, 40, 80],
    data: { url: roomId ? `./?room=${roomId}` : './' },
  };

  try {
    await self.registration.showNotification(title, options);
  } catch {
    try {
      await self.registration.showNotification('Meo Meo Caro', { body: DEFAULT_PUSH_BODY, tag: 'turn' });
    } catch {
      /* khong the hien thong bao */
    }
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  try {
    notification?.close?.();
  } catch {
    /* bo qua */
  }

  let target = new URL('./', self.location.href);
  let roomId = '';
  try {
    const raw = notification?.data?.url;
    if (typeof raw === 'string') {
      const candidate = new URL(raw, self.location.href);
      const code = cleanRoomId(candidate.searchParams.get('room'));
      if (candidate.origin === self.location.origin && code) {
        target = candidate;
        roomId = code;
      }
    }
  } catch {
    /* dung URL goc */
  }

  event.waitUntil(
    (async () => {
      try {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windows.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (existing) {
          if (roomId) {
            try {
              existing.postMessage({ type: 'mmc:open-room', roomId });
            } catch {
              /* bo qua */
            }
          }
          try {
            await existing.focus();
          } catch {
            /* bo qua */
          }
          return;
        }
        await self.clients.openWindow(target.href);
      } catch {
        /* bo qua */
      }
    })()
  );
});

// ---------------------------------------------------------------------------
// Dang ky lai khi trinh duyet doi subscription (best effort)
// ---------------------------------------------------------------------------
async function savePushMeta(meta) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      META_KEY,
      new Response(JSON.stringify(meta), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    );
  } catch {
    /* bo qua */
  }
}

async function readPushMeta() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(META_KEY);
    if (!response) return null;
    const data = await response.json();
    if (!data || typeof data.deviceId !== 'string') return null;
    return { deviceId: data.deviceId, lang: data.lang === 'en' ? 'en' : 'vi' };
  } catch {
    return null;
  }
}

function keyToBytes(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToKey(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function resubscribe() {
  const meta = await readPushMeta();
  if (!meta) return;
  try {
    let subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) {
      const response = await fetch('./api/config', { credentials: 'same-origin' });
      const config = await response.json();
      if (!config?.vapidPublicKey) return;
      subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(config.vapidPublicKey),
      });
    }
    const body = {
      deviceId: meta.deviceId,
      lang: meta.lang,
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: bytesToKey(subscription.getKey('p256dh')),
          auth: bytesToKey(subscription.getKey('auth')),
        },
      },
    };
    await fetch('./api/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    /* het cach: client se dang ky lai khi nguoi dung mo Cai dat */
  }
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribe());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'mmc:push-meta' && typeof data.deviceId === 'string') {
    event.waitUntil(
      savePushMeta({ deviceId: data.deviceId, lang: data.lang === 'en' ? 'en' : 'vi' })
    );
  }
});
