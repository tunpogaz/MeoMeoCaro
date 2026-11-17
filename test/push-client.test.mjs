/**
 * Logic client cua thong bao day + nhac luot: nhan dien iPhone/iPad, phan loai
 * trang thai Cai dat, nhay title, app badge, chuyen khoa VAPID, dang ky/
 * huy dang ky, gui meta cho service worker, ma thiet bi va rung thu nghiem
 * tren iOS. Khong can trinh duyet: moi API deu duoc gia lap.
 */
import assert from 'node:assert/strict';
import {
  PUSH_STATE_KEYS,
  TITLE_ALERT_TEXT,
  TITLE_BLINK_MS,
  base64UrlToUint8Array,
  bufferToBase64Url,
  classifyPushState,
  clearAppBadge,
  createTitleBlinker,
  detectIos,
  detectPushEnvironment,
  getExistingPushSubscription,
  sendPushMeta,
  setAppBadge,
  shouldAlertTab,
  subscribeToPush,
  subscriptionEndpoint,
  subscriptionToPayload,
  unsubscribeFromPush,
} from '../public/js/push.js';
import {
  iosSwitchSupported,
  iosTurnHaptic,
  tapIosSwitchHaptic,
} from '../public/js/haptics.js';

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

const silent = () => {
  const calls = [];
  return {
    calls,
    vibrate(pattern) {
      calls.push(pattern);
      return true;
    },
    setAppBadge(count) {
      calls.push(['set', count]);
      return Promise.resolve();
    },
    clearAppBadge() {
      calls.push(['clear']);
      return Promise.resolve();
    },
  };
};

// ---------------------------------------------------------------------------
// Nhan dien thiet bi va moi truong
// ---------------------------------------------------------------------------
await test('detectIos: iPhone, iPad that va iPadOS tu xung MacIntel', () => {
  assert.deepEqual(
    detectIos({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      platform: 'iPhone',
      maxTouchPoints: 5,
    }),
    { ios: true, ipad: false, iphone: true }
  );
  assert.deepEqual(
    detectIos({
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      platform: 'iPad',
      maxTouchPoints: 5,
    }),
    { ios: true, ipad: true, iphone: false }
  );
  assert.deepEqual(
    detectIos({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }),
    { ios: true, ipad: true, iphone: false }
  );
  assert.deepEqual(
    detectIos({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }),
    { ios: false, ipad: false, iphone: false }
  );
});

await test('detectPushEnvironment: https/localhost, standalone, quyen thong bao', () => {
  const baseNav = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    serviceWorker: {},
  };
  const secureWin = {
    location: { hostname: 'meo.example.com' },
    isSecureContext: true,
    Notification: { permission: 'granted' },
    PushManager: function PushManager() {},
  };
  const env = detectPushEnvironment({ nav: baseNav, win: secureWin });
  assert.equal(env.secure, true);
  assert.equal(env.supported, true);
  assert.equal(env.permission, 'granted');
  assert.equal(env.ios, false);

  const local = detectPushEnvironment({
    nav: baseNav,
    win: { location: { hostname: 'localhost' }, Notification: { permission: 'default' } },
  });
  assert.equal(local.secure, true);
  assert.equal(local.supported, false);

  const insecure = detectPushEnvironment({
    nav: baseNav,
    win: { location: { hostname: '192.168.1.9' }, Notification: { permission: 'default' } },
  });
  assert.equal(insecure.secure, false);

  const standalone = detectPushEnvironment({
    nav: { ...baseNav, standalone: true },
    win: {
      location: { hostname: 'meo.example.com' },
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
      Notification: { permission: 'default' },
      PushManager: function PushManager() {},
    },
  });
  assert.equal(standalone.standalone, true);
});

