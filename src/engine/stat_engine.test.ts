import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { applyDecay, applyOfflineCatchUp, clamp01, projectPiecewise } from './stat_engine';
import type { Stats } from '../state/types';

const statsArb: fc.Arbitrary<Stats> = fc.record({
  hunger: fc.float({ min: 0, max: 100, noNaN: true }),
  energy: fc.float({ min: 0, max: 100, noNaN: true }),
  bladder: fc.float({ min: 0, max: 100, noNaN: true }),
  happiness: fc.float({ min: 0, max: 100, noNaN: true }),
});

describe('Property 1: Stat clamping invariant', () => {
  it('applyDecay output is always in [0, 100]', () => {
    fc.assert(
      fc.property(statsArb, fc.float({ min: 0, max: 24 * 3600, noNaN: true }), (s, dt) => {
        const hungerZero = s.hunger === 0;
        const anyLow40 =
          !hungerZero && (s.hunger <= 40 || s.energy <= 40 || s.bladder <= 40);
        const out = applyDecay(s, dt, hungerZero, anyLow40);
        for (const k of ['hunger', 'energy', 'bladder', 'happiness'] as const) {
          expect(out[k]).toBeGreaterThanOrEqual(0);
          expect(out[k]).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('projectPiecewise output is always in [0, 100]', () => {
    fc.assert(
      fc.property(statsArb, fc.float({ min: 0, max: 48, noNaN: true }), (s, hours) => {
        const out = projectPiecewise(s, hours);
        for (const k of ['hunger', 'energy', 'bladder', 'happiness'] as const) {
          expect(out[k]).toBeGreaterThanOrEqual(0);
          expect(out[k]).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('applyOfflineCatchUp output is always in [0, 100]', () => {
    fc.assert(
      fc.property(
        statsArb,
        fc.integer({ min: 0, max: 48 * 3_600_000 }),
        (s, offsetMs) => {
          const now = 1_700_000_000_000;
          const state = {
            pet: {
              stats: { ...s },
              currentState: 'idle' as const,
              position: { x: 0, y: 0 },
              lastChecked: now - offsetMs,
            },
          };
          const r = applyOfflineCatchUp(state, now);
          for (const k of ['hunger', 'energy', 'bladder', 'happiness'] as const) {
            expect(r.newStats[k]).toBeGreaterThanOrEqual(0);
            expect(r.newStats[k]).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Property 2: Stat monotonicity invariant', () => {
  it('applyDecay never increases Hunger/Energy/Bladder/Happiness', () => {
    fc.assert(
      fc.property(statsArb, fc.float({ min: 0, max: 24 * 3600, noNaN: true }), (s, dt) => {
        const hungerZero = s.hunger === 0;
        const anyLow40 =
          !hungerZero && (s.hunger <= 40 || s.energy <= 40 || s.bladder <= 40);
        const out = applyDecay(s, dt, hungerZero, anyLow40);
        expect(out.hunger).toBeLessThanOrEqual(s.hunger);
        expect(out.energy).toBeLessThanOrEqual(s.energy);
        expect(out.bladder).toBeLessThanOrEqual(s.bladder);
        // Happiness extra rate is always >= 0 → can only decrease.
        expect(out.happiness).toBeLessThanOrEqual(s.happiness);
      }),
      { numRuns: 200 },
    );
  });

  it('projectPiecewise never increases Hunger/Energy/Bladder/Happiness', () => {
    fc.assert(
      fc.property(statsArb, fc.float({ min: 0, max: 48, noNaN: true }), (s, hours) => {
        const out = projectPiecewise(s, hours);
        expect(out.hunger).toBeLessThanOrEqual(s.hunger);
        expect(out.energy).toBeLessThanOrEqual(s.energy);
        expect(out.bladder).toBeLessThanOrEqual(s.bladder);
        expect(out.happiness).toBeLessThanOrEqual(s.happiness);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Property 3: Offline catch-up idempotence', () => {
  it('applying applyOfflineCatchUp twice in a row yields the same stats as once', () => {
    fc.assert(
      fc.property(
        statsArb,
        fc.integer({ min: 0, max: 48 * 3_600_000 }),
        (s, offsetMs) => {
          const now = 1_700_000_000_000;
          const state = {
            pet: {
              stats: { ...s },
              currentState: 'idle' as const,
              position: { x: 0, y: 0 },
              lastChecked: now - offsetMs,
            },
          };
          const r1 = applyOfflineCatchUp(state, now);
          // Second invocation simulates immediate re-run: same `now`, but
          // `lastChecked` has been advanced atomically to `now` (Req 3.5),
          // so dtMs = 0 and stats must remain unchanged.
          const state2 = {
            pet: {
              ...state.pet,
              stats: r1.newStats,
              lastChecked: r1.newLastChecked,
            },
          };
          const r2 = applyOfflineCatchUp(state2, now);
          expect(r2.newStats).toEqual(r1.newStats);
          expect(r2.newLastChecked).toBe(r1.newLastChecked);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('clamp01', () => {
  it('clamps any number to [0, 100]', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true, min: -1000, max: 1000 }), (x) => {
        const c = clamp01(x);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });
});
