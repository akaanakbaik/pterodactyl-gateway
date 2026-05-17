# Akadev Pterodactyl Gateway

<p align="center">
  <b>SDK TypeScript + CLI modern untuk mengelola Pterodactyl Panel dari bot, dashboard, backend, website, dan terminal.</b>
</p>

<p align="center">
  <code>@akaanakbaik/pterodactyl-gateway</code> · <code>v1.0.2</code> · <code>Node.js &gt;=18</code> · <code>MIT</code>
</p>

<p align="center">
  <a href="https://web-docs-pterodacty-gateway.vercel.app"><b>Web Docs</b></a>
  ·
  <a href="https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway"><b>npm</b></a>
  ·
  <a href="https://github.com/akaanakbaik/pterodactyl-gateway"><b>GitHub</b></a>
</p>

Akadev Pterodactyl Gateway membantu kamu menghubungkan aplikasi Node.js ke Pterodactyl Panel dengan flow yang lebih aman, cepat, dan mudah diuji: cek koneksi, membuat user, membuat server, dry-run payload, mengelola file, startup variables, backups, schedules, power action, sampai helper integrasi bot/website.

> Package ini bukan package resmi dari Pterodactyl dan tidak berafiliasi dengan Pterodactyl Software.

## Web Docs

Dokumentasi lengkap versi web tersedia di:

```txt
https://web-docs-pterodacty-gateway.vercel.app
```

Web docs berisi tutorial per halaman/path agar mudah dipahami pemula:

```txt
/docs/overview
/docs/install
/docs/config
/docs/cli-create-server
/docs/sdk
/docs/integrations/telegram-bot
/docs/integrations/whatsapp-bot
/docs/integrations/discord-bot
/docs/integrations/website-api
/docs/security
/docs/troubleshooting
/privacy
/terms
```

Fitur web docs:

- Search lokal cepat.
- Floating AI assistant untuk pertanyaan seputar gateway.
- Tutorial step-by-step.
- Simulasi animasi penggunaan.
- Contoh integrasi Telegram bot, WhatsApp bot, Discord bot, website/API, SDK, CLI, dan troubleshooting.
- Privacy Policy dan Terms.
- SEO lengkap: sitemap, robots, canonical, OpenGraph, Twitter card, JSON-LD, manifest, dan SVG icon.

## Navigasi

