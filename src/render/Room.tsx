import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Sprite_Renderer } from './Sprite_Renderer';
import {
  ASSET_MAP,
  FRAME_DURATION_MS_ACTIVE,
  getRoomBackgroundForHour,
} from '../assets/Asset_Map';
import { catArenaBounds, clampPosition, H_CAT, ROOM, W_CAT } from '../engine/coords';
import { useDragController, type DragControllerHandlers } from '../engine/Drag_Controller';
import { isInsideRoom, overlapsAny } from '../engine/aabb';
import type { PlacedItem, InventoryEntry, FurnitureType } from '../state/types';
import { LABELS } from '../features/shop/shop';

export interface RoomProps {
  dragHandlers: DragControllerHandlers;
}

// ─── Time display ────────────────────────────────────────────────────────────

function useCurrentTime(): string {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  });
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }, 10_000); // update every 10 s is plenty for HH:MM display
    return () => clearInterval(id);
  }, []);
  return time;
}

// ─── Background ──────────────────────────────────────────────────────────────

function useTimeOfDayBackground(): string {
  const [bg, setBg] = useState(() => getRoomBackgroundForHour(new Date().getHours()));
  useEffect(() => {
    const id = setInterval(() => {
      setBg(getRoomBackgroundForHour(new Date().getHours()));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return bg;
}

// ─── Toy overlay ─────────────────────────────────────────────────────────────

function ToyActionOverlay({ x, y }: { x: number; y: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % ASSET_MAP.toy_action.length);
    }, FRAME_DURATION_MS_ACTIVE);
    return () => clearInterval(id);
  }, []);
  return (
    <img
      className="pixel-img"
      src={ASSET_MAP.toy_action[frame]}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        position: 'absolute',
        left: x,
        top: y - 16,
        width: 48,
        height: 48,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  );
}

// ─── Placed item sprite ───────────────────────────────────────────────────────

function spriteUrlFor(type: FurnitureType, catIsPooping: boolean): string {
  if (type === 'scratcher') return ASSET_MAP.items.scratcher;
  if (type === 'toy') return ASSET_MAP.items.toy;
  // litterbox: switch to used sprite while cat is pooping
  return catIsPooping ? ASSET_MAP.items.litterbox_used : ASSET_MAP.items.litterbox_clean;
}

interface PlacedItemSpriteProps {
  item: PlacedItem;
  catIsPooping: boolean;
  onDragStart: (itemId: string, e: React.PointerEvent) => void;
}

function PlacedItemSprite({ item, catIsPooping, onDragStart }: PlacedItemSpriteProps) {
  const src = spriteUrlFor(item.type, catIsPooping);
  // Hide litterbox sprite while cat is pooping — the Pup animation renders on top
  // and the litterbox_used sprite would double up. We show litterbox_used ONLY
  // when the cat is NOT actively animating the pup frames (i.e., after pooping ends).
  // During active pooping, hide the placed litterbox entirely so only the cat's
  // Pup animation is visible.
  if (item.type === 'litterbox' && catIsPooping) {
    // Show the used litterbox sprite at the same position but behind the cat
    return (
      <img
        className="pixel-img"
        src={ASSET_MAP.items.litterbox_used}
        alt="Litter Box"
        draggable={false}
        style={{
          position: 'absolute',
          left: item.x,
          top: item.y,
          width: item.width,
          height: item.height,
          userSelect: 'none',
          pointerEvents: 'none', // no drag while cat is using it
        }}
      />
    );
  }
  return (
    <img
      className="pixel-img"
      src={src}
      alt={LABELS[item.type]}
      draggable={false}
      style={{
        position: 'absolute',
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        userSelect: 'none',
        cursor: 'grab',
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        e.stopPropagation();
        onDragStart(item.id, e);
      }}
    />
  );
}

// ─── Drag-to-place ghost ──────────────────────────────────────────────────────

interface DragGhost {
  kind: 'inventory' | 'placed';
  id: string;
  entry: InventoryEntry;
  x: number; // current pointer position (top-left of ghost)
  y: number;
  offsetX: number; // pointer offset from ghost top-left
  offsetY: number;
  valid: boolean; // whether current position is a valid drop
}

