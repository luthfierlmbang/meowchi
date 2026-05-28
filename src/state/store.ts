/**
 * Central Zustand store for Mochi virtual pet (Req 1.7, 13.1–13.6).
 *
 * Persistence behavior (design §11):
 * - Top-level on-disk shape (managed by Zustand persist + partialize):
 *     { state: { pet, placed_items, inventory, coins, habit_records, routine_state }, version: 2 }
 * - Debounced writes (500 ms) with sync flush on `pagehide` / `beforeunload`.
 * - Validate-before-hydrate (parse + schema + version checks); failure → defaults.
 * - Version mismatch resets to defaults so stale local saves can be cleared.
 * - Atomic write with in-memory fallback Map on QuotaExceededError or any write throw;
 *   non-blocking toast event emitted via `window.dispatchEvent`.
 */
import { create } from 'zustand';
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from 'zustand/middleware';
import type {
  CatState,
  ChatMessage,
  FocusActivity,
  FocusSession,
  HabitRecord,
  InventoryEntry,
  PersistedState,
  PlacedItem,
  RoutineState,
  Stats,
} from './types';
import { createDefaultPersistedState } from './types';
import {
  FOCUS_ENERGY_COST_ON_COMPLETE,
  FOCUS_HAPPINESS_REWARD,
  focusRewardCoins,
} from '../features/focus/focus_rewards';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const PERSIST_KEY = 'mochi_v1_store';
export const PERSIST_VERSION = 2 as const;
const WRITE_DEBOUNCE_MS = 500;

/** Event name for non-blocking toast notifications about storage failures. */
export const STORAGE_TOAST_EVENT = 'mochi:storage-toast';

export type StorageToastKind = 'storage_quota' | 'storage_unavailable';

export interface StorageToastDetail {
  message: string;
  kind: StorageToastKind;
}

function emitStorageToast(message: string, kind: StorageToastKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<StorageToastDetail>(STORAGE_TOAST_EVENT, {
      detail: { message, kind },
    }),
  );
}

// ----------------------------------------------------------------------------
// In-memory fallback storage (Req 1.12, 13.6)
// ----------------------------------------------------------------------------

/** Backing map used after `localStorage` fails or is unavailable. */
const inMemoryFallback = new Map<string, string>();
let useInMemoryOnly = false;

function activateInMemoryFallback(message: string, kind: StorageToastKind): void {
  if (useInMemoryOnly) return;
  useInMemoryOnly = true;
  emitStorageToast(message, kind);
}

/**
 * Atomic per-call wrapper around `localStorage` that switches to the in-memory
 * map on failure. One `setItem` call writes a single serialized envelope, so
 * the on-disk structure is never partial (Req 13.6).
 */
const rawStorage: StateStorage = {
  getItem: (name) => {
    if (useInMemoryOnly) return inMemoryFallback.get(name) ?? null;
    try {
      return localStorage.getItem(name);
    } catch {
      activateInMemoryFallback(
        'localStorage tidak tersedia. Progres sesi ini tidak akan tersimpan.',
        'storage_unavailable',
      );
      return inMemoryFallback.get(name) ?? null;
    }
  },
  setItem: (name, value) => {
    if (useInMemoryOnly) {
      inMemoryFallback.set(name, value);
      return;
    }
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      const e = err as { name?: string } | undefined;
      const cause = e && e.name === 'QuotaExceededError' ? 'kuota terlampaui' : 'gagal menulis';
      // Switch to in-memory fallback and store the latest value there so the
      // session keeps running. Subsequent sets retry the next debounced write.
      inMemoryFallback.set(name, value);
      activateInMemoryFallback(
        `localStorage ${cause}. Progres sesi ini disimpan sementara di memori.`,
        'storage_quota',
      );
    }
  },
  removeItem: (name) => {
    inMemoryFallback.delete(name);
    if (useInMemoryOnly) return;
    try {
      localStorage.removeItem(name);
    } catch {
      activateInMemoryFallback(
        'localStorage tidak tersedia. Progres sesi ini tidak akan tersimpan.',
        'storage_unavailable',
      );
    }
  },
};

// ----------------------------------------------------------------------------
// Debounced writer with sync flush on pagehide/beforeunload (Req 13.2)
// ----------------------------------------------------------------------------

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: { name: string; value: string } | null = null;

