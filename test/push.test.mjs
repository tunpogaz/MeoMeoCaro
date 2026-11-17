/**
 * Web Push: chong SSRF, kiem tra body, gioi han thiet bi/tai khoan, gui theo
 * dieu kien hien tab, han muc 20 giay, don dep 404/410, thong bao thu va
 * thong tin dang nhap (lien ket khi dang xuat, xoa khi xoa tai khoan).
 *
 * Phan don vi chay truc tiep tren SQLite tam; phan HTTP/socket spawn server
 * that voi PUSH_PROVIDER=test (hop thu gia trong bo nho).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const summary = { pass: 0, fail: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ---------------------------------------------------------------------------
// Phan don vi: import push.js truc tiep voi SQLite tam
// ---------------------------------------------------------------------------
const unitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-push-unit-'));
const unitDb = path.join(unitDir, 'unit.db');
process.env.NODE_ENV = 'test';
process.env.PUSH_PROVIDER = 'test';
process.env.DATABASE_FILE = unitDb;
process.env.DISABLE_RATE_LIMIT = '1';

const db = await import('../db.js');
await db.migrate();
const push = await import('../push.js');

function validBody(overrides = {}) {
  const sub = push.makeTestSubscription(overrides);
  return {
    deviceId: sub.deviceId,
    lang: sub.lang,
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
  };
}

function unitSub(overrides = {}) {
  return push.makeTestSubscription(overrides);
}

async function unitCount(deviceId) {
  const result = await db.query(
    'SELECT COUNT(*) AS total FROM push_subscriptions WHERE device_id = ?',
    [deviceId]
  );
  return Number(result.rows[0]?.total || 0);
}

// ---------------------------------------------------------------------------
// Phan HTTP/socket
// ---------------------------------------------------------------------------
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, proc, readLogs) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early\n${readLogs()}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      /* chua len */
    }
    await sleep(80);
  }
  throw new Error(`server did not become healthy\n${readLogs()}`);
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-push-test-'));
  const dbFile = path.join(tmpDir, 'test.db');
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_FILE: dbFile,
      PUSH_PROVIDER: 'test',
      PUSH_TEST_DELAY_MS: '60',
      PUSH_GRACE_MS: '120',
      PUSH_MIN_INTERVAL_MS: '5000',
      DISABLE_RATE_LIMIT: '0',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  try {
    await waitForHealth(port, proc, () => output);
  } catch (err) {
    console.error('startServer failed', { port, exitCode: proc.exitCode, output });
    proc.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
  return { port, proc, dbFile, tmpDir, logs: () => output };
}

function stopServer(server) {
  return new Promise((resolve) => {
    const cleanup = () => {
      if (server?.tmpDir) fs.rmSync(server.tmpDir, { recursive: true, force: true });
      resolve();
    };
    if (!server?.proc || server.proc.exitCode !== null) {
      cleanup();
      return;
    }
    const timer = setTimeout(() => server.proc.kill('SIGKILL'), 3000);
    server.proc.once('exit', () => {
      clearTimeout(timer);
      cleanup();
    });
    server.proc.kill('SIGTERM');
  });
}

function setCookies(res) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')];
  return list.filter(Boolean).map((item) => item.split(';')[0]);
}

async function api(server, method, apiPath, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.origin !== false) headers.Origin = `http://127.0.0.1:${server.port}`;
  if (options.cookie) headers.Cookie = options.cookie;
  const res = await fetch(`http://127.0.0.1:${server.port}${apiPath}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const cookies = setCookies(res);
  return { status: res.status, data, text, cookies, cookie: cookies.join('; ') };
}

async function subscribe(server, overrides = {}, cookie) {
  const sub = unitSub(overrides);
  const res = await api(server, 'POST', '/api/push/subscribe', {
    body: {
      deviceId: sub.deviceId,
      lang: sub.lang,
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
    },
    cookie,
  });
  return { sub, res };
}

async function outbox(server, since = 0) {
  const res = await api(server, 'GET', `/api/__test__/push-outbox?since=${since}`);
  assert.equal(res.status, 200);
  return res.data.items;
}

function connect(port) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function request(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), timeout);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function closeSocket(socket) {
  if (socket?.connected) socket.disconnect();
}

async function waitFor(predicate, label, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(30);
  }
  throw new Error(`timeout: ${label}`);
}

// ---------------------------------------------------------------------------
// Don vi
// ---------------------------------------------------------------------------
await test('SSRF: chi chap nhan https va host push da biet', () => {
  const good = [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://foo.push.services.mozilla.com/x',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=x',
  ];
  for (const value of good) assert.ok(push.validatePushEndpoint(value), value);

  const bad = [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://localhost/x',
    'https://foo.local/x',
    'https://foo.internal/x',
    'https://evil.example/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com:8443/x',
    'https://10.1.2.3/x',
    '',
    `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
  ];
  for (const value of bad) assert.equal(push.validatePushEndpoint(value), null, value);
});

