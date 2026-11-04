/**
 * Boc localStorage an toan: neu trinh duyet tat localStorage (che do rieng tu),
 * moi thu van chay voi bo nho tam trong phien.
 */

const PREFIX = 'mmc.';
const memory = new Map();
const SIZES = [3, 4, 5, 6, 7, 8];
const SCORE_SIZES = [...SIZES, 'infinite'];

let localStore = null;
try {
  const probe = '__mmc_probe__';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
  localStore = window.localStorage;
} catch {
  localStore = null;
}

function read(key) {
  if (localStore) {
    try {
      return localStore.getItem(key);
    } catch {
      /* roi xuong bo nho tam */
    }
  }
  return memory.has(key) ? memory.get(key) : null;
}

function write(key, value) {
  if (localStore) {
    try {
      localStore.setItem(key, value);
      return;
    } catch {
      /* roi xuong bo nho tam */
    }
  }
  memory.set(key, value);
}

function remove(key) {
  if (localStore) {
    try {
      localStore.removeItem(key);
    } catch {
      /* bo qua */
    }
  }
  memory.delete(key);
}

function getJSON(key, fallback) {
  const raw = read(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function setJSON(key, value) {
  try {
    write(key, JSON.stringify(value));
  } catch {
    /* bo qua */
  }
}

function validSize(size) {
  return (Number.isInteger(size) && SIZES.includes(size)) || size === 'infinite';
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
const DEFAULT_PROFILE = { name: 'Mèo Con', avatar: 'orange' };

export function loadProfile() {
  const saved = getJSON(`${PREFIX}profile`, {});
  const name =
    typeof saved.name === 'string' && saved.name.trim()
      ? Array.from(saved.name.trim()).slice(0, 12).join('')
      : DEFAULT_PROFILE.name;
  const avatar = typeof saved.avatar === 'string' ? saved.avatar : DEFAULT_PROFILE.avatar;
  return { name, avatar };
}

export function saveProfile(profile) {
  setJSON(`${PREFIX}profile`, {
    name: String(profile?.name || '').slice(0, 24),
    avatar: String(profile?.avatar || 'orange'),
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  sound: true,
  music: false,
  lang: 'vi',
  reduceMotion: false,
  boardSize: 3,
};

export function loadSettings() {
  const saved = getJSON(`${PREFIX}settings`, {});
  return {
    sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_SETTINGS.sound,
    music: typeof saved.music === 'boolean' ? saved.music : DEFAULT_SETTINGS.music,
    lang: saved.lang === 'en' ? 'en' : 'vi',
    reduceMotion: saved.reduceMotion === true,
    boardSize: validSize(saved.boardSize) ? saved.boardSize : DEFAULT_SETTINGS.boardSize,
  };
}

export function saveSettings(settings) {
  setJSON(`${PREFIX}settings`, {
    sound: settings.sound !== false,
    music: settings.music === true,
    lang: settings.lang === 'en' ? 'en' : 'vi',
    reduceMotion: settings.reduceMotion === true,
    boardSize: validSize(settings.boardSize) ? settings.boardSize : DEFAULT_SETTINGS.boardSize,
  });
}

// ---------------------------------------------------------------------------
// Diem so theo co ban
// ---------------------------------------------------------------------------
function emptyAI() {
  return { w: 0, d: 0, l: 0 };
}

function emptyAISet() {
  return { easy: emptyAI(), medium: emptyAI(), hard: emptyAI() };
}

function emptyLocal() {
  return { A: 0, B: 0, draw: 0 };
}

function cleanRecord(record) {
  return {
    w: Number.isFinite(record?.w) && record.w > 0 ? Math.floor(record.w) : 0,
    d: Number.isFinite(record?.d) && record.d > 0 ? Math.floor(record.d) : 0,
    l: Number.isFinite(record?.l) && record.l > 0 ? Math.floor(record.l) : 0,
  };
}

function cleanCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cleanLocal(record) {
  return {
    A: cleanCount(record?.A),
    B: cleanCount(record?.B),
    draw: cleanCount(record?.draw),
  };
}

export function loadScores() {
  const saved = getJSON(`${PREFIX}scores`, {});
  const aiRoot = saved && typeof saved.ai === 'object' && saved.ai ? saved.ai : {};
  const localRoot = saved && typeof saved.local === 'object' && saved.local ? saved.local : {};

  // Kieu cu: ai.easy / local.A nam truc tiep o goc.
  const legacyAI =
    aiRoot.easy || aiRoot.medium || aiRoot.hard
      ? { easy: aiRoot.easy, medium: aiRoot.medium, hard: aiRoot.hard }
      : null;
  const legacyLocal =
    localRoot.A !== undefined || localRoot.B !== undefined || localRoot.draw !== undefined
      ? { A: localRoot.A, B: localRoot.B, draw: localRoot.draw }
      : null;

  const scores = { ai: {}, local: {} };
  for (const size of SCORE_SIZES) {
    const savedAI = aiRoot[size] || {};
    const savedLocal = localRoot[size] || {};
    scores.ai[size] = {
      easy: cleanRecord(savedAI.easy || (size === 3 ? legacyAI?.easy : null)),
      medium: cleanRecord(savedAI.medium || (size === 3 ? legacyAI?.medium : null)),
      hard: cleanRecord(savedAI.hard || (size === 3 ? legacyAI?.hard : null)),
    };
    const localSource = savedLocal.A !== undefined ? savedLocal : size === 3 ? legacyLocal : null;
    scores.local[size] = cleanLocal(localSource);
  }

  if (legacyAI || legacyLocal) setJSON(`${PREFIX}scores`, scores);
  return scores;
}

export function saveScores(scores) {
  setJSON(`${PREFIX}scores`, scores);
}

/** Xoa diem cua mot co ban, giu nguyen cac co ban khac. */
export function resetScoresForSize(scores, size) {
  const safeSize = validSize(size) ? size : 3;
  const next = {
    ai: { ...(scores?.ai || {}) },
    local: { ...(scores?.local || {}) },
  };
  next.ai[safeSize] = emptyAISet();
  next.local[safeSize] = emptyLocal();
  saveScores(next);
  return next;
}

export function resetAllScores() {
  const cleared = { ai: {}, local: {} };
  for (const size of SCORE_SIZES) {
    cleared.ai[size] = emptyAISet();
    cleared.local[size] = emptyLocal();
  }
  saveScores(cleared);
  return cleared;
}

// ---------------------------------------------------------------------------
// Phien online (de rejoin sau F5 / rot mang)
// ---------------------------------------------------------------------------
export function loadSession() {
  const saved = getJSON(`${PREFIX}session`, null);
  if (!saved || typeof saved.roomId !== 'string' || typeof saved.playerKey !== 'string') {
    return null;
  }
  return {
    roomId: saved.roomId,
    playerKey: saved.playerKey,
    at: Number.isFinite(saved.at) ? saved.at : 0,
  };
}

export function saveSession(roomId, playerKey) {
  setJSON(`${PREFIX}session`, { roomId, playerKey, at: Date.now() });
}

export function clearSession() {
  remove(`${PREFIX}session`);
}
