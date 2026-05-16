# Akadev Pterodactyl Gateway

<p align="center">
  <b>SDK TypeScript + CLI modern untuk mengelola Pterodactyl Panel dari bot, dashboard, backend, dan terminal.</b>
</p>

<p align="center">
  <code>@akaanakbaik/pterodactyl-gateway</code> · <code>v1.0.0</code> · <code>Node.js &gt;=18</code> · <code>MIT</code>
</p>

Akadev Pterodactyl Gateway membantu kamu menghubungkan aplikasi Node.js ke Pterodactyl Panel dengan flow yang lebih aman dan cepat: cek koneksi, membuat user, membuat server, dry-run payload, mengelola file, startup variables, backup, schedule, power action, sampai CLI admin yang mudah dipakai.

> Package ini bukan package resmi dari Pterodactyl dan tidak berafiliasi dengan Pterodactyl Software.

## Navigasi

- [Fitur utama](#fitur-utama)
- [Install](#install)
- [Quick start](#quick-start)
- [Konfigurasi API key](#konfigurasi-api-key)
- [Config profile lokal](#config-profile-lokal)
- [CLI reference](#cli-reference)
- [Preset dan template](#preset-dan-template)
- [Wizard interaktif](#wizard-interaktif)
- [SDK usage](#sdk-usage)
- [Integration helpers](#integration-helpers)
- [Contoh integrasi bot WhatsApp](#contoh-integrasi-bot-whatsapp)
- [Contoh integrasi bot Telegram](#contoh-integrasi-bot-telegram)
- [Contoh integrasi bot Discord](#contoh-integrasi-bot-discord)
- [Contoh integrasi website atau API](#contoh-integrasi-website-atau-api)
- [Tips produksi](#tips-produksi)
- [Keamanan](#keamanan)
- [Troubleshooting](#troubleshooting)
- [Release dan testing](#release-dan-testing)

## Fitur utama

- SDK TypeScript untuk Application API dan Client API Pterodactyl.
- CLI global: `ptero-gateway`, alias singkat `ptg`, dan wizard `ptero-wizard`.
- Config profile lokal agar tidak perlu export env berulang-ulang.
- Smart user creation dengan password otomatis.
- Smart server creation dengan dry-run, preset, auto docker image, auto startup, environment, dan allocation.
- Helper integrasi untuk WhatsApp bot, Telegram bot, Discord bot, Node.js API, website, Python bot, dan blank server.
- File manager, JSON helper, startup variables, network/ports, databases, backups, schedules, probe, resources, dan power action.
- Guard keamanan untuk aksi tulis via CLI dan command berbahaya.
- Release guard, self-check, release-check, dan pack dry-run untuk menjaga package tetap stabil.

## Install

Install sebagai dependency project:

```bash
npm i @akaanakbaik/pterodactyl-gateway
```

Install global CLI:

```bash
npm i -g @akaanakbaik/pterodactyl-gateway
```

Cek instalasi:

```bash
ptero-gateway version
ptero-gateway self-check
ptero-gateway release-check
```

## Quick start

```bash
ptero-gateway config init \
  --profile main \
  --domain https://panel.example.com \
  --ptla ptla_xxx \
  --ptlc ptlc_xxx

ptero-gateway doctor
ptero-gateway servers
ptero-gateway admin users
ptero-gateway admin servers
```

SDK minimal:

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
const doctor = await ptero.doctor();
console.log(doctor);
```

## Konfigurasi API key

Gunakan environment variable untuk deployment:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=ptla_xxxxxxxxxxxxxxxxx
PTERO_PTLC=ptlc_xxxxxxxxxxxxxxxxx
```

| Env | Fungsi |
|---|---|
| `PTERO_DOMAIN` | Domain panel Pterodactyl. |
| `PTERO_PTLA` | Application API Key untuk aksi admin seperti user, server, suspend, limits. |
| `PTERO_PTLC` | Client API Key untuk kontrol server, file manager, backups, schedules, resources. |

Tips:

- Pakai PTLA hanya di backend/admin service.
- Pakai PTLC untuk aksi client server yang memang diperlukan.
- Jangan pernah hardcode key ke source code, repo, atau pesan bot.
- Pisahkan key production dan development.

## Config profile lokal

Config profile memudahkan penggunaan CLI di VPS pribadi.

```bash
ptero-gateway config init \
  --profile main \
  --domain https://panel.example.com \
  --ptla ptla_xxx \
  --ptlc ptlc_xxx
```

File config disimpan di:

```txt
~/.pterodactyl-gateway/config.json
```

Command config:

```bash
ptero-gateway config path
ptero-gateway config list
ptero-gateway config show main
ptero-gateway config use main
ptero-gateway config rename main production
ptero-gateway config delete production --yes
ptero-gateway config env main
ptero-gateway config doctor
```

Catatan:

- File config mengandung API key, jangan upload atau screenshot penuh.
- Permission file otomatis dibuat `600` jika filesystem mendukung.
- CLI akan memakai active profile jika env belum tersedia.

## CLI reference

Health dan info:

```bash
ptero-gateway help
ptero-gateway version
ptero-gateway self-check
ptero-gateway release-check
ptero-gateway doctor
ptero-gateway connect
ptero-gateway ids
ptero-gateway ids --nest 5
```

Admin list:

```bash
ptero-gateway admin users
ptero-gateway admin servers
```

Client list:

```bash
ptero-gateway servers
```

Create user:

```bash
ptero-gateway admin create-user \
  --username aka_test \
  --email user@example.com \
  --password "password aman" \
  --yes
```

Create server dengan dry-run:

```bash
ptero-gateway admin create-server \
  --name "aka test" \
  --email "user@example.com" \
  --username "aka_test" \
  --password "password aman" \
  --node 1 \
  --nest 5 \
  --egg 18 \
  --preset basic \
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
  --preset basic \
  --yes
```

Admin server:

```bash
ptero-gateway admin server 5 detail
ptero-gateway admin server 5 limits
ptero-gateway admin server 5 update-limits --backups 1 --yes
ptero-gateway admin server 5 suspend --yes
ptero-gateway admin server 5 unsuspend --yes
ptero-gateway admin server 5 reinstall --yes
```

Client server:

```bash
ptero-gateway probe 311d56b7
ptero-gateway server 311d56b7 summary
ptero-gateway server 311d56b7 resources
ptero-gateway server 311d56b7 files /
ptero-gateway server 311d56b7 read /package.json
ptero-gateway server 311d56b7 env
ptero-gateway server 311d56b7 ports
ptero-gateway server 311d56b7 databases
ptero-gateway server 311d56b7 backups
ptero-gateway server 311d56b7 schedules
```

Write file:

```bash
ptero-gateway server 311d56b7 write /tmp/test.txt "halo" --yes
ptero-gateway server 311d56b7 write /index.js "console.log('halo')" --yes --allow-any-path
```

Power action:

```bash
ptero-gateway server 311d56b7 start --yes
ptero-gateway server 311d56b7 stop --yes
ptero-gateway server 311d56b7 restart --yes
ptero-gateway server 311d56b7 kill --yes
ptero-gateway server 311d56b7 command "npm start" --yes
```

## Preset dan template

Lihat preset resource:

```bash
ptero-gateway presets
```

| Preset | Memory | Disk | CPU | Database | Allocation | Backup | Cocok untuk |
|---|---:|---:|---:|---:|---:|---:|---|
| `mini` | 512MB | 1GB | 50% | 0 | 1 | 0 | Testing dan bot kecil. |
| `basic` | 1GB | 2GB | 100% | 0 | 1 | 0 | Bot Telegram/Discord sederhana. |
| `standard` | 2GB | 5GB | 200% | 1 | 1 | 1 | Bot WhatsApp, API, website kecil. |
| `premium` | 4GB | 10GB | 300% | 2 | 2 | 2 | Project lebih aktif. |
| `unlimited` | 0 | 0 | 0 | 5 | 3 | 3 | Resource unlimited sesuai aturan panel. |

Lihat template:

```bash
ptero-gateway templates list
ptero-gateway templates show nodejs-bot
ptero-gateway templates command nodejs-bot --name "bot saya" --email user@example.com --node 1 --nest 5 --egg 18
```

Template bawaan:

- `nodejs-bot`
- `nodejs-api`
- `wa-bot`
- `python-bot`
- `blank`

## Wizard interaktif

```bash
ptero-wizard help
ptero-wizard create-user --dry-run
ptero-wizard create-server --dry-run
ptero-wizard create-server --yes
```

Wizard tidak mengelola node, location, atau allocation. Node ID, Nest ID, dan Egg ID tetap harus dipilih oleh admin.

## SDK usage

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});

await ptero.connect();
```

Create user:

```ts
const user = await ptero.users.createSmart({
  username: "aka_test",
  email: "user@example.com",
  password: "auto",
  administrator: "no"
});
```

Create server:

```ts
const server = await ptero.servers.createSmart({
  name: "Bot Aka",
  email: "user@example.com",
  username: "aka_test",
  password: "auto",
  autoCreateUser: true,
  description: "Server bot untuk user",
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

Preview dan dry-run:

```ts
const preview = await ptero.servers.previewCreate(input);
const dryRun = await ptero.servers.createSmart(input, { dryRun: true });
console.log(preview.payload, dryRun.payload);
```

Client server:

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
```

Raw request:

```ts
await ptero.raw.application.get("/users");
await ptero.raw.client.get("/servers/311d56b7/resources");
```

## Integration helpers

Helper integrasi membuat input server lebih konsisten untuk bot dan website.

```ts
import { createIntegrationServerInput } from "@akaanakbaik/pterodactyl-gateway";

const input = createIntegrationServerInput({
  kind: "whatsapp-bot",
  name: "WA Bot Aka",
  email: "user@example.com",
  username: "aka_wa",
  password: "auto",
  autoCreateUser: true,
  nodeId: 1,
  nestId: 5,
  eggId: 18,
  environment: {
    OWNER: "aka"
  }
});
```

Service helper:

```ts
import { createIntegrationService } from "@akaanakbaik/pterodactyl-gateway";

const service = createIntegrationService({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
}, {
  nodeId: 1,
  nestId: 5,
  eggId: 18,
  preset: "standard",
  autoCreateUser: true
});

const dryRun = await service.dryRun({
  kind: "telegram-bot",
  name: "Telegram Bot User",
  email: "user@example.com",
  username: "user_tg",
  password: "auto"
});
```

Kind yang tersedia:

```ts
"whatsapp-bot" | "telegram-bot" | "discord-bot" | "nodejs-api" | "website" | "python-bot" | "blank"
```

## Contoh integrasi bot WhatsApp

Contoh flow untuk bot store panel WhatsApp:

```ts
import { createIntegrationService, explainError } from "@akaanakbaik/pterodactyl-gateway";

const pterodactyl = createIntegrationService({
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

export async function createWaBotPanel(order) {
  try {
    const result = await pterodactyl.create({
      kind: "whatsapp-bot",
      name: `wa-${order.username}`,
      email: order.email,
      username: order.username,
      password: "auto",
      environment: {
        OWNER_NUMBER: order.ownerNumber,
        BOT_NAME: order.botName
      }
    });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: explainError(error) };
  }
}
```

Saran untuk bot WhatsApp:

- Simpan session WhatsApp di volume server, bukan di memory.
- Jangan kirim password panel ke grup publik.
- Gunakan queue agar create server tidak bentrok saat order ramai.
- Selalu dry-run payload untuk paket baru sebelum digunakan production.

## Contoh integrasi bot Telegram

Contoh handler command Telegram:

```ts
import { Bot } from "grammy";
import { createIntegrationService, explainError } from "@akaanakbaik/pterodactyl-gateway";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const pterodactyl = createIntegrationService({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
}, {
  nodeId: Number(process.env.PTERO_NODE_ID),
  nestId: Number(process.env.PTERO_NEST_ID),
  eggId: Number(process.env.PTERO_EGG_ID),
  preset: "basic",
  autoCreateUser: true
});

bot.command("createpanel", async ctx => {
  try {
    const email = `${ctx.from.id}@telegram.local`;
    const result = await pterodactyl.create({
      kind: "telegram-bot",
      name: `tg-${ctx.from.id}`,
      email,
      username: `tg_${ctx.from.id}`,
      password: "auto"
    });
    await ctx.reply(`Panel berhasil dibuat: ${result.identifier ?? result.id}`);
  } catch (error) {
    await ctx.reply(explainError(error));
  }
});

bot.start();
```

Saran untuk bot Telegram:

- Batasi command create panel hanya untuk admin atau user yang sudah bayar.
- Simpan riwayat transaksi di database sendiri.
- Gunakan `dryRun` saat testing paket baru.
- Pakai `ctx.from.id` sebagai referensi unik, bukan username Telegram yang bisa berubah.

## Contoh integrasi bot Discord

```ts
import { Client, GatewayIntentBits } from "discord.js";
import { createIntegrationService, explainError } from "@akaanakbaik/pterodactyl-gateway";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const pterodactyl = createIntegrationService({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
}, {
  nodeId: Number(process.env.PTERO_NODE_ID),
  nestId: Number(process.env.PTERO_NEST_ID),
  eggId: Number(process.env.PTERO_EGG_ID),
  preset: "basic",
  autoCreateUser: true
});

async function createDiscordPanel(interaction) {
  try {
    const result = await pterodactyl.create({
      kind: "discord-bot",
      name: `dc-${interaction.user.id}`,
      email: `${interaction.user.id}@discord.local`,
      username: `dc_${interaction.user.id}`,
      password: "auto"
    });
    await interaction.reply({ content: `Server dibuat: ${result.identifier ?? result.id}`, ephemeral: true });
  } catch (error) {
    await interaction.reply({ content: explainError(error), ephemeral: true });
  }
}

client.login(process.env.DISCORD_TOKEN);
```

Saran untuk bot Discord:

- Gunakan ephemeral reply untuk data sensitif.
- Jangan menampilkan password/API key di channel publik.
- Batasi role yang boleh create server.

## Contoh integrasi website atau API

Contoh Express API:

```ts
import express from "express";
import { createIntegrationService, explainError } from "@akaanakbaik/pterodactyl-gateway";

const app = express();
app.use(express.json());

const pterodactyl = createIntegrationService({
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

app.post("/api/panel/preview", async (req, res) => {
  const preview = await pterodactyl.dryRun({
    kind: "website",
    name: req.body.name,
    email: req.body.email,
    username: req.body.username,
    password: "auto"
  });
  res.json(preview);
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

app.listen(3000);
```

Saran untuk website:

- Endpoint create panel wajib dilindungi auth admin atau status pembayaran.
- Jangan menjalankan create server langsung dari frontend.
- Simpan audit log order, Telegram ID/Discord ID/user ID, email, server ID, dan identifier.
- Gunakan rate limit per user/IP.

## Tips produksi

- Jalankan `ptero-gateway doctor` setelah deploy.
- Jalankan `ptero-gateway ids --nest <id>` untuk memastikan egg yang dipakai benar.
- Gunakan `dryRun` untuk semua paket baru.
- Pisahkan preset produk: mini/basic/standard/premium.
- Buat queue job untuk create server agar transaksi tidak race condition.
- Simpan hasil `identifier`, `uuid`, `id`, dan password yang generated hanya sekali.
- Untuk server bot, start manual setelah file source siap agar status tidak gagal.

## Keamanan

- Jangan hardcode PTLA/PTLC.
- Jangan kirim API key atau config profile ke user.
- Jangan log password generated ke public log.
- Semua aksi tulis/ubah via CLI wajib `--yes`.
- Write file CLI default hanya boleh ke `/tmp`; path lain wajib `--allow-any-path`.
- Command berbahaya seperti `rm -rf /` diblokir oleh guard command.
- Delete user/server permanen tidak dibuka di CLI stabil.
- Command node/location/allocation management tidak dibuka di CLI stabil.

## Troubleshooting

Lihat daftar error:

```bash
ptero-gateway explain DOMAIN_REQUIRED
ptero-gateway explain DOCKER_IMAGE_NOT_FOUND
ptero-gateway explain STARTUP_VARIABLE_NOT_FOUND
ptero-gateway explain EEXIST
```

Masalah umum:

| Masalah | Solusi |
|---|---|
| `DOMAIN_REQUIRED` | Isi `PTERO_DOMAIN` atau jalankan `ptero-gateway config init`. |
| PTLA tidak valid | Buat ulang Application API Key dan pastikan permission cukup. |
| PTLC tidak valid | Buat ulang Client API Key dari account panel. |
| Docker image tidak ditemukan | Cek egg Docker Images atau isi `--docker-image`. |
| Tidak ada allocation kosong | Tambahkan allocation di panel admin node. |
| Backup gagal limit 0 | Naikkan limit backup server dulu. |
| Binary global konflik | Hapus `/usr/bin/ptero-gateway`, `/usr/bin/ptg`, lalu install ulang. |

## Release dan testing

Clone dan test lokal:

```bash
git clone https://github.com/akaanakbaik/pterodactyl-gateway.git
cd pterodactyl-gateway
npm install
npm run verify
```

Checklist publish:

```bash
npm run verify
npm publish --access public
npm view @akaanakbaik/pterodactyl-gateway@1.0.0 version --prefer-online --registry=https://registry.npmjs.org/
npm i -g @akaanakbaik/pterodactyl-gateway@1.0.0 --force --prefer-online --registry=https://registry.npmjs.org/
ptero-gateway self-check
ptero-gateway release-check
ptero-gateway doctor
```

## Versi npm lama

Rilis utama yang direkomendasikan adalah `1.0.0` dan tag `latest` harus mengarah ke versi tersebut. Versi lama di npm tidak dipromosikan lagi di dokumentasi ini. Jika perlu menyembunyikan versi lama dari pemakaian user, gunakan `npm deprecate` pada versi lama dengan pesan yang mengarahkan ke `1.0.0`.

Contoh:

```bash
npm deprecate @akaanakbaik/pterodactyl-gateway@"<1.0.0" "Versi lama tidak direkomendasikan. Gunakan @akaanakbaik/pterodactyl-gateway@1.0.0 atau latest."
```

## Lisensi

MIT
