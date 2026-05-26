# Implementation Plan: Mochi Virtual Pet v1.0

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

Stack: React 19 + Vite + TypeScript + Zustand + IndexedDB + `@google/generative-ai`. Chrome (HUD, modals, drawer, dialog, button, progress) menggunakan ulang export dari `src/components/GameUI.tsx`. Tailwind v3 dipasang sebagai additive utility-only layer (`corePlugins.preflight=false`) berdampingan dengan `src/styles.css`. App.tsx demo UI Kit diganti pada langkah terakhir agar tetap menjadi rujukan selama implementasi.

## Tasks

- [x] 1. Setup tooling: dependensi runtime, dev, Tailwind additive layer, Vitest, env
  - [x] 1.1 Tambah runtime dependencies (`zustand`, `@google/generative-ai`)
    - Update `package.json` (`npm install zustand @google/generative-ai`)
    - _Requirements: 1.1, 1.6_
    - _Design: §2, §13_
  - [x] 1.2 Tambah dev dependencies untuk Tailwind + testing
    - Install `tailwindcss@^3`, `postcss`, `autoprefixer`, `vitest`, `@vitest/ui`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `fast-check`, `fake-indexeddb`
    - Tambah script `"test": "vitest run"` dan `"test:watch": "vitest"` di `package.json`
    - _Requirements: 1.1_
    - _Design: §2, §16_
  - [x] 1.3 Konfigurasi Tailwind additive layer + PostCSS
    - Buat `tailwind.config.js` dengan `content: ['./index.html','./src/**/*.{ts,tsx}']`, `corePlugins: { preflight: false }`
    - Buat `postcss.config.js` (`tailwindcss`, `autoprefixer`)
    - Buat entry CSS `src/tailwind.css` berisi `@tailwind base; @tailwind components; @tailwind utilities;` dan utility kustom `.pixel-img { image-rendering: pixelated; image-rendering: crisp-edges; }` di layer `utilities`
    - Verifikasi: `styles.css` tidak diubah; cascade tetap dijaga dengan mengimpor `tailwind.css` setelah `styles.css` di `src/main.tsx` (dilakukan di task 25.2)
    - Fallback: bila Tailwind ditolak di review, deklarasikan selector `.pixel-img`, `.select-none`, `.touch-none` langsung di `styles.css`
    - _Requirements: 1.1, 14.1, 14.3_
    - _Design: §2, §16_
  - [x] 1.4 Konfigurasi Vitest (jsdom env + setup file)
    - Tambah blok `test` di `vite.config.ts` dengan `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`
    - Buat `src/test/setup.ts` yang melakukan `import '@testing-library/jest-dom'` dan `import 'fake-indexeddb/auto'`
    - _Requirements: 14_
    - _Design: §16_
  - [x] 1.5 Tambah `.env.local.example` dan update `.gitignore`
    - Buat `.env.local.example` berisi `VITE_GEMINI_API_KEY=`
    - Pastikan `.gitignore` memuat baris `.env.local`
    - _Requirements: 1.2, 1.3_
    - _Design: §13_

- [x] 2. Relokasi assets ke `public/assets/`
  - [x] 2.1 Buat skrip `scripts/relocate-assets.mjs` dan jalankan satu kali
    - Salin/move `Assets/**` ke `public/assets/**` mempertahankan subdirektori kanonik: `Idle-Right/`, `Walking-Right/`, `Lift-Default/`, `Lift-Sleepy/`, `Stratch/`, `Eat/`, `Pup/`, `Sleep/`, `House/`, `Items/Pasir-Kucing/`, `Items/Stratcher/`, `Items/Fish-Toy.png`, `toy-action/`
    - Filter file `.DS_Store` dari hasil salin
    - Catatan: `Walking-Left/`, `Clicked-Left/`, `Clicked-Right/` TIDAK dipetakan (Req 7.3 menggunakan `Walking-Right` + `scaleX(-1)`; Req 7.10 mengeluarkan Clicked dari v1.0)
    - _Requirements: 7.6, 7.7, 7.10_
    - _Design: §10_

- [x] 3. Tipe domain (data models)
  - [x] 3.1 Buat `src/state/types.ts`
    - Export `CatState`, `Stats`, `Pet`, `FurnitureType`, `InventoryEntry`, `PlacedItem`, `HabitRecord`, `PersistedState`, `PersistEnvelope`, `UserPhoto`, `RoutineState`
    - Sertakan default factory `createDefaultPersistedState()` (hunger=100, energy=100, bladder=100, happiness=100, currentState='idle', position={x:250,y:400}, coins=200, placed_items=[], inventory=[], habit_records=[], lastChecked=Date.now())
    - _Requirements: 1.8, 4.1, 9.2, 10.6, 11.1, 12_
    - _Design: §4_

