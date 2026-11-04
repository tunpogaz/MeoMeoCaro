/**
 * Am thanh tao bang Web Audio API, khong can file mp3.
 * AudioContext chi duoc tao sau lan cham dau tien cua nguoi dung.
 */

let ctx = null;
let enabled = true;
let unlocked = false;
let musicEnabled = false;
let musicTimer = null;
let musicStep = 0;

function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Goi tu lan tuong tac dau tien (pointerdown/keydown) de mo khoa am thanh. */
export function unlock() {
  unlocked = true;
  const context = ensureContext();
  if (!context) return;
  const afterResume = () => {
    if (musicEnabled) startMusicTimer();
  };
  if (context.state === 'suspended') {
    context.resume().then(afterResume).catch(() => {});
  } else {
    afterResume();
  }
}

export function setEnabled(value) {
  enabled = value !== false;
}

export function isEnabled() {
  return enabled;
}

function envelope(gain, start, peak, attack, decay) {
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
}

function tone(freq, start, duration, type = 'sine', volume = 0.12, endFreq = null) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
  envelope(gain, start, volume, Math.min(0.03, duration * 0.3), duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function meow() {
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(640, now);
  osc.frequency.exponentialRampToValueAtTime(1040, now + 0.13);
  osc.frequency.exponentialRampToValueAtTime(470, now + 0.44);

  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(17, now);
  lfoGain.gain.setValueAtTime(28, now);
  lfo.connect(lfoGain).connect(osc.frequency);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2100, now);
  filter.Q.setValueAtTime(4, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  lfo.start(now);
  osc.stop(now + 0.55);
  lfo.stop(now + 0.55);
}

function click() {
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(320, now, 0.07, 'triangle', 0.07, 190);
}

function winSound() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    tone(freq, now + i * 0.11, 0.24, 'triangle', 0.11);
  });
  tone(1567.98, now + 0.44, 0.32, 'sine', 0.06);
}

function loseSound() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [392, 329.63, 261.63].forEach((freq, i) => {
    tone(freq, now + i * 0.14, 0.28, 'sine', 0.09);
  });
}

function drawSound() {
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(523.25, now, 0.24, 'sine', 0.08);
  tone(493.88, now + 0.2, 0.34, 'sine', 0.08);
}

function errorSound() {
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(150, now, 0.13, 'square', 0.05, 120);
}

function popSound() {
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(720, now, 0.1, 'sine', 0.09, 1180);
}

function chime() {
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(659.25, now, 0.18, 'triangle', 0.08);
  tone(880, now + 0.1, 0.24, 'triangle', 0.07);
}

const PLAYERS = {
  meow,
  click,
  win: winSound,
  lose: loseSound,
  draw: drawSound,
  error: errorSound,
  emote: popSound,
  join: chime,
};

export function play(name) {
  if (!enabled || !unlocked) return;
  const context = ensureContext();
  if (!context || context.state !== 'running') return;
  const fn = PLAYERS[name];
  if (fn) {
    try {
      fn();
    } catch {
      /* am thanh la phu, khong duoc lam vo game */
    }
  }
}

// ---------------------------------------------------------------------------
// Nhac nen nhe (mac dinh tat)
// ---------------------------------------------------------------------------
const MUSIC_NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23];

function scheduleMusicStep() {
  if (!ctx || !musicEnabled) return;
  const now = ctx.currentTime;
  const freq = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
  musicStep += 1;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.026, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.9);
}

function startMusicTimer() {
  stopMusicTimer();
  if (!ctx) return;
  scheduleMusicStep();
  musicTimer = window.setInterval(scheduleMusicStep, 1900);
}

function stopMusicTimer() {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function setMusicEnabled(value) {
  musicEnabled = value === true;
  if (musicEnabled && unlocked && ctx && ctx.state === 'running') {
    startMusicTimer();
  } else if (!musicEnabled) {
    stopMusicTimer();
  }
}

export function isMusicEnabled() {
  return musicEnabled;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMusicTimer();
  else if (musicEnabled && ctx && ctx.state === 'running') startMusicTimer();
});
