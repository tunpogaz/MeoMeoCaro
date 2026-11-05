/**
 * Tai khoan, phien dang nhap va bao mat API.
 * Mat khau: scrypt (N=2^15, r=8, p=1, key 64 byte), salt 16 byte.
 * Phien: token 32 byte trong cookie httpOnly, DB chi luu SHA-256 cua token.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { newId, query, transaction, isUniqueViolation } from './db.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const COOKIE_NAME = 'mmc_sid';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) > 0 ? Number(process.env.SESSION_DAYS) : 30;
const SHORT_SESSION_DAYS = 7;
const IS_PROD = process.env.NODE_ENV === 'production';
const RATE_LIMIT_DISABLED = process.env.DISABLE_RATE_LIMIT === '1';
const MAX_DISPLAY = 12;
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'matkhau123',
  'matkhau1234',
  'abc12345',
  '11111111',
  '00000000',
  'iloveyou',
  'admin123',
  'meomeocaro',
]);

export const AVATARS = new Set(['orange', 'gray', 'calico', 'black', 'cream', 'tabby']);

const DUMMY_SALT = Buffer.from('9e1c9c12f1f04a9d8f6b1f4a0f1f8d2c', 'hex');

function fakePasswordWork(password) {
  return scrypt(String(password || ''), DUMMY_SALT, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (N !== SCRYPT.N || r !== SCRYPT.r || p !== SCRYPT.p) return false;
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!salt.length || !expected.length) return false;
  const derived = await scrypt(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT.maxmem,
  });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, MAX_DISPLAY).join('');
}

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

function validUsername(username) {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

function passwordProblem(password, username) {
  if (typeof password !== 'string') return 'INVALID_PASSWORD';
  const length = Array.from(password).length;
  if (length < 8 || length > 72) return 'WEAK_PASSWORD';
  if (password.toLowerCase() === username) return 'WEAK_PASSWORD';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'WEAK_PASSWORD';
  return null;
}

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    try {
      out[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      out[key] = part.slice(index + 1).trim();
    }
  }
  return out;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    createdAt: Number(row.created_at),
    lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
  };
}

function userAgentOf(req) {
  return String(req.get('user-agent') || '').slice(0, 200);
}

async function createSession(res, userId, remember, req) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const days = remember === false ? SHORT_SESSION_DAYS : SESSION_DAYS;
  const now = Date.now();
  const expires = now + days * 24 * 60 * 60 * 1000;
  await query(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sha256(raw), userId, now, expires, now, userAgentOf(req)]
  );
  res.cookie(COOKIE_NAME, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
    maxAge: days * 24 * 60 * 60 * 1000,
  });
  return raw;
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
  });
}

/** Tra ve user tu cookie phien; dong thoi cap nhat last_seen (toi da 1 gio/lan). */
export async function resolveSessionUser(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length < 20) return null;
  const tokenHash = sha256(rawToken);
  const result = await query(
    `SELECT s.expires_at, s.last_seen_at, u.id, u.username, u.display_name, u.avatar,
            u.created_at, u.last_login_at, u.deleted_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return null;
  const now = Date.now();
  if (Number(row.expires_at) <= now || row.deleted_at !== null) {
    await query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    return null;
  }
  if (now - Number(row.last_seen_at) > 60 * 60 * 1000) {
    await query('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', [now, tokenHash]);
  }
  return publicUser(row);
}

/** Doc cookie tu handshake Socket.IO (khong tin ten/ID client gui). */
export async function userFromCookieHeader(cookieHeader) {
  const token = parseCookies(cookieHeader)[COOKIE_NAME];
  return resolveSessionUser(token);
}

export function installAuth(app) {
  app.use(async (req, _res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      req.user = await resolveSessionUser(token);
      req.sessionToken = token || null;
    } catch (error) {
      req.user = null;
      req.sessionToken = null;
      console.error('[mmc] session lookup failed', error.message);
    }
    next();
  });

  const router = express.Router();

  // Chong CSRF: moi thay doi du lieu phai la JSON va Origin/Host cung origin.
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    const type = String(req.get('content-type') || '').toLowerCase();
    if (!type.startsWith('application/json')) {
      return res.status(415).json({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    }
    const origin = req.get('origin');
    if (!origin) {
      return res.status(403).json({ ok: false, code: 'CSRF_REJECTED' });
    }
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = '';
    }
    const allowed = new Set(
      String(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          try {
            return new URL(item).host;
          } catch {
            return '';
          }
        })
        .filter(Boolean)
    );
    if (!originHost || (originHost !== req.get('host') && !allowed.has(originHost))) {
      return res.status(403).json({ ok: false, code: 'CSRF_REJECTED' });
    }
    next();
  });

  const limiter = (max, windowMs, keyGenerator, message) =>
    rateLimit({
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

  const registerLimiter = limiter(5, 60 * 60 * 1000, (req) => req.ip, 'register');
  const loginUserLimiter = limiter(
    10,
    15 * 60 * 1000,
    (req) => `${req.ip}:${normalizeUsername(req.body?.username)}`,
    'login'
  );
  const loginIpLimiter = limiter(50, 15 * 60 * 1000, (req) => req.ip, 'login');

  router.post('/auth/register', registerLimiter, async (req, res) => {
    try {
      const username = normalizeUsername(req.body?.username);
      if (!validUsername(username)) {
        return res.status(400).json({ ok: false, code: 'INVALID_USERNAME' });
      }
      const problem = passwordProblem(req.body?.password, username);
      if (problem) {
        return res.status(400).json({ ok: false, code: problem });
      }
      const rawAvatar = req.body?.avatar;
      if (rawAvatar !== undefined && !AVATARS.has(rawAvatar)) {
        return res.status(400).json({ ok: false, code: 'INVALID_AVATAR' });
      }
      const avatar = AVATARS.has(rawAvatar) ? rawAvatar : 'orange';
      const displayName =
        sanitizeDisplayName(req.body?.displayName) ||
        sanitizeDisplayName(username) ||
        'Mèo Con';
      const id = newId();
      const now = Date.now();
      const hash = await hashPassword(req.body.password);
      try {
        await query(
          `INSERT INTO users (id, username, display_name, password_hash, avatar, created_at, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, username, displayName, hash, avatar, now, now]
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          return res.status(409).json({ ok: false, code: 'USERNAME_TAKEN' });
        }
        throw error;
      }
      await createSession(res, id, req.body?.remember, req);
      return res.status(201).json({
        ok: true,
        user: { id, username, displayName, avatar, createdAt: now, lastLoginAt: now },
      });
    } catch (error) {
      console.error('[mmc] register failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/auth/login', loginUserLimiter, loginIpLimiter, async (req, res) => {
    try {
      const username = normalizeUsername(req.body?.username);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const result = await query(
        `SELECT id, username, display_name, password_hash, avatar, created_at, last_login_at, deleted_at
           FROM users WHERE username = ?`,
        [username]
      );
      const row = result.rows[0];
      if (!row || row.deleted_at !== null) {
        await fakePasswordWork(password);
        return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS' });
      }
      const ok = await verifyPassword(password, row.password_hash);
      if (!ok) {
        return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS' });
      }
      const now = Date.now();
      await query('UPDATE users SET last_login_at = ? WHERE id = ?', [now, row.id]);
      await createSession(res, row.id, req.body?.remember, req);
      return res.json({
        ok: true,
        user: {
          id: row.id,
          username: row.username,
          displayName: row.display_name,
          avatar: row.avatar,
          createdAt: Number(row.created_at),
          lastLoginAt: now,
        },
      });
    } catch (error) {
      console.error('[mmc] login failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/auth/logout', async (req, res) => {
    try {
      if (req.sessionToken) {
        await query('DELETE FROM sessions WHERE token_hash = ?', [sha256(req.sessionToken)]);
      }
      clearSessionCookie(res);
      return res.json({ ok: true });
    } catch (error) {
      console.error('[mmc] logout failed', error.message);
      clearSessionCookie(res);
      return res.json({ ok: true });
    }
  });

  router.get('/auth/me', (req, res) => {
    res.json({ ok: true, user: req.user || null });
  });

  function requireUser(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
    }
    next();
  }

  router.patch('/me', requireUser, async (req, res) => {
    try {
      const updates = [];
      const params = [];
      if (req.body?.displayName !== undefined) {
        const name = sanitizeDisplayName(req.body.displayName);
        if (!name) return res.status(400).json({ ok: false, code: 'INVALID_DISPLAY_NAME' });
        updates.push('display_name = ?');
        params.push(name);
      }
      if (req.body?.avatar !== undefined) {
        if (!AVATARS.has(req.body.avatar)) {
          return res.status(400).json({ ok: false, code: 'INVALID_AVATAR' });
        }
        updates.push('avatar = ?');
        params.push(req.body.avatar);
      }
      if (!updates.length) {
        return res.status(400).json({ ok: false, code: 'NOTHING_TO_UPDATE' });
      }
      params.push(req.user.id);
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      const result = await query(
        `SELECT id, username, display_name, avatar, created_at, last_login_at
           FROM users WHERE id = ?`,
        [req.user.id]
      );
      return res.json({ ok: true, user: publicUser(result.rows[0]) });
    } catch (error) {
      console.error('[mmc] profile update failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/me/password', requireUser, async (req, res) => {
    try {
      const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      const result = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const row = result.rows[0];
      if (!row || !(await verifyPassword(current, row.password_hash))) {
        return res.status(400).json({ ok: false, code: 'WRONG_PASSWORD' });
      }
      const problem = passwordProblem(next, req.user.username);
      if (problem) {
        return res.status(400).json({ ok: false, code: problem });
      }
      const hash = await hashPassword(next);
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
      if (req.sessionToken) {
        await query('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [
          req.user.id,
          sha256(req.sessionToken),
        ]);
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('[mmc] password change failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.delete('/me', requireUser, async (req, res) => {
    try {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const result = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const row = result.rows[0];
      if (!row || !(await verifyPassword(password, row.password_hash))) {
        return res.status(400).json({ ok: false, code: 'WRONG_PASSWORD' });
      }
      const anonymous = `deleted_${req.user.id}`;
      const now = Date.now();
      const anonymousHash = await hashPassword(crypto.randomUUID());
      await transaction(async (tx) => {
        await tx.query('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
        await tx.query(
          `UPDATE users SET username = ?, display_name = ?, deleted_at = ?, password_hash = ?
             WHERE id = ?`,
          [anonymous, 'Người chơi đã xóa', now, anonymousHash, req.user.id]
        );
      });
      clearSessionCookie(res);
      return res.json({ ok: true });
    } catch (error) {
      console.error('[mmc] account delete failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  app.use('/api', router);
}

/** Doc user tu cookie cho Socket.IO handshake. */
export function readCookieTokenFromSocket(socket) {
  return parseCookies(socket.handshake?.headers?.cookie)[COOKIE_NAME] || null;
}

export { COOKIE_NAME, parseCookies };
