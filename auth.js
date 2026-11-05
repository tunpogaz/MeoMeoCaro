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
import {
  actionLink,
  emailChangeNoticeMail,
  mailEnabled,
  passwordChangedMail,
  passwordResetMail,
  resetTokenMinutes,
  sendMail,
  verificationMail,
  verifyTokenHours,
} from './mailer.js';

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
const DELETED_PLAYER_NAME = 'Người chơi đã xóa';
const RESET_TTL_MS = resetTokenMinutes * 60 * 1000;
const VERIFY_TTL_MS = verifyTokenHours * 60 * 60 * 1000;
const EMAIL_MAX_LENGTH = 254;
const FORGOT_EMAIL_MAX = 3;
const FORGOT_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const forgotEmailHits = new Map();

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

/**
 * Chuan hoa va kiem tra email: chu thuong, <=254 ky tu, dung mot @,
 * ten mien co dau cham, khong co khoang trang/ky tu dieu khien/xuong dong.
 * Tra ve null neu khong hop le.
 */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value || value.length > EMAIL_MAX_LENGTH) return null;
  if (/[\u0000-\u001F\u007F\s]/.test(value)) return null;
  if ((value.match(/@/g) || []).length !== 1) return null;
  const [local, domain] = value.split('@');
  if (!local || local.length > 64) return null;
  if (!domain || domain.length > 253 || !domain.includes('.')) return null;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) return null;
  return value;
}

function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 1) return null;
  const local = Array.from(value.slice(0, at));
  const head = local[0] || '*';
  return `${head}***${value.slice(at)}`;
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

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function safeToken(raw) {
  if (typeof raw !== 'string') return null;
  return /^[A-Za-z0-9_-]{20,200}$/.test(raw) ? raw : null;
}

function langOf(raw) {
  return raw === 'en' ? 'en' : 'vi';
}

function mailTime(lang) {
  try {
    return new Date().toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date().toISOString();
  }
}

function queueMail(message) {
  // sendMail khong bao gio nem; chay nen de thoi gian phan hoi khong lo thong tin.
  void sendMail(message);
}

