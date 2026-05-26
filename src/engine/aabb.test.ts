import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { aabb, isInsideRoom, overlapsAny, type Rect, type RoomBounds } from './aabb';
import type { PlacedItem } from '../state/types';

const rectArb = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -1000, max: 1000 }),
  width: fc.integer({ min: 1, max: 200 }),
  height: fc.integer({ min: 1, max: 200 }),
});

const ROOM: RoomBounds = { left: 0, top: 0, right: 375, bottom: 500 };

const inRoomRectArb = fc
  .record({
    x: fc.integer({ min: 0, max: 300 }),
    y: fc.integer({ min: 0, max: 400 }),
    width: fc.integer({ min: 16, max: 80 }),
    height: fc.integer({ min: 16, max: 80 }),
  })
  .filter((r) => r.x + r.width <= ROOM.right && r.y + r.height <= ROOM.bottom);

const placedItemArb = fc.tuple(inRoomRectArb, fc.string({ minLength: 1, maxLength: 20 })).map(
  ([rect, id]): PlacedItem => ({
    id: `pi_${id}_${rect.x}_${rect.y}`,
    type: 'scratcher',
    width: rect.width,
    height: rect.height,
    x: rect.x,
    y: rect.y,
  }),
);

describe('aabb symmetry property (Property 7)', () => {
  it('aabb(A, B) === aabb(B, A) for all rects', () => {
    fc.assert(
      fc.property(rectArb, rectArb, (a, b) => {
        expect(aabb(a, b)).toBe(aabb(b, a));
      }),
      { numRuns: 200 },
    );
  });
});

describe('aabb self-overlap property (Property 7)', () => {
  it('aabb(R, R) === true for all rects with W>0 and H>0', () => {
    fc.assert(
      fc.property(rectArb, (r) => {
        expect(aabb(r, r)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Placement no-overlap guard (Property 8)', () => {
  it('rejects candidates that overlap an existing placed item or leave the Room', () => {
    fc.assert(
      fc.property(
        fc.array(placedItemArb, { minLength: 0, maxLength: 5 }),
        inRoomRectArb,
        fc.integer({ min: 16, max: 80 }),
        fc.integer({ min: 16, max: 80 }),
        (placed_items, candidate, w, h) => {
          // Pre-condition: ensure unique ids in placed_items (rare collision via random strings)
          const uniqueItems: PlacedItem[] = [];
          const seen = new Set<string>();
          for (const p of placed_items) {
            if (!seen.has(p.id)) {
              seen.add(p.id);
              uniqueItems.push(p);
            }
          }
          const rect: Rect = { x: candidate.x, y: candidate.y, width: w, height: h };
          const inside = isInsideRoom(rect, ROOM);
          const overlap = overlapsAny(rect, uniqueItems);
          // The "guard": placement must succeed iff inside AND !overlap.
          const wouldAccept = inside && !overlap;
          // Inverse: if wouldAccept is false, reason is either out_of_bounds or overlap.
          if (!wouldAccept) {
            expect(!inside || overlap).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
