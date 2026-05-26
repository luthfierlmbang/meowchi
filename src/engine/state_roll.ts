import { useStore } from '../state/store';
import type { StateEvent } from './state_machine';

const ROLL_INTERVAL_MS = 7_000;

let _rollHandle: ReturnType<typeof setInterval> | null = null;

export interface StateRollHandlers {
  /** Dispatched when a roll occurs while in a rollable state. */
  onRoll?: (event: StateEvent) => void;
}

/**
 * Pick a uniform random result from {idle, walking_left, walking_right}.
 * Probability = 1/3 each (Req 4.2).
 */
export function pickRandomRollResult(
  rng: () => number = Math.random,
): 'idle' | 'walking_left' | 'walking_right' {
  const r = rng();
  if (r < 1 / 3) return 'idle';
  if (r < 2 / 3) return 'walking_left';
  return 'walking_right';
}

/**
 * Start the 7 s state-roll loop. Idempotent until stopped.
 */
export function startStateRollLoop(handlers: StateRollHandlers = {}): void {
  if (_rollHandle !== null) return;
  _rollHandle = setInterval(() => {
    runRollOnce(handlers);
  }, ROLL_INTERVAL_MS);
}

export function stopStateRollLoop(): void {
  if (_rollHandle !== null) {
    clearInterval(_rollHandle);
    _rollHandle = null;
  }
}

/**
 * Run a single roll. Only emits an event when the cat is in idle/walking_*.
 * (Other states like carried/eating/scratching/pooping/sleeping ignore rolls.)
 */
export function runRollOnce(
  handlers: StateRollHandlers = {},
  rng: () => number = Math.random,
): void {
  const state = useStore.getState();
  const cs = state.pet.currentState;
  if (cs !== 'idle' && cs !== 'walking_left' && cs !== 'walking_right') return;
  const result = pickRandomRollResult(rng);
  handlers.onRoll?.({ kind: 'random_roll', result });
}
