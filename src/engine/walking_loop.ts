/**
 * Walking rAF loop (Req 4.3, 4.4; design §6).
 *
 * Active only when `pet.currentState ∈ {walking_left, walking_right}`. Each
 * frame integrates `pet.position.x` at 40 px/s in the appropriate direction,
 * clamps to Room bounds, and dispatches an `edge_hit` event when the cat
 * reaches `Room.left` or `Room.right - W_CAT` so the state machine can return
 * to idle.
 */
import { useStore } from '../state/store';
import { ROOM, W_CAT } from './coords';
import type { StateEvent } from './state_machine';

const WALKING_SPEED_PX_PER_SEC = 40;

let _rafHandle: number | null = null;
let _lastTs: number | null = null;

export interface WalkingHandlers {
  onEdgeHit?: (event: StateEvent) => void;
}

/**
 * Start the walking rAF loop. Idempotent — repeated calls are no-ops while a
 * loop is already running.
 */
export function startWalkingLoop(handlers: WalkingHandlers = {}): void {
  if (_rafHandle !== null) return;
  _lastTs = null;
  const tick = (ts: number) => {
    if (_lastTs === null) _lastTs = ts;
    const dtSec = (ts - _lastTs) / 1000;
    _lastTs = ts;
    runWalkingFrame(dtSec, handlers);
    _rafHandle = requestAnimationFrame(tick);
  };
  _rafHandle = requestAnimationFrame(tick);
}

/** Stop the walking rAF loop. Idempotent. */
export function stopWalkingLoop(): void {
  if (_rafHandle !== null) {
    cancelAnimationFrame(_rafHandle);
    _rafHandle = null;
  }
  _lastTs = null;
}

/**
 * Single frame of walking integration. Exported for deterministic unit tests
 * (drive with explicit `dtSeconds` instead of relying on rAF timing).
 */
export function runWalkingFrame(
  dtSeconds: number,
  handlers: WalkingHandlers = {},
): void {
  const state = useStore.getState();
  const cs = state.pet.currentState;
  if (cs !== 'walking_left' && cs !== 'walking_right') return;

  const dir = cs === 'walking_left' ? -1 : 1;
  const dx = dir * WALKING_SPEED_PX_PER_SEC * dtSeconds;
  const newX = state.pet.position.x + dx;
  const minX = ROOM.left;
  const maxX = ROOM.right - W_CAT;

  let clampedX = newX;
  let hitEdge = false;
  if (newX < minX) {
    clampedX = minX;
    hitEdge = true;
  } else if (newX > maxX) {
    clampedX = maxX;
    hitEdge = true;
  }

  state.setPetPosition({ x: clampedX, y: state.pet.position.y });

  if (hitEdge && handlers.onEdgeHit) {
    handlers.onEdgeHit({ kind: 'edge_hit' });
  }
}
