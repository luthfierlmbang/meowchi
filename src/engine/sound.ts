/**
 * Sound engine — uses HTMLAudioElement for zero-latency playback.
 * Cat sounds are synthesized via Web Audio API (no external asset needed).
 */
import { useStore } from '../state/store';

// ── HTMLAudio for preloaded click ──────────────────────────────────────────

const _audioCache = new Map<string, HTMLAudioElement>();

function getAudio(url: string): HTMLAudioElement {
  let el = _audioCache.get(url);
  if (!el) {
    el = new Audio(url);
    el.preload = 'auto';
    el.load();
    _audioCache.set(url, el);
  }
  return el;
}

export const CLICK_SOUND = '/assets/Click.ogg';
export const MEOW_SOUND = '/assets/cat-meow.mp3';
export const MEOW_SOUND_ALT = '/assets/Sound/cat-meow2.mp3';
export const BACKGROUND_MUSIC = '/assets/Sound/Backsound.mp3';
export const PURRING_SLEEP_SOUND = '/assets/Sound/purring-sleep.mp3';

const MEOW_VARIANTS = [MEOW_SOUND, MEOW_SOUND_ALT] as const;
const BGM_VOLUME = 0.12;
const PURRING_VOLUME = 0.18;

let _backgroundMusic: HTMLAudioElement | null = null;
let _purringSleep: HTMLAudioElement | null = null;
let _audioUnlocked = false;

function getBgmMultiplier(): number {
  try {
    return useStore.getState().bgmVolume;
  } catch {
    return 0.5;
  }
}

function getSfxMultiplier(): number {
  try {
    return useStore.getState().sfxVolume;
  } catch {
    return 0.5;
  }
}

export function updateVolumes(): void {
  const bgmMul = getBgmMultiplier();
  if (_backgroundMusic) {
    _backgroundMusic.volume = BGM_VOLUME * bgmMul;
  }
  if (_purringSleep) {
    _purringSleep.volume = PURRING_VOLUME * bgmMul;
  }
}

export function preloadSounds(): void {
  getAudio(CLICK_SOUND);
  getAudio(MEOW_SOUND);
  getAudio(MEOW_SOUND_ALT);
  getAudio(BACKGROUND_MUSIC);
  getAudio(PURRING_SLEEP_SOUND);
}

export function playSound(url: string, volume = 0.6): void {
  try {
    const clone = getAudio(url).cloneNode() as HTMLAudioElement;
    clone.volume = volume * getSfxMultiplier();
    void clone.play().catch(() => {});
  } catch { /* ignore */ }
}

export function playClick(): void {
  playSound(CLICK_SOUND, 0.5);
}

function getLoopingAudio(url: string, volume: number): HTMLAudioElement {
  const el = getAudio(url);
  el.loop = true;
  el.volume = volume;
  return el;
}

export function startBackgroundMusic(): void {
  _backgroundMusic = _backgroundMusic ?? getLoopingAudio(BACKGROUND_MUSIC, BGM_VOLUME * getBgmMultiplier());
  _backgroundMusic.volume = BGM_VOLUME * getBgmMultiplier();
  void _backgroundMusic.play().catch(() => {});
}

export function setSleepPurring(enabled: boolean): void {
  _purringSleep = _purringSleep ?? getLoopingAudio(PURRING_SLEEP_SOUND, PURRING_VOLUME * getBgmMultiplier());
  if (enabled) {
    _purringSleep.volume = PURRING_VOLUME * getBgmMultiplier();
    void _purringSleep.play().catch(() => {});
    return;
  }
  _purringSleep.pause();
  _purringSleep.currentTime = 0;
}

export function unlockAmbientAudio(isSleeping: () => boolean): void {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  startBackgroundMusic();
  setSleepPurring(isSleeping());
}

// ── Cat sounds ─────────────────────────────────────────────────────────────

/**
 * Play cat sound.
 * kind: 'poke' = meow (tap), 'lift' = softer meow (hold/carry)
 */
export async function playCatSound(kind: 'poke' | 'lift'): Promise<void> {
  const url = MEOW_VARIANTS[Math.floor(Math.random() * MEOW_VARIANTS.length)];
  const clone = getAudio(url).cloneNode() as HTMLAudioElement;
  const baseVolume = kind === 'lift' ? 0.22 : 0.35;
  clone.volume = baseVolume * getSfxMultiplier();
  // For lift, slow down playback slightly for a softer feel
  if (kind === 'lift') clone.playbackRate = 0.8;
  void clone.play().catch(() => {});
}
