import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ASSET_MAP,
  FRAME_DURATION_MS_ACTIVE,
  FRAME_DURATION_MS_SLEEP,
  type FrameUrl,
} from '../assets/Asset_Map';
import type { CatState } from '../state/types';
import { W_CAT, H_CAT } from '../engine/coords';

export interface SpriteRendererProps {
  currentState: CatState;
  energy: number; // for carried_sleepy variant when ≤ 40
  wasSleeping?: boolean; // true when cat was just woken from sleep → use lift_sleepy
  position: { x: number; y: number }; // top-left in Room coords
  onPointerDown?: (e: React.PointerEvent<HTMLImageElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLImageElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLImageElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLImageElement>) => void;
  onLostPointerCapture?: (e: React.PointerEvent<HTMLImageElement>) => void;
}

/**
 * Pick the frame array for the given state, accounting for energy-based
 * variants (carried_default vs carried_sleepy).
 */
function framesForState(state: CatState, energy: number, wasSleeping: boolean): FrameUrl[] {
  if (state === 'carried') {
    return (energy <= 40 || wasSleeping) ? ASSET_MAP.carried_sleepy : ASSET_MAP.carried_default;
  }
  switch (state) {
    case 'idle':
      return ASSET_MAP.idle;
    case 'walking_left':
    case 'walking_right':
      return ASSET_MAP.walking_right;
    case 'scratching':
      return ASSET_MAP.scratching;
    case 'eating':
      return ASSET_MAP.eating;
    case 'pooping':
      return ASSET_MAP.pooping;
    case 'sleeping':
      return ASSET_MAP.sleeping;
    case 'clicked_left':
      return ASSET_MAP.clicked_left;
    case 'clicked_right':
      return ASSET_MAP.clicked_right;
  }
}

function frameDurationFor(state: CatState): number {
  return state === 'sleeping' ? FRAME_DURATION_MS_SLEEP : FRAME_DURATION_MS_ACTIVE;
}

/**
 * Sprite renderer for the cat. Advances frames via setTimeout chain so the
 * interval matches the per-state duration exactly. Resets to frame 0 on
 * state change so transitions are crisp.
 */
export function Sprite_Renderer({
  currentState,
  energy,
  wasSleeping = false,
  position,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: SpriteRendererProps) {
  const frames = useMemo(() => framesForState(currentState, energy, wasSleeping), [currentState, energy, wasSleeping]);
  const duration = useMemo(() => frameDurationFor(currentState), [currentState]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [errored, setErrored] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset frame index on state change
  useEffect(() => {
    setFrameIndex(0);
    setErrored(false);
  }, [currentState, energy]);

  // Animate frames via setTimeout chain (one timer at a time)
  useEffect(() => {
    if (frames.length <= 1) return; // no animation needed
    timerRef.current = setTimeout(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, duration);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [frameIndex, duration, frames.length]);

  const src = errored ? ASSET_MAP.idle[0] : frames[frameIndex] ?? frames[0] ?? ASSET_MAP.idle[0];
  const mirrored = currentState === 'walking_left' || currentState === 'clicked_left';
  const carriedInset = currentState === 'carried' ? 16 : 0;

  return (
    <img
      className="pixel-img touch-none"
      src={src}
      alt="Mochi"
      width={W_CAT}
      height={H_CAT}
      draggable={false}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: W_CAT,
        height: H_CAT,
        boxSizing: 'border-box',
        padding: carriedInset,
        transform: mirrored ? 'scaleX(-1)' : undefined,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // Disable pinch/scroll while dragging — the .touch-none utility class
        // also enforces this; this is a defense-in-depth fallback.
        touchAction: 'none',
        cursor: currentState === 'sleeping' ? 'default' : 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onError={() => {
        // eslint-disable-next-line no-console
        console.error('[Sprite_Renderer] Failed to load frame:', src);
        setErrored(true);
      }}
    />
  );
}
