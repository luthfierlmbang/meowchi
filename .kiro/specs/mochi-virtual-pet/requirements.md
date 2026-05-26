# Requirements Document

Mochi Virtual Pet — v1.0 Official Baseline.

## Introduction

Mochi adalah webapp virtual pet bergaya pixel-art di mana pengguna merawat seekor kucing abu-abu bernama Mochi. Aplikasi berjalan sepenuhnya di sisi klien (frontend-only) menggunakan React + Vite + Tailwind, state global via Zustand (persisted ke LocalStorage), galeri foto via IndexedDB, dan integrasi AI ke Gemini API untuk fitur Chat dan verifikasi habit melalui Vision.

Pengguna dapat mengangkat dan menjatuhkan Mochi ke furnitur (Scratcher, Toy Fish Bowl, Litter Box) untuk memicu state berbeda, menggunakan habit tracker untuk memperoleh koin, berbelanja furnitur, dan menyimpan album foto pribadi. Statistik (Hungry, Energy, Bladder, Happiness) menurun secara real-time dengan offline catch-up agar pengalaman terasa hidup meskipun aplikasi ditutup.

Dokumen ini mendefinisikan ruang lingkup v1.0 Official Baseline persis seperti pada PRD; tidak menambahkan fitur di luar PRD.

## Glossary

- **App**: Aplikasi Mochi Virtual Pet secara keseluruhan (frontend SPA).
- **Pet**: Entitas kucing virtual bernama "Mochi" yang dirender di Room.
- **Room**: Area utama tempat Pet bergerak dan furnitur ditempatkan.
- **Stat / Stats**: Empat nilai numerik integer 0..100 yang merepresentasikan kondisi Pet — Hunger, Energy, Bladder, Happiness. Nilai 100 = ideal.
- **Stat_Engine**: Modul logika yang menghitung penurunan stat real-time dan offline catch-up.
- **Pet_State_Machine**: Modul yang menentukan `currentState` Pet (idle, walking_left, walking_right, carried, scratching, eating, pooping, sleeping). Pet selalu berada pada tepat satu state pada satu waktu.
- **Sprite_Renderer**: Komponen yang menampilkan PNG transparan Pet sesuai `currentState` dengan rendering pixel-crisp.
- **Drag_Controller**: Modul yang menangani input Pointer Events (down/move/up) untuk mengangkat dan menjatuhkan Pet.
- **Collision_Resolver**: Modul yang melakukan uji AABB antara Pet dan setiap `placed_item` saat Pet dijatuhkan.
- **Placed_Item / Furniture**: Objek yang ditempatkan pengguna di Room. Tipe: `scratcher`, `toy`, `litterbox`. Setiap item memiliki `id`, `type`, `x`, `y`, `width`, `height`.
- **Inventory**: Koleksi furnitur yang sudah dibeli tetapi belum ditempatkan, atau sudah ditempatkan tapi dapat dipindahkan dari drawer inventaris.
- **Shop**: Antarmuka jual-beli furnitur dengan koin.
- **Coins**: Mata uang dalam aplikasi (integer non-negatif), disimpan di Zustand store.
- **Habit_Tracker**: Modul untuk mencatat kebiasaan harian. Memiliki dua jenis: Routine_Habit dan Main_Habit.
- **Routine_Habit**: Habit yang divalidasi via checkbox manual (honor system). Memberikan reward koin standar.
- **Main_Habit**: Habit yang divalidasi via Gemini Vision menggunakan foto kamera live. Memberikan reward koin besar.
- **Gemini_Chat**: Fitur percakapan teks dengan Mochi yang ditenagai Gemini API.
- **Gemini_Vision**: Pemanggilan model `gemini-2.0-flash` untuk verifikasi foto Main_Habit.
- **Photo_Album**: Galeri foto pribadi pengguna yang disimpan di IndexedDB.
- **Photo_DB**: Database IndexedDB bernama `Mochi_Photos_DB` yang menyimpan entri `UserPhoto`.
- **UserPhoto**: Entri foto galeri dengan field `id` (string timestamp-based), `base64Data` (string Base64 atau Blob URL), dan `uploadedAt` (string DD-MM-YYYY).
- **Persistence_Store**: Penyimpanan Zustand yang dipersist ke `localStorage` dengan key `mochi_v1_store`.
- **Config_Store**: Penampung in-memory hasil pembacaan variabel lingkungan saat App bootstrap (mis. `VITE_GEMINI_API_KEY`) yang dibaca tepat satu kali sebelum komponen fitur dimount.
- **lastChecked**: Timestamp (ms epoch) terakhir kali Stat_Engine memperbarui stat.
- **effectiveHours**: Nilai jam yang dipakai untuk perhitungan offline catch-up, didefinisikan `effectiveHours = min(hoursPassed, 24)` agar gap offline yang sangat panjang tetap terbatas.
- **AABB**: Axis-Aligned Bounding Box, dipakai untuk uji tumpang tindih persegi panjang berdasar koordinat sumbu.
- **Pointer_Capture**: Mekanisme `Element.setPointerCapture(pointerId)` agar event pointer terus terkirim ke elemen Pet meski cursor bergerak cepat keluar bounding box.
- **pointerOffset**: Selisih antara koordinat pointer dan titik anchor sprite Pet pada saat `onPointerDown`, digunakan agar Pet tidak "loncat" ke koordinat pointer saat drag dimulai.
- **activePointerId**: Nilai `event.pointerId` yang sedang memegang Pointer_Capture; digunakan untuk membedakan pointer utama dari pointer lain (mis. jari kedua) selama drag.
- **Y_floor**: Garis horizontal yang menandai baseline lantai Room, yaitu nilai Y di mana sisi bawah bounding box Pet menyentuh lantai (`Y_cat = Y_floor − H_cat`).
- **Asset_Map**: Pemetaan dari `currentState` ke daftar berkas PNG sprite (mendukung multi-frame animation).

## Requirements

### Requirement 1: Inisialisasi Aplikasi & Konfigurasi Lingkungan

**User Story:** Sebagai pengembang, saya ingin App dapat berjalan dengan dependensi dan konfigurasi minimal yang sesuai PRD, sehingga seluruh fitur Mochi dapat aktif sejak boot.

#### Acceptance Criteria

