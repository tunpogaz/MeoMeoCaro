/**
 * Thong bao day (Web Push) cho luot choi online.
 *
 * Nguyen tac:
 * - Server chi gui khi nguoi nhan khong hien tab / dang mat ket noi va co
 *   subscription cho thiet bi do. Payload khong chua ten nguoi choi.
 * - Khong bao gio ghi endpoint hay khoa thiet bi (p256dh/auth) vao log.
 * - Kiem tra SSRF: chi https, khong user:pass, khong IP/localhost/noi bo,
 *   host phai nam trong danh sach dich vu push da biet.
 * - PUSH_PROVIDER=test: hop thu gia trong bo nho, chi dung ngoai production.
 */
import express from 'express';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { isUniqueViolation, newId, query, transaction } from './db.js';
import { csrfJsonGuard } from './security.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const PROVIDER = String(process.env.PUSH_PROVIDER || '')
  .trim()
  .toLowerCase();
const RATE_LIMIT_DISABLED = process.env.DISABLE_RATE_LIMIT === '1';
const RAW_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const RAW_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const RAW_SUBJECT = String(process.env.VAPID_SUBJECT || '').trim();
const VAPID_SUBJECT = RAW_SUBJECT || 'mailto:no-reply@meomeocaro.local';

export const INVALID_PUSH_ENDPOINT = 'INVALID_PUSH_ENDPOINT';
export const MAX_DEVICE_SUBSCRIPTIONS = 5;
export const MAX_USER_SUBSCRIPTIONS = 10;
export const PUSH_FAIL_LIMIT = 5;
export const PUSH_STALE_MS = 60 * 24 * 60 * 60 * 1000;
export const PUSH_TTL_SECONDS = 120;
export const PUSH_TIMEOUT_MS = 5000;
export const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Host duyoc phep cua cac dich vu push pho bien. */
export const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  '*.push.services.mozilla.com',
  '*.push.apple.com',
  '*.notify.windows.com',
];

const TEST_DELAY_MS = positiveInt(process.env.PUSH_TEST_DELAY_MS, 5000);

function positiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function hostMatches(host, rule) {
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1); // ".push.apple.com"
    return host.length > suffix.length && host.endsWith(suffix);
  }
  return host === rule;
}

function looksLikeIp(host) {
  return host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Tra ve URL da chuan hoa neu endpoint hop le, nguoc lai null.
 * Duoc export de test SSRF khong can gui mang.
 */
export function validatePushEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return null;
  }
  if (looksLikeIp(host)) return null;
  if (!ALLOWED_PUSH_HOSTS.some((rule) => hostMatches(host, rule))) return null;
  return url.toString();
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  try {
    const buffer = Buffer.from(value, 'base64url');
    return buffer.length ? buffer : null;
  } catch {
    return null;
  }
}

export function isValidDeviceId(raw) {
  return typeof raw === 'string' && DEVICE_ID_RE.test(raw);
}

/**
 * Kiem tra body POST /api/push/subscribe.
 * Tra ve { ok: true, ... } hoac { ok: false, code }.
 */
export function validatePushSubscription(body) {
  if (!isValidDeviceId(body?.deviceId)) {
    return { ok: false, code: 'INVALID_DEVICE_ID' };
  }
  const lang = body?.lang === 'en' ? 'en' : body?.lang === 'vi' ? 'vi' : '';
  if (!lang) return { ok: false, code: 'INVALID_LANG' };

  const endpoint = validatePushEndpoint(body?.subscription?.endpoint);
  if (!endpoint) return { ok: false, code: INVALID_PUSH_ENDPOINT };

  const p256dh = decodeBase64Url(body?.subscription?.keys?.p256dh);
  const auth = decodeBase64Url(body?.subscription?.keys?.auth);
  if (!p256dh || p256dh.length !== 65 || !auth || auth.length !== 16) {
    return { ok: false, code: 'INVALID_PUSH_KEYS' };
  }

  return {
    ok: true,
    deviceId: body.deviceId,
    lang,
    endpoint,
    p256dh: body.subscription.keys.p256dh,
    auth: body.subscription.keys.auth,
  };
}

