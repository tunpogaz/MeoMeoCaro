/**
 * Dong co Web Audio: MOT AudioContext, master chain, reverb dung chung,
 * gioi han da am va don node. Khong doc DOM, co the test bang context gia.
 */
import { clampVolume, volumeCurve } from './audio-logic.js';

const MAX_SFX_VOICES = 16;

function setGain(node, value, ctx, timeConstant = 0.03) {
  if (!node?.gain) return;
  const target = Math.max(0, value);
  if (typeof node.gain.setTargetAtTime === 'function') {
    node.gain.setTargetAtTime(target, ctx.currentTime, timeConstant);
  } else {
    node.gain.value = target;
  }
}

export class AudioEngine {
  constructor(options = {}) {
    this.AudioContextClass =
      options.AudioContextClass ||
      globalThis.AudioContext ||
      globalThis.webkitAudioContext ||
      null;
    this.ctx = null;
    this.ready = false;
    this.failed = false;
    this.volumes = {
      master: clampVolume(options.volumeMaster, 0.8),
      music: clampVolume(options.volumeMusic, 0.4),
      sfx: clampVolume(options.volumeSfx, 0.8),
    };
    this.nodes = new Set();
    this.voices = [];
    this.musicFadeValue = 1;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.musicFade = null;
    this.reverbInput = null;
    this.noiseBuffer = null;
    this.voiceSeq = 0;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** Tao context + graph lan dau, chi sau cu chi nguoi dung. */
  unlock() {
    if (this.ready && this.ctx) {
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }
    if (this.failed || !this.AudioContextClass) {
      this.failed = true;
      return false;
    }
    try {
      try {
        this.ctx = new this.AudioContextClass({ latencyHint: 'interactive' });
      } catch {
        this.ctx = new this.AudioContextClass();
      }
      this.buildGraph();
      this.ready = true;
      this.applyVolumes();
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    } catch {
      this.ctx = null;
      this.failed = true;
      return false;
    }
  }

  buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicFade = ctx.createGain();
    this.musicFade.gain.value = 1;

    const compressor =
      typeof ctx.createDynamicsCompressor === 'function'
        ? ctx.createDynamicsCompressor()
        : null;

    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.musicFade);
    this.musicFade.connect(this.master);
    if (compressor) {
      this.master.connect(compressor);
      compressor.connect(ctx.destination);
    } else {
      this.master.connect(ctx.destination);
    }

