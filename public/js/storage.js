/**
 * Boc localStorage an toan: neu trinh duyet tat localStorage (che do rieng tu),
 * moi thu van chay voi bo nho tam trong phien.
 */

const PREFIX = 'mmc.';
const memory = new Map();

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
};

export function loadSettings() {
  const saved = getJSON(`${PREFIX}settings`, {});
  return {
    sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_SETTINGS.sound,
    music: typeof saved.music === 'boolean' ? saved.music : DEFAULT_SETTINGS.music,
    lang: saved.lang === 'en' ? 'en' : 'vi',
    reduceMotion: saved.reduceMotion === true,
  };
}

export function saveSettings(settings) {
  setJSON(`${PREFIX}settings`, {
    sound: settings.sound !== false,
    music: settings.music === true,
    lang: settings.lang === 'en' ? 'en' : 'vi',
    reduceMotion: settings.reduceMotion === true,
  });
}

// ---------------------------------------------------------------------------
// Diem so
// ---------------------------------------------------------------------------
function emptyAIScore() {
  return { w: 0, d: 0, l: 0 };
}

function cleanRecord(record) {
  return {
    w: Number.isFinite(record?.w) && record.w > 0 ? Math.floor(record.w) : 0,
    d: Number.isFinite(record?.d) && record.d > 0 ? Math.floor(record.d) : 0,
    l: Number.isFinite(record?.l) && record.l > 0 ? Math.floor(record.l) : 0,
  };
}

export function loadScores() {
  const saved = getJSON(`${PREFIX}scores`, {});
  const ai = saved.ai || {};
  const local = saved.local || {};
  return {
    ai: {
      easy: cleanRecord(ai.easy),
      medium: cleanRecord(ai.medium),
      hard: cleanRecord(ai.hard),
    },
    local: {
      A: Number.isFinite(local.A) && local.A > 0 ? Math.floor(local.A) : 0,
      B: Number.isFinite(local.B) && local.B > 0 ? Math.floor(local.B) : 0,
      draw: Number.isFinite(local.draw) && local.draw > 0 ? Math.floor(local.draw) : 0,
    },
  };
}

export function saveScores(scores) {
  setJSON(`${PREFIX}scores`, scores);
}

export function resetAllScores() {
  const cleared = {
    ai: { easy: emptyAIScore(), medium: emptyAIScore(), hard: emptyAIScore() },
    local: { A: 0, B: 0, draw: 0 },
  };
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
