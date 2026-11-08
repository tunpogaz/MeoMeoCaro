/**
 * Kiem thu am thanh: logic thuan, engine voi AudioContext gia, nhac nen
 * va cua vao duy nhat (facade). Khong phat ra loa that.
 */
import assert from 'node:assert/strict';
import { AudioEngine } from '../public/js/audio-engine.js';
import { MusicPlayer } from '../public/js/music.js';
import { createAudioFacade } from '../public/js/audio.js';
import { SFX_NAMES, playSfx } from '../public/js/sfx.js';
import {
  AUDIO_DEFAULTS,
  MUSIC_BPM,
  PENTATONIC,
  buildBar,
  clampVolume,
  musicSceneFor,
  normalizeAudioSettings,
  resultEffectKey,
  resultPerspective,
  volumeCurve,
} from '../public/js/audio-logic.js';

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(error);
  }
}

// ---------------------------------------------------------------------------
// AudioContext gia: du de engine/music chay va dem node song
// ---------------------------------------------------------------------------
class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.calls = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.calls.push(['set', value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.calls.push(['exp', value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.calls.push(['linear', value, time]);
  }

  setTargetAtTime(value, time, constant) {
    this.value = value;
    this.calls.push(['target', value, time, constant]);
  }
}

class FakeNode {
  constructor(ctx) {
    this.ctx = ctx;
    this.outputs = [];
  }

  connect(node) {
    this.outputs.push(node);
    return node;
  }

  disconnect() {
    this.outputs = [];
  }
}

class FakeSource extends FakeNode {
  start(when = 0) {
    this.started = when;
  }

  stop(when = 0) {
    this.stopped = when;
    this.ctx.pending.push(this);
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 2000;
    this.state = 'suspended';
    this.destination = new FakeNode(this);
    this.pending = [];
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.closed = false;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.suspendCalls += 1;
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }

  flushEnded() {
    const list = this.pending.splice(0);
    for (const source of list) {
      if (source.ended) continue;
      source.ended = true;
      source.onended?.();
    }
  }

  createGain() {
    const node = new FakeNode(this);
    node.gain = new FakeParam(1);
    return node;
  }

  createOscillator() {
    const node = new FakeSource(this);
    node.type = 'sine';
    node.frequency = new FakeParam(440);
    node.detune = new FakeParam(0);
    return node;
  }

  createBufferSource() {
    const node = new FakeSource(this);
    node.buffer = null;
    node.loop = false;
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode(this);
    node.type = 'lowpass';
    node.frequency = new FakeParam(1000);
    node.Q = new FakeParam(1);
    return node;
  }

  createStereoPanner() {
    const node = new FakeNode(this);
    node.pan = new FakeParam(0);
    return node;
  }

  createConvolver() {
    const node = new FakeNode(this);
    node.buffer = null;
    return node;
  }

  createDynamicsCompressor() {
    return new FakeNode(this);
  }

  createBuffer(channels, length) {
    return {
      length,
      getChannelData() {
        return new Float32Array(length);
      },
    };
  }
}

function createFakeTimers() {
  let nextId = 1;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    intervals,
    timeouts,
    setIntervalFn(fn, ms) {
      const id = nextId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearIntervalFn(id) {
      intervals.delete(id);
    },
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeoutFn(id) {
      timeouts.delete(id);
    },
  };
}

function createFakeWindow(enabled = true) {
  return {
    __MMC_TEST__: enabled,
    __MMC_AUDIO_LOG: [],
    performance: { now: () => 12.5 },
  };
}

function createFakeDocument() {
  const listeners = new Map();
  return {
    hidden: false,
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    dispatch(type) {
      for (const fn of listeners.get(type) || []) fn();
    },
  };
}

function makeEngine() {
  return new AudioEngine({ AudioContextClass: FakeAudioContext });
}

function makeFacade(options = {}) {
  const engine = options.engine || makeEngine();
  const timers = options.timers || createFakeTimers();
  const win = options.win || createFakeWindow();
  const doc = options.doc || createFakeDocument();
  const music =
    options.music ||
    new MusicPlayer(engine, {
      ...timers,
      onLog: (event) => {
        if (win.__MMC_TEST__) win.__MMC_AUDIO_LOG.push({ t: 12.5, ...event });
      },
    });
  const facade = createAudioFacade({ engine, music, windowRef: win, documentRef: doc });
  return { engine, timers, win, doc, music, facade };
}

function near(actual, expected, epsilon = 1e-3) {
  return Math.abs(actual - expected) <= epsilon;
}

console.log('audio-logic');

await check('resultPerspective: online thang/thua/hoa theo mySymbol', () => {
  assert.equal(
    resultPerspective({ mode: 'online', winner: 'A', mySymbol: 'A' }),
    'win'
  );
  assert.equal(
    resultPerspective({ mode: 'online', winner: 'B', mySymbol: 'A' }),
    'lose'
  );
  assert.equal(
    resultPerspective({ mode: 'online', winner: 'draw', mySymbol: 'A' }),
    'draw'
  );
  assert.equal(resultPerspective({ mode: 'online', winner: 'A' }), 'neutral');
  assert.equal(
    resultPerspective({ mode: 'online', winner: 'A', mySymbol: 'A', reason: 'abandon' }),
    'win'
  );
  assert.equal(
    resultPerspective({ mode: 'online', winner: 'B', mySymbol: 'A', reason: 'abandon' }),
    'lose'
  );
});

await check('resultPerspective: choi voi may va 2 nguoi cung may', () => {
  assert.equal(resultPerspective({ mode: 'ai', winner: 'A' }), 'win');
  assert.equal(resultPerspective({ mode: 'ai', winner: 'B' }), 'lose');
  assert.equal(resultPerspective({ mode: 'ai', winner: 'draw' }), 'draw');
  assert.equal(resultPerspective({ mode: 'local', winner: 'A' }), 'win');
  assert.equal(resultPerspective({ mode: 'local', winner: 'B' }), 'win');
  assert.equal(resultPerspective({ mode: 'local', winner: 'draw' }), 'draw');
});

await check('resultPerspective: replay va thieu du lieu la neutral', () => {
  assert.equal(resultPerspective({ mode: 'replay', winner: 'A' }), 'neutral');
  assert.equal(resultPerspective({}), 'neutral');
  assert.equal(resultPerspective({ mode: 'ai', winner: null }), 'neutral');
});

await check('musicSceneFor: man hinh menu va man hinh khac', () => {
  for (const screen of [
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
  ]) {
    assert.equal(musicSceneFor(screen), 'menu', screen);
  }
  for (const screen of ['game', 'replay', 'unknown', '', null, undefined, 42]) {
    assert.equal(musicSceneFor(screen), 'none', String(screen));
  }
});

await check('clampVolume: kep 0..1 va fallback voi du lieu hong', () => {
  assert.equal(clampVolume(0.5), 0.5);
  assert.equal(clampVolume(-2), 0);
  assert.equal(clampVolume(3), 1);
  assert.equal(clampVolume('0.25'), 0.25);
  assert.equal(clampVolume(NaN, 0.8), 0.8);
  assert.equal(clampVolume('abc', 0.3), 0.3);
  assert.equal(clampVolume(undefined, 7), 1);
  assert.equal(volumeCurve(0.5), 0.25);
});

await check('normalizeAudioSettings: mac dinh, khoa cu va gia tri hong', () => {
  assert.deepEqual(normalizeAudioSettings({}), {
    sound: true,
    music: true,
    volumeMaster: AUDIO_DEFAULTS.volumeMaster,
    volumeMusic: AUDIO_DEFAULTS.volumeMusic,
    volumeSfx: AUDIO_DEFAULTS.volumeSfx,
  });
  assert.deepEqual(normalizeAudioSettings(null), normalizeAudioSettings({}));
  assert.deepEqual(normalizeAudioSettings('corrupt'), normalizeAudioSettings({}));

  const legacy = normalizeAudioSettings({
    sound: false,
    music: false,
    masterVolume: 0.25,
    musicVolume: 0.5,
    sfxVolume: 0.75,
  });
  assert.equal(legacy.sound, false);
  assert.equal(legacy.music, false);
  assert.equal(legacy.volumeMaster, 0.25);
  assert.equal(legacy.volumeMusic, 0.5);
  assert.equal(legacy.volumeSfx, 0.75);

  const corrupt = normalizeAudioSettings({
    volumeMaster: NaN,
    volumeMusic: -1,
    volumeSfx: 9,
  });
  assert.equal(corrupt.volumeMaster, AUDIO_DEFAULTS.volumeMaster);
  assert.equal(corrupt.volumeMusic, 0);
  assert.equal(corrupt.volumeSfx, 1);
});

await check('resultEffectKey: on dinh khi room:state lap lai, doi khi co nuoc moi', () => {
  const base = { roomId: 'R1', round: 0, moveCount: 5, winner: 'A' };
  const first = resultEffectKey(base);
  assert.equal(first, resultEffectKey({ ...base }));
  assert.notEqual(first, resultEffectKey({ ...base, moveCount: 6 }));
  assert.notEqual(first, resultEffectKey({ ...base, roomId: 'R2' }));
  assert.notEqual(first, resultEffectKey({ ...base, round: 1 }));
  assert.notEqual(first, resultEffectKey({ ...base, winner: 'draw' }));
});

await check('buildBar: not thuoc thang, thoi luong dung tempo, lap tuan hoan', () => {
  const barSeconds = (60 / MUSIC_BPM) * 4;
  const allowedVoices = new Set(['pad', 'bass', 'pluck', 'kick', 'hat', 'bell']);
  for (let barIndex = 0; barIndex < 8; barIndex += 1) {
    for (let seed = 0; seed < 3; seed += 1) {
      const bar = buildBar(barIndex, seed);
      assert.equal(bar.bpm, MUSIC_BPM);
      assert.ok(near(bar.duration, barSeconds), `duration bar ${barIndex}`);
      assert.ok(bar.events.length > 0);
      for (const event of bar.events) {
        assert.ok(allowedVoices.has(event.voice), event.voice);
        assert.ok(event.time >= 0 && event.time < bar.duration);
        assert.ok(event.dur >= 0.02);
        assert.ok(event.time + event.dur <= bar.duration + 1e-3);
        assert.ok(event.freq > 0);
        assert.ok(event.vel > 0 && event.vel < 1);
        if (event.voice === 'pluck' || event.voice === 'bell') {
          const inScale = PENTATONIC.some(
            (freq) => near(freq, event.freq, 0.02) || near(freq * 2, event.freq, 0.02)
          );
          assert.ok(inScale, `pluck/bell ngoai thang: ${event.freq}`);
        }
      }
    }
  }

  const bar0 = buildBar(0, 0);
  const bar8 = buildBar(8, 0);
  assert.equal(bar8.duration, bar0.duration);
  const pad0 = bar0.events.filter((event) => event.voice === 'pad').map((event) => event.freq).sort();
  const pad8 = bar8.events.filter((event) => event.voice === 'pad').map((event) => event.freq).sort();
  assert.deepEqual(pad8, pad0);

  assert.notDeepEqual(buildBar(0, 1).events, buildBar(0, 2).events);
  assert.deepEqual(buildBar(3, 4), buildBar(3, 4));
});

console.log('audio-engine');

await check('engine: khong tao node truoc unlock, play bi bo qua', () => {
  const engine = makeEngine();
  assert.equal(engine.stats().contexts, 0);
  assert.equal(engine.stats().liveNodes, 0);
  assert.equal(engine.tone({ freq: 440, dur: 0.1 }), null);
  assert.equal(engine.noise({ dur: 0.1 }), null);

  const { facade, win } = makeFacade({ engine });
  assert.equal(facade.play('place', { symbol: 'A' }), false);
  assert.equal(facade.place({ symbol: 'A' }), false);
  assert.equal(win.__MMC_AUDIO_LOG.length, 0);
});

await check('engine: sau unlock moi tao node, phat xong node ve 0', () => {
  const engine = makeEngine();
  assert.equal(engine.unlock(), true);
  const ctx = engine.ctx;
  assert.ok(ctx instanceof FakeAudioContext);
  const handle = engine.tone({ freq: 440, dur: 0.15, gain: 0.05, type: 'sine' });
  assert.ok(handle);
  assert.ok(engine.stats().liveNodes > 0);
  ctx.flushEnded();
  assert.equal(engine.stats().liveNodes, 0);
  assert.equal(engine.stats().voices, 0);
});

await check('engine: gioi han 16 voice, khong bo am uu tien', () => {
  const engine = makeEngine();
  engine.unlock();
  for (let i = 0; i < 20; i += 1) {
    engine.tone({ freq: 200 + i, dur: 1, priority: false });
  }
  assert.equal(engine.stats().voices, 16);

  const priorityHandles = [];
  for (let i = 0; i < 4; i += 1) {
    const handle = engine.tone({ freq: 800 + i, dur: 1, priority: true });
    priorityHandles.push(handle);
  }
  assert.ok(priorityHandles.every(Boolean));
  assert.ok(engine.stats().voices > 16);

  engine.ctx.flushEnded();
  assert.equal(engine.stats().liveNodes, 0);
  assert.equal(engine.stats().voices, 0);
});

await check('engine: not nhac khong an slot da am cua hieu ung', () => {
  const engine = makeEngine();
  engine.unlock();
  const before = engine.stats().voices;
  engine.tone({ bus: 'music', freq: 440, dur: 0.2 });
  assert.equal(engine.stats().voices, before);
  engine.ctx.flushEnded();
  assert.equal(engine.stats().liveNodes, 0);
});

console.log('sfx');

await check('sfx: du ten moi va ten cu van chay', () => {
  for (const name of [
    'place',
    'win',
    'lose',
    'draw',
    'decline',
    'undo',
    'click',
    'error',
    'emote',
    'join',
    'turn',
  ]) {
    assert.ok(SFX_NAMES.includes(name), name);
  }
  const engine = makeEngine();
  engine.unlock();
  for (const name of SFX_NAMES) {
    assert.equal(playSfx(engine, name), true, name);
  }
  assert.equal(playSfx(engine, 'meow'), true);
  assert.equal(playSfx(engine, 'pop'), true);
  assert.equal(playSfx(engine, 'chime'), true);
  assert.equal(playSfx(engine, 'khong-ton-tai'), false);
  engine.ctx.flushEnded();
  assert.equal(engine.stats().liveNodes, 0);
});

await check('sfx place: meo cam khac meo xam, co bien thien va pan doi thu', () => {
  const makeStub = () => {
    const tones = [];
    const noises = [];
    return {
      stem: {
        ready: true,
        now: () => 0,
        tone(options) {
          tones.push(options);
          return {};
        },
        noise(options) {
          noises.push(options);
          return {};
        },
      },
      tones,
      noises,
    };
  };

  const low = makeStub();
  playSfx(low.stem, 'place', { symbol: 'A', random: () => 0.1 });
  const high = makeStub();
  playSfx(high.stem, 'place', { symbol: 'B', random: () => 0.1 });
  assert.ok(
    low.tones[1].freq > high.tones[1].freq,
    'Meo Cam phai cao hon Meo Xam'
  );
  assert.ok(low.tones[1].dur > 0.1 && low.tones[1].dur < 0.3);

  const seededA = makeStub();
  playSfx(seededA.stem, 'place', { symbol: 'A', random: () => 0 });
  const seededB = makeStub();
  playSfx(seededB.stem, 'place', { symbol: 'A', random: () => 1 });
  assert.notEqual(seededA.tones[1].freq, seededB.tones[1].freq);
  assert.notEqual(seededA.tones[1].dur, seededB.tones[1].dur);

  const opponent = makeStub();
  playSfx(opponent.stem, 'place', { symbol: 'A', mine: false, mode: 'online' });
  assert.ok(opponent.tones[1].pan > 0);

  const mine = makeStub();
  playSfx(mine.stem, 'place', { symbol: 'A', mine: true, mode: 'online' });
  assert.equal(mine.tones[1].pan, 0);

  const local = makeStub();
  playSfx(local.stem, 'place', { symbol: 'B', mine: false, mode: 'local' });
  assert.equal(local.tones[1].pan, 0);
});

console.log('music');

await check('music: mot bo phat, interval duoc xoa khi dung', () => {
  const engine = makeEngine();
  engine.unlock();
  const timers = createFakeTimers();
  const events = [];
  const music = new MusicPlayer(engine, {
    ...timers,
    onLog: (event) => events.push(event),
  });

  assert.equal(music.start({ fadeInMs: 200 }), true);
  assert.equal(timers.intervals.size, 1);
  assert.ok(events.some((event) => event.type === 'music' && event.action === 'start'));
  assert.ok(engine.stats().liveNodes > 0);

  assert.equal(music.start({ fadeInMs: 200 }), true);
  assert.equal(timers.intervals.size, 1);

  music.stop({ fadeMs: 50 });
  assert.equal(timers.intervals.size, 0);
  assert.equal(music.stats().timer, false);
  assert.ok(events.some((event) => event.action === 'stop'));

  engine.ctx.flushEnded();
  assert.equal(engine.stats().liveNodes, 0);
});

await check('music: timer mac dinh khong phu thuoc this (Chrome illegal invocation)', () => {
  const engine = makeEngine();
  engine.unlock();
  const realInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  let intervalCalls = 0;
  globalThis.setInterval = function (fn, ms) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    intervalCalls += 1;
    return 99;
  };
  globalThis.clearInterval = function (id) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
  };
  try {
    const music = new MusicPlayer(engine);
    assert.equal(music.start({ fadeInMs: 100 }), true);
    assert.equal(intervalCalls, 1);
    assert.equal(music.stats().timer, true);
    music.stop({ fadeMs: 10 });
    assert.equal(music.stats().timer, false);
  } finally {
    globalThis.setInterval = realInterval;
    globalThis.clearInterval = realClearInterval;
  }
});