// ---------------------------------------------------------------------------
// VAPID / web-push
// ---------------------------------------------------------------------------
let webpush = null;
let pushProblem = null;
let vapidPublicKey = '';

if (PROVIDER === 'test') {
  if (IS_PROD) {
    pushProblem = 'PUSH_PROVIDER=test không được dùng ở production';
  } else {
    try {
      const module = await import('web-push');
      webpush = module.default;
      const keys = webpush.generateVAPIDKeys();
      webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
      vapidPublicKey = keys.publicKey;
    } catch {
      webpush = null;
      pushProblem = 'không khởi tạo được web-push cho chế độ test';
    }
  }
} else if (PROVIDER === '') {
  if (!RAW_PUBLIC_KEY || !RAW_PRIVATE_KEY) {
    pushProblem = 'thiếu VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY';
  } else {
    try {
      const module = await import('web-push');
      webpush = module.default;
      webpush.setVapidDetails(VAPID_SUBJECT, RAW_PUBLIC_KEY, RAW_PRIVATE_KEY);
      vapidPublicKey = RAW_PUBLIC_KEY;
    } catch {
      webpush = null;
      pushProblem = 'khóa VAPID hoặc VAPID_SUBJECT không hợp lệ';
    }
  }
} else {
  pushProblem = 'PUSH_PROVIDER không hợp lệ';
}

export const pushEnabled = Boolean(webpush);
export const pushPublicKey = pushEnabled ? vapidPublicKey : '';
export const pushProvider = pushEnabled ? (PROVIDER === 'test' ? 'test' : 'real') : 'disabled';

/** Canh bao luc khoi dong; khong chua khoa hay endpoint. */
export function pushStartupWarning() {
  return pushProblem ? `tính năng thông báo đẩy đang tắt (${pushProblem})` : null;
}

// ---------------------------------------------------------------------------
// Hop thu gia cho test
// ---------------------------------------------------------------------------
const testOutbox = [];

export function getTestPushOutbox(since = 0) {
  return testOutbox
    .filter((item) => item.ts >= since)
    .map((item) => ({ ...item }));
}

export function clearTestPushOutbox() {
  testOutbox.length = 0;
}

function recordTestPush(row, payload) {
  testOutbox.push({
    subscriptionId: row.id,
    deviceId: row.device_id,
    lang: row.lang,
    type: payload.type,
    roomId: payload.roomId,
    title: payload.title,
    body: payload.body,
    ts: payload.ts,
  });
  if (testOutbox.length > 200) testOutbox.splice(0, testOutbox.length - 200);
}

// ---------------------------------------------------------------------------
// Noi dung thong bao (VI/EN)
// ---------------------------------------------------------------------------
const TITLES = { vi: 'Meo Meo Caro', en: 'Meo Meo Caro' };
const BODIES = {
  turn: {
    vi: 'Đến lượt bạn rồi! 😺',
    en: "It's your turn! 😺",
  },
  join: {
    vi: 'Bạn bè đã vào phòng, bắt đầu thôi! 🐱',
    en: 'Your friend joined the room. Let’s play! 🐱',
  },
  test: {
    vi: 'Thông báo thử từ Meo Meo Caro — thông báo đẩy đang hoạt động! 😺',
    en: 'Test notification from Meo Meo Caro — push notifications are working! 😺',
  },
};

