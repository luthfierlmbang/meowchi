/**
 * Shop & inventory property tests.
 *
 * - Property 12: Coin non-negativity (Req 9.3, 10.3, 11.2, 11.3)
 *     For any sequence of purchase/addCoins operations, coins >= 0 always holds.
 * - Property 13: Placement bounds (Req 11.4, 11.8, 11.9)
 *     For any sequence of place/reposition attempts, every placed_item stays
 *     fully inside the Room.
 *
 * Also includes a small set of unit examples for purchase atomicity
 * (Req 11.2/11.3) to complement the universal properties.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { useStore } from '../../state/store';
import type { FurnitureType } from '../../state/types';
import { purchase, PRICES } from './shop';
import { tryPlace, tryReposition } from './inventory';
import { ROOM } from '../../engine/coords';
import { isInsideRoom } from '../../engine/aabb';

function resetStore(): void {
  useStore.getState()._resetToDefaults();
}

describe('Property 12: Coin non-negativity', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('coins >= 0 after arbitrary sequences of purchase + addCoins', () => {
    // **Validates: Requirements 9.3, 10.3, 11.2, 11.3**
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant({ kind: 'purchase' as const, type: 'scratcher' as FurnitureType }),
            fc.constant({ kind: 'purchase' as const, type: 'toy' as FurnitureType }),
            fc.constant({ kind: 'purchase' as const, type: 'litterbox' as FurnitureType }),
            fc.record({
              kind: fc.constant('add' as const),
              amount: fc.integer({ min: 1, max: 100 }),
            }),
          ),
          { minLength: 0, maxLength: 30 },
        ),
        (ops) => {
          resetStore();
          for (const op of ops) {
            if (op.kind === 'purchase') {
              // purchase() is a no-op on insufficient coins (atomic guard).
              purchase(op.type);
            } else {
              useStore.getState().addCoins(op.amount);
            }
            expect(useStore.getState().coins).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 13: Placement bounds', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('every placed_item rect is fully inside the Room after a place/reposition sequence', () => {
    // **Validates: Requirements 11.4, 11.8, 11.9**
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            // Range deliberately spans well beyond the Room (0..375 x 0..500)
            // so that many candidate positions are out-of-bounds and exercise
            // the rejection path. In-bounds positions still occur frequently
            // enough to drive successful placements.
            x: fc.integer({ min: -50, max: 500 }),
            y: fc.integer({ min: -50, max: 600 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (positions) => {
          resetStore();
          // Seed enough coins to afford one of each type, then purchase.
          useStore.getState().addCoins(1000);
          purchase('scratcher');
          purchase('toy');
          purchase('litterbox');

          for (const pos of positions) {
            const inv = useStore.getState().inventory;
            if (inv.length > 0) {
              tryPlace(inv[0].id, { x: pos.x, y: pos.y });
            } else {
              const placed = useStore.getState().placed_items;
              if (placed.length > 0) {
                tryReposition(placed[0].id, { x: pos.x, y: pos.y });
              }
            }
            // Invariant: every placed_item must be in-bounds.
            for (const p of useStore.getState().placed_items) {
              expect(
                isInsideRoom(
                  { x: p.x, y: p.y, width: p.width, height: p.height },
                  ROOM,
                ),
              ).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Purchase atomicity (Req 11.2/11.3)', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('purchase succeeds when coins >= price and adds exactly one inventory entry', () => {
    const startCoins = useStore.getState().coins; // default 200
    const result = purchase('toy');
    expect(result.ok).toBe(true);
    expect(useStore.getState().coins).toBe(startCoins - PRICES.toy);
    expect(useStore.getState().inventory.length).toBe(1);
  });

  it('purchase fails atomically when coins < price (no state change)', () => {
    // Drive coins to 0 via the public mutator (addCoins clamps at 0).
    useStore.getState().addCoins(-1_000_000);
    const startCoins = useStore.getState().coins;
    const startInv = useStore.getState().inventory.length;
    const result = purchase('toy');
    expect(result.ok).toBe(false);
    expect(useStore.getState().coins).toBe(startCoins);
    expect(useStore.getState().inventory.length).toBe(startInv);
  });
});
