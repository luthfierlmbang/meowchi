import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  ALL_CAT_STATES,
  conditionFlagsFromStats,
  simulateTriggers,
  transition,
  type StateEvent,
} from './state_machine';
import type { CatState, Stats } from '../state/types';

const noLemas = { hungerZero: false };
const lemas = { hungerZero: true };

describe('Example tests for transition table', () => {
  // Forced transitions
  it('Bladder=0 forces pooping from any non-sleeping state', () => {
    for (const s of ALL_CAT_STATES) {
      if (s === 'sleeping') continue;
      expect(transition(s, { kind: 'forced_pooping' }, noLemas).next).toBe('pooping');
    }
  });

  it('Bladder=0 forces pooping even from sleeping', () => {
    expect(transition('sleeping', { kind: 'forced_pooping' }, noLemas).next).toBe('pooping');
  });

  it('Energy=0 forces sleeping from non-sleeping non-forced states', () => {
    for (const s of ALL_CAT_STATES) {
      if (s === 'sleeping') continue;
      expect(transition(s, { kind: 'forced_sleeping' }, noLemas).next).toBe('sleeping');
    }
  });

  // Sleep button
  it('Sleep button transitions non-sleeping non-forced states to sleeping', () => {
    expect(transition('idle', { kind: 'sleep_button' }, noLemas).next).toBe('sleeping');
    expect(transition('walking_left', { kind: 'sleep_button' }, noLemas).next).toBe('sleeping');
    expect(transition('carried', { kind: 'sleep_button' }, noLemas).next).toBe('sleeping');
  });

  it('Sleep button OR wake_up wakes the cat from sleeping → idle', () => {
    expect(transition('sleeping', { kind: 'sleep_button' }, noLemas).next).toBe('idle');
    expect(transition('sleeping', { kind: 'wake_up' }, noLemas).next).toBe('idle');
  });

  // Lemas refusal
  it('Lemas (Hunger=0) coerces walking roll to idle', () => {
    expect(transition('idle', { kind: 'random_roll', result: 'walking_left' }, lemas).next).toBe('idle');
    expect(transition('idle', { kind: 'random_roll', result: 'walking_right' }, lemas).next).toBe('idle');
    // Roll = idle still works in lemas
    expect(transition('idle', { kind: 'random_roll', result: 'idle' }, lemas).next).toBe('idle');
  });

  it('Lemas refuses eating drop (toy → idle)', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: 'toy' }, lemas).next).toBe('idle');
  });

  it('Lemas refuses scratching drop (scratcher → idle)', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: 'scratcher' }, lemas).next).toBe('idle');
  });

  it('Lemas does NOT refuse litterbox drop (forced poop happens regardless)', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: 'litterbox' }, lemas).next).toBe('pooping');
  });

  // Drop targets without lemas
  it('Drop on toy → eating (no lemas)', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: 'toy' }, noLemas).next).toBe('eating');
  });

  it('Drop on scratcher → scratching', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: 'scratcher' }, noLemas).next).toBe('scratching');
  });

  it('Drop on litterbox → pooping', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: 'litterbox' }, noLemas).next).toBe('pooping');
  });

  it('Drop with no overlap → idle', () => {
    expect(transition('carried', { kind: 'drop_resolved', targetType: null }, noLemas).next).toBe('idle');
  });

  // Animation end → idle
  it('animation_end returns from eating to idle', () => {
    expect(transition('eating', { kind: 'animation_end' }, noLemas).next).toBe('idle');
    expect(transition('scratching', { kind: 'animation_end' }, noLemas).next).toBe('idle');
    expect(transition('pooping', { kind: 'animation_end' }, noLemas).next).toBe('idle');
  });

  // Edge hit
  it('Walking edge hit returns to idle', () => {
    expect(transition('walking_left', { kind: 'edge_hit' }, noLemas).next).toBe('idle');
    expect(transition('walking_right', { kind: 'edge_hit' }, noLemas).next).toBe('idle');
  });

  // Pointer down → carried (non-sleeping non-animating)
  it('pointer_down on idle → carried', () => {
    expect(transition('idle', { kind: 'pointer_down' }, noLemas).next).toBe('carried');
  });

  it('pointer_down on sleeping is ignored', () => {
    expect(transition('sleeping', { kind: 'pointer_down' }, noLemas).changed).toBe(false);
  });

  it('pointer_down during animation states is ignored', () => {
    expect(transition('eating', { kind: 'pointer_down' }, noLemas).changed).toBe(false);
    expect(transition('scratching', { kind: 'pointer_down' }, noLemas).changed).toBe(false);
    expect(transition('pooping', { kind: 'pointer_down' }, noLemas).changed).toBe(false);
  });
});

