import type { Stats, PersistedState } from '../state/types';

// Decay rates per hour (Req 2.3)
export const HUNGER_RATE = 6;
export const ENERGY_RATE = 4;
export const BLADDER_RATE = 5;

// Extra Happiness decay rates per hour (Req 2.4, 2.6)
export const HAPPINESS_LOW_RATE = 6;          // when any HEB ≤ 40 (Hunger > 0)
export const HAPPINESS_HUNGER_ZERO_RATE = 30; // when Hunger = 0 (dominates, does NOT stack)

// Boundary that triggers Happiness "low" extra decay
export const STAT_THRESHOLD = 40;

// Max hours to apply on offline catch-up (Req 3.2)
export const OFFLINE_CAP_HOURS = 24;

/**
 * Clamp a value to [0, 100] (Req 2.7).
 */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(100, x));
}

/**
 * Floor for UI display (Req 2.1). Internal stats are floats; UI shows integers.
 */
export function uiInt(x: number): number {
  return Math.floor(x);
}

/**
 * Determine if any of Hunger/Energy/Bladder is ≤ 40 (with Hunger > 0).
 * Hunger=0 is handled separately (dominates, Req 2.6).
 */
function isAnyLow40(stats: Stats): boolean {
  return (
    stats.hunger > 0 &&
    (stats.hunger <= STAT_THRESHOLD ||
      stats.energy <= STAT_THRESHOLD ||
      stats.bladder <= STAT_THRESHOLD)
  );
}

/**
 * Determine the Happiness extra decay rate (per hour) for a given stats snapshot.
 * - 30 when Hunger = 0 (Req 2.6, dominates and does NOT stack)
 * - 6 when any of HEB ≤ 40 (and Hunger > 0) (Req 2.4)
 * - 0 otherwise (Req 2.5)
 */
function happinessExtraRate(stats: Stats): number {
  if (stats.hunger === 0) return HAPPINESS_HUNGER_ZERO_RATE;
  if (isAnyLow40(stats)) return HAPPINESS_LOW_RATE;
  return 0;
}

/**
 * Apply linear decay over `deltaSeconds` using a SAMPLED set of conditions.
 * Used for the live tick (sample conditions before stepping).
 *
 * For offline catch-up over many hours, use `projectPiecewise` instead which
 * recomputes Happiness extra rate as conditions cross thresholds.
 *
 * (Req 2.2, 2.3, 2.4, 2.5, 2.6, 2.7)
 */
export function applyDecay(
  s: Stats,
  deltaSeconds: number,
  hungerZero: boolean,
  anyLow40: boolean,
): Stats {
  const hours = deltaSeconds / 3600;
  const hunger = clamp01(s.hunger - HUNGER_RATE * hours);
  const energy = clamp01(s.energy - ENERGY_RATE * hours);
  const bladder = clamp01(s.bladder - BLADDER_RATE * hours);

  // Happiness extra decay rule (NEVER stacks — Req 2.4 / 2.6)
  let extraPerHour = 0;
  if (hungerZero) extraPerHour = HAPPINESS_HUNGER_ZERO_RATE;
  else if (anyLow40) extraPerHour = HAPPINESS_LOW_RATE;

  const happiness = clamp01(s.happiness - extraPerHour * hours);
  return { hunger, energy, bladder, happiness };
}

/**
 * Project stats forward by `hours` using piecewise linear integration.
 *
 * Strategy: iterate forward in segments. Each segment starts at the current state
 * and runs until either (a) hours run out, or (b) a stat crosses a relevant
 * threshold (40 boundary for any HEB; 0 boundary for Hunger/Energy/Bladder).
 *
 * Within a segment, all decay rates are constant, so the time-to-cross for each
 * stat is solvable in closed form. We pick the smallest positive crossing time
 * (clamped to remaining hours), step the stats by that delta, recompute the
 * Happiness extra rate, and continue.
 *
 * (Req 3.3)
 */
