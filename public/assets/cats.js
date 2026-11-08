/**
 * Toan bo nhan vat meo o day deu la SVG goc, tu ve bang tay.
 * Khong su dung hinh anh co ban quyen.
 */

const INK = '#4A3426';

export const CAT_THEMES = {
  orange: {
    key: 'orange',
    fur: '#FFA94D',
    shade: '#F08A2C',
    inner: '#FFD9B3',
    eye: '#3C2A1E',
    nose: '#FF8FA3',
    bg: '#FFE3C2',
    style: 'stripe',
  },
  gray: {
    key: 'gray',
    fur: '#8FA9C9',
    shade: '#6F8AAB',
    inner: '#DCE8F6',
    eye: '#2E3A4E',
    nose: '#F2A6B1',
    bg: '#DEE9F7',
    style: 'fold',
  },
  calico: {
    key: 'calico',
    fur: '#FFF6E8',
    shade: '#EFE0CB',
    inner: '#FFD9B3',
    eye: '#3C2A1E',
    nose: '#FF9FB0',
    bg: '#FFE9D6',
    style: 'calico',
  },
  black: {
    key: 'black',
    fur: '#4C4658',
    shade: '#3A3546',
    inner: '#7A6F8F',
    eye: '#FFD43B',
    nose: '#E58FA0',
    bg: '#E4DEF5',
    style: 'plain',
    pupil: true,
  },
  cream: {
    key: 'cream',
    fur: '#FFE4B5',
    shade: '#EFCF9B',
    inner: '#FFD1B0',
    eye: '#4A3426',
    nose: '#FF9FB0',
    bg: '#FFF0D2',
    style: 'plain',
  },
  tabby: {
    key: 'tabby',
    fur: '#DDA15E',
    shade: '#C1854A',
    inner: '#FFE0B8',
    eye: '#3C2A1E',
    nose: '#FF9FB0',
    bg: '#F7E2C4',
    style: 'tabby',
  },
};

export const AVATAR_KEYS = Object.keys(CAT_THEMES);

function themeOf(key) {
  return CAT_THEMES[key] || CAT_THEMES.orange;
}

function earsMarkup(theme) {
  const folded = theme.style === 'fold';
  if (folded) {
    return `
      <path d="M24 34 L28 13 L45 27 Z" fill="${theme.fur}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M76 34 L72 13 L55 27 Z" fill="${theme.fur}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M31 26 L33 18 L40 25 Z" fill="${theme.inner}" stroke="none"/>
      <path d="M69 26 L67 18 L60 25 Z" fill="${theme.inner}" stroke="none"/>
      <path d="M30 25 q4 4 8 3" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
      <path d="M70 25 q-4 4 -8 3" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    `;
  }
  return `
    <path d="M22 35 L15 8 L44 23 Z" fill="${theme.fur}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M78 35 L85 8 L56 23 Z" fill="${theme.fur}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M26 29 L22 15 L37 24 Z" fill="${theme.inner}" stroke="none"/>
    <path d="M74 29 L78 15 L63 24 Z" fill="${theme.inner}" stroke="none"/>
  `;
}

