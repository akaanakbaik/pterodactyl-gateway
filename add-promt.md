# Add Prompt Integrasi Akadev Pterodactyl Gateway

Gunakan dokumen ini sebagai prompt tambahan saat meminta AI, coding agent, atau assistant developer mengintegrasikan package `@akaanakbaik/pterodactyl-gateway` ke project Node.js, TypeScript, bot, dashboard, website, atau backend API.

Tujuan prompt ini adalah menghasilkan integrasi yang aman, rapi, mudah dirawat, dan siap production.

## Prompt utama siap pakai

Tolong integrasikan package `@akaanakbaik/pterodactyl-gateway` versi `1.0.0` ke project saya dengan standar production.

Package ini adalah SDK TypeScript dan CLI untuk Pterodactyl Panel. Gunakan package ini untuk:

- cek koneksi panel;
- diagnosa konfigurasi;
- membuat user panel;
- membuat server panel;
- preview/dry-run payload create server;
- mengelola file server;
- mengubah startup variables;
- melihat resource server;
- mengelola backup;
- mengelola schedule;
- mengirim power signal;
- mengirim command aman;
- membuat integrasi bot WhatsApp, Telegram, Discord, API, dan website.

Gunakan env berikut dan jangan hardcode rahasia di source code:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=isi_application_api_key
PTERO_PTLC=isi_client_api_key
PTERO_NODE_ID=1
PTERO_NEST_ID=5
PTERO_EGG_ID=18
```

Wajib gunakan error handling dengan `explainError()` agar error mudah dipahami user.

## Prinsip integrasi

- Semua rahasia wajib dari `.env` atau secret manager.
- Jangan log PTLA, PTLC, password, token bot, atau config profile.
- Semua create server wajib punya mode preview/dry-run sebelum eksekusi asli.
- Semua endpoint pembayaran/order wajib idempotent agar tidak membuat server dobel.
- Simpan `server.id`, `server.identifier`, `server.uuid`, `email`, `username`, dan status order ke database.
- Jangan menjalankan create server langsung dari frontend tanpa backend auth.
- Jangan membuka fitur delete user/server permanen tanpa guard tambahan.
- Jangan menambahkan kontrol node, location, atau allocation management di UI publik.
- Validasi input user: email, username, package/preset, dan nama server.
- Batasi akses fitur admin hanya untuk owner/admin.
- Gunakan queue untuk order massal.

## Install

```bash
npm i @akaanakbaik/pterodactyl-gateway
```

CLI global opsional:

```bash
npm i -g @akaanakbaik/pterodactyl-gateway
ptero-gateway doctor
ptero-gateway ids
ptero-gateway presets
ptero-gateway templates list
```

## Import utama

```ts
import {
  createPtero,
  createIntegrationServerInput,
  createIntegrationService,
  explainError
} from "@akaanakbaik/pterodactyl-gateway";
```

## Koneksi SDK

```ts
const ptero = createPtero({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});

await ptero.doctor();
```

Atau jika env sudah pasti lengkap:

```ts
const ptero = createPtero.fromEnv();
```

## Helper integrasi yang disarankan

Pakai `createIntegrationService()` untuk bot dan website agar input server lebih konsisten.

```ts
const pterodactyl = createIntegrationService({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
}, {
  nodeId: Number(process.env.PTERO_NODE_ID),
  nestId: Number(process.env.PTERO_NEST_ID),
  eggId: Number(process.env.PTERO_EGG_ID),
  preset: "standard",
  autoCreateUser: true,
  startOnCompletion: false
});
```

Jenis integrasi yang tersedia:

```ts
"whatsapp-bot" | "telegram-bot" | "discord-bot" | "nodejs-api" | "website" | "python-bot" | "blank"
```

## Flow create panel yang benar

1. Validasi user/order.
2. Cek pembayaran atau izin admin.
3. Bangun payload dengan integration helper.
4. Jalankan `dryRun` untuk debug saat development.
5. Eksekusi `create` hanya setelah order valid.
6. Simpan hasil server ke database.
7. Kirim pesan ke user tanpa membocorkan API key.

Contoh service reusable:

```ts
import { createIntegrationService, explainError } from "@akaanakbaik/pterodactyl-gateway";

export const pterodactyl = createIntegrationService({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
}, {
  nodeId: Number(process.env.PTERO_NODE_ID),
  nestId: Number(process.env.PTERO_NEST_ID),
  eggId: Number(process.env.PTERO_EGG_ID),
  preset: "standard",
  autoCreateUser: true
});

