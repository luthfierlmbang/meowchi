# Design Document — Mochi Virtual Pet v1.0

Frontend-only SPA. Stack: React 19 + Vite + TypeScript + Zustand + IndexedDB + `@google/generative-ai`. Bahasa Indonesia untuk prosa, Inggris untuk identifier kode.

## Overview

> **Mobile-first constraint (user instruction):** Seluruh layout dirancang untuk layar mobile (lebar 375–430 px, portrait). Desktop hanya mendapat centering + max-width wrapper. Semua touch target minimum 44×44 px. Gunakan `100dvh` untuk full-screen Room agar address bar mobile tidak memotong layout.

Mochi adalah virtual pet pixel-art di mana pengguna merawat seekor kucing yang stat-nya menurun real-time. Aplikasi terdiri dari tiga lapis: (a) **chrome** (modal, drawer, button, progress) memakai kit yang sudah ada di `src/components/GameUI.tsx`; (b) **Pet/Room layer** kustom yang merender sprite, menangani Pointer Events, dan AABB drop resolution; (c) **logic & persistence layer** (Zustand store + persist + IndexedDB + Gemini client). Semua state global dikoordinasikan oleh satu Zustand store yang dipersist ke `localStorage` (key `mochi_v1_store`, version 1) sementara foto pengguna disimpan terpisah di IndexedDB `Mochi_Photos_DB`. Boot sequence menjalankan offline catch-up sebelum render pertama agar stat selalu konsisten lintas sesi.

## 2. UI Foundation Reuse

Komponen visual chrome diambil utuh dari `GameUI.tsx`. Tidak ada duplikasi.

| Mochi feature surface | GameUI export(s) used |
| --- | --- |
| Stat HUD (Hunger/Energy/Bladder/Happiness) | `ProgressBar`, `GameIcon` (`heart`, `carrot`, `bell`, `star`) |
| Coin pill | `Pill`, `GameIcon` (`gold`) |
| Bottom action bar (sleep, chat, shop, album, habit) | `DrawerNav`, `GameButton` (icon-only), `NotificationDot` |
| Shop modal | `ModalFrame`, `TabGroup`, `ItemCard`, `GameButton`, `Row` (`store`) |
| Inventory drawer | `Drawer` (orientation `vertical`), `CardDock`, `GameButton` (`iconOnly`) |
| Habit tracker modal | `ModalFrame`, `LineTabGroup` (Routine / Main), `Row` (`notification`/`leaderboard`), `Checkbox`, `Badge` |
| Gemini chat popup | `Dialog`, `FormField`, `GameButton`, `Spinner`, `TextArea` |
| Photo album modal | `ModalFrame`, `Pagination`, `GameButton` (icon-only `add`/`trash`/`close`) |
| Confirm/info dialog | `Dialog`, `Tooltip` |
| Toast/non-blocking notice | `Banner`, `NotificationDot` |
| Empty / fallback slot | `Placeholder` |

**Tailwind decision (Req 1.1, 5.1, 5.4, 14.3):** Tailwind belum terpasang; primary stylesheet adalah `src/styles.css`. Adopsi **additive** Tailwind sebagai utility layer ringan eksklusif untuk class yang disebut dalam requirements (`touch-none`, `select-none`, dan helper image-rendering). Ini paling murah dan eksplisit memenuhi assertion DOM Req 14.3 (`classList.contains('select-none')`).

- Add Tailwind v3 via `tailwindcss`/`postcss`/`autoprefixer` devDeps; `tailwind.config.js` dengan `content: ['./index.html','./src/**/*.{ts,tsx}']`, `corePlugins: { preflight: false }` agar tidak mengganggu styles.css yang sudah ada.
- Fallback note: bila instalasi Tailwind ditolak di review, deklarasikan selector `.touch-none`, `.select-none`, dan `.pixel-img` di `styles.css` dengan deklarasi setara — assertion observable di Req 14 tetap terpenuhi karena hanya bergantung pada nama class + computed style, bukan pada presence Tailwind itu sendiri.

## Architecture

Module map (compact). State slices listed are the only writers; everything else is read-only.

| Module | State slice owned | Depends on |
| --- | --- | --- |
| `boot/AppBootstrap` | none | `Config_Store`, `Persistence_Store`, `Stat_Engine`, `Asset_Preloader` |
| `state/store.ts` (Zustand + persist) | `pet`, `placed_items`, `inventory`, `coins`, `habit_records`, `routine_state` | `localStorage` |
| `state/Config_Store` | env (Gemini key, derived flags) | `import.meta.env` |
| `engine/Stat_Engine` | derives `pet.stats`, writes `pet.lastChecked` | `state/store` |
| `engine/Pet_State_Machine` | `pet.currentState`, transient timers | `state/store`, `Stat_Engine` |
| `engine/Drag_Controller` | local refs (`pointerOffset`, `activePointerId`) | `state/store`, `Pet_State_Machine`, `Collision_Resolver` |
| `engine/Collision_Resolver` | none (pure) | `state/store` (read placed_items) |
| `render/Sprite_Renderer` | local frame index | `Asset_Map`, `state/store` |
| `render/Room` | layout/geometry constants | `Sprite_Renderer`, `placed_items` |
| `assets/Asset_Map` + `Asset_Preloader` | preload promise cache | `public/assets/**` |
| `persist/photo_db.ts` | IndexedDB session | `indexedDB` |
| `gemini/chat_client.ts` | in-memory chat history | `Config_Store`, `state/store` (allow-list slice) |
| `gemini/vision_client.ts` | none | `Config_Store` |
| `features/Habit_Tracker` | `habit_records` | `state/store`, `vision_client` |
| `features/Shop` | atomic txn over `coins`+`inventory` | `state/store` |
| `features/Inventory_Drawer` | drag-from-inventory ephemeral state | `state/store`, `Collision_Resolver` |
| `features/Photo_Album` | UI state | `persist/photo_db` |
| `features/Chat_Popup` | UI state | `gemini/chat_client` |

