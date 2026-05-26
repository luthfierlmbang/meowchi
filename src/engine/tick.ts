import { useStore } from '../state/store';
import { applyDecay, HAPPINESS_NEGLECT_GRACE_HOURS } from './stat_engine';
import type { StateEvent } from './state_machine';

const TICK_INTERVAL_MS = 60_000;
const TICK_DELTA_SECONDS = 60;
const STAT_THRESHOLD = 40;

let _tickHandle: ReturnType<typeof setInterval> | null = null;

export interface TickHandlers {
  /** Called when a forced state transition should be triggered (Bladder=0 or Energy=0). */
  onForcedEvent?: (event: StateEvent) => void;
}

/**
 * Start the 60 s stat tick. Idempotent; calling again is a no-op until stopped.
 */
export function startTickLoop(handlers: TickHandlers = {}): void {
  if (_tickHandle !== null) return;
  _tickHandle = setInterval(() => {
    runTickOnce(handlers);
  }, TICK_INTERVAL_MS);
}

/**
 * Stop the tick loop. Safe to call when not running.
 */
export function stopTickLoop(): void {
  if (_tickHandle !== null) {
    clearInterval(_tickHandle);
    _tickHandle = null;
  }
}

/**
 * Run a single tick (extracted for testing).
 * - Samples conditions BEFORE decay (Req 2.4 — “WHILE … extra Happiness decay”).
 * - Applies linear decay over 60 s.
 * - Atomic write of stats + lastChecked.
 * - Dispatches forced events when stats reach 0 AFTER decay.
 */
export function runTickOnce(handlers: TickHandlers = {}): void {
  const state = useStore.getState();
  const cur = state.pet.stats;

  const hungerZero = cur.hunger === 0;
  const anyLow40 =
    !hungerZero &&
    (cur.hunger <= STAT_THRESHOLD ||
      cur.energy <= STAT_THRESHOLD ||
      cur.bladder <= STAT_THRESHOLD);

  const isSleeping = state.pet.currentState === 'sleeping';
  const now = Date.now();
  const lastInteractionAt = state.pet.lastInteractionAt ?? state.pet.lastChecked;
  const socialIdle = now - lastInteractionAt >= HAPPINESS_NEGLECT_GRACE_HOURS * 3_600_000;
  const next = applyDecay(cur, TICK_DELTA_SECONDS, hungerZero, anyLow40, isSleeping, socialIdle);
  state.setPetStatsAndLastChecked(next, now);

  // Forced transitions check AFTER decay (Req 4.10, 4.11)
  if (handlers.onForcedEvent) {
    if (next.bladder === 0 && cur.bladder > 0) {
      handlers.onForcedEvent({ kind: 'forced_pooping' });
    } else if (next.energy === 0 && cur.energy > 0) {
      handlers.onForcedEvent({ kind: 'forced_sleeping' });
    }
  }
}