console.log('facade');

await check('facade: truoc tuong tac khong log, nhac duoc nho va bat sau unlock', () => {
  const { engine, win, facade } = makeFacade();
  facade.setEnabled(true);
  facade.setMusicEnabled(true);
  facade.setScene('home');
  assert.equal(win.__MMC_AUDIO_LOG.length, 0);
  assert.equal(engine.stats().contexts, 0);

  assert.equal(facade.unlock(), true);
  const log = win.__MMC_AUDIO_LOG;
  assert.ok(log.some((event) => event.type === 'unlock' && event.ok === true));
  assert.ok(
    log.some((event) => event.type === 'music' && event.action === 'start' && event.scene === 'menu')
  );
  assert.ok(engine.stats().liveNodes > 0);
});

await check('facade: play/place/result ghi log dung va neutral im lang', () => {
  const { engine, win, facade } = makeFacade();
  facade.unlock();
  win.__MMC_AUDIO_LOG.length = 0;

  assert.equal(facade.place({ symbol: 'B', mine: false, mode: 'online' }), true);
  assert.equal(facade.result('win'), true);
  assert.equal(facade.result('lose'), true);
  assert.equal(facade.result('draw'), true);
  assert.equal(facade.result('neutral'), false);

  const log = win.__MMC_AUDIO_LOG;
  const place = log.find((event) => event.type === 'sfx' && event.name === 'place');
  assert.equal(place.symbol, 'B');
  assert.equal(place.mine, false);
  assert.equal(place.mode, 'online');
  assert.ok(log.some((event) => event.name === 'win'));
  assert.ok(log.some((event) => event.name === 'lose'));
  assert.ok(log.some((event) => event.name === 'draw'));
  assert.equal(log.filter((event) => event.name === 'neutral').length, 0);
  engine.ctx.flushEnded();
});