## Data Models

```ts
// state/store.ts — Zustand persisted slice
export type CatState =
  | 'idle' | 'walking_left' | 'walking_right'
  | 'carried' | 'scratching' | 'eating' | 'pooping' | 'sleeping';

export interface Stats { hunger: number; energy: number; bladder: number; happiness: number; }
export interface Pet {
  stats: Stats;                     // internal float, UI floors to int (Req 2.1)
  currentState: CatState;
  position: { x: number; y: number };
  lastChecked: number;              // ms epoch (Req 1.7)
}

export type FurnitureType = 'scratcher' | 'toy' | 'litterbox';
export interface InventoryEntry { id: string; type: FurnitureType; width: number; height: number; }
export interface PlacedItem extends InventoryEntry { x: number; y: number; }

export interface HabitRecord { habit_id: string; local_date: string; /* DD-MM-YYYY */ }

export interface PersistedState {
  pet: Pet;
  placed_items: PlacedItem[];
  inventory: InventoryEntry[];
  coins: number;
  habit_records: HabitRecord[];     // routine + main, both schemas (Req 9.2, 10.6)
}

// Top-level localStorage shape (Req 13.1)
export interface PersistEnvelope { state: PersistedState; version: 1; }

// IndexedDB Mochi_Photos_DB / store 'photos'
export interface UserPhoto {
  id: string;            // 'photo_<ms>' or with '-N' collision suffix (Req 12.3)
  base64Data: string;    // data URL
  uploadedAt: string;    // DD-MM-YYYY
}
```

Defaults (Req 1.8): `stats={100,100,100,100}`, `currentState='idle'`, `position={x:250,y:400}`, `coins=200`, `placed_items=[]`, `inventory=[]`, `habit_records=[]`, `lastChecked=Date.now()`.

**Migration handling (Req 1.9–1.11, 13.4–13.5):**
- On hydrate: parse JSON → schema validate → check `version`. If parse/validate fails → default state + non-blocking banner (Req 1.11/1.12).
- If `version < 1` (future-proof for next major): run nominal migrator that copies known fields and resets only fields it cannot map; complete before first render.
- If `version > 1`: do **not** downgrade in place; load default and overwrite on next debounced write (Req 13.5).

## Components and Interfaces

Flat list of components (the "Component Tree" requested by the spec). Right column = GameUI primitive each leaf reuses (or "custom" if no chrome dependency).

- `App` — host, wraps shell; reads boot status. Reuses: nothing (just layout).
- `Room` — viewport + background image (`House/House-*.png`). Reuses: nothing.
- `Pet` — sprite element, owns Pointer Events. Reuses: nothing (custom).
- `PlacedItemSprite` (per item) — img with pixelated style. Reuses: nothing.
- `StatHUD` — 4 stats. Reuses: `ProgressBar` + `GameIcon`.
- `CoinDisplay` — header pill. Reuses: `Pill`, `GameIcon('gold')`.
- `ActionBar` — bottom dock. Reuses: `DrawerNav` + `GameButton` (iconOnly).
- `SleepButton` — single icon button. Reuses: `GameButton` (iconOnly `pause`).
- `ShopModal` — catalog. Reuses: `ModalFrame`, `TabGroup`, `ItemCard`, `GameButton`.
- `InventoryDrawer` — list of owned items, drag handles. Reuses: `Drawer`, `CardDock`, `GameButton`.
- `HabitTrackerModal` — routine vs main tabs. Reuses: `ModalFrame`, `LineTabGroup`, `Row`, `Checkbox`, `Badge`.
- `ChatPopup` — messages + composer. Reuses: `Dialog`, `FormField`, `GameButton`, `Spinner`.
- `PhotoAlbumModal` — grid. Reuses: `ModalFrame`, `GameButton` (`add`/`trash`/`close`), `Pagination`.
- `PhotoFullView` — overlay. Reuses: `Dialog`, `GameButton('close')`.
- `ConfirmDialog` — generic confirm. Reuses: `Dialog`.
- `Toast` — non-blocking notices (storage failures, Gemini disabled). Reuses: `Banner`, `NotificationDot`.

## 6. Game Loop & Timers

