/**
 * Public inventory API for the shop UI layer (Req 11.4-11.10).
 *
 * Pure validation + atomic commits live in `engine/inventory_drag.ts`. This
 * module re-exports them under a stable path for the `features/shop/*` layer
 * so UI components can import from a single feature folder.
 */
export {
  validatePlacement,
  validateReposition,
  tryPlace,
  tryReposition,
  removePlaced,
  type ValidationResult,
} from '../../engine/inventory_drag';
