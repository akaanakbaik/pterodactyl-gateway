# CHANGELOG

## 1.4.2 (2026-08-12)

### Perbaikan
- Retry default kini hanya berjalan untuk method HTTP aman atau idempotent. Operasi `POST` memerlukan `retryUnsafe: true` untuk diulang secara eksplisit.
- Resolver Nest/Egg tidak lagi mengganti resource yang gagal ditemukan dengan ID fallback diam-diam.
- Pencarian Nest, pemilihan allocation, dan backup-email user kini membaca seluruh halaman API sampai batas aman 100 halaman.
- Safe mode yang sebelumnya belum dipakai kini memerlukan konfirmasi eksplisit untuk menghapus user, server, atau allocation Application API.
- Hapus versi statis dari User-Agent default agar tidak drift dari versi package.
- Tambahkan tipe respons generik `PteroResource`, `PteroCollection`, `PteroPagination`, dan `HttpMethod`.
- Perbarui `nodemailer`, `ws`, dan `@types/node` ke patch kompatibel terbaru.

## 1.4.1 (2026-08-12)

### Perbaikan
- Perbaiki `files.download()` agar menggunakan endpoint download Client API dengan method GET.
- Tolak respons HTML fallback pada `files.read()` agar halaman panel tidak terbaca sebagai konten file.
- Perbaiki WebSocket Node.js dengan header Origin panel dan koneksi yang selesai setelah socket benar-benar terbuka.
- Pertahankan environment server dan terapkan default variable egg saat `changeNestEgg()` dijalankan.
- Hapus `updateInventory()` yang mengarahkan PATCH ke endpoint panel tidak valid.
- Jadikan logging nonaktif secara default dan tingkatkan retry dengan backoff, jitter, serta dukungan Retry-After.
- Wajibkan konfigurasi SMTP eksplisit, aktifkan verifikasi TLS secara default, dan hapus pembacaan `.env` panel.
- Sinkronkan metadata CLI, versi package, regression test, dan README.

## 1.4.0 (2026-06-18)

### Perbaikan
- Pastikan `description` selalu diisi saat create server (wajib oleh Pterodactyl API)
- Optimasi smart server creation flow
- Update error handling untuk validasi field

## 1.3.0 (2026-06-18)

### Fitur Baru
- findNestAndEgg: Cari nest/egg berdasarkan nama
- autoResolveDefaults: Auto port, nest, egg, startup, docker image
- updateServerSpecs: Ubah spesifikasi server
- changeServerOwnership: Pindahkan server ke user lain
- changeServerNestEgg: Ubah nest dan egg server
- getServerDetails: Ambil detail lengkap server
- batchServerOperation: Operasi batch untuk multiple servers

## 1.2.0 (2026-06-18)

### Fitur Baru
- Retry Logic: Auto retry dengan exponential backoff
- Server Search: Cari server berdasarkan nama
- User Find: Cari user berdasarkan email
- Retry Config: Konfigurasi retry fleksibel

## 1.1.0 (2026-05-30)

### Fitur Baru
- SDK-Centric Architecture
- Modular Application & Client API
- WebSocket Integration
- Improved Developer Experience
