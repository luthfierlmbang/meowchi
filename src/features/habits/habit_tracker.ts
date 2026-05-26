import { useStore } from '../../state/store';
import { verifyHabitPhoto, type VisionVerdict } from '../../gemini/vision_client';
import {
  STANDARD_COIN_REWARD,
  LARGE_COIN_REWARD,
  MAIN_HABIT_DESCRIPTIONS,
  type RoutineHabitId,
  type MainHabitId,
  type HabitId,
} from './constants';

const PRUNE_DAYS = 30;

/**
 * Format a Date as DD-MM-YYYY in the device's local timezone.
 */
export function toDDMMYYYY(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Compare two DD-MM-YYYY strings. Returns negative if a < b, 0 if equal, positive if a > b.
 * Uses date semantics (not lexical ordering, since DD-MM-YYYY does not lexically sort).
 */
export function compareDDMMYYYY(a: string, b: string): number {
  if (a === b) return 0;
  const [da, ma, ya] = a.split('-').map(Number);
  const [db, mb, yb] = b.split('-').map(Number);
  if (ya !== yb) return ya - yb;
  if (ma !== mb) return ma - mb;
  return da - db;
}

/**
 * "Effective today" — honors `routine_state.maxLocalDateSeen` for clock-skew backward (Req 9.6).
 * If wall-clock date < max-seen, returns max-seen so habit can't be replayed.
 */
export function effectiveToday(now: Date = new Date()): string {
  const today = toDDMMYYYY(now);
  const state = useStore.getState();
  const maxSeen = state.routine_state.maxLocalDateSeen;
  if (!maxSeen) {
    // First run — bump maxLocalDateSeen
    state.setRoutineState({ maxLocalDateSeen: today });
    return today;
  }
  if (compareDDMMYYYY(today, maxSeen) >= 0) {
    if (today !== maxSeen) {
      state.setRoutineState({ maxLocalDateSeen: today });
    }
    return today;
  }
  // Clock skew backward — keep using maxSeen as today
  return maxSeen;
}

/**
 * Check if a habit was already completed today.
 */
export function isCompletedToday(habit_id: HabitId): boolean {
  const today = effectiveToday();
  const state = useStore.getState();
  return state.habit_records.some(
    (r) => r.habit_id === habit_id && r.local_date === today,
  );
}

/**
 * Mark a routine habit as done. Atomic: adds record + +5 coins.
 * Returns true if rewarded; false if already completed today (no-op).
 */
export function markRoutineDone(habit_id: RoutineHabitId): boolean {
  const today = effectiveToday();
  const state = useStore.getState();
  const added = state.addHabitRecord({ habit_id, local_date: today });
  if (!added) return false;
  state.addCoins(STANDARD_COIN_REWARD);
  return true;
}

export interface MainHabitResult {
  rewarded: boolean;
  verdict: VisionVerdict;
}

/**
 * Submit a main habit photo for Gemini Vision verification.
 * Throws ChatClientError-style errors from the vision client on auth/quota/timeout/network/disabled.
 *
 * Anti-replay: if (habit_id, today) is already recorded, throws an Error before
 * making any vision call (the caller should pre-check via isCompletedToday for UX).
 *
 * On `valid` verdict: atomic add record + +50 coins.
 * On `fraud`/`mismatch`: no reward, returns the verdict so caller can surface reason.
 */
export async function submitMainHabit(
  habit_id: MainHabitId,
  photoBlob: Blob,
): Promise<MainHabitResult> {
  if (isCompletedToday(habit_id)) {
    throw new Error('Habit ini sudah diselesaikan hari ini.');
  }
  const description = MAIN_HABIT_DESCRIPTIONS[habit_id];
  const verdict = await verifyHabitPhoto(photoBlob, description);
  if (verdict.verdict === 'valid') {
    const today = effectiveToday();
    const state = useStore.getState();
    const added = state.addHabitRecord({ habit_id, local_date: today });
    if (added) {
      state.addCoins(LARGE_COIN_REWARD);
      return { rewarded: true, verdict };
    }
    // Race condition (already added between checks) — still return the verdict but no reward
    return { rewarded: false, verdict };
  }
  return { rewarded: false, verdict };
}

/**
 * Prune main habit records older than 30 days from `effectiveToday()`.
 * Routine records are kept for the same window; the prune is best-effort (Req 10.6 last clause).
 */
export function pruneOldRecords(now: Date = new Date()): void {
  const today = effectiveToday(now);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PRUNE_DAYS);
  const cutoffStr = toDDMMYYYY(cutoff);

  const state = useStore.getState();
  state.pruneHabitRecords(cutoffStr, compareDDMMYYYY);
  // Suppress unused-var warning for `today`; effectiveToday() also has the
  // side effect of bumping maxLocalDateSeen, which is intentional.
  void today;
}