- **60 s stat tick** — `setInterval` 60000 ms (±100 ms tolerated). Calls `Stat_Engine.applyDecay(stats, 60, hungerZero, anyLow40)` then `Pet_State_Machine.checkForcedTransitions()` then writes `pet.stats` + `pet.lastChecked` atomically (Req 2.2, 2.8).
- **7 s state-roll** — `setInterval` 7000 ms (±100 ms). Active only while `currentState ∈ {idle, walking_left, walking_right}`. Random roll `[idle, walking_left, walking_right]` uniform 1/3 (Req 4.2). Lemas (Hunger=0) coerces result to `idle` (Req 4.14).
- **Frame animation loop** — per Pet: `setTimeout` chain at 150 ms (active states) / 300 ms (`sleeping`) advancing `frameIndex` modulo Asset_Map[state].length (Req 7.4).
- **Walking rAF** — while `walking_left|walking_right`: `requestAnimationFrame` integrates `position.x` at 40 px/s in correct direction; clamp to room bounds; if at `Room.left`/`Room.right` transition to `idle` (Req 4.3, 4.4).
- **Boot sequence** — runs sync before first render:

```ts
async function boot() {
  Config_Store.load(import.meta.env.VITE_GEMINI_API_KEY);   // Req 1.2
  await Asset_Preloader.preloadAll(ASSET_MAP);              // Req 7.8
  const hydrated = Persistence_Store.hydrate();             // validate-before-hydrate (Req 13.4)
                                                            // hydrated may be defaults (Req 1.11)
  Stat_Engine.applyOfflineCatchUp(hydrated);                // Req 3 — single atomic write
  ReactDOM.render(<App />);                                 // first paint
  Stat_Engine.startTickInterval();                          // Req 2.2 starts AFTER first paint
  Pet_State_Machine.startStateRoll();                       // Req 4.2
  registerFlushOnUnload(['pagehide','beforeunload']);       // Req 13.2 sync flush
}
```

## 7. Drag & AABB

Pet bounding box constants: `W_cat = H_cat = 64` px (Req 6.2). Element handlers attached to `<img class="pet pixel-img touch-none">`.

```ts
// Drag_Controller (refs, not React state)
let activePointerId: number | null = null;
let pointerOffset: {x:number;y:number} | null = null;

function onPointerDown(e: PointerEvent) {
  if (pet.currentState === 'sleeping') return;            // Req 4.13
  if (e.button !== 0 || !e.isPrimary) return;             // Req 5.8
  if (activePointerId !== null) return;                   // Req 5.7 ignore second finger
  if (['eating','scratching','pooping'].includes(pet.currentState)) return; // Req 6.11
  if (e.pointerType === 'touch') e.preventDefault();      // Req 5.9
  pointerOffset = { x: e.clientX - pet.position.x, y: e.clientY - pet.position.y };
  activePointerId = e.pointerId;
  e.currentTarget.setPointerCapture(e.pointerId);         // Req 5.2(c) / Req 14.2 — BEFORE transition
  Pet_State_Machine.transition('carried');                // sets wrapper.classList += 'select-none' (Req 14.3)
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;            // Req 5.7
  if (e.pointerType === 'touch') e.preventDefault();      // Req 5.9
  // requestAnimationFrame to coalesce; one frame max latency (Req 5.3)
  scheduleFrame(() => {
    const x = clamp(e.clientX - pointerOffset!.x, Room.left, Room.right - W_cat);
    const y = clamp(e.clientY - pointerOffset!.y, Room.top,  Room.bottom - H_cat);
    store.setPetPosition({ x, y });
  });
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;
  e.currentTarget.releasePointerCapture(e.pointerId);
  const dropPos = pet.position;                           // already clamped
  activePointerId = null; pointerOffset = null;
  Collision_Resolver.resolveDrop(dropPos);                // Req 5.5 → Req 6
}

function onPointerCancel_or_LostCapture(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;
  activePointerId = null; pointerOffset = null;
  Pet_State_Machine.transition('idle');                   // Req 5.6 — no resolver
}

petEl.addEventListener('contextmenu', e => e.preventDefault()); // Req 5.8 last clause
```

```ts
// Collision_Resolver.resolveDrop
function resolveDrop(drop: {x:number;y:number}) {
  const xc = clamp(drop.x, Room.left, Room.right  - W_cat);
  const yc = clamp(drop.y, Room.top,  Room.bottom - H_cat);                   // Req 6.6
  const hits = placed_items
    .map((it, idx) => ({ it, idx, overlap: aabb(xc, yc, W_cat, H_cat, it) })) // Req 6.1
    .filter(h => h.overlap);
  if (hits.length === 0) {
    store.setPetPosition({ x: xc, y: Y_floor - H_cat });                      // Req 6.5
    return Pet_State_Machine.transition('idle');
  }
  // Priority: type litterbox > toy > scratcher → Euclidean (item center vs cat center) → ascending array index
  const TYPE_RANK: Record<FurnitureType, number> = { litterbox: 0, toy: 1, scratcher: 2 };
  hits.sort((a, b) =>
       TYPE_RANK[a.it.type] - TYPE_RANK[b.it.type]
    || euclid(center(a.it), { x: xc + W_cat/2, y: yc + H_cat/2 })
       - euclid(center(b.it), { x: xc + W_cat/2, y: yc + H_cat/2 })
    || a.idx - b.idx);                                                        // Req 6.4
  const target = hits[0].it;
  if (target.type === 'toy' && pet.stats.hunger === 0) {                      // Req 6.10 lemas refusal
    return; // keep current state, no stat change
  }
  const next: CatState = target.type === 'scratcher' ? 'scratching'
                       : target.type === 'toy'       ? 'eating'
                       :                               'pooping';
  Pet_State_Machine.transition(next);
}

// aabb: cat at (xc,yc) with W=H=64; item at (it.x,it.y,it.width,it.height)
function aabb(xc:number,yc:number,wc:number,hc:number,it:PlacedItem) {
  return xc < it.x + it.width
      && xc + wc > it.x
      && yc < it.y + it.height
      && yc + hc > it.y;                                                      // Req 6.1, symmetric (Req 6.12)
}
```