- [x] 4. Pure logic: AABB & resolveDrop
  - [x] 4.1 Implement `src/engine/aabb.ts`
    - Export `aabb(rectA, rectB): boolean` (axis-aligned, simetris, self-overlap untuk W,H>0)
    - Export `resolveDrop(catRect, placed_items, dropPos): { type, item, index } | null` dengan urutan tipe `litterbox > toy > scratcher`, kemudian Euclidean (pusat item vs pusat cat), kemudian ascending index
    - Export `clampRectToRoom(rect, room)` untuk Req 6.6
    - _Requirements: 6.1, 6.2, 6.4, 6.6, 6.12, 11.8_
    - _Design: §7_
  - [x] 4.2* Property test: AABB symmetry
    - **Property 7: AABB symmetry & self-overlap**
    - Untuk dua persegi panjang acak A,B: `aabb(A,B) === aabb(B,A)`
    - **Validates: Requirements 6.1, 6.12**
    - File: `src/engine/aabb.test.ts`
  - [x] 4.3* Property test: AABB self-overlap
    - **Property 7: AABB symmetry & self-overlap**
    - Untuk semua R dengan W,H>0: `aabb(R,R) === true`
    - **Validates: Requirements 6.1, 6.12**
    - File: `src/engine/aabb.test.ts`
  - [x] 4.4* Property test: Placement no-overlap guard
    - **Property 8: Placement no-overlap guard**
    - Untuk `placed_items` valid + kandidat acak: jika overlap atau keluar Room → drop ditolak, `placed_items` tidak berubah
    - **Validates: Requirements 11.8, 11.9**
    - File: `src/engine/aabb.test.ts`

- [x] 5. Pure logic: Stat engine (decay + offline catch-up)
  - [x] 5.1 Implement `src/engine/stat_engine.ts`
    - `clamp01(x)`, `uiInt(x)` (Math.floor), `applyDecay(stats, deltaSeconds, hungerZero, anyLow40)` dengan rate H=-6, E=-4, B=-5 per jam, Happiness extra 0/-6/-30 per jam (non-stacking; Hunger=0 dominasi)
    - `projectPiecewise(stats, hours)` integrasi linear dengan switching segmen ketika threshold 40 / 0 dilewati
    - `applyOfflineCatchUp(state)` honor `dtMs<0` → no decay, `effectiveHours = min(hoursPassed,24)`, integer round + clamp, atomic write `pet.stats` + `pet.lastChecked`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
    - _Design: §9_
  - [x] 5.2* Property test: Stat clamping invariant
    - **Property 1: Stat clamping invariant**
    - Untuk `(stats0, hoursPassed)` acak: hasil `applyDecay` dan `applyOfflineCatchUp` selalu di `[0,100]` untuk keempat stat
    - **Validates: Requirements 2.7, 3.4**
    - File: `src/engine/stat_engine.test.ts`
  - [x] 5.3* Property test: Stat monotonicity invariant
    - **Property 2: Stat monotonicity invariant**
    - Tanpa input pemulihan, Hunger/Energy/Bladder hasil decay tidak pernah > nilai sebelumnya
    - **Validates: Requirements 2.2, 2.3, 3.2**
    - File: `src/engine/stat_engine.test.ts`
  - [x] 5.4* Property test: Offline catch-up idempotence
    - **Property 3: Offline catch-up idempotence**
    - `applyOfflineCatchUp` dijalankan dua kali berturut-turut menghasilkan state yang sama dengan sekali (karena `lastChecked` diperbarui atomik)
    - **Validates: Requirements 3.5**
    - File: `src/engine/stat_engine.test.ts`

- [x] 6. Pure logic: Pet state machine (transition table)
  - [x] 6.1 Implement `src/engine/state_machine.ts`
    - Pure reducer `transition(currentState, event, conditions): nextState` mencakup: 7s roll uniform 1/3 atas {idle, walking_left, walking_right} dengan lemas coercion, durasi `eating=5000`, `scratching=4000`, `pooping=6000` ms, forced `pooping` (Bladder=0) di lantai, forced `sleeping` (Energy=0), sleep button toggle, wake-up (Energy=100 OR sleep button), simultaneous-trigger priority Req 4.17 sebagai ordered if-else
    - `simulateTriggers(triggers, state)` untuk testing prioritas
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 4.16, 4.17_
    - _Design: §8_
  - [x] 6.2* Example tests untuk transition table
    - Cover lemas refusal matrix (Req 4.14), forced transitions (Req 4.10/4.11), sleep button toggle (Req 4.12/4.15), durasi animasi (Req 4.7-4.9)
    - **Validates: Requirements 4.7-4.15**
    - File: `src/engine/state_machine.test.ts`
  - [x] 6.3* Property test: State machine single-state invariant
    - **Property 4: State machine single-state invariant**
    - Untuk sequence transisi acak: `currentState` selalu tepat satu nilai dari himpunan yang diizinkan
    - **Validates: Requirements 4.1, 4.16**
    - File: `src/engine/state_machine.test.ts`
  - [x] 6.4* Property test: Sleep input lock invariant
    - **Property 5: Sleep input lock invariant**
    - Untuk `currentState === 'sleeping'`, simulasi pointer event apa pun tidak mengubah state ke `carried`
    - **Validates: Requirements 4.13**
    - File: `src/engine/state_machine.test.ts`
  - [x] 6.5* Property test: State trigger priority
    - **Property 6: State trigger priority**
    - Untuk himpunan acak pemicu pada tick yang sama: state berikutnya selalu sesuai urutan prioritas Req 4.17
    - **Validates: Requirements 4.17**
    - File: `src/engine/state_machine.test.ts`

