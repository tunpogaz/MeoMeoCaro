/**
 * Cua vao duy nhat cho am thanh cua ung dung.
 * Giu nguyen cac ham cu (unlock/setEnabled/play/...) de khong vo code,
 * dong thoi them canh (scene), am luong va nghe thu.
 */
import { AudioEngine } from './audio-engine.js';
import { MusicPlayer } from './music.js';
import { playSfx } from './sfx.js';
import { clampVolume, musicSceneFor } from './audio-logic.js';

const SILENT_UNLOCK = { dur: 0.012, freq: 440, type: 'sine', gain: 0.0001 };

export function createAudioFacade(options = {}) {
  const engine = options.engine || new AudioEngine();
  const windowRef = options.windowRef || (typeof window !== 'undefined' ? window : null);
  const documentRef =
    options.documentRef ?? (typeof document !== 'undefined' ? document : null);

  const log = (event) => {
    if (!windowRef?.__MMC_TEST__) return;
    const list = windowRef.__MMC_AUDIO_LOG || (windowRef.__MMC_AUDIO_LOG = []);
    const t = windowRef.performance?.now?.() ?? Date.now();
    list.push({ t, ...event });
  };

  const logActive = (event) => {
    if (unlocked) log(event);
  };

  const music =
    options.music ||
    new MusicPlayer(engine, { onLog: (event) => log(event) });

  let enabled = options.sound !== false;
  let musicEnabled = options.music !== false;
  let unlocked = false;
  let scene = 'menu';
  let previewMusic = false;

  function startMenuMusic(fadeInMs = 1200) {
    if (!unlocked || !enabled || !engine.ready) return false;
    if (!musicEnabled && !previewMusic) return false;
    if (scene !== 'menu' && !previewMusic) return false;
    return music.start({ fadeInMs });
  }

  function unlock() {
    if (!unlocked) {
      const ok = engine.unlock();
      unlocked = ok;
      log({ type: 'unlock', ok });
      if (ok) {
        // iOS Safari can mot buffer that su trong chinh cu chi nguoi dung.
        try {
          engine.tone({ ...SILENT_UNLOCK, start: engine.now() });
        } catch {
          /* am thanh phu */
        }
      }
    } else {
      engine.unlock();
    }
    if (unlocked && enabled) startMenuMusic(1200);
    return unlocked;
  }

  function play(name, opts = {}) {
    if (!enabled || !unlocked || !engine.ready) return false;
    const ok = playSfx(engine, name, opts);
    if (ok) {
      log({
        type: 'sfx',
        name,
        symbol: opts.symbol || null,
        mine: opts.mine !== false,
        mode: opts.mode || null,
        preview: opts.preview === true,
      });
    }
    return ok;
  }

  function place(opts = {}) {
    return play('place', opts);
  }

  function result(perspective, opts = {}) {
    if (perspective !== 'win' && perspective !== 'lose' && perspective !== 'draw') {
      return false;
    }
    if (music.isRunning()) music.duck(1500);
    return play(perspective, opts);
  }

  function setEnabled(value) {
    enabled = value !== false;
    if (!enabled) {
      music.stop({ fadeMs: 180 });
      engine.suspend();
    } else if (unlocked) {
      engine.unlock();
      engine.resume().catch(() => {});
      startMenuMusic(600);
    }
    logActive({ type: 'power', enabled });
  }

  function setMusicEnabled(value) {
    musicEnabled = value === true;
    if (!musicEnabled) {
      previewMusic = false;
      music.stop({ fadeMs: 500 });
    } else if (unlocked && enabled) {
      startMenuMusic(900);
    }
    logActive({ type: 'musicEnabled', enabled: musicEnabled });
  }

  function setScene(screen) {
    const next = musicSceneFor(screen);
    const changed = next !== scene;
    scene = next;
    if (enabled && unlocked) {
      if (next === 'menu') {
        startMenuMusic(1200);
      } else if (changed || music.isRunning() || previewMusic) {
        previewMusic = false;
        music.stop({ fadeMs: 700 });
      }
    }
    logActive({ type: 'musicScene', scene: next, screen });
    return next;
  }

  function setVolumes(next = {}) {
    const applied = engine.setVolumes({
      master: next.master ?? next.volumeMaster,
      music: next.music ?? next.volumeMusic,
      sfx: next.sfx ?? next.volumeSfx,
    });
    logActive({ type: 'volumes', ...applied });
    return applied;
  }

  function toggleMusicPreview() {
    unlock();
    if (!enabled || !unlocked || !engine.ready) return false;
    if (music.isRunning()) {
      previewMusic = false;
      music.stop({ fadeMs: 250 });
      return false;
    }
    previewMusic = true;
    const ok = music.start({ fadeInMs: 300 });
    log({ type: 'preview', name: 'music', active: ok });
    return ok;
  }

  function playPreview(name) {
    if (name === 'music') return toggleMusicPreview();
    unlock();
    if (!enabled || !unlocked || !engine.ready) return false;
    if (name === 'orange' || name === 'gray') {
      const ok = play('place', {
        symbol: name === 'gray' ? 'B' : 'A',
        mine: true,
        mode: 'preview',
        preview: true,
      });
      log({ type: 'preview', name, active: ok });
      return ok;
    }
    const ok = play(name, { preview: true });
    log({ type: 'preview', name, active: ok });
    return ok;
  }

  function suspend() {
    if (music.isRunning()) music.pause();
    engine.suspend();
    logActive({ type: 'suspend' });
  }

  function resume() {
    if (documentRef?.hidden) return;
    engine.unlock();
    engine.resume();
    if (
      enabled &&
      unlocked &&
      (musicEnabled || previewMusic) &&
      (scene === 'menu' || previewMusic)
    ) {
      music.resume();
    }
    logActive({ type: 'resume' });
  }

  if (documentRef?.addEventListener) {
    documentRef.addEventListener('visibilitychange', () => {
      if (documentRef.hidden) suspend();
      else resume();
    });
  }

  function state() {
    return {
      enabled,
      musicEnabled,
      unlocked,
      scene,
      previewMusic,
      volumes: { ...engine.volumes },
      engine: engine.stats(),
      music: music.stats(),
    };
  }

  return {
    engine,
    music,
    unlock,
    play,
    place,
    result,
    setEnabled,
    setMusicEnabled,
    setScene,
    setVolumes,
    playPreview,
    toggleMusicPreview,
    suspend,
    resume,
    isEnabled: () => enabled,
    isMusicEnabled: () => musicEnabled,
    isUnlocked: () => unlocked,
    currentScene: () => scene,
    state,
  };
}