## 8. State Machine

Pet_State_Machine sets exactly one `currentState` (Req 4.16). Transient states use `setTimeout` whose handler also writes `pet.stats` post-animation (Req 6.7–6.9).

| From | Event | To | Duration | Notes / preconditions |
| --- | --- | --- | --- | --- |
| `idle`/`walking_*` | 7 s roll → idle | `idle` | — | Req 4.2 |
| `idle`/`walking_*` | 7 s roll → walk_L/R | `walking_left`/`walking_right` | — | Lemas (Hunger=0) coerces to idle (Req 4.14) |
| `walking_*` | hit Room.left or Room.right | `idle` | — | Req 4.4 |
| any non-sleeping, non-animating | `pointerdown` primary | `carried` | until pointerup | Req 4.5 / Req 5.2 |
| `carried` | `pointerup` (resolver hit) | `scratching` | 4000 ms | post-tween: Happiness +25 clamp 100 (Req 4.7, 6.8) |
| `carried` | `pointerup` (resolver hit) | `eating` | 5000 ms | post-tween: Hunger +30 clamp 100 (Req 4.8, 6.7); refused if Hunger=0 (Req 6.10) |
| `carried` | `pointerup` (resolver hit) | `pooping` | 6000 ms | post-tween: Bladder = 100 set (Req 4.9, 6.9) |
| `carried` | `pointerup` (no hit) | `idle` | — | placed at Y_floor (Req 6.5) |
| `carried` | `pointercancel`/lost capture | `idle` | — | no resolver (Req 5.6) |
| `scratching`/`eating`/`pooping` | timer end | `idle` | — | apply stat delta then return (Req 4.7–4.9) |
| any (incl. transient) | Bladder reaches 0 | `pooping` (forced) | 6000 ms | floor coords; no Bladder set after (since cause is overflow) — but Req 6.9 only triggers when drop resolved on litterbox; here forced is at floor (Req 4.10) |
| any except forced pooping | Energy reaches 0 | `sleeping` (forced) | until Energy=100 | Req 4.11 |
| any non-forced | Sleep button pressed | `sleeping` | until Energy=100 OR sleep button pressed again | Req 4.12, 4.15 |
| `sleeping` | Energy reaches 100 OR sleep button | `idle` | — | Req 4.15 |

**Lemas refusal (Hunger=0, Req 4.14):** reject `eating`, `scratching`; coerce 7 s roll to `idle`; allow sleep button and forced `pooping`; Stat_Engine still applies −30/h to Happiness while Hunger=0.

**Simultaneous trigger priority (Req 4.17):** when several triggers fire same tick, pick highest of: (a) forced `pooping` (Bladder=0); (b) forced `sleeping` (Energy=0); (c) sleep button; (d) drop resolution; (e) 7 s random roll. Implemented as ordered if-else inside the tick reconciler.

## 9. Stat Engine

```ts
const RATE = { hunger: 6, energy: 4, bladder: 5 } as const; // per hour (Req 2.3)

// `deltaSeconds` may be 60 (live tick) or any value <= 24*3600 (offline catch-up).
// `hungerZero` and `anyLow40` are sampled BEFORE the decay step for the live tick;
// for offline catch-up they are derived per sub-interval (see below).
function applyDecay(s: Stats, deltaSeconds: number, hungerZero: boolean, anyLow40: boolean): Stats {
  const hours = deltaSeconds / 3600;
  let { hunger, energy, bladder, happiness } = s;
  hunger  = clamp01(hunger  - RATE.hunger  * hours);
  energy  = clamp01(energy  - RATE.energy  * hours);
  bladder = clamp01(bladder - RATE.bladder * hours);

  // Happiness extra decay — Req 2.4–2.6, NEVER stacks
  let extraPerHour = 0;
  if (hungerZero)        extraPerHour = 30;          // Hunger=0 dominates (Req 2.6)
  else if (anyLow40)     extraPerHour = 6;           // any of H/E/B <= 40 and Hunger > 0 (Req 2.4)
  happiness = clamp01(happiness - extraPerHour * hours);
  return { hunger, energy, bladder, happiness };
}

function clamp01(x: number) { return Math.max(0, Math.min(100, x)); }
function uiInt(x: number)   { return Math.floor(x); }              // Req 2.1 UI floor

// Offline catch-up — Req 3
function applyOfflineCatchUp(state: PersistedState) {
  const now = Date.now();
  const dtMs = now - state.pet.lastChecked;
  if (dtMs < 0) {                                                  // Req 3.6 clock skew backward
    state.pet.lastChecked = now;
    return atomicWrite(state);
  }
  const hoursPassed     = dtMs / 3_600_000;
  const effectiveHours  = Math.min(hoursPassed, 24);               // Req 3.2 cap
  // Linear projection model: derive sub-intervals where (Hunger=0) or (any<=40) toggle,
  // apply applyDecay piecewise. Final values get integer-rounded then clamped (Req 3.4).
  const next = projectPiecewise(state.pet.stats, effectiveHours);
  state.pet.stats       = roundAndClamp(next);
  state.pet.lastChecked = now;
  atomicWrite(state);                                              // Req 3.5 idempotent
}
```