- [Install](#install)
- [Quick start CLI](#quick-start-cli)
- [Quick start SDK](#quick-start-sdk)
- [Environment](#environment)
- [CLI reference](#cli-reference)
- [Preset dan template](#preset-dan-template)
- [Integration helpers](#integration-helpers)
- [Contoh integrasi](#contoh-integrasi)
- [Keamanan](#keamanan)
- [Troubleshooting](#troubleshooting)
- [Release dan testing](#release-dan-testing)

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

## Quick start CLI

```bash
ptero-gateway config init \
  --profile main \
  --domain https://panel.example.com \
  --ptla ptla_xxx \
  --ptlc ptlc_xxx

ptero-gateway doctor
ptero-gateway ids --nest 5
ptero-gateway admin users
ptero-gateway admin servers
ptero-gateway servers
```

Create server dengan dry-run:

```bash
ptero-gateway admin create-server \
  --name "aka test" \
  --email user@example.com \
  --username aka_test \
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
  --email user@example.com \
  --username aka_test \
  --password "password aman" \
  --node 1 \
  --nest 5 \
  --egg 18 \
  --preset basic \
  --yes
```

## Quick start SDK

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
const doctor = await ptero.doctor();
console.log(doctor);
```

Create server dari SDK:

```ts
const server = await ptero.servers.createSmart({
  name: "Bot User",
  email: "user@example.com",
  username: "user_bot",
  password: "auto",
  autoCreateUser: true,
  description: "Server bot user",
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

Client server handle:

```ts
const serverHandle = ptero.server("311d56b7");

await serverHandle.resources();
await serverHandle.files.list("/");
await serverHandle.files.write("/tmp/hello.txt", "halo");
await serverHandle.startup.set("CMD_RUN", "node index.js");
await serverHandle.start();
```

## Environment

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

- PTLA hanya untuk backend/admin service.
- PTLC hanya untuk fitur client server yang diperlukan.
- Jangan hardcode key ke source code, repo, frontend, pesan bot, atau log publik.
- Pisahkan key development dan production.

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

Admin:

```bash
ptero-gateway admin users
ptero-gateway admin servers
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

Power dan command:

```bash
ptero-gateway server 311d56b7 start --yes
ptero-gateway server 311d56b7 stop --yes
ptero-gateway server 311d56b7 restart --yes
ptero-gateway server 311d56b7 kill --yes
ptero-gateway server 311d56b7 command "npm start" --yes
```

## Preset dan template

```bash
ptero-gateway presets
ptero-gateway templates list
ptero-gateway templates show nodejs-bot
ptero-gateway templates command nodejs-bot --name "bot saya" --email user@example.com --node 1 --nest 5 --egg 18
```

Preset bawaan:

| Preset | Cocok untuk |
|---|---|
| `mini` | Testing dan bot kecil. |
| `basic` | Bot Telegram/Discord sederhana. |
| `standard` | Bot WhatsApp, API, website kecil. |
| `premium` | Project lebih aktif. |
| `unlimited` | Resource unlimited sesuai aturan panel. |

Template bawaan:

```txt
nodejs-bot
nodejs-api
wa-bot
python-bot
blank
```

## Integration helpers

Helper integrasi membuat input server lebih konsisten untuk bot dan website.

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

## Contoh integrasi

Telegram bot:

```ts
const result = await service.create({
  kind: "telegram-bot",
  name: `tg-${ctx.from.id}`,
  email: `${ctx.from.id}@telegram.local`,
  username: `tg_${ctx.from.id}`,
  password: "auto"
});
```

WhatsApp bot:

```ts
const result = await service.create({
  kind: "whatsapp-bot",
  name: `wa-${order.username}`,
  email: order.email,
  username: order.username,
  password: "auto",
  environment: {
    OWNER_NUMBER: order.phone,
    BOT_NAME: order.botName
  }
});
```

Website/API:

```ts
app.post("/api/panel/create", async (req, res) => {
  const paid = await checkPayment(req.body.orderId);
  if (!paid) return res.status(403).json({ ok: false, error: "Belum dibayar" });

  const result = await service.create({
    kind: "website",
    name: req.body.name,
    email: req.body.email,
    username: req.body.username,
    password: "auto"
  });

  res.json({ ok: true, result });
});
```

Dokumentasi contoh lengkap ada di web docs:

```txt
https://web-docs-pterodacty-gateway.vercel.app/docs/integrations/telegram-bot
https://web-docs-pterodacty-gateway.vercel.app/docs/integrations/whatsapp-bot
https://web-docs-pterodacty-gateway.vercel.app/docs/integrations/discord-bot
https://web-docs-pterodacty-gateway.vercel.app/docs/integrations/website-api
```

## Keamanan

- Jangan hardcode PTLA/PTLC.
- Jangan kirim API key atau config profile ke user.
- Jangan log password generated ke public log.
- Semua aksi tulis/ubah via CLI wajib `--yes`.
- Write file CLI default hanya boleh ke `/tmp`; path lain wajib `--allow-any-path`.
- Command berbahaya diblokir oleh guard command.
- Delete user/server permanen tidak dibuka di CLI stabil.
- Command node/location/allocation management tidak dibuka di CLI stabil.
- Frontend tidak boleh memegang API key panel. Gunakan backend untuk semua aksi create server.

## Troubleshooting

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
| Tidak ada allocation kosong | Tambahkan allocation dari panel admin node. |
| Backup gagal limit 0 | Naikkan limit backup server dulu. |
| Binary global konflik | Hapus `/usr/bin/ptero-gateway`, `/usr/bin/ptg`, lalu install ulang. |

Tutorial lengkap troubleshooting:

```txt
https://web-docs-pterodacty-gateway.vercel.app/docs/troubleshooting
```

## Release dan testing

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
npm view @akaanakbaik/pterodactyl-gateway@1.0.2 version --prefer-online --registry=https://registry.npmjs.org/
npm i -g @akaanakbaik/pterodactyl-gateway@1.0.2 --force --prefer-online --registry=https://registry.npmjs.org/
ptero-gateway self-check
ptero-gateway release-check
ptero-gateway doctor
```

## Versi npm lama

Rilis utama yang direkomendasikan adalah `1.0.2` atau `latest`. Versi lama tidak dipromosikan lagi di dokumentasi.

Contoh deprecate versi lama:

```bash
npm deprecate @akaanakbaik/pterodactyl-gateway@"<1.0.0" "Versi lama tidak direkomendasikan. Gunakan @akaanakbaik/pterodactyl-gateway@latest."
```

## Lisensi

MIT