function debouncedSetItem(name: string, value: string): void {
  // Coalesce on the most recent value; persist always serializes the latest
  // store snapshot, so older queued values are obsolete.
  pendingWrite = { name, value };
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    flushPending();
  }, WRITE_DEBOUNCE_MS);
}

/** Synchronously flush any pending debounced write. Safe to call repeatedly. */
function flushPending(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingWrite !== null) {
    const { name, value } = pendingWrite;
    pendingWrite = null;
    rawStorage.setItem(name, value);
  }
}

const debouncedStorage: StateStorage = {
  getItem: (name) => rawStorage.getItem(name),
  setItem: debouncedSetItem,
  removeItem: (name) => {
    // Cancel any queued write for this key, then forward the removal.
    if (pendingWrite && pendingWrite.name === name) {
      pendingWrite = null;
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    }
    rawStorage.removeItem(name);
  },
};

let flushListenersRegistered = false;

/**
 * Idempotently register `pagehide` and `beforeunload` listeners that flush any
 * pending debounced write synchronously before the page unloads (Req 13.2).
 * Called once during boot (see `boot.ts`).
 */
export function registerFlushListeners(): void {
  if (flushListenersRegistered) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('pagehide', flushPending);
  window.addEventListener('beforeunload', flushPending);
  flushListenersRegistered = true;
}

