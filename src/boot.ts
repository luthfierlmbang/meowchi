import { loadConfig } from './state/Config_Store';
import { preloadAll } from './assets/Asset_Preloader';
import { useStore, registerFlushListeners } from './state/store';
import { applyOfflineCatchUp } from './engine/stat_engine';
import { preloadSounds } from './engine/sound';

export interface BootResult {
  /** Hours of decay actually applied (0 when clock skewed backward). */
  hoursAppliedOffline: number;
}

/**
 * Run boot sequence. Resolves after offline catch-up has been written back
 * to the store. Caller (main.tsx) renders <App /> after this resolves so the
 * first paint already reflects up-to-date stats (Req 3.1).
 *
 * Game loops (tick / state-roll / walking / transient timers) are started by
 * <App /> itself in a useEffect after first paint, not here.
 */
export async function boot(): Promise<BootResult> {
  // 1. Load config (synchronous — reads import.meta.env once).
  loadConfig();

  // 2. Preload all PNG frames (never rejects per Req 7.8). Run in parallel
  //    with the persistence rehydrate to minimize boot time.
  const preloadPromise = preloadAll();
  preloadSounds();

  // 3. Wait for persist middleware to finish hydration (validate-before-hydrate).
  //    `useStore.persist.rehydrate()` returns a Promise that resolves once
  //    `merge` completes; if persisted data is invalid, defaults are kept.
  await useStore.persist.rehydrate();

  // 4. Apply offline catch-up atomically (Req 3.1, 3.2, 3.4, 3.5, 3.6).
  const state = useStore.getState();
  const result = applyOfflineCatchUp({ pet: state.pet });
  state.setPetStatsAndLastChecked(result.newStats, result.newLastChecked);
  if (state.pet.currentState === 'sleeping' && result.newStats.energy === 100) {
    state.setPetState('idle');
  }

  // 5. Wait for asset preload to finish before first paint (Req 7.8).
  await preloadPromise;

  // 6. Register flush listeners for pagehide/beforeunload (Req 13.2).
  registerFlushListeners();

  return { hoursAppliedOffline: result.hoursApplied };
}