export function projectPiecewise(s: Stats, hours: number): Stats {
  if (hours <= 0) return { ...s };

  let cur: Stats = { ...s };
  let remaining = hours;

  // Bound the loop iteration count: each segment must end at a threshold
  // crossing, and there are a finite number of crossings (4 stats × 2 thresholds
  // at most) — 16 is a safe upper bound.
  const MAX_SEGMENTS = 16;

  for (let i = 0; i < MAX_SEGMENTS && remaining > 1e-9; i++) {
    const extraRate = happinessExtraRate(cur);

    // Time to next relevant crossing (in hours), per stat:
    const crossings: number[] = [];

    // Hunger crossing 40 (only if currently > 40)
    if (cur.hunger > STAT_THRESHOLD) {
      crossings.push((cur.hunger - STAT_THRESHOLD) / HUNGER_RATE);
    }
    // Hunger crossing 0 (only if currently between (0, 40])
    if (cur.hunger > 0 && cur.hunger <= STAT_THRESHOLD) {
      crossings.push(cur.hunger / HUNGER_RATE);
    }
    // Energy crossing 40 (only matters if currently > 40)
    if (cur.energy > STAT_THRESHOLD) {
      crossings.push((cur.energy - STAT_THRESHOLD) / ENERGY_RATE);
    }
    // Bladder crossing 40
    if (cur.bladder > STAT_THRESHOLD) {
      crossings.push((cur.bladder - STAT_THRESHOLD) / BLADDER_RATE);
    }
    // Energy/Bladder reaching 0 (also useful boundary so segments don't
    // overshoot when stats are already low)
    if (cur.energy > 0) crossings.push(cur.energy / ENERGY_RATE);
    if (cur.bladder > 0) crossings.push(cur.bladder / BLADDER_RATE);

    let dt = remaining;
    for (const t of crossings) {
      if (t > 1e-9 && t < dt) dt = t;
    }

    // Apply decay over dt hours with constant rates
    cur = {
      hunger: clamp01(cur.hunger - HUNGER_RATE * dt),
      energy: clamp01(cur.energy - ENERGY_RATE * dt),
      bladder: clamp01(cur.bladder - BLADDER_RATE * dt),
      happiness: clamp01(cur.happiness - extraRate * dt),
    };
    remaining -= dt;
  }

  return cur;
}

export interface OfflineCatchUpResult {
  newStats: Stats;
  newLastChecked: number;
  hoursApplied: number; // 0 when clock skewed backward
}

/**
 * Apply offline catch-up. Returns the new stats and `lastChecked` timestamp.
 * The caller is responsible for performing the atomic write to the persisted
 * store (Req 2.8 / Req 3.5).
 *
 * Behavior:
 * - dtMs < 0 (clock skewed backward, Req 3.6): no decay, just advance lastChecked.
 * - dtMs ≥ 0: project stats over `min(hoursPassed, OFFLINE_CAP_HOURS)` (Req 3.2),
 *   integer-round each stat then clamp to [0,100] so very-short reload windows
 *   round to 0 sub-integer decay (Req 3.4).
 * - Idempotent: applying twice in a row produces the same result as once,
 *   because `lastChecked` is advanced to `now` (Req 3.5).
 */
export function applyOfflineCatchUp(
  state: Pick<PersistedState, 'pet'>,
  now: number = Date.now(),
): OfflineCatchUpResult {
  const dtMs = now - state.pet.lastChecked;

  if (dtMs < 0) {
    // Clock skewed backward (Req 3.6): no decay, just advance lastChecked
    return {
      newStats: { ...state.pet.stats },
      newLastChecked: now,
      hoursApplied: 0,
    };
  }

  const hoursPassed = dtMs / 3_600_000;
  const effectiveHours = Math.min(hoursPassed, OFFLINE_CAP_HOURS);
  const projected = projectPiecewise(state.pet.stats, effectiveHours);

  // Integer round + clamp (Req 3.4): sub-integer reload decays round to 0
  const rounded: Stats = {
    hunger: clamp01(Math.round(projected.hunger)),
    energy: clamp01(Math.round(projected.energy)),
    bladder: clamp01(Math.round(projected.bladder)),
    happiness: clamp01(Math.round(projected.happiness)),
  };

  return {
    newStats: rounded,
    newLastChecked: now,
    hoursApplied: effectiveHours,
  };
}
