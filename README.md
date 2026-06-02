# Akadev Pterodactyl Gateway

**SDK TypeScript Modern untuk Integrasi Pterodactyl Panel yang Mudah, Lengkap, dan Real-time.**

`@akaanakbaik/pterodactyl-gateway` · `v1.1.0` · `Node.js >=18` · `MIT`

[**npm**](https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway) · [**GitHub**](https://github.com/akaanakbaik/pterodactyl-gateway)

Pterodactyl Gateway adalah SDK yang dirancang khusus untuk memudahkan developer (baik mahir maupun awam) dalam membangun aplikasi yang terintegrasi dengan Pterodactyl Panel. Dengan fokus pada **SDK-first approach**, sistem logging yang informatif, dan fitur real-time, Anda dapat membuat dashboard hosting, bot panel, atau sistem otomatisasi lainnya dengan sangat cepat.

## Fitur Utama

-   🚀 **Smart SDK**: Inisialisasi mudah dengan smart defaults untuk Nest, Egg, dan Alokasi Port.
-   🛠️ **Full CRUD Support**: Kelola User dan Server (Create, Read, Update, Delete) secara lengkap.
-   📡 **Real-time Control**: Dukungan WebSocket untuk konsol server dan statistik resource.
-   📝 **Super Logger**: Sistem log informatif (Success, Info, Warn, Debug, Error) untuk memudahkan debugging.
-   ⚠️ **Custom Error Handling**: Pesan error yang sangat detail lengkap dengan petunjuk cara memperbaikinya.
-   🔒 **Type Safe**: Ditulis sepenuhnya dalam TypeScript dengan interface API yang akurat.
-   🤖 **Integration Helpers**: Template siap pakai untuk bot Telegram, WhatsApp, Discord, dan Website API.

## Instalasi

```bash
npm install @akaanakbaik/pterodactyl-gateway
```

## Quick Start (Sangat Mudah!)

Cukup masukkan domain dan API Key Anda, dan SDK siap digunakan.

```typescript
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: "https://panel.anda.com",
  ptla: "ptla_xxx", // Application API Key (Admin)
  ptlc: "ptlc_xxx", // Client API Key (User)
  debug: true       // Aktifkan log super lengkap
});

// Cek koneksi
const status = await ptero.connect();
if (status.ok) {
  console.log("Terhubung ke panel!");
}
```

## Manajemen User (Smart & Auto)

Anda tidak perlu pusing mengecek apakah user sudah ada atau belum.

```typescript
// Ambil user jika ada, atau buat baru jika belum ada
const user = await ptero.smart.users.getOrCreate({
  username: "akadev_user",
  email: "user@example.com",
  password: "PasswordAman123!",
  administrator: false
});

console.log(`User ID: ${user.id}`);
```

## Manajemen Server (Deploy Instan)

Membuat server kini hanya butuh satu perintah. SDK akan otomatis mencarikan alokasi port yang kosong.

```typescript
const server = await ptero.smart.servers.create({
  name: "My Awesome Bot",
  email: "user@example.com",
  autoCreateUser: true, // Otomatis buat user jika email belum terdaftar
  nodeId: 1,
  nestId: 5,   // NodeJS Nest
  eggId: 18,   // NodeJS Egg
  preset: "basic", // Gunakan preset specs (mini/basic/standard/premium)
});

console.log(`Server Identifier: ${server.identifier}`);
```

## Kontrol Server & Real-time

Gunakan `serverHandle` untuk mengontrol server secara mendalam.

```typescript
const server = ptero.server("a0345ab5");

// Power actions
await server.power("start");
await server.power("restart");

// Kirim command ke konsol
await server.command("say Hello World!");

// Baca resource (CPU, RAM, Disk)
const stats = await server.resources();
console.log(stats.attributes.resources);

// File Manager
await server.files.write("/config.json", JSON.stringify({ version: "1.0.0" }));
const content = await server.files.read("/config.json");
```

### Real-time Console (WebSocket)

```typescript
const ws = server.websocket.create();

ws.on("status", (data) => {
  console.log(`Status Server: ${data.state}`);
});

ws.on("console", (data) => {
  console.log(`[CONSOLE] ${data.line}`);
});

ws.on("stats", (data) => {
  console.log(`RAM: ${data.memory_bytes / 1024 / 1024} MB`);
});

await ws.connect();
```

## Sistem Error & Logging Super Lengkap

SDK ini dilengkapi dengan `PteroLogger` yang memberikan output cantik di terminal Anda. Jika terjadi kesalahan, `PteroError` akan memberikan alasan yang jelas:

```text
❌ [AUTH_FAILED] Autentikasi client API gagal.
💡 Petunjuk: API Key PTLC tidak valid atau tidak memiliki izin.
🛠️ Langkah Perbaikan:
   1. Cek kembali API Key di panel Pterodactyl
   2. Pastikan API Key memiliki permission yang cukup
```

## Preset Spesifikasi

Anda dapat menggunakan preset bawaan atau melakukan override:

| Preset | RAM | Disk | CPU |
| :--- | :--- | :--- | :--- |
| `mini` | 512MB | 1GB | 50% |
| `basic` | 1GB | 2GB | 100% |
| `standard` | 2GB | 5GB | 200% |
| `premium` | 4GB | 10GB | 400% |

## Keamanan

- **Jangan pernah** membagikan PTLA/PTLC Anda di client-side (browser).
- Gunakan environment variables (`PTERO_DOMAIN`, `PTERO_PTLA`, `PTERO_PTLC`) untuk keamanan maksimal.
- SDK ini mendukung `PteroGateway.fromEnv()` untuk kemudahan deployment.

---

Dibuat dengan ❤️ oleh [akaanakbaik](https://github.com/akaanakbaik)
