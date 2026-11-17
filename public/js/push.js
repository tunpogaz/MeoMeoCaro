/**
 * Thong bao day + nhac "den luot" o phia client.
 *
 * Phan thuan (khong dung DOM) duoc test bang Node: nhan dien iPhone/iPad gia
 * Mac, phan loai trang thai, quyet dinh nhay title, doi khoa VAPID.
 * Phan trinh duyet chi chay khi co window/navigator that.
 */

export const TITLE_BLINK_MS = 1200;
export const TITLE_ALERT_TEXT = { vi: '● Đến lượt bạn', en: '● Your turn' };

export const PUSH_STATE_KEYS = {
  disabled: 'pushOff',
  insecure: 'pushNeedsHttps',
  unsupported: 'pushUnsupported',
  'ios-install': 'pushIosStatus',
  'permission-denied': 'pushBlockedStatus',
  subscribed: 'pushOn',
  ready: 'pushOff',
};

/** Chuyen khoa VAPID (base64url) sang Uint8Array cho applicationServerKey. */
export function base64UrlToUint8Array(value) {
  if (typeof value !== 'string' || !value) return new Uint8Array(0);
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob !== 'function') return new Uint8Array(0);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * iPhone/iPad nhan dien tu UA va tu truong hop iPadOS 13+ tu xung la MacIntel.
 * Khong dua vao phien ban iOS.
 */
export function detectIos({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent || '');
  const plat = String(platform || '');
  const touch = Number(maxTouchPoints) || 0;
  const ipad = /iPad/.test(ua) || (plat === 'MacIntel' && touch > 1);
  const iphone = /iPhone|iPod/.test(ua);
  return { ios: ipad || iphone, ipad, iphone };
}

export function detectPushEnvironment({ nav = globalThis.navigator, win = globalThis.window } = {}) {
  const device = detectIos({
    userAgent: nav?.userAgent || '',
    platform: nav?.platform || '',
    maxTouchPoints: nav?.maxTouchPoints || 0,
  });
  const standalone = Boolean(
    win?.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone === true
  );
  const host = String(win?.location?.hostname || '');
  const secure = Boolean(win?.isSecureContext) || ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const notification = Boolean(win && 'Notification' in win);
  const pushManager = Boolean(win && 'PushManager' in win);
  const serviceWorker = Boolean(nav && 'serviceWorker' in nav);
  const permission = notification ? String(win.Notification.permission || 'default') : 'unsupported';
  return {
    ...device,
    standalone,
    secure,
    supported: notification && pushManager && serviceWorker,
    notification,
    pushManager,
    serviceWorker,
    permission,
  };
}

/**
 * Trang thai hien thi trong Cai dat.
 * env co the kem `subscribed` (da co PushSubscription tren may).
 */
export function classifyPushState(env, { serverEnabled = false } = {}) {
  if (!serverEnabled) return 'disabled';
  if (!env?.secure) return 'insecure';
  if (env?.ios && !env?.standalone) return 'ios-install';
  if (!env?.supported) return 'unsupported';
  if (env?.permission === 'denied') return 'permission-denied';
  if (env?.subscribed) return 'subscribed';
  return 'ready';
}

/** Chi nhay title khi tab dang an va vua den luot minh. */
export function shouldAlertTab({ hidden = false, myTurn = false, playing = false } = {}) {
  return Boolean(hidden && myTurn && playing);
}

/** Nhay title giua tieu de goc va loi nhac; toi da 1 lan/1.2 giay. */
export function createTitleBlinker({
  getTitle,
  setTitle,
  text,
  getText,
  intervalMs = TITLE_BLINK_MS,
  timers = globalThis,
} = {}) {
  let timer = null;
  let original = null;
  let showingAlert = false;

  function alertText() {
    return typeof getText === 'function' ? getText() : text;
  }

  function tick() {
    showingAlert = !showingAlert;
    setTitle(showingAlert ? alertText() : original);
  }

  return {
    get active() {
      return Boolean(timer);
    },
    start() {
      if (timer) return;
      original = typeof getTitle === 'function' ? getTitle() : '';
      showingAlert = false;
      timer = timers.setInterval(tick, intervalMs);
      tick();
    },
    stop() {
      if (timer) {
        timers.clearInterval(timer);
        timer = null;
      }
      if (original !== null) {
        setTitle(original);
        original = null;
      }
    },
  };
}

export function setAppBadge(nav = globalThis.navigator, count = 1) {
  try {
    if (nav && typeof nav.setAppBadge === 'function') {
      const result = nav.setAppBadge(count);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    }
  } catch {
    /* trinh duyet khong ho tro */
  }
}

export function clearAppBadge(nav = globalThis.navigator) {
  try {
    if (nav && typeof nav.clearAppBadge === 'function') {
      const result = nav.clearAppBadge();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    }
  } catch {
    /* trinh duyet khong ho tro */
  }
}

/** Lay PushSubscription hien co (null neu chua co/khong ho tro). */
export async function getExistingPushSubscription(nav = globalThis.navigator) {
  if (!nav?.serviceWorker) return null;
  try {
    const registration = await nav.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Gui deviceId/lang cho service worker de tu dang ky lai khi subscription doi. */
export async function sendPushMeta(nav, deviceId, lang) {
  if (!nav?.serviceWorker) return false;
  try {
    const registration = await nav.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return false;
    worker.postMessage({ type: 'mmc:push-meta', deviceId, lang });
    return true;
  } catch {
    return false;
  }
}

/** Dang ky push trong mot lan cham cua nguoi dung. */
export async function subscribeToPush({
  nav = globalThis.navigator,
  win = globalThis.window,
  vapidPublicKey,
} = {}) {
  const key = base64UrlToUint8Array(vapidPublicKey);
  if (!key.length) throw new Error('invalid-vapid-key');
  if (!nav?.serviceWorker || !win?.Notification) throw new Error('unsupported');
  const permission =
    win.Notification.permission === 'granted'
      ? 'granted'
      : await win.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission-denied');
  const registration = await nav.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
}

export async function unsubscribeFromPush(nav = globalThis.navigator) {
  const subscription = await getExistingPushSubscription(nav);
  if (!subscription) return null;
  try {
    await subscription.unsubscribe();
  } catch {
    /* van tra ve endpoint de server don dep */
  }
  return subscription;
}

export function subscriptionEndpoint(subscription) {
  return typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
}

/** Chuyen ArrayBuffer (khoa p256dh/auth) sang base64url khong padding. */
export function bufferToBase64Url(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const table = typeof btoa === 'function' ? btoa(binary) : '';
  return table.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Chuan bi body gui len /api/push/subscribe tu PushSubscription cua trinh duyet. */
export function subscriptionToPayload(subscription, { deviceId, lang } = {}) {
  const endpoint = subscriptionEndpoint(subscription);
  const p256dh = bufferToBase64Url(subscription?.getKey?.('p256dh'));
  const auth = bufferToBase64Url(subscription?.getKey?.('auth'));
  return {
    deviceId,
    lang: lang === 'en' ? 'en' : 'vi',
    subscription: { endpoint, keys: { p256dh, auth } },
  };
}
