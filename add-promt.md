# Add Prompt Integrasi Akadev Pterodactyl Gateway

Gunakan dokumen ini sebagai prompt tambahan saat meminta AI mengintegrasikan package `@akadev/pterodactyl-gateway` ke project Node.js, bot, dashboard, atau backend API.

## Prompt siap pakai

Tolong integrasikan package `@akadev/pterodactyl-gateway` ke project saya dengan aman, rapi, dan mudah dipahami pemula.

Package ini adalah SDK TypeScript untuk Pterodactyl Panel. Gunakan untuk koneksi panel, membuat user, membuat server, preview create server, dry run, kontrol server, dan raw request.

Gunakan env berikut:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=isi_application_api_key
PTERO_PTLC=isi_client_api_key
```

Jangan hardcode API key atau password di source code.

## Cara koneksi

```ts
import { createPtero } from "@akadev/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
await ptero.connect();
```

Atau:

```ts
const ptero = createPtero({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});
```

## Fitur utama

- `ptero.connect()` untuk cek koneksi.
- `ptero.doctor()` untuk diagnosa konfigurasi.
- `ptero.users.createSmart()` untuk membuat user.
- `ptero.users.getOrCreate()` untuk mengambil user atau membuat jika belum ada.
- `ptero.servers.previewCreate()` untuk melihat payload final sebelum create server.
- `ptero.servers.createSmart()` untuk create server dengan auto docker image, startup, environment, default allocation, dan additional allocation.
- `ptero.servers.createFromPreset()` untuk create server dari preset spek.
- `ptero.server(identifier).start()` untuk start server.
- `ptero.server(identifier).stop()` untuk stop server.
- `ptero.server(identifier).restart()` untuk restart server.
- `ptero.server(identifier).kill()` untuk kill server.
- `ptero.server(identifier).command("npm start")` untuk kirim command.
- `ptero.server(identifier).resources()` untuk mengambil resource server.
- `ptero.raw.application` dan `ptero.raw.client` untuk endpoint yang belum tersedia wrapper.

## Create user

```ts
const user = await ptero.users.createSmart({
  username: "aka",
  email: "aka@example.com",
  password: "auto",
  administrator: "no"
});
```

Jika `password` diisi `auto`, package membuat password aman dan mengembalikannya sekali pada response.

## Create server minimal

```ts
const server = await ptero.servers.createSmart({
  name: "Bot WhatsApp Aka",
  email: "aka@example.com",
  description: "Server bot WhatsApp untuk Aka",
  nodeId: 1,
  nestId: 5,
  eggId: 15,
  specs: {
    memory: "2GB",
    disk: "5GB",
    cpu: "100%",
    databases: 1,
    allocations: 1,
    backups: 1
  }
});
```

## Field wajib create server

- `name`
- `email` atau `userId`
- `description`
- `nodeId`
- `nestId`
- `eggId`
- `specs.memory`
- `specs.disk`
- `specs.cpu`
- `specs.databases`
- `specs.allocations`
- `specs.backups`

## Field otomatis create server

- docker image dari egg
- startup command dari egg
- environment variables dari egg
- default allocation dari node
- additional allocations sesuai allocation limit
- swap default `0`
- block IO default `500`
- CPU pinning default kosong
- OOM disabled default `false`
- start on completion default `true`

## Preview dan dry run

```ts
const preview = await ptero.servers.previewCreate(input);
console.log(preview.payload);
```

```ts
const result = await ptero.servers.createSmart(input, { dryRun: true });
console.log(result.payload);
```

## Preset paket

```ts
const ptero = createPtero({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC,
  presets: {
    basic: {
      memory: "2GB",
      disk: "5GB",
      cpu: "100%",
      databases: 1,
      allocations: 1,
      backups: 1
    }
  }
});

await ptero.servers.createFromPreset("basic", {
  name: "Bot Aka",
  email: "aka@example.com",
  description: "Paket Basic",
  nodeId: 1,
  nestId: 5,
  eggId: 15
});
```

## Error handling

```ts
import { explainError } from "@akadev/pterodactyl-gateway";

try {
  await ptero.servers.createSmart(input);
} catch (error) {
  console.error(explainError(error));
}
```

## Raw request

```ts
await ptero.raw.application.get("/users");
await ptero.raw.application.post("/servers", payload);
await ptero.raw.client.get("/servers/abc123/resources");
await ptero.raw.client.post("/servers/abc123/command", {
  command: "npm start"
});
```

## Aturan integrasi

- Simpan config rahasia di `.env`.
- Jangan log API key atau password.
- Gunakan `previewCreate()` atau `dryRun` sebelum create server final.
- Gunakan `explainError()` untuk pesan error yang mudah dipahami.
- Create server wajib memakai `nodeId`, `nestId`, dan `eggId` berupa angka.
- Jika ID node, nest, atau egg salah, arahkan user untuk cek di Admin Panel Pterodactyl.
- Jika allocation kosong, arahkan user menambah allocation di Admin Panel > Nodes > Allocations.
- Jangan jalankan command berisiko tanpa izin jelas dari user.