`projectPiecewise` integrates linearly, switching between {0, 6, 30} per-hour Happiness penalty as projected stats cross thresholds; bounded segments → finite work. Result rounded to integers then clamped to [0,100] (Req 3.4).

## 10. Sprite & Assets

```ts
// assets/Asset_Map.ts
export type FrameUrl = string;
export interface AssetMap {
  idle: FrameUrl[];                                       // Idle-Right
  walking_right: FrameUrl[];                              // Walking-Right
  walking_left: FrameUrl[];                               // same as walking_right + scaleX(-1)
  carried_default: FrameUrl[];                            // Lift-Default
  carried_sleepy:  FrameUrl[];                            // Lift-Sleepy (Energy <= 40)
  scratching: FrameUrl[];                                 // Stratch
  eating: FrameUrl[];                                     // Eat
  pooping: FrameUrl[];                                    // Pup
  sleeping: FrameUrl[];                                   // Sleep
  items: { scratcher: FrameUrl; toy: FrameUrl; litterbox_clean: FrameUrl; litterbox_used: FrameUrl; };
  rooms: { morning: FrameUrl; afternoon: FrameUrl; evening: FrameUrl; night: FrameUrl; };
}
```

- Frame durations: **150 ms** for active states (`idle`, `walking_*`, `carried_*`, `scratching`, `eating`, `pooping`); **300 ms** for `sleeping` (Req 7.4).
- `Clicked-Left`/`Clicked-Right` are intentionally NOT mapped (Req 7.10).

**Preload strategy:**
- `Asset_Preloader.preloadAll()` returns one Promise that creates `Image()` objects per FrameUrl and resolves on `load`/`error` (never reject) before first paint (Req 7.8).
- Cache by URL inside a module-level `Map<string, HTMLImageElement>` so subsequent `<img src>` reuses HTTP cache.

**Error fallback (Req 7.9):** every Pet `<img>` has `onError={() => setSrc(ASSET_MAP.idle[0])}`; `currentState` itself is NOT changed; `console.error` logged.

**Asset relocation plan (Req 7.6, 7.7):** add a one-shot script `scripts/relocate-assets.mjs` (or manual move) that copies/moves the existing `Assets/` tree to `public/assets/` preserving subdirectories below; only files under `public/assets/` are referenced by Asset_Map (Vite serves them at `/assets/...`). Canonical subdirs: `Idle-Right/`, `Walking-Right/`, `Lift-Default/`, `Lift-Sleepy/`, `Stratch/`, `Eat/`, `Pup/`, `Sleep/`, `Items/Pasir-Kucing/`, `Items/Stratcher/`, `House/`. Frame filenames are preserved.

## 11. Persistence

```ts
// state/store.ts (excerpt)
const PERSIST_KEY = 'mochi_v1_store';
export const useStore = create<PersistedState & Actions>()(
  persist(
    (set, get) => ({ /* ...slices, actions, atomic mutators... */ }),
    {
      name: PERSIST_KEY,
      version: 1,                              // PersistEnvelope.version (Req 13.1)
      storage: customStorage,                  // wraps localStorage with quota fallback
      partialize: (s) => ({                    // pick only persisted fields
        pet: s.pet, placed_items: s.placed_items, inventory: s.inventory,
        coins: s.coins, habit_records: s.habit_records,
      }),
      migrate: nominalMigrate,                 // Req 1.9–1.10
      merge: validateAndMerge,                 // validate-before-hydrate (Req 13.4)
    },
  ),
);
```

Configuration constraints:
- **Debounced write** — every change schedules a 500 ms debounced JSON serialize + write; each write completes ≤ 50 ms (Req 13.2).
- **Sync flush** — `addEventListener('pagehide' | 'beforeunload', flushNow)` performs synchronous serialize + write before unload (Req 13.2).
- **Validate-before-hydrate** — `merge` parses, asserts `version`, runs schema check on `pet`/`placed_items`/`inventory`/`coins`/`habit_records`; on failure returns defaults and logs (Req 13.4 / Req 1.11).
- **No in-place downgrade** — if persisted `version > 1` (future build wrote it), do NOT mutate; load defaults; next debounced write rewrites with current `version` (Req 13.5).
- **Atomic write with in-memory fallback** — `customStorage.setItem` writes a single `JSON.stringify(envelope)` per call (atomic at localStorage layer); on `QuotaExceededError`/throw it switches to module-level `Map` fallback and emits a non-blocking toast (Req 13.6 / Req 1.12).

Top-level on disk: `{ "state": { pet, placed_items, inventory, coins, habit_records }, "version": 1 }` (Req 13.1).

## 12. Photo Album / IndexedDB

