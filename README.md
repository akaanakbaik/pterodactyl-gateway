# Akadev Pterodactyl Gateway

[![NPM Version](https://img.shields.io/npm/v/@akaanakbaik/pterodactyl-gateway.svg?style=flat-flat&color=brightgreen)](https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway)
[![License](https://img.shields.io/github/license/akaanakbaik/pterodactyl-gateway.svg?style=flat-flat&color=blue)](https://github.com/akaanakbaik/pterodactyl-gateway/blob/main/LICENSE)
[![Node Version](https://img.shields.io/node/v/@akaanakbaik/pterodactyl-gateway.svg?style=flat-flat)](https://nodejs.org)
[![NPM Downloads](https://img.shields.io/npm/dm/@akaanakbaik/pterodactyl-gateway.svg?style=flat-flat)](https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway)

**SDK TypeScript & JavaScript Modern untuk Pterodactyl Panel dengan fitur Auto-Deployment, WebSocket Auto-Reconnect, Ekspor Backup Otomatis ke Email, dan Fluent Schedule Builder.**

[**npm**](https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway) · [**GitHub**](https://github.com/akaanakbaik/pterodactyl-gateway)

> Versi stabil saat ini: **1.4.1**.

## Navigasi

- [Install](#install)
- [SDK usage](#sdk-usage)
- [Integration helpers](#integration-helpers)
- [Keamanan](#keamanan--penggunaan-terbuka)
- [Troubleshooting](#troubleshooting)

## Install

```bash
npm install @akaanakbaik/pterodactyl-gateway
```

SDK membutuhkan Node.js 18 atau lebih baru.

## SDK usage

Gunakan `createPtero()` dengan domain panel dan API key minimum yang diperlukan. Application API Key digunakan untuk administrasi panel; Client API Key digunakan untuk operasi server milik pengguna.

## Integration helpers

Helper `createIntegrationServerInput()` dan `getIntegrationKinds()` membantu membentuk input deployment untuk bot WhatsApp, Telegram, Discord, dan integrasi lain. Gunakan `smart.servers.preview()` atau opsi `dryRun` sebelum deployment baru.

---

## 1. Inisialisasi & Diagnostik

Memulai koneksi ke Pterodactyl Panel menggunakan domain, Application API Key (PTLA) untuk tindakan admin, dan Client API Key (PTLC) untuk tindakan pengguna.

```typescript
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: "panel.example.com",
  ptla: "ptla_your_application_key",
  ptlc: "ptlc_your_client_key",
  debug: false
});
```

### Cek Koneksi (Laten & Mode)
```typescript
const conn = await ptero.connect();
console.log(conn.ok, conn.mode, conn.latency);
```

### Analisis Doctor (Pengecekan Izin API)
```typescript
const report = await ptero.doctor();
console.log(report.ok, report.checks);
```

---

## 2. Manajemen Pengguna (User Management)

Melakukan operasi CRUD penuh pada akun admin/pengguna panel.

### Buat User Baru (Smart Get or Create)
```typescript
const user = await ptero.smart.users.getOrCreate({
  username: "customer_akadev",
  email: "customer@akadev.me",
  password: "auto",
  administrator: false
});
console.log(user.id, user.username, user.email);
```

### Buat User Baru (Raw)
```typescript
const newUser = await ptero.application.users.create({
  username: "user_baru",
  email: "baru@akadev.me",
  password: "PasswordRahasia123!",
  root_admin: false,
  first_name: "User",
  last_name: "Baru"
});
console.log(newUser);
```

### Ambil Daftar User (Pagination)
```typescript
const list = await ptero.application.users.list(1);
console.log(list.data);
```

### Detail User Spesifik
```typescript
const userDetail = await ptero.application.users.get(1);
console.log(userDetail.attributes.username);
```

### Cari User Berdasarkan Email
```typescript
const foundUser = await ptero.application.users.find("baru@akadev.me");
console.log(foundUser);
```

### Update Data User
```typescript
const updated = await ptero.application.users.update(1, {
  username: "user_diupdate",
  email: "update@akadev.me",
  first_name: "Nama",
  last_name: "Baru"
});
console.log(updated);
```

### Hapus User
```typescript
await ptero.application.users.delete(1);
```

---

## 3. Manajemen Lokasi & Node

Melihat lokasi wilayah dan mengelola node/alokasi port server Pterodactyl.

### List & Detail Lokasi
```typescript
const locations = await ptero.application.locations.list();
console.log(locations.data);

const location = await ptero.application.locations.get(1);
console.log(location);
```

### List & Detail Node
```typescript
const nodes = await ptero.application.nodes.list();
console.log(nodes.data);

const node = await ptero.application.nodes.get(1);
console.log(node.attributes.name);

const nodeConfig = await ptero.application.nodes.config(1);
console.log(nodeConfig);
```

### Manajemen Alokasi Port Node
```typescript
const allocations = await ptero.application.nodes.allocations.list(1);
console.log(allocations.data);

await ptero.application.nodes.allocations.create(1, {
  ip: "192.168.1.100",
  ports: ["25565", "25566"]
});

await ptero.application.nodes.allocations.delete(1, 100);
```

---

## 4. Manajemen Nest & Egg

Membaca struktur Nest (kategori) dan Egg (konfigurasi startup server).

### List & Detail Nest
```typescript
const nests = await ptero.application.nests.list();
console.log(nests.data);

const nest = await ptero.application.nests.get(5);
console.log(nest.attributes.name);

const nestByName = await ptero.application.nests.find("nodejs");
console.log(nestByName.id);
```

### List & Detail Egg
```typescript
const eggs = await ptero.application.nests.eggs.list(5);
console.log(eggs.data);

const egg = await ptero.application.nests.eggs.get(5, 15);
console.log(egg.attributes.name);

const eggByName = await ptero.application.nests.eggs.find(5, "Egg Bot Wa");
console.log(eggByName.id);
```

---

## 5. Manajemen Server (Administrasi & Deployment)

Mendeploy server baru secara otomatis, mengubah spesifikasi, pemilik, dan nest/egg.

### Smart Server Preview (Uji Payload Sebelum Deploy)
```typescript
const preview = await ptero.smart.servers.preview({
  name: "Server Uji Coba",
  description: "Server test deploy",
  email: "customer@akadev.me",
  autoCreateUser: true,
  nodeId: 1,
  nestId: 5,
  eggId: 15,
  preset: "mini"
});
console.log(preview.payload, preview.allocation);
```

### Deploy Server Baru
```typescript
const server = await ptero.smart.servers.create({
  name: "Server Game Akadev",
  description: "Dibuat otomatis oleh SDK",
  email: "customer@akadev.me",
  autoCreateUser: true,
  nodeId: 1,
  nestId: 5,
  eggId: 15,
  preset: "standard",
  startOnCompletion: true
});
console.log(server.id, server.identifier);
```

### Ambil Detail Lengkap Server Admin
```typescript
const details = await ptero.getServerDetails(18);
console.log(details.name, details.nodeName, details.userEmail);
```

### Update Spesifikasi / Limits Server
```typescript
await ptero.smart.servers.updateSpecs(18, {
  memory: "4GB",
  disk: "10GB",
  cpu: "200%",
  databases: 2,
  backups: 2,
  allocations: 1
});
```

### Pindahkan Kepemilikan Server
```typescript
await ptero.smart.servers.changeOwnership(18, {
  userId: 2
});
```

### Ubah Nest & Egg Server
```typescript
await ptero.smart.servers.changeNestEgg(18, {
  nestId: 5,
  eggId: 15,
  dockerImage: "ghcr.io/parkervcp/yolks:nodejs_22",
  startup: "npm start",
  environment: {
    CMD_RUN: "npm start"
  }
});
```

### Kontrol Status Server (Admin)
```typescript
await ptero.application.servers.suspend(18);
await ptero.application.servers.unsuspend(18);
await ptero.application.servers.reinstall(18);
```

### Hapus Server (Permanen & Paksa)
```typescript
await ptero.application.servers.delete(18, true);
```

### Operasi Batch (Multi Server)
```typescript
await ptero.batchServerOperation([18, 19, 20], "suspend");
await ptero.batchServerOperation([18, 19, 20], "unsuspend");
await ptero.batchServerOperation([18, 19, 20], "delete", { force: true });
```

---

## 6. Kontrol Client Server

Interaksi pengguna akhir dengan server (Client API).

```typescript
const server = ptero.server("ca7b58fd");
```

### Sinyal Power Server
```typescript
await server.power("start");
await server.power("stop");
await server.power("restart");
await server.power("kill");
```

### Kirim Perintah ke Konsol
```typescript
await server.command("say Halo Dunia!");
```

### Ambil Penggunaan Resource Live
```typescript
const res = await server.resources();
console.log(res.attributes.state, res.attributes.resources.cpu_absolute);
```

---

## 7. Pengelola File Server (Client File Manager)

Mengelola file dan direktori di dalam kontainer server game/bot.

### Tulis & Baca File
```typescript
await server.files.write("/index.js", "console.log('Akadev Gateway');");

const data = await server.files.read("/index.js");
console.log(data);
```

### List File & Folder
```typescript
const list = await server.files.list("/");
console.log(list.data);
```

### Buat Folder Baru
```typescript
await server.files.mkdir("/", "dist");
```

### Ganti Nama / Pindahkan File
```typescript
await server.files.rename("/", [
  { from: "index.js", to: "main.js" }
]);
```

### Kompres & Dekompres
```typescript
await server.files.compress("/", ["main.js", "dist"]);
await server.files.decompress("/", "main.js.tar.gz");
```

### Hapus File / Folder
```typescript
await server.files.delete("/", ["main.js", "dist", "main.js.tar.gz"]);
```

### Operasi File JSON Praktis
```typescript
await server.files.json.write("/config.json", { port: 3000, debug: false });

const config = await server.files.json.read("/config.json");
console.log(config);
```

### Dapatkan URL Download File
```typescript
const result = await server.files.download("/index.js");
console.log(result.attributes.url);
```

`files.read()` menolak respons HTML fallback dari panel agar halaman error atau login tidak terbaca sebagai isi file.

---

## 8. Pengelola Port & Jaringan Server

Mengelola alokasi alamat port pada server.

### List Port Terpilih
```typescript
const net = await server.network.list();
console.log(net.data);
```

### Alokasikan Port Tambahan
```typescript
await server.network.assign();
```

### Set Note / Catatan Port
```typescript
await server.network.setNote(21, "Port untuk bot whatsapp");
```

### Set Port Utama (Primary Allocation)
```typescript
await server.network.setPrimary(21);
```

### Hapus Alokasi Port Tambahan
```typescript
await server.network.delete(21);
```

---

## 9. Pengelola Database Server

Mengelola database MySQL server.

### List Database Server
```typescript
const dbs = await server.databases.list();
console.log(dbs.data);
```

### Buat Database Baru
```typescript
const db = await server.databases.create("game_db");
console.log(db.attributes.id, db.attributes.relationships.password);
```

### Ganti Password Database
```typescript
await server.databases.rotatePassword("db_id_xxx");
```

### Hapus Database
```typescript
await server.databases.delete("db_id_xxx");
```

---

## 10. Pengelola Backup Server

Membuat dan memulihkan file pencadangan.

### List Backup Server
```typescript
const backups = await server.backups.list();
console.log(backups.data);
```

### Buat Backup Baru (Dengan Auto-Filter Opsional)
```typescript
const backup = await server.backups.create("backup_clean", "node_modules\nvendor\ntmp");
console.log(backup.attributes.uuid);
```

### Detail Backup
```typescript
const backupDetail = await server.backups.get("backup_uuid_xxx");
console.log(backupDetail.attributes.bytes);
```

### Dapatkan Link Download Backup
```typescript
const downloadLink = await server.backups.download("backup_uuid_xxx");
console.log(downloadLink.attributes.url);
```

### Hapus Backup
```typescript
await server.backups.delete("backup_uuid_xxx");
```

---

## 11. WebSocket Real-time Stream

Mendengarkan event status server, log konsol, dan penggunaan memori/CPU secara real-time. Pada runtime Node.js, SDK otomatis mengirim header `Origin` panel agar kompatibel dengan Wings yang memvalidasi origin.

```typescript
const ws = server.websocket.create();

ws.onConsole((log) => {
  console.log("Console:", log);
});

ws.onStats((stats) => {
  console.log("RAM:", stats.memory_bytes, "CPU:", stats.cpu_absolute);
});

ws.onStatus((status) => {
  console.log("Status:", status);
});

await ws.connect();
```

---

## 12. Fluent Schedule Builder

Membuat jadwal tugas terjadwal (Cron Job) bawaan panel menggunakan struktur builder terantai.

```typescript
const schedule = server.createScheduleBuilder()
  .setName("Pembersihan Mingguan")
  .setCron("0 0 * * 0")
  .setOnlyWhenOnline(true)
  .addTask("command", "say Server membersihkan data cache...", 0, true)
  .addTask("command", "npm run clean", 10, false)
  .addTask("backup", "", 30, false);

await schedule.save();
```

---

## 13. SMTP Email & Auto Backup Exporter (.zip)

Mengirim email pemberitahuan ke pelanggan dan melakukan pencadangan zip otomatis secara eksternal. SMTP harus selalu diberikan secara eksplisit; SDK tidak membaca file `.env` panel dan memverifikasi sertifikat TLS secara default.

### Kirim Email Tertarget ke Pengguna
```typescript
const smtp = {
  host: "smtp.example.com",
  port: 587,
  username: "no-reply@example.com",
  password: process.env.SMTP_PASSWORD,
  fromAddress: "no-reply@example.com",
  fromName: "Akadev Panel"
};

await ptero.email.sendToUser(1, {
  smtp,
  subject: "Pengumuman Pembayaran Server",
  html: "<h2>Halo</h2><p>Server Anda akan segera jatuh tempo dalam 3 hari.</p>",
  attachments: [
    {
      filename: "invoice.pdf",
      path: "/tmp/invoice.pdf"
    }
  ]
});
```

### Kirim Email Broadcast Massal ke Seluruh Pengguna
```typescript
await ptero.email.broadcast({
  smtp,
  subject: "Pemeliharaan Node Server Indonesia",
  html: "<h3>Pemberitahuan Sistem</h3><p>Node ID 1 akan dimatikan sementara untuk pemeliharaan RAM.</p>"
});
```

### Auto Backup Exporter via Email (.zip)
Secara otomatis membuat backup di panel dengan menyaring folder-folder berat (`node_modules`, `vendor`, `cache`, `tmp`, `temp`, `.git`), mengunduh file hasil backup, mengompres ulangnya ke ekstensi `.zip`, mengirimkannya langsung ke email pemilik server, dan menghapus sisa file backup di panel.
```typescript
await ptero.exportAndEmailBackup(18, undefined, smtp);
```

### Backup Massal Pengguna
```typescript
await ptero.backupAndEmailUserServers(1, smtp);
```

---

## Keamanan & Penggunaan Terbuka
- Simpan kredensial Anda di environment variables (`PTERO_DOMAIN`, `PTERO_PTLA`, `PTERO_PTLC`).
- Gunakan `PteroGateway.fromEnv()` untuk pemanggilan otomatis dari konfigurasi environment variables.
- Logging SDK tidak aktif secara default. Aktifkan `debug: true` hanya saat diagnosis.
- Berikan konfigurasi SMTP secara eksplisit dan jangan menonaktifkan verifikasi TLS kecuali Anda memahami risikonya.

## Troubleshooting

| Kondisi | Tindakan |
|---|---|
| `UNEXPECTED_TEXT_RESPONSE` saat `files.read()` | Verifikasi path file, identifier server, dan Client API Key. Respons HTML panel sengaja ditolak agar tidak diperlakukan sebagai konten file. |
| `RATE_LIMITED` | SDK melakukan retry untuk status yang dapat dipulihkan. Kurangi paralelisme bila panel tetap membatasi request. |
| WebSocket gagal terkoneksi | Pastikan Wings dapat diakses dari runtime aplikasi. SDK Node.js mengirim Origin domain panel secara otomatis. |
| `SMTP_CONFIG_REQUIRED` | Sertakan `smtp` lengkap saat memakai email atau backup-email. |

---

Dibuat dengan ❤️ oleh [akaanakbaik](https://github.com/akaanakbaik)