await test('body subscribe: tu choi deviceId/lang/khoa sai', () => {
  assert.equal(push.validatePushSubscription(validBody()).ok, true);

  const badDevice = validBody();
  badDevice.deviceId = 'short';
  assert.equal(push.validatePushSubscription(badDevice).code, 'INVALID_DEVICE_ID');

  const badChars = validBody();
  badChars.deviceId = 'bad id with spaces';
  assert.equal(push.validatePushSubscription(badChars).code, 'INVALID_DEVICE_ID');

  const badLang = validBody();
  badLang.lang = 'fr';
  assert.equal(push.validatePushSubscription(badLang).code, 'INVALID_LANG');

  const badEndpoint = validBody();
  badEndpoint.subscription.endpoint = 'https://evil.example/x';
  assert.equal(push.validatePushSubscription(badEndpoint).code, push.INVALID_PUSH_ENDPOINT);

  const shortKey = validBody();
  shortKey.subscription.keys.p256dh = crypto.randomBytes(64).toString('base64url');
  assert.equal(push.validatePushSubscription(shortKey).code, 'INVALID_PUSH_KEYS');

  const shortAuth = validBody();
  shortAuth.subscription.keys.auth = crypto.randomBytes(15).toString('base64url');
  assert.equal(push.validatePushSubscription(shortAuth).code, 'INVALID_PUSH_KEYS');
});

await test('payload khong chua ten nguoi choi va dung VI/EN', () => {
  const vi = push.buildPushPayload('turn', 'ABCDE', 'vi');
  const en = push.buildPushPayload('turn', 'ABCDE', 'en');
  assert.equal(vi.title, 'Meo Meo Caro');
  assert.match(vi.body, /Đến lượt bạn/);
  assert.match(en.body, /your turn/i);
  assert.equal(vi.roomId, 'ABCDE');
  assert.equal(vi.type, 'turn');
  const json = JSON.stringify(vi);
  assert.ok(!/name|player|avatar/i.test(json));
});

await test('moi thiet bi toi da 5 subscription, cai cu nhat bi xoa', async () => {
  const deviceId = `qa_limit_${crypto.randomBytes(6).toString('hex')}`;
  const ids = [];
  for (let i = 0; i < 6; i += 1) {
    const sub = unitSub({ deviceId, lang: i % 2 ? 'en' : 'vi' });
    const saved = await push.savePushSubscription(sub);
    ids.push(saved.id);
    await sleep(2);
  }
  assert.equal(await unitCount(deviceId), push.MAX_DEVICE_SUBSCRIPTIONS);
  const first = await db.query('SELECT id FROM push_subscriptions WHERE id = ?', [ids[0]]);
  assert.equal(first.rows.length, 0);
  const last = await db.query('SELECT id FROM push_subscriptions WHERE id = ?', [ids[5]]);
  assert.equal(last.rows.length, 1);
});

