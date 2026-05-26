import type { CatState, Stats } from '../state/types';

// Animation durations (ms) — Req 4.7-4.9
export const DURATION_SCRATCHING_MS = 4000;
export const DURATION_EATING_MS = 5000;
export const DURATION_POOPING_MS = 6000;

export type StateEvent =
  | { kind: 'pointer_down' }
  | { kind: 'poke'; facingLeft: boolean }
  | { kind: 'drop_resolved'; targetType: 'scratcher' | 'toy' | 'litterbox' | null }
  | { kind: 'pointer_cancel' }
  | { kind: 'sleep_button' }
  | { kind: 'forced_pooping' }
  | { kind: 'forced_sleeping' }
  | { kind: 'wake_up' }
  | { kind: 'random_roll'; result: 'idle' | 'walking_left' | 'walking_right' }
  | { kind: 'animation_end' }
  | { kind: 'edge_hit' };

export interface ConditionFlags {
  hungerZero: boolean; // Hunger = 0 (lemas)
}

export interface TransitionResult {
  next: CatState;
  changed: boolean;
}

export const ALL_CAT_STATES: readonly CatState[] = [
  'idle',
  'walking_left',
  'walking_right',
  'carried',
  'scratching',
  'eating',
  'pooping',
  'sleeping',
  'clicked_left',
  'clicked_right',
] as const;

const TRANSIENT_STATES: readonly CatState[] = ['scratching', 'eating', 'pooping', 'carried', 'clicked_left', 'clicked_right'] as const;

function isTransient(s: CatState): boolean {
  return TRANSIENT_STATES.includes(s);
}

/**
 * Pure transition reducer. Given the current state and an event, returns the next state.
 * No side effects. Caller is responsible for applying the result and scheduling timers.
 *
 * Priority order on conflicting events (Req 4.17) is enforced by `simulateTriggers` below;
 * this `transition` function handles ONE event at a time.
 */
export function transition(
  current: CatState,
  event: StateEvent,
  conditions: ConditionFlags,
): TransitionResult {
  // While sleeping, ignore pointer/click input on Pet (Req 4.13).
  if (current === 'sleeping') {
    switch (event.kind) {
      case 'wake_up':
      case 'sleep_button':
        return { next: 'idle', changed: true }; // Req 4.15
      case 'forced_pooping':
        return { next: 'pooping', changed: true }; // Bladder=0 still forces pooping
      case 'pointer_down':
        // Picking up a sleeping cat wakes it into carried (shows lift_sleepy frames)
        return { next: 'carried', changed: true };
      default:
        return { next: current, changed: false };
    }
  }

  // Forced events take precedence regardless of current state (except sleeping handled above)
  if (event.kind === 'forced_pooping') {
    return { next: 'pooping', changed: current !== 'pooping' };
  }
  if (event.kind === 'forced_sleeping') {
    // current is narrowed to exclude 'sleeping' here, so this is always a change
    return { next: 'sleeping', changed: true };
  }

  // Sleep button interrupts non-forced states (Req 4.12)
  if (event.kind === 'sleep_button') {
    // current is narrowed to exclude 'sleeping' here, so this is always a change
    return { next: 'sleeping', changed: true };
  }

  // While in transient animation states (eating/scratching/pooping/clicked), ignore pointer events (Req 6.11)
  if (current === 'scratching' || current === 'eating' || current === 'pooping' || current === 'clicked_left' || current === 'clicked_right') {
    if (event.kind === 'animation_end') {
      return { next: 'idle', changed: true };
    }
    if ((current === 'clicked_left' || current === 'clicked_right') && event.kind === 'pointer_down') {
      return { next: 'carried', changed: true };
    }
    if (event.kind === 'pointer_down' || event.kind === 'poke' || event.kind === 'drop_resolved' || event.kind === 'pointer_cancel') {
      return { next: current, changed: false };
    }
  }

  switch (event.kind) {
    case 'poke': {
      // Short tap → clicked animation (facing direction determines which)
      const next: CatState = event.facingLeft ? 'clicked_left' : 'clicked_right';
      return { next, changed: current !== next };
    }
    case 'pointer_down': {
      // Req 4.5 / Req 5.2: transition to carried unless sleeping (already handled above)
      if (current === 'carried') return { next: current, changed: false };
      return { next: 'carried', changed: true };
    }
    case 'drop_resolved': {
      // Only meaningful when current is carried
      if (current !== 'carried') return { next: current, changed: false };
      const t = event.targetType;
      if (t === null) return { next: 'idle', changed: true }; // no overlap → floor
      if (t === 'toy') {
        // Lemas refusal: Hunger=0 rejects eating (Req 6.10)
        if (conditions.hungerZero) return { next: 'idle', changed: true };
        return { next: 'eating', changed: true };
      }
      if (t === 'scratcher') {
        // Lemas refusal extends to scratching (Req 4.14)
        if (conditions.hungerZero) return { next: 'idle', changed: true };
        return { next: 'scratching', changed: true };
      }
      if (t === 'litterbox') return { next: 'pooping', changed: true };
      return { next: 'idle', changed: true };
    }
    case 'pointer_cancel': {
      if (current === 'carried') return { next: 'idle', changed: true };
      return { next: current, changed: false };
    }
    case 'random_roll': {
      // Only valid in idle/walking_*
      if (current !== 'idle' && current !== 'walking_left' && current !== 'walking_right') {
        return { next: current, changed: false };
      }
      // Lemas (Req 4.14): coerce walking to idle
      if (conditions.hungerZero && (event.result === 'walking_left' || event.result === 'walking_right')) {
        return { next: 'idle', changed: current !== 'idle' };
      }
      return { next: event.result, changed: current !== event.result };
    }
    case 'edge_hit': {
      if (current === 'walking_left' || current === 'walking_right') {
        return { next: 'idle', changed: true };
      }
      return { next: current, changed: false };
    }
    case 'animation_end':
      return { next: current, changed: false };
    case 'wake_up':
      return { next: current, changed: false };
    default:
      return { next: current, changed: false };
  }
}

/**
 * Apply multiple triggers occurring in the same tick, honoring priority order (Req 4.17):
 *   (a) forced pooping (Bladder=0)
 *   (b) forced sleeping (Energy=0)
 *   (c) sleep button
 *   (d) drop resolution
 *   (e) random roll
 *
 * `pointer_down`, `pointer_cancel`, `animation_end`, `edge_hit`, `wake_up` are not part of
 * the simultaneous-trigger contract per Req 4.17 (they fire on dedicated paths).
 */
const PRIORITY_ORDER: ReadonlyArray<StateEvent['kind']> = [
  'forced_pooping',
  'forced_sleeping',
  'sleep_button',
  'drop_resolved',
  'random_roll',
];

export function simulateTriggers(
  current: CatState,
  triggers: StateEvent[],
  conditions: ConditionFlags,
): TransitionResult {
  // Pick highest-priority trigger that exists in the input set
  for (const kind of PRIORITY_ORDER) {
    const trigger = triggers.find((t) => t.kind === kind);
    if (trigger) {
      return transition(current, trigger, conditions);
    }
  }
  // Fall back to other triggers (in given order) when none of the priority-ordered ones exist
  for (const trigger of triggers) {
    const result = transition(current, trigger, conditions);
    if (result.changed) return result;
  }
  return { next: current, changed: false };
}

/**
 * Helper: derive condition flags from current stats.
 */
export function conditionFlagsFromStats(stats: Stats): ConditionFlags {
  return { hungerZero: stats.hunger === 0 };
}