export async function createPanelForOrder(order) {
  try {
    const result = await pterodactyl.create({
      kind: order.kind,
      name: order.serverName,
      email: order.email,
      username: order.username,
      password: "auto",
      environment: order.environment ?? {}
    });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
```

## Integrasi bot WhatsApp

Gunakan untuk bot Baileys, store panel via WhatsApp, atau automation order.

```ts
const result = await pterodactyl.create({
  kind: "whatsapp-bot",
  name: `wa-${user.id}`,
  email: user.email,
  username: `wa_${user.id}`,
  password: "auto",
  environment: {
    OWNER_NUMBER: user.phone,
    BOT_NAME: "AkaBot"
  }
});
```

Instruksi untuk AI:

- Buat handler command/menu yang hanya bisa dipakai admin atau user yang sudah membayar.
- Tambahkan status proses: validating, dry-run, creating user, creating server, completed, failed.
- Simpan hasil server ke database.
- Jangan tampilkan token bot, API key, atau password di grup publik.
- Session WhatsApp harus disimpan di volume/server file, bukan memory sementara.

## Integrasi bot Telegram

```ts
const result = await pterodactyl.create({
  kind: "telegram-bot",
  name: `tg-${ctx.from.id}`,
  email: `${ctx.from.id}@telegram.local`,
  username: `tg_${ctx.from.id}`,
  password: "auto"
});
```

Instruksi untuk AI:

- Gunakan Telegram ID sebagai identifier utama, bukan username.
- Gunakan inline keyboard untuk konfirmasi paket.
- Wajib cek transaksi sebelum create server.
- Tambahkan rate limit per Telegram ID.
- Kirim hasil lewat private chat jika berisi data sensitif.

## Integrasi bot Discord

```ts
const result = await pterodactyl.create({
  kind: "discord-bot",
  name: `dc-${interaction.user.id}`,
  email: `${interaction.user.id}@discord.local`,
  username: `dc_${interaction.user.id}`,
  password: "auto"
});
```

Instruksi untuk AI:

- Gunakan ephemeral reply untuk data akun.
- Batasi command berdasarkan role.
- Jangan kirim credential di channel publik.
- Log audit ke channel admin tanpa password/API key.

## Integrasi website atau REST API

Pola aman untuk Express/Fastify/Next API:

```ts
app.post("/api/panel/preview", async (req, res) => {
  const result = await pterodactyl.dryRun({
    kind: "website",
    name: req.body.name,
    email: req.body.email,
    username: req.body.username,
    password: "auto"
  });
  res.json(result);
});

app.post("/api/panel/create", async (req, res) => {
  try {
    const result = await pterodactyl.create({
      kind: "website",
      name: req.body.name,
      email: req.body.email,
      username: req.body.username,
      password: "auto"
    });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: explainError(error) });
  }
});
```

Instruksi untuk AI:

- Tambahkan middleware auth admin atau payment verification.
- Tambahkan schema validation.
- Tambahkan rate limit.
- Tambahkan idempotency key agar refresh tidak membuat server baru.
- Jangan expose PTLA/PTLC ke frontend.

## Create user manual

```ts
const user = await ptero.users.createSmart({
  username: "aka_test",
  email: "user@example.com",
  password: "auto",
  administrator: "no"
});
```

Jika `password` diisi `auto`, package membuat password dan mengembalikannya sekali pada response. Simpan dengan aman atau minta user reset password.

## Create server manual

```ts
const server = await ptero.servers.createSmart({
  name: "Bot WhatsApp Aka",
  email: "user@example.com",
  username: "aka_test",
  password: "auto",
  autoCreateUser: true,
  description: "Server bot WhatsApp",
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

## Preview dan dry-run

```ts
const preview = await ptero.servers.previewCreate(input);
console.log(preview.payload);

const dryRun = await ptero.servers.createSmart(input, { dryRun: true });
console.log(dryRun.payload);
```

## Kontrol server

```ts
const server = ptero.server("311d56b7");

await server.resources();
await server.files.list("/");
await server.files.read("/package.json");
await server.files.write("/tmp/test.txt", "halo");
await server.startup.variables();
await server.startup.set("CMD_RUN", "node index.js");
await server.backups.list();
await server.start();
await server.stop();
```

## Error handling wajib

```ts
import { explainError } from "@akaanakbaik/pterodactyl-gateway";

try {
  await pterodactyl.create(input);
} catch (error) {
  console.error(explainError(error));
}
```

## CLI penting saat debugging

```bash
ptero-gateway version
ptero-gateway self-check
ptero-gateway release-check
ptero-gateway doctor
ptero-gateway ids
ptero-gateway ids --nest 5
ptero-gateway presets
ptero-gateway templates list
ptero-gateway explain DOMAIN_REQUIRED
ptero-gateway explain DOCKER_IMAGE_NOT_FOUND
```

## Checklist output AI yang diharapkan

Saat AI mengintegrasikan package ini, pastikan output akhirnya memiliki:

- file `.env.example` tanpa secret asli;
- service wrapper `pterodactyl.ts` atau `pterodactyl.js`;
- validasi input;
- dry-run endpoint/command;
- create endpoint/command dengan auth;
- error handling `explainError()`;
- audit log order;
- dokumentasi cara isi env;
- tidak ada PTLA/PTLC hardcoded;
- tidak ada command node/location/allocation management publik;
- tidak ada delete user/server permanen tanpa guard.

## Catatan versi

Gunakan versi utama `1.0.0` atau `latest`.

```bash
npm i @akaanakbaik/pterodactyl-gateway@1.0.0
```

Jika menemukan dokumentasi lama yang menyebut versi sebelum `1.0.0`, arahkan ke README terbaru dan gunakan `latest`.