await test('dang ky lai cung endpoint cap nhat ngon ngu, khong tang so dong', async () => {
  const sub = unitSub();
  const first = await push.savePushSubscription(sub);
  const second = await push.savePushSubscription({ ...sub, lang: 'en' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.id, first.id);
  assert.equal(await unitCount(sub.deviceId), 1);
  const row = await db.query('SELECT lang FROM push_subscriptions WHERE id = ?', [first.id]);
  assert.equal(row.rows[0].lang, 'en');
});

await test('sendPushToDevice gui moi subscription dung ngon ngu, outbox khong lo khoa', async () => {
  push.clearTestPushOutbox();
  const deviceId = `qa_send_${crypto.randomBytes(6).toString('hex')}`;
  await push.savePushSubscription(unitSub({ deviceId, lang: 'vi' }));
  await push.savePushSubscription(unitSub({ deviceId, lang: 'en' }));
  const result = await push.sendPushToDevice(deviceId, 'turn', 'ABCDE');
  assert.equal(result.sent, 2);
  const items = push.getTestPushOutbox();
  assert.equal(items.length, 2);
  assert.ok(items.some((item) => /Đến lượt bạn/.test(item.body)));
  assert.ok(items.some((item) => /your turn/i.test(item.body)));
  const serialized = JSON.stringify(items);
  assert.ok(!serialized.includes('https://'));
  assert.ok(!/p256dh|auth/.test(serialized));
});

await test('410/404 xoa ngay; loi khac tang fail_count va xoa sau 5 lan', async () => {
  const gone = await push.savePushSubscription(unitSub({ deviceId: 'qa_gone_410' }));
  assert.equal(await push.applyPushDeliveryResult(gone.id, 410), 'deleted');
  assert.equal(await unitCount('qa_gone_410'), 0);

  const gone404 = await push.savePushSubscription(unitSub({ deviceId: 'qa_gone_404' }));
  assert.equal(await push.applyPushDeliveryResult(gone404.id, 404), 'deleted');
  assert.equal(await unitCount('qa_gone_404'), 0);

  const failing = await push.savePushSubscription(unitSub({ deviceId: 'qa_fail_device' }));
  for (let i = 1; i <= push.PUSH_FAIL_LIMIT; i += 1) {
    assert.equal(await push.applyPushDeliveryResult(failing.id, 500), 'failed');
    assert.equal(await unitCount('qa_fail_device'), 1);
  }
  assert.equal(await push.applyPushDeliveryResult(failing.id, 500), 'deleted');
  assert.equal(await unitCount('qa_fail_device'), 0);
});

await test('cleanup xoa subscription cu 60 ngay hoac fail_count qua nguong', async () => {
  const stale = await push.savePushSubscription(unitSub({ deviceId: 'qa_cleanup_old' }));
  const failing = await push.savePushSubscription(unitSub({ deviceId: 'qa_cleanup_fail' }));
  const fresh = await push.savePushSubscription(unitSub({ deviceId: 'qa_cleanup_fresh' }));
  const old = Date.now() - push.PUSH_STALE_MS - 1000;
  await db.query('UPDATE push_subscriptions SET created_at = ? WHERE id = ?', [old, stale.id]);
  await db.query('UPDATE push_subscriptions SET fail_count = ? WHERE id = ?', [
    push.PUSH_FAIL_LIMIT + 1,
    failing.id,
  ]);
  await push.cleanupPushSubscriptions();
  assert.equal(await unitCount('qa_cleanup_old'), 0);
  assert.equal(await unitCount('qa_cleanup_fail'), 0);
  assert.equal(await unitCount('qa_cleanup_fresh'), 1);
});

// ---------------------------------------------------------------------------
// HTTP + socket
// ---------------------------------------------------------------------------
const server = await startServer();
let deviceCounter = 0;
function freshDevice(prefix = 'qa_dev') {
  deviceCounter += 1;
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}_${deviceCounter}`;
}

await test('config tra pushEnabled, vapidPublicKey; thieu VAPID thi tat', async () => {
  const config = await api(server, 'GET', '/api/config');
  assert.equal(config.data.pushEnabled, true);
  assert.ok(config.data.vapidPublicKey.length > 40);

  const off = await startServer({ PUSH_PROVIDER: '' });
  try {
    const res = await api(off, 'GET', '/api/config');
    assert.equal(res.data.pushEnabled, false);
    assert.equal(res.data.vapidPublicKey, null);
    assert.match(off.logs(), /thông báo đẩy đang tắt/);
  } finally {
    await stopServer(off);
  }
});

await test('subscribe tu choi endpoint noi bo va body sai; nhan body hop le', async () => {
  const body = validBody({ deviceId: freshDevice() });
  body.subscription.endpoint = 'https://127.0.0.1/x';
  const bad = await api(server, 'POST', '/api/push/subscribe', { body });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, push.INVALID_PUSH_ENDPOINT);

  const noLang = validBody({ deviceId: freshDevice() });
  noLang.lang = 'xx';
  const wrong = await api(server, 'POST', '/api/push/subscribe', { body: noLang });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.code, 'INVALID_LANG');

  const valid = validBody({ deviceId: freshDevice() });
  const ok = await api(server, 'POST', '/api/push/subscribe', { body: valid });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  assert.equal(ok.data.created, true);
});

await test('thong bao thu: chua co subscription 404; co thi hen gui dung ngon ngu', async () => {
  const missing = await api(server, 'POST', '/api/push/test', {
    body: { deviceId: freshDevice('qa_missing') },
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.data.code, 'NO_SUBSCRIPTION');

  const deviceId = freshDevice('qa_testpush');
  await subscribe(server, { deviceId, lang: 'vi' });
  const since = Date.now() - 1000;
  const scheduled = await api(server, 'POST', '/api/push/test', { body: { deviceId } });
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.data.scheduled, true);

  await waitFor(async () => (await outbox(server, since)).some((item) => item.type === 'test'), 'test push');
  const items = (await outbox(server, since)).filter((item) => item.type === 'test');
  assert.equal(items.length, 1);
  assert.equal(items[0].deviceId, deviceId);
  assert.match(items[0].body, /Thông báo thử/);
});

await test('rate limit /api/push/test: 3 lan/thiet bi/gio', async () => {
  const deviceId = freshDevice('qa_ratetest');
  await subscribe(server, { deviceId });
  const codes = [];
  for (let i = 0; i < 4; i += 1) {
    const res = await api(server, 'POST', '/api/push/test', { body: { deviceId } });
    codes.push(res.status);
  }
  assert.deepEqual(codes.slice(0, 3), [200, 200, 200]);
  const blocked = await api(server, 'POST', '/api/push/test', { body: { deviceId } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.code, 'RATE_LIMITED');
});

await test('push luot: chi gui khi nguoi nhan an tab, khong gui cho nguoi vua danh', async () => {
  const deviceA = freshDevice('qa_sockA');
  const deviceB = freshDevice('qa_sockB');
  await subscribe(server, { deviceId: deviceA, lang: 'vi' });
  await subscribe(server, { deviceId: deviceB, lang: 'vi' });

  const a = await connect(server.port);
  const b = await connect(server.port);
  try {
    const created = await request(a, 'room:create', {
      name: 'A',
      avatar: 'orange',
      size: 3,
      deviceId: deviceA,
    });
    assert.equal(created.ok, true);
    const roomId = created.roomId;
    const joined = await request(b, 'room:join', {
      roomId,
      name: 'B',
      avatar: 'gray',
      deviceId: deviceB,
    });
    assert.equal(joined.ok, true);

    // Nguoi di truoc duoc chon ngau nhien: an tab nguoi dang cho luot.
    const first = joined.state.turn;
    const mover = first === 'A' ? a : b;
    const waiter = first === 'A' ? b : a;
    const waiterDevice = first === 'A' ? deviceB : deviceA;

    const presence = await request(waiter, 'presence:set', { roomId, visible: false });
    assert.equal(presence.ok, true);
    const since = Date.now() - 1000;
    const move = await request(mover, 'game:move', { roomId, index: 0 });
    assert.equal(move.ok, true, JSON.stringify(move));

    await waitFor(
      async () => (await outbox(server, since)).some((item) => item.type === 'turn'),
      'turn push'
    );
    const turnItems = (await outbox(server, since)).filter((item) => item.type === 'turn');
    assert.equal(turnItems.length, 1);
    assert.equal(turnItems[0].deviceId, waiterDevice);
    assert.equal(turnItems[0].roomId, roomId);
    assert.match(turnItems[0].body, /Đến lượt bạn/);

    // Nguoi cho hien lai tab va danh: doi thu dang hien nen khong co push.
    const shown = await request(waiter, 'presence:set', { roomId, visible: true });
    assert.equal(shown.ok, true);
    const beforeVisible = (await outbox(server, since)).length;
    const second = await request(waiter, 'game:move', { roomId, index: 1 });
    assert.equal(second.ok, true, JSON.stringify(second));
    await sleep(400);
    assert.equal((await outbox(server, since)).length, beforeVisible);
  } finally {
    closeSocket(a);
    closeSocket(b);
  }
});

await test('push luot: toi da mot thong bao trong 500 ms cho cung nguoi nhan', async () => {
  const deviceA = freshDevice('qa_gateA');
  const deviceB = freshDevice('qa_gateB');
  await subscribe(server, { deviceId: deviceA });
  await subscribe(server, { deviceId: deviceB });

  const a = await connect(server.port);
  const b = await connect(server.port);
  try {
    const created = await request(a, 'room:create', {
      name: 'A',
      avatar: 'orange',
      size: 3,
      deviceId: deviceA,
    });
    const roomId = created.roomId;
    const joined = await request(b, 'room:join', {
      roomId,
      name: 'B',
      avatar: 'gray',
      deviceId: deviceB,
    });
    const first = joined.state.turn;
    const mover = first === 'A' ? a : b;
    const waiter = first === 'A' ? b : a;
    const waiterDevice = first === 'A' ? deviceB : deviceA;
    const presence = await request(waiter, 'presence:set', { roomId, visible: false });
    assert.equal(presence.ok, true);
    const since = Date.now() - 1000;

    await request(mover, 'game:move', { roomId, index: 0 });
    await waitFor(
      async () => (await outbox(server, since)).filter((item) => item.type === 'turn').length === 1,
      'first turn push'
    );

    await request(waiter, 'game:move', { roomId, index: 1 });
    await request(mover, 'game:move', { roomId, index: 2 });
    await sleep(450);
    const count = (await outbox(server, since)).filter(
      (item) => item.type === 'turn' && item.deviceId === waiterDevice
    ).length;
    assert.equal(count, 1);
  } finally {
    closeSocket(a);
    closeSocket(b);
  }
});

await test('push join: chu phong dang an tab duoc nhac khi ban vao', async () => {
  const deviceHost = freshDevice('qa_joinhost');
  const deviceGuest = freshDevice('qa_joinguest');
  await subscribe(server, { deviceId: deviceHost });

  const host = await connect(server.port);
  const guest = await connect(server.port);
  try {
    const created = await request(host, 'room:create', {
      name: 'Host',
      avatar: 'orange',
      size: 3,
      deviceId: deviceHost,
    });
    const roomId = created.roomId;
    const presence = await request(host, 'presence:set', { roomId, visible: false });
    assert.equal(presence.ok, true);
    const since = Date.now() - 1000;

    await request(guest, 'room:join', {
      roomId,
      name: 'Guest',
      avatar: 'gray',
      deviceId: deviceGuest,
    });
    await waitFor(
      async () => (await outbox(server, since)).some((item) => item.type === 'join'),
      'join push'
    );
    const items = (await outbox(server, since)).filter((item) => item.type === 'join');
    assert.equal(items.length, 1);
    assert.equal(items[0].deviceId, deviceHost);
    assert.match(items[0].body, /Bạn bè đã vào phòng/);
  } finally {
    closeSocket(host);
    closeSocket(guest);
  }
});

await test('dang xuat bo lien ket tai khoan nhung giu subscription', async () => {
  const username = `pushuser_${crypto.randomBytes(4).toString('hex')}`;
  const password = 'MeowStrong123!';
  const reg = await api(server, 'POST', '/api/auth/register', {
    body: { username, displayName: username, password, email: '', remember: true },
  });
  assert.equal(reg.status, 201, reg.text);
  const deviceId = freshDevice('qa_logout');
  const saved = await subscribe(server, { deviceId }, reg.cookie);
  assert.equal(saved.res.status, 200);

  const dbh = new DatabaseSync(server.dbFile);
  const before = dbh
    .prepare('SELECT user_id, lang FROM push_subscriptions WHERE device_id = ?')
    .get(deviceId);
  assert.ok(before.user_id);

  const out = await api(server, 'POST', '/api/auth/logout', {
    body: { deviceId },
    cookie: reg.cookie,
  });
  assert.equal(out.status, 200);
  await sleep(50);
  const after = dbh
    .prepare('SELECT user_id, lang FROM push_subscriptions WHERE device_id = ?')
    .get(deviceId);
  assert.equal(after.user_id, null);
  assert.equal(after.lang, 'vi');
  dbh.close();
});

await test('xoa tai khoan xoa subscription cua thiet bi trong cung transaction', async () => {
  const username = `pushdel_${crypto.randomBytes(4).toString('hex')}`;
  const password = 'MeowStrong123!';
  const reg = await api(server, 'POST', '/api/auth/register', {
    body: { username, displayName: username, password, email: '', remember: true },
  });
  assert.equal(reg.status, 201, reg.text);
  const deviceId = freshDevice('qa_delete');
  await subscribe(server, { deviceId }, reg.cookie);

  const dbh = new DatabaseSync(server.dbFile);
  assert.ok(
    dbh.prepare('SELECT id FROM push_subscriptions WHERE device_id = ?').get(deviceId)
  );
  const deleted = await api(server, 'DELETE', '/api/me', {
    body: { password },
    cookie: reg.cookie,
  });
  assert.equal(deleted.status, 200, deleted.text);
  assert.equal(
    dbh.prepare('SELECT id FROM push_subscriptions WHERE device_id = ?').get(deviceId),
    undefined
  );
  dbh.close();
});

await test('log server khong chua endpoint hay khoa push', async () => {
  const logs = server.logs();
  assert.ok(!logs.includes('fcm.googleapis.com'));
  assert.ok(!logs.includes('p256dh'));
  assert.ok(!/https:\/\/[a-z0-9.-]*push/i.test(logs));
});

// ---------------------------------------------------------------------------
// Ket thuc
// ---------------------------------------------------------------------------
await stopServer(server);
await db.closeDatabase();
fs.rmSync(unitDir, { recursive: true, force: true });

console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
process.exit(summary.fail ? 1 : 0);