1. THE App SHALL menggunakan stack React (Vite) + TypeScript + Tailwind CSS + Zustand untuk state global.
2. WHEN App melakukan bootstrap, THE App SHALL membaca Gemini API key dari variabel lingkungan `VITE_GEMINI_API_KEY` di file `.env.local` tepat satu kali dan menyimpannya ke Config_Store sebelum komponen fitur apa pun dimount.
3. THE App SHALL memperlakukan `VITE_GEMINI_API_KEY` sebagai tidak terkonfigurasi jika nilainya `undefined` atau berupa string yang hanya berisi whitespace, dan dalam kondisi tersebut THE App SHALL menonaktifkan fitur Gemini_Chat dan Main_Habit verification.
4. WHEN pengguna memanggil sebuah fitur Gemini yang sedang dinonaktifkan karena `VITE_GEMINI_API_KEY` tidak terkonfigurasi, THE App SHALL menampilkan pesan error yang user-visible dalam waktu paling lambat 1 detik, menamai fitur yang dipanggil dan menyatakan bahwa key belum dikonfigurasi.
5. WHERE `VITE_GEMINI_API_KEY` terdefinisi tetapi sebagian endpoint Gemini gagal otentikasi atau gagal kuota, THE App SHALL mengizinkan state parsial: fitur Gemini yang masih merespons tetap aktif, dan fitur yang gagal dimatikan secara independen disertai pesan error spesifik yang menamai fitur serta kelas penyebabnya (`auth` atau `quota`).
6. THE App SHALL menggunakan SDK `@google/generative-ai` untuk seluruh pemanggilan Gemini API dari sisi klien.
7. THE App SHALL mempersist seluruh state global yang relevan (pet, placed_items, coins) ke `localStorage` melalui Zustand persist menggunakan key `mochi_v1_store` dengan field `version` berupa bilangan bulat ≥ 1, dan THE App SHALL mempersist `pet.lastChecked` sebagai bagian dari objek `pet`.
8. WHEN App pertama kali dimuat tanpa data persist, THE Persistence_Store SHALL menginisialisasi state default sesuai skema PRD (hunger=100, energy=100, bladder=100, happiness=100, currentState="idle", position={x:250,y:400}, placed_items=[], coins=200, lastChecked=Date.now()).
9. WHEN App dimuat dan terdapat data persist dengan `version` lebih kecil dari versi saat ini, THE Persistence_Store SHALL menjalankan migrasi nominal yang mempertahankan nilai lama dan menyelesaikan migrasi sebelum komponen pertama dirender.
10. IF migrasi nominal menemukan field wajib pada skema baru yang tidak dapat dipetakan dari data lama, THEN THE Persistence_Store SHALL me-reset hanya field tersebut ke nilai default sebelum komponen pertama dirender, dan menyelesaikan keseluruhan migrasi sebelum render dimulai.
11. IF data persist tidak memuat field `version` atau dianggap rusak (gagal parse JSON / gagal validasi skema), THEN THE Persistence_Store SHALL me-reset state ke default (sesuai kriteria 8) dan melanjutkan boot.
12. IF `localStorage` tidak tersedia atau menolak penulisan karena kuota terlampaui, THEN THE App SHALL beralih menggunakan in-memory store sebagai fallback dan menampilkan notifikasi non-blocking yang memberi tahu pengguna bahwa progres sesi ini tidak akan tersimpan.

### Requirement 2: Sistem Stats & Decay Real-Time

**User Story:** Sebagai pemain, saya ingin stats Mochi menurun seiring waktu sehingga ada kebutuhan untuk merawatnya.

#### Acceptance Criteria

1. THE Stat_Engine SHALL menjaga setiap stat (Hunger, Energy, Bladder, Happiness) sebagai bilangan dalam interval [0, 100]; nilai internal boleh berupa pecahan selama proses decay, sedangkan UI SHALL menampilkan integer hasil `floor` dari nilai internal.
2. WHILE App terbuka, THE Stat_Engine SHALL menjalankan `setInterval` setiap 60000 ms (toleransi ±100 ms per tick) yang menerapkan decay sebesar `laju_per_jam / 60` per tiap stat per tick dan memperbarui `lastChecked` ke `Date.now()`.
3. THE Stat_Engine SHALL menerapkan laju decay nominal: Hunger -6 per jam, Energy -4 per jam, Bladder -5 per jam.
4. WHILE setidaknya satu di antara Hunger, Energy, atau Bladder bernilai pada atau di bawah 40 (≤ 40) dan Hunger lebih besar dari 0, THE Stat_Engine SHALL menerapkan decay tambahan konstan -6 per jam pada Happiness; decay tambahan ini SHALL tidak ber-stacking ketika lebih dari satu stat berada ≤ 40 secara bersamaan.
5. WHILE Hunger, Energy, dan Bladder semuanya berada pada nilai di atas 40 (> 40), THE Stat_Engine SHALL tidak menerapkan decay tambahan pada Happiness, dan decay tambahan yang sedang berjalan SHALL berhenti pada tick berikutnya saat kondisi diperiksa ulang.
6. WHILE Hunger bernilai tepat 0, THE Stat_Engine SHALL menggantikan decay tambahan -6 per jam pada Happiness dengan decay tambahan -30 per jam (penurunan tajam) dan SHALL tidak menumpuk kedua decay tambahan tersebut.
7. IF nilai stat hasil perhitungan jatuh di bawah 0 atau melampaui 100, THEN THE Stat_Engine SHALL melakukan clamping ke 0 atau 100 sehingga seluruh stat tetap berada di [0, 100].
8. THE Stat_Engine SHALL memperbarui field `pet.stats` dan `pet.lastChecked` di Persistence_Store secara atomik agar tidak terjadi state inkonsisten antar field.

### Requirement 3: Offline Catch-Up Saat Aplikasi Dibuka Kembali

**User Story:** Sebagai pemain, saya ingin stats menurun bahkan saat aplikasi tertutup, sehingga Mochi terasa hidup lintas sesi.

#### Acceptance Criteria

1. WHEN App dimuat dan Persistence_Store selesai melakukan hidrasi, THE Stat_Engine SHALL menghitung `hoursPassed = (Date.now() - pet.lastChecked) / (1000 * 60 * 60)` SEBELUM Sprite_Renderer merender frame pertama dan SEBELUM interval periodik Stat_Engine (Req 2.2) dimulai.
2. WHEN `hoursPassed` lebih besar dari 0, THE Stat_Engine SHALL menghitung `effectiveHours = min(hoursPassed, 24)` dan menerapkan decay terakumulasi pada Hunger (-6 per jam), Energy (-4 per jam), dan Bladder (-5 per jam) berdasar `effectiveHours`.
3. WHEN salah satu di antara Hunger, Energy, atau Bladder diproyeksikan berada pada atau di bawah 40 selama sub-interval dari `effectiveHours`, THE Stat_Engine SHALL menerapkan decay tambahan pada Happiness sebesar -6 per jam untuk panjang sub-interval tersebut, atau -30 per jam ketika Hunger diproyeksikan tepat 0 selama sub-interval itu, dengan sub-interval diturunkan secara deterministik dari model decay linear pada kriteria 2.
4. WHEN offline catch-up diterapkan, THE Stat_Engine SHALL membulatkan setiap nilai stat hasil perhitungan menggunakan integer rounding lalu melakukan clamping ke [0, 100], sehingga decay sub-integer akibat reload yang sangat berdekatan menjadi 0.
5. WHEN offline catch-up selesai, THE Stat_Engine SHALL memperbarui `pet.stats` dan `pet.lastChecked` ke `Date.now()` dalam satu penulisan atomik ke Persistence_Store, sehingga menjalankan kembali offline catch-up segera setelahnya menghasilkan stats yang sama (idempotence).
6. IF `Date.now() - pet.lastChecked` bernilai negatif (jam sistem mundur untuk sebab apa pun), THEN THE Stat_Engine SHALL tidak menerapkan decay apa pun (termasuk pada Happiness) dan tetap memperbarui `lastChecked` ke `Date.now()` melalui jalur penulisan atomik yang sama.