    if (typeof ctx.createConvolver === 'function' && typeof ctx.createGain === 'function') {
      try {
        const convolver = ctx.createConvolver();
        convolver.buffer = this.makeImpulse();
        this.reverbInput = ctx.createGain();
        const reverbReturn = ctx.createGain();
        reverbReturn.gain.value = 0.32;
        this.reverbInput.connect(convolver);
        convolver.connect(reverbReturn);
        reverbReturn.connect(this.master);
      } catch {
        this.reverbInput = null;
      }
    }
  }

  makeImpulse() {
    const ctx = this.ctx;
    const seconds = 1.6;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const decay = (1 - i / length) ** 2.6;
      data[i] = (Math.random() * 2 - 1) * decay * 0.6;
    }
    return buffer;
  }

  applyVolumes() {
    if (!this.ready) return;
    setGain(this.master, volumeCurve(this.volumes.master), this.ctx);
    setGain(this.sfxBus, volumeCurve(this.volumes.sfx), this.ctx);
    setGain(this.musicBus, volumeCurve(this.volumes.music), this.ctx);
  }

  setVolumes(next = {}) {
    this.volumes = {
      master: clampVolume(next.master ?? this.volumes.master, this.volumes.master),
      music: clampVolume(next.music ?? this.volumes.music, this.volumes.music),
      sfx: clampVolume(next.sfx ?? this.volumes.sfx, this.volumes.sfx),
    };
    this.applyVolumes();
    return { ...this.volumes };
  }

  setMusicFade(value, time = 0.08) {
    const safe = Math.min(1, Math.max(0, Number(value) || 0));
    this.musicFadeValue = safe;
    if (this.ready && this.musicFade && this.ctx) {
      const target = safe;
      if (typeof this.musicFade.gain.setTargetAtTime === 'function') {
        this.musicFade.gain.setTargetAtTime(target, this.ctx.currentTime, Math.max(0.01, time / 3));
      } else {
        this.musicFade.gain.value = target;
      }
    }
  }

  acquireVoice(priority = false) {
    if (this.voices.length < MAX_SFX_VOICES) {
      const slot = { id: (this.voiceSeq += 1), priority, nodes: [] };
      this.voices.push(slot);
      return slot;
    }
    if (!priority) {
      const index = this.voices.findIndex((slot) => !slot.priority);
      if (index === -1) return null;
      const oldest = this.voices[index];
      this.releaseVoice(oldest);
      const slot = { id: (this.voiceSeq += 1), priority, nodes: [] };
      this.voices.push(slot);
      return slot;
    }
    // Am quan trong khong bi bo; van cho phep vuot nhe de khong mat tin hieu.
    const slot = { id: (this.voiceSeq += 1), priority, nodes: [] };
    this.voices.push(slot);
    return slot;
  }

  trackNode(node, slot) {
    if (!node) return;
    this.nodes.add(node);
    if (slot) slot.nodes.push(node);
  }

  releaseVoice(slot) {
    if (!slot) return;
    const index = this.voices.indexOf(slot);
    if (index !== -1) this.voices.splice(index, 1);
    for (const node of slot.nodes) {
      this.nodes.delete(node);
      try {
        node.disconnect?.();
      } catch {
        /* node da dong */
      }
    }
    slot.nodes.length = 0;
  }

  attachCleanup(source, slot) {
    if (!source) return;
    const cleanup = () => {
      this.releaseVoice(slot);
    };
    source.onended = cleanup;
    this.trackNode(source, slot);
  }

  tone(options = {}) {
    if (!this.ready || !this.ctx) return null;
    const ctx = this.ctx;
    const music = options.bus === 'music';
    const slot = music
      ? { id: (this.voiceSeq += 1), priority: true, nodes: [], music: true }
      : this.acquireVoice(options.priority === true);
    if (!slot) return null;
    const bus = music ? this.musicBus : this.sfxBus;
    if (!bus) {
      this.releaseVoice(slot);
      return null;
    }

    const start = Number.isFinite(options.start) ? options.start : ctx.currentTime;
    const dur = Math.max(0.02, Number(options.dur) || 0.12);
    const peak = Math.max(0.0002, Number(options.gain) || 0.08);
    const attack = Math.max(0.004, Math.min(dur * 0.4, Number(options.attack) || 0.015));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type || 'sine';
    if (typeof osc.frequency.setValueAtTime === 'function') {
      osc.frequency.setValueAtTime(Math.max(1, options.freq || 440), start);
      if (Number.isFinite(options.to) && options.to > 0) {
        osc.frequency.exponentialRampToValueAtTime(options.to, start + dur);
      }
    } else {
      osc.frequency.value = Math.max(1, options.freq || 440);
    }

    if (typeof gain.gain.setValueAtTime === 'function') {
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    } else {
      gain.gain.value = peak;
    }

    let chain = osc;
    let filter = null;
    if (options.filter && typeof ctx.createBiquadFilter === 'function') {
      filter = ctx.createBiquadFilter();
      filter.type = options.filter.type || 'lowpass';
      filter.frequency.setValueAtTime(options.filter.freq || 1200, start);
      if (Number.isFinite(options.filter.to)) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(20, options.filter.to),
          start + dur
        );
      }
      if (Number.isFinite(options.filter.q) && filter.Q) {
        filter.Q.setValueAtTime(options.filter.q, start);
      }
      chain.connect(filter);
      chain = filter;
      this.trackNode(filter, slot);
    }

    let panner = null;
    if (Number.isFinite(options.pan) && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      chain.connect(panner);
      chain = panner;
      this.trackNode(panner, slot);
    }

    chain.connect(gain);
    gain.connect(bus);
    this.trackNode(gain, slot);

    if (options.reverb && this.reverbInput && typeof ctx.createGain === 'function') {
      const send = ctx.createGain();
      send.gain.value = Math.max(0, Math.min(1, options.reverb));
      gain.connect(send);
      send.connect(this.reverbInput);
      this.trackNode(send, slot);
    }

    let lfo = null;
    let lfoGain = null;
    if (options.vibrato) {
      lfo = ctx.createOscillator();
      lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(options.vibrato.rate || 16, start);
      lfoGain.gain.setValueAtTime(options.vibrato.depth || 12, start);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      this.trackNode(lfoGain, slot);
      this.attachCleanup(lfo, slot);
      lfo.start(start);
      lfo.stop(start + dur);
    }

    const stopAt = start + dur + 0.03;
    this.attachCleanup(osc, slot);
    osc.start(start);
    osc.stop(stopAt);
    return {
      slot,
      start,
      stop: (when = ctx.currentTime) => {
        try {
          osc.stop(Math.max(when, start));
        } catch {
          /* da dung */
        }
        if (lfo) {
          try {
            lfo.stop(Math.max(when, start));
          } catch {
            /* da dung */
          }
        }
      },
      cancel: () => this.releaseVoice(slot),
    };
  }

  noise(options = {}) {
    if (!this.ready || !this.ctx) return null;
    const ctx = this.ctx;
    const music = options.bus === 'music';
    const slot = music
      ? { id: (this.voiceSeq += 1), priority: true, nodes: [], music: true }
      : this.acquireVoice(options.priority === true);
    if (!slot) return null;
    const bus = music ? this.musicBus : this.sfxBus;
    if (!bus) {
      this.releaseVoice(slot);
      return null;
    }
    if (!this.noiseBuffer) {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }

    const start = Number.isFinite(options.start) ? options.start : ctx.currentTime;
    const dur = Math.max(0.02, Number(options.dur) || 0.12);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const gain = ctx.createGain();
    const peak = Math.max(0.0002, Number(options.gain) || 0.05);
    if (typeof gain.gain.setValueAtTime === 'function') {
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    } else {
      gain.gain.value = peak;
    }

    let chain = source;
    if (typeof ctx.createBiquadFilter === 'function') {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filterType || 'bandpass';
      filter.frequency.setValueAtTime(options.freq || 1500, start);
      if (Number.isFinite(options.to)) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), start + dur);
      }
      if (Number.isFinite(options.q) && filter.Q) filter.Q.setValueAtTime(options.q, start);
      chain.connect(filter);
      chain = filter;
      this.trackNode(filter, slot);
    }
    if (Number.isFinite(options.pan) && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      chain.connect(panner);
      chain = panner;
      this.trackNode(panner, slot);
    }
    chain.connect(gain);
    gain.connect(bus);
    this.trackNode(gain, slot);
    if (options.reverb && this.reverbInput) {
      const send = ctx.createGain();
      send.gain.value = Math.max(0, Math.min(1, options.reverb));
      gain.connect(send);
      send.connect(this.reverbInput);
      this.trackNode(send, slot);
    }

    const stopAt = start + dur + 0.02;
    this.attachCleanup(source, slot);
    source.start(start);
    source.stop(stopAt);
    return {
      slot,
      start,
      stop: (when = ctx.currentTime) => {
        try {
          source.stop(Math.max(when, start));
        } catch {
          /* da dung */
        }
      },
      cancel: () => this.releaseVoice(slot),
    };
  }

  suspend() {
    if (!this.ctx || typeof this.ctx.suspend !== 'function') return Promise.resolve(false);
    try {
      return Promise.resolve(this.ctx.suspend()).then(() => true).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  resume() {
    if (!this.ctx || typeof this.ctx.resume !== 'function') return Promise.resolve(false);
    try {
      return Promise.resolve(this.ctx.resume()).then(() => true).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  stats() {
    return {
      contexts: this.ctx ? 1 : 0,
      ready: this.ready,
      state: this.state,
      liveNodes: this.nodes.size,
      voices: this.voices.length,
    };
  }

  close() {
    for (const slot of [...this.voices]) this.releaseVoice(slot);
    if (this.ctx && typeof this.ctx.close === 'function') {
      try {
        this.ctx.close();
      } catch {
        /* bo qua */
      }
    }
    this.ctx = null;
    this.ready = false;
  }
}
