import type { FurnitureType, PlacedItem } from '../state/types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DropResolution {
  type: FurnitureType;
  item: PlacedItem;
  index: number;
}

const TYPE_RANK: Record<FurnitureType, number> = {
  litterbox: 0,
  toy: 1,
  scratcher: 2,
};

/**
 * Axis-Aligned Bounding Box overlap test.
 * Symmetric: aabb(A,B) === aabb(B,A) (Req 6.12).
 * Self-overlap: for any rect with W>0 and H>0, aabb(R,R) === true (Req 6.1).
 */
export function aabb(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Euclidean distance between two centers.
 */
function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function euclid(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Resolve a drop. Returns null if no overlap; otherwise the chosen item.
 *
 * Priority order (Req 6.4):
 *   (a) Type hierarchy: litterbox > toy > scratcher
 *   (b) For same type: smallest Euclidean distance from item center to drop center
 *   (c) Final tie-breaker: ascending index in placed_items array
 */
export function resolveDrop(
  catRect: Rect,
  placed_items: PlacedItem[],
  _dropPos?: { x: number; y: number }, // reserved for future API symmetry; cat center is used
): DropResolution | null {
  const catCenter = center(catRect);
  const hits = placed_items
    .map((item, index) => ({
      item,
      index,
      hit: aabb(catRect, { x: item.x, y: item.y, width: item.width, height: item.height }),
    }))
    .filter((h) => h.hit);

  if (hits.length === 0) return null;

  hits.sort((a, b) => {
    const rankDiff = TYPE_RANK[a.item.type] - TYPE_RANK[b.item.type];
    if (rankDiff !== 0) return rankDiff;
    const distDiff =
      euclid(
        center({ x: a.item.x, y: a.item.y, width: a.item.width, height: a.item.height }),
        catCenter,
      ) -
      euclid(
        center({ x: b.item.x, y: b.item.y, width: b.item.width, height: b.item.height }),
        catCenter,
      );
    if (distDiff !== 0) return distDiff;
    return a.index - b.index;
  });

  const winner = hits[0];
  return { type: winner.item.type, item: winner.item, index: winner.index };
}

/**
 * Clamp a rect so it stays fully inside the room bounds (Req 6.6).
 * Returns a new rect with adjusted x/y; width/height unchanged.
 */
export function clampRectToRoom(rect: Rect, room: RoomBounds): Rect {
  const x = Math.max(room.left, Math.min(rect.x, room.right - rect.width));
  const y = Math.max(room.top, Math.min(rect.y, room.bottom - rect.height));
  return { x, y, width: rect.width, height: rect.height };
}

/**
 * Helper: check if a rect would overlap any existing placed_items (excluding optional self).
 * Used by inventory placement guard (Req 11.8) and reposition (Req 11.9).
 */
export function overlapsAny(rect: Rect, placed_items: PlacedItem[], excludeId?: string): boolean {
  return placed_items.some((p) => {
    if (excludeId && p.id === excludeId) return false;
    return aabb(rect, { x: p.x, y: p.y, width: p.width, height: p.height });
  });
}

/**
 * Helper: check if a rect is fully inside the room.
 */
export function isInsideRoom(rect: Rect, room: RoomBounds): boolean {
  return (
    rect.x >= room.left &&
    rect.y >= room.top &&
    rect.x + rect.width <= room.right &&
    rect.y + rect.height <= room.bottom
  );
}