export async function issueResetToken(userId) {
  const raw = newToken();
  const now = Date.now();
  await transaction(async (tx) => {
    await tx.query('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [userId]);
    await tx.query(
      `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [newId(), userId, sha256(raw), now, now + RESET_TTL_MS]
    );
  });
  return raw;
}

async function issueVerificationToken(userId, email) {
  const raw = newToken();
  const now = Date.now();
  await transaction(async (tx) => {
    await tx.query('DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL', [userId]);
    await tx.query(
      `INSERT INTO email_verifications (id, user_id, email, token_hash, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [newId(), userId, email, sha256(raw), now, now + VERIFY_TTL_MS]
    );
  });
  return raw;
}

async function queueVerificationMail({ userId, email, username, lang }) {
  const token = await issueVerificationToken(userId, email);
  const link = actionLink('verify', token);
  if (!link) return false;
  const mail = verificationMail({ lang, link, username, hours: verifyTokenHours });
  queueMail({ ...mail, to: email });
  return true;
}

function allowForgotEmail(email) {
  if (RATE_LIMIT_DISABLED) return true;
  const now = Date.now();
  const hits = (forgotEmailHits.get(email) || []).filter((at) => now - at < FORGOT_EMAIL_WINDOW_MS);
  if (hits.length >= FORGOT_EMAIL_MAX) {
    forgotEmailHits.set(email, hits);
    return false;
  }
  hits.push(now);
  forgotEmailHits.set(email, hits);
  if (forgotEmailHits.size > 5000) {
    for (const [key, times] of forgotEmailHits) {
      if (!times.some((at) => now - at < FORGOT_EMAIL_WINDOW_MS)) forgotEmailHits.delete(key);
    }
  }
  return true;
}

async function userEmailRow(userId) {
  const result = await query(
    `SELECT id, username, email, email_verified_at, pending_email
       FROM users WHERE id = ? AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0] || null;
}

function publicUser(row) {
  if (!row) return null;
  const verifiedEmail = row.email || null;
  const shownEmail = verifiedEmail || row.pending_email || null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    createdAt: Number(row.created_at),
    lastLoginAt: row.last_login_at === null ? null : Number(row.last_login_at),
    emailMasked: shownEmail ? maskEmail(shownEmail) : null,
    pendingEmailMasked: row.pending_email ? maskEmail(row.pending_email) : null,
    emailVerified: Boolean(verifiedEmail && row.email_verified_at !== null),
    hasPendingEmail: Boolean(row.pending_email),
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
            u.created_at, u.last_login_at, u.deleted_at,
            u.email, u.email_verified_at, u.pending_email
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

  // API tai khoan khong duoc cache (link/token chi nam trong fragment phia client).
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

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
  const forgotIpLimiter = limiter(5, 60 * 60 * 1000, (req) => req.ip, 'forgot');
  const resetIpLimiter = limiter(10, 15 * 60 * 1000, (req) => req.ip, 'reset');
  const resetCheckLimiter = limiter(10, 15 * 60 * 1000, (req) => req.ip, 'reset-check');
  const verifyIpLimiter = limiter(20, 15 * 60 * 1000, (req) => req.ip, 'verify-email');
  const resendLimiter = limiter(3, 60 * 60 * 1000, (req) => req.user?.id || req.ip, 'email-resend');
  const changeEmailLimiter = limiter(5, 60 * 60 * 1000, (req) => req.user?.id || req.ip, 'email-change');

  router.get('/config', (_req, res) => {
    res.json({ ok: true, mailEnabled });
  });

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
      const rawEmail = req.body?.email;
      const hasEmailInput =
        rawEmail !== undefined && rawEmail !== null && String(rawEmail).trim() !== '';
      const email = hasEmailInput ? normalizeEmail(rawEmail) : null;
      if (hasEmailInput && !email) {
        return res.status(400).json({ ok: false, code: 'EMAIL_INVALID' });
      }
      if (!email && mailEnabled) {
        return res.status(400).json({ ok: false, code: 'EMAIL_REQUIRED' });
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
          `INSERT INTO users (id, username, display_name, password_hash, avatar, created_at,
                              last_login_at, pending_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, username, displayName, hash, avatar, now, now, email]
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          return res.status(409).json({ ok: false, code: 'USERNAME_TAKEN' });
        }
        throw error;
      }
      let mailSent = false;
      if (email && mailEnabled) {
        try {
          mailSent = await queueVerificationMail({
            userId: id,
            email,
            username,
            lang: langOf(req.body?.lang),
          });
        } catch (error) {
          console.error('[mmc] verification mail failed', error.code || 'error');
        }
      }
      await createSession(res, id, req.body?.remember, req);
      const created = await query(
        `SELECT id, username, display_name, avatar, created_at, last_login_at,
                email, email_verified_at, pending_email
           FROM users WHERE id = ?`,
        [id]
      );
      return res.status(201).json({
        ok: true,
        user: publicUser(created.rows[0]),
        mailSent,
        mailEnabled,
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
        `SELECT id, username, display_name, password_hash, avatar, created_at, last_login_at,
                deleted_at, email, email_verified_at, pending_email
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
      row.last_login_at = now;
      return res.json({ ok: true, user: publicUser(row), mailEnabled });
    } catch (error) {
      console.error('[mmc] login failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/auth/forgot-password', forgotIpLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const lang = langOf(req.body?.lang);
    const generic = () => res.json({ ok: true });
    if (!email || !mailEnabled) return generic();
    if (!allowForgotEmail(email)) return generic();
    try {
      const result = await query(
        `SELECT id, username FROM users
          WHERE email = ? AND email_verified_at IS NOT NULL AND deleted_at IS NULL`,
        [email]
      );
      const row = result.rows[0];
      if (row) {
        // Tao token + gui thu o nen de thoi gian phan hoi khong tiet lo
        // email co tai khoan hay khong.
        void (async () => {
          try {
            const token = await issueResetToken(row.id);
            const link = actionLink('reset', token);
            if (link) {
              queueMail({
                ...passwordResetMail({
                  lang,
                  link,
                  username: row.username,
                  minutes: resetTokenMinutes,
                }),
                to: email,
              });
            }
          } catch (error) {
            console.error('[mmc] forgot password mail failed', error.code || 'error');
          }
        })();
      }
    } catch (error) {
      // Khong log token hay email; chi ma loi.
      console.error('[mmc] forgot password failed', error.code || 'error');
    }
    return generic();
  });

  router.post('/auth/reset-password/check', resetCheckLimiter, async (req, res) => {
    try {
      const token = safeToken(req.body?.token);
      if (!token) return res.json({ ok: true, valid: false });
      const result = await query(
        'SELECT expires_at, used_at FROM password_resets WHERE token_hash = ?',
        [sha256(token)]
      );
      const row = result.rows[0];
      const valid = Boolean(
        row && row.used_at === null && Number(row.expires_at) > Date.now()
      );
      return res.json({ ok: true, valid });
    } catch (error) {
      console.error('[mmc] reset token check failed', error.code || 'error');
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/auth/reset-password', resetIpLimiter, async (req, res) => {
    try {
      const token = safeToken(req.body?.token);
      if (!token) return res.status(400).json({ ok: false, code: 'RESET_TOKEN_INVALID' });
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      const tokenHash = sha256(token);
      const lookup = await query(
        `SELECT r.id, r.expires_at, r.used_at, u.id AS user_id, u.username, u.email,
                u.email_verified_at, u.deleted_at
           FROM password_resets r JOIN users u ON u.id = r.user_id
          WHERE r.token_hash = ?`,
        [tokenHash]
      );
      const found = lookup.rows[0];
      if (!found || found.used_at !== null || found.deleted_at !== null) {
        return res.status(400).json({ ok: false, code: 'RESET_TOKEN_INVALID' });
      }
      if (Number(found.expires_at) <= Date.now()) {
        return res.status(410).json({ ok: false, code: 'RESET_TOKEN_EXPIRED' });
      }
      const problem = passwordProblem(newPassword, found.username);
      if (problem) return res.status(400).json({ ok: false, code: problem });
      const hash = await hashPassword(newPassword);
      const now = Date.now();
      let claimed = false;
      try {
        await transaction(async (tx) => {
          const update = await tx.query(
            `UPDATE password_resets SET used_at = ?
              WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
            [now, found.id, now]
          );
          if (update.rowCount !== 1) {
            const error = new Error('reset-token-invalid');
            error.code = 'RESET_TOKEN_INVALID';
            throw error;
          }
          const changed = await tx.query(
            `UPDATE users SET password_hash = ?
              WHERE id = ? AND deleted_at IS NULL`,
            [hash, found.user_id]
          );
          if (changed.rowCount !== 1) {
            const error = new Error('reset-user-invalid');
            error.code = 'RESET_TOKEN_INVALID';
            throw error;
          }
          await tx.query('DELETE FROM sessions WHERE user_id = ?', [found.user_id]);
          await tx.query(
            'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
            [now, found.user_id]
          );
        });
        claimed = true;
      } catch (error) {
        if (error.code === 'RESET_TOKEN_INVALID') {
          return res.status(400).json({ ok: false, code: 'RESET_TOKEN_INVALID' });
        }
        throw error;
      }
      if (claimed && found.email && found.email_verified_at !== null) {
        queueMail({
          ...passwordChangedMail({
            lang: langOf(req.body?.lang),
            time: mailTime(langOf(req.body?.lang)),
            username: found.username,
          }),
          to: found.email,
        });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('[mmc] reset password failed', error.code || error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/auth/verify-email', verifyIpLimiter, async (req, res) => {
    try {
      const token = safeToken(req.body?.token);
      if (!token) return res.status(400).json({ ok: false, code: 'VERIFY_TOKEN_INVALID' });
      const tokenHash = sha256(token);
      const lookup = await query(
        `SELECT v.id, v.user_id, v.email, v.expires_at, v.used_at, u.username, u.deleted_at
           FROM email_verifications v JOIN users u ON u.id = v.user_id
          WHERE v.token_hash = ?`,
        [tokenHash]
      );
      const found = lookup.rows[0];
      if (!found || found.used_at !== null || found.deleted_at !== null) {
        return res.status(400).json({ ok: false, code: 'VERIFY_TOKEN_INVALID' });
      }
      if (Number(found.expires_at) <= Date.now()) {
        return res.status(400).json({ ok: false, code: 'VERIFY_TOKEN_INVALID' });
      }
      const now = Date.now();
      let emailTaken = false;
      await transaction(async (tx) => {
        const update = await tx.query(
          `UPDATE email_verifications SET used_at = ?
            WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
          [now, found.id, now]
        );
        if (update.rowCount !== 1) {
          const error = new Error('verify-token-invalid');
          error.code = 'VERIFY_TOKEN_INVALID';
          throw error;
        }
        const other = await tx.query(
          `SELECT id FROM users
            WHERE email = ? AND email_verified_at IS NOT NULL
              AND deleted_at IS NULL AND id <> ?`,
          [found.email, found.user_id]
        );
        if (other.rows.length) {
          emailTaken = true;
          return;
        }
        const changed = await tx.query(
          `UPDATE users SET email = ?, email_verified_at = ?, pending_email = NULL
            WHERE id = ? AND deleted_at IS NULL`,
          [found.email, now, found.user_id]
        );
        if (changed.rowCount !== 1) {
          const error = new Error('verify-user-invalid');
          error.code = 'VERIFY_TOKEN_INVALID';
          throw error;
        }
        await tx.query(
          'DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL',
          [found.user_id]
        );
      });
      if (emailTaken) {
        return res.status(409).json({ ok: false, code: 'EMAIL_TAKEN' });
      }
      return res.json({ ok: true, emailMasked: maskEmail(found.email) });
    } catch (error) {
      if (error.code === 'VERIFY_TOKEN_INVALID') {
        return res.status(400).json({ ok: false, code: 'VERIFY_TOKEN_INVALID' });
      }
      if (isUniqueViolation(error)) {
        return res.status(409).json({ ok: false, code: 'EMAIL_TAKEN' });
      }
      console.error('[mmc] verify email failed', error.code || error.message);
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

  router.post('/me/email', requireUser, changeEmailLimiter, async (req, res) => {
    try {
      if (!mailEnabled) return res.status(400).json({ ok: false, code: 'MAIL_DISABLED' });
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ ok: false, code: 'EMAIL_INVALID' });
      const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const row = await userEmailRow(req.user.id);
      const passwordRow = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const stored = passwordRow.rows[0];
      if (!row || !stored || !(await verifyPassword(current, stored.password_hash))) {
        return res.status(400).json({ ok: false, code: 'WRONG_PASSWORD' });
      }
      if (row.email && row.email_verified_at !== null && row.email === email) {
        const unchanged = await query(
          `SELECT id, username, display_name, avatar, created_at, last_login_at,
                  email, email_verified_at, pending_email
             FROM users WHERE id = ?`,
          [req.user.id]
        );
        return res.json({ ok: true, unchanged: true, user: publicUser(unchanged.rows[0]) });
      }
      const taken = await query(
        `SELECT id FROM users
          WHERE email = ? AND email_verified_at IS NOT NULL
            AND deleted_at IS NULL AND id <> ?`,
        [email, req.user.id]
      );
      if (taken.rows.length) {
        return res.status(409).json({ ok: false, code: 'EMAIL_TAKEN' });
      }
      await query('UPDATE users SET pending_email = ? WHERE id = ?', [email, req.user.id]);
      const lang = langOf(req.body?.lang);
      let mailSent = false;
      try {
        mailSent = await queueVerificationMail({
          userId: req.user.id,
          email,
          username: row.username,
          lang,
        });
        if (row.email && row.email_verified_at !== null) {
          queueMail({
            ...emailChangeNoticeMail({
              lang,
              time: mailTime(lang),
              newEmailMasked: maskEmail(email),
            }),
            to: row.email,
          });
        }
      } catch (error) {
        console.error('[mmc] change email mail failed', error.code || 'error');
      }
      const updated = await query(
        `SELECT id, username, display_name, avatar, created_at, last_login_at,
                email, email_verified_at, pending_email
           FROM users WHERE id = ?`,
        [req.user.id]
      );
      return res.json({ ok: true, mailSent, user: publicUser(updated.rows[0]) });
    } catch (error) {
      console.error('[mmc] change email failed', error.code || error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.post('/me/email/resend', requireUser, resendLimiter, async (req, res) => {
    try {
      if (!mailEnabled) return res.status(400).json({ ok: false, code: 'MAIL_DISABLED' });
      const row = await userEmailRow(req.user.id);
      if (!row) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      const target = row.pending_email || (row.email_verified_at === null ? row.email : null);
      if (!target) return res.status(400).json({ ok: false, code: 'EMAIL_REQUIRED' });
      const sent = await queueVerificationMail({
        userId: row.id,
        email: target,
        username: row.username,
        lang: langOf(req.body?.lang),
      });
      const updated = await query(
        `SELECT id, username, display_name, avatar, created_at, last_login_at,
                email, email_verified_at, pending_email
           FROM users WHERE id = ?`,
        [req.user.id]
      );
      return res.json({ ok: true, mailSent: sent, user: publicUser(updated.rows[0]) });
    } catch (error) {
      console.error('[mmc] resend verification failed', error.code || error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

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
        `SELECT id, username, display_name, avatar, created_at, last_login_at,
                email, email_verified_at, pending_email
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
      const account = await userEmailRow(req.user.id);
      if (account?.email && account.email_verified_at !== null) {
        const lang = langOf(req.body?.lang);
        queueMail({
          ...passwordChangedMail({
            lang,
            time: mailTime(lang),
            username: account.username,
          }),
          to: account.email,
        });
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
        await tx.query('DELETE FROM email_verifications WHERE user_id = ?', [req.user.id]);
        await tx.query('DELETE FROM password_resets WHERE user_id = ?', [req.user.id]);
        await tx.query(
          `UPDATE users SET username = ?, display_name = ?, deleted_at = ?, password_hash = ?,
                            email = NULL, email_verified_at = NULL, pending_email = NULL
             WHERE id = ?`,
          [anonymous, DELETED_PLAYER_NAME, now, anonymousHash, req.user.id]
        );
        // An danh ca ten da chup trong lich su van cua doi thu.
        await tx.query(
          `UPDATE matches SET
             player_a_name = CASE WHEN player_a_user_id = ? THEN ? ELSE player_a_name END,
             player_b_name = CASE WHEN player_b_user_id = ? THEN ? ELSE player_b_name END
           WHERE player_a_user_id = ? OR player_b_user_id = ?`,
          [
            req.user.id,
            DELETED_PLAYER_NAME,
            req.user.id,
            DELETED_PLAYER_NAME,
            req.user.id,
            req.user.id,
          ]
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