- [x] 7. Pure logic: Room geometry & coords
  - [x] 7.1 Implement `src/engine/coords.ts`
    - Constants `Room.left`, `Room.top`, `Room.right`, `Room.bottom`, `Y_floor`, `W_cat = H_cat = 64`
    - `clampPosition(pos, room, size)`, `centerOf(rect)`, `euclid(a,b)`
    - _Requirements: 4.3, 4.4, 5.3, 6.5, 6.6_
    - _Design: §7_

- [x] 8. Persistence: Zustand store dengan persist middleware
  - [x] 8.1 Implement `src/state/store.ts`
    - Buat Zustand `useStore` dengan `persist({name:'mochi_v1_store', version:1, partialize, migrate: nominalMigrate, merge: validateAndMerge, storage: customStorage})`
    - `customStorage`: wrap `localStorage` dengan in-memory fallback Map saat `QuotaExceededError`/throw, satu `setItem` = satu `JSON.stringify(envelope)` (atomic), emit non-blocking toast event
    - Debounced 500 ms write per perubahan; sync flush via listener `pagehide`/`beforeunload` (≤50 ms)
    - `validateAndMerge`: parse JSON → assert `version` integer ≥ 1 → schema check `pet`/`placed_items`/`inventory`/`coins`/`habit_records`; gagal → defaults; jika `version > 1` JANGAN downgrade in-place, load defaults, rewrite pada penulisan berikutnya
    - Atomic mutators (`atomicPurchase`, `atomicApplyStatDelta`, `atomicPlaceItem`, dll) untuk mencegah partial state
    - _Requirements: 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_
    - _Design: §11_
  - [x] 8.2* Property test: Round-trip persistence (Zustand)
    - **Property 10: Round-trip persistence**
    - Untuk state acak valid: `deserialize(serialize(state)) ≡ state` (struktural)
    - **Validates: Requirements 13.3**
    - File: `src/state/store.test.ts`
  - [x] 8.3* Property test: Persistence write atomicity
    - **Property 11: Persistence write atomicity**
    - Untuk sequence perubahan store yang diselingi kegagalan tulis: data yang berhasil dibaca dari `localStorage` selalu memenuhi struktur top-level `{state, version}` (tidak partial-write)
    - **Validates: Requirements 13.6**
    - File: `src/state/store.test.ts`

- [x] 9. Konfigurasi Gemini (Config_Store)
  - [x] 9.1 Implement `src/state/Config_Store.ts`
    - Read `import.meta.env.VITE_GEMINI_API_KEY` satu kali; treat `undefined` atau whitespace-only sebagai `null`
    - Export `loadConfig()`, `getConfig()`, `disableFeature(feature, cause)` untuk per-feature degradation (`auth` | `quota`)
    - Snapshot `{ geminiKey, chatEnabled, visionEnabled }`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
    - _Design: §13_

- [x] 10. Asset pipeline (map + preloader)
  - [x] 10.1 Implement `src/assets/Asset_Map.ts`
    - Object `ASSET_MAP` dengan FrameUrl arrays untuk setiap state, `items` (`scratcher`, `toy` → `/assets/Items/Fish-Toy.png`, `litterbox_clean`, `litterbox_used`), `rooms` (`morning`, `afternoon`, `evening`, `night` → `House-*.png`), dan `toy_action` (4 frame dari `toy-action/`)
    - Constants `FRAME_DURATION_MS_ACTIVE = 150`, `FRAME_DURATION_MS_SLEEP = 300`
    - Helper `getRoomBackgroundForHour(hour: number): FrameUrl` (5–10 morning, 11–15 afternoon, 16–18 evening, 19–4 night)
    - JANGAN sertakan `Clicked-Left/`, `Clicked-Right/`, `Walking-Left/` (Req 7.10; walking_left memakai walking_right + scaleX(-1))
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.10_
    - _Design: §10_
  - [x] 10.2 Implement `src/assets/Asset_Preloader.ts`
    - `preloadAll(map): Promise<void>` membuat `new Image()` per FrameUrl, resolve pada `load`/`error` (NEVER reject)
    - Cache di module-level `Map<string, HTMLImageElement>`
    - _Requirements: 7.8, 7.9_
    - _Design: §10_

