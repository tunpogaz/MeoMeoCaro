/**
 * Kiem tra CSRF dung chung cho API thay doi du lieu.
 * Yeu cau: JSON + Origin cung Host (hoac nam trong CORS_ORIGIN).
 */
export function csrfJsonGuard(req, res, next) {
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
}
