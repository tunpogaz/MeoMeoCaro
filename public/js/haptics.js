/**
 * Rung nhac luot tren dien thoai. Khong bat buoc: trinh duyet khong ho tro
 * thi im lang, khong anh huong luong game.
 */

export const TURN_VIBRATION_MS = 35;

export function vibrationSupported(nav = globalThis.navigator) {
  return Boolean(nav && typeof nav.vibrate === 'function');
}

export function vibrateTurn({ enabled = true, visible = true, nav = globalThis.navigator } = {}) {
  if (!enabled || !visible || !vibrationSupported(nav)) return false;
  try {
    return nav.vibrate(TURN_VIBRATION_MS) !== false;
  } catch {
    return false;
  }
}