- [x] 11. Boot sequence
  - [x] 11.1 Implement `src/boot.ts`
    - Orkestrasi: `loadConfig()` → `preloadAll()` → `Persistence.hydrate()` (validate-before-hydrate) → `applyOfflineCatchUp(hydrated)` atomic → render `<App />` → start `tick` & `state-roll` SETELAH first paint → register flush listeners (`pagehide`, `beforeunload`)
    - _Requirements: 1.2, 1.7, 1.11, 2.2, 3.1, 4.2, 7.8, 13.2, 13.4_
    - _Design: §6_
  - [x] 11.2* Smoke test: boot sequence
    - Verify offline catch-up dijalankan SEBELUM first paint, tick interval start SETELAH render
    - File: `src/boot.test.ts`
    - _Requirements: 3.1, 2.2_

- [x] 12. Sprite renderer
  - [x] 12.1 Implement `src/render/Sprite_Renderer.tsx`
    - Komponen menerima `currentState` + read `pet.stats.energy` (untuk `lift_sleepy` saat Energy ≤ 40)
    - Frame index advance via setTimeout chain (150 ms aktif, 300 ms `sleeping`)
    - Apply `transform: scaleX(-1)` saat `walking_left`
    - Setiap `<img>` cat memakai class `pixel-img` (Mandatory Rule Req 14.1)
    - `onError={() => setSrc(ASSET_MAP.idle[0])}` + `console.error`; `currentState` tidak diubah
    - Pergantian sprite ≤ 100 ms (Req 7.1)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.9, 14.1_
    - _Design: §10, §16_
  - [x] 12.2* DOM test: pixel-img computed style (Mandatory Rule)
    - Mount `Sprite_Renderer` di seluruh state dan assert `getComputedStyle(img).imageRendering ∈ {'pixelated','crisp-edges'}` untuk setiap `<img>`
    - **Validates: Requirements 14.1**
    - File: `src/render/Sprite_Renderer.test.tsx`

- [x] 13. Room renderer
  - [x] 13.1 Implement `src/render/Room.tsx`
    - Render background dari `getRoomBackgroundForHour(new Date().getHours())` menggunakan `<img class="pixel-img">` atau CSS background
    - Mount `Sprite_Renderer` (Pet) + map setiap `placed_items` ke `PlacedItemSprite`
    - Render overlay `toy-action` (loop 150 ms) HANYA jika minimal satu entri `placed_items` dengan `type === 'toy'` ada di Room; sprite statis `Items/Fish-Toy.png` dipakai sebagai dasar `PlacedItemSprite` toy
    - Update background per jam (re-evaluate via `setInterval` 60 s atau berbarengan dengan stat tick)
    - _Requirements: 7.6, 11.4_
    - _Design: §5, §10_

- [x] 14. Drag controller untuk Pet (Pointer Events)
  - [x] 14.1 Implement `src/engine/Drag_Controller.ts` (+ React hook `useDragController`)
    - `onPointerDown`: guard `currentState !== 'sleeping'`, `event.button === 0`, `event.isPrimary === true`, `activePointerId === null`, `currentState ∉ {eating, scratching, pooping}`; `e.preventDefault()` saat `pointerType==='touch'`; simpan `pointerOffset`, set `activePointerId`, panggil `e.currentTarget.setPointerCapture(e.pointerId)` SEBELUM `Pet_State_Machine.transition('carried')` (Mandatory Rule Req 14.2); tambah class `select-none` ke wrapper (Mandatory Rule Req 14.3); apply class `touch-none` permanen pada elemen Pet
    - `onPointerMove`: ignore non-active pointerId, `preventDefault` for touch, rAF coalesce, clamp ke Room bounds
    - `onPointerUp`: `releasePointerCapture`, hapus active state, panggil `Collision_Resolver.resolveDrop(dropPos)`
    - `onPointerCancel`/`onLostPointerCapture`: idle tanpa resolver, hapus class `select-none`
    - `contextmenu` listener: `preventDefault()`
    - Multi-pointer: ignore pointerId berbeda
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 14.2, 14.3_
    - _Design: §7, §16_
  - [x] 14.2* DOM test: setPointerCapture call order (Mandatory Rule)
    - Stub `Pet_State_Machine.transition`, dispatch synthetic `pointerdown`, assert `setPointerCapture` dipanggil SEBELUM `transition('carried')`; `petEl.hasPointerCapture(pointerId) === true` setelahnya
    - **Validates: Requirements 14.2**
    - File: `src/engine/Drag_Controller.test.tsx`
  - [x] 14.3* DOM test: select-none classList during carried (Mandatory Rule)
    - Mount Pet di state `carried`, assert `wrapperEl.classList.contains('select-none') === true` selama state aktif; setelah pointerup/idle classList tidak lagi memuat `select-none`
    - **Validates: Requirements 14.3**
    - File: `src/engine/Drag_Controller.test.tsx`

