import type { RoomBounds, Rect } from './aabb';

// Logical room bounds — used as fallback when actual DOM size is unavailable.
// The Room component now fills the viewport, so runtime code should use
// the actual element dimensions where possible.
export const ROOM: Readonly<RoomBounds> = {
  left: 0,
  top: 0,
  right: 375,
  bottom: 600,
} as const;

// Cat sprite bounding box — enlarged to ~half the screen width
export const W_CAT = 160;
export const H_CAT = 160;

// Floor baseline — sprite's bottom-left edge sits on Y_floor when on the floor
export const Y_FLOOR = ROOM.bottom;
export const FLOOR_Y_FOR_CAT = Y_FLOOR - H_CAT;

/**
 * Clamp a position so the bounding box stays inside `room`.
 */
export function clampPosition(
  pos: { x: number; y: number },
  room: RoomBounds,
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.max(room.left, Math.min(pos.x, room.right - size.width)),
    y: Math.max(room.top, Math.min(pos.y, room.bottom - size.height)),
  };
}

/**
 * Center of a rect.
 */
export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * Euclidean distance between two points.
 */
export function euclid(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build the cat rect from a position (top-left).
 */
export function catRectAt(pos: { x: number; y: number }): Rect {
  return { x: pos.x, y: pos.y, width: W_CAT, height: H_CAT };
}
