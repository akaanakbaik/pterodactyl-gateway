# CHANGELOG

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
