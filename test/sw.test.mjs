/**
 * Kiem thu handler cua service worker (public/sw.js) trong mot VM gia lap:
 * cache app shell, dieu huong network-first, push hien thong bao dung noi dung
 * va tag, notificationclick mo dung phong, luu meta va dang ky lai khi
 * subscription doi. Khong can trinh duyet that.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
const ORIGIN = 'https://meo.example.com';
const BASE = `${ORIGIN}/app/`;

const summary = { pass: 0, fail: 0 };

async function test(name, fn) {
  try {
    await fn();
    summary.pass += 1;
    console.log(`ok ${summary.pass} - ${name}`);
  } catch (err) {
    summary.fail += 1;
    console.error(`not ok - ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

function keyOf(key) {
  if (typeof key === 'string') return key;
  if (key && typeof key.url === 'string') return key.url;
  return String(key);
}

function createCaches(initial = {}) {
  const store = new Map();
  for (const [name, entries] of Object.entries(initial)) {
    const map = new Map();
    for (const [key, value] of Object.entries(entries)) map.set(key, value);
    store.set(name, map);
  }
  return {
    store,
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const map = store.get(name);
      return {
        async addAll(list) {
          for (const item of list) map.set(item, new Response(''));
        },
        async put(key, response) {
          map.set(keyOf(key), response);
        },
        async match(key) {
          const found = map.get(keyOf(key));
          if (!found) return undefined;
          // Cache API that tra ve mot Response moi moi lan match.
          return typeof found.clone === 'function' ? found.clone() : found;
        },
      };
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    },
  };
}

function loadWorker({ caches, fetchImpl, subscription = null } = {}) {
  const listeners = {};
  const notifications = [];
  const windows = [];
  const opened = [];
  const fetchCalls = [];
  const subscribed = [];
  let skipped = false;
  let claimed = false;

  const self = {
    location: { href: BASE, origin: ORIGIN },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting: async () => {
      skipped = true;
    },
    clients: {
      claim: async () => {
        claimed = true;
      },
      matchAll: async () => windows,
      openWindow: async (url) => {
        opened.push(url);
        return {};
      },
    },
    registration: {
      showNotification: async (title, options) => {
        notifications.push({ title, options });
      },
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async (options) => {
          subscribed.push(options);
          return (
            subscription || {
              endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/demo',
              getKey: () => new Uint8Array([1, 2, 3]).buffer,
            }
          );
        },
      },
    },
  };

  const context = {
    self,
    caches,
    fetch: async (url, options) => {
      fetchCalls.push({ url: typeof url === 'string' ? url : url.url, options });
      if (fetchImpl) return fetchImpl(url, options);
      return new Response('{}', { status: 200 });
    },
    Response,
    URL,
    atob,
    btoa,
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(SW_SOURCE, context, { filename: 'public/sw.js' });

  async function fire(type, event) {
    const handler = listeners[type];
    assert.equal(typeof handler, 'function', `missing listener ${type}`);
    handler(event);
    if (event.promise) await event.promise;
  }

  function eventWithWaitUntil(extra = {}) {
    const event = { ...extra };
    event.waitUntil = (promise) => {
      event.promise = Promise.resolve(promise);
    };
    return event;
  }

  return {
    listeners,
    notifications,
    windows,
    opened,
    fetchCalls,
    subscribed,
    get skipped() {
      return skipped;
    },
    get claimed() {
      return claimed;
    },
    fire,
    eventWithWaitUntil,
  };
}

// ---------------------------------------------------------------------------
// Cache app shell
// ---------------------------------------------------------------------------
await test('install: cache du app shell (29 muc) va skipWaiting', async () => {
  const caches = createCaches();
  const worker = loadWorker({ caches });
  const event = worker.eventWithWaitUntil();
  await worker.fire('install', event);
  const cache = caches.store.get('meo-meo-caro-v14');
  assert.ok(cache, 'cache v14 duoc tao');
  assert.equal(cache.size, 29);
  assert.ok(cache.has('./js/push.js'));
  assert.ok(cache.has('./index.html'));
  assert.ok(cache.has('./icons/icon-192.png'));
  assert.equal(worker.skipped, true);
});

await test('activate: xoa cache cu va claim client', async () => {
  const caches = createCaches({ 'meo-meo-caro-v13': { './old': new Response('') } });
  const worker = loadWorker({ caches });
  await worker.fire('activate', worker.eventWithWaitUntil());
  assert.equal(caches.store.has('meo-meo-caro-v13'), false);
  assert.equal(worker.claimed, true);
});

await test('fetch: bo qua POST, khac origin va duong dan rieng tu', async () => {
  const caches = createCaches();
  const worker = loadWorker({ caches });
  const calls = [];
  for (const request of [
    { method: 'POST', url: `${BASE}api/x`, mode: 'cors' },
    { method: 'GET', url: 'https://other.example.com/app/x.js', mode: 'no-cors' },
    { method: 'GET', url: `${ORIGIN}/socket.io/?EIO=4`, mode: 'no-cors' },
    { method: 'GET', url: `${ORIGIN}/api/config`, mode: 'cors' },
    { method: 'GET', url: `${ORIGIN}/health`, mode: 'cors' },
  ]) {
    const event = { request, respondWith: () => calls.push(request.url) };
    worker.listeners.fetch(event);
  }
  assert.deepEqual(calls, []);
});

await test('fetch: navigation network-first, asset stale-while-revalidate', async () => {
  const caches = createCaches();
  const fetched = [];
  const worker = loadWorker({
    caches,
    fetchImpl: async (url) => {
      const href = typeof url === 'string' ? url : url.url;
      fetched.push(href);
      return new Response(`body:${href}`, { status: 200 });
    },
  });
  const navEvent = {
    request: { method: 'GET', url: `${BASE}index.html`, mode: 'navigate' },
    respondWith(promise) {
      navEvent.promise = promise;
    },
  };
  worker.listeners.fetch(navEvent);
  const navResponse = await navEvent.promise;
  assert.equal(await navResponse.text(), `body:${BASE}index.html`);

  const assetEvent = {
    request: { method: 'GET', url: `${BASE}js/main.js`, mode: 'no-cors' },
    respondWith(promise) {
      assetEvent.promise = promise;
    },
  };
  worker.listeners.fetch(assetEvent);
  const assetResponse = await assetEvent.promise;
  assert.equal(await assetResponse.text(), `body:${BASE}js/main.js`);
  assert.equal(fetched.length, 2);
});

await test('fetch: mat mang thi tra cache roi app shell', async () => {
  const cached = new Response('cached-index');
  const caches = createCaches({
    'meo-meo-caro-v14': {
      [`${BASE}index.html`]: cached,
    },
  });
  const worker = loadWorker({
    caches,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  const event = {
    request: { method: 'GET', url: `${BASE}index.html`, mode: 'navigate' },
    respondWith(promise) {
      event.promise = promise;
    },
  };
  worker.listeners.fetch(event);
  const response = await event.promise;
  assert.equal(await response.text(), 'cached-index');
});

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------
function pushEvent(data) {
  const worker = loadWorker({ caches: createCaches() });
  const event = worker.eventWithWaitUntil({
    data: {
      json() {
        if (typeof data === 'string') throw new Error('not json');
        return data;
      },
      text() {
        return typeof data === 'string' ? data : JSON.stringify(data);
      },
    },
  });
  return { worker, event };
}

function pushDataEvent(data) {
  return {
    data: {
      json() {
        return data;
      },
      text() {
        return JSON.stringify(data);
      },
    },
  };
}

await test('push: hien tieu de/body, tag phong, renotify va URL mo phong', async () => {
  const { worker, event } = pushEvent({
    title: 'Đến lượt bạn rồi! 😺',
    body: 'Vào đánh nước tiếp theo nhé.',
    type: 'turn',
    roomId: 'ab12c',
    ts: 1,
  });
  await worker.fire('push', event);
  assert.equal(worker.notifications.length, 1);
  const { title, options } = worker.notifications[0];
  assert.equal(title, 'Đến lượt bạn rồi! 😺');
  assert.equal(options.body, 'Vào đánh nước tiếp theo nhé.');
  assert.equal(options.tag, 'turn-AB12C');
  assert.equal(options.renotify, true);
  assert.deepEqual([...options.vibrate], [80, 40, 80]);
  assert.equal(options.data.url, './?room=AB12C');
  assert.equal(options.icon, './icons/icon-192.png');
  assert.equal(options.badge, './icons/icon-180.png');
});

await test('push: du lieu thieu/hong dung mac dinh, tag turn, khong mo phong', async () => {
  for (const payload of [{}, undefined, { roomId: 'sai-ma' }, { roomId: 123 }]) {
    const worker = loadWorker({ caches: createCaches() });
    const event = worker.eventWithWaitUntil(
      payload === undefined ? { data: null } : pushDataEvent(payload)
    );
    await worker.fire('push', event);
    const { title, options } = worker.notifications[0];
    assert.equal(title, 'Meo Meo Caro');
    assert.equal(options.body, 'Đến lượt bạn rồi! 😺');
    assert.equal(options.tag, 'turn');
    assert.equal(options.data.url, './');
  }

  // Text khong phai JSON van duoc hien lam body, khong lam vo handler.
  const worker = loadWorker({ caches: createCaches() });
  await worker.fire(
    'push',
    worker.eventWithWaitUntil({
      data: {
        json() {
          throw new Error('not json');
        },
        text: () => 'Tin nhan dang chu',
      },
    })
  );
  assert.equal(worker.notifications[0].title, 'Meo Meo Caro');
  assert.equal(worker.notifications[0].options.body, 'Tin nhan dang chu');
  assert.equal(worker.notifications[0].options.tag, 'turn');
});

await test('push: cat tieu de 80 ky tu va body 180 ky tu', async () => {
  const { worker, event } = pushEvent({
    title: 'T'.repeat(120),
    body: 'B'.repeat(400),
    roomId: 'CD34E',
  });
  await worker.fire('push', event);
  const { title, options } = worker.notifications[0];
  assert.equal(title.length, 80);
  assert.equal(options.body.length, 180);
  assert.equal(options.tag, 'turn-CD34E');
});

await test('push: showNotification loi thi thu lai mot lan voi noi dung mac dinh', async () => {
  const caches = createCaches();
  const worker = loadWorker({ caches });
  let first = true;
  worker.notifications.length = 0;
  const original = worker.notifications.push;
  worker.notifications.push = function push(entry) {
    if (first) {
      first = false;
      throw new Error('not allowed');
    }
    return original.call(this, entry);
  };
  const event = worker.eventWithWaitUntil({
    data: {
      json: () => ({ title: 'X', body: 'Y' }),
      text: () => '',
    },
  });
  await worker.fire('push', event);
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].title, 'Meo Meo Caro');
  assert.equal(worker.notifications[0].options.body, 'Đến lượt bạn rồi! 😺');
});

// ---------------------------------------------------------------------------
// notificationclick
// ---------------------------------------------------------------------------
function clickEvent(url, { close = true } = {}) {
  return {
    notification: {
      data: url === undefined ? undefined : { url },
      close() {
        this.closed = true;
      },
    },
    closed: close,
  };
}

await test('notificationclick: focus tab cu va gui ma phong hop le', async () => {
  const worker = loadWorker({ caches: createCaches() });
  const messages = [];
  const focused = [];
  worker.windows.push({
    url: `${BASE}?x=1`,
    postMessage: (message) => messages.push(message),
    focus: async () => focused.push(true),
  });
  await worker.fire('notificationclick', worker.eventWithWaitUntil(clickEvent('./?room=ab12c')));
  assert.equal(worker.opened.length, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'mmc:open-room');
  assert.equal(messages[0].roomId, 'AB12C');
  assert.equal(focused.length, 1);
});

await test('notificationclick: URL la/ma sai thi chi focus, khong gui ma', async () => {
  for (const url of [
    'https://evil.example.com/app/?room=AB12C',
    './?room=SAI',
    'javascript:alert(1)',
    undefined,
    './?room=',
  ]) {
    const worker = loadWorker({ caches: createCaches() });
    const messages = [];
    const focused = [];
    worker.windows.push({
      url: BASE,
      postMessage: (message) => messages.push(message),
      focus: async () => focused.push(true),
    });
    await worker.fire('notificationclick', worker.eventWithWaitUntil(clickEvent(url)));
    assert.deepEqual(messages, [], `khong gui voi ${url}`);
    assert.equal(focused.length, 1);
    assert.equal(worker.opened.length, 0);
  }
});

await test('notificationclick: khong co tab nao thi openWindow dung URL', async () => {
  const worker = loadWorker({ caches: createCaches() });
  await worker.fire('notificationclick', worker.eventWithWaitUntil(clickEvent('./?room=MN678')));
  assert.deepEqual(worker.opened, [`${BASE}?room=MN678`]);
});

// ---------------------------------------------------------------------------
// Meta + pushsubscriptionchange
// ---------------------------------------------------------------------------
await test('message: luu deviceId/lang de dang ky lai', async () => {
  const caches = createCaches();
  const worker = loadWorker({ caches });
  await worker.fire(
    'message',
    worker.eventWithWaitUntil({
      data: { type: 'mmc:push-meta', deviceId: 'abcdefgh12345678', lang: 'en' },
    })
  );
  const cache = caches.store.get('meo-meo-caro-v14');
  const saved = await cache.get('./__mmc-push-meta').clone().json();
  assert.deepEqual(saved, { deviceId: 'abcdefgh12345678', lang: 'en' });

  await worker.fire(
    'message',
    worker.eventWithWaitUntil({
      data: { type: 'mmc:push-meta', deviceId: 'abcdefgh12345678', lang: 'fr' },
    })
  );
  const normalized = await caches.store
    .get('meo-meo-caro-v14')
    .get('./__mmc-push-meta')
    .clone()
    .json();
  assert.equal(normalized.lang, 'vi');

  await worker.fire('message', worker.eventWithWaitUntil({ data: { type: 'other' } }));
  const untouched = await caches.store
    .get('meo-meo-caro-v14')
    .get('./__mmc-push-meta')
    .clone()
    .json();
  assert.equal(untouched.deviceId, 'abcdefgh12345678');
});

await test('pushsubscriptionchange: khong co meta thi khong goi mang', async () => {
  const worker = loadWorker({ caches: createCaches() });
  await worker.fire('pushsubscriptionchange', worker.eventWithWaitUntil());
  assert.equal(worker.fetchCalls.length, 0);
});

await test('pushsubscriptionchange: dung subscription hien co va POST day du', async () => {
  const caches = createCaches();
  const subscription = {
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/demo',
    getKey(name) {
      return name === 'p256dh'
        ? new Uint8Array([1, 2, 3]).buffer
        : new Uint8Array([4, 5]).buffer;
    },
  };
  const worker = loadWorker({ caches, subscription });
  await worker.fire(
    'message',
    worker.eventWithWaitUntil({
      data: { type: 'mmc:push-meta', deviceId: 'abcdefgh12345678', lang: 'vi' },
    })
  );
  await worker.fire('pushsubscriptionchange', worker.eventWithWaitUntil());
  assert.equal(worker.subscribed.length, 0);
  assert.equal(worker.fetchCalls.length, 1);
  const call = worker.fetchCalls[0];
  assert.equal(call.url, './api/push/subscribe');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'same-origin');
  const body = JSON.parse(call.options.body);
  assert.deepEqual(body, {
    deviceId: 'abcdefgh12345678',
    lang: 'vi',
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh: 'AQID', auth: 'BAU' },
    },
  });
});

await test('pushsubscriptionchange: mat subscription thi lay khoa VAPID va dang ky', async () => {
  const caches = createCaches();
  const worker = loadWorker({
    caches,
    subscription: null,
    fetchImpl: async (url) => {
      if (String(url) === './api/config') {
        return new Response(JSON.stringify({ vapidPublicKey: 'AQID' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    },
  });
  await worker.fire(
    'message',
    worker.eventWithWaitUntil({
      data: { type: 'mmc:push-meta', deviceId: 'abcdefgh12345678', lang: 'en' },
    })
  );
  await worker.fire('pushsubscriptionchange', worker.eventWithWaitUntil());
  assert.deepEqual(
    worker.fetchCalls.map((call) => call.url),
    ['./api/config', './api/push/subscribe']
  );
  assert.equal(worker.subscribed.length, 1);
  assert.equal(worker.subscribed[0].userVisibleOnly, true);
  assert.deepEqual([...worker.subscribed[0].applicationServerKey], [1, 2, 3]);
  const body = JSON.parse(worker.fetchCalls[1].options.body);
  assert.equal(body.lang, 'en');
  assert.equal(body.subscription.endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/demo');
});

await test('pushsubscriptionchange: config khong co khoa VAPID thi dung, khong loi', async () => {
  const caches = createCaches();
  const worker = loadWorker({
    caches,
    subscription: null,
    fetchImpl: async () => new Response(JSON.stringify({ pushEnabled: false }), { status: 200 }),
  });
  await worker.fire(
    'message',
    worker.eventWithWaitUntil({
      data: { type: 'mmc:push-meta', deviceId: 'abcdefgh12345678', lang: 'vi' },
    })
  );
  await worker.fire('pushsubscriptionchange', worker.eventWithWaitUntil());
  assert.equal(worker.subscribed.length, 0);
  assert.equal(worker.fetchCalls.length, 1);
});

console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail) process.exit(1);
