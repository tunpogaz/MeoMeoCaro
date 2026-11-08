/**
 * Bo phat nhac nen: sequencer nhin truoc 120ms, mot vong 8 o nhip,
 * fade in/out va ducking. Khong tao hai bo phat chong nhau.
 */
import { buildBar } from './audio-logic.js';

const LOOKAHEAD_SECONDS = 0.12;
const TIMER_MS = 25;

function voiceOptions(event) {
  const base = { start: event.time, dur: event.dur, gain: event.vel, bus: 'music' };
  switch (event.voice) {
    case 'pad':
      return {
        ...base,
        type: 'triangle',
        filter: { type: 'lowpass', freq: 900, q: 0.6 },
        attack: Math.min(0.4, event.dur * 0.25),
        reverb: 0.15,
      };
    case 'bass':
      return {
        ...base,
        type: 'sine',
        filter: { type: 'lowpass', freq: 320, q: 0.8 },
        attack: 0.04,
      };
    case 'pluck':
      return {
        ...base,
        type: 'triangle',
        attack: 0.008,
        filter: { type: 'lowpass', freq: 2600, q: 0.8 },
        reverb: 0.18,
      };
    case 'bell':
      return {
        ...base,
        type: 'sine',
        attack: 0.006,
        reverb: 0.4,
      };
    default:
      return { ...base, type: 'sine' };
  }
}

export class MusicPlayer {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.setIntervalFn =
      options.setIntervalFn || ((fn, ms) => globalThis.setInterval(fn, ms));
    this.clearIntervalFn = options.clearIntervalFn || ((id) => globalThis.clearInterval(id));
    this.setTimeoutFn = options.setTimeoutFn || ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.clearTimeoutFn = options.clearTimeoutFn || ((id) => globalThis.clearTimeout(id));
    this.buildBarFn = options.buildBarFn || buildBar;
    this.onLog = options.onLog || null;
    this.running = false;
    this.desired = false;
    this.timer = null;
    this.nextBarTime = 0;
    this.barIndex = 0;
    this.handles = [];
    this.duckTimer = null;
    this.stopTimer = null;
  }

  log(action, extra = {}) {
    if (typeof this.onLog === 'function') {
      this.onLog({ type: 'music', action, scene: 'menu', ...extra });
    }
  }

  /** Bat dau (hoac tiep tuc) nhac menu. */
  start({ fadeInMs = 1200 } = {}) {
    this.desired = true;
    if (this.running) return true;
    if (!this.engine || !this.engine.ready) return false;
    this.running = true;
    this.barIndex = 0;
    this.nextBarTime = this.engine.now() + 0.08;
    this.engine.setMusicFade(0, 0.02);
    this.schedule();
    this.timer = this.setIntervalFn(() => this.schedule(), TIMER_MS);
    if (typeof this.timer?.unref === 'function') this.timer.unref();
    const fadeSeconds = Math.max(0.05, fadeInMs / 1000);
    this.engine.setMusicFade(1, fadeSeconds);
    this.log('start', { fadeInMs });
    return true;
  }

  schedule() {
    if (!this.running || !this.engine?.ready) return;
    const now = this.engine.now();
    if (this.nextBarTime < now - 1) this.nextBarTime = now + 0.05;
    let guard = 0;
    while (this.nextBarTime < now + LOOKAHEAD_SECONDS && guard < 4) {
      guard += 1;
      const bar = this.buildBarFn(this.barIndex, this.barIndex % 5);
      const barStart = this.nextBarTime;
      for (const event of bar.events) {
        const opts = voiceOptions(event);
        const handle = this.engine.tone({
          ...opts,
          start: barStart + event.time,
          dur: event.dur,
          freq: event.freq,
          gain: event.vel,
        });
        if (handle) {
          this.handles.push(handle);
          if (this.handles.length > 160) {
            this.handles.splice(0, 60);
          }
        }
      }
      this.barIndex += 1;
      this.nextBarTime += bar.duration;
    }
  }

  /** Dung that su: xoa interval, huy not chua phat, fade cac not dang keo. */
  stop({ fadeMs = 700 } = {}) {
    this.desired = false;
    if (!this.running && !this.timer) {
      this.engine?.setMusicFade?.(0, 0.02);
      return;
    }
    this.running = false;
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    if (this.duckTimer !== null) {
      this.clearTimeoutFn(this.duckTimer);
      this.duckTimer = null;
    }
    const now = this.engine?.now?.() || 0;
    const fadeSeconds = Math.max(0.02, fadeMs / 1000);
    this.engine?.setMusicFade?.(0, fadeSeconds);
    for (const handle of this.handles) {
      if (handle.start > now + 0.05) handle.cancel?.();
      else handle.stop?.(now + fadeSeconds);
    }
    this.handles = [];
    this.log('stop', { fadeMs });
  }

  /** Tam dung khi tab an; giu trang thai "mong muon" de tu bat lai. */
  pause() {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    const now = this.engine?.now?.() || 0;
    for (const handle of this.handles) {
      if (handle.start > now + 0.02) handle.cancel?.();
    }
    this.handles = [];
    this.engine?.setMusicFade?.(0, 0.08);
  }

  resume() {
    if (this.desired && !this.running) this.start({ fadeInMs: 320 });
  }

  duck(ms = 1500) {
    if (!this.running) return;
    this.engine.setMusicFade(0.55, 0.2);
    if (this.duckTimer !== null) this.clearTimeoutFn(this.duckTimer);
    this.duckTimer = this.setTimeoutFn(() => {
      this.duckTimer = null;
      if (this.running) this.engine.setMusicFade(1, 0.5);
    }, ms);
  }

  isRunning() {
    return this.running;
  }

  stats() {
    return {
      running: this.running,
      desired: this.desired,
      timer: this.timer !== null,
      barIndex: this.barIndex,
      handles: this.handles.length,
    };
  }
}