### Requirement 4: State Machine Kucing & Transisi

**User Story:** Sebagai pemain, saya ingin Mochi memiliki perilaku berbeda (idle, jalan, diangkat, makan, tidur, dll) yang berganti sesuai aksi pemain dan kondisi stats.

#### Acceptance Criteria

1. THE Pet_State_Machine SHALL menjaga `pet.currentState` selalu bernilai tepat satu dari: `idle`, `walking_left`, `walking_right`, `carried`, `scratching`, `eating`, `pooping`, `sleeping`.
2. WHILE `currentState` adalah `idle`, `walking_left`, atau `walking_right`, THE Pet_State_Machine SHALL setiap 7 detik (toleransi ±100 ms) melakukan random roll dengan probabilitas seragam 1/3 atas himpunan {`idle`, `walking_left`, `walking_right`} untuk menentukan state berikutnya.
3. WHILE `currentState` adalah `walking_left` atau `walking_right`, THE Pet_State_Machine SHALL menggeser `pet.position.x` dengan kecepatan 40 piksel per detik ke arah yang sesuai dan SHALL meng-clamp `pet.position` agar bounding box Pet tetap berada penuh di dalam Room.
4. WHEN `pet.position` mencapai batas kiri (`Room.left`) atau batas kanan (`Room.right`) Room saat `currentState` adalah `walking_left` atau `walking_right`, THE Pet_State_Machine SHALL mentransisi `currentState` ke `idle` (tanpa memantul kembali).
5. WHEN pengguna melakukan pointerdown pada Pet, THE Pet_State_Machine SHALL mentransisi `currentState` ke `carried` sesuai aturan Drag_Controller pada Requirement 5.
6. WHEN pengguna melakukan pointerup saat `currentState` adalah `carried`, THE Collision_Resolver SHALL menentukan transisi berikutnya sesuai Requirement 6.
7. WHEN Pet ditransisi ke `scratching`, THE Pet_State_Machine SHALL menahan state tersebut selama 4 detik (toleransi ±100 ms) sebelum kembali ke `idle`.
8. WHEN Pet ditransisi ke `eating`, THE Pet_State_Machine SHALL menahan state tersebut selama 5 detik (toleransi ±100 ms) sebelum kembali ke `idle`.
9. WHEN Pet ditransisi ke `pooping`, THE Pet_State_Machine SHALL menahan state tersebut selama 6 detik (toleransi ±100 ms) sebelum kembali ke `idle`.
10. IF Bladder mencapai 0, THEN THE Pet_State_Machine SHALL memaksa transisi ke `pooping` di koordinat Pet saat itu (di lantai, di luar Litter Box) dan SHALL menginterupsi state transient apa pun yang sedang berjalan (`carried`, `eating`, `scratching`, `walking_left`, `walking_right`); setelah 6 detik Pet kembali ke `idle`.
11. IF Energy mencapai 0, THEN THE Pet_State_Machine SHALL memaksa transisi ke `sleeping` di koordinat Pet saat itu dan SHALL menginterupsi state transient apa pun selain `pooping` yang sudah dipaksa oleh kriteria 10.
12. WHEN pengguna menekan tombol sleep, THE Pet_State_Machine SHALL mentransisi `currentState` ke `sleeping` dan SHALL menginterupsi state non-forced apa pun (`carried`, `eating`, `scratching`, `walking_left`, `walking_right`); transisi ini SHALL tidak mengganggu state forced (`pooping` karena Bladder=0 atau `sleeping` karena Energy=0) yang sedang aktif.
13. WHILE `currentState` adalah `sleeping`, THE Drag_Controller SHALL mengabaikan seluruh `pointerdown`/`pointermove`/`pointerup`/click pada Pet (carry dan klik dikunci).
14. IF Hunger mencapai 0 (kondisi "lemas"), THEN THE Pet_State_Machine SHALL menolak transisi ke `eating`, `scratching`, dan SHALL menolak hasil random roll yang menghasilkan `walking_left` atau `walking_right` (memaksa hasil tetap `idle`); penekanan tombol sleep oleh pemain SHALL tetap diterima dan transisi paksa `pooping` pada Bladder=0 SHALL tetap dieksekusi; selama kondisi ini Stat_Engine SHALL menerapkan decay tambahan -30 per jam pada Happiness sesuai Req 2.6.
15. WHILE `currentState` adalah `sleeping`, THE Pet_State_Machine SHALL mentransisi `currentState` ke `idle` ketika Energy mencapai 100 ATAU ketika pengguna menekan tombol sleep sekali lagi.
16. THE Pet_State_Machine SHALL tidak pernah memiliki dua state aktif secara bersamaan.
17. WHEN beberapa pemicu transisi terjadi pada tick yang sama, THE Pet_State_Machine SHALL memilih pemicu sesuai urutan prioritas berikut, tertinggi ke terendah: (a) forced `pooping` karena Bladder=0, (b) forced `sleeping` karena Energy=0, (c) tombol sleep pemain, (d) penyelesaian drop oleh Collision_Resolver, (e) random roll 7 detik dari Req 4.2.

### Requirement 5: Drag & Drop Pet via Pointer Events

**User Story:** Sebagai pemain, saya ingin mengangkat dan memindahkan Mochi dengan mouse atau jari saya tanpa lag, sehingga interaksi terasa responsif baik di desktop maupun mobile.

#### Acceptance Criteria