await check('facade: menu sang menu khong bat lai nhac, vao van thi dung', () => {
  const { engine, timers, win, facade } = makeFacade();
  facade.unlock();
  const starts = () =>
    win.__MMC_AUDIO_LOG.filter(
      (event) => event.type === 'music' && event.action === 'start'
    ).length;
  const before = starts();
  facade.setScene('stats');
  assert.equal(starts(), before);
  assert.equal(timers.intervals.size, 1);

  facade.setScene('game');
  assert.equal(timers.intervals.size, 0);
  assert.ok(
    win.__MMC_AUDIO_LOG.some((event) => event.type === 'music' && event.action === 'stop')
  );
  engine.ctx.flushEnded();
});

await check('facade: nghe thu hoat dong truoc unlock va log dung am', () => {
  const { engine, win, facade } = makeFacade();
  assert.equal(facade.playPreview('orange'), true);
  assert.equal(facade.playPreview('gray'), true);
  assert.equal(facade.playPreview('win'), true);
  assert.equal(facade.playPreview('lose'), true);
  assert.equal(facade.playPreview('draw'), true);
  assert.equal(facade.playPreview('decline'), true);

  const log = win.__MMC_AUDIO_LOG;
  assert.ok(log.some((event) => event.type === 'unlock' && event.ok === true));
  const orange = log.find((event) => event.type === 'sfx' && event.symbol === 'A');
  const gray = log.find((event) => event.type === 'sfx' && event.symbol === 'B');
  assert.ok(orange && orange.preview === true);
  assert.ok(gray && gray.preview === true);
  assert.ok(log.some((event) => event.type === 'preview' && event.name === 'orange'));
  assert.ok(log.some((event) => event.type === 'preview' && event.name === 'decline'));
  engine.ctx.flushEnded();
});