- **DB & store** — `Mochi_Photos_DB` v1; `onupgradeneeded` creates object store `photos` with `keyPath: 'id'` (Req 12.2). MIME allow-list `{image/jpeg, image/png, image/webp}` and size ≤ 5 MB enforced before any write (Req 12.3, 12.9); reject before transaction starts.
- **Id collision** — generate `id = 'photo_' + Date.now()`; on `add` `ConstraintError`, retry with `'-2', '-3', ...` until unique (Req 12.3); list view sorts descending by `id` so newest first (Req 12.4).
- **Batch upload + atomicity** — multi-file uploads processed sequentially; each file is its own transaction so a single failure rolls back only that entry; failures surface as non-blocking toast (Req 12.7, 12.10). Read-by-id round-trip preserves `{id, base64Data, uploadedAt}` (Req 12.6). Delete requires explicit confirmation dialog (Req 12.5).
- **Read-only mode** — if `'indexedDB' in window === false` OR `indexedDB.open` rejects: disable upload/delete UI, show user-visible explanation, but still read existing entries if any (Req 12.8).

## 13. Gemini Integration

```ts
// state/Config_Store.ts
export interface ConfigSnapshot {
  geminiKey: string | null;        // null when undefined or whitespace-only (Req 1.3)
  chatEnabled: boolean;            // mirrors geminiKey != null at boot
  visionEnabled: boolean;          // mirrors geminiKey != null at boot
}
// Read once at AppBootstrap, BEFORE any feature component mounts (Req 1.2).
```

**Chat client (Req 8):**
- Model `gemini-2.0-flash` via `@google/generative-ai` (Req 1.6).
- Allow-listed payload built per request: `{ hunger, energy, bladder, happiness, currentState, userMessage }`. Never send `coins`, `placed_items`, `lastChecked`, photo entries (Req 8.7).
- Single in-flight guard via a module-level `AbortController?`; new sends rejected while pending (Req 8.8).
- 30 s timeout: `AbortController.abort()` after `setTimeout(30_000)`; abort path = same handler as network/quota error (Req 8.9 → 8.6).
- History kept only in module-level array; cleared on popup close and on reload (no persist) (Req 8.10).
- Locked when `happiness === 0` — input + send disabled, message shown both on open and on mid-conversation drop to 0 (Req 8.5).
- Build-time guard: System Instruction builder throws on missing stats; caught and surfaced as chat error (Req 8.3).

**Vision client (Req 10):**
- Model `gemini-2.0-flash`, `image/jpeg` Base64, payload ≤ 5 MB, 30 s timeout (Req 10.2). Camera capture only — no file picker (Req 10.1).
- Expected JSON verdict schema `{ verdict: 'valid' | 'fraud' | 'mismatch', reason: string, confidence: number /* [0,1] */ }`. Schema mismatch → treat as failure (Req 10.5).
- On `valid`: atomic `coins += 50` + push `HabitRecord` (Req 10.3). On `fraud`/`mismatch`: no change, surface `reason` (Req 10.4).

**Degraded modes (Req 1.3–1.5):**
- Key absent (undefined or whitespace) → both chat and vision disabled at boot; calling either feature shows a user-visible error within 1 s naming the feature and stating "Gemini API key belum dikonfigurasi" (Req 1.4).
- Key present but a feature receives `auth` or `quota` failure → only that feature flips its `enabled` flag false; the other remains active. Error message names the feature and the cause class (`auth` | `quota`) (Req 1.5).

## 14. Habit Tracker

**Preconfigured habit ids (stable strings, persisted in `habit_records` and via constants):**
- Routine (5): `routine.brush_teeth`, `routine.drink_water`, `routine.make_bed`, `routine.stretch`, `routine.tidy_room`.
- Main (2): `main.workout_photo`, `main.healthy_meal`.

**Rewards:** Routine standard = **+5 coins** (Req 9.3). Main large = **+50 coins** (Req 10.3).

**Completion record:** `{ habit_id: string, local_date: 'DD-MM-YYYY' }` for both kinds; same schema (Req 9.2 / 10.6). `local_date` formatted from device local timezone via a single helper `toDDMMYYYY(d: Date)`.

**Anti-replay across reloads (Req 9.4, 10.6):** before crediting reward, check `habit_records.some(r => r.habit_id === id && r.local_date === today)`; if exists, no-op. Uncheck never refunds. Records persist in Zustand store, so check survives reloads.

**Clock-skew backward handling (Req 9.6):** maintain `routine_state.maxLocalDateSeen: 'DD-MM-YYYY'` (also persisted). Effective today = `max(toDDMMYYYY(now), maxLocalDateSeen)`. If skew goes back, latest date stays "today" until wall-clock catches up; never re-opens an already-completed pair.

**30-day cleanup (Req 10.6 last clause):** on boot, prune entries whose `local_date` is more than 30 days older than effective today (parse DD-MM-YYYY → Date, compare). Cleanup is best-effort and never deletes today/recent.

## 15. Shop & Inventory

| Type | id template | Price | W × H | Source asset |
| --- | --- | --- | --- | --- |
| `scratcher` | `inv_scratcher_<rand>` | 50 | 64 × 64 | `Items/Stratcher/Stratcher 1.png` |
| `toy` | `inv_toy_<rand>` | 30 | 48 × 48 | (placeholder fish bowl PNG, TBD see Risks) |
| `litterbox` | `inv_litterbox_<rand>` | 80 | 80 × 64 | `Items/Pasir-Kucing/Pasir 1.png` |

