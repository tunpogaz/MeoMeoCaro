/**
 * Cong thuc hieu ung am thanh tong hop. Khong dung file ngoai.
 * Moi ham nhan engine de de test va de thay context gia.
 */

function rand(random) {
  return typeof random === 'function' ? random() : Math.random();
}

function jitter(value, span, random) {
  return value * (1 + (rand(random) - 0.5) * 2 * span);
}

function place(engine, opts = {}) {
  const random = opts.random;
  const symbol = opts.symbol === 'B' ? 'B' : 'A';
  const local = opts.mode === 'local';
  const mine = opts.mine !== false;
  const gain = mine ? 0.14 : 0.1;
  const pan = local ? 0 : mine ? 0 : 0.28;
  const now = engine.now() + 0.01;
  const high = symbol === 'A';
  const base = high ? 690 : 480;
  const peak = high ? 1010 : 660;
  const fall = high ? 470 : 320;
  const dur = jitter(high ? 0.18 : 0.22, 0.1, random);

  // Pop mem khi cham o.
  engine.tone({
    start: now,
    dur: 0.07,
    freq: jitter(860, 0.05, random),
    to: 1320,
    type: 'sine',
    gain: gain * 0.55,
    pan,
    attack: 0.006,
  });

  // Tieng meo "mi-ao": sawtooth qua bandpass + vibrato nhe.
  engine.tone({
    start: now + 0.012,
    dur,
    freq: jitter(base, 0.045, random),
    to: jitter(fall, 0.045, random),
    type: 'sawtooth',
    gain,
    pan,
    attack: 0.02,
    filter: { type: 'bandpass', freq: high ? 2000 : 1450, q: 3.2 },
    vibrato: { rate: high ? 18 : 14, depth: high ? 26 : 20 },
  });

  // Một chút hơi thở de khong giong tieng bip.
  engine.noise({
    start: now + 0.02,
    dur: dur * 0.75,
    gain: gain * 0.16,
    pan,
    filterType: 'bandpass',
    freq: high ? 2400 : 1700,
    q: 2,
  });
  return true;
}

function win(engine) {
  const now = engine.now() + 0.01;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, index) => {
    engine.tone({
      start: now + index * 0.12,
      dur: 0.5,
      freq,
      type: 'triangle',
      gain: 0.13,
      attack: 0.012,
      reverb: 0.3,
      priority: true,
    });
  });
  // Lap lanh: cac not cao ngan rai ngau nhien.
  for (let i = 0; i < 7; i += 1) {
    engine.tone({
      start: now + 0.45 + Math.random() * 1.35,
      dur: 0.16,
      freq: 1200 + Math.random() * 1400,
      type: 'sine',
      gain: 0.035,
      reverb: 0.4,
      priority: true,
    });
  }
  // Tieng meo vui o cuoi.
  engine.tone({
    start: now + 1.85,
    dur: 0.28,
    freq: 760,
    to: 1180,
    type: 'sawtooth',
    gain: 0.11,
    attack: 0.02,
    filter: { type: 'bandpass', freq: 2200, q: 3 },
    vibrato: { rate: 19, depth: 20 },
    reverb: 0.2,
    priority: true,
  });
  return true;
}

function lose(engine) {
  const now = engine.now() + 0.01;
  const notes = [392, 349.23, 293.66, 220];
  notes.forEach((freq, index) => {
    engine.tone({
      start: now + index * 0.22,
      dur: 0.5,
      freq,
      to: freq * 0.985,
      type: 'sawtooth',
      gain: 0.09,
      attack: 0.02,
      filter: { type: 'lowpass', freq: 1300 - index * 180, to: 420, q: 1.2 },
      reverb: 0.3,
      priority: true,
    });
  });
  engine.tone({
    start: now + 1.2,
    dur: 0.55,
    freq: 520,
    to: 260,
    type: 'sawtooth',
    gain: 0.1,
    attack: 0.03,
    filter: { type: 'lowpass', freq: 1200, to: 320, q: 2 },
    vibrato: { rate: 11, depth: 18 },
    reverb: 0.25,
    priority: true,
  });
  engine.noise({
    start: now + 1.55,
    dur: 0.35,
    gain: 0.025,
    filterType: 'lowpass',
    freq: 500,
    to: 200,
    priority: true,
  });
  return true;
}