function patternMarkup(theme) {
  if (theme.style === 'stripe') {
    return `
      <path d="M40 32 q4 7 0 13" fill="none" stroke="${theme.shade}" stroke-width="4" stroke-linecap="round" opacity=".9"/>
      <path d="M50 29 q4 8 0 15" fill="none" stroke="${theme.shade}" stroke-width="4" stroke-linecap="round" opacity=".9"/>
      <path d="M60 32 q-4 7 0 13" fill="none" stroke="${theme.shade}" stroke-width="4" stroke-linecap="round" opacity=".9"/>
    `;
  }
  if (theme.style === 'tabby') {
    return `
      <path d="M39 31 q4 7 0 13" fill="none" stroke="${theme.shade}" stroke-width="4" stroke-linecap="round"/>
      <path d="M50 28 q4 8 0 15" fill="none" stroke="${theme.shade}" stroke-width="4" stroke-linecap="round"/>
      <path d="M61 31 q-4 7 0 13" fill="none" stroke="${theme.shade}" stroke-width="4" stroke-linecap="round"/>
      <path d="M18 57 h10 M18 65 h10" fill="none" stroke="${theme.shade}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      <path d="M82 57 h-10 M82 65 h-10" fill="none" stroke="${theme.shade}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    `;
  }
  if (theme.style === 'calico') {
    return `
      <ellipse cx="31" cy="39" rx="13" ry="9" fill="#FFA94D" transform="rotate(-20 31 39)" stroke="none" opacity=".95"/>
      <ellipse cx="69" cy="41" rx="10" ry="8" fill="#6B5B66" transform="rotate(16 69 41)" stroke="none" opacity=".85"/>
      <ellipse cx="50" cy="31" rx="8" ry="5" fill="#F2A65A" transform="rotate(6 50 31)" stroke="none" opacity=".7"/>
    `;
  }
  return '';
}

function eyesMarkup(theme, expression) {
  if (expression === 'win') {
    return `
      <path d="M27.5 56 q7.5 -10 15 0" fill="none" stroke="${INK}" stroke-width="3.8" stroke-linecap="round"/>
      <path d="M57.5 56 q7.5 -10 15 0" fill="none" stroke="${INK}" stroke-width="3.8" stroke-linecap="round"/>
    `;
  }
  if (expression === 'lose') {
    return `
      <path d="M29 52 q7 8 14 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M57 52 q7 8 14 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M37 61 q-4 8 0 11 q4 -3 0 -11" fill="#7FD3F7" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M28.5 42 l9 5" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>
      <path d="M71.5 42 l-9 5" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>
    `;
  }
  if (expression === 'sleep') {
    return `
      <path d="M29 54 q7 5 14 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M57 54 q7 5 14 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
    `;
  }
  if (expression === 'think') {
    return `
      <ellipse cx="36" cy="53.5" rx="6.4" ry="7.6" fill="${theme.eye}" stroke="none"/>
      <circle cx="33.8" cy="50.8" r="2.1" fill="#FFF"/>
      <circle cx="38.2" cy="55.8" r=".9" fill="#FFF" opacity=".8"/>
      <path d="M57 54 q7 5 14 0" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M79 39 q4 7 0 9 q-4 -2 0 -9" fill="#8CE0F3" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    `;
  }
  if (expression === 'tongue') {
    return `
      <path d="M30 51 q6 -7 12 0" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
      <ellipse cx="64" cy="53.5" rx="6" ry="7.2" fill="${theme.eye}" stroke="none"/>
      <circle cx="61.8" cy="50.8" r="2.1" fill="#FFF"/>
      <circle cx="66.2" cy="56" r=".9" fill="#FFF" opacity=".8"/>
      <path d="M24 43 l10 3" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>
      <path d="M76 43 l-10 3" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>
    `;
  }
  const pupils = theme.pupil
    ? `
      <ellipse cx="36" cy="53.5" rx="6.4" ry="7.6" fill="${theme.eye}" stroke="none"/>
      <ellipse cx="36" cy="53.5" rx="2.8" ry="4.2" fill="#2B2118"/>
      <circle cx="33.8" cy="50.4" r="2.1" fill="#FFF"/>
      <circle cx="38.2" cy="56" r=".9" fill="#FFF" opacity=".8"/>
      <ellipse cx="64" cy="53.5" rx="6.4" ry="7.6" fill="${theme.eye}" stroke="none"/>
      <ellipse cx="64" cy="53.5" rx="2.8" ry="4.2" fill="#2B2118"/>
      <circle cx="61.8" cy="50.4" r="2.1" fill="#FFF"/>
      <circle cx="66.2" cy="56" r=".9" fill="#FFF" opacity=".8"/>
    `
    : `
      <ellipse cx="36" cy="53.5" rx="6.4" ry="7.8" fill="${theme.eye}" stroke="none"/>
      <circle cx="33.8" cy="50.8" r="2.2" fill="#FFF"/>
      <circle cx="38.2" cy="56" r="1" fill="#FFF" opacity=".8"/>
      <ellipse cx="64" cy="53.5" rx="6.4" ry="7.8" fill="${theme.eye}" stroke="none"/>
      <circle cx="61.8" cy="50.8" r="2.2" fill="#FFF"/>
      <circle cx="66.2" cy="56" r="1" fill="#FFF" opacity=".8"/>
    `;
  return pupils;
}

