/**
 * Goi API JSON cung origin, luon kem cookie phien.
 * Loi API duoc tra ve dang {code,...}; client tu dich code sang VI/EN.
 */

export class ApiError extends Error {
  constructor(code, status = 0, extra = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = extra.retryAfter || 0;
  }
}

async function request(path, { method = 'GET', body, timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok || data?.ok === false) {
      throw new ApiError(
        data?.code || (response.ok ? 'SERVER_ERROR' : `HTTP_${response.status}`),
        response.status,
        { retryAfter: data?.retryAfter }
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK', 0);
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  config: () => request('/api/config'),
  me: () => request('/api/auth/me'),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  forgotPassword: (payload) =>
    request('/api/auth/forgot-password', { method: 'POST', body: payload }),
  resetCheck: (payload) =>
    request('/api/auth/reset-password/check', { method: 'POST', body: payload }),
  resetPassword: (payload) =>
    request('/api/auth/reset-password', { method: 'POST', body: payload }),
  verifyEmail: (payload) =>
    request('/api/auth/verify-email', { method: 'POST', body: payload }),
  updateProfile: (payload) => request('/api/me', { method: 'PATCH', body: payload }),
  changePassword: (payload) => request('/api/me/password', { method: 'POST', body: payload }),
  setEmail: (payload) => request('/api/me/email', { method: 'POST', body: payload }),
  resendEmail: (payload) => request('/api/me/email/resend', { method: 'POST', body: payload }),
  deleteAccount: (payload) => request('/api/me', { method: 'DELETE', body: payload }),
  history: (params = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== '' && value !== null && value !== undefined) search.set(key, String(value));
    }
    const suffix = search.toString();
    return request(`/api/history${suffix ? `?${suffix}` : ''}`);
  },
  match: (id) => request(`/api/history/${encodeURIComponent(id)}`),
  stats: () => request('/api/stats'),
};