1. THE Drag_Controller SHALL menggunakan Pointer Events (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`) pada elemen Pet untuk kompatibilitas mouse, touch, dan pen, serta THE App SHALL menerapkan kelas Tailwind `touch-none` pada elemen Pet agar gesture native (scroll, pinch-zoom) browser tidak ikut terpicu selama interaksi drag.
2. WHEN `onPointerDown` terjadi pada Pet dengan `event.button === 0` (primary/left), `event.isPrimary === true`, dan `currentState` bukan `sleeping`, THE Drag_Controller SHALL (a) menyimpan `pointerOffset` sebagai selisih antara koordinat pointer dan titik anchor sprite Pet pada saat itu, (b) menyimpan `event.pointerId` sebagai `activePointerId`, (c) memanggil `e.currentTarget.setPointerCapture(e.pointerId)` agar pointer tertangkap selama drag, dan (d) memerintahkan THE Pet_State_Machine untuk mentransisi `currentState` ke `carried`.
3. WHILE `currentState` adalah `carried`, THE Drag_Controller SHALL memperbarui `pet.position` pada setiap `onPointerMove` yang berasal dari `activePointerId` dengan rumus `pet.position = pointerCoord − pointerOffset`, paling lambat dalam 1 animation frame (≤16,7 ms pada 60 Hz) sejak event diterima, dan SHALL melakukan clamp hasilnya sehingga seluruh bounding box Pet tetap berada di dalam Room bounds (tidak boleh keluar dari sisi kiri, kanan, atas, atau bawah Room).
4. WHILE `currentState` adalah `carried`, THE App SHALL menerapkan kelas Tailwind `select-none` pada wrapper utama untuk mencegah teks/elemen ter-highlight selama drag berlangsung.
5. WHEN `onPointerUp` terjadi dari `activePointerId` saat `currentState` adalah `carried`, THE Drag_Controller SHALL melepaskan pointer capture, menghapus `activePointerId` dan `pointerOffset`, dan menyerahkan koordinat akhir Pet (yang sudah dihitung dengan `pointerOffset` dan ter-clamp ke Room bounds) ke Collision_Resolver.
6. IF `onPointerCancel` terjadi atau pointer capture hilang (`onLostPointerCapture`) untuk `activePointerId` saat `currentState` adalah `carried`, THEN THE Drag_Controller SHALL memperlakukan kejadian tersebut setara `onPointerUp` di koordinat terakhir yang diketahui, menghapus `activePointerId` serta `pointerOffset`, dan THE Pet_State_Machine SHALL mentransisi `currentState` kembali ke `idle` (state default) tanpa menjalankan Collision_Resolver.
7. WHILE `activePointerId` sudah terdaftar dan `currentState` adalah `carried`, IF event pointer datang dengan `pointerId` yang berbeda (mis. jari kedua pada layar sentuh atau klik mouse paralel), THEN THE Drag_Controller SHALL mengabaikan event tersebut tanpa mengubah `currentState`, `pet.position`, `pointerOffset`, atau pointer capture yang aktif.
8. IF `onPointerDown` terjadi pada Pet dengan `event.button` bukan 0 (mis. right-click atau middle-click) atau dengan `event.isPrimary === false`, THEN THE Drag_Controller SHALL mengabaikan event tersebut tanpa mengubah `currentState`, dan THE App SHALL memanggil `preventDefault()` pada event `contextmenu` di area Pet sehingga menu konteks browser tidak muncul saat berinteraksi dengan Pet.
9. WHEN event Pointer pada Pet memiliki `pointerType === 'touch'` selama `currentState` adalah `idle` atau `carried`, THE Drag_Controller SHALL memanggil `event.preventDefault()` pada `onPointerDown` dan `onPointerMove` agar perilaku scroll/pinch-zoom native (termasuk pada iOS Safari) tidak terpicu selama drag berlangsung.

### Requirement 6: AABB Collision Resolver Saat Drop

**User Story:** Sebagai pemain, saya ingin menjatuhkan Mochi ke atas furnitur memicu aksi yang sesuai, sehingga interaksi dengan benda di Room terasa konsisten.

#### Acceptance Criteria

1. WHEN Pet dijatuhkan (event `pointerup` saat `currentState = carried`), THE Collision_Resolver SHALL mengevaluasi rumus AABB untuk setiap item di `placed_items` menggunakan sistem koordinat layar dengan origin di pojok kiri-atas (sumbu X bertambah ke kanan, sumbu Y bertambah ke bawah, satuan piksel CSS), dengan `(X_cat, Y_cat)` adalah koordinat pojok kiri-atas bounding box Pet pada titik drop, `(X_item, Y_item)` adalah pojok kiri-atas bounding box item, dan W/H adalah lebar/tinggi bounding box dalam piksel: `isOverlapping = (X_cat < X_item + W_item) && (X_cat + W_cat > X_item) && (Y_cat < Y_item + H_item) && (Y_cat + H_cat > Y_item)`.
2. THE Collision_Resolver SHALL menetapkan dimensi bounding box Pet `W_cat = 64` piksel dan `H_cat = 64` piksel (konstanta), serta menggunakan dimensi `W_item` dan `H_item` dari properti item yang sama yang dipakai untuk merender item tersebut.
3. WHEN tepat satu placed_item memenuhi `isOverlapping = true`, THE Collision_Resolver SHALL memetakan tipe item ke transisi `currentState`: `scratcher` → `scratching`, `toy` → `eating`, `litterbox` → `pooping`.
4. WHEN beberapa placed_item memenuhi `isOverlapping = true` secara bersamaan, THE Collision_Resolver SHALL memilih satu item menggunakan urutan prioritas: (a) hierarki tipe `litterbox` > `toy` > `scratcher`; (b) untuk tipe yang sama, item dengan jarak Euclidean terkecil antara pusat bounding box item dan titik drop (pusat bounding box Pet); (c) tie-breaker terakhir berdasar urutan ascending indeks pada array `placed_items`.
5. WHEN tidak ada placed_item yang memenuhi `isOverlapping`, THE Collision_Resolver SHALL menempatkan Pet pada baseline lantai (didefinisikan sebagai garis horizontal `Y_floor` tempat sisi bawah bounding box Pet menyentuh lantai Room, yaitu `Y_cat = Y_floor - H_cat`) dengan `X_cat` mengikuti koordinat X drop, lalu mentransisi `currentState` ke `idle`.
6. IF titik drop menempatkan bounding box Pet melewati batas Room (kiri, kanan, atau bawah), THEN THE Collision_Resolver SHALL meng-clamp `X_cat` dan `Y_cat` agar bounding box Pet tetap berada penuh di dalam Room sebelum mengevaluasi AABB pada Acceptance Criterion 1.
7. WHEN transisi ke `eating` terjadi karena drop di atas Toy Fish, THE Stat_Engine SHALL menaikkan Hunger sebesar +30 poin (di-clamp pada batas atas 100) setelah animasi `eating` selesai.
8. WHEN transisi ke `scratching` terjadi karena drop di atas Scratcher, THE Stat_Engine SHALL menaikkan Happiness sebesar +25 poin (di-clamp pada batas atas 100) setelah animasi `scratching` selesai.
9. WHEN transisi ke `pooping` terjadi karena drop di atas Litter Box, THE Stat_Engine SHALL memulihkan Bladder ke nilai 100 (set, bukan increment) setelah animasi `pooping` selesai.
10. IF Pet dijatuhkan di atas item bertipe `toy` saat `Hunger = 0` (kondisi "lemas"), THEN THE Collision_Resolver SHALL menolak transisi ke `eating`, mempertahankan `currentState` saat ini sebagaimana didefinisikan oleh kondisi lemas, dan tidak memicu perubahan stat dari Acceptance Criterion 7.
11. WHILE `currentState` berada pada `eating`, `scratching`, atau `pooping` (animasi sedang berjalan), THE Collision_Resolver SHALL mengabaikan event `pointerdown`/`pointerup` baru pada Pet sehingga animasi tidak terinterupsi sampai selesai.
12. THE Collision_Resolver SHALL bersifat simetris: jika item A overlap dengan Pet, maka uji yang sama dengan koordinat Pet sebagai item dan item sebagai Pet juga menghasilkan `isOverlapping = true`.

### Requirement 7: Sprite & Asset Mapping (Pixel-Crisp Rendering)

**User Story:** Sebagai pemain, saya ingin grafik kucing tampil tajam khas pixel-art dan berganti gambar sesuai state, sehingga aplikasi mempertahankan estetika yang dirancang.

#### Acceptance Criteria

1. THE Sprite_Renderer SHALL menampilkan grafik Pet sebagai PNG transparan individu yang dipilih melalui atribut `<img src>` sesuai `currentState`, dan SHALL menyelesaikan pergantian sprite paling lambat 100 ms setelah `currentState` berubah.
2. THE Sprite_Renderer SHALL menerapkan style `image-rendering: pixelated` pada setiap elemen `<img>` Pet sehingga tidak ada blur antialias pada sisi piksel.
3. THE Asset_Map SHALL memetakan setiap state ke daftar frame PNG: `idle` → frames Idle-Right, `walking_left`/`walking_right` → frames Walking-Right (dengan `transform: scaleX(-1)` untuk arah kiri), `carried` → frames Lift-Default secara default dan frames Lift-Sleepy ketika Energy ≤ 40, `scratching` → frames Stratch (animasi kucing menggaruk; aset furnitur Scratcher di `Items/Stratcher/` adalah aset terpisah), `eating` → frames Eat, `pooping` → frames Pup, `sleeping` → frames Sleep.
4. WHEN sebuah state memiliki lebih dari satu frame, THE Sprite_Renderer SHALL melakukan animasi frame berurutan secara loop selama state tersebut berlangsung dengan durasi 150 ms per frame untuk state aktif (`idle`, `walking_left`, `walking_right`, `carried`, `scratching`, `eating`, `pooping`) dan 300 ms per frame untuk state `sleeping`.
5. WHILE `currentState` adalah `walking_left`, THE Sprite_Renderer SHALL menerapkan `transform: scaleX(-1)` pada elemen Pet sehingga sprite menghadap kiri.
6. THE Asset_Map SHALL hanya merujuk ke berkas PNG yang berada di bawah direktori `public/assets/` agar dapat dimuat oleh Vite saat runtime, dengan subdirektori kanonik berikut: `Idle-Right/`, `Walking-Right/`, `Lift-Default/`, `Lift-Sleepy/`, `Stratch/`, `Eat/`, `Pup/`, `Sleep/`, serta aset furnitur di `Items/Pasir-Kucing/` dan `Items/Stratcher/`. Nama berkas frame SHALL mempertahankan nama dari repositori sumber.
7. WHEN aset awal di repositori berada di luar `public/assets/`, THE App SHALL merelokasi atau menyalin aset tersebut ke `public/assets/` dengan struktur dan penamaan yang konsisten dengan Acceptance Criterion 6 sebelum rilis v1.0.
8. THE Sprite_Renderer SHALL melakukan preload seluruh frame PNG yang terdaftar di Asset_Map sebelum render frame pertama, agar tidak terjadi flicker pada pergantian state pertama.
9. IF berkas sprite gagal dimuat atau dianggap rusak (mis. event `error` pada `<img>`), THEN THE Sprite_Renderer SHALL menampilkan frame pertama Idle-Right sebagai fallback, mempertahankan `currentState` saat ini, dan SHALL mencatat indikasi error pada konsol developer build.
10. THE Asset_Map SHALL tidak memetakan aset `Clicked-Left/` dan `Clicked-Right/` ke state mana pun pada v1.0 (out of scope).

### Requirement 8: Gemini Chat (Text)

**User Story:** Sebagai pemain, saya ingin mengobrol dengan Mochi melalui pop-up chat dan jawabannya merefleksikan kondisi fisik Mochi saat itu.

#### Acceptance Criteria

1. WHEN pengguna menekan ikon chat, THE App SHALL membuka pop-up Gemini_Chat yang berisi tampilan riwayat chat sesi berjalan, sebuah input teks dengan batas 500 karakter, dan tombol kirim.
2. WHEN pengguna mengirim sebuah pesan, THE App SHALL menyusun System Instruction yang menyertakan nilai terkini Hunger, Energy, Bladder, Happiness, dan `currentState`, lalu mengirim System Instruction beserta pesan ke model `gemini-2.0-flash` melalui SDK `@google/generative-ai`.
3. IF penyusunan System Instruction gagal (mis. stats hilang, exception saat membentuk payload), THEN THE App SHALL membatalkan pemanggilan Gemini API dan menampilkan pesan error pada chat.
4. THE Gemini_Chat SHALL diberi peran sebagai kucing abu-abu lucu bernama Mochi, menjawab maksimum 2 kalimat dan maksimum 200 karakter, menggunakan aksen kucing (mis. "meow", "purr", "hiss"), dan merefleksikan kondisi fisik Mochi yang dikirim.
5. WHILE Happiness bernilai tepat 0, THE App SHALL mengunci Gemini_Chat dengan menonaktifkan input pengguna dan tombol kirim serta menampilkan pesan bahwa Mochi terlalu sedih untuk berbicara, baik saat pop-up baru dibuka maupun saat Happiness jatuh ke 0 di tengah percakapan.
6. IF panggilan Gemini API gagal (jaringan, kuota, atau key tidak valid), THEN THE App SHALL menampilkan pesan error pada chat, menghapus indikator loading, dan mengaktifkan kembali input serta tombol kirim, tanpa menghapus riwayat pesan yang sudah ada di sesi tersebut.
7. THE Gemini_Chat SHALL membatasi payload yang dikirim ke Gemini API hanya pada allow-list berikut: nilai Hunger/Energy/Bladder/Happiness, `currentState`, dan pesan teks pengguna; THE Gemini_Chat SHALL tidak mengirim `coins`, `placed_items`, `lastChecked`, atau entri Photo_Album.
8. WHILE sebuah permintaan Gemini_Chat masih in-flight, THE App SHALL membatasi permintaan paralel sehingga hanya ada satu permintaan dalam penerbangan, menampilkan indikator loading, dan menonaktifkan input serta tombol kirim sampai respons atau error diterima.
9. WHEN sebuah permintaan Gemini_Chat tidak menerima respons dalam 30 detik, THE App SHALL membatalkan permintaan tersebut dan menjalankan jalur penanganan kegagalan API yang sama seperti Acceptance Criterion 6.
10. THE Gemini_Chat SHALL menyimpan riwayat chat hanya di memori sesi (tidak ke `localStorage` maupun IndexedDB) dan SHALL menghapus riwayat tersebut saat pop-up ditutup atau saat App di-reload.

### Requirement 9: Habit Tracker — Routine Habits (Honor System)

**User Story:** Sebagai pemain, saya ingin mencatat rutinitas harian dengan checkbox dan mendapat koin standar saat menyelesaikannya.

#### Acceptance Criteria

1. THE Habit_Tracker SHALL menyediakan daftar Routine_Habit yang dipreconfigure untuk v1.0 dengan identifier string yang stabil, dan SHALL mempersist daftar tersebut beserta metadata-nya di Persistence_Store.
2. THE Habit_Tracker SHALL mempersist catatan penyelesaian harian sebagai daftar pasangan `(habit_id, local_date)` di Persistence_Store, dengan `local_date` dalam format `DD-MM-YYYY` mengikuti zona waktu lokal perangkat.
3. WHEN pengguna menandai sebuah Routine_Habit selesai pada hari berjalan dan belum ada pasangan `(habit_id, local_date_hari_berjalan)` di catatan, THE Habit_Tracker SHALL menambahkan pasangan tersebut dan memperbarui `coins` di Persistence_Store ke nilai `coins + 5` (standard_coin_reward = 5 koin).
4. WHILE sebuah Routine_Habit sudah memiliki catatan `(habit_id, local_date_hari_berjalan)`, THE Habit_Tracker SHALL menolak pemberian reward kedua untuk habit dan hari yang sama, termasuk ketika pengguna meng-uncheck lalu mencentang ulang habit pada hari yang sama; uncheck SHALL tidak memicu pengembalian (refund) koin.
5. WHEN tanggal lokal perangkat berganti, THE Habit_Tracker SHALL mengizinkan kembali penandaan habit yang sama untuk hari baru tersebut.
6. IF tanggal lokal perangkat bergeser mundur (mis. clock skew), THEN THE Habit_Tracker SHALL memperlakukan tanggal lokal terbaru yang pernah dipersist sebagai tanggal "hari berjalan" sampai jam sistem menyusul, dan SHALL tidak membuka kembali habit yang telah ditandai selesai pada tanggal yang lebih maju tersebut.

### Requirement 10: Habit Tracker — Main Habits via Gemini Vision

**User Story:** Sebagai pemain, saya ingin habit penting diverifikasi oleh AI dari foto live, sehingga reward besarnya terasa adil dan anti-curang.

#### Acceptance Criteria

1. WHEN pengguna memulai validasi sebuah Main_Habit, THE App SHALL meminta izin akses kamera perangkat melalui API browser dan SHALL hanya menerima foto hasil capture langsung dari kamera; THE App SHALL tidak menerima berkas foto yang sudah ada di perangkat (no upload of pre-existing files).
2. WHEN foto live berhasil diambil, THE App SHALL mengonversi gambar ke string Base64 dengan MIME `image/jpeg` dengan ukuran payload ≤ 5 MB dan mengirimnya ke Gemini Vision (`gemini-2.0-flash`) bersama instruksi analisis; THE App SHALL menetapkan timeout 30 detik untuk permintaan ini, dan SHALL mengharapkan respons dengan skema `{verdict ∈ {valid, fraud, mismatch}, reason: string, confidence: number ∈ [0,1]}`.
3. WHEN respons Gemini Vision memiliki `verdict === 'valid'`, THE Habit_Tracker SHALL menambahkan reward sebesar 50 koin (large_coin_reward) ke `coins` di Persistence_Store dan SHALL mencatat pasangan `(habit_id, local_date)` dengan `local_date` dalam format `DD-MM-YYYY` di Persistence_Store.
4. IF respons Gemini Vision memiliki `verdict === 'fraud'` atau `verdict === 'mismatch'`, THEN THE Habit_Tracker SHALL menolak validasi, tidak mengubah `coins`, dan menampilkan `reason` dari respons sebagai pesan kepada pengguna.
5. IF panggilan Gemini Vision gagal karena jaringan, kuota, key tidak valid, atau melebihi timeout 30 detik (kriteria 2), THEN THE Habit_Tracker SHALL tidak memberikan reward dan SHALL menampilkan pesan error yang menginstruksikan pengguna mencoba lagi.
6. THE Habit_Tracker SHALL mempersist catatan penyelesaian Main_Habit dengan skema yang sama seperti Routine_Habit (`{habit_id, local_date}` dalam `DD-MM-YYYY`) dan SHALL menolak pemberian reward Main_Habit kedua untuk pasangan `(habit_id, local_date)` yang sudah ada, termasuk lintas reload aplikasi; THE Habit_Tracker SHALL diperbolehkan membersihkan catatan yang lebih lama dari 30 hari.
7. IF izin kamera ditolak oleh pengguna atau browser, THEN THE Habit_Tracker SHALL menampilkan pesan panduan untuk mengaktifkan izin kamera di pengaturan browser, tidak melanjutkan ke Gemini Vision, dan tidak memberikan reward; pengguna SHALL dapat mencoba kembali setelah memberikan izin.
8. IF tidak ada perangkat kamera tersedia atau pengguna membatalkan capture sebelum foto diambil, THEN THE Habit_Tracker SHALL tidak menghubungi Gemini Vision, SHALL menampilkan pesan non-blocking yang menjelaskan kondisi tersebut, dan SHALL tidak memberikan reward.

### Requirement 11: Shop, Inventory, & Penempatan Furnitur

**User Story:** Sebagai pemain, saya ingin membelanjakan koin untuk furnitur dan menempatkannya bebas di Room agar Mochi punya tempat berinteraksi.

#### Acceptance Criteria

1. THE Shop SHALL menjual tiga jenis furnitur dengan harga dan dimensi tetap berikut: Cat Scratcher (`scratcher`, harga 50 koin, width 64, height 64), Toy Fish Bowl (`toy`, harga 30 koin, width 48, height 48), dan Litter Box (`litterbox`, harga 80 koin, width 80, height 64).
2. WHEN pengguna membeli sebuah furnitur dan `coins >= harga`, THE Shop SHALL mengurangi `coins` sebesar harga dan menambahkan entri Inventory secara atomik (tidak boleh terjadi pengurangan koin tanpa penambahan entri atau sebaliknya); setiap entri Inventory SHALL memiliki field `id` (string non-kosong yang unik di seluruh Inventory dan `placed_items`), `type`, `width`, dan `height` yang mengikuti dimensi dari kriteria 1.
3. IF pengguna mencoba membeli sebuah furnitur dan `coins < harga`, THEN THE Shop SHALL menolak transaksi, menampilkan pesan koin tidak cukup, dan menjamin tidak ada perubahan apa pun pada `coins` maupun Inventory selama dan setelah upaya transaksi gagal tersebut.
4. WHEN pengguna menarik (drag) sebuah entri dari drawer Inventory ke Room dan drop-nya valid (kriteria 8), THE App SHALL memindahkan entri tersebut dari Inventory ke `placed_items` dengan mempertahankan `id`, `type`, `width`, dan `height` yang sama serta menambahkan field `x` dan `y` sesuai posisi drop; entri SHALL terhapus dari Inventory setelah berhasil dipindahkan.
5. THE App SHALL membatasi penempatan hanya untuk entri yang sudah dibeli dan tersedia di Inventory; upaya menempatkan entri yang belum dibeli SHALL ditolak tanpa mengubah `placed_items` maupun Inventory.
6. THE App SHALL mempersist `placed_items` dan Inventory ke Persistence_Store sehingga penempatan tetap ada lintas sesi.
7. THE App SHALL menjamin bahwa setiap entri di gabungan Inventory ∪ `placed_items` memiliki `id` yang unik, sehingga banyak entri dengan tipe yang sama diperbolehkan selama setiap entri memiliki `id` berbeda.
8. IF drop akan menempatkan bounding box entri keluar dari batas Room ATAU akan menghasilkan AABB overlap dengan entri lain di `placed_items`, THEN THE App SHALL menolak drop tersebut, tidak mengubah `placed_items`, dan mempertahankan entri di Inventory.
9. WHEN pengguna men-drag sebuah entri yang sudah berada di `placed_items` ke posisi baru di dalam Room, THE App SHALL memperbarui hanya field `x` dan `y` entri tersebut; field `id`, `type`, `width`, dan `height` SHALL tidak berubah, dan jaminan in-bounds serta no-overlap dari kriteria 8 SHALL tetap berlaku.
10. WHEN pengguna meminta penghapusan sebuah entri dari `placed_items`, THE App SHALL menghapus entri tersebut dari `placed_items` dan mengembalikannya ke Inventory dengan `id`, `type`, `width`, dan `height` yang sama, sehingga entri dapat ditempatkan kembali tanpa pembelian ulang.

### Requirement 12: Photo Album dengan IndexedDB

**User Story:** Sebagai pemain, saya ingin menyimpan foto pribadi dalam album di Room, sehingga aplikasi terasa lebih personal tanpa batasan ukuran localStorage.

#### Acceptance Criteria

1. WHEN pengguna mengklik objek photo-book di dalam Room, THE App SHALL membuka modal Photo_Album.
2. THE Photo_Album SHALL membuka database IndexedDB bernama `Mochi_Photos_DB` dengan `version = 1` dan SHALL menyiapkan object store bernama `photos` dengan `keyPath = 'id'`; pembuatan object store SHALL dilakukan di handler `onupgradeneeded` saat database pertama kali dibuka.
3. WHEN pengguna mengunggah satu foto, THE App SHALL menerima berkas hanya jika MIME-nya termasuk `image/jpeg`, `image/png`, atau `image/webp` dan ukurannya ≤ 5 MB; berkas yang valid SHALL dikonversi ke Data URL Base64 dan disimpan sebagai entri `UserPhoto` dengan `id` berbasis timestamp unik (mis. `photo_<ms>`); IF terjadi tabrakan `id` (rare), THEN THE App SHALL menambahkan suffix `-N` dengan N dimulai dari 2 dan bertambah sampai unik.
4. THE Photo_Album SHALL menampilkan thumbnail seluruh `UserPhoto` yang tersimpan diurutkan menurun berdasar `id` (terbaru dulu), dan WHEN pengguna memilih sebuah thumbnail, THE App SHALL membuka tampilan penuh foto tersebut.
5. WHEN pengguna meminta penghapusan sebuah `UserPhoto`, THE App SHALL menampilkan dialog konfirmasi terlebih dahulu, dan hanya menjalankan operasi delete pada IndexedDB ketika pengguna memberikan konfirmasi eksplisit.
6. THE Photo_Album SHALL menjamin operasi `add` lalu `read by id` mengembalikan `UserPhoto` yang ekuivalen dengan input (round-trip persistensi field `id`, `base64Data`, dan `uploadedAt`).
7. IF operasi IndexedDB gagal (kuota, akses ditolak, atau error transaksi), THEN THE App SHALL membatalkan transaksi yang sedang berjalan (rollback) sehingga tidak ada partial write pada object store `photos`, menampilkan pesan error non-blocking, dan tetap mengizinkan operasi baca yang tidak terkait pada `photos` setelahnya.
8. IF IndexedDB tidak tersedia di browser, THEN THE App SHALL menonaktifkan operasi upload dan delete, menampilkan pesan user-visible yang menjelaskan keterbatasan tersebut, dan tetap menampilkan entri yang sudah ada (jika ada) dalam mode read-only.
9. IF berkas yang diunggah memiliki MIME di luar daftar pada kriteria 3 atau melebihi 5 MB, THEN THE App SHALL menolak berkas tersebut sebelum penulisan dan menampilkan pesan error yang menyebut tipe yang diizinkan dan batas ukuran 5 MB.
10. WHEN pengguna mengunggah lebih dari satu berkas dalam satu aksi, THE App SHALL memproses berkas secara berurutan; setiap berkas valid SHALL menjadi entri `UserPhoto` terpisah, dan berkas yang ditolak SHALL tidak menggagalkan pemrosesan berkas lain dalam batch tersebut.

### Requirement 13: Persistensi & Round-Trip Zustand Store

**User Story:** Sebagai pemain, saya ingin progres saya tetap ada saat saya menutup dan membuka aplikasi kembali.

#### Acceptance Criteria

1. THE Persistence_Store SHALL mempersist objek dengan struktur top-level `{ "state": { pet, placed_items, coins }, "version": 1 }` ke `localStorage` pada key `mochi_v1_store`.
2. WHEN nilai `pet`, `placed_items`, atau `coins` di store berubah, THE Persistence_Store SHALL menjadwalkan penulisan ke `localStorage` dengan debounce 500 ms dan SHALL menyelesaikan setiap penulisan dalam ≤ 50 ms; pada event `pagehide` atau `beforeunload` THE Persistence_Store SHALL melakukan flush sinkron sehingga perubahan terbaru tertulis sebelum halaman unload.
3. THE Persistence_Store SHALL menjamin operasi serialize → write → read → deserialize menghasilkan objek state yang ekuivalen secara struktural dengan state asli (round-trip), yaitu memiliki nama field, tipe, dan nilai yang sama; urutan key di dalam objek SHALL diabaikan dalam perbandingan.
4. WHEN App membaca data persist dari `mochi_v1_store`, THE Persistence_Store SHALL melakukan validate-before-hydrate (parse JSON dilanjutkan pemeriksaan skema, tipe, dan `version`) sebelum hidrasi store; IF validasi gagal, THEN THE Persistence_Store SHALL melakukan fallback ke state default sesuai Req 1.8 dan tetap mengizinkan App berjalan.
5. IF `version` pada data persist lebih besar daripada versi kode saat ini, THEN THE Persistence_Store SHALL TIDAK melakukan downgrade in-place pada data tersebut, SHALL memuat state default, dan SHALL menulis ulang persist dengan versi kode saat ini pada penyimpanan berikutnya.
6. THE Persistence_Store SHALL menjamin penulisan bersifat atomik: tidak boleh terjadi partial write yang merusak struktur top-level; IF penulisan gagal karena kuota terlampaui atau IO error, THEN THE App SHALL mempertahankan state in-memory, menampilkan notifikasi non-blocking kepada pengguna, dan mencoba kembali pada perubahan berikutnya.

### Requirement 14: Mandatory Coding Rules (Verifikasi UI)

**User Story:** Sebagai pemain, saya ingin pengalaman drag terasa mulus dan visualnya tajam, sehingga kualitas baseline UI sesuai PRD selalu terjaga.

#### Acceptance Criteria

1. THE Sprite_Renderer SHALL menerapkan properti CSS `image-rendering: pixelated` beserta fallback `image-rendering: crisp-edges` pada SETIAP elemen `<img>` sprite kucing (mencakup seluruh state: idle, walking-left, walking-right, eat, sleep, lift-default, lift-sleepy, scratch, clicked-left, clicked-right, dan pup) sehingga `window.getComputedStyle(img).imageRendering` mengembalikan nilai `pixelated` atau `crisp-edges` untuk setiap elemen tersebut (Mandatory Rule).
2. WHEN event `onPointerDown` dengan `event.isPrimary === true` terjadi pada elemen Pet, THE Drag_Controller SHALL memanggil `petElement.setPointerCapture(event.pointerId)` menggunakan `pointerId` yang identik dengan `event.pointerId` sebelum transisi `currentState` ke `carried`, sehingga `petElement.hasPointerCapture(event.pointerId) === true` setelah pemanggilan (Mandatory Rule).
3. WHILE `currentState` adalah `carried`, THE App SHALL menjamin elemen wrapper utama memiliki kelas Tailwind `select-none` sehingga `wrapperElement.classList.contains('select-none') === true` selama state tersebut aktif (Mandatory Rule).

## Correctness Properties (Catatan Untuk Property-Based Testing)

Bagian ini bukan acceptance criterion tambahan; ia mendokumentasikan properti yang menjadi target uji property-based saat menyusun task list. Properti ini diturunkan dari acceptance criteria di atas.

- **Stat clamping invariant**: untuk setiap input acak `(stats0, hoursPassed)`, hasil decay terclamp di [0, 100] (Req 2, Req 3).
- **Stat monotonicity invariant**: tanpa input pemulihan, decay tidak pernah menaikkan Hunger/Energy/Bladder (Req 2, Req 3).
- **Offline catch-up idempotence**: menerapkan catch-up dua kali dengan `lastChecked` yang sudah diperbarui menghasilkan stats yang sama dengan menerapkannya satu kali (Req 3).
- **State machine single-state invariant**: `currentState` selalu tepat satu nilai dari himpunan yang diizinkan setelah sequence transisi acak (Req 4).
- **Sleep input lock invariant**: ketika `currentState === 'sleeping'`, simulasi pointer event apa pun tidak mengubah `currentState` ke `carried` (Req 4, Req 5).
- **State trigger priority property**: untuk himpunan acak pemicu yang terjadi pada tick yang sama (forced pooping karena Bladder=0, forced sleeping karena Energy=0, tombol sleep, hasil drop, random roll), state berikutnya yang dipilih oleh Pet_State_Machine selalu sesuai urutan prioritas pada Req 4.17 (Req 4).
- **AABB symmetry property**: untuk dua persegi panjang acak A dan B, `overlap(A, B) === overlap(B, A)` (Req 6).
- **AABB self-overlap property**: untuk semua persegi panjang dengan width/height > 0, `overlap(R, R) === true` (Req 6).
- **Placement no-overlap guard property**: untuk setiap kombinasi acak `placed_items` valid dan kandidat drop, jika kandidat overlap dengan entri manapun di `placed_items` atau keluar dari batas Room maka drop ditolak dan `placed_items` tidak berubah (Req 11.8).
- **Main-habit completion uniqueness property**: untuk sequence acak validasi Main_Habit yang sukses lintas reload aplikasi, jumlah catatan `(habit_id, local_date)` untuk satu hari tidak pernah melebihi 1 dan total `coins` yang ditambahkan untuk pasangan tersebut tepat 50 (Req 10.6).
- **Round-trip persistence property**: untuk state acak yang valid, `deserialize(serialize(state)) ≡ state` baik untuk Zustand store maupun untuk `UserPhoto` di IndexedDB (Req 12, Req 13).
- **Persistence write atomicity property**: untuk sequence acak perubahan store yang diselingi kegagalan tulis (kuota / IO error), data yang berhasil dibaca kembali dari `localStorage` selalu memenuhi struktur top-level `{ state, version }` yang valid (tidak pernah partial-write) (Req 13.6).
- **Coin non-negativity invariant**: setelah sequence acak operasi shop dan habit, `coins >= 0` selalu terpenuhi (Req 11, Req 9, Req 10).
- **Placement bounds property**: untuk semua input `placed_items`, koordinat dan dimensi item tetap di dalam batas Room (Req 11).