- [x] 15. Inventory drag (drag-from-drawer & reposition)
  - [x] 15.1 Implement `src/engine/inventory_drag.ts`
    - Pointer Events flow terpisah untuk: (a) drag entri dari drawer ke Room (move semantics: hapus dari `inventory` + push ke `placed_items` HANYA pada drop diterima); (b) reposition `placed_item` (update HANYA `x`/`y`)
    - Validasi via `aabb` + `clampRectToRoom`: in-bounds AND no-overlap dengan entri lain di `placed_items` (excluding self saat reposition); tolak tanpa mutasi jika gagal
    - _Requirements: 11.4, 11.5, 11.7, 11.8, 11.9_
    - _Design: §15_

- [x] 16. Game loops (tick, state-roll, walking rAF, transient timers)
  - [x] 16.1 Implement `src/engine/tick.ts`
    - 60 s `setInterval` (toleransi ±100 ms): panggil `applyDecay` dengan `deltaSeconds=60`, evaluate `hungerZero`/`anyLow40` SEBELUM step, panggil `Pet_State_Machine.checkForcedTransitions()`, atomic write `pet.stats` + `pet.lastChecked`
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.8_
    - _Design: §6_
  - [x] 16.2 Implement `src/engine/state_roll.ts`
    - 7 s `setInterval` (toleransi ±100 ms) aktif hanya saat `currentState ∈ {idle, walking_left, walking_right}`; uniform 1/3 roll; honor lemas (Hunger=0 → coerce ke `idle`)
    - _Requirements: 4.2, 4.14_
    - _Design: §6_
  - [x] 16.3 Implement `src/engine/walking_loop.ts`
    - rAF loop integrasi `pet.position.x` 40 px/s ke arah yang sesuai saat `walking_left|walking_right`; clamp Room bounds; transisi ke `idle` pada Room.left/Room.right
    - _Requirements: 4.3, 4.4_
    - _Design: §6_
  - [x] 16.4 Implement `src/engine/transient_timers.ts`
    - Schedule timer `eating=5000`, `scratching=4000`, `pooping=6000` ms; pada timer end terapkan delta atomik: Hunger +30 (clamp 100), Happiness +25 (clamp 100), Bladder = 100 (set); refuse `eating` jika Hunger=0 (lemas, Req 6.10); ignore pointerdown/up baru saat animasi berjalan (Req 6.11)
    - _Requirements: 4.7, 4.8, 4.9, 6.7, 6.8, 6.9, 6.10, 6.11_
    - _Design: §8_

- [x] 17. Photo album (IndexedDB)
  - [x] 17.1 Implement `src/persist/photo_db.ts`
    - Open `Mochi_Photos_DB` v1 dengan `onupgradeneeded` membuat object store `photos` `keyPath:'id'`
    - `addPhoto(blob, mime)`: validasi MIME ∈ {image/jpeg, image/png, image/webp} & size ≤ 5 MB SEBELUM transaction; convert ke Base64 Data URL; `id = 'photo_' + Date.now()`; pada `ConstraintError` retry dengan suffix `-2`, `-3`, ... sampai unik
    - `getAll()` urut `id` desc; `getById(id)` round-trip; `deletePhoto(id)`; `isAvailable()` cek `'indexedDB' in window` + open success
    - Multi-file upload: per-file transaction; failure satu file tidak menggagalkan batch
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.8, 12.9, 12.10_
    - _Design: §12_
  - [x] 17.2* Property test: Round-trip persistence (IndexedDB)
    - **Property 10: Round-trip persistence**
    - Untuk `UserPhoto` acak valid: `getById(addPhoto(photo)) ≡ photo` secara struktural (gunakan `fake-indexeddb`)
    - **Validates: Requirements 12.6**
    - File: `src/persist/photo_db.test.ts`

- [x] 18. Gemini chat client
  - [x] 18.1 Implement `src/gemini/chat_client.ts`
    - Init `GoogleGenerativeAI(apiKey)` saat `chatEnabled`; throw user-visible error ≤ 1 s saat disabled (Req 1.4)
    - `sendMessage(userMessage)`: build System Instruction dari allow-list `{hunger, energy, bladder, happiness, currentState, userMessage}`; throw saat field hilang (Req 8.3); single in-flight via module-level `AbortController`; 30 s timeout via `setTimeout(() => abort(), 30_000)`; error path bersihkan loading + reactivate input
    - In-memory history; `clearHistory()` dipanggil saat popup close + reload
    - Lock saat `happiness === 0` (Req 8.5)
    - On `auth`/`quota` error: panggil `Config_Store.disableFeature('chat', cause)`
    - _Requirements: 1.4, 1.5, 1.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
    - _Design: §13_
  - [x] 18.2* Mocked test: chat allow-list payload, single in-flight, 30 s timeout
    - Mock `@google/generative-ai`; assert payload HANYA berisi 6 field allow-list; second send ditolak saat in-flight; `vi.useFakeTimers` + advance 30 s memicu abort path = error handler
    - **Validates: Requirements 8.7, 8.8, 8.9**
    - File: `src/gemini/chat_client.test.ts`