```ts
// Req 11.2 atomic purchase
function purchase(type: FurnitureType) {
  const price = PRICES[type];
  if (store.coins < price) return reject('coins-insufficient');     // Req 11.3
  store.atomic(s => {
    s.coins -= price;
    s.inventory.push({ id: nextUniqueId(s, type), type, ...DIMS[type] });
  });
}
```

`nextUniqueId(state, type)` guarantees uniqueness across `inventory ∪ placed_items` (Req 11.7) — generate `inv_<type>_<crypto.randomUUID()>` and assert no collision before commit.

**Placement flow (Req 11.4):** on drop from inventory drawer, run AABB validation (in-bounds AND no-overlap with existing `placed_items`); if accepted, atomic move: remove from `inventory` + push to `placed_items` with same `{id,type,width,height}` plus `{x,y}`. If rejected (Req 11.8), no mutation.

**Reposition placed item (Req 11.9):** drag handle on placed sprite; on drop run same in-bounds + no-overlap test (excluding self); commit updates ONLY `x` and `y` of that entry — `id`/`type`/`width`/`height` immutable.

**Remove placed item (Req 11.10):** menu action removes from `placed_items` and pushes back into `inventory` with identical `{id,type,width,height}` (no re-purchase).

**Rejection rules (Req 11.8):** drop is rejected when `(x, y, width, height)` extends beyond Room rect OR AABB-overlaps any other entry in `placed_items`.

## 16. Mandatory Rules Conformance

Three observable assertions guard PRD-mandatory UI rules.

- **Req 14.1 — pixelated rendering across ALL cat sprites.** A single CSS class `.pixel-img { image-rendering: pixelated; image-rendering: crisp-edges; }` (declared in `styles.css`) is applied to every `<img>` produced by `Sprite_Renderer` regardless of state, including `idle`, `walking_*`, `eating`, `sleeping`, `lift_default`, `lift_sleepy`, `scratching`, `pooping`, plus the unmapped `clicked_*` assets if/when used. Observable: `getComputedStyle(img).imageRendering ∈ {'pixelated','crisp-edges'}`.
- **Req 14.2 — `setPointerCapture` precedes `carried` transition.** `Drag_Controller.onPointerDown` calls `e.currentTarget.setPointerCapture(e.pointerId)` on the line BEFORE `Pet_State_Machine.transition('carried')` (see pseudocode in §7). Observable: in a unit test that stubs `transition` and inspects call order, `setPointerCapture` is called first; `petEl.hasPointerCapture(pointerId)` returns `true` after.
- **Req 14.3 — `select-none` on wrapper while `carried`.** `Pet_State_Machine.transition('carried')` toggles `wrapperRef.current.classList.add('select-none')` synchronously and removes it on any exit transition. Observable: `wrapperEl.classList.contains('select-none')` returns `true` for the entire duration of `currentState === 'carried'`.

**Testing approach (5 bullets, applies across §6–§15):**
- **Property-based tests** for pure logic: AABB symmetry/self-overlap, stat clamping/monotonicity, offline catch-up idempotence, persistence round-trip, no-overlap placement guard, coin non-negativity, completion uniqueness — match properties enumerated in `requirements.md` Correctness Properties block; configure ≥100 iterations per property.
- **Example-based unit tests** for Pet_State_Machine: simultaneous-trigger priority order (Req 4.17), lemas refusal matrix (Req 4.14), forced transitions (Req 4.10/4.11), sleep button toggle (Req 4.12/4.15).
- **DOM/integration tests** (jsdom + `@testing-library/react`) for the three Mandatory Rules in §16 — assert via `getComputedStyle`, call-order spies, and `classList` membership.
- **Mocked Gemini tests** for chat allow-list payload (Req 8.7), single in-flight, 30 s timeout, and disabled-feature error message timing (≤1 s, Req 1.4); mocked vision verdict schema validation.
- **Smoke/integration**: boot sequence end-to-end (offline catch-up before first paint, then tick starts), IndexedDB read-only fallback, localStorage quota fallback toast — 1–2 examples each, not property-based.

## 17. Risks & Open Items

- **Toy Fish asset missing.** No `Items/ToyFish/` directory exists in `Assets/` today; Req 7.6 names only `Pasir-Kucing/` and `Stratcher/`. Decision needed: source/draw a `toy` sprite or temporarily reuse `Stratcher 1.png` as placeholder. Tracked for v1.0 release blocker.
- **Tailwind installation vs vanilla fallback.** §2 recommends adding Tailwind as additive utility-only layer; if review rejects Tailwind, fallback declares `.touch-none`/`.select-none`/`.pixel-img` directly in `styles.css`. Either path satisfies Req 14.3 observable assertion.
- **Sub-interval projection in offline catch-up.** `projectPiecewise` (§9) needs careful unit testing because Happiness penalty changes as Hunger/Energy/Bladder cross 40 (and Hunger crosses 0) during the offline window; off-by-one in segment boundaries would break Req 3.3 and idempotence.
- **Forced `pooping` at Bladder=0 vs litterbox drop.** Req 4.10 forces pooping at floor coords (no Bladder reset implied), while Req 6.9 only sets Bladder=100 when drop lands on litterbox. Design honors both: forced pooping leaves Bladder at 0; we may want to clarify whether Bladder should regenerate after the 6 s — currently it does NOT, which can cause re-trigger loop. Flag for product confirmation.
- **Camera permission UX.** Req 10.7/10.8 require guidance messages but exact copy is not specified; pick concise Indonesian strings during implementation and confirm with stakeholders.

