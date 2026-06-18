# CHANGELOG

## 1.3.0 (2026-06-18)

### Fitur Baru

- **findNestAndEgg**: Cari nest dan egg berdasarkan nama dengan error handling detail yang menampilkan ID yang tersedia.
- **autoResolveDefaults**: Auto-resolve nest (default ID 5, fallback ke 1), egg (default ID 15, fallback ke 1), port allocation, startup command, dan docker image dari egg.
- **updateServerSpecs**: Ubah spesifikasi server (RAM, CPU, Disk, IO, OOM, databases, allocations, backups).
- **changeServerOwnership**: Pindahkan server ke user lain berdasarkan userId atau email.
- **changeServerNestEgg**: Ubah nest dan egg server, termasuk docker image dan startup command.
- **getServerDetails**: Ambil detail lengkap server termasuk nama node, nest, egg, dan user.
- **batchServerOperation**: Operasi batch untuk suspend, unsuspend, reinstall, atau delete beberapa server sekaligus.
- **findNestByName**: Cari nest berdasarkan nama dengan daftar nest yang tersedia jika tidak ditemukan.
- **findEggByName**: Cari egg berdasarkan nama di nest tertentu dengan daftar egg yang tersedia.
- **application.nests.find**: Cari nest berdasarkan nama.
- **application.nests.eggs.find**: Cari egg berdasarkan nama di nest tertentu.

### Perubahan

- Update version ke v1.3.0
- Export type UpdateServerSpecsInput, ChangeServerOwnershipInput, ChangeServerNestEggInput

## 1.2.0 (2026-06-18)

### Fitur Baru

- **Retry Logic**: HttpCore mendukung retry otomatis dengan exponential backoff untuk error 429, 502, 503, 504.
- **Server Search**: Tambahkan `application.servers.find(query)` untuk mencari server berdasarkan nama.
- **User Find**: Tambahkan `application.users.find(email)` untuk mencari user berdasarkan email.
- **Retry Config**: Konfigurasi retry fleksibel via `PteroConfig.retry` (retries, baseDelay, maxDelay, retryOn).

## 1.1.0 (2026-05-30)

### Fitur Baru

- **SDK-Centric Architecture**: Repositori direstrukturisasi untuk fokus pada SDK TypeScript yang komprehensif.
- **Modular Application & Client API**: Pemisahan yang jelas antara Application API (Admin) dan Client API (User).
- **WebSocket Integration**: Dukungan WebSocket untuk koneksi real-time.
- **Improved Developer Experience**: Peningkatan tipe TypeScript, API yang lebih intuitif.