function ghostSpriteUrl(type: FurnitureType): string {
  return spriteUrlFor(type, false);
}

function roomBoundsFor(roomEl: HTMLElement | null) {
  return {
    left: 0,
    top: 0,
    right: roomEl ? roomEl.clientWidth : ROOM.right,
    bottom: roomEl ? roomEl.clientHeight : ROOM.bottom,
  };
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export function Room({ dragHandlers }: RoomProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bg = useTimeOfDayBackground();
  const time = useCurrentTime();

  const currentState = useStore((s) => s.pet.currentState);
  const energy = useStore((s) => s.pet.stats.energy);
  const position = useStore((s) => s.pet.position);
  const placed_items = useStore((s) => s.placed_items);
  const inventory = useStore((s) => s.inventory);
  const coins = useStore((s) => s.coins);

  const { bind } = useDragController(wrapperRef, dragHandlers);

  // Track whether the cat was sleeping before being carried (for lift_sleepy)
  const prevStateRef = useRef<string>('idle');
  const wasSleeping = prevStateRef.current === 'sleeping' && currentState === 'carried';
  useEffect(() => {
    prevStateRef.current = currentState;
  });

  const catIsPooping = currentState === 'pooping';
  const firstToy = placed_items.find((p) => p.type === 'toy');

  useEffect(() => {
    const arena = catArenaBounds(roomBoundsFor(wrapperRef.current));
    const clamped = clampPosition(position, arena, { width: W_CAT, height: H_CAT });
    if (clamped.x !== position.x || clamped.y !== position.y) {
      useStore.getState().setPetPosition(clamped);
    }
  }, [position.x, position.y]);

  // ── Drag ghost state ──────────────────────────────────────────────────────
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const ghostRef = useRef<DragGhost | null>(null);
  ghostRef.current = ghost;

  // Compute whether a candidate position is valid (in-bounds + no overlap)
  // Uses the actual rendered room element size for bounds checking
  const isValidDrop = useCallback(
    (entry: InventoryEntry, x: number, y: number, excludeId?: string): boolean => {
      const roomEl = wrapperRef.current;
      const dynamicRoom = roomBoundsFor(roomEl);
      const rect = { x, y, width: entry.width, height: entry.height };
      if (!isInsideRoom(rect, dynamicRoom)) return false;
      const others = placed_items.filter((p) => p.id !== excludeId);
      if (overlapsAny(rect, others)) return false;
      return true;
    },
    [placed_items],
  );

  // ── Start dragging an inventory item ─────────────────────────────────────
  const startInventoryDrag = useCallback(
    (entryId: string, e: React.PointerEvent) => {
      const entry = inventory.find((i) => i.id === entryId);
      if (!entry) return;
      const roomEl = wrapperRef.current;
      if (!roomEl) return;
      const rect = roomEl.getBoundingClientRect();
      const x = e.clientX - rect.left - entry.width / 2;
      const y = e.clientY - rect.top - entry.height / 2;
      const g: DragGhost = {
        kind: 'inventory',
        id: entryId,
        entry,
        x,
        y,
        offsetX: entry.width / 2,
        offsetY: entry.height / 2,
        valid: isValidDrop(entry, x, y),
      };
      setGhost(g);
      // Capture on the room element so move events keep coming
      try { (roomEl as HTMLElement & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    },
    [inventory, isValidDrop],
  );

  // ── Start dragging a placed item ──────────────────────────────────────────
  const startPlacedDrag = useCallback(
    (itemId: string, e: React.PointerEvent) => {
      const item = placed_items.find((p) => p.id === itemId);
      if (!item) return;
      const roomEl = wrapperRef.current;
      if (!roomEl) return;
      const rect = roomEl.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - item.x;
      const offsetY = e.clientY - rect.top - item.y;
      const g: DragGhost = {
        kind: 'placed',
        id: itemId,
        entry: item,
        x: item.x,
        y: item.y,
        offsetX,
        offsetY,
        valid: true,
      };
      setGhost(g);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [placed_items],
  );

  // ── Pointer move on Room (ghost tracking) ─────────────────────────────────
  const handleRoomPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = ghostRef.current;
      if (!g) return;
      const roomEl = wrapperRef.current;
      if (!roomEl) return;
      const rect = roomEl.getBoundingClientRect();
      const x = e.clientX - rect.left - g.offsetX;
      const y = e.clientY - rect.top - g.offsetY;
      const valid = isValidDrop(g.entry, x, y, g.kind === 'placed' ? g.id : undefined);
      setGhost({ ...g, x, y, valid });
    },
    [isValidDrop],
  );

  // ── Pointer up on Room (commit drop) ─────────────────────────────────────
  const handleRoomPointerUp = useCallback(() => {
    const g = ghostRef.current;
    if (!g) return;
    setGhost(null);
    if (!g.valid) return;

    const store = useStore.getState();
    if (g.kind === 'inventory') {
      store.atomicPlaceItem(g.id, Math.round(g.x), Math.round(g.y));
    } else {
      store.atomicRepositionItem(g.id, Math.round(g.x), Math.round(g.y));
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="mochi-room"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
      onPointerMove={handleRoomPointerMove}
      onPointerUp={handleRoomPointerUp}
      onPointerCancel={() => setGhost(null)}
    >
      {/* Background */}
      <img
        className="pixel-img"
        src={bg}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      <div className="meow-room-chip meow-room-time" aria-label={`Jam ${time}`}>
        <img src="/assets/figma/clock.png" alt="" draggable={false} />
        <span>{time}</span>
      </div>
      <div className="meow-room-chip meow-room-coins" aria-label={`Koin ${coins}`}>
        <img src="/assets/figma/coin.png" alt="" draggable={false} />
        <span>{coins.toLocaleString('id-ID')}</span>
      </div>

      {/* Placed items */}
      {placed_items.map((item) => (
        <PlacedItemSprite
          key={item.id}
          item={item}
          catIsPooping={catIsPooping}
          onDragStart={startPlacedDrag}
        />
      ))}

      {/* Inventory items being dragged from drawer — show as ghosts in Room */}
      {inventory.map((entry) => {
        // Only show a ghost for the item currently being dragged
        if (ghost?.kind === 'inventory' && ghost.id === entry.id) return null;
        return null; // inventory items not shown in room until placed
      })}

      {/* Toy-action overlay */}
      {firstToy && !ghost && <ToyActionOverlay x={firstToy.x} y={firstToy.y} />}

      {/* Cat */}
      <Sprite_Renderer
        currentState={currentState}
        energy={energy}
        wasSleeping={wasSleeping}
        position={position}
        {...bind}
      />

      {/* Drag ghost */}
      {ghost && (
        <img
          className="pixel-img"
          src={ghostSpriteUrl(ghost.entry.type)}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute',
            left: ghost.x,
            top: ghost.y,
            width: ghost.entry.width,
            height: ghost.entry.height,
            opacity: ghost.valid ? 0.85 : 0.4,
            outline: ghost.valid ? '2px solid var(--positive-100, #25ffa3)' : '2px solid var(--negative-100, #ff2929)',
            borderRadius: 4,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 50,
          }}
        />
      )}

      {/* Inventory drag hint — show items from inventory as draggable chips at bottom */}
      {inventory.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            pointerEvents: 'auto',
            zIndex: 20,
          }}
        >
          {inventory.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                cursor: 'grab',
                touchAction: 'none',
              }}
              onPointerDown={(e) => {
                if (e.button !== 0 || !e.isPrimary) return;
                e.stopPropagation();
                startInventoryDrag(entry.id, e);
              }}
            >
              <img
                className="pixel-img"
                src={ghostSpriteUrl(entry.type)}
                alt={LABELS[entry.type]}
                draggable={false}
                style={{
                  width: Math.min(entry.width, 48),
                  height: Math.min(entry.height, 48),
                  objectFit: 'contain',
                  background: 'rgba(46,24,54,0.75)',
                  borderRadius: 6,
                  border: '2px solid var(--primary-300, #c5a414)',
                  padding: 2,
                }}
              />
              <span
                style={{
                  color: 'var(--primary-200, #e1bb17)',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 800,
                  fontSize: 9,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  pointerEvents: 'none',
                }}
              >
                {LABELS[entry.type]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
