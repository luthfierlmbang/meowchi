import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { Sprite_Renderer } from './Sprite_Renderer';
import {
  ASSET_MAP,
  getRoomBackgroundForHour,
} from '../assets/Asset_Map';
import {
  carriedBounds,
  catArenaBounds,
  catRectAt,
  clampPosition,
  H_CAT,
  ITEM_DIMS,
  ROOM,
  W_CAT,
} from '../engine/coords';
import { useDragController, type DragControllerHandlers } from '../engine/Drag_Controller';
import { aabb, isInsideRoom, overlapsAny } from '../engine/aabb';
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

// ─── Placed item sprite ───────────────────────────────────────────────────────

function spriteUrlFor(type: FurnitureType, catIsPooping: boolean): string {
  if (type === 'scratcher') return ASSET_MAP.items.scratcher;
  if (type === 'toy') return ASSET_MAP.items.toy;
  // litterbox: switch to used sprite while cat is pooping
  return catIsPooping ? ASSET_MAP.items.litterbox_used : ASSET_MAP.items.litterbox_clean;
}

function itemSizeFor(type: FurnitureType): { width: number; height: number } {
  return ITEM_DIMS[type];
}

interface PlacedItemSpriteProps {
  item: PlacedItem;
  currentState: string;
  catPosition: { x: number; y: number };
  onDragStart: (itemId: string, e: React.PointerEvent) => void;
}

function PlacedItemSprite({ item, currentState, catPosition, onDragStart }: PlacedItemSpriteProps) {
  const size = itemSizeFor(item.type);
  const itemRect = { x: item.x, y: item.y, width: size.width, height: size.height };
  const activeUnderCat = aabb(catRectAt(catPosition), itemRect);
  const isBeingUsed =
    (item.type === 'toy' && currentState === 'eating' && activeUnderCat) ||
    (item.type === 'scratcher' && currentState === 'scratching' && activeUnderCat) ||
    (item.type === 'litterbox' && currentState === 'pooping' && activeUnderCat);

  if (isBeingUsed) return null;

  const src = spriteUrlFor(item.type, item.type === 'litterbox' && isBeingUsed);
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
        width: size.width,
        height: size.height,
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
  const coins = useStore((s) => s.coins);

  const { bind } = useDragController(wrapperRef, dragHandlers);

  // Track whether the cat was sleeping before being carried (for lift_sleepy)
  const prevStateRef = useRef<string>('idle');
  const wasSleeping = prevStateRef.current === 'sleeping' && currentState === 'carried';
  useEffect(() => {
    prevStateRef.current = currentState;
  });

  useEffect(() => {
    const room = roomBoundsFor(wrapperRef.current);
    const arena = currentState === 'carried' ? carriedBounds(room) : catArenaBounds(room);
    const clamped = clampPosition(position, arena, { width: W_CAT, height: H_CAT });
    if (clamped.x !== position.x || clamped.y !== position.y) {
      useStore.getState().setPetPosition(clamped);
    }
  }, [currentState, position.x, position.y]);

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

  // ── Start dragging a placed item ──────────────────────────────────────────
  const startPlacedDrag = useCallback(
    (itemId: string, e: React.PointerEvent) => {
      const item = placed_items.find((p) => p.id === itemId);
      if (!item) return;
      const size = itemSizeFor(item.type);
      const roomEl = wrapperRef.current;
      if (!roomEl) return;
      const rect = roomEl.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - item.x;
      const offsetY = e.clientY - rect.top - item.y;
      const g: DragGhost = {
        kind: 'placed',
        id: itemId,
        entry: { ...item, width: size.width, height: size.height },
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
          currentState={currentState}
          catPosition={position}
          onDragStart={startPlacedDrag}
        />
      ))}

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
    </div>
  );
}
