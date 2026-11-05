/**
 * Email verification, forgot/reset password, change email, account deletion
 * cleanup, PUBLIC_URL links, token hashing and rate limits.
 * Each suite spawns a real server with an isolated SQLite file. MAIL_PROVIDER=test
 * exposes an in-memory outbox only in non-production test runs.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_URL = 'https://caro.example.test';
const PASSWORD = 'MeowStrong123!';
const NEW_PASSWORD = 'MeowReset456!';
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
      /* not listening yet */
    }
    await sleep(80);
  }
  throw new Error(`server did not become healthy\n${readLogs()}`);
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-reset-test-'));
  const dbFile = path.join(tmpDir, 'test.db');
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_FILE: dbFile,
      DISABLE_RATE_LIMIT: '1',
      MAIL_PROVIDER: 'test',
      PUBLIC_URL,
      MAIL_FROM: 'Meo Meo Caro <no-reply@caro.example.test>',
      RESET_TOKEN_MINUTES: '30',
      VERIFY_TOKEN_HOURS: '24',
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
  if (options.headers) Object.assign(headers, options.headers);
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
  return {
    status: res.status,
    data,
    text,
    cookies,
    cookie: cookies.join('; '),
    cacheControl: res.headers.get('cache-control'),
    referrerPolicy: res.headers.get('referrer-policy'),
  };
}

async function register(server, username, email, password = PASSWORD, extra = {}) {
  return api(server, 'POST', '/api/auth/register', {
    body: {
      username,
      displayName: username,
      password,
      email,
      remember: true,
      ...extra,
    },
  });
}

async function login(server, username, password = PASSWORD) {
  return api(server, 'POST', '/api/auth/login', {
    body: { username, password, remember: true },
  });
}

async function outbox(server) {
  const res = await api(server, 'GET', '/api/__test__/outbox', { origin: false });
  return res.data?.items || [];
}

async function waitForMail(server, predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const items = await outbox(server);
    const matches = items.filter(predicate);
    if (matches.length) return matches[matches.length - 1];
    await sleep(50);
  }
  throw new Error('mail not found in test outbox');
}

