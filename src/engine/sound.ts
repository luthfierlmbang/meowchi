/**
 * Sound engine — uses HTMLAudioElement for zero-latency playback.
 * Cat sounds are synthesized via Web Audio API (no external asset needed).
 */

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

export function preloadSounds(): void {
  getAudio(CLICK_SOUND);
  getAudio(MEOW_SOUND);
}

export function playSound(url: string, volume = 0.6): void {
  try {
    const clone = getAudio(url).cloneNode() as HTMLAudioElement;
    clone.volume = volume;
    void clone.play().catch(() => {});
  } catch { /* ignore */ }
}

export function playClick(): void {
  playSound(CLICK_SOUND, 0.5);
}

// ── Cat sounds ─────────────────────────────────────────────────────────────

/**
 * Play cat sound.
 * kind: 'poke' = meow (tap), 'lift' = softer meow (hold/carry)
 */
export async function playCatSound(kind: 'poke' | 'lift'): Promise<void> {
  const clone = getAudio(MEOW_SOUND).cloneNode() as HTMLAudioElement;
  clone.volume = kind === 'lift' ? 0.22 : 0.35;
  // For lift, slow down playback slightly for a softer feel
  if (kind === 'lift') clone.playbackRate = 0.8;
  void clone.play().catch(() => {});
}
