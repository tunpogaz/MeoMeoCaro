/**
 * Rung nhac luot tren dien thoai.
 * - Android/Chrome: Vibration API 35 ms, chay ca khi tab an.
 * - iPhone/iPad: khong co Vibration API. Thu nghiem them mot lop "iOS switch"
 *   (input type=checkbox switch) chi co tac dung trong thao tac nguoi dung;
 *   khong hua hẹn rung khi mang gui luot toi. iPad khong co dong co rung.
 * Moi truong khong ho tro deu im lang, khong lam hong game.
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

/**
 * Phat hien kha nang hien thi switch cua Safari 17.4+.
 * Khong so sanh phien ban iOS; chi hoi CSS va thu phan tu that.
 */
export function iosSwitchSupported({ doc = globalThis.document, css = globalThis.CSS } = {}) {
  if (!doc?.createElement) return false;
  try {
    if (css?.supports && css.supports('appearance', 'switch')) return true;
  } catch {
    /* thu tiep cach khac */
  }
  try {
    if (css?.supports && css.supports('-webkit-appearance', 'switch')) return true;
  } catch {
    /* khong ho tro */
  }
  return false;
}

/**
 * Tao mot switch vo hinh va bam label de he thong phat phan hoi rung.
 * CHI nen goi trong mot cu cham cua nguoi dung.
 */
export function tapIosSwitchHaptic({ doc = globalThis.document } = {}) {
  if (!doc?.body?.appendChild) return false;
  try {
    const label = doc.createElement('label');
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    label.appendChild(input);
    doc.body.appendChild(label);
    label.click();
    setTimeout(() => label.remove?.(), 80);
    return true;
  } catch {
    return false;
  }
}

/**
 * Thu rung khi den luot tren iPhone: goi trong su kien mang (khong phai thao
 * tac nguoi dung) nen he thong co the bo qua. Khong dung de hua hen.
 */
export function iosTurnHaptic({ enabled = true, doc = globalThis.document } = {}) {
  if (!enabled || !iosSwitchSupported({ doc })) return false;
  return tapIosSwitchHaptic({ doc });
}