/** Payload khong chua ten nguoi choi; chi loai thong bao, ma phong va thoi diem. */
export function buildPushPayload(type, roomId, lang = 'vi') {
  const safeLang = lang === 'en' ? 'en' : 'vi';
  return {
    title: TITLES[safeLang],
    body: BODIES[type]?.[safeLang] || BODIES.turn[safeLang],
    type,
    roomId: typeof roomId === 'string' ? roomId : null,
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Luu tru
// ---------------------------------------------------------------------------
async function pruneForDevice(tx, deviceId, keepId) {
  const rows = await tx.query(
    'SELECT id FROM push_subscriptions WHERE device_id = ? AND id <> ? ORDER BY created_at ASC',
    [deviceId, keepId || '']
  );
  const allowed = MAX_DEVICE_SUBSCRIPTIONS - 1;
  for (const row of rows.rows.slice(0, Math.max(0, rows.rows.length - allowed))) {
    await tx.query('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
  }
}

async function pruneForUser(tx, userId, keepId) {
  if (!userId) return;
  const rows = await tx.query(
    'SELECT id FROM push_subscriptions WHERE user_id = ? AND id <> ? ORDER BY created_at ASC',
    [userId, keepId || '']
  );
  const allowed = MAX_USER_SUBSCRIPTIONS - 1;
  for (const row of rows.rows.slice(0, Math.max(0, rows.rows.length - allowed))) {
    await tx.query('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
  }
}

/**
 * Them/cap nhat subscription. Moi thiet bi toi da 5, moi tai khoan toi da 10
 * (xoa cai cu nhat truoc khi them). Tra ve { id, created }.
 */
export async function savePushSubscription(input) {
  const existing = await query('SELECT id FROM push_subscriptions WHERE endpoint = ?', [
    input.endpoint,
  ]);

  if (existing.rows.length) {
    const id = existing.rows[0].id;
    await transaction(async (tx) => {
      await tx.query(
        `UPDATE push_subscriptions
            SET p256dh = ?, auth = ?, device_id = ?, user_id = ?, lang = ?, fail_count = 0
          WHERE id = ?`,
        [input.p256dh, input.auth, input.deviceId, input.userId || null, input.lang, id]
      );
      await pruneForDevice(tx, input.deviceId, id);
      await pruneForUser(tx, input.userId, id);
    });
    return { id, created: false };
  }

  const id = newId();
  try {
    await transaction(async (tx) => {
      await pruneForDevice(tx, input.deviceId, null);
      await pruneForUser(tx, input.userId, null);
      await tx.query(
        `INSERT INTO push_subscriptions
           (id, endpoint, p256dh, auth, device_id, user_id, lang, created_at, last_success_at, fail_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
        [
          id,
          input.endpoint,
          input.p256dh,
          input.auth,
          input.deviceId,
          input.userId || null,
          input.lang,
          Date.now(),
        ]
      );
    });
    return { id, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Hai request cung endpoint chay song song: cap nhat ban da co.
    const raced = await query('SELECT id FROM push_subscriptions WHERE endpoint = ?', [
      input.endpoint,
    ]);
    if (!raced.rows.length) throw error;
    const racedId = raced.rows[0].id;
    await transaction(async (tx) => {
      await tx.query(
        `UPDATE push_subscriptions
            SET p256dh = ?, auth = ?, device_id = ?, user_id = ?, lang = ?, fail_count = 0
          WHERE id = ?`,
        [input.p256dh, input.auth, input.deviceId, input.userId || null, input.lang, racedId]
      );
      await pruneForDevice(tx, input.deviceId, racedId);
      await pruneForUser(tx, input.userId, racedId);
    });
    return { id: racedId, created: false };
  }
}

export async function deletePushSubscription(deviceId, endpoint) {
  if (!isValidDeviceId(deviceId)) return 0;
  const result = endpoint
    ? await query('DELETE FROM push_subscriptions WHERE device_id = ? AND endpoint = ?', [
        deviceId,
        endpoint,
      ])
    : await query('DELETE FROM push_subscriptions WHERE device_id = ?', [deviceId]);
  return result.rowCount;
}

/** Dang xuat: bo lien ket tai khoan nhung giu subscription cho che do khach. */
export async function unlinkPushForDevice(userId, deviceId) {
  if (!userId || !isValidDeviceId(deviceId)) return 0;
  try {
    const result = await query(
      'UPDATE push_subscriptions SET user_id = NULL WHERE device_id = ? AND user_id = ?',
      [deviceId, userId]
    );
    return result.rowCount;
  } catch (error) {
    console.error('[mmc] push unlink failed', error?.code || error?.message || 'db');
    return 0;
  }
}

/**
 * Ap ket qua gui cho mot dong: 404/410 xoa ngay; loi khac tang fail_count va
 * xoa khi vuot nguong. Tra ve 'deleted' | 'failed'.
 */
export async function applyPushDeliveryResult(id, statusCode) {
  if (statusCode === 404 || statusCode === 410) {
    await query('DELETE FROM push_subscriptions WHERE id = ?', [id]);
    return 'deleted';
  }
  await query('UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?', [id]);
  const removed = await query(
    'DELETE FROM push_subscriptions WHERE id = ? AND fail_count > ?',
    [id, PUSH_FAIL_LIMIT]
  );
  return removed.rowCount ? 'deleted' : 'failed';
}

async function markSuccess(id) {
  await query(
    'UPDATE push_subscriptions SET last_success_at = ?, fail_count = 0 WHERE id = ?',
    [Date.now(), id]
  );
}

/** Xoa subscription hong hoac khong thanh cong trong 60 ngay. */
export async function cleanupPushSubscriptions() {
  const cutoff = Date.now() - PUSH_STALE_MS;
  const result = await query(
    `DELETE FROM push_subscriptions
      WHERE fail_count > ?
         OR COALESCE(last_success_at, created_at) < ?`,
    [PUSH_FAIL_LIMIT, cutoff]
  );
  return result.rowCount;
}

// ---------------------------------------------------------------------------
// Gui
// ---------------------------------------------------------------------------
async function deliver(row, payload) {
  if (PROVIDER === 'test') {
    recordTestPush(row, payload);
    return { ok: true };
  }
  if (!webpush) return { ok: false, statusCode: 0 };
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      JSON.stringify(payload),
      {
        TTL: PUSH_TTL_SECONDS,
        urgency: 'high',
        timeout: PUSH_TIMEOUT_MS,
      }
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, statusCode: Number(error?.statusCode) || 0 };
  }
}

/**
 * Gui thong bao toi moi subscription cua thiet bi. Khong bao gio nem loi;
 * loi chi duoc ghi bang ma trang thai, khong kem endpoint/khoa.
 */
export async function sendPushToDevice(deviceId, type, roomId) {
  if (!pushEnabled || !isValidDeviceId(deviceId)) return { sent: 0 };
  try {
    const rows = await query(
      'SELECT id, endpoint, p256dh, auth, device_id, lang, fail_count FROM push_subscriptions WHERE device_id = ? ORDER BY created_at ASC',
      [deviceId]
    );
    let sent = 0;
    for (const row of rows.rows) {
      if (Number(row.fail_count) > PUSH_FAIL_LIMIT) continue;
      const payload = buildPushPayload(type, roomId, row.lang);
      const result = await deliver(row, payload);
      if (result.ok) {
        await markSuccess(row.id);
        sent += 1;
        continue;
      }
      const outcome = await applyPushDeliveryResult(row.id, result.statusCode);
      if (result.statusCode) {
        console.error('[mmc] push delivery failed status', result.statusCode, outcome);
      }
    }
    return { sent };
  } catch (error) {
    console.error('[mmc] push delivery error', error?.code || error?.message || 'unknown');
    return { sent: 0 };
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
function limiter(max, windowMs, keyGenerator, message) {
  return rateLimit({
    windowMs,
    max: RATE_LIMIT_DISABLED ? 1_000_000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler(req, res) {
      const reset = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : 0;
      const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;
      res.status(429).json({ ok: false, code: 'RATE_LIMITED', retryAfter, message });
    },
  });
}

function jsonSizeGuard(req, res, next) {
  const headerLength = Number(req.get('content-length') || 0);
  if (Number.isFinite(headerLength) && headerLength > 4096) {
    return res.status(413).json({ ok: false, code: 'BODY_TOO_LARGE' });
  }
  try {
    if (JSON.stringify(req.body || {}).length > 4096) {
      return res.status(413).json({ ok: false, code: 'BODY_TOO_LARGE' });
    }
  } catch {
    return res.status(400).json({ ok: false, code: 'INVALID_JSON' });
  }
  next();
}

export function installPush(app) {
  const router = express.Router();
  router.use(csrfJsonGuard);

  const subscribeLimiter = limiter(
    20,
    60 * 60 * 1000,
    (req) => req.ip,
    'push-subscribe'
  );
  const testDeviceLimiter = limiter(
    3,
    60 * 60 * 1000,
    (req) => `device:${String(req.body?.deviceId || '')}`,
    'push-test'
  );
  const testIpLimiter = limiter(10, 60 * 60 * 1000, (req) => req.ip, 'push-test-ip');

  router.post('/push/subscribe', jsonSizeGuard, subscribeLimiter, async (req, res) => {
    const valid = validatePushSubscription(req.body);
    if (!valid.ok) return res.status(400).json({ ok: false, code: valid.code });
    if (!pushEnabled) return res.status(503).json({ ok: false, code: 'PUSH_DISABLED' });
    try {
      const saved = await savePushSubscription({
        deviceId: valid.deviceId,
        endpoint: valid.endpoint,
        p256dh: valid.p256dh,
        auth: valid.auth,
        lang: valid.lang,
        userId: req.user?.id || null,
      });
      return res.json({ ok: true, created: saved.created });
    } catch (error) {
      console.error('[mmc] push subscribe failed', error?.code || error?.message || 'db');
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/push/unsubscribe', jsonSizeGuard, async (req, res) => {
    const deviceId = req.body?.deviceId;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ ok: false, code: 'INVALID_DEVICE_ID' });
    }
    const rawEndpoint = req.body?.endpoint;
    let endpoint = null;
    if (rawEndpoint !== undefined && rawEndpoint !== null && rawEndpoint !== '') {
      endpoint = validatePushEndpoint(rawEndpoint);
      if (!endpoint) return res.status(400).json({ ok: false, code: INVALID_PUSH_ENDPOINT });
    }
    try {
      const removed = await deletePushSubscription(deviceId, endpoint);
      return res.json({ ok: true, removed });
    } catch (error) {
      console.error('[mmc] push unsubscribe failed', error?.code || error?.message || 'db');
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/push/test', jsonSizeGuard, testDeviceLimiter, testIpLimiter, async (req, res) => {
    const deviceId = req.body?.deviceId;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ ok: false, code: 'INVALID_DEVICE_ID' });
    }
    if (!pushEnabled) return res.status(503).json({ ok: false, code: 'PUSH_DISABLED' });
    try {
      const found = await query(
        'SELECT COUNT(*) AS total FROM push_subscriptions WHERE device_id = ? AND fail_count <= ?',
        [deviceId, PUSH_FAIL_LIMIT]
      );
      if (!Number(found.rows[0]?.total)) {
        return res.status(404).json({ ok: false, code: 'NO_SUBSCRIPTION' });
      }
      const timer = setTimeout(() => {
        void sendPushToDevice(deviceId, 'test', null);
      }, TEST_DELAY_MS);
      timer.unref?.();
      return res.json({ ok: true, scheduled: true, delayMs: TEST_DELAY_MS });
    } catch (error) {
      console.error('[mmc] push test failed', error?.code || error?.message || 'db');
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  if (!IS_PROD && PROVIDER === 'test') {
    router.get('/__test__/push-outbox', (req, res) => {
      const since = Number(req.query.since) || 0;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, items: getTestPushOutbox(since) });
    });
  }

  app.use('/api', router);
  return router;
}

/** Chi dung trong test Node de tao endpoint/p256dh/auth hop le. */
export function makeTestSubscription(overrides = {}) {
  return {
    deviceId: overrides.deviceId || `qa_${crypto.randomBytes(8).toString('hex')}`,
    endpoint:
      overrides.endpoint || `https://fcm.googleapis.com/fcm/send/${crypto.randomBytes(12).toString('hex')}`,
    p256dh:
      overrides.p256dh ||
      Buffer.concat([Buffer.from([4]), crypto.randomBytes(64)]).toString('base64url'),
    auth: overrides.auth || crypto.randomBytes(16).toString('base64url'),
    lang: overrides.lang || 'vi',
    userId: overrides.userId || null,
  };
}