const eventArb: fc.Arbitrary<StateEvent> = fc.oneof(
  fc.constant({ kind: 'pointer_down' as const }),
  fc.constant({ kind: 'pointer_cancel' as const }),
  fc.oneof(
    fc.constant({ kind: 'drop_resolved' as const, targetType: 'scratcher' as const }),
    fc.constant({ kind: 'drop_resolved' as const, targetType: 'toy' as const }),
    fc.constant({ kind: 'drop_resolved' as const, targetType: 'litterbox' as const }),
    fc.constant({ kind: 'drop_resolved' as const, targetType: null }),
  ),
  fc.constant({ kind: 'sleep_button' as const }),
  fc.constant({ kind: 'forced_pooping' as const }),
  fc.constant({ kind: 'forced_sleeping' as const }),
  fc.constant({ kind: 'wake_up' as const }),
  fc.oneof(
    fc.constant({ kind: 'random_roll' as const, result: 'idle' as const }),
    fc.constant({ kind: 'random_roll' as const, result: 'walking_left' as const }),
    fc.constant({ kind: 'random_roll' as const, result: 'walking_right' as const }),
  ),
  fc.constant({ kind: 'animation_end' as const }),
  fc.constant({ kind: 'edge_hit' as const }),
);

describe('Property 4: Single-state invariant', () => {
  it('currentState is always one of the allowed states after any sequence of transitions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_CAT_STATES),
        fc.array(eventArb, { minLength: 0, maxLength: 50 }),
        fc.boolean(),
        (start, events, hungerZero) => {
          let cur: CatState = start;
          for (const e of events) {
            cur = transition(cur, e, { hungerZero }).next;
            expect(ALL_CAT_STATES.includes(cur)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Property 5: Sleep input lock invariant', () => {
  it('No pointer event transitions sleeping → carried', () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 0, maxLength: 30 }),
        fc.boolean(),
        (events, hungerZero) => {
          let cur: CatState = 'sleeping';
          for (const e of events) {
            // Skip wake_up and sleep_button so we stay in sleeping
            if (e.kind === 'wake_up' || e.kind === 'sleep_button' || e.kind === 'forced_pooping') continue;
            cur = transition(cur, e, { hungerZero }).next;
            expect(cur).not.toBe('carried');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Property 6: State trigger priority (Req 4.17)', () => {
  it('When multiple priority triggers fire on the same tick, the highest-priority one wins', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('idle' as CatState, 'walking_left' as CatState, 'carried' as CatState, 'eating' as CatState),
        fc.boolean(),
        (start, hungerZero) => {
          // All five priority triggers fired together
          const triggers: StateEvent[] = [
            { kind: 'random_roll', result: 'walking_left' },
            { kind: 'drop_resolved', targetType: 'toy' },
            { kind: 'sleep_button' },
            { kind: 'forced_sleeping' },
            { kind: 'forced_pooping' },
          ];
          const result = simulateTriggers(start, triggers, { hungerZero });
          // forced_pooping has highest priority
          expect(result.next).toBe('pooping');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Without forced_pooping, forced_sleeping wins over the rest', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('idle' as CatState, 'walking_left' as CatState, 'carried' as CatState),
        fc.boolean(),
        (start, hungerZero) => {
          const triggers: StateEvent[] = [
            { kind: 'random_roll', result: 'walking_left' },
            { kind: 'drop_resolved', targetType: 'toy' },
            { kind: 'sleep_button' },
            { kind: 'forced_sleeping' },
          ];
          const result = simulateTriggers(start, triggers, { hungerZero });
          expect(result.next).toBe('sleeping');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Without forced events, sleep_button wins over drop and roll', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('idle' as CatState, 'walking_left' as CatState, 'carried' as CatState),
        (start) => {
          const triggers: StateEvent[] = [
            { kind: 'random_roll', result: 'walking_right' },
            { kind: 'drop_resolved', targetType: 'toy' },
            { kind: 'sleep_button' },
          ];
          const result = simulateTriggers(start, triggers, noLemas);
          expect(result.next).toBe('sleeping');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('conditionFlagsFromStats', () => {
  it('hungerZero is true iff hunger === 0', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (h) => {
        const stats: Stats = { hunger: h, energy: 50, bladder: 50, happiness: 50 };
        expect(conditionFlagsFromStats(stats).hungerZero).toBe(h === 0);
      }),
      { numRuns: 200 },
    );
  });
});