// ----------------------------------------------------------------------------
// Validate-before-hydrate (Req 13.4)
// ----------------------------------------------------------------------------

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function validateStats(s: unknown): s is Stats {
  if (!isObject(s)) return false;
  for (const k of ['hunger', 'energy', 'bladder', 'happiness'] as const) {
    const v = s[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  return true;
}

function validateInventoryEntry(e: unknown): e is InventoryEntry {
  if (!isObject(e)) return false;
  if (typeof e.id !== 'string') return false;
  if (e.type !== 'scratcher' && e.type !== 'toy' && e.type !== 'litterbox') return false;
  if (typeof e.width !== 'number' || typeof e.height !== 'number') return false;
  return true;
}

function validatePlacedItem(p: unknown): p is PlacedItem {
  if (!validateInventoryEntry(p)) return false;
  const o = p as unknown as Record<string, unknown>;
  return typeof o.x === 'number' && typeof o.y === 'number';
}

function validateHabitRecord(r: unknown): r is HabitRecord {
  if (!isObject(r)) return false;
  return typeof r.habit_id === 'string' && typeof r.local_date === 'string';
}

function validateFocusSession(f: unknown): f is FocusSession {
  if (f === null) return true;
  if (!isObject(f)) return false;
  if (typeof f.id !== 'string') return false;
  if (
    f.activity !== 'workout' &&
    f.activity !== 'padel' &&
    f.activity !== 'masak' &&
    f.activity !== 'solat_ngaji'
  ) {
    return false;
  }
  if (typeof f.durationMinutes !== 'number' || !Number.isFinite(f.durationMinutes)) return false;
  if (typeof f.startedAt !== 'number' || !Number.isFinite(f.startedAt)) return false;
  if (typeof f.endsAt !== 'number' || !Number.isFinite(f.endsAt)) return false;
  if (f.status !== 'running' && f.status !== 'completed') return false;
  if (f.completedAt !== undefined && (typeof f.completedAt !== 'number' || !Number.isFinite(f.completedAt))) {
    return false;
  }
  return true;
}

function validatePersistedState(s: unknown): s is PersistedState {
  if (!isObject(s)) return false;

  // pet
  if (!isObject(s.pet)) return false;
  const pet = s.pet;
  if (!validateStats(pet.stats)) return false;
  if (typeof pet.currentState !== 'string') return false;
  if (!isObject(pet.position)) return false;
  if (typeof pet.position.x !== 'number' || typeof pet.position.y !== 'number') return false;
  if (typeof pet.lastChecked !== 'number' || !Number.isFinite(pet.lastChecked)) return false;
  if (
    pet.lastInteractionAt !== undefined &&
    (typeof pet.lastInteractionAt !== 'number' || !Number.isFinite(pet.lastInteractionAt))
  ) {
    return false;
  }

  // collections
  if (!Array.isArray(s.placed_items) || !s.placed_items.every(validatePlacedItem)) return false;
  if (!Array.isArray(s.inventory) || !s.inventory.every(validateInventoryEntry)) return false;
  if (!Array.isArray(s.habit_records) || !s.habit_records.every(validateHabitRecord)) return false;

  // scalars
  if (typeof s.coins !== 'number' || !Number.isFinite(s.coins)) return false;

  // routine_state
  if (!isObject(s.routine_state)) return false;
  const rs = s.routine_state as { maxLocalDateSeen?: unknown };
  if (typeof rs.maxLocalDateSeen !== 'string') return false;

  // bgmVolume and sfxVolume (optional for backward compatibility)
  const obj = s as Record<string, unknown>;
  if (obj.bgmVolume !== undefined && (typeof obj.bgmVolume !== 'number' || !Number.isFinite(obj.bgmVolume))) return false;
  if (obj.sfxVolume !== undefined && (typeof obj.sfxVolume !== 'number' || !Number.isFinite(obj.sfxVolume))) return false;

  // chatHistory (optional for backward compatibility)
  if (obj.chatHistory !== undefined) {
    if (!Array.isArray(obj.chatHistory)) return false;
    for (const m of obj.chatHistory) {
      if (!isObject(m)) return false;
      if (m.role !== 'user' && m.role !== 'mochi') return false;
      if (typeof m.text !== 'string') return false;
      if (typeof m.ts !== 'number' || !Number.isFinite(m.ts)) return false;
    }
  }
  if (obj.focusSession !== undefined && !validateFocusSession(obj.focusSession)) return false;

  return true;
}

// ----------------------------------------------------------------------------
// Store actions
// ----------------------------------------------------------------------------

export interface StoreActions {
  // Pet mutators
  setPetPosition: (pos: { x: number; y: number }) => void;
  setPetState: (state: CatState) => void;
  setPetStats: (stats: Stats) => void;
  setPetStatsAndLastChecked: (stats: Stats, lastChecked: number) => void;
  setLastChecked: (ts: number) => void;
  markSocialInteraction: (ts?: number) => void;
  startFocusSession: (activity: FocusActivity, durationMinutes: number, now?: number) => boolean;
  completeFocusSession: (now?: number) => boolean;
  stopFocusSession: () => boolean;
  clearFocusSession: () => void;

  // Coin / shop / inventory
  addCoins: (delta: number) => void;
  setCoins: (value: number) => void;
  atomicPurchase: (price: number, entry: InventoryEntry) => boolean;
  atomicPlaceItem: (entryId: string, x: number, y: number) => boolean;
  atomicRepositionItem: (itemId: string, x: number, y: number) => void;
  atomicRemovePlacedItem: (itemId: string) => void;

  // Habit records
  addHabitRecord: (record: HabitRecord) => boolean; // false if duplicate (habit_id, local_date)
  pruneHabitRecords: (
    olderThanDate: string,
    comparator: (a: string, b: string) => number,
  ) => void;
  setRoutineState: (s: RoutineState) => void;

  // Stat delta application (e.g., post-animation effects)
  atomicApplyStatDelta: (delta: Partial<Stats>, setExact?: Partial<Stats>) => void;

  setBgmVolume: (vol: number) => void;
  setSfxVolume: (vol: number) => void;

  addChatMessage: (msg: ChatMessage) => void;
  clearChatHistory: () => void;

  /** Test-only helper to reset to default state. */
  _resetToDefaults: () => void;
}

export type Store = PersistedState & StoreActions;

function clampStat(x: number): number {
  return Math.max(0, Math.min(100, x));
}

// ----------------------------------------------------------------------------
// Store creation
// ----------------------------------------------------------------------------

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...createDefaultPersistedState(),

      setPetPosition: (pos) =>
        set((s) => ({ pet: { ...s.pet, position: { x: pos.x, y: pos.y } } })),

      setPetState: (cs) =>
        set((s) => ({ pet: { ...s.pet, currentState: cs } })),

      setPetStats: (stats) =>
        set((s) => ({ pet: { ...s.pet, stats: { ...stats } } })),

      setPetStatsAndLastChecked: (stats, lastChecked) =>
        set((s) => ({ pet: { ...s.pet, stats: { ...stats }, lastChecked } })),

      setLastChecked: (ts) =>
        set((s) => ({ pet: { ...s.pet, lastChecked: ts } })),

      markSocialInteraction: (ts = Date.now()) =>
        set((s) => ({ pet: { ...s.pet, lastInteractionAt: ts } })),

      startFocusSession: (activity, durationMinutes, now = Date.now()) => {
        const cur = get();
        if (cur.focusSession?.status === 'running') return false;
        const safeMinutes = Math.max(1, Math.min(180, Math.floor(durationMinutes)));
        const endsAt = now + safeMinutes * 60_000;
        set((s) => ({
          pet: { ...s.pet, currentState: 'focusing' },
          focusSession: {
            id: `focus_${now}`,
            activity,
            durationMinutes: safeMinutes,
            startedAt: now,
            endsAt,
            status: 'running',
          },
        }));
        return true;
      },

      completeFocusSession: (now = Date.now()) => {
        const cur = get();
        const session = cur.focusSession;
        if (!session || session.status !== 'running') return false;
        const rewardCoins = focusRewardCoins(session.durationMinutes);
        set((s) => {
          const nextStats: Stats = {
            ...s.pet.stats,
            energy: clampStat(s.pet.stats.energy - FOCUS_ENERGY_COST_ON_COMPLETE),
            happiness: clampStat(s.pet.stats.happiness + FOCUS_HAPPINESS_REWARD),
          };
          return {
            coins: Math.max(0, s.coins + rewardCoins),
            pet: {
              ...s.pet,
              currentState: 'idle',
              stats: nextStats,
              lastInteractionAt: now,
            },
            focusSession: {
              ...session,
              status: 'completed',
              completedAt: now,
            },
          };
        });
        return true;
      },

      stopFocusSession: () => {
        const cur = get();
        if (cur.focusSession?.status !== 'running') return false;
        set((s) => ({
          pet: { ...s.pet, currentState: 'idle' },
          focusSession: null,
        }));
        return true;
      },

      clearFocusSession: () => set(() => ({ focusSession: null })),

      addCoins: (delta) =>
        set((s) => ({ coins: Math.max(0, s.coins + delta) })),

      setCoins: (value) =>
        set(() => ({ coins: Math.max(0, Math.floor(value)) })),

      atomicPurchase: (price, entry) => {
        const cur = get();
        if (cur.coins < price) return false;
        // Reject id collisions across both inventory and placed_items (Req 11.7).
        if (
          cur.inventory.some((i) => i.id === entry.id) ||
          cur.placed_items.some((p) => p.id === entry.id)
        ) {
          return false;
        }
        set((s) => ({
          coins: s.coins - price,
          inventory: [...s.inventory, entry],
        }));
        return true;
      },

      atomicPlaceItem: (entryId, x, y) => {
        const cur = get();
        const entry = cur.inventory.find((i) => i.id === entryId);
        if (!entry) return false;
        const placed: PlacedItem = { ...entry, x, y };
        set((s) => ({
          inventory: s.inventory.filter((i) => i.id !== entryId),
          placed_items: [...s.placed_items, placed],
        }));
        return true;
      },

      atomicRepositionItem: (itemId, x, y) => {
        set((s) => ({
          placed_items: s.placed_items.map((p) =>
            p.id === itemId ? { ...p, x, y } : p,
          ),
        }));
      },

      atomicRemovePlacedItem: (itemId) => {
        set((s) => {
          const item = s.placed_items.find((p) => p.id === itemId);
          if (!item) return s;
          const back: InventoryEntry = {
            id: item.id,
            type: item.type,
            width: item.width,
            height: item.height,
          };
          return {
            placed_items: s.placed_items.filter((p) => p.id !== itemId),
            inventory: [...s.inventory, back],
          };
        });
      },

      addHabitRecord: (record) => {
        const cur = get();
        const exists = cur.habit_records.some(
          (r) => r.habit_id === record.habit_id && r.local_date === record.local_date,
        );
        if (exists) return false;
        set((s) => ({ habit_records: [...s.habit_records, record] }));
        return true;
      },

      pruneHabitRecords: (olderThanDate, comparator) => {
        set((s) => ({
          habit_records: s.habit_records.filter(
            (r) => comparator(r.local_date, olderThanDate) >= 0,
          ),
        }));
      },

      setRoutineState: (rs) => set(() => ({ routine_state: { ...rs } })),

      atomicApplyStatDelta: (delta, setExact) => {
        set((s) => {
          const cur = s.pet.stats;
          const next: Stats = { ...cur };
          if (delta.hunger !== undefined) next.hunger = clampStat(next.hunger + delta.hunger);
          if (delta.energy !== undefined) next.energy = clampStat(next.energy + delta.energy);
          if (delta.bladder !== undefined) next.bladder = clampStat(next.bladder + delta.bladder);
          if (delta.happiness !== undefined)
            next.happiness = clampStat(next.happiness + delta.happiness);
          if (setExact) {
            if (setExact.hunger !== undefined) next.hunger = clampStat(setExact.hunger);
            if (setExact.energy !== undefined) next.energy = clampStat(setExact.energy);
            if (setExact.bladder !== undefined) next.bladder = clampStat(setExact.bladder);
            if (setExact.happiness !== undefined) next.happiness = clampStat(setExact.happiness);
          }
          return { pet: { ...s.pet, stats: next } };
        });
      },

      _resetToDefaults: () => set(() => createDefaultPersistedState()),
      setBgmVolume: (vol) => set(() => ({ bgmVolume: Math.max(0, Math.min(1, vol)) })),
      setSfxVolume: (vol) => set(() => ({ sfxVolume: Math.max(0, Math.min(1, vol)) })),
      addChatMessage: (msg) => set((s) => ({ chatHistory: [...s.chatHistory, msg] })),
      clearChatHistory: () => set(() => ({ chatHistory: [] })),
    }),
    {
      name: PERSIST_KEY,
      version: PERSIST_VERSION,
      storage: createJSONStorage<PersistedState>(() => debouncedStorage),
      // Persist only the data slice (Req 13.1); actions are reconstructed on hydrate.
      partialize: (s): PersistedState => ({
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
      }),
      // Reset stale or future save data on version mismatch. This intentionally
      // clears old local stats/items/chats after a reset release.
      migrate: (persisted, version) => {
        if (version !== PERSIST_VERSION) {
          return createDefaultPersistedState();
        }
        if (validatePersistedState(persisted)) {
          const defaultPet = createDefaultPersistedState().pet;
          return {
            pet: {
              ...persisted.pet,
              lastInteractionAt: persisted.pet.lastInteractionAt ?? defaultPet.lastInteractionAt,
            },
            placed_items: persisted.placed_items,
            inventory: persisted.inventory,
            coins: persisted.coins,
            habit_records: persisted.habit_records,
            routine_state: persisted.routine_state,
            bgmVolume: persisted.bgmVolume ?? 0.5,
            sfxVolume: persisted.sfxVolume ?? 0.5,
            chatHistory: persisted.chatHistory ?? [],
            focusSession: persisted.focusSession ?? null,
          };
        }
        return createDefaultPersistedState();
      },
      // Validate-before-hydrate (Req 13.4): on shape failure, retain current
      // (default) state. A subsequent change overwrites the corrupt entry.
      merge: (persisted, current) => {
        if (!validatePersistedState(persisted)) {
          return current;
        }
        const defaultPet = createDefaultPersistedState().pet;
        return {
          ...current,
          pet: {
            ...persisted.pet,
            lastInteractionAt: persisted.pet.lastInteractionAt ?? defaultPet.lastInteractionAt,
          },
          placed_items: persisted.placed_items,
          inventory: persisted.inventory,
          coins: persisted.coins,
          habit_records: persisted.habit_records,
          routine_state: persisted.routine_state,
          bgmVolume: persisted.bgmVolume ?? current.bgmVolume,
          sfxVolume: persisted.sfxVolume ?? current.sfxVolume,
          chatHistory: persisted.chatHistory ?? current.chatHistory,
          focusSession: persisted.focusSession ?? current.focusSession,
        };
      },
    },
  ),
);

// ----------------------------------------------------------------------------
// Test-only helpers
// ----------------------------------------------------------------------------

/** Force the in-memory fallback path on/off (test only). */
export function _forceInMemoryFallbackForTest(force: boolean): void {
  useInMemoryOnly = force;
}

/** Clear the in-memory fallback map and reset the fallback flag (test only). */
export function _clearInMemoryFallbackForTest(): void {
  inMemoryFallback.clear();
  useInMemoryOnly = false;
}

/** Synchronously flush any pending debounced write (test only). */
export function _flushPendingForTest(): void {
  flushPending();
}

/** Inspect whether the in-memory fallback is currently active (test only). */
export function _isUsingInMemoryFallbackForTest(): boolean {
  return useInMemoryOnly;
}
