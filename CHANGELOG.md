# CHANGELOG

## 1.2.0 (2026-06-18)

### Fitur Baru

- **Retry Logic**: HttpCore mendukung retry otomatis dengan exponential backoff untuk error 429, 502, 503, 504.
- **Server Search**: Tambahkan `application.servers.find(query)` untuk mencari server berdasarkan nama.
- **User Find**: Tambahkan `application.users.find(email)` untuk mencari user berdasarkan email.
- **Retry Config**: Konfigurasi retry fleksibel via `PteroConfig.retry` (retries, baseDelay, maxDelay, retryOn).
- **Batch Operations**: Mendukung operasi bulk untuk manajemen server dan user dalam jumlah besar.

### Perubahan

- **Version Bump**: Update version ke v1.2.0.
- **Error Handling**: Peningkatan penanganan error dengan retry logic yang lebih robust.
- **Performance**: Optimasi request handling untuk operasi yang membutuhkan banyak API call.

### Perbaikan Bug

- Fix example `create-server-smart.ts` yang menggunakan API method yang salah.
- Fix WebSocket reconnect handling.

## 1.1.0 (2026-05-30)

### Fitur Baru

- **SDK-Centric Architecture**: Repositori direstrukturisasi untuk fokus pada SDK TypeScript yang komprehensif.
- **Modular Application & Client API**: Pemisahan yang jelas antara Application API (Admin) dan Client API (User) untuk manajemen Pterodactyl.
- **WebSocket Integration**: Menambahkan dukungan WebSocket untuk koneksi real-time ke konsol server dan statistik.
- **Improved Developer Experience**: Peningkatan tipe TypeScript, API yang lebih intuitif, dan penanganan error yang lebih baik.

### Perubahan

- **Pemisahan CLI**: Logika CLI dipisahkan dari core SDK untuk menjaga ukuran package tetap ringan.
- **Update Dependencies**: Memperbarui dependensi dan versi Node.js minimum ke `^18.0.0`.

### Perbaikan Bug

- Berbagai perbaikan bug kecil dan peningkatan stabilitas.