- [x] 19. Gemini vision client
  - [x] 19.1 Implement `src/gemini/vision_client.ts`
    - `verifyHabitPhoto(imageBlob, habit_id)`: validasi MIME `image/jpeg` + size ≤ 5 MB; convert Base64; panggil `gemini-2.0-flash` dengan instruksi schema; 30 s timeout; expected JSON `{verdict ∈ {valid, fraud, mismatch}, reason: string, confidence: number ∈ [0,1]}`; schema mismatch → treat as failure
    - On `auth`/`quota`: panggil `Config_Store.disableFeature('vision', cause)`
    - _Requirements: 1.4, 1.5, 1.6, 10.1, 10.2, 10.5_
    - _Design: §13_
  - [x] 19.2* Mocked test: vision verdict schema validation
    - Mock vision response valid/fraud/mismatch/malformed; assert handler valid → reward path; fraud/mismatch → no reward + reason surfaced; malformed → failure path
    - **Validates: Requirements 10.4, 10.5**
    - File: `src/gemini/vision_client.test.ts`

- [x] 20. Habit tracker (constants + tracker logic)
  - [x] 20.1 Implement `src/features/habits/constants.ts`
    - 5 routine ids: `routine.brush_teeth`, `routine.drink_water`, `routine.make_bed`, `routine.stretch`, `routine.tidy_room`
    - 2 main ids: `main.workout_photo`, `main.healthy_meal`
    - Rewards: `STANDARD_COIN_REWARD = 5`, `LARGE_COIN_REWARD = 50`
    - _Requirements: 9.1, 9.3, 10.3_
    - _Design: §14_
  - [x] 20.2 Implement `src/features/habits/habit_tracker.ts`
    - `toDDMMYYYY(d: Date)` helper
    - `effectiveToday()` honor `routine_state.maxLocalDateSeen` (clock-skew backward Req 9.6)
    - `markRoutineDone(habit_id)`: anti-replay check `habit_records.some(...)`, atomic push record + `coins += 5`; uncheck never refunds
    - `submitMainHabit(habit_id, photoBlob)`: panggil vision client; on `valid` atomic push record + `coins += 50`; pada gagal/`fraud`/`mismatch` no-op + surface error
    - `pruneOldRecords()`: hapus entri dengan `local_date` > 30 hari sebelum `effectiveToday()` (best-effort)
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
    - _Design: §14_
  - [x] 20.3* Property test: Main-habit completion uniqueness
    - **Property 9: Main-habit completion uniqueness**
    - Untuk sequence acak validasi sukses lintas reload (simulasi via persist store): jumlah `(habit_id, local_date)` untuk satu hari ≤ 1 dan total tambahan koin = 50
    - **Validates: Requirements 10.6**
    - File: `src/features/habits/habit_tracker.test.ts`

- [x] 21. Shop & Inventory (atomic purchase + placement ops)
  - [x] 21.1 Implement `src/features/shop/shop.ts`
    - Catalog `PRICES = {scratcher:50, toy:30, litterbox:80}` dan `DIMS = {scratcher:{w:64,h:64}, toy:{w:48,h:48}, litterbox:{w:80,h:64}}`
    - `purchase(type)`: guard `coins>=price`; atomic `coins -= price` + push `InventoryEntry` dengan id unik via `nextUniqueId(state, type)` (`inv_<type>_<crypto.randomUUID()>` + collision check); reject tanpa mutasi jika koin kurang
    - _Requirements: 11.1, 11.2, 11.3, 11.7_
    - _Design: §15_
  - [x] 21.2 Implement `src/features/shop/inventory.ts`
    - `placeItem(entryId, dropPos)`: jalankan AABB validation (in-bounds + no-overlap); jika diterima atomic remove dari `inventory` + push ke `placed_items` dengan `{x,y}`; reject tanpa mutasi
    - `repositionItem(itemId, newPos)`: validasi sama (excluding self); update HANYA `x`/`y`; `id`/`type`/`width`/`height` immutable
    - `removeItem(itemId)`: hapus dari `placed_items` + push kembali ke `inventory` dengan `{id,type,width,height}` identik
    - _Requirements: 11.4, 11.5, 11.7, 11.8, 11.9, 11.10_
    - _Design: §15_
  - [x] 21.3* Property test: Coin non-negativity
    - **Property 12: Coin non-negativity**
    - Setelah sequence acak operasi shop + habit: `coins >= 0` selalu terpenuhi
    - **Validates: Requirements 9.3, 10.3, 11.2, 11.3**
    - File: `src/features/shop/shop.test.ts`
  - [x] 21.4* Property test: Placement bounds
    - **Property 13: Placement bounds**
    - Untuk semua `placed_items` setelah sequence place/reposition acak: koordinat dan dimensi setiap entri tetap di dalam Room
    - **Validates: Requirements 11.4, 11.8, 11.9**
    - File: `src/features/shop/inventory.test.ts`