await check('facade: nghe thu nhac bat/tat duoc truoc unlock', () => {
  const { engine, timers, win, facade } = makeFacade();
  facade.setScene('game');
  assert.equal(facade.playPreview('music'), true);
  assert.equal(timers.intervals.size, 1);
  assert.equal(facade.playPreview('music'), false);
  assert.equal(timers.intervals.size, 0);
  assert.ok(
    win.__MMC_AUDIO_LOG.some(
      (event) => event.type === 'preview' && event.name === 'music'
    )
  );
  engine.ctx.flushEnded();
});

await check('facade: am luong duoc kep va ap dung ngay', () => {
  const { engine, facade } = makeFacade();
  const applied = facade.setVolumes({ master: 0.5, music: 0.25, sfx: 2 });
  assert.deepEqual(applied, { master: 0.5, music: 0.25, sfx: 1 });
  const again = facade.setVolumes({ master: -3 });
  assert.deepEqual(again, { master: 0, music: 0.25, sfx: 1 });
  assert.deepEqual(engine.volumes, { master: 0, music: 0.25, sfx: 1 });
});

await check('facade: tab an thi suspend va tam dung nhac, hien lai thi tiep tuc', () => {
  const { engine, doc, facade, music } = makeFacade();
  facade.unlock();
  assert.equal(engine.state, 'running');
  assert.equal(music.isRunning(), true);

  doc.hidden = true;
  doc.dispatch('visibilitychange');
  assert.equal(engine.state, 'suspended');
  assert.equal(music.isRunning(), false);

  doc.hidden = false;
  doc.dispatch('visibilitychange');
  assert.equal(engine.state, 'running');
  assert.equal(music.isRunning(), true);
  engine.ctx.flushEnded();
});

