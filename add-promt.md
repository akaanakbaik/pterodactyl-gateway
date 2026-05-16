# Add Prompt Integrasi Akadev Pterodactyl Gateway

Gunakan dokumen ini sebagai prompt tambahan saat meminta AI mengintegrasikan package `@akaanakbaik/pterodactyl-gateway` ke project Node.js, bot, dashboard, atau backend API.

## Prompt siap pakai

Tolong integrasikan package `@akaanakbaik/pterodactyl-gateway` ke project saya dengan aman, rapi, dan mudah dipahami pemula.

Package ini adalah SDK TypeScript dan CLI untuk Pterodactyl Panel. Gunakan untuk koneksi panel, membuat user, membuat server, preview create server, dry-run, kontrol server, file manager, startup variables, backup, schedule, network/ports, lifecycle server, dan raw request.

Gunakan env berikut:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=isi_application_api_key
PTERO_PTLC=isi_client_api_key
```

Jangan hardcode API key atau password di source code.

## Install

```bash
npm i @akaanakbaik/pterodactyl-gateway
```

Untuk CLI global:

```bash
npm i -g @akaanakbaik/pterodactyl-gateway
ptero-gateway help
ptg help
```

## Cara koneksi

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

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

## Fitur utama SDK

- `ptero.connect()` untuk cek koneksi.
- `ptero.doctor()` untuk diagnosa konfigurasi.
- `ptero.users.createSmart()` untuk membuat user.
- `ptero.users.getOrCreate()` untuk mengambil user atau membuat jika belum ada.
- `ptero.servers.previewCreate()` untuk melihat payload final sebelum create server.
- `ptero.servers.createSmart()` untuk create server dengan auto docker image, startup, environment, default allocation, dan additional allocation.
- `ptero.servers.createFromPreset()` untuk create server dari preset spek.
- `ptero.server(identifier).probe()` untuk cek endpoint client secara read-only.
- `ptero.server(identifier).resources()` untuk resource server.
- `ptero.server(identifier).start()`, `stop()`, `restart()`, `kill()` untuk power control.
- `ptero.server(identifier).command("npm start")` untuk kirim command.
- `ptero.server(identifier).files.*` untuk file manager.
- `ptero.server(identifier).startup.*` untuk startup variables.
- `ptero.server(identifier).network.*` untuk allocation/ports.
- `ptero.server(identifier).databases.*` untuk database manager.
- `ptero.server(identifier).backups.*` untuk backup manager.
- `ptero.server(identifier).schedules.*` untuk schedule manager.
- `ptero.raw.application` dan `ptero.raw.client` untuk endpoint yang belum tersedia wrapper.

## Fitur CLI penting

```bash
ptero-gateway doctor
ptero-gateway connect
ptero-gateway ids
ptero-gateway ids --nest 5
ptero-gateway admin users
ptero-gateway admin servers
ptero-gateway servers
```

Create server dry-run:

```bash
ptero-gateway admin create-server \
  --name "aka test" \
  --email "user@example.com" \
  --username "aka_test" \
  --password "password aman" \
  --node 1 \
  --nest 5 \
  --egg 18 \
  --memory 1GB \
  --disk 2GB \
  --cpu 100% \
  --databases 0 \
  --allocations 1 \
  --backups 0 \
  --dry-run
```

Create server asli:

```bash
ptero-gateway admin create-server \
  --name "aka test" \
  --email "user@example.com" \
  --username "aka_test" \
  --password "password aman" \
  --node 1 \
  --nest 5 \
  --egg 18 \
  --memory 1GB \
  --disk 2GB \
  --cpu 100% \
  --databases 0 \
  --allocations 1 \
  --backups 0 \
  --yes
```

Kontrol server:

```bash
ptero-gateway probe 311d56b7
ptero-gateway server 311d56b7 summary
ptero-gateway server 311d56b7 resources
ptero-gateway server 311d56b7 files /
ptero-gateway server 311d56b7 env
ptero-gateway server 311d56b7 ports
ptero-gateway server 311d56b7 start --yes
ptero-gateway server 311d56b7 stop --yes
```

Template Node alive:

```bash
ptero-gateway server 311d56b7 stop --yes
ptero-gateway server 311d56b7 init-node-alive --yes
ptero-gateway server 311d56b7 start --yes
```

## Create user

```ts
const user = await ptero.users.createSmart({
  username: "aka_test",
  email: "user@example.com",
  password: "auto",
  administrator: "no"
});
```

Jika `password` diisi `auto`, package membuat password aman dan mengembalikannya sekali pada response.

## Create server minimal

```ts
const server = await ptero.servers.createSmart({
  name: "Bot WhatsApp Aka",
  email: "user@example.com",
  username: "aka_test",
  password: "password aman",
  autoCreateUser: true,
  description: "Server bot WhatsApp untuk Aka",
  nodeId: 1,
  nestId: 5,
  eggId: 18,
  specs: {
    memory: "1GB",
    disk: "2GB",
    cpu: "100%",
    databases: 0,
    allocations: 1,
    backups: 0
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

## Preview dan dry-run

```ts
const preview = await ptero.servers.previewCreate(input);
console.log(preview.payload);
```

```ts
const result = await ptero.servers.createSmart(input, { dryRun: true });
console.log(result.payload);
```

## Error handling

```ts
import { explainError } from "@akaanakbaik/pterodactyl-gateway";

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
- Jika ID node, nest, atau egg salah, arahkan user untuk cek `ptero-gateway ids` atau Admin Panel Pterodactyl.
- Jika allocation kosong, arahkan user menambah allocation di Admin Panel > Nodes > Allocations.
- Semua aksi yang mengubah server via CLI wajib memakai `--yes`.
- Write file via CLI default hanya boleh ke `/tmp`; untuk path lain wajib `--allow-any-path`.
- Jangan menjalankan command berisiko tanpa izin jelas dari user.
- Delete server/user permanen belum dibuka di v0.3.0 dan perlu guard tambahan.
