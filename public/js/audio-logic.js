/**
 * Logic am thanh thuan (khong dung Web Audio) de test bang Node.
 * Moi quyet dinh "nghe gi" nam o day; engine/sfx/music chi phat.
 */

export const AUDIO_DEFAULTS = Object.freeze({
  sound: true,
  music: true,
  volumeMaster: 0.8,
  volumeMusic: 0.4,
  volumeSfx: 0.8,
});

export const MUSIC_BPM = 92;
export const MUSIC_BEATS_PER_BAR = 4;

// C major pentatonic: C D E G A across three octaves.
export const PENTATONIC = Object.freeze([
  130.81, 146.83, 164.81, 196.0, 220.0,
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
]);

const MENU_SCREENS = new Set([
  'home',
  'auth',
  'login',
  'register',
  'forgot',
  'reset',
  'verify',
  'profile',
  'history',
  'stats',
  'settings',
  'howto',
  'scores',
  'ai-setup',
  'local-setup',
  'lobby',
  'room',
]);

/** Man hinh nao co nhac nen. Man hinh la / replay / van dau -> none. */
export function musicSceneFor(screen) {
  return MENU_SCREENS.has(screen) ? 'menu' : 'none';
}

/**
 * Goc nhin ket qua cua chinh client nay.
 * @param {{mode?: string, winner?: string|null, mySymbol?: string|null, reason?: string}} input
 * @returns {'win'|'lose'|'draw'|'neutral'}
 */
export function resultPerspective({ mode, winner, mySymbol, reason } = {}) {
  if (mode === 'replay') return 'neutral';
  if (winner === 'draw' || reason === 'draw') return 'draw';
  if (!winner || (winner !== 'A' && winner !== 'B')) return 'neutral';

  if (mode === 'online') {
    if (!mySymbol) return 'neutral';
    return winner === mySymbol ? 'win' : 'lose';
  }
  if (mode === 'ai') {
    return winner === 'A' ? 'win' : 'lose';
  }
  if (mode === 'local') {
    // Hai nguoi cung may: an mung chung cho ben thang, khong co goc nhin thua.
    return 'win';
  }
  return 'neutral';
}

export function clampVolume(value, fallback = 0.8) {
  const safeFallback = Number.isFinite(Number(fallback))
    ? Math.min(1, Math.max(0, Number(fallback)))
    : 0.8;
  const number = Number(value);
  if (!Number.isFinite(number)) return safeFallback;
  return Math.min(1, Math.max(0, number));
}

/** Duong cong cam nhan: binh phuong 0..1. */
export function volumeCurve(value) {
  const v = clampVolume(value, 0);
  return v * v;
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Chuan hoa cai dat am thanh, tuong thich khoa cu (sound/music) va
 * cac ten the he cu (volume/masterVolume/musicVolume/sfxVolume).
 */
export function normalizeAudioSettings(raw = {}) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const master = saved.volumeMaster ?? saved.masterVolume ?? saved.volume;
  const music = saved.volumeMusic ?? saved.musicVolume;
  const sfx = saved.volumeSfx ?? saved.sfxVolume;
  return {
    sound: bool(saved.sound, AUDIO_DEFAULTS.sound),
    music: bool(saved.music, AUDIO_DEFAULTS.music),
    volumeMaster: clampVolume(master, AUDIO_DEFAULTS.volumeMaster),
    volumeMusic: clampVolume(music, AUDIO_DEFAULTS.volumeMusic),
    volumeSfx: clampVolume(sfx, AUDIO_DEFAULTS.volumeSfx),
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHORDS = [
  { root: 130.81, tones: [261.63, 329.63, 392.0] }, // C
  { root: 110.0, tones: [220.0, 261.63, 329.63] }, // Am
  { root: 87.31, tones: [174.61, 220.0, 261.63] }, // F
  { root: 98.0, tones: [196.0, 246.94, 293.66] }, // G
];

/**
 * Sinh mot o nhip 4/4 cua vong nhac 8 o nhip.
 * Tra ve { barIndex, bpm, duration, variant, events }.
 * Event: { time, dur, freq, voice, vel } voi time/duration tinh bang giay.
 */
export function buildBar(barIndex = 0, variantSeed = 0) {
  const index = Number.isFinite(Number(barIndex)) ? Math.floor(Number(barIndex)) : 0;
  const seed = (Number.isFinite(Number(variantSeed)) ? Number(variantSeed) : 0) >>> 0;
  const random = mulberry32((index * 2654435761 + seed * 97 + 17) >>> 0);
  const beat = 60 / MUSIC_BPM;
  const duration = beat * MUSIC_BEATS_PER_BAR;
  const chord = CHORDS[((index % 8) % 4 + 4) % 4];
  const events = [];
  const push = (time, dur, freq, voice, vel) => {
    const safeTime = Math.max(0, Math.min(duration - 0.001, time));
    const safeDur = Math.max(0.02, Math.min(duration - safeTime, dur));
    events.push({
      time: Number(safeTime.toFixed(4)),
      dur: Number(safeDur.toFixed(4)),
      freq: Number(freq.toFixed(2)),
      voice,
      vel: Number(vel.toFixed(3)),
    });
  };

  // Pad: two soft chord layers held across the bar.
  chord.tones.forEach((freq, i) => {
    push(0, duration - 0.05, freq, 'pad', 0.09 - i * 0.012);
  });
  push(0, duration - 0.05, chord.tones[0] / 2, 'pad', 0.05);

  // Bass on beats 1 and 3.
  push(0, beat * 0.9, chord.root, 'bass', 0.14);
  push(beat * 2, beat * 0.9, chord.root, 'bass', 0.11);

  // Pluck melody: sparse eighths, pentatonic, small variations per bar.
  const slots = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  const melodyCount = 4 + Math.floor(random() * 3);
  const used = new Set();
  for (let i = 0; i < melodyCount; i += 1) {
    const slotIndex = Math.floor(random() * slots.length);
    if (used.has(slotIndex)) continue;
    used.add(slotIndex);
    const scaleIndex = 5 + Math.floor(random() * 6); // C4..A5
    let freq = PENTATONIC[scaleIndex];
    if (random() < 0.18) freq *= 2;
    push(beat * slots[slotIndex], beat * (0.35 + random() * 0.35), freq, 'pluck', 0.08 + random() * 0.04);
  }

  // Very soft rhythm: kick on 1/3, shaker on every beat.
  push(0, 0.16, 72, 'kick', 0.09);
  push(beat * 2, 0.16, 72, 'kick', 0.075);
  for (let i = 0; i < MUSIC_BEATS_PER_BAR; i += 1) {
    push(beat * i + beat * 0.5, 0.06, 7200, 'hat', 0.018 + random() * 0.008);
  }

  // Little cat bell at the start of every other 8-bar cycle.
  if (index % 4 === 0) {
    push(0.02, beat * 0.7, PENTATONIC[12 + Math.floor(random() * 3)], 'bell', 0.05);
  }

  events.sort((a, b) => a.time - b.time || a.voice.localeCompare(b.voice));
  return {
    barIndex: index,
    bpm: MUSIC_BPM,
    duration: Number(duration.toFixed(4)),
    variant: seed,
    events,
  };
}

/** Khoa mot lan cho hieu ung ket qua (van/vong/so nuoc/nguoi thang). */
export function resultEffectKey({ roomId, round, moveCount, winner } = {}) {
  return [roomId || 'local', round ?? 0, Number(moveCount) || 0, winner || 'none'].join(':');
}
