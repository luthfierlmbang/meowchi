/**
 * Shop logic: fixed catalog (price + dimensions per type) and atomic purchase.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.7
 * Design: §15
 *
 * - Catalog is fixed in code (no remote config).
 * - `purchase(type)` checks affordability, then performs an atomic deduct +
 *   inventory push via `useStore.atomicPurchase`. State changes only when the
 *   purchase succeeds.
 * - Inventory ids are unique across `inventory ∪ placed_items` (Req 11.7).
 */
import { useStore } from '../../state/store';
import { ITEM_DIMS } from '../../engine/coords';
import type { FurnitureType, InventoryEntry } from '../../state/types';

export const PRICES: Record<FurnitureType, number> = {
  scratcher: 50,
  toy: 30,
  litterbox: 80,
};

export const DIMS: Record<FurnitureType, { width: number; height: number }> = ITEM_DIMS;

export const LABELS: Record<FurnitureType, string> = {
  scratcher: 'Cat Scratcher',
  toy: 'Toy Fish Bowl',
  litterbox: 'Litter Box',
};

export type PurchaseResult =
  | { ok: true; entry: InventoryEntry }
  | { ok: false; reason: 'insufficient_coins' | 'id_collision' };

/**
 * Generate a unique inventory id that doesn't collide with anything in
 * inventory ∪ placed_items.
 */
function nextUniqueId(type: FurnitureType): string {
  const state = useStore.getState();
  const used = new Set<string>([
    ...state.inventory.map((i) => i.id),
    ...state.placed_items.map((p) => p.id),
  ]);
  for (let attempt = 0; attempt < 32; attempt++) {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `inv_${type}_${crypto.randomUUID()}`
        : `inv_${type}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    if (!used.has(id)) return id;
  }
  // Theoretically unreachable.
  throw new Error('Unable to generate unique id');
}

/**
 * Purchase one furniture of `type`. Returns the new inventory entry on success
 * or a failure reason. Atomic: state changes only when ok === true.
 */
export function purchase(type: FurnitureType): PurchaseResult {
  const state = useStore.getState();
  const price = PRICES[type];
  if (state.coins < price) return { ok: false, reason: 'insufficient_coins' };

  const dims = DIMS[type];
  let id: string;
  try {
    id = nextUniqueId(type);
  } catch {
    return { ok: false, reason: 'id_collision' };
  }
  const entry: InventoryEntry = { id, type, width: dims.width, height: dims.height };
  const ok = state.atomicPurchase(price, entry);
  if (!ok) return { ok: false, reason: 'id_collision' };
  return { ok: true, entry };
}

/**
 * Check if the player can afford a given furniture type.
 */
export function canAfford(type: FurnitureType): boolean {
  return useStore.getState().coins >= PRICES[type];
}
