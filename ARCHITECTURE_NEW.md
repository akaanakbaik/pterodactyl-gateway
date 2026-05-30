# New SDK Architecture Design

Fokus utama dari pembaruan ini adalah mentransformasi `pterodactyl-gateway` menjadi SDK yang komprehensif, modular, dan mudah digunakan oleh developer untuk membangun platform mereka sendiri (seperti dashboard hosting atau bot).

## 1. Struktur Core SDK

SDK akan dibagi menjadi dua area utama sesuai dengan API Pterodactyl:

### A. Application API (Admin)
Digunakan untuk manajemen infrastruktur.
- `ptero.application.users`: CRUD User, manajemen 2FA.
- `ptero.application.nodes`: CRUD Node, Alokasi, Konfigurasi.
- `ptero.application.locations`: CRUD Location.
- `ptero.application.servers`: CRUD Server (Full control), Suspend/Unsuspend, Reinstall.
- `ptero.application.nests`: List Nests, Eggs, Variables.

### B. Client API (User)
Digunakan untuk kontrol server oleh user.
- `ptero.client.account`: Detail akun, API Keys, 2FA.
- `ptero.client.servers`: List server yang dapat diakses.
- `ptero.client.server(id)`: Handle spesifik untuk satu server:
    - `.resources()`: Statistik CPU/RAM/Disk.
    - `.power(signal)`: Start, Stop, Restart, Kill.
    - `.command(cmd)`: Kirim command ke konsol.
    - `.files`: File manager (List, Read, Write, Delete, Archive, dsb).
    - `.backups`: Manajemen backup.
    - `.databases`: Manajemen database.
    - `.schedules`: Manajemen jadwal tugas.
    - `.network`: Manajemen alokasi/port.
    - `.websocket`: Koneksi real-time ke konsol dan statistik.

## 2. Smart Layer (Abstraksi Tinggi)

Tetap mempertahankan fitur "Smart" yang memudahkan developer melakukan tugas kompleks dalam satu baris kode:
- `ptero.smart.createServer()`: Otomatis mencari node/alokasi, membuat user jika belum ada, dan deploy server.
- `ptero.smart.deployPreset()`: Menggunakan template siap pakai (NodeJS, Python, dsb).

## 3. Peningkatan DX (Developer Experience)

- **Full TypeScript**: Interface lengkap untuk setiap response API Pterodactyl.
- **Fluent API**: Pemanggilan method yang berantai dan intuitif.
- **WebSocket Support**: Class built-in untuk menangani koneksi WebSocket Pterodactyl dengan event emitter.
- **Error Handling**: Error yang informatif dengan kode error Pterodactyl yang dipetakan dengan baik.

## 4. Pemisahan CLI

Logika CLI akan dipisahkan sepenuhnya dari core SDK agar package tetap ringan saat diinstall sebagai dependensi library.
