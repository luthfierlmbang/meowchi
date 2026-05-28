import { useStore } from '../state/store';
import type { PersistedState } from '../state/types';
import { supabase } from './client';
import { applyOfflineCatchUp } from '../engine/stat_engine';
import { isSleepHour } from '../engine/sleep_schedule';

type GameSaveRow = {
  user_id: string;
  data: PersistedState;
  updated_at?: string;
};

let unsubscribeSync: (() => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

function currentPersistedState(): PersistedState {
  const s = useStore.getState();
  return {
    pet: s.pet,
    placed_items: s.placed_items,
    inventory: s.inventory,
    coins: s.coins,
    habit_records: s.habit_records,
    routine_state: s.routine_state,
    bgmVolume: s.bgmVolume,
    sfxVolume: s.sfxVolume,
    chatHistory: s.chatHistory,
    focusSession: s.focusSession,
  };
}

function applyPersistedState(data: PersistedState): void {
  applyingRemote = true;
  useStore.setState((s) => ({
    ...s,
    pet: data.pet,
    placed_items: data.placed_items,
    inventory: data.inventory,
    coins: data.coins,
    habit_records: data.habit_records,
    routine_state: data.routine_state,
    bgmVolume: data.bgmVolume,
    sfxVolume: data.sfxVolume,
    chatHistory: data.chatHistory,
    focusSession: data.focusSession,
  }));
  applyingRemote = false;
}

export async function loadGameSave(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('game_saves')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle<GameSaveRow>();

  if (error) throw error;
  if (data?.data) {
    const catchUp = applyOfflineCatchUp({ pet: data.data.pet });
    const caughtUpData: PersistedState = {
      ...data.data,
      pet: {
        ...data.data.pet,
        stats: catchUp.newStats,
        lastChecked: catchUp.newLastChecked,
        currentState:
          data.data.pet.currentState === 'sleeping' &&
          catchUp.newStats.energy === 100 &&
          !isSleepHour()
            ? 'idle'
            : data.data.pet.currentState,
      },
    };
    applyPersistedState(caughtUpData);
    if (catchUp.hoursApplied > 0) {
      await saveGameNow(userId);
    }
    return;
  }
  await saveGameNow(userId);
}

export async function saveGameNow(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('game_saves').upsert({
    user_id: userId,
    data: currentPersistedState(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function startCloudSync(userId: string): void {
  stopCloudSync();
  unsubscribeSync = useStore.subscribe(() => {
    if (applyingRemote) return;
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveGameNow(userId).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[Supabase Sync] save failed:', err);
      });
    }, 3000);
  });
}

export function stopCloudSync(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (unsubscribeSync) {
    unsubscribeSync();
    unsubscribeSync = null;
  }
}