## Correctness Properties

Properti final terdokumentasi di `requirements.md` (sumber kebenaran). Direplikasi di sini dalam bentuk ringkas agar diagnostic format terpenuhi dan dapat dirujuk langsung dari §16. Setiap property memakai universal quantification dan menyebut requirements yang divalidasi.

### Property 1: Stat clamping invariant

*For any* random `(stats0, hoursPassed)`, hasil decay (live tick atau offline catch-up) tetap di interval `[0, 100]` untuk keempat stat.

**Validates: Requirements 2.7, 3.4**

### Property 2: Stat monotonicity invariant

*For any* sequence decay tanpa input pemulihan (drop ke toy/scratcher/litterbox), Hunger/Energy/Bladder tidak pernah naik dari nilai sebelumnya.

**Validates: Requirements 2.2, 2.3, 3.2**

### Property 3: Offline catch-up idempotence

*For any* persisted state, menjalankan `applyOfflineCatchUp` dua kali secara berurutan menghasilkan stats yang sama dengan menjalankannya sekali (karena `lastChecked` di-update atomik).

**Validates: Requirements 3.5**

### Property 4: State machine single-state invariant

*For any* sequence transisi acak (drop, sleep button, forced triggers, random roll), `pet.currentState` selalu tepat satu nilai dari himpunan yang diizinkan.

**Validates: Requirements 4.1, 4.16**

### Property 5: Sleep input lock invariant

*For any* simulasi pointer event ketika `currentState === 'sleeping'`, `currentState` tidak berubah ke `carried`.

**Validates: Requirements 4.13**

### Property 6: State trigger priority property

*For any* himpunan acak pemicu yang terjadi pada tick yang sama, state berikutnya selalu sesuai urutan prioritas Req 4.17 (forced pooping > forced sleeping > sleep button > drop > 7 s roll).

**Validates: Requirements 4.17**

### Property 7: AABB symmetry & self-overlap

*For any* dua persegi panjang acak A, B: `overlap(A,B) === overlap(B,A)`. *For any* persegi panjang R dengan W,H > 0: `overlap(R,R) === true`.

**Validates: Requirements 6.1, 6.12**

### Property 8: Placement no-overlap guard

*For any* `placed_items` valid dan kandidat drop, jika kandidat overlap dengan entri manapun atau keluar dari Room, drop ditolak dan `placed_items` tidak berubah.

**Validates: Requirements 11.8, 11.9**

### Property 9: Main-habit completion uniqueness

*For any* sequence acak validasi Main_Habit yang sukses lintas reload, jumlah `(habit_id, local_date)` untuk satu hari ≤ 1 dan total tambahan koin = 50.

**Validates: Requirements 10.6**

### Property 10: Round-trip persistence

*For any* state valid, `deserialize(serialize(state)) ≡ state` untuk Zustand store; `read_by_id(add(photo)) ≡ photo` untuk `UserPhoto` di IndexedDB.

**Validates: Requirements 12.6, 13.3**

### Property 11: Persistence write atomicity

*For any* sequence perubahan store yang diselingi kegagalan tulis, data yang berhasil dibaca dari `localStorage` selalu memenuhi struktur `{ state, version }` (tidak pernah partial write).

**Validates: Requirements 13.6**

### Property 12: Coin non-negativity

*For any* sequence operasi shop dan habit, `coins >= 0` selalu terpenuhi.

**Validates: Requirements 9.3, 10.3, 11.2, 11.3**

### Property 13: Placement bounds

*For any* `placed_items`, koordinat dan dimensi tiap entri tetap di dalam batas Room.

**Validates: Requirements 11.4, 11.8, 11.9**

## Error Handling

Sengaja didistribusikan ke seksi yang relevan agar tetap ringkas:
- **Persistence I/O failure / quota / corrupt data** → §11 (validate-before-hydrate, atomic write + in-memory fallback, non-blocking toast).
- **IndexedDB unavailable / quota / transaction error** → §12 (read-only mode, per-file rollback).
- **Gemini absent key / auth / quota / timeout** → §13 (boot-time disable, per-feature disable with named cause, 30 s `AbortController`).
- **Sprite load error** → §10 (`<img onError>` falls back to first Idle-Right frame, console error, currentState unchanged).
- **Drop out-of-bounds / overlap** → §15 (rejection rules; no mutation).
- **Pointer cancel / lost capture** → §7/§8 (`pointercancel` / `lostpointercapture` route to idle without resolver).
- **Clock skew backward** → §9 (`dtMs < 0` → no decay; lastChecked still advanced) and §14 (`maxLocalDateSeen` guard).

## Testing Strategy

Ringkas di **§16 — Testing approach (5 bullets)**: property-based for pure logic (≥100 iterations; properties listed in `requirements.md`); example-based unit tests for state machine transitions; DOM/integration tests for the three Mandatory Rules; mocked Gemini tests; smoke/integration for boot, IndexedDB fallback, and persistence quota fallback. Per user instruction the long-form PBT strategy section is intentionally omitted to keep this design concise.
