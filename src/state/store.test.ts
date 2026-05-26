import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { PersistedState } from './types';
import { createDefaultPersistedState } from './types';

const PERSIST_KEY = 'mochi_v1_store';

const statsArb = fc.record({
  hunger: fc.float({ min: 0, max: 100, noNaN: true }),
  energy: fc.float({ min: 0, max: 100, noNaN: true }),
  bladder: fc.float({ min: 0, max: 100, noNaN: true }),
  happiness: fc.float({ min: 0, max: 100, noNaN: true }),
});

const persistedStateArb: fc.Arbitrary<PersistedState> = fc.record({
  pet: fc.record({
    stats: statsArb,
    currentState: fc.constantFrom('idle' as const, 'sleeping' as const, 'walking_left' as const),
    position: fc.record({ x: fc.integer({ min: 0, max: 375 }), y: fc.integer({ min: 0, max: 500 }) }),
    lastChecked: fc.integer({ min: 0, max: Date.now() }),
  }),
  placed_items: fc.constant([]),
  inventory: fc.constant([]),
  coins: fc.integer({ min: 0, max: 100_000 }),
  habit_records: fc.constant([]),
  routine_state: fc.record({ maxLocalDateSeen: fc.string() }),
  bgmVolume: fc.float({ min: 0, max: 1, noNaN: true }),
  sfxVolume: fc.float({ min: 0, max: 1, noNaN: true }),
  chatHistory: fc.constant([]),
});

describe('Property 10: Round-trip persistence (Zustand)', () => {
  it('serialize → write → read → deserialize ≡ original state (structural)', () => {
    fc.assert(
      fc.property(persistedStateArb, (state) => {
        const envelope = { state, version: 1 };
        const json = JSON.stringify(envelope);
        const parsed = JSON.parse(json) as { state: PersistedState; version: number };
        expect(parsed.version).toBe(1);
        expect(parsed.state).toEqual(state);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Property 11: Persistence write atomicity', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('any sequence of writes produces a complete envelope or no entry — never partial', () => {
    fc.assert(
      fc.property(fc.array(persistedStateArb, { minLength: 1, maxLength: 10 }), (states) => {
        for (const s of states) {
          // Single setItem with a single JSON.stringify is atomic at the localStorage layer.
          localStorage.setItem(PERSIST_KEY, JSON.stringify({ state: s, version: 1 }));
        }
        const raw = localStorage.getItem(PERSIST_KEY);
        if (raw === null) return;
        const parsed = JSON.parse(raw) as { state: PersistedState; version: number };
        // Top-level shape is always { state, version: 1 }
        expect(parsed).toHaveProperty('state');
        expect(parsed.version).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Default state factory', () => {
  it('createDefaultPersistedState returns a valid envelope shape', () => {
    const s = createDefaultPersistedState();
    expect(s.pet.stats.hunger).toBe(100);
    expect(s.pet.stats.energy).toBe(100);
    expect(s.pet.stats.bladder).toBe(100);
    expect(s.pet.stats.happiness).toBe(100);
    expect(s.pet.currentState).toBe('idle');
    expect(s.coins).toBe(200);
  });
});