function tokenFrom(mail, kind) {
  const match = String(mail?.text || '').match(new RegExp(`#${kind}=([A-Za-z0-9_-]+)`));
  return match ? match[1] : null;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function dbRows(dbFile, sql, params = []) {
  const db = new DatabaseSync(dbFile);
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function dbRun(dbFile, sql, params = []) {
  const db = new DatabaseSync(dbFile);
  try {
    db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Main suite
// ---------------------------------------------------------------------------
const main = await startServer({ CORS_ORIGIN: PUBLIC_URL });

try {
  await test('config exposes mailEnabled and auth responses are no-store', async () => {
    const config = await api(main, 'GET', '/api/config');
    assert.equal(config.status, 200);
    assert.equal(config.data.mailEnabled, true);
    const me = await api(main, 'GET', '/api/auth/me');
    assert.equal(me.cacheControl, 'no-store');
  });

  let alpha = null;
  const alphaEmail = 'Alpha.Cat@Example.COM';
  const alphaNormalized = 'alpha.cat@example.com';

  await test('register with email sends a verification mail (token only by mail)', async () => {
    alpha = await register(main, 'reset_alpha', alphaEmail);
    assert.equal(alpha.status, 201, alpha.text);
    assert.equal(alpha.data.mailSent, true);
    assert.ok(alpha.data.user.emailMasked.startsWith('a***@'));
    assert.equal(alpha.data.user.emailVerified, false);
    assert.equal(alpha.data.user.hasPendingEmail, true);
    assert.ok(!alpha.text.includes('@example.com') || alpha.text.includes('a***@'));
    const mail = await waitForMail(main, (item) => item.to === alphaNormalized);
    assert.match(mail.subject, /Xác thực email/);
    const token = tokenFrom(mail, 'verify');
    assert.ok(token && token.length >= 40);
    assert.ok(!alpha.text.includes(token));
    // DB chi luu SHA-256 cua token.
    const rows = dbRows(main.dbFile, 'SELECT token_hash FROM email_verifications');
    assert.ok(rows.some((row) => row.token_hash === sha256(token)));
    assert.ok(rows.every((row) => row.token_hash !== token));
    assert.ok(!main.logs().includes(token));
    const me = await api(main, 'GET', '/api/auth/me', { cookie: alpha.cookie });
    assert.equal(me.data.user.emailMasked, 'a***@example.com');
    assert.equal(me.data.user.emailVerified, false);
  });

  await test('verify email rejects bad tokens and succeeds once', async () => {
    const bad = await api(main, 'POST', '/api/auth/verify-email', {
      body: { token: 'not-a-real-token-but-long-enough-1234' },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'VERIFY_TOKEN_INVALID');
    const mail = await waitForMail(main, (item) => item.to === alphaNormalized);
    const token = tokenFrom(mail, 'verify');
    const ok = await api(main, 'POST', '/api/auth/verify-email', { body: { token } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.data.emailMasked, 'a***@example.com');
    const reused = await api(main, 'POST', '/api/auth/verify-email', { body: { token } });
    assert.equal(reused.status, 400);
    assert.equal(reused.data.code, 'VERIFY_TOKEN_INVALID');
    const me = await api(main, 'GET', '/api/auth/me', { cookie: alpha.cookie });
    assert.equal(me.data.user.emailVerified, true);
    assert.equal(me.data.user.hasPendingEmail, false);
    assert.ok(!me.text.includes(alphaNormalized));
  });

  await test('verify email link is built from PUBLIC_URL, never Host', async () => {
    const mail = await waitForMail(main, (item) => item.to === alphaNormalized);
    assert.ok(mail.text.includes(`${PUBLIC_URL}/#verify=`));
    assert.ok(!mail.text.includes('evil.example'));
    const forged = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: alphaNormalized },
      headers: { Host: 'evil.example', Origin: PUBLIC_URL },
    });
    assert.equal(forged.status, 200);
    const resetMail = await waitForMail(
      main,
      (item) => item.to === alphaNormalized && /Đặt lại mật khẩu/.test(item.subject),
      5000
    );
    assert.ok(resetMail.text.includes(`${PUBLIC_URL}/#reset=`));
    assert.ok(!resetMail.text.includes('evil.example'));
  });

  await test('forgot-password is generic for unknown, unverified, deleted and messy emails', async () => {
    const before = await outbox(main);
    const unknown = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: 'nobody@example.com' },
    });
    const unverified = await register(main, 'reset_unverified', 'unverified@example.com');
    assert.equal(unverified.status, 201);
    const unverifiedForgot = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: 'unverified@example.com' },
    });
    const deletedUser = await register(main, 'reset_deleted', 'deleted@example.com');
    await api(main, 'DELETE', '/api/me', {
      cookie: deletedUser.cookie,
      body: { password: PASSWORD },
    });
    const deletedForgot = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: 'deleted@example.com' },
    });
    const messy = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: '   ALPHA.CAT@example.com  ' },
    });
    for (const res of [unknown, unverifiedForgot, deletedForgot, messy]) {
      assert.equal(res.status, 200);
      assert.deepEqual(res.data, { ok: true });
    }
    const after = await outbox(main);
    const resetCount = (items) => items.filter((item) => String(item.text).includes('#reset=')).length;
    // Chi email da xac thuc cua alpha (viet hoa + khoang trang) moi nhan thu dat lai.
    assert.equal(resetCount(after) - resetCount(before), 1);
  });

  const alphaReset = await waitForMail(
    main,
    (item) => item.to === alphaNormalized && /Đặt lại mật khẩu —/.test(item.subject),
    5000
  );
  const firstResetToken = tokenFrom(alphaReset, 'reset');

  await test('reset check validates the token without leaking the user', async () => {
    const valid = await api(main, 'POST', '/api/auth/reset-password/check', {
      body: { token: firstResetToken },
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.data.valid, true);
    assert.equal(valid.data.user, undefined);
    const invalid = await api(main, 'POST', '/api/auth/reset-password/check', {
      body: { token: 'x'.repeat(43) },
    });
    assert.equal(invalid.data.valid, false);
    assert.ok(!JSON.stringify(invalid.data).includes(alphaNormalized));
  });

  await test('weak password is rejected and leaves the reset token usable', async () => {
    const weak = await api(main, 'POST', '/api/auth/reset-password', {
      body: { token: firstResetToken, newPassword: '12345678' },
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.data.code, 'WEAK_PASSWORD');
    const check = await api(main, 'POST', '/api/auth/reset-password/check', {
      body: { token: firstResetToken },
    });
    assert.equal(check.data.valid, true);
  });

  let secondSession = null;

  await test('reset password invalidates old sessions and sends a notification mail', async () => {
    secondSession = await login(main, 'reset_alpha');
    assert.equal(secondSession.status, 200);
    const beforeMails = (await outbox(main)).length;
    const reset = await api(main, 'POST', '/api/auth/reset-password', {
      body: { token: firstResetToken, newPassword: NEW_PASSWORD },
    });
    assert.equal(reset.status, 200, reset.text);
    assert.equal(reset.data.ok, true);
    const oldSession = await api(main, 'GET', '/api/auth/me', { cookie: secondSession.cookie });
    assert.equal(oldSession.data.user, null);
    const oldLogin = await login(main, 'reset_alpha', PASSWORD);
    assert.equal(oldLogin.status, 401);
    const newLogin = await login(main, 'reset_alpha', NEW_PASSWORD);
    assert.equal(newLogin.status, 200);
    const notice = await waitForMail(
      main,
      (item) => item.to === alphaNormalized && /Mật khẩu đã thay đổi/.test(item.subject),
      5000
    );
    assert.ok(!notice.text.includes(NEW_PASSWORD));
    assert.ok(!notice.text.includes(NEW_PASSWORD));
    assert.equal((await outbox(main)).length, beforeMails + 1);
    const reused = await api(main, 'POST', '/api/auth/reset-password', {
      body: { token: firstResetToken, newPassword: 'AnotherStrong789!' },
    });
    assert.equal(reused.status, 400);
    assert.equal(reused.data.code, 'RESET_TOKEN_INVALID');
  });

  await test('a new reset request invalidates the previous token', async () => {
    const first = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: alphaNormalized },
    });
    assert.equal(first.data.ok, true);
    const mail1 = await waitForMail(
      main,
      (item) => item.to === alphaNormalized && /Đặt lại mật khẩu/.test(item.subject) && item.text
    );
    const token1 = tokenFrom(mail1, 'reset');
    const second = await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: alphaNormalized },
    });
    assert.equal(second.data.ok, true);
    await sleep(100);
    const mails = (await outbox(main)).filter(
      (item) => item.to === alphaNormalized && /Đặt lại mật khẩu/.test(item.subject)
    );
    const token2 = tokenFrom(mails[mails.length - 1], 'reset');
    assert.notEqual(token1, token2);
    const stale = await api(main, 'POST', '/api/auth/reset-password/check', {
      body: { token: token1 },
    });
    assert.equal(stale.data.valid, false);
    const fresh = await api(main, 'POST', '/api/auth/reset-password/check', {
      body: { token: token2 },
    });
    assert.equal(fresh.data.valid, true);
  });

  await test('two simultaneous reset attempts: exactly one succeeds', async () => {
    await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: alphaNormalized },
    });
    await sleep(80);
    const mails = (await outbox(main)).filter(
      (item) => item.to === alphaNormalized && /Đặt lại mật khẩu/.test(item.subject)
    );
    const token = tokenFrom(mails[mails.length - 1], 'reset');
    const [first, second] = await Promise.all([
      api(main, 'POST', '/api/auth/reset-password', {
        body: { token, newPassword: 'ParallelStrong111!' },
      }),
      api(main, 'POST', '/api/auth/reset-password', {
        body: { token, newPassword: 'ParallelStrong222!' },
      }),
    ]);
    const codes = [first, second].map((res) => (res.status === 200 ? 'ok' : res.data?.code));
    assert.equal(codes.filter((code) => code === 'ok').length, 1);
    assert.equal(codes.filter((code) => code === 'RESET_TOKEN_INVALID').length, 1);
  });

  await test('expired reset token is rejected with RESET_TOKEN_EXPIRED', async () => {
    await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: alphaNormalized },
    });
    await sleep(80);
    const mails = (await outbox(main)).filter(
      (item) => item.to === alphaNormalized && /Đặt lại mật khẩu/.test(item.subject)
    );
    const token = tokenFrom(mails[mails.length - 1], 'reset');
    dbRun(main.dbFile, 'UPDATE password_resets SET expires_at = ? WHERE token_hash = ?', [
      Date.now() - 1000,
      sha256(token),
    ]);
    const check = await api(main, 'POST', '/api/auth/reset-password/check', {
      body: { token },
    });
    assert.equal(check.data.valid, false);
    const reset = await api(main, 'POST', '/api/auth/reset-password', {
      body: { token, newPassword: 'ExpiredStrong333!' },
    });
    assert.equal(reset.status, 410);
    assert.equal(reset.data.code, 'RESET_TOKEN_EXPIRED');
  });

  await test('expired verification token is rejected', async () => {
    const created = await register(main, 'reset_verify_expired', 'verify-expired@example.com');
    assert.equal(created.status, 201);
    const mail = await waitForMail(main, (item) => item.to === 'verify-expired@example.com');
    const token = tokenFrom(mail, 'verify');
    dbRun(main.dbFile, 'UPDATE email_verifications SET expires_at = ? WHERE token_hash = ?', [
      Date.now() - 1000,
      sha256(token),
    ]);
    const res = await api(main, 'POST', '/api/auth/verify-email', { body: { token } });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'VERIFY_TOKEN_INVALID');
  });

  await test('email validation rejects newlines and malformed addresses', async () => {
    const newline = await register(main, 'reset_bad_email', 'bad@example.com\nBcc: x@y.com');
    assert.equal(newline.status, 400);
    assert.equal(newline.data.code, 'EMAIL_INVALID');
    const double = await register(main, 'reset_bad_email2', 'a@@example.com');
    assert.equal(double.data.code, 'EMAIL_INVALID');
    const tooLong = await register(main, 'reset_bad_email3', `${'a'.repeat(250)}@x.com`);
    assert.equal(tooLong.data.code, 'EMAIL_INVALID');
    const missing = await register(main, 'reset_no_email', '');
    assert.equal(missing.status, 400);
    assert.equal(missing.data.code, 'EMAIL_REQUIRED');
  });

  await test('two accounts may hold the same unverified email; second verify gets EMAIL_TAKEN', async () => {
    const one = await register(main, 'reset_dup_one', 'dup@example.com');
    const two = await register(main, 'reset_dup_two', 'dup@example.com');
    assert.equal(one.status, 201);
    assert.equal(two.status, 201);
    const mails = await outbox(main);
    const tokens = mails
      .filter((item) => item.to === 'dup@example.com')
      .map((item) => tokenFrom(item, 'verify'))
      .filter(Boolean);
    const firstToken = tokens[0];
    const secondToken = tokens[tokens.length - 1];
    const first = await api(main, 'POST', '/api/auth/verify-email', { body: { token: firstToken } });
    assert.equal(first.status, 200);
    const second = await api(main, 'POST', '/api/auth/verify-email', { body: { token: secondToken } });
    assert.equal(second.status, 409);
    assert.equal(second.data.code, 'EMAIL_TAKEN');
  });

  await test('change email keeps the old address until the new one is verified', async () => {
    const created = await register(main, 'reset_change', 'old@example.com');
    assert.equal(created.status, 201);
    const oldMail = await waitForMail(main, (item) => item.to === 'old@example.com');
    await api(main, 'POST', '/api/auth/verify-email', {
      body: { token: tokenFrom(oldMail, 'verify') },
    });
    const wrong = await api(main, 'POST', '/api/me/email', {
      cookie: created.cookie,
      body: { email: 'new@example.com', currentPassword: 'WrongPassword1!' },
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.code, 'WRONG_PASSWORD');
    const changed = await api(main, 'POST', '/api/me/email', {
      cookie: created.cookie,
      body: { email: 'new@example.com', currentPassword: PASSWORD, lang: 'en' },
    });
    assert.equal(changed.status, 200, changed.text);
    assert.equal(changed.data.user.hasPendingEmail, true);
    assert.equal(changed.data.user.emailMasked, 'o***@example.com');
    assert.equal(changed.data.user.pendingEmailMasked, 'n***@example.com');
    const oldNotice = await waitForMail(
      main,
      (item) => item.to === 'old@example.com' && /Email change requested/.test(item.subject)
    );
    assert.match(oldNotice.subject, /Email change requested/);
    const newVerification = await waitForMail(
      main,
      (item) => item.to === 'new@example.com' && /Verify your email/.test(item.subject)
    );
    assert.ok(newVerification.text.includes(`${PUBLIC_URL}/#verify=`));
    // Email cu van nhan thu khoi phuc truoc khi xac thuc email moi.
    await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: 'old@example.com' },
    });
    const oldReset = await waitForMail(
      main,
      (item) => item.to === 'old@example.com' && /Đặt lại mật khẩu/.test(item.subject)
    );
    assert.ok(tokenFrom(oldReset, 'reset'));
    const verified = await api(main, 'POST', '/api/auth/verify-email', {
      body: { token: tokenFrom(newVerification, 'verify') },
    });
    assert.equal(verified.status, 200, verified.text);
    const afterMail = (await outbox(main)).length;
    await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: 'old@example.com' },
    });
    await sleep(150);
    assert.equal((await outbox(main)).length, afterMail);
    const me = await api(main, 'GET', '/api/auth/me', { cookie: created.cookie });
    assert.equal(me.data.user.emailVerified, true);
    assert.equal(me.data.user.emailMasked, 'n***@example.com');
  });

  await test('resend verification invalidates the previous token and sends a new one', async () => {
    const created = await register(main, 'reset_resend', 'resend@example.com');
    assert.equal(created.status, 201);
    const first = await waitForMail(main, (item) => item.to === 'resend@example.com');
    const firstToken = tokenFrom(first, 'verify');
    const resend = await api(main, 'POST', '/api/me/email/resend', {
      cookie: created.cookie,
      body: { lang: 'vi' },
    });
    assert.equal(resend.status, 200, resend.text);
    const deadline = Date.now() + 3000;
    let items = [];
    while (Date.now() < deadline) {
      items = (await outbox(main)).filter((item) => item.to === 'resend@example.com');
      if (items.length >= 2) break;
      await sleep(50);
    }
    const newToken = tokenFrom(items[items.length - 1], 'verify');
    assert.notEqual(firstToken, newToken);
    const stale = await api(main, 'POST', '/api/auth/verify-email', {
      body: { token: firstToken },
    });
    assert.equal(stale.data.code, 'VERIFY_TOKEN_INVALID');
    const fresh = await api(main, 'POST', '/api/auth/verify-email', {
      body: { token: newToken },
    });
    assert.equal(fresh.status, 200);
    // DB chi co hash, khong co token tho.
    const rows = dbRows(main.dbFile, 'SELECT token_hash FROM email_verifications');
    assert.ok(rows.every((row) => row.token_hash !== newToken));
    assert.ok(!main.logs().includes(newToken));
    assert.ok(!main.logs().includes(firstToken));
  });

  await test('delete account anonymizes match snapshots and clears tokens/email', async () => {
    const victim = await register(main, 'reset_victim', 'victim@example.com');
    assert.equal(victim.status, 201);
    const opponent = await register(main, 'reset_opponent', 'opponent@example.com');
    assert.equal(opponent.status, 201);
    const victimMail = await waitForMail(main, (item) => item.to === 'victim@example.com');
    await api(main, 'POST', '/api/auth/verify-email', {
      body: { token: tokenFrom(victimMail, 'verify') },
    });
    await api(main, 'POST', '/api/auth/forgot-password', {
      body: { email: 'victim@example.com' },
    });
    await waitForMail(
      main,
      (item) => item.to === 'victim@example.com' && /Đặt lại mật khẩu/.test(item.subject)
    );
    const matchId = crypto.randomUUID();
    const now = Date.now();
    dbRun(
      main.dbFile,
      `INSERT INTO matches (
        id, room_code, size, win_length, player_a_user_id, player_b_user_id,
        player_a_name, player_b_name, player_a_avatar, player_b_avatar,
        first_player, result, end_reason, win_line, moves, total_moves, started_at, ended_at
      ) VALUES (?, 'AAAAA', '3', 3, ?, ?, 'Tên Gốc Bí Mật', 'Đối Thủ', 'orange', 'gray',
        'A', 'A', 'win', NULL, '[{"i":0,"s":"A"}]', 1, ?, ?)`,
      [matchId, victim.data.user.id, opponent.data.user.id, now - 1000, now]
    );
    const removed = await api(main, 'DELETE', '/api/me', {
      cookie: victim.cookie,
      body: { password: PASSWORD },
    });
    assert.equal(removed.status, 200);
    const rows = dbRows(main.dbFile, 'SELECT * FROM matches WHERE id = ?', [matchId]);
    assert.equal(rows[0].player_a_name, 'Người chơi đã xóa');
    assert.ok(!JSON.stringify(rows[0]).includes('Tên Gốc Bí Mật'));
    const userRows = dbRows(
      main.dbFile,
      'SELECT email, email_verified_at, pending_email FROM users WHERE id = ?',
      [victim.data.user.id]
    );
    assert.equal(userRows[0].email, null);
    assert.equal(userRows[0].email_verified_at, null);
    assert.equal(userRows[0].pending_email, null);
    assert.equal(
      dbRows(main.dbFile, 'SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?', [
        victim.data.user.id,
      ])[0].n,
      0
    );
    assert.equal(
      dbRows(main.dbFile, 'SELECT COUNT(*) AS n FROM email_verifications WHERE user_id = ?', [
        victim.data.user.id,
      ])[0].n,
      0
    );
    // Doi thu van xem duoc lich su binh thuong.
    const history = await api(main, 'GET', '/api/history', { cookie: opponent.cookie });
    assert.equal(history.status, 200);
    const item = history.data.items.find((entry) => entry.id === matchId);
    assert.ok(item);
    assert.equal(item.opponent.name, 'Người chơi đã xóa');
    const detail = await api(main, 'GET', `/api/history/${matchId}`, {
      cookie: opponent.cookie,
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.match.players.A.name, 'Người chơi đã xóa');
    assert.equal(detail.data.match.players.B.name, 'Đối Thủ');
  });

  await test('no reset/verify token appears in logs or API responses', async () => {
    const logs = main.logs();
    for (const token of [firstResetToken]) {
      assert.ok(!logs.includes(token));
    }
    const resetMailText = (await outbox(main))
      .filter((item) => /Đặt lại mật khẩu/.test(item.subject))
      .map((item) => tokenFrom(item, 'reset'))
      .filter(Boolean);
    assert.ok(resetMailText.length > 0);
    for (const token of resetMailText) {
      assert.ok(!logs.includes(token));
    }
    assert.ok(!logs.includes('RESET_TOKEN'));
    assert.ok(!logs.includes('SMTP_PASS'));
  });
} finally {
  await stopServer(main);
}