function draw(engine) {
  const now = engine.now() + 0.01;
  engine.tone({
    start: now,
    dur: 0.45,
    freq: 523.25,
    type: 'sine',
    gain: 0.08,
    reverb: 0.25,
    priority: true,
  });
  engine.tone({
    start: now + 0.32,
    dur: 0.55,
    freq: 493.88,
    type: 'sine',
    gain: 0.075,
    reverb: 0.25,
    priority: true,
  });
  // Tieng nga "zzz" nhe.
  engine.noise({
    start: now + 0.35,
    dur: 0.7,
    gain: 0.03,
    filterType: 'bandpass',
    freq: 360,
    to: 220,
    q: 1.4,
    priority: true,
  });
  return true;
}

function decline(engine) {
  const now = engine.now() + 0.01;
  // "Leu leu": hoi tho qua filter + sweep di len roi tut.
  engine.noise({
    start: now,
    dur: 0.38,
    gain: 0.12,
    filterType: 'bandpass',
    freq: 900,
    to: 2400,
    q: 5,
  });
  engine.tone({
    start: now + 0.05,
    dur: 0.32,
    freq: 520,
    to: 300,
    type: 'sawtooth',
    gain: 0.07,
    vibrato: { rate: 26, depth: 40 },
    filter: { type: 'bandpass', freq: 1600, q: 2.4 },
  });
  return true;
}

function undo(engine) {
  const now = engine.now() + 0.01;
  engine.tone({ start: now, dur: 0.16, freq: 660, to: 430, type: 'sine', gain: 0.07 });
  engine.tone({
    start: now + 0.07,
    dur: 0.18,
    freq: 520,
    to: 340,
    type: 'triangle',
    gain: 0.05,
  });
  engine.tone({ start: now + 0.15, dur: 0.12, freq: 300, type: 'sine', gain: 0.04 });
  engine.noise({
    start: now,
    dur: 0.24,
    gain: 0.03,
    filterType: 'highpass',
    freq: 900,
    to: 2400,
  });
  return true;
}

function click(engine) {
  engine.tone({
    start: engine.now() + 0.005,
    dur: 0.07,
    freq: 320,
    to: 190,
    type: 'triangle',
    gain: 0.06,
  });
  return true;
}

function error(engine) {
  engine.tone({
    start: engine.now() + 0.005,
    dur: 0.13,
    freq: 150,
    to: 118,
    type: 'square',
    gain: 0.045,
  });
  return true;
}

function emote(engine) {
  engine.tone({
    start: engine.now() + 0.005,
    dur: 0.1,
    freq: 720,
    to: 1180,
    type: 'sine',
    gain: 0.08,
  });
  return true;
}

function join(engine) {
  const now = engine.now() + 0.005;
  engine.tone({
    start: now,
    dur: 0.2,
    freq: 659.25,
    type: 'triangle',
    gain: 0.08,
    reverb: 0.2,
  });
  engine.tone({
    start: now + 0.1,
    dur: 0.26,
    freq: 880,
    type: 'triangle',
    gain: 0.07,
    reverb: 0.2,
  });
  return true;
}

function turn(engine) {
  const now = engine.now() + 0.005;
  engine.tone({ start: now, dur: 0.16, freq: 783.99, type: 'sine', gain: 0.055, reverb: 0.2 });
  engine.tone({
    start: now + 0.11,
    dur: 0.22,
    freq: 1046.5,
    type: 'sine',
    gain: 0.05,
    reverb: 0.2,
  });
  return true;
}

const PLAYERS = {
  place,
  win,
  lose,
  draw,
  decline,
  undo,
  click,
  error,
  emote,
  join,
  turn,
};

const LEGACY = {
  meow: 'place',
  pop: 'emote',
  chime: 'join',
};

/** Danh sach ten hop le (de test va cho UI nghe thu). */
export const SFX_NAMES = Object.keys(PLAYERS);

export function playSfx(engine, name, options = {}) {
  if (!engine || !engine.ready) return false;
  const resolved = LEGACY[name] || name;
  const fn = PLAYERS[resolved];
  if (!fn) return false;
  try {
    return fn(engine, options) !== false;
  } catch {
    return false;
  }
}