await test('classifyPushState: thu tu uu tien va day du trang thai', () => {
  const base = { secure: true, ios: false, standalone: false, supported: true, permission: 'default' };
  assert.equal(classifyPushState(base, { serverEnabled: false }), 'disabled');
  assert.equal(classifyPushState({ ...base, secure: false }, { serverEnabled: true }), 'insecure');
  assert.equal(
    classifyPushState({ ...base, ios: true, standalone: false }, { serverEnabled: true }),
    'ios-install'
  );
  assert.equal(
    classifyPushState({ ...base, ios: true, standalone: true }, { serverEnabled: true }),
    'ready'
  );
  assert.equal(
    classifyPushState({ ...base, supported: false }, { serverEnabled: true }),
    'unsupported'
  );
  assert.equal(
    classifyPushState({ ...base, permission: 'denied', subscribed: true }, { serverEnabled: true }),
    'permission-denied'
  );
  assert.equal(
    classifyPushState({ ...base, subscribed: true }, { serverEnabled: true }),
    'subscribed'
  );
  assert.equal(classifyPushState(base, { serverEnabled: true }), 'ready');
  assert.equal(PUSH_STATE_KEYS.disabled, 'pushOff');
  assert.equal(PUSH_STATE_KEYS.ready, 'pushOff');
  assert.equal(PUSH_STATE_KEYS['ios-install'], 'pushIosStatus');
  assert.equal(PUSH_STATE_KEYS['permission-denied'], 'pushBlockedStatus');
  assert.equal(PUSH_STATE_KEYS.subscribed, 'pushOn');
});

await test('shouldAlertTab: chi khi tab an, dang choi va den luot', () => {
  assert.equal(shouldAlertTab({ hidden: true, myTurn: true, playing: true }), true);
  assert.equal(shouldAlertTab({ hidden: false, myTurn: true, playing: true }), false);
  assert.equal(shouldAlertTab({ hidden: true, myTurn: false, playing: true }), false);
  assert.equal(shouldAlertTab({ hidden: true, myTurn: true, playing: false }), false);
  assert.equal(shouldAlertTab(), false);
});

// ---------------------------------------------------------------------------
// Title blink + app badge
// ---------------------------------------------------------------------------
await test('createTitleBlinker: nhay den luot, doi ngon ngu va tra lai title goc', () => {
  let title = 'Meo Meo Caro';
  let lang = 'vi';
  let tickFn = null;
  let cleared = 0;
  const blinker = createTitleBlinker({
    getTitle: () => title,
    setTitle: (value) => {
      title = value;
    },
    getText: () => TITLE_ALERT_TEXT[lang],
    intervalMs: TITLE_BLINK_MS,
    timers: {
      setInterval(fn) {
        tickFn = fn;
        return 7;
      },
      clearInterval() {
        cleared += 1;
        tickFn = null;
      },
    },
  });
  assert.equal(blinker.active, false);
  blinker.start();
  assert.equal(blinker.active, true);
  assert.equal(title, TITLE_ALERT_TEXT.vi);
  tickFn();
  assert.equal(title, 'Meo Meo Caro');
  tickFn();
  assert.equal(title, TITLE_ALERT_TEXT.vi);
  lang = 'en';
  tickFn();
  assert.equal(title, 'Meo Meo Caro');
  tickFn();
  assert.equal(title, TITLE_ALERT_TEXT.en);
  blinker.stop();
  assert.equal(title, 'Meo Meo Caro');
  assert.equal(blinker.active, false);
  assert.equal(cleared, 1);
  blinker.stop();
  assert.equal(cleared, 1);
  assert.ok(TITLE_BLINK_MS >= 1000 && TITLE_BLINK_MS <= 1500);
});

await test('setAppBadge/clearAppBadge: goi API, bo qua loi va moi truong thieu', async () => {
  const nav = silent();
  setAppBadge(nav, 2);
  clearAppBadge(nav);
  assert.deepEqual(nav.calls, [['set', 2], ['clear']]);
  setAppBadge({});
  clearAppBadge({});
  const throwing = {
    setAppBadge() {
      throw new Error('blocked');
    },
    clearAppBadge() {
      throw new Error('blocked');
    },
  };
  setAppBadge(throwing);
  clearAppBadge(throwing);
  const rejected = {
    setAppBadge: () => Promise.reject(new Error('denied')),
    clearAppBadge: () => Promise.reject(new Error('denied')),
  };
  setAppBadge(rejected);
  clearAppBadge(rejected);
  await new Promise((resolve) => setTimeout(resolve, 10));
});

// ---------------------------------------------------------------------------
// Khoa VAPID + PushSubscription
// ---------------------------------------------------------------------------
await test('base64UrlToUint8Array: giai ma dung, chiu duoc chuoi hong', () => {
  assert.deepEqual([...base64UrlToUint8Array('AQID')], [1, 2, 3]);
  assert.deepEqual([...base64UrlToUint8Array('-_8')], [251, 255]);
  assert.deepEqual([...base64UrlToUint8Array('')], []);
  assert.deepEqual([...base64UrlToUint8Array(null)], []);
  assert.deepEqual([...base64UrlToUint8Array('%%%')], []);
});

