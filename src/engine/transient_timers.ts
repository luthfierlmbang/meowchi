/**
 * Transient animation timers for `eating` / `scratching` / `pooping` (Req 4.7-4.9, 6.7-6.9).
 *
 * Each scheduler:
 *   1. Starts a `setTimeout` for the configured duration.
 *   2. When the timer fires, applies the post-animation stat delta atomically
 *      via `useStore.getState().atomicApplyStatDelta(...)`.
 *   3. Invokes `handlers.onAnimationEnd({ kind: 'animation_end' })` so the
 *      caller can drive the state machine back to `idle`.
 *
 * Pooping has two causes (design §17 Risk #4):
 *   - 'drop'   — pet placed on litterbox: Bladder is reset to exactly 100 (Req 6.9).
 *   - 'forced' — Bladder hit 0 and triggered a forced poop: Bladder STAYS at 0
 *                (no auto-reset). The user must manually place the pet on a
 *                litterbox to clean up.
 */
import { useStore } from '../state/store';
import {
  DURATION_EATING_MS,
  DURATION_POOPING_MS,
  DURATION_SCRATCHING_MS,
  type StateEvent,
} from './state_machine';

export type PoopingCause = 'drop' | 'forced';

export interface TransientHandlers {
  /** Called when the animation timer fires; caller dispatches via state machine. */
  onAnimationEnd?: (event: StateEvent) => void;
}

const _activeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function clearTimer(key: string): void {
  const t = _activeTimers.get(key);
  if (t !== undefined) {
    clearTimeout(t);
    _activeTimers.delete(key);
  }
}

/**
 * Schedule the eating animation timer. After 5 s, apply Hunger +30 (clamp 100)
 * and dispatch animation_end (Req 4.8, 6.7).
 */
export function scheduleEating(handlers: TransientHandlers = {}): void {
  clearTimer('eating');
  const t = setTimeout(() => {
    _activeTimers.delete('eating');
    const state = useStore.getState();
    state.atomicApplyStatDelta({ hunger: +30 });
    handlers.onAnimationEnd?.({ kind: 'animation_end' });
  }, DURATION_EATING_MS);
  _activeTimers.set('eating', t);
}

/**
 * Schedule the scratching animation timer. After 4 s, apply Happiness +25
 * (Req 4.7, 6.8).
 */
export function scheduleScratching(handlers: TransientHandlers = {}): void {
  clearTimer('scratching');
  const t = setTimeout(() => {
    _activeTimers.delete('scratching');
    const state = useStore.getState();
    state.atomicApplyStatDelta({ happiness: +25 });
    state.markSocialInteraction();
    handlers.onAnimationEnd?.({ kind: 'animation_end' });
  }, DURATION_SCRATCHING_MS);
  _activeTimers.set('scratching', t);
}

/**
 * Schedule the pooping animation timer. After 6 s, optionally reset Bladder to
 * exactly 100 (only when triggered by litterbox drop, not by forced pooping at
 * Bladder=0). See Req 4.9, 6.9 and design §17 Risk #4.
 */
export function schedulePooping(
  cause: PoopingCause,
  handlers: TransientHandlers = {},
): void {
  clearTimer('pooping');
  const t = setTimeout(() => {
    _activeTimers.delete('pooping');
    const state = useStore.getState();
    if (cause === 'drop') {
      // Set Bladder to exact 100 (Req 6.9).
      state.atomicApplyStatDelta({}, { bladder: 100 });
    }
    // Forced pooping leaves Bladder at 0; recovery only happens when the user
    // manually places the pet on a litterbox.
    handlers.onAnimationEnd?.({ kind: 'animation_end' });
  }, DURATION_POOPING_MS);
  _activeTimers.set('pooping', t);
}

/**
 * Cancel any pending transient timer (used when forced events interrupt or on
 * teardown).
 */
export function cancelAllTransientTimers(): void {
  for (const t of _activeTimers.values()) {
    clearTimeout(t);
  }
  _activeTimers.clear();
}
