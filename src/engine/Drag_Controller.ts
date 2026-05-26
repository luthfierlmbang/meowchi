import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { resolveDrop, type Rect } from './aabb';
import {
  catArenaBounds,
  catRectAt,
  clampPosition,
  H_CAT,
  ROOM,
  W_CAT,
} from './coords';
import type { StateEvent } from './state_machine';
import { playClick, playCatSound } from './sound';

export interface DragControllerHandlers {
  onCarryStart?: () => void;
  onDropResolved?: (targetType: 'scratcher' | 'toy' | 'litterbox' | null) => void;
  onPointerCancel?: () => void;
  onEvent?: (e: StateEvent) => void;
  /** Called on short tap (< HOLD_MS) — triggers poke/clicked animation */
  onPoke?: (facingLeft: boolean) => void;
}

// Hold threshold: pointer held longer than this → lift; shorter → poke
const HOLD_MS = 300;

let _activePointerId: number | null = null;
let _pointerOffset: { x: number; y: number } | null = null;
let _pointerDownTime = 0;
let _hasMoved = false;
// Track which direction the cat is facing for poke animation
let _facingLeft = false;

function applySelectNone(el: HTMLElement | null): () => void {
  if (!el) return () => {};
  el.classList.add('select-none');
  return () => el.classList.remove('select-none');
}

export function useDragController(
  wrapperRef: React.RefObject<HTMLElement | null>,
  handlers: DragControllerHandlers = {},
): {
  bind: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => void;
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
  };
} {
  const cleanupSelectNoneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const initial = useStore.getState().pet.currentState;
    if (initial === 'carried') {
      cleanupSelectNoneRef.current = applySelectNone(wrapperRef.current);
    }
    const unsub = useStore.subscribe((s, prev) => {
      const cs = s.pet.currentState;
      const prevCs = prev.pet.currentState;
      // Track facing direction from walking state
      if (prevCs === 'walking_left') _facingLeft = true;
      if (prevCs === 'walking_right') _facingLeft = false;
      if (cs === 'carried' && prevCs !== 'carried') {
        cleanupSelectNoneRef.current = applySelectNone(wrapperRef.current);
      } else if (cs !== 'carried' && prevCs === 'carried') {
        cleanupSelectNoneRef.current?.();
        cleanupSelectNoneRef.current = null;
      }
    });
    return () => {
      unsub();
      cleanupSelectNoneRef.current?.();
      cleanupSelectNoneRef.current = null;
    };
  }, [wrapperRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = useStore.getState();
      const cs = state.pet.currentState;

      if (cs === 'eating' || cs === 'scratching' || cs === 'pooping') return;
      if (e.button !== 0 || !e.isPrimary) return;
      if (_activePointerId !== null) return;
      if (e.pointerType === 'touch') e.preventDefault();

      _pointerOffset = {
        x: e.clientX - state.pet.position.x,
        y: e.clientY - state.pet.position.y,
      };
      _activePointerId = e.pointerId;
      _pointerDownTime = Date.now();
      _hasMoved = false;

      const target = e.currentTarget as HTMLElement & { setPointerCapture?: (id: number) => void };
      try { target.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }

      // Don't dispatch yet — wait for pointerUp to decide poke vs lift
    },
    [handlers],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerId !== _activePointerId) return;
      if (!_pointerOffset) return;
      if (e.pointerType === 'touch') e.preventDefault();

      const dx = Math.abs(e.clientX - (_pointerOffset.x + useStore.getState().pet.position.x));
      const dy = Math.abs(e.clientY - (_pointerOffset.y + useStore.getState().pet.position.y));
      if (dx > 8 || dy > 8) _hasMoved = true;

      // Only move the cat if we're already in carried state
      const cs = useStore.getState().pet.currentState;
      if (cs !== 'carried') return;

      // Use actual room element dimensions for clamping
      const roomEl = wrapperRef.current;
      const roomW = roomEl ? roomEl.clientWidth : ROOM.right;
      const roomH = roomEl ? roomEl.clientHeight : ROOM.bottom;
      const dynamicRoom = { left: 0, top: 0, right: roomW, bottom: roomH };
      const arena = catArenaBounds(dynamicRoom);

      const newPos = clampPosition(
        { x: e.clientX - _pointerOffset.x, y: e.clientY - _pointerOffset.y },
        arena,
        { width: W_CAT, height: H_CAT },
      );
      useStore.getState().setPetPosition(newPos);
    },
    [wrapperRef],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerId !== _activePointerId) return;

      const target = e.currentTarget as HTMLElement & { releasePointerCapture?: (id: number) => void };
      try { target.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }

      const heldMs = Date.now() - _pointerDownTime;
      const isHold = heldMs >= HOLD_MS || _hasMoved;
      _activePointerId = null;
      _pointerOffset = null;

      const state = useStore.getState();
      const cs = state.pet.currentState;

      if (!isHold && cs !== 'carried') {
        // Short tap → poke (clicked animation + sound)
        void playCatSound('poke');
        handlers.onPoke?.(_facingLeft);
        return;
      }

      if (cs === 'carried') {
        // Drop resolution
        const catRect: Rect = catRectAt(state.pet.position);
        const resolution = resolveDrop(catRect, state.placed_items);
        const targetType = resolution?.type ?? null;
        handlers.onDropResolved?.(targetType);
        handlers.onEvent?.({ kind: 'drop_resolved', targetType });
      } else if (isHold) {
        // Long press → lift
        void playCatSound('lift');
        handlers.onCarryStart?.();
        handlers.onEvent?.({ kind: 'pointer_down' });
      }
    },
    [handlers],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerId !== _activePointerId) return;
      _activePointerId = null;
      _pointerOffset = null;
      handlers.onPointerCancel?.();
      handlers.onEvent?.({ kind: 'pointer_cancel' });
    },
    [handlers],
  );

  const handleLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerId !== _activePointerId) return;
      _activePointerId = null;
      _pointerOffset = null;
      handlers.onPointerCancel?.();
      handlers.onEvent?.({ kind: 'pointer_cancel' });
    },
    [handlers],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
  }, []);

  return {
    bind: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onLostPointerCapture: handleLostPointerCapture,
      onContextMenu: handleContextMenu,
    },
  };
}

export function _resetForTest(): void {
  _activePointerId = null;
  _pointerOffset = null;
}

export function _getActivePointerIdForTest(): number | null {
  return _activePointerId;
}

export function placeOnFloor(x: number): void {
  const arena = catArenaBounds(ROOM);
  useStore.getState().setPetPosition({
    x: Math.max(arena.left, Math.min(x, arena.right - W_CAT)),
    y: arena.bottom - H_CAT,
  });
}