- [x] 22. Checkpoint - Ensure all engine + persistence + Gemini tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. UI shell — HUD, coin display, action bar, sleep button (reuse GameUI)
  - [x] 23.1 Implement `src/ui/StatsHUD.tsx`
    - Pakai `ProgressBar` + `GameIcon` (`heart`, `carrot`, `bell`, `star`) untuk hunger/energy/bladder/happiness; baca UI-floored stats via `uiInt`
    - _Requirements: 2.1_
    - _Design: §2, §5_
  - [x] 23.2 Implement `src/ui/CoinDisplay.tsx`
    - Pakai `Pill` + `GameIcon('gold')`
    - _Requirements: 11.2_
    - _Design: §5_
  - [x] 23.3 Implement `src/ui/ActionBar.tsx`
    - Pakai `DrawerNav` + `GameButton` (iconOnly): tombol untuk sleep/chat/shop/album/habit; kelola UI flag (modalOpen) lokal
    - _Requirements: 4.12, 8.1, 11.1, 12.1_
    - _Design: §5_
  - [x] 23.4 Implement `src/ui/SleepButton.tsx`
    - `GameButton` iconOnly `pause`; dispatch event sleep ke `Pet_State_Machine`
    - _Requirements: 4.12, 4.15_
    - _Design: §5_

- [x] 24. UI shell — Modals & drawers (reuse GameUI)
  - [x] 24.1 Implement `src/ui/ShopModal.tsx`
    - `ModalFrame` + `TabGroup` (kategori) + `ItemCard` per item dari catalog; `GameButton` "Beli"; integrasi `purchase()`; tampilkan toast koin tidak cukup
    - _Requirements: 11.1, 11.2, 11.3_
    - _Design: §5, §15_
  - [x] 24.2 Implement `src/ui/InventoryDrawer.tsx`
    - `Drawer` (vertical) + `CardDock` + `GameButton` (iconOnly); wire ke `inventory_drag` (15.1) untuk drag entri ke Room; tombol remove dari `placed_items` (kembalikan ke inventory) (Req 11.10)
    - _Requirements: 11.4, 11.5, 11.10_
    - _Design: §5, §15_
  - [x] 24.3 Implement `src/ui/HabitTrackerModal.tsx`
    - `ModalFrame` + `LineTabGroup` (Routine/Main) + `Row` (`notification`/`leaderboard`) + `Checkbox` + `Badge`; routine: panggil `markRoutineDone`; main: buka `HabitMainCaptureModal`
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 10.6_
    - _Design: §5, §14_
  - [x] 24.4 Implement `src/ui/HabitMainCaptureModal.tsx`
    - `ModalFrame` + `GameButton` + `Spinner`; live camera capture via `getUserMedia` (no file picker, Req 10.1); on submit panggil `submitMainHabit`; tampilkan verdict reason pada fraud/mismatch/error; handle camera permission denied (Req 10.7) dan no-camera (Req 10.8)
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.7, 10.8_
    - _Design: §5, §13, §14_
  - [x] 24.5 Implement `src/ui/ChatPopup.tsx`
    - `Dialog` + `FormField` (max 500 chars) + `GameButton` + `Spinner`; single in-flight loading; disabled saat Happiness=0 (Req 8.5); clear history saat close
    - _Requirements: 8.1, 8.5, 8.6, 8.8, 8.10_
    - _Design: §5, §13_
  - [x] 24.6 Implement `src/ui/PhotoAlbumModal.tsx`
    - `ModalFrame` + `GameButton` (`add`/`trash`/`close`) + `Pagination`; thumbnail grid (sorted desc by `id`); klik thumbnail → buka `PhotoFullView`; delete via `ConfirmDialog`
    - Read-only mode jika `!photo_db.isAvailable()` (Req 12.8): disable upload/delete UI
    - _Requirements: 12.1, 12.4, 12.5, 12.8_
    - _Design: §5, §12_
  - [x] 24.7 Implement `src/ui/PhotoFullView.tsx`
    - `Dialog` + `GameButton('close')` menampilkan `base64Data`
    - _Requirements: 12.4_
    - _Design: §5_
  - [x] 24.8 Implement `src/ui/ConfirmDialog.tsx`
    - Wrapper generic atas `Dialog` (props: title, message, onConfirm, onCancel)
    - _Requirements: 12.5_
    - _Design: §5_
  - [x] 24.9 Implement `src/ui/Toast.tsx`
    - `Banner` + `NotificationDot`; subscribe ke event toast bus (storage quota, IndexedDB unavailable, Gemini disabled, dll.)
    - _Requirements: 1.4, 1.5, 1.12, 12.7, 12.8, 13.6_
    - _Design: §5, §11, §12_

