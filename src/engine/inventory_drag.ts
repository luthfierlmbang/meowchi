/**
 * Pure-logic helpers for inventory placement and reposition (Req 11.4, 11.7–11.10).
 *
 * Contracts:
 * - Placement is rejected if the entry's bbox would leave the Room (Req 11.8)
 *   OR if it overlaps any existing `placed_items` (Req 11.8).
 * - Reposition uses the same guard but EXCLUDES self from the overlap check (Req 11.9).
 * - Successful placement MOVES the entry from `inventory` to `placed_items`
 *   atomically via the store action (Req 11.7, 11.10).
 *
 * The actual Pointer Events drag UX lives in the InventoryDrawer/Room components
 * (tasks 24.2 / 13.1). This module exposes only validation + atomic commits.
 */
import { aabb, isInsideRoom, overlapsAny, type Rect, type RoomBounds } from './aabb';
import { ROOM } from './coords';
import { useStore } from '../state/store';
import type { InventoryEntry, PlacedItem } from '../state/types';

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'out_of_bounds' | 'overlap' | 'not_found' | 'invalid_input' };

/**
 * Validate placing an inventory entry at (x, y).
 * Caller passes the candidate position; this function returns ok or reason.
 */
export function validatePlacement(
  entry: InventoryEntry,
  pos: { x: number; y: number },
  placed_items: readonly PlacedItem[],
  room: RoomBounds = ROOM,
): ValidationResult {
  if (entry.width <= 0 || entry.height <= 0) {
    return { ok: false, reason: 'invalid_input' };
  }
  const rect: Rect = { x: pos.x, y: pos.y, width: entry.width, height: entry.height };
  if (!isInsideRoom(rect, room)) return { ok: false, reason: 'out_of_bounds' };
  // Cast away readonly for the helper, which only reads.
  if (overlapsAny(rect, placed_items as PlacedItem[])) return { ok: false, reason: 'overlap' };
  return { ok: true };
}

/**
 * Validate repositioning a placed item to (x, y). Excludes itself from overlap.
 */
export function validateReposition(
  item: PlacedItem,
  newPos: { x: number; y: number },
  placed_items: readonly PlacedItem[],
): ValidationResult {
  const rect: Rect = { x: newPos.x, y: newPos.y, width: item.width, height: item.height };
  if (!isInsideRoom(rect, ROOM)) return { ok: false, reason: 'out_of_bounds' };
  if (overlapsAny(rect, placed_items as PlacedItem[], item.id)) {
    return { ok: false, reason: 'overlap' };
  }
  return { ok: true };
}

/**
 * Attempt to place an inventory entry. Returns ok on success; otherwise a reason.
 * Commits via the store's `atomicPlaceItem` action when valid.
 */
export function tryPlace(entryId: string, pos: { x: number; y: number }): ValidationResult {
  const state = useStore.getState();
  const entry = state.inventory.find((i) => i.id === entryId);
  if (!entry) return { ok: false, reason: 'not_found' };
  const v = validatePlacement(entry, pos, state.placed_items);
  if (!v.ok) return v;
  state.atomicPlaceItem(entryId, pos.x, pos.y);
  return { ok: true };
}

export function tryPlaceInRoom(
  entryId: string,
  pos: { x: number; y: number },
  room: RoomBounds,
  overrideEntry?: InventoryEntry,
): ValidationResult {
  const state = useStore.getState();
  const storedEntry = state.inventory.find((i) => i.id === entryId);
  const entry = overrideEntry ?? storedEntry;
  if (!entry) return { ok: false, reason: 'not_found' };
  const v = validatePlacement(entry, pos, state.placed_items, room);
  if (!v.ok) return v;
  state.atomicPlaceItem(entryId, pos.x, pos.y);
  return { ok: true };
}

/**
 * Attempt to reposition a placed item. Returns ok on success; otherwise a reason.
 * Commits via the store's `atomicRepositionItem` action when valid.
 */
export function tryReposition(itemId: string, newPos: { x: number; y: number }): ValidationResult {
  const state = useStore.getState();
  const item = state.placed_items.find((p) => p.id === itemId);
  if (!item) return { ok: false, reason: 'not_found' };
  const v = validateReposition(item, newPos, state.placed_items);
  if (!v.ok) return v;
  state.atomicRepositionItem(itemId, newPos.x, newPos.y);
  return { ok: true };
}

/**
 * Remove a placed item (returns it to inventory). Returns false if not found.
 */
export function removePlaced(itemId: string): boolean {
  const state = useStore.getState();
  const exists = state.placed_items.some((p) => p.id === itemId);
  if (!exists) return false;
  state.atomicRemovePlacedItem(itemId);
  return true;
}

// Re-export aabb for convenience
export { aabb };