function mouthMarkup(theme, expression) {
  if (expression === 'win') {
    return `
      <path d="M46.5 65 L53.5 65 L50 70 Z" fill="${theme.nose}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M42 69.5 q8 13 16 0 q-8 4 -16 0 Z" fill="#D95B6D" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    `;
  }
  if (expression === 'lose') {
    return `
      <path d="M46.5 65 L53.5 65 L50 70 Z" fill="${theme.nose}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M43 75 q7 -6 14 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
    `;
  }
  if (expression === 'sleep') {
    return `
      <path d="M46.5 65 L53.5 65 L50 70 Z" fill="${theme.nose}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <ellipse cx="50" cy="72.5" rx="3.2" ry="4.2" fill="${theme.nose}" stroke="${INK}" stroke-width="2"/>
    `;
  }
  if (expression === 'tongue') {
    return `
      <path d="M46.5 65 L53.5 65 L50 70 Z" fill="${theme.nose}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M41 69 q9 8 18 0 q-9 3 -18 0 Z" fill="#D95B6D" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M45 71 q5 6 10 0 q1 9 -5 10 q-6 -1 -5 -10 Z" fill="#F58FA0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 73.5 l0 5" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    `;
  }
  return `
    <path d="M46.5 65 L53.5 65 L50 70 Z" fill="${theme.nose}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M50 70 q-5 7 -11 2" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M50 70 q5 7 11 2" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
  `;
}

function cheeksMarkup(theme) {
  return `
    <ellipse cx="28" cy="64" rx="6" ry="3.6" fill="${theme.nose}" stroke="none" opacity=".32"/>
    <ellipse cx="72" cy="64" rx="6" ry="3.6" fill="${theme.nose}" stroke="none" opacity=".32"/>
  `;
}

function featuresMarkup(theme, expression) {
  return `
    ${eyesMarkup(theme, expression)}
    ${mouthMarkup(theme, expression)}
    <g fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round" opacity=".65">
      <path d="M12 57 L30 60"/>
      <path d="M11 65 L30 65"/>
      <path d="M12 73 L30 70"/>
      <path d="M88 57 L70 60"/>
      <path d="M89 65 L70 65"/>
      <path d="M88 73 L70 70"/>
    </g>
    ${cheeksMarkup(theme)}
  `;
}

function faceInner(theme, expression) {
  return `
    ${earsMarkup(theme)}
    <ellipse cx="50" cy="56" rx="35" ry="31" fill="${theme.fur}" stroke="${INK}" stroke-width="3.4"/>
    ${patternMarkup(theme)}
    ${featuresMarkup(theme, expression)}
  `;
}

/**
 * Mat meo cho quan co / player card.
 * @param {string} themeKey orange | gray | calico | black | cream | tabby
 * @param {'normal'|'win'|'lose'|'sleep'|'think'|'tongue'} expression
 */
export function catFace(themeKey, expression = 'normal') {
  const theme = themeOf(themeKey);
  return `<svg class="cat-svg is-${expression}" viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">${faceInner(theme, expression)}</svg>`;
}

export function catAvatar(themeKey) {
  const theme = themeOf(themeKey);
  return `
    <svg class="avatar-svg" viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="47" fill="${theme.bg}" stroke="${INK}" stroke-width="3"/>
      <g transform="translate(6 7) scale(0.88)">${faceInner(theme, 'normal')}</g>
    </svg>
  `;
}