- [x] 25. App shell & integration
  - [x] 25.1 Replace `src/App.tsx` dengan Mochi shell
    - Hapus demo UI Kit; mount `Room` (full viewport) dengan overlay `StatsHUD` + `CoinDisplay` + `ActionBar` + `SleepButton`; mount semua modal via portals (terkontrol oleh ActionBar state); panggil `boot()` di `useEffect` sekali; pastikan wrapper utama menerima class `select-none` saat `currentState === 'carried'`; Pet `<img>` selalu memakai class `pixel-img` + `touch-none`
    - _Requirements: 1.1, 14.1, 14.3_
    - _Design: §5, §6_
  - [x] 25.2 Update `src/main.tsx`
    - Tambahkan `import './tailwind.css'` SETELAH `import './styles.css'` agar cascade Tailwind utility tidak menimpa rule existing dari styles.css; sisanya tetap (StrictMode + createRoot)
    - _Requirements: 1.1_
    - _Design: §2_

- [x] 26. Smoke tests final
  - [x] 26.1* Smoke test: localStorage quota fallback
    - Stub `localStorage.setItem` melempar `QuotaExceededError`; verifikasi store beralih ke in-memory Map dan event toast diemit
    - **Validates: Requirements 1.12, 13.6**
    - File: `src/state/store.smoke.test.ts`
  - [x] 26.2* Smoke test: IndexedDB unavailable read-only mode
    - Stub `'indexedDB' in window` ke `false`; verifikasi `photo_db.isAvailable()` return false dan `PhotoAlbumModal` render dalam read-only mode
    - **Validates: Requirements 12.8**
    - File: `src/persist/photo_db.smoke.test.ts`

- [x] 27. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked dengan `*` adalah opsional dan dapat dilewati untuk MVP cepat; namun tiga DOM tests untuk Mandatory Rules (12.2, 14.2, 14.3) sangat dianjurkan agar Req 14 terverifikasi.
- Setiap top-level task mencantumkan referensi requirements granular dan section design.
- Property-based tests dijalankan via `fast-check` ≥100 iterasi per properti.
- Property numbering mengikuti `design.md` Correctness Properties (Property 1..13).
- Tailwind dipasang dengan `corePlugins.preflight=false` agar kompatibel dengan `styles.css` existing; jika review menolak Tailwind, fallback adalah deklarasi `.pixel-img`/`.select-none`/`.touch-none` langsung di `styles.css` — assertion DOM Req 14 tetap terpenuhi (hanya bergantung pada nama class + computed style).
- `src/components/GameUI.tsx` dan `src/styles.css` JANGAN diubah; semua chrome dipakai-ulang via export GameUI.
- `src/App.tsx` demo UI Kit DIGANTI pada langkah 25.1 (paling akhir) agar tetap dapat dijadikan referensi visual selama implementasi.
- `Walking-Left/`, `Clicked-Left/`, `Clicked-Right/` TIDAK dipetakan pada v1.0 (Req 7.3 + 7.10).
- Aset toy dipakai dua jalur: `Items/Fish-Toy.png` sebagai sprite statis `PlacedItemSprite` toy; `toy-action/toy-fish[1..4].png` sebagai overlay loop 150 ms HANYA saat ada minimal satu `placed_items` toy aktif (independen dari sprite cat — cat eating tetap memakai `Eat/`).

### Manual verification (di luar coding tasks; tidak dieksekusi oleh code agent)

Catatan acuan untuk QA setelah seluruh task selesai:
- Jalankan `npm run dev`, verifikasi Room memuat background `House/House-*.png` sesuai jam lokal.
- Drag/drop manual cat ke setiap furnitur; observasi animasi `eating`/`scratching`/`pooping` dan delta stat post-animation.
- Uji chat dengan `VITE_GEMINI_API_KEY` valid dan kosong; verifikasi pesan error muncul ≤ 1 detik saat key kosong.
- Selesaikan satu routine habit + satu main habit (live camera) dan verifikasi koin bertambah +5 / +50.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.1", "3.1", "9.1", "20.1"] },
    { "id": 3, "tasks": ["4.1", "5.1", "6.1", "7.1", "10.1", "17.1", "25.2"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "5.2", "5.3", "5.4", "6.2", "6.3", "6.4", "6.5", "8.1", "10.2", "17.2", "18.1", "19.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "11.1", "12.1", "13.1", "14.1", "15.1", "16.1", "16.2", "16.3", "16.4", "18.2", "19.2", "20.2", "21.1", "24.5", "24.7", "24.8", "24.9"] },
    { "id": 6, "tasks": ["11.2", "12.2", "14.2", "14.3", "20.3", "21.2", "21.3", "21.4", "23.1", "23.2", "23.3", "23.4", "24.1", "24.3", "24.4", "24.6"] },
    { "id": 7, "tasks": ["24.2", "26.1", "26.2"] },
    { "id": 8, "tasks": ["25.1"] }
  ]
}
```
