/**
 * Auth API tests: register/login/logout/session cookie/profile/password/delete,
 * CSRF, rate limiting, migrations and production session-secret guard.
 * Each suite spawns a real server process with an isolated SQLite file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

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
      // not listening yet
    }
    await sleep(80);
  }
  throw new Error(`server did not become healthy\n${readLogs()}`);
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-auth-test-'));
  const dbFile = path.join(tmpDir, 'test.db');
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_FILE: dbFile,
      DISABLE_RATE_LIMIT: '1',
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

function cookiesFrom(res) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')];
  return list.filter(Boolean);
}

function cookieHeader(res) {
  return cookiesFrom(res)
    .map((item) => item.split(';')[0])
    .join('; ');
}

async function api(server, method, apiPath, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.contentType) headers['Content-Type'] = options.contentType;
  if (options.origin !== false) headers.Origin = `http://127.0.0.1:${server.port}`;
  if (options.cookie) headers.Cookie = options.cookie;
  Object.assign(headers, options.headers || {});
  const res = await fetch(`http://127.0.0.1:${server.port}${apiPath}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, res, cookie: cookieHeader(res), setCookies: cookiesFrom(res) };
}

const PASSWORD = 'MeowStrong123!';

async function register(server, username, extra = {}) {
  const res = await api(server, 'POST', '/api/auth/register', {
    body: {
      username,
      password: PASSWORD,
      displayName: extra.displayName || 'Mèo Test',
      avatar: extra.avatar || 'calico',
      remember: extra.remember,
    },
  });
  return res;
}

async function login(server, username, password = PASSWORD, remember = true) {
  return api(server, 'POST', '/api/auth/login', {
    body: { username, password, remember },
  });
}

const main = await startServer();

try {
  await test('register creates an account and sets an httpOnly session cookie', async () => {
    const res = await register(main, 'Meo_Alpha', { displayName: 'Mèo Alpha' });
    assert.equal(res.status, 201);
    assert.equal(res.data.ok, true);
    assert.equal(res.data.user.username, 'meo_alpha');
    assert.equal(res.data.user.displayName, 'Mèo Alpha');
    assert.equal(res.data.user.avatar, 'calico');
    assert.equal(res.data.user.password_hash, undefined);
    const cookie = res.setCookies.find((item) => item.startsWith('mmc_sid='));
    assert.ok(cookie, 'missing session cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
    assert.match(cookie, /Max-Age=2592000/i);
  });

  await test('short sessions expire in 7 days when remember is false', async () => {
    const res = await register(main, 'Meo_Short', { remember: false });
    assert.equal(res.status, 201);
    const cookie = res.setCookies.find((item) => item.startsWith('mmc_sid='));
    assert.match(cookie, /Max-Age=604800/i);
  });

  await test('invalid usernames and weak passwords are rejected with codes', async () => {
    for (const username of ['ab', 'has space', 'bad-dash', 'x'.repeat(21)]) {
      const res = await register(main, username);
      assert.equal(res.status, 400, username);
      assert.equal(res.data.code, 'INVALID_USERNAME', username);
    }
    for (const password of ['short', 'password123', 'Meo_Weak']) {
      const res = await api(main, 'POST', '/api/auth/register', {
        body: { username: 'Meo_Weak', password, displayName: 'Mèo Yếu' },
      });
      assert.equal(res.status, 400, password);
      assert.equal(res.data.code, 'WEAK_PASSWORD', password);
    }
  });

  await test('username uniqueness is case-insensitive', async () => {
    const res = await register(main, 'MEO_ALPHA');
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'USERNAME_TAKEN');
  });

  await test('login is generic for unknown users and wrong passwords', async () => {
    const unknown = await login(main, 'meo_nobody');
    assert.equal(unknown.status, 401);
    assert.equal(unknown.data.code, 'INVALID_CREDENTIALS');
    const wrong = await login(main, 'meo_alpha', 'WrongPassword123!');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.code, 'INVALID_CREDENTIALS');
  });

  await test('login works and /me returns the session user', async () => {
    const res = await login(main, 'MEO_ALPHA');
    assert.equal(res.status, 200);
    assert.ok(res.cookie.startsWith('mmc_sid='));
    const me = await api(main, 'GET', '/api/auth/me', { cookie: res.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.username, 'meo_alpha');
    assert.equal(me.data.user.password_hash, undefined);
    const anonymous = await api(main, 'GET', '/api/auth/me');
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.data.user, null);
  });

  await test('CSRF middleware rejects missing Origin and non-JSON bodies', async () => {
    const noOrigin = await api(main, 'POST', '/api/auth/login', {
      origin: false,
      body: { username: 'meo_alpha', password: PASSWORD },
    });
    assert.equal(noOrigin.status, 403);
    assert.equal(noOrigin.data.code, 'CSRF_REJECTED');
    const wrongType = await api(main, 'POST', '/api/auth/login', {
      contentType: 'text/plain',
      body: { username: 'meo_alpha', password: PASSWORD },
    });
    assert.equal(wrongType.status, 415);
    assert.equal(wrongType.data.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  await test('profile updates display name and avatar only', async () => {
    const session = await login(main, 'meo_alpha');
    const patch = await api(main, 'PATCH', '/api/me', {
      cookie: session.cookie,
      body: { displayName: 'Mèo Đổi Tên', avatar: 'tabby', id: 'hacker' },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.data.user.displayName, 'Mèo Đổi Tên');
    assert.equal(patch.data.user.avatar, 'tabby');
    assert.equal(patch.data.user.id, session.data.user.id);
    const empty = await api(main, 'PATCH', '/api/me', { cookie: session.cookie, body: {} });
    assert.equal(empty.status, 400);
    assert.equal(empty.data.code, 'NOTHING_TO_UPDATE');
  });

  await test('password change invalidates other sessions but keeps the current one', async () => {
    const first = await login(main, 'meo_alpha');
    const second = await login(main, 'meo_alpha');
    assert.notEqual(first.cookie, second.cookie);
    const changed = await api(main, 'POST', '/api/me/password', {
      cookie: first.cookie,
      body: { currentPassword: PASSWORD, newPassword: 'MeowStrong456!' },
    });
    assert.equal(changed.status, 200);
    const oldSession = await api(main, 'GET', '/api/auth/me', { cookie: second.cookie });
    assert.equal(oldSession.status, 200);
    assert.equal(oldSession.data.user, null);
    const stillHere = await api(main, 'GET', '/api/auth/me', { cookie: first.cookie });
    assert.equal(stillHere.data.user.username, 'meo_alpha');
    const oldPassword = await login(main, 'meo_alpha', PASSWORD);
    assert.equal(oldPassword.status, 401);
    const newPassword = await login(main, 'meo_alpha', 'MeowStrong456!');
    assert.equal(newPassword.status, 200);
  });

  await test('expired sessions are rejected and removed', async () => {
    const fresh = await login(main, 'meo_alpha', 'MeowStrong456!');
    const rawToken = decodeURIComponent(fresh.cookie.split('=').slice(1).join('='));
    const db = new DatabaseSync(main.dbFile);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE username = 'meo_alpha')")
      .run(Date.now() - 1000);
    db.close();
    const me = await api(main, 'GET', '/api/auth/me', { cookie: fresh.cookie });
    assert.equal(me.data.user, null);
    assert.ok(rawToken.length > 20);
  });

  await test('logout clears the cookie and invalidates the session', async () => {
    const session = await login(main, 'meo_alpha', 'MeowStrong456!');
    const out = await api(main, 'POST', '/api/auth/logout', { cookie: session.cookie, body: {} });
    assert.equal(out.status, 200);
    const cleared = out.setCookies.find((item) => item.startsWith('mmc_sid='));
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
    const me = await api(main, 'GET', '/api/auth/me', { cookie: session.cookie });
    assert.equal(me.data.user, null);
  });

  await test('delete account anonymizes the user and invalidates every session', async () => {
    const created = await register(main, 'Meo_Delete', { displayName: 'Mèo Xóa' });
    assert.equal(created.status, 201);
    const userId = created.data.user.id;
    const session = await login(main, 'meo_delete');
    const wrong = await api(main, 'DELETE', '/api/me', {
      cookie: session.cookie,
      body: { password: 'WrongPassword123!' },
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.code, 'WRONG_PASSWORD');
    const removed = await api(main, 'DELETE', '/api/me', {
      cookie: session.cookie,
      body: { password: PASSWORD },
    });
    assert.equal(removed.status, 200);
    const me = await api(main, 'GET', '/api/auth/me', { cookie: session.cookie });
    assert.equal(me.data.user, null);
    const relogin = await login(main, 'meo_delete');
    assert.equal(relogin.status, 401);
    const db = new DatabaseSync(main.dbFile);
    const row = db.prepare('SELECT username, display_name, deleted_at FROM users WHERE id = ?').get(userId);
    db.close();
    assert.ok(row.deleted_at);
    assert.equal(row.display_name, 'Người chơi đã xóa');
    assert.match(row.username, /^deleted_/);
  });
} finally {
  await stopServer(main);
}

// ---------------------------------------------------------------------------
// Rate limiting (separate server so the main suite stays fast)
// ---------------------------------------------------------------------------
const limited = await startServer({ DISABLE_RATE_LIMIT: '0' });

try {
  await test('login is rate limited per IP and username', async () => {
    let last = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      last = await login(limited, 'meo_limited', 'WrongPassword123!');
    }
    assert.equal(last.status, 429);
    assert.equal(last.data.code, 'RATE_LIMITED');
    assert.ok(last.data.retryAfter >= 1);
  });
} finally {
  await stopServer(limited);
}

// ---------------------------------------------------------------------------
// Migrations and production guard
// ---------------------------------------------------------------------------
await test('migrations are idempotent and run from the CLI', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-migrate-test-'));
  const dbFile = path.join(tmpDir, 'migrate.db');
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_FILE: dbFile, DATABASE_URL: '' };
  for (let run = 0; run < 2; run += 1) {
    const proc = spawn(process.execPath, ['scripts/migrate.js'], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    const code = await new Promise((resolve) => proc.once('exit', resolve));
    assert.equal(code, 0, output);
  }
  const db = new DatabaseSync(dbFile);
  const migrations = db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get();
  const users = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  const matches = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='matches'").get();
  const verifications = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_verifications'").get();
  const resets = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='password_resets'").get();
  db.close();
  assert.equal(migrations.total, 2);
  assert.ok(users);
  assert.ok(matches);
  assert.ok(verifications);
  assert.ok(resets);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

await test('production refuses to start without a strong SESSION_SECRET', async () => {
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-prod-test-'));
  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    SESSION_SECRET: '',
    DATABASE_FILE: path.join(tmpDir, 'prod.db'),
    DATABASE_URL: '',
  };
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve('timeout');
    }, 5000);
    proc.once('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert.notEqual(code, 0);
  assert.match(output, /SESSION_SECRET/);
});

console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail > 0) process.exitCode = 1;
