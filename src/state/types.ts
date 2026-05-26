// Cat state machine states
export type CatState =
  | 'idle'
  | 'walking_left'
  | 'walking_right'
  | 'carried'
  | 'scratching'
  | 'eating'
  | 'pooping'
  | 'sleeping'
  | 'clicked_left'
  | 'clicked_right';

// Core stats — internal values are floats; UI displays Math.floor()
export interface Stats {
  hunger: number;    // 0..100, -6/h
  energy: number;    // 0..100, -4/h
  bladder: number;   // 0..100, -5/h
  happiness: number; // 0..100, dynamic decay
}

export interface Pet {
  stats: Stats;
  currentState: CatState;
  position: { x: number; y: number };
  lastChecked: number; // ms epoch
}

export type FurnitureType = 'scratcher' | 'toy' | 'litterbox';

export interface InventoryEntry {
  id: string;
  type: FurnitureType;
  width: number;
  height: number;
}

export interface PlacedItem extends InventoryEntry {
  x: number;
  y: number;
}

// Completion record for both Routine and Main habits
export interface HabitRecord {
  habit_id: string;
  local_date: string; // DD-MM-YYYY
}

// Routine habit daily state tracking
export interface RoutineState {
  maxLocalDateSeen: string; // DD-MM-YYYY — for clock-skew backward protection
}

export interface PersistedState {
  pet: Pet;
  placed_items: PlacedItem[];
  inventory: InventoryEntry[];
  coins: number;
  habit_records: HabitRecord[];
  routine_state: RoutineState;
}

// Top-level localStorage shape
export interface PersistEnvelope {
  state: PersistedState;
  version: 1;
}

// IndexedDB photo entry
export interface UserPhoto {
  id: string;        // 'photo_<ms>' or 'photo_<ms>-N' on collision
  base64Data: string; // data URL
  uploadedAt: string; // DD-MM-YYYY
}

// Factory for default state (Req 1.8)
export function createDefaultPersistedState(): PersistedState {
  return {
    pet: {
      stats: { hunger: 100, energy: 100, bladder: 100, happiness: 100 },
      currentState: 'idle',
      position: { x: 108, y: 380 }, // centered for 160px cat in 375px wide room, floor ~540
      lastChecked: Date.now(),
    },
    placed_items: [],
    inventory: [],
    coins: 200,
    habit_records: [],
    routine_state: {
      maxLocalDateSeen: '',
    },
  };
}
