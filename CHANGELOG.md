# CHANGELOG

## 1.5.0 (2026-10-18)

### Rilis besar
- Dukungan resmi empat jalur konsumsi: TypeScript ESM, TypeScript CommonJS, JavaScript ESM, dan JavaScript CommonJS.
- Build ganda menghasilkan `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, dan `dist/index.d.cts` sehingga resolusi tipe benar di kedua modul.
- Package exports memakai kondisi `import` dan `require` terpisah lengkap dengan deklarasi tipe masing-masing.

### Mesin HTTP
- Retry adaptif dengan exponential backoff, jitter, dukungan `Retry-After`, dan klasifikasi error jaringan.
- Token bucket rate limiter dengan burst dan antrean adil.
- Circuit breaker tiga status (`closed`, `half-open`, `open`) dengan jumlah percobaan setengah terbuka yang dapat dikonfigurasi.
- Cache GET berbasis LRU + TTL dengan invalidasi otomatis setelah setiap request non-GET.
- Singleflight dedupe untuk request GET bersamaan.
- Telemetri lengkap: jumlah request, status per kode, cache hit, retry, pembukaan circuit, dan persentil latensi p50/p95/p99.
- Hook `onRequest`, `onResponse`, `onRetry`, dan `onError` dengan isolasi error.
- Dukungan `AbortSignal`, timeout per request, dan header kustom.

### Perencanaan kapasitas
- Modul planner baru dengan perhitungan kapasitas efektif over-allocation, headroom multi-dimensi, dan skor penempatan.
- Strategi penempatan `balanced`, `pack`, `spread`, `memory`, `disk`, dan `ports`.
- Bin packing first-fit-decreasing untuk sekumpulan spesifikasi server.
- Forecast jumlah server yang muat beserta faktor pembatas utama.
- Analisis fragmentasi port, gap terbesar, dan distribusi blok port kosong.
- Strategi alokasi diperluas: `lowest-port`, `highest-port`, `top`, `random` (seeded), `range`, `contiguous`, `best-fit`, dan `spread`.

### Pembuatan server pintar
- Payload server memuat `nest` dan `egg` sesuai kontrak Application API.
- Resolusi environment dari variable egg, termasuk panel varian yang hanya mengekspos variable melalui `?include=variables`.
- Pengisian otomatis field environment yang diminta panel ketika validasi 422 terjadi.
- Deteksi kemampuan panel (`nests`, `eggs`, Application API, Client API) dengan fallback endpoint otomatis.
- Preview tidak lagi membuat user sebagai efek samping; pembuatan user hanya terjadi pada eksekusi nyata.
- Opsi `waitForInstall` menunggu instalasi selesai sebelum mengembalikan hasil.
- Rollback tidak diperlukan karena setiap langkah divalidasi sebelum eksekusi.

### Resource server
- Handle server lengkap: file manager (list, read, write, append, tail, rename, compress, decompress, upload, download, download ke file), startup variable, network allocation, database, backup, schedule, activity, dan settings.
- `resources()` menormalkan respons `stats` sehingga `current_state` selalu tersedia.
- `waitForState` dan `waitForInstall` dengan timeout, interval, dan callback polling.
- Builder schedule tervalidasi: cron 5 field, task power/command/backup, update yang menyinkronkan task lama.
- Dukungan auto-backup schedule dan `setupAutoBackupSchedule`.

### WebSocket
- Reconnect dengan exponential backoff dan jitter, heartbeat ping, serta refresh token otomatis saat `token expiring`.
- Event terstruktur: `console`, `stats`, `status`, `reconnecting`, `token_refreshed`, dan event mentah Wings.
- `waitFor`, `getConsole`, dan `stats()` untuk observabilitas.

### Email dan backup
- Transport SMTP dengan pool koneksi, verifikasi, dan cache transporter.
- Template email dengan escape HTML dan helper `renderEmailTemplate`.
- Backup panel diunduh secara streaming ke direktori sementara, dikonversi ke ZIP bila tool tersedia, lalu dikirim sebagai attachment dengan batas ukuran.
- Opsi `keepPanelBackup`, `format`, `pollInterval`, `timeout`, dan `attachmentLimitBytes`.
- Pembersihan file sementara selalu berjalan, termasuk saat terjadi error.

### CLI
- Perintah baru: `nodes`, `allocations`, `nests`, `eggs`, `egg-runtime`, `users`, `servers`, `plan`, `forecast`, `create-user`, `create-server`, `delete-user`, `delete-server`, `suspend`, `unsuspend`, `reinstall`, `server`, `backup`, `email-test`, `raw`, `completion`.
- Aksi server lengkap: summary, resources, files, read, write, upload, download, mkdir, startup, set-env, network, databases, backups, schedule-create, schedule-run, schedule-delete, setup-backup, console, wait-state, power, command.
- Semua operasi destruktif membutuhkan `--yes`; mode non-interaktif menolak aksi tanpa konfirmasi.
- Output tabel rapi plus mode `--json` untuk otomasi.
- Wizard interaktif membaca node dan egg langsung dari panel.
- Loader `.env` tanpa dependensi tambahan.

### Konfigurasi
- Profil config dengan validasi domain, import dari environment, export dotenv, dan doctor.
- Environment baru: `PTERO_NODE_ID`, `PTERO_NEST_ID`, `PTERO_EGG_ID`, `PTERO_SAFE_MODE`, `SMTP_*`.

### Kualitas dan rilis
- 41 unit test yang mencakup HTTP engine, planner, resource, error, dan dual module.
- Harness live test end-to-end dengan `--mutate` dan pembersihan otomatis.
- Type consumer test memverifikasi resolusi tipe ESM dan CJS.
- Source guard menolak komentar, watermark, dan kredensial di source code.
- Release guard memvalidasi packaging, exports, dokumentasi, dan workflow publish.
- Workflow GitHub Actions untuk CI multi-Node dan publish npm otomatis dengan provenance.

### Perbaikan
- Cache tidak lagi menyajikan data basi setelah operasi tulis.
- Daftar file selalu memperlihatkan hasil terbaru setelah upload, compress, atau hapus.
- Resolver egg memakai `include=variables` pada panel varian sehingga environment wajib ikut terkirim.
- `resources()` mengembalikan struktur stabil pada panel yang membungkus payload dalam `attributes`.
- Retry tidak dijalankan untuk method tidak idempotent kecuali diminta eksplisit.

## 1.4.2 (2026-08-12)

### Perbaikan
- Retry default hanya berjalan untuk method HTTP aman atau idempotent.
- Resolver Nest/Egg tidak lagi mengganti resource yang gagal ditemukan dengan ID fallback diam-diam.
- Pencarian nest, allocation, dan backup user membaca seluruh halaman API sampai batas aman.
- Safe mode memerlukan konfirmasi eksplisit untuk operasi hapus.
- Tipe respons generik `PteroResource`, `PteroCollection`, `PteroPagination`, dan `HttpMethod`.

## 1.4.1 (2026-08-12)

### Perbaikan
- Endpoint download file memakai Client API dengan method GET.
- Respons HTML fallback ditolak saat membaca file.
- WebSocket Node.js memakai header Origin panel dan menunggu socket benar-benar terbuka.
- Environment server dipertahankan saat `changeNestEgg`.
- Logging nonaktif secara default dengan retry backoff dan jitter.

## 1.4.0 (2026-06-18)

### Perbaikan
- `description` selalu diisi saat membuat server.
- Optimasi alur pembuatan server pintar.
- Penanganan error validasi field.

## 1.3.0 (2026-06-18)

### Fitur
- `findNestAndEgg`, `autoResolveDefaults`, `updateServerSpecs`, `changeServerOwnership`, `changeServerNestEgg`, `getServerDetails`, `batchServerOperation`.

## 1.2.0 (2026-06-18)

### Fitur
- Retry logic, pencarian server, pencarian user, dan konfigurasi retry.

## 1.1.0 (2026-05-30)

### Fitur
- Arsitektur SDK, modul Application dan Client API, integrasi WebSocket.

## 1.0.0

### Fitur
- Rilis awal gateway Pterodactyl.
