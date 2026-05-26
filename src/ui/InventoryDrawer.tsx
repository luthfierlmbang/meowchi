import { GameButton, GameIcon } from '../components/GameUI';
import { ASSET_MAP } from '../assets/Asset_Map';
import { ROOM, Y_FLOOR } from '../engine/coords';
import { LABELS } from '../features/shop/shop';
import { removePlaced, tryPlace } from '../features/shop/inventory';
import { useStore } from '../state/store';
import { showToast } from './Toast';
import type { FurnitureType, InventoryEntry, PlacedItem } from '../state/types';

/**
 * Inventory drawer (bottom sheet) — Req 11.4, 11.5, 11.10. Design §5, §15.
 *
 * Mobile-first: slides up from the bottom, controlled via `open`/`onClose`.
 * - Inventory list: each row has sprite + label + a "Tempatkan" button.
 *   Tap "Tempatkan" auto-places the item at the next free floor slot via
 *   `tryPlace(entryId, candidatePos)` (Req 11.4, 11.10).
 * - Placed list: each row has sprite + label + a remove button that calls
 *   `removePlaced(id)` to send the item back to inventory (Req 11.5).
 *
 * Drag-from-drawer is intentionally out of scope for v1.0 (handled via tap
 * placement). Reposition while in the room is handled by Room/inventory_drag.
 */

function spriteUrlFor(type: FurnitureType): string {
  switch (type) {
    case 'scratcher':
      return ASSET_MAP.items.scratcher;
    case 'toy':
      return ASSET_MAP.items.toy;
    case 'litterbox':
      return ASSET_MAP.items.litterbox_clean;
  }
}

/**
 * Find a non-overlapping in-bounds floor slot for an inventory entry.
 * Sweeps the floor row left→right starting at x=32 in steps of width+16.
 * Returns null if no slot fits without overlapping existing placed_items.
 */
function findFreeFloorSlot(entry: InventoryEntry): { x: number; y: number } | null {
  const state = useStore.getState();
  const placed = state.placed_items;
  const y = Y_FLOOR - entry.height;
  for (let x = 32; x + entry.width <= ROOM.right - 32; x += entry.width + 16) {
    const candidate = { x, y, width: entry.width, height: entry.height };
    const overlap = placed.some(
      (p) =>
        candidate.x < p.x + p.width &&
        candidate.x + candidate.width > p.x &&
        candidate.y < p.y + p.height &&
        candidate.y + candidate.height > p.y,
    );
    if (!overlap) return { x, y };
  }
  return null;
}

interface InventoryRowProps {
  entry: InventoryEntry;
}

function InventoryRow({ entry }: InventoryRowProps) {
  function handlePlace() {
    const slot = findFreeFloorSlot(entry);
    if (!slot) {
      showToast('Tidak ada ruang kosong di lantai.', 'warning');
      return;
    }
    const result = tryPlace(entry.id, slot);
    if (result.ok) {
      showToast(`${LABELS[entry.type]} ditempatkan.`, 'info');
      return;
    }
    if (result.reason === 'not_found') {
      showToast('Item tidak ditemukan di inventaris.', 'error');
      return;
    }
    showToast('Gagal menempatkan item.', 'error');
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: 8,
        background: 'var(--secondary-500, #42224d)',
        borderRadius: 8,
      }}
    >
      <img
        className="pixel-img"
        src={spriteUrlFor(entry.type)}
        alt={LABELS[entry.type]}
        draggable={false}
        style={{ width: 48, height: 48, objectFit: 'contain' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: 'var(--primary-200, #e1bb17)',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {LABELS[entry.type]}
        </div>
        <div style={{ color: 'var(--secondary-100, #d96eff)', fontSize: 10, fontWeight: 700 }}>
          {entry.width}×{entry.height} px
        </div>
      </div>
      <GameButton tone="primary" onClick={handlePlace} showLeftIcon={false}>
        Tempatkan
      </GameButton>
    </div>
  );
}

interface PlacedRowProps {
  item: PlacedItem;
}

function PlacedRow({ item }: PlacedRowProps) {
  function handleRemove() {
    const ok = removePlaced(item.id);
    if (ok) showToast('Item dikembalikan ke inventaris.', 'info');
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: 8,
        background: 'var(--secondary-400, #5b2f6b)',
        borderRadius: 8,
      }}
    >
      <img
        className="pixel-img"
        src={spriteUrlFor(item.type)}
        alt={LABELS[item.type]}
        draggable={false}
        style={{ width: 48, height: 48, objectFit: 'contain' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: 'var(--primary-200, #e1bb17)',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {LABELS[item.type]}
        </div>
        <div style={{ color: 'var(--secondary-100, #d96eff)', fontSize: 10, fontWeight: 700 }}>
          ({item.x}, {item.y})
        </div>
      </div>
      <GameButton
        tone="negative"
        iconOnly
        iconLeft="trash"
        onClick={handleRemove}
        aria-label="Kembalikan ke inventaris"
      />
    </div>
  );
}

export interface InventoryDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function InventoryDrawer({ open, onClose }: InventoryDrawerProps) {
  const inventory = useStore((s) => s.inventory);
  const placed_items = useStore((s) => s.placed_items);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inventaris"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 2350,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          maxHeight: '80dvh',
          background: 'var(--secondary-600, #2e1836)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px 16px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 12,
            minHeight: 52,
            borderBottom: '2px solid var(--secondary-500, #42224d)',
          }}
        >
          <strong style={{ color: 'var(--primary-200, #e1bb17)', fontSize: 14 }}>
            Inventaris
          </strong>
          <GameButton
            iconOnly
            iconLeft="close"
            tone="secondary"
            onClick={onClose}
            aria-label="Tutup inventaris"
          />
        </header>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <section>
            <h3
              style={{
                margin: 0,
                marginBottom: 8,
                color: 'var(--primary-200, #e1bb17)',
                fontSize: 11,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <GameIcon name="add" /> Belum Ditempatkan ({inventory.length})
            </h3>
            {inventory.length === 0 ? (
              <div style={{ color: 'var(--secondary-100, #d96eff)', fontSize: 11, padding: 8 }}>
                Beli furnitur dari Toko untuk menambahkan.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inventory.map((e) => (
                  <InventoryRow key={e.id} entry={e} />
                ))}
              </div>
            )}
          </section>
          <section>
            <h3
              style={{
                margin: 0,
                marginBottom: 8,
                color: 'var(--primary-200, #e1bb17)',
                fontSize: 11,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <GameIcon name="check" /> Ditempatkan ({placed_items.length})
            </h3>
            {placed_items.length === 0 ? (
              <div style={{ color: 'var(--secondary-100, #d96eff)', fontSize: 11, padding: 8 }}>
                Belum ada furnitur yang ditempatkan.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {placed_items.map((p) => (
                  <PlacedRow key={p.id} item={p} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