await test('bufferToBase64Url + subscriptionToPayload: khong padding, dung ngon ngu', () => {
  assert.equal(bufferToBase64Url(new Uint8Array([1, 2, 3]).buffer), 'AQID');
  assert.equal(bufferToBase64Url(new Uint8Array([251, 255]).buffer), '-_8');
  assert.equal(bufferToBase64Url(null), '');
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/demo',
    getKey(name) {
      if (name === 'p256dh') return new Uint8Array([1, 2, 3]).buffer;
      if (name === 'auth') return new Uint8Array([4, 5]).buffer;
      return null;
    },
  };
  const vi = subscriptionToPayload(subscription, { deviceId: 'abcdefgh12345678' });
  assert.deepEqual(vi, {
    deviceId: 'abcdefgh12345678',
    lang: 'vi',
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/demo',
      keys: { p256dh: 'AQID', auth: 'BAU' },
    },
  });
  assert.equal(subscriptionToPayload(subscription, { lang: 'en' }).lang, 'en');
  assert.equal(subscriptionToPayload(subscription, { lang: 'fr' }).lang, 'vi');
  assert.equal(subscriptionEndpoint(subscription), subscription.endpoint);
  assert.equal(subscriptionEndpoint({}), '');
  assert.equal(subscriptionEndpoint(null), '');
});

await test('getExistingPushSubscription: khong SW, co subscription, loi deu an toan', async () => {
  assert.equal(await getExistingPushSubscription({}), null);
  const subscription = { endpoint: 'https://x' };
  const nav = {
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => subscription,
        },
      }),
    },
  };
  assert.equal(await getExistingPushSubscription(nav), subscription);
  const failing = {
    serviceWorker: {
      ready: Promise.reject(new Error('no sw')),
    },
  };
  assert.equal(await getExistingPushSubscription(failing), null);
});

await test('sendPushMeta: gui deviceId/lang khi co worker, bo qua khi thieu', async () => {
  const messages = [];
  const nav = {
    serviceWorker: {
      ready: Promise.resolve({ active: { postMessage: (m) => messages.push(m) } }),
    },
  };
  assert.equal(await sendPushMeta(nav, 'abcdefgh12345678', 'en'), true);
  assert.deepEqual(messages, [
    { type: 'mmc:push-meta', deviceId: 'abcdefgh12345678', lang: 'en' },
  ]);
  assert.equal(await sendPushMeta({}, 'abcdefgh12345678', 'vi'), false);
  const noActive = { serviceWorker: { ready: Promise.resolve({ active: null }) } };
  assert.equal(await sendPushMeta(noActive, 'abcdefgh12345678', 'vi'), false);
});

await test('subscribeToPush: thieu khoa, thieu API, bi tu choi, thanh cong', async () => {
  await assert.rejects(() => subscribeToPush({ vapidPublicKey: '' }), /invalid-vapid-key/);
  await assert.rejects(
    () => subscribeToPush({ vapidPublicKey: 'AQID', nav: {}, win: {} }),
    /unsupported/
  );
  const deniedWin = {
    Notification: { permission: 'default', requestPermission: async () => 'denied' },
  };
  await assert.rejects(
    () => subscribeToPush({ vapidPublicKey: 'AQID', nav: { serviceWorker: {} }, win: deniedWin }),
    /permission-denied/
  );

  const calls = [];
  const nav = {
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: async (options) => {
            calls.push(options);
            return { endpoint: 'https://x' };
          },
        },
      }),
    },
  };
  const win = {
    Notification: {
      permission: 'default',
      requestPermission: async () => 'granted',
    },
  };
  const subscription = await subscribeToPush({ vapidPublicKey: 'AQID', nav, win });
  assert.equal(subscription.endpoint, 'https://x');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userVisibleOnly, true);
  assert.deepEqual([...calls[0].applicationServerKey], [1, 2, 3]);

  const alreadyGranted = {
    Notification: { permission: 'granted' },
  };
  await subscribeToPush({ vapidPublicKey: 'AQID', nav, win: alreadyGranted });
  assert.equal(calls.length, 2);
});