/** Meo mascot o man hinh chinh: vay duoi, chop mat, van tay. */
export function mascotSVG() {
  const t = CAT_THEMES.orange;
  return `
    <svg class="mascot-svg" viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="187" rx="62" ry="9" fill="rgba(74,52,38,.14)"/>
      <g class="mascot-tail">
        <path d="M148 156 C186 150 191 118 173 101" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
        <path d="M148 156 C186 150 191 118 173 101" fill="none" stroke="${t.fur}" stroke-width="15" stroke-linecap="round"/>
        <path d="M173 101 q7 4 5 12" fill="none" stroke="${t.shade}" stroke-width="8" stroke-linecap="round"/>
      </g>
      <ellipse cx="100" cy="150" rx="54" ry="41" fill="${t.fur}" stroke="${INK}" stroke-width="3.4"/>
      <ellipse cx="100" cy="158" rx="30" ry="26" fill="${t.inner}" opacity=".75"/>
      <ellipse cx="74" cy="183" rx="18" ry="10" fill="${t.fur}" stroke="${INK}" stroke-width="3"/>
      <ellipse cx="126" cy="183" rx="18" ry="10" fill="${t.fur}" stroke="${INK}" stroke-width="3"/>
      <path d="M71 183 h6 M74 179 v6" stroke="${INK}" stroke-width="1.6" opacity=".4" stroke-linecap="round"/>
      <path d="M123 183 h6 M126 179 v6" stroke="${INK}" stroke-width="1.6" opacity=".4" stroke-linecap="round"/>
      <g class="mascot-wave">
        <path d="M150 145 q20 -10 14 -26" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round"/>
        <path d="M150 145 q20 -10 14 -26" fill="none" stroke="${t.fur}" stroke-width="13" stroke-linecap="round"/>
        <ellipse cx="166" cy="118" rx="15" ry="13" fill="${t.fur}" stroke="${INK}" stroke-width="3" transform="rotate(-12 166 118)"/>
        <path d="M158 112 l5 5 M165 109 l3 6 M172 110 l1 6" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
      </g>
      <path d="M55 58 L44 14 L94 40 Z" fill="${t.fur}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M145 58 L156 14 L106 40 Z" fill="${t.fur}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M63 50 L55 27 L83 41 Z" fill="${t.inner}" stroke="none"/>
      <path d="M137 50 L145 27 L117 41 Z" fill="${t.inner}" stroke="none"/>
      <ellipse cx="100" cy="84" rx="56" ry="48" fill="${t.fur}" stroke="${INK}" stroke-width="3.4"/>
      <path d="M83 48 q5 10 0 19" fill="none" stroke="${t.shade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M100 44 q5 11 0 21" fill="none" stroke="${t.shade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M117 48 q-5 10 0 19" fill="none" stroke="${t.shade}" stroke-width="5" stroke-linecap="round"/>
      <g class="mascot-eye">
        <ellipse cx="80" cy="82" rx="8" ry="9.5" fill="${t.eye}"/>
        <circle cx="77" cy="78" r="2.6" fill="#FFF"/>
        <circle cx="83" cy="85" r="1.1" fill="#FFF" opacity=".8"/>
      </g>
      <g class="mascot-eye">
        <ellipse cx="120" cy="82" rx="8" ry="9.5" fill="${t.eye}"/>
        <circle cx="117" cy="78" r="2.6" fill="#FFF"/>
        <circle cx="123" cy="85" r="1.1" fill="#FFF" opacity=".8"/>
      </g>
      <path d="M95 96 L105 96 L100 102 Z" fill="${t.nose}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M100 103 q-6 8 -13 3" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M100 103 q6 8 13 3" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
      <g fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".6">
        <path d="M52 84 L76 88"/>
        <path d="M50 93 L76 94"/>
        <path d="M52 102 L76 100"/>
        <path d="M148 84 L124 88"/>
        <path d="M150 93 L124 94"/>
        <path d="M148 102 L124 100"/>
      </g>
      <ellipse cx="66" cy="97" rx="8" ry="4.5" fill="${t.nose}" stroke="none" opacity=".32"/>
      <ellipse cx="134" cy="97" rx="8" ry="4.5" fill="${t.nose}" stroke="none" opacity=".32"/>
      <path d="M62 126 q38 20 76 0" fill="none" stroke="#FF6B6B" stroke-width="7" stroke-linecap="round"/>
      <circle cx="100" cy="137" r="7.5" fill="#FFD43B" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="100" cy="140" r="2" fill="${INK}"/>
      <path d="M100 130 v3" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Trang tri: dau chan, cuon len, ca, chuong
// ---------------------------------------------------------------------------
export function pawSVG(color = '#F0C39A') {
  return `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="${color}">
        <ellipse cx="32" cy="43" rx="15" ry="12"/>
        <ellipse cx="13" cy="27" rx="6" ry="8" transform="rotate(-18 13 27)"/>
        <ellipse cx="25" cy="17" rx="6.4" ry="8.4"/>
        <ellipse cx="39" cy="17" rx="6.4" ry="8.4"/>
        <ellipse cx="51" cy="27" rx="6" ry="8" transform="rotate(18 51 27)"/>
      </g>
    </svg>
  `;
}

export function yarnSVG() {
  return `
    <svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <circle cx="32" cy="34" r="20" fill="#FFD6E0" stroke="${INK}" stroke-width="3"/>
      <g fill="none" stroke="#FF9DB4" stroke-width="2.4" stroke-linecap="round">
        <path d="M15 34 q17 -14 34 0"/>
        <path d="M16 42 q16 10 32 0"/>
        <path d="M19 26 q13 20 26 0"/>
      </g>
      <path d="M50 46 q10 6 8 16 q-1 5 -6 4 q-4 -1 -2 -6" fill="none" stroke="#FF9DB4" stroke-width="2.6" stroke-linecap="round"/>
    </svg>
  `;
}

export function fishSVG() {
  return `
    <svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <path d="M12 36 q14 -16 30 -10 q10 4 14 10 q-4 6 -14 10 q-16 6 -30 -10 Z" fill="#8CE0C3" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M56 36 l12 -9 v18 Z" fill="#8CE0C3" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="26" cy="33" r="2.6" fill="${INK}"/>
      <path d="M34 30 q4 6 0 12" fill="none" stroke="${INK}" stroke-width="2" opacity=".45" stroke-linecap="round"/>
    </svg>
  `;
}

export function bellSVG() {
  return `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M32 10 q-2 0 -2 4 q-12 4 -12 20 q0 8 -5 12 h38 q-5 -4 -5 -12 q0 -16 -12 -20 q0 -4 -2 -4 Z" fill="#FFD43B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M24 46 q8 -4 16 0" fill="none" stroke="${INK}" stroke-width="2.2" opacity=".5" stroke-linecap="round"/>
      <circle cx="32" cy="52" r="4" fill="#FFD43B" stroke="${INK}" stroke-width="2.5"/>
    </svg>
  `;
}

/** May mua nho cho man hinh thua: hinh SVG goc cua du an. */
export function rainCloudSVG() {
  return `
    <svg viewBox="0 0 120 96" aria-hidden="true" focusable="false">
      <path d="M28 56 q-14 0 -14 -12 q0 -11 12 -12 q2 -14 16 -14 q12 0 16 10 q4 -4 10 -4 q13 0 14 13 q13 1 13 10 q0 9 -13 9 Z"
        fill="#D8E6F5" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M40 68 l-3 10" stroke="#7FB6E8" stroke-width="4" stroke-linecap="round" class="rain-drop rain-drop-1"/>
      <path d="M60 70 l-3 10" stroke="#7FB6E8" stroke-width="4" stroke-linecap="round" class="rain-drop rain-drop-2"/>
      <path d="M80 68 l-3 10" stroke="#7FB6E8" stroke-width="4" stroke-linecap="round" class="rain-drop rain-drop-3"/>
      <circle cx="44" cy="42" r="2.4" fill="${INK}" opacity=".55"/>
      <circle cx="72" cy="42" r="2.4" fill="${INK}" opacity=".55"/>
    </svg>
  `;
}
