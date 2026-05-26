import { GameButton, GameIcon } from '../components/GameUI';
import { ASSET_MAP } from '../assets/Asset_Map';
import { ITEM_DIMS, ROOM } from '../engine/coords';
import { LABELS } from '../features/shop/shop';
import { removePlaced, tryPlaceInRoom } from '../features/shop/inventory';
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

function currentRoomBounds() {
  const roomEl = document.querySelector<HTMLElement>('.mochi-room');
  return {
    left: 0,
    top: 0,
    right: roomEl?.clientWidth ?? ROOM.right,
    bottom: roomEl?.clientHeight ?? ROOM.bottom,
  };
}

function normalizeEntrySize(entry: InventoryEntry): InventoryEntry {
  const size = ITEM_DIMS[entry.type];
  return { ...entry, width: size.width, height: size.height };
}

function normalizePlacedSize(item: PlacedItem): PlacedItem {
  const size = ITEM_DIMS[item.type];
  return { ...item, width: size.width, height: size.height };
}

/**
 * Find a non-overlapping in-bounds floor slot for an inventory entry.
 * Sweeps the floor row left→right starting at x=32 in steps of width+16.
 * Returns null if no slot fits without overlapping existing placed_items.
 */
function findFreeFloorSlot(entry: InventoryEntry): { x: number; y: number } | null {
  const state = useStore.getState();
  const normalizedEntry = normalizeEntrySize(entry);
  const placed = state.placed_items.map(normalizePlacedSize);
  const room = currentRoomBounds();
  const y = room.bottom - normalizedEntry.height - 14;
  for (let x = 24; x + normalizedEntry.width <= room.right - 24; x += normalizedEntry.width + 16) {
    const candidate = { x, y, width: normalizedEntry.width, height: normalizedEntry.height };
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
    const result = tryPlaceInRoom(entry.id, slot, currentRoomBounds(), normalizeEntrySize(entry));
    if (result.ok) {
      showToast(`${LABELS[entry.type]} ditempatkan.`, 'info');
      return;
    }
    if (result.reason === 'not_found') {
      showToast('Item tidak ditemukan di inventaris.', 'error');
      return;
    }
    if (result.reason === 'overlap') {
      showToast('Area itu sudah terisi barang lain.', 'warning');
      return;
    }
    if (result.reason === 'out_of_bounds') {
      showToast('Barang harus tetap di area lantai rumah.', 'warning');
      return;
    }
    showToast('Gagal menempatkan item.', 'error');
  }
  return (
    <div
      style={{
        display: 'flex',
        flex: '0 0 136px',
        minHeight: 168,
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
        alignItems: 'center',
        padding: 10,
        background: 'rgba(255,255,255,0.92)',
        border: '2px solid var(--meow-border)',
        borderRadius: 8,
        scrollSnapAlign: 'start',
      }}
    >
      <img
        className="pixel-img"
        src={spriteUrlFor(entry.type)}
        alt={LABELS[entry.type]}
        draggable={false}
        style={{ width: 60, height: 60, objectFit: 'contain' }}
      />
      <div style={{ width: '100%', minWidth: 0, textAlign: 'center' }}>
        <div
          style={{
            color: 'var(--meow-text)',
            fontFamily: 'var(--meow-body)',
            fontWeight: 800,
            fontSize: 12,
            lineHeight: 1.15,
          }}
        >
          {LABELS[entry.type]}
        </div>
        <div style={{ color: 'var(--meow-text-muted)', fontSize: 10, fontWeight: 700, marginTop: 3 }}>
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
        flex: '0 0 128px',
        minHeight: 142,
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
        alignItems: 'center',
        padding: 10,
        background: 'rgba(138,0,0,0.08)',
        border: '2px solid rgba(138,0,0,0.18)',
        borderRadius: 8,
        scrollSnapAlign: 'start',
      }}
    >
      <img
        className="pixel-img"
        src={spriteUrlFor(item.type)}
        alt={LABELS[item.type]}
        draggable={false}
        style={{ width: 54, height: 54, objectFit: 'contain' }}
      />
      <div style={{ width: '100%', minWidth: 0, textAlign: 'center' }}>
        <div
          style={{
            color: 'var(--meow-text)',
            fontFamily: 'var(--meow-body)',
            fontWeight: 800,
            fontSize: 12,
            lineHeight: 1.15,
          }}
        >
          {LABELS[item.type]}
        </div>
        <div style={{ color: 'var(--meow-text-muted)', fontSize: 10, fontWeight: 700, marginTop: 3 }}>
          Sudah di lantai
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
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, transparent 0%, rgba(29,41,61,0.22) 100%)',
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
          maxHeight: '46%',
          background: 'var(--meow-surface)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '18px 18px 0 0',
          borderTop: '2px solid var(--meow-border)',
          boxShadow: '0 -16px 44px rgba(29,41,61,0.24)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            minHeight: 52,
            borderBottom: '1px solid var(--meow-border)',
          }}
        >
          <strong style={{ color: 'var(--meow-text)', fontSize: 14 }}>
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
            padding: '12px 14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <section>
            <h3
              style={{
                margin: 0,
                marginBottom: 8,
                color: 'var(--meow-text)',
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
              <div style={{ color: 'var(--meow-text-muted)', fontSize: 11, padding: 8 }}>
                Beli furnitur dari Toko untuk menambahkan.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingBottom: 4,
                  scrollSnapType: 'x mandatory',
                }}
              >
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
                color: 'var(--meow-text)',
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
              <div style={{ color: 'var(--meow-text-muted)', fontSize: 11, padding: 8 }}>
                Belum ada furnitur yang ditempatkan.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingBottom: 4,
                  scrollSnapType: 'x mandatory',
                }}
              >
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