await test('unsubscribeFromPush: huy subscription hien co va chiu duoc loi', async () => {
  let unsubscribed = false;
  const subscription = {
    endpoint: 'https://x',
    unsubscribe: async () => {
      unsubscribed = true;
      return true;
    },
  };
  const nav = {
    serviceWorker: {
      ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }),
    },
  };
  assert.equal(await unsubscribeFromPush(nav), subscription);
  assert.equal(unsubscribed, true);
  assert.equal(await unsubscribeFromPush({}), null);
});

// ---------------------------------------------------------------------------
// Rung thu nghiem tren iOS
// ---------------------------------------------------------------------------
await test('iosSwitchSupported: chi dua vao CSS.supports, khong doan phien ban', () => {
  assert.equal(iosSwitchSupported({ doc: null }), false);
  assert.equal(iosSwitchSupported({ doc: { createElement() {} } }), false);
  assert.equal(
    iosSwitchSupported({
      doc: { createElement() {} },
      css: { supports: (prop, value) => prop === 'appearance' && value === 'switch' },
    }),
    true
  );
  assert.equal(
    iosSwitchSupported({
      doc: { createElement() {} },
      css: {
        supports: (prop, value) => prop === '-webkit-appearance' && value === 'switch',
      },
    }),
    true
  );
  const throwingCss = {
    supports() {
      throw new Error('no');
    },
  };
  assert.equal(iosSwitchSupported({ doc: { createElement() {} }, css: throwingCss }), false);
});

function fakeSwitchDocument() {
  const appended = [];
  const clicks = [];
  const removed = [];
  const label = {
    style: {},
    children: [],
    setAttribute() {},
    appendChild(child) {
      this.children.push(child);
    },
    click() {
      clicks.push(this);
    },
    remove() {
      removed.push(this);
    },
  };
  const doc = {
    body: {
      appendChild(node) {
        appended.push(node);
        return node;
      },
    },
    createElement(tag) {
      if (tag === 'label') return label;
      return {
        type: '',
        tabIndex: 0,
        attrs: {},
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
      };
    },
  };
  return { doc, appended, clicks, removed, label };
}

await test('tapIosSwitchHaptic: tao switch an, bam label roi don dep', () => {
  const fake = fakeSwitchDocument();
  assert.equal(tapIosSwitchHaptic({ doc: fake.doc }), true);
  assert.equal(fake.appended.length, 1);
  assert.equal(fake.label.children.length, 1);
  assert.equal(fake.label.children[0].type, 'checkbox');
  assert.equal(fake.label.children[0].attrs.switch, '');
  assert.equal(fake.label.children[0].attrs['aria-hidden'], 'true');
  assert.equal(fake.clicks.length, 1);
  assert.equal(tapIosSwitchHaptic({ doc: {} }), false);
  const broken = {
    body: {
      appendChild() {
        throw new Error('dom');
      },
    },
    createElement() {
      return {};
    },
  };
  assert.equal(tapIosSwitchHaptic({ doc: broken }), false);
});

await test('iosTurnHaptic: tat cai dat hoac thieu switch thi khong lam gi', () => {
  const fake = fakeSwitchDocument();
  assert.equal(iosTurnHaptic({ enabled: false, doc: fake.doc }), false);
  assert.equal(iosTurnHaptic({ enabled: true, doc: fake.doc }), false);
  const previousCss = globalThis.CSS;
  globalThis.CSS = { supports: (prop, value) => prop === 'appearance' && value === 'switch' };
  try {
    assert.equal(iosTurnHaptic({ enabled: true, doc: fake.doc }), true);
    assert.equal(fake.clicks.length, 1);
  } finally {
    if (previousCss === undefined) delete globalThis.CSS;
    else globalThis.CSS = previousCss;
  }
});

// ---------------------------------------------------------------------------
// Ma thiet bi ben vung
// ---------------------------------------------------------------------------
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
};
const { getDeviceId } = await import('../public/js/storage.js');

await test('getDeviceId: 32 hex, on dinh qua cac lan goi va luu localStorage', () => {
  store.clear();
  const first = getDeviceId();
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.equal(store.get('mmc.device'), first);
  assert.equal(getDeviceId(), first);
  store.set('mmc.device', 'hong');
  const repaired = getDeviceId();
  assert.match(repaired, /^[0-9a-f]{32}$/);
  assert.notEqual(repaired, 'hong');
  assert.equal(store.get('mmc.device'), repaired);
});

console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail) process.exit(1);
