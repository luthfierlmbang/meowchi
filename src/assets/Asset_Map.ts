import type { CatState } from '../state/types';

export type FrameUrl = string;

// Frame durations per state (Req 7.4)
export const FRAME_DURATION_MS_ACTIVE = 150;
export const FRAME_DURATION_MS_SLEEP = 300;

// Build URL list helper (uses /assets/... base served by Vite from public/assets/)
const idle = [1, 2, 3].map((i) => `/assets/Idle-Right/Idle-right ${i} 1.png`);
const walking_right = [1, 2, 3, 4, 5].map((i) => `/assets/Walking-Right/Walking-right${i} 1.png`);
const lift_default = [1, 2, 3, 4].map((i) => `/assets/Lift-Default/Lift-${i} 1.png`);
const lift_sleepy = [1, 2, 3, 4].map((i) => `/assets/Lift-Sleepy/Lift-sleepy${i} 1.png`);
const stratch = [1, 2, 3].map((i) => `/assets/Stratch/Stracher-${i} 1.png`);
const eat = [1, 2, 3, 4].map((i) => `/assets/Eat/Eat-${i} 1.png`);
const pup = [1, 2, 3].map((i) => `/assets/Pup/Pasir-kucing${i} 1.png`);
const sleep = [1, 2, 3, 4, 5].map((i) => `/assets/Sleep/Sleep-${i} 1.png`);
const toy_action = [1, 2, 3, 4].map((i) => `/assets/toy-action/toy-fish${i}.png`);
const focus = [`/assets/Walking-Right/Walking-right1 1.png`, `/assets/Walking-Right/Walking-right2 1.png`];
const clicked_left = [`/assets/Clicked-Left/when-clicked-left 1.png`];
const clicked_right = [`/assets/Clicked-Right/when-clicked-right 1.png`];

export interface AssetMap {
  idle: FrameUrl[];
  walking_right: FrameUrl[];
  walking_left: FrameUrl[];
  carried_default: FrameUrl[];
  carried_sleepy: FrameUrl[];
  scratching: FrameUrl[];
  eating: FrameUrl[];
  pooping: FrameUrl[];
  sleeping: FrameUrl[];
  focusing: FrameUrl[];
  clicked_left: FrameUrl[];
  clicked_right: FrameUrl[];
  toy_action: FrameUrl[];
  items: {
    scratcher: FrameUrl;
    toy: FrameUrl;
    litterbox_clean: FrameUrl;
    litterbox_used: FrameUrl;
  };
  rooms: {
    morning: FrameUrl;
    afternoon: FrameUrl;
    evening: FrameUrl;
    night: FrameUrl;
  };
}

export const ASSET_MAP: AssetMap = {
  idle,
  walking_right,
  walking_left: walking_right,
  carried_default: lift_default,
  carried_sleepy: lift_sleepy,
  scratching: stratch,
  eating: eat,
  pooping: pup,
  sleeping: sleep,
  focusing: focus,
  clicked_left,
  clicked_right,
  toy_action,
  items: {
    scratcher: '/assets/Items/Stratcher/Stratcher 1.png',
    toy: '/assets/Items/Fish-Toy.png',
    litterbox_clean: '/assets/Items/Pasir-Kucing/Pasir 1.png',
    litterbox_used: '/assets/Items/Pasir-Kucing/Pasir-pup 1.png',
  },
  rooms: {
    morning: '/assets/House/House-morning.png',
    afternoon: '/assets/House/House-afternoon.png',
    evening: '/assets/House/House-evening.png',
    night: '/assets/House/House-night.png',
  },
};

/**
 * Get all frame URLs in the map (flat list) for preloading.
 */
export function getAllFrameUrls(map: AssetMap = ASSET_MAP): FrameUrl[] {
  const urls = new Set<FrameUrl>();
  map.idle.forEach((u) => urls.add(u));
  map.walking_right.forEach((u) => urls.add(u));
  map.carried_default.forEach((u) => urls.add(u));
  map.carried_sleepy.forEach((u) => urls.add(u));
  map.scratching.forEach((u) => urls.add(u));
  map.eating.forEach((u) => urls.add(u));
  map.pooping.forEach((u) => urls.add(u));
  map.sleeping.forEach((u) => urls.add(u));
  map.focusing.forEach((u) => urls.add(u));
  map.toy_action.forEach((u) => urls.add(u));
  urls.add(map.items.scratcher);
  urls.add(map.items.toy);
  urls.add(map.items.litterbox_clean);
  urls.add(map.items.litterbox_used);
  urls.add(map.rooms.morning);
  urls.add(map.rooms.afternoon);
  urls.add(map.rooms.evening);
  urls.add(map.rooms.night);
  return Array.from(urls);
}

/**
 * Pick the room background based on local hour-of-day.
 *   morning: 5..10
 *   afternoon: 11..15
 *   evening: 16..18
 *   night: 19..4
 */
export function getRoomBackgroundForHour(hour: number, map: AssetMap = ASSET_MAP): FrameUrl {
  if (hour >= 5 && hour <= 10) return map.rooms.morning;
  if (hour >= 11 && hour <= 15) return map.rooms.afternoon;
  if (hour >= 16 && hour <= 18) return map.rooms.evening;
  return map.rooms.night; // 19..23 OR 0..4
}

/**
 * Pick the carried frame array (sleepy variant when Energy ≤ 40).
 */
export function getCarriedFrames(energy: number, map: AssetMap = ASSET_MAP): FrameUrl[] {
  return energy <= 40 ? map.carried_sleepy : map.carried_default;
}

/**
 * Get the frame array for a given cat state (does NOT account for energy-based variants).
 * Use `getCarriedFrames(energy)` for `carried` to pick the right variant.
 */
export function getFramesForState(state: CatState, map: AssetMap = ASSET_MAP): FrameUrl[] {
  switch (state) {
    case 'idle':
      return map.idle;
    case 'walking_left':
    case 'walking_right':
      return map.walking_right;
    case 'carried':
      return map.carried_default; // caller may switch to carried_sleepy
    case 'scratching':
      return map.scratching;
    case 'eating':
      return map.eating;
    case 'pooping':
      return map.pooping;
    case 'sleeping':
      return map.sleeping;
    case 'focusing':
      return map.focusing;
    case 'clicked_left':
      return map.clicked_left;
    case 'clicked_right':
      return map.clicked_right;
  }
}

/**
 * Get the frame duration for a given state.
 */
export function getFrameDurationForState(state: CatState): number {
  if (state === 'sleeping') return FRAME_DURATION_MS_SLEEP;
  if (state === 'focusing') return 400;
  return FRAME_DURATION_MS_ACTIVE;
}