let singleton = null;

function getFacade() {
  if (singleton) return singleton;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  singleton = createAudioFacade({
    engine: new AudioEngine(),
    windowRef: window,
    documentRef: document,
  });
  return singleton;
}

/** Goi tu lan tuong tac dau tien de mo khoa am thanh. */
export function unlock() {
  return getFacade()?.unlock() ?? false;
}

export function play(name, opts = {}) {
  return getFacade()?.play(name, opts) ?? false;
}

export function place(opts = {}) {
  return getFacade()?.place(opts) ?? false;
}

export function result(perspective, opts = {}) {
  return getFacade()?.result(perspective, opts) ?? false;
}

export function setEnabled(value) {
  getFacade()?.setEnabled(value);
}

export function isEnabled() {
  return getFacade()?.isEnabled() ?? false;
}

export function setMusicEnabled(value) {
  getFacade()?.setMusicEnabled(value);
}

export function isMusicEnabled() {
  return getFacade()?.isMusicEnabled() ?? false;
}

export function setScene(screen) {
  getFacade()?.setScene(screen);
}

export function setVolumes(next = {}) {
  return getFacade()?.setVolumes(next) ?? null;
}

export function playPreview(name) {
  return getFacade()?.playPreview(name) ?? false;
}

export function toggleMusicPreview() {
  return getFacade()?.toggleMusicPreview() ?? false;
}

export function suspend() {
  getFacade()?.suspend();
}

export function resume() {
  getFacade()?.resume();
}

export function audioState() {
  return getFacade()?.state() ?? null;
}

export { clampVolume };