// ---------------------------------------------------------------------------
// Rate limits (separate server with real limits)
// ---------------------------------------------------------------------------
const limited = await startServer({ DISABLE_RATE_LIMIT: '0' });

try {
  await test('forgot-password limit: 3 mails/email/hour, 5 requests/IP/hour', async () => {
    const created = await register(limited, 'rate_user', 'rate@example.com');
    assert.equal(created.status, 201);
    const mail = await waitForMail(limited, (item) => item.to === 'rate@example.com');
    await api(limited, 'POST', '/api/auth/verify-email', {
      body: { token: tokenFrom(mail, 'verify') },
    });
    const before = (await outbox(limited)).length;
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await api(limited, 'POST', '/api/auth/forgot-password', {
        body: { email: 'rate@example.com' },
      });
      statuses.push(res.status);
    }
    assert.equal(statuses[5], 429);
    const after = (await outbox(limited)).length;
    assert.equal(after - before, 3);
  });

  await test('resend verification is limited to 3/hour/account', async () => {
    const created = await register(limited, 'rate_resend', 'rate-resend@example.com');
    assert.equal(created.status, 201);
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await api(limited, 'POST', '/api/me/email/resend', {
        cookie: created.cookie,
        body: {},
      });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 3), [200, 200, 200]);
    assert.equal(statuses[3], 429);
  });
} finally {
  await stopServer(limited);
}

// ---------------------------------------------------------------------------
// Mail disabled: server still starts, endpoints stay generic
// ---------------------------------------------------------------------------
const noMail = await startServer({ MAIL_PROVIDER: '', PUBLIC_URL: '' });

try {
  await test('without a mail provider config reports false and registration email is optional', async () => {
    const config = await api(noMail, 'GET', '/api/config');
    assert.equal(config.data.mailEnabled, false);
    const created = await register(noMail, 'no_mail_user', '');
    assert.equal(created.status, 201, created.text);
    assert.equal(created.data.mailSent, false);
    const forgot = await api(noMail, 'POST', '/api/auth/forgot-password', {
      body: { email: 'someone@example.com' },
    });
    assert.deepEqual(forgot.data, { ok: true });
    assert.match(noMail.logs(), /mail warning:/);
    assert.match(noMail.logs(), /tính năng thư đang tắt/);
  });
} finally {
  await stopServer(noMail);
}

console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail) process.exitCode = 1;
