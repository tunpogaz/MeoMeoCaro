/**
 * Gui thu cho xac thuc email va khoi phuc mat khau.
 * Nha cung cap: console | smtp | resend | test (hop thu gia cho test).
 * Quy tac: sendMail KHONG BAO GIO nem loi; token khong bao gio vao log.
 */
const IS_PROD = process.env.NODE_ENV === 'production';
const PROVIDER = String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
const RAW_PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim();
const FROM =
  String(process.env.MAIL_FROM || '').trim() ||
  'Meo Meo Caro <no-reply@meomeocaro.local>';
const RESET_MINUTES = positiveInt(process.env.RESET_TOKEN_MINUTES, 30);
const VERIFY_HOURS = positiveInt(process.env.VERIFY_TOKEN_HOURS, 24);

function positiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parsePublicBase(raw) {
  let text = String(raw || '').trim();
  if (!text) {
    if (IS_PROD) return null;
    // Moi truong dev/test: cho phep mac dinh localhost, khong bao gio lay tu Host.
    text = `http://localhost:${positiveInt(process.env.PORT, 3000)}`;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (IS_PROD && url.protocol !== 'https:') return null;
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

const PUBLIC_BASE = parsePublicBase(RAW_PUBLIC_URL);

function configProblem() {
  if (!PROVIDER) return 'MAIL_PROVIDER chưa đặt';
  if (PROVIDER === 'console' || PROVIDER === 'test') {
    if (IS_PROD) return `${PROVIDER} không được dùng ở production`;
  } else if (PROVIDER === 'smtp') {
    if (!String(process.env.SMTP_HOST || '').trim()) return 'thiếu SMTP_HOST';
    if (!String(process.env.MAIL_FROM || '').trim()) return 'thiếu MAIL_FROM';
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    if (Boolean(user) !== Boolean(pass)) return 'SMTP_USER và SMTP_PASS phải đặt cùng nhau';
  } else if (PROVIDER === 'resend') {
    if (!String(process.env.RESEND_API_KEY || '').trim()) return 'thiếu RESEND_API_KEY';
    if (!String(process.env.MAIL_FROM || '').trim()) return 'thiếu MAIL_FROM';
  } else {
    return `MAIL_PROVIDER không hợp lệ: ${PROVIDER}`;
  }
  if (!PUBLIC_BASE) return 'PUBLIC_URL thiếu hoặc không hợp lệ (production cần https)';
  return null;
}

const PROBLEM = configProblem();
export const mailEnabled = PROBLEM === null;
export const mailProvider = mailEnabled ? PROVIDER : 'disabled';
export const resetTokenMinutes = RESET_MINUTES;
export const verifyTokenHours = VERIFY_HOURS;
export const mailFrom = FROM;

/** Base URL tuyet doi lay tu PUBLIC_URL, khong bao gio lay tu header Host. */
export function publicBaseUrl() {
  return PUBLIC_BASE;
}

/** Canh bao luc khoi dong; khong chua bi mat. */
export function mailStartupWarning() {
  if (!PROBLEM) return null;
  return `tính năng thư đang tắt (${PROBLEM})`;
}

export function actionLink(kind, token) {
  if (!PUBLIC_BASE) return null;
  return `${PUBLIC_BASE}/#${kind}=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Hop thu gia cho test (chi bat khi NODE_ENV=test va MAIL_PROVIDER=test)
// ---------------------------------------------------------------------------
const outbox = [];

export function getTestOutbox() {
  return outbox.map((item) => ({ ...item }));
}

export function clearTestOutbox() {
  outbox.length = 0;
}

export function installTestMailRoutes(app) {
  if (IS_PROD || PROVIDER !== 'test') return;
  app.get('/api/__test__/outbox', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, items: getTestOutbox() });
  });
}

// ---------------------------------------------------------------------------
// Gui thu
// ---------------------------------------------------------------------------
let transporterPromise = null;

async function smtpTransport() {
  if (!transporterPromise) {
    transporterPromise = import('nodemailer').then(({ default: nodemailer }) => {
      const port = positiveInt(process.env.SMTP_PORT, 587);
      const secure =
        String(process.env.SMTP_SECURE || '').trim() === 'true' || port === 465;
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    });
  }
  return transporterPromise;
}

async function deliver(message) {
  if (PROVIDER === 'console') {
    // Chi o moi truong dev: link day du duoc in ra de nguoi phat trien thu.
    console.log(
      `[mmc] mail (console)\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`
    );
    return;
  }
  if (PROVIDER === 'test') {
    outbox.push({
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      at: Date.now(),
    });
    if (outbox.length > 200) outbox.splice(0, outbox.length - 200);
    return;
  }
  if (PROVIDER === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from || FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const error = new Error('resend-http');
      error.code = `HTTP_${response.status}`;
      throw error;
    }
    return;
  }
  if (PROVIDER === 'smtp') {
    const transport = await smtpTransport();
    await transport.sendMail({
      from: message.from || FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return;
  }
  const error = new Error('mail-disabled');
  error.code = 'MAIL_DISABLED';
  throw error;
}

/**
 * Gui thu nen. Khong bao gio nem; thu lai mot lan khi loi tam thoi.
 * Log chi ma loi, khong log dia chi, noi dung hay token.
 */
export async function sendMail(message) {
  if (!mailEnabled) return { ok: false, code: 'MAIL_DISABLED' };
  try {
    await deliver(message);
    return { ok: true };
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      await deliver(message);
      return { ok: true };
    } catch (second) {
      console.error(
        '[mmc] mail send failed',
        PROVIDER,
        second?.code || second?.name || 'unknown'
      );
      return { ok: false, code: 'MAIL_SEND_FAILED' };
    }
  }
}

// ---------------------------------------------------------------------------
// Mau thu (VI/EN). Moi gia tri dong duoc escape truoc khi vao HTML.
// ---------------------------------------------------------------------------
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title, paragraphs, footer, link) {
  const body = paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  const action = link
    ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#e8875b;color:#fff;text-decoration:none;font-weight:700">Meo Meo Caro</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#3b2f2f;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:24px">
<h2 style="color:#e8875b">${escapeHtml(title)}</h2>
${body}
${action}
<p style="color:#7a6a6a;font-size:13px">${escapeHtml(footer)}</p>
</div></body></html>`;
}

export function verificationMail({ lang = 'vi', link, username, hours = VERIFY_HOURS }) {
  const vi = lang !== 'en';
  const title = vi ? 'Xác thực email cho Meo Meo Caro' : 'Verify your Meo Meo Caro email';
  const intro = vi
    ? `Chào ${username || 'bạn'}, hãy mở liên kết dưới đây để xác thực email cho tài khoản của bạn.`
    : `Hi ${username || 'there'}, open the link below to verify the email for your account.`;
  const expiry = vi
    ? `Liên kết có hiệu lực trong ${hours} giờ và chỉ dùng được một lần.`
    : `This link expires in ${hours} hours and can be used once.`;
  const ignore = vi
    ? 'Nếu bạn không tạo tài khoản này, hãy bỏ qua thư này.'
    : 'If you did not create this account, you can ignore this email.';
  return {
    to: null,
    subject: vi ? 'Xác thực email — Meo Meo Caro' : 'Verify your email — Meo Meo Caro',
    text: `${intro}\n\n${link}\n\n${expiry}\n${ignore}`,
    html: layout(title, [intro, expiry, ignore], 'Meo Meo Caro', link),
  };
}

export function passwordResetMail({ lang = 'vi', link, username, minutes = RESET_MINUTES }) {
  const vi = lang !== 'en';
  const title = vi ? 'Đặt lại mật khẩu Meo Meo Caro' : 'Reset your Meo Meo Caro password';
  const intro = vi
    ? `Chào ${username || 'bạn'}, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.`
    : `Hi ${username || 'there'}, we received a request to reset your account password.`;
  const expiry = vi
    ? `Liên kết có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.`
    : `This link expires in ${minutes} minutes and can be used once.`;
  const ignore = vi
    ? 'Nếu không phải bạn yêu cầu, hãy bỏ qua thư này; mật khẩu hiện tại vẫn giữ nguyên.'
    : 'If this was not you, ignore this email; your current password stays unchanged.';
  return {
    to: null,
    subject: vi ? 'Đặt lại mật khẩu — Meo Meo Caro' : 'Reset password — Meo Meo Caro',
    text: `${intro}\n\n${link}\n\n${expiry}\n${ignore}`,
    html: layout(title, [intro, expiry, ignore], 'Meo Meo Caro', link),
  };
}

export function passwordChangedMail({ lang = 'vi', time, username }) {
  const vi = lang !== 'en';
  const title = vi ? 'Mật khẩu của bạn vừa được thay đổi' : 'Your password was just changed';
  const intro = vi
    ? `Chào ${username || 'bạn'}, mật khẩu tài khoản Meo Meo Caro vừa được thay đổi lúc ${time}.`
    : `Hi ${username || 'there'}, your Meo Meo Caro password was changed at ${time}.`;
  const support = vi
    ? 'Nếu không phải bạn thực hiện, hãy đặt lại mật khẩu ngay và liên hệ người quản trị.'
    : 'If this was not you, reset your password right away and contact the administrator.';
  const note = vi
    ? 'Thư này không chứa mật khẩu của bạn.'
    : 'This email never contains your password.';
  return {
    to: null,
    subject: vi ? 'Mật khẩu đã thay đổi — Meo Meo Caro' : 'Password changed — Meo Meo Caro',
    text: `${intro}\n${support}\n${note}`,
    html: layout(title, [intro, support, note], 'Meo Meo Caro'),
  };
}

export function emailChangeNoticeMail({ lang = 'vi', time, newEmailMasked }) {
  const vi = lang !== 'en';
  const title = vi ? 'Yêu cầu đổi email' : 'Email change requested';
  const intro = vi
    ? `Có yêu cầu đổi email nhận thư khôi phục của tài khoản Meo Meo Caro sang ${newEmailMasked} lúc ${time}.`
    : `A request was made at ${time} to change the recovery email of your Meo Meo Caro account to ${newEmailMasked}.`;
  const stillWorks = vi
    ? 'Email hiện tại vẫn dùng để khôi phục mật khẩu cho tới khi email mới được xác thực.'
    : 'Your current email still works for password recovery until the new one is verified.';
  const support = vi
    ? 'Nếu không phải bạn thực hiện, hãy đổi mật khẩu ngay.'
    : 'If this was not you, change your password right away.';
  return {
    to: null,
    subject: vi ? 'Yêu cầu đổi email — Meo Meo Caro' : 'Email change requested — Meo Meo Caro',
    text: `${intro}\n${stillWorks}\n${support}`,
    html: layout(title, [intro, stillWorks, support], 'Meo Meo Caro'),
  };
}