await check('facade: tat am thanh dung nhac va interval, bat lai thi phuc hoi', async () => {
  const { engine, timers, facade, music } = makeFacade();
  facade.unlock();
  assert.equal(music.isRunning(), true);

  facade.setEnabled(false);
  assert.equal(music.isRunning(), false);
  assert.equal(timers.intervals.size, 0);
  assert.equal(engine.state, 'suspended');
  assert.equal(facade.play('click'), false);

  facade.setEnabled(true);
  await Promise.resolve();
  assert.equal(engine.state, 'running');
  assert.equal(music.isRunning(), true);
  assert.equal(facade.play('click'), true);
  engine.ctx.flushEnded();
});

await check('facade: khong ghi log khi khong bat __MMC_TEST__', () => {
  const { engine, win, facade } = makeFacade({ win: createFakeWindow(false) });
  facade.unlock();
  facade.place({ symbol: 'A' });
  assert.deepEqual(win.__MMC_AUDIO_LOG, []);
  engine.ctx.flushEnded();
});

console.log('settings storage');

await check('storage: doc/ghi/migrate cai dat am thanh', async () => {
  const previousWindow = globalThis.window;
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  try {
    store.set(
      'mmc.settings',
      JSON.stringify({
        sound: false,
        masterVolume: 0.25,
        musicVolume: 0.5,
        sfxVolume: 0.75,
        lang: 'en',
        reduceMotion: true,
        boardSize: 3,
      })
    );
    const storage = await import(`../public/js/storage.js?audio-migrate=${Date.now()}`);
    const loaded = storage.loadSettings();
    assert.equal(loaded.sound, false);
    assert.equal(loaded.music, true);
    assert.equal(loaded.volumeMaster, 0.25);
    assert.equal(loaded.volumeMusic, 0.5);
    assert.equal(loaded.volumeSfx, 0.75);
    assert.equal(loaded.lang, 'en');
    assert.equal(loaded.reduceMotion, true);

    const migrated = JSON.parse(store.get('mmc.settings'));
    assert.equal(migrated.volumeMaster, 0.25);
    assert.equal(migrated.masterVolume, undefined);

    store.set('mmc.settings', 'khong-phai-json');
    const corrupt = storage.loadSettings();
    assert.deepEqual(
      {
        sound: corrupt.sound,
        music: corrupt.music,
        volumeMaster: corrupt.volumeMaster,
        volumeMusic: corrupt.volumeMusic,
        volumeSfx: corrupt.volumeSfx,
      },
      {
        sound: AUDIO_DEFAULTS.sound,
        music: AUDIO_DEFAULTS.music,
        volumeMaster: AUDIO_DEFAULTS.volumeMaster,
        volumeMusic: AUDIO_DEFAULTS.volumeMusic,
        volumeSfx: AUDIO_DEFAULTS.volumeSfx,
      }
    );

    storage.saveSettings({
      sound: true,
      music: false,
      volumeMaster: -5,
      volumeMusic: 9,
      volumeSfx: 'hong',
      lang: 'vi',
      reduceMotion: false,
      boardSize: 3,
    });
    const saved = JSON.parse(store.get('mmc.settings'));
    assert.equal(saved.volumeMaster, 0);
    assert.equal(saved.volumeMusic, 1);
    assert.equal(saved.volumeSfx, AUDIO_DEFAULTS.volumeSfx);
    assert.equal(saved.music, false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

console.log('');
if (failed > 0) {
  console.error(`${failed} test that bai, ${passed} test thanh cong`);
  process.exit(1);
}
console.log(`Tat ca ${passed} test am thanh deu thanh cong`);
