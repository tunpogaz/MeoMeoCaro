/**
 * Ho tro server Render dang ngu (cold start): phan biet loi mang/timeout voi
 * loi may chu tra loi ro rang, va thu lai voi do tre tang dan.
 *
 * Tach khoi main.js de kiem thu duoc bang Node ma khong can DOM.
 */

export const WAKE_RETRY_MS = 90_000;
export const WAKE_INITIAL_DELAY_MS = 1_200;
export const WAKE_MAX_DELAY_MS = 10_000;
export const WAKE_BACKOFF_FACTOR = 1.6;

export function isRetriableError(error) {
  if (!error) return false;
  if (error.code === 'NETWORK' || error.code === 'HTTP_0') return true;
  return Number(error.status) >= 500;
}

/**
 * Quyet dinh trang thai dang nhap sau khi goi /api/auth/me.
 * - Thanh cong: lay user tu response (null = khach).
 * - 401/AUTH_REQUIRED: server noi ro phien het han -> khach.
 * - Loi mang/timeout/5xx/khac: giu nguyen user hien tai.
 */
export function resolveAccountUser(current, response, error) {
  if (!error) return response?.user || null;
  if (error.status === 401 || error.code === 'AUTH_REQUIRED') return null;
  return current || null;
}

/**
 * Chay task, tu thu lai khi server dang ngu. Khong thu lai khi:
 * - offline (navigator.onLine === false) de PWA van mo nhanh;
 * - server da tra loi ro rang (4xx);
 * - da qua ~90 giay.
 */
export async function retryWhileWaking(task, options = {}) {
  const {
    onWait,
    now = () => Date.now(),
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    maxMs = WAKE_RETRY_MS,
    initialDelay = WAKE_INITIAL_DELAY_MS,
    maxDelay = WAKE_MAX_DELAY_MS,
    factor = WAKE_BACKOFF_FACTOR,
  } = options;

  const start = now();
  let delay = initialDelay;
  let announced = false;

  while (true) {
    try {
      return await task();
    } catch (error) {
      const canRetry = isRetriableError(error) && isOnline() && now() - start < maxMs;
      if (!canRetry) throw error;
      if (!announced) {
        announced = true;
        onWait?.();
      }
      await sleepFn(delay);
      delay = Math.min(Math.round(delay * factor), maxDelay);
    }
  }
}
