# Akadev Pterodactyl Gateway

SDK TypeScript dan CLI untuk mengelola Pterodactyl Panel dengan lebih cepat, aman, dan nyaman dari Node.js maupun terminal.

Package ini cocok untuk bot reseller panel, dashboard custom, automation server, admin tools, dan project yang perlu membuat user/server Pterodactyl secara otomatis.

> Package ini bukan package resmi dari Pterodactyl dan tidak berafiliasi dengan Pterodactyl Software.

## Status

Versi saat ini: `0.9.0`

- npm package: `@akaanakbaik/pterodactyl-gateway`
- CLI utama: `ptero-gateway` dan `ptg`
- CLI wizard: `ptero-wizard`
- Runtime: Node.js `>=18`
- License: MIT

## Install

```bash
npm i @akaanakbaik/pterodactyl-gateway
```

Install global CLI:

```bash
npm i -g @akaanakbaik/pterodactyl-gateway
```

Cek versi dan kondisi package:

```bash
ptero-gateway version
ptero-gateway self-check
ptero-gateway release-check
```

## API key

Gunakan dua jenis key sesuai kebutuhan:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=ptla_xxxxxxxxxxxxxxxxx
PTERO_PTLC=ptlc_xxxxxxxxxxxxxxxxx
```

- `PTERO_DOMAIN`: domain panel Pterodactyl.
- `PTERO_PTLA`: Application API Key untuk aksi admin seperti list user, create user, create server, update limits, suspend, unsuspend, dan reinstall.
- `PTERO_PTLC`: Client API Key untuk kontrol server seperti resources, file manager, startup variables, ports, backups, schedules, dan power action.

Jangan hardcode API key ke source code.

## Config profile

Sejak `0.8.0`, CLI bisa menyimpan profile lokal agar tidak perlu export env berulang-ulang.

```bash
ptero-gateway config init \
  --profile main \
  --domain https://panel.example.com \
  --ptla ptla_xxx \
  --ptlc ptlc_xxx

ptero-gateway config doctor
ptero-gateway config list
ptero-gateway doctor
```

File config disimpan di:

```txt
~/.pterodactyl-gateway/config.json
```

File tersebut berisi API key dan otomatis diberi permission `600`.

Command config:

```bash
ptero-gateway config path
ptero-gateway config init --profile main --domain https://panel.example.com --ptla ptla_xxx --ptlc ptlc_xxx
ptero-gateway config list
ptero-gateway config show main
ptero-gateway config use main
ptero-gateway config rename main production
ptero-gateway config delete production --yes
ptero-gateway config env main
ptero-gateway config doctor
```

## CLI cepat

```bash
ptero-gateway help
ptero-gateway doctor
ptero-gateway connect
ptero-gateway ids
ptero-gateway ids --nest 5
ptero-gateway servers
```

List admin:

```bash
ptero-gateway admin users
ptero-gateway admin servers
```

## Preset server

```bash
ptero-gateway presets
```

Preset bawaan:

| Preset | Memory | Disk | CPU | Database | Allocation | Backup |
|---|---:|---:|---:|---:|---:|---:|
| mini | 512MB | 1GB | 50% | 0 | 1 | 0 |
| basic | 1GB | 2GB | 100% | 0 | 1 | 0 |
| standard | 2GB | 5GB | 200% | 1 | 1 | 1 |
| premium | 4GB | 10GB | 300% | 2 | 2 | 2 |
| unlimited | 0 | 0 | 0 | 5 | 3 | 3 |

Nilai preset tetap bisa dioverride dengan `--memory`, `--disk`, `--cpu`, `--databases`, `--allocations`, dan `--backups`.

## Templates

Template hanya membuat rekomendasi command create-server. Template tidak membuat node, location, atau allocation.

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

## Create user

```bash
ptero-gateway admin create-user \
  --username aka_test \
  --email user@example.com \
  --password "password aman" \
  --yes
```

## Create server

Selalu mulai dengan dry-run:

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

Jika payload sudah benar, eksekusi asli:

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

## Wizard

Wizard membantu input secara interaktif tanpa membuka kontrol node/location/allocation.

```bash
ptero-wizard help
ptero-wizard create-user --dry-run
ptero-wizard create-server --dry-run
ptero-wizard create-server --yes
```

Node ID, Nest ID, dan Egg ID tetap diisi manual oleh admin. Gunakan `ptero-gateway ids` untuk melihat daftar ID.

## Admin server

```bash
ptero-gateway admin server 5 detail
ptero-gateway admin server 5 limits
ptero-gateway admin server 5 update-limits --backups 1 --yes
ptero-gateway admin server 5 suspend --yes
ptero-gateway admin server 5 unsuspend --yes
ptero-gateway admin server 5 reinstall --yes
```

## Client server

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

Template Node alive:

```bash
ptero-gateway server 311d56b7 stop --yes
ptero-gateway server 311d56b7 init-node-alive --yes
ptero-gateway server 311d56b7 start --yes
```

Backup:

```bash
ptero-gateway server 311d56b7 backups
ptero-gateway server 311d56b7 create-backup --name "before-update" --yes
ptero-gateway server 311d56b7 backup <uuid>
ptero-gateway server 311d56b7 delete-backup <uuid> --yes
```

## SDK

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: "https://panel.example.com",
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});

await ptero.connect();
```

Dari env:

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
const doctor = await ptero.doctor();
console.log(doctor);
```

Create user SDK:

```ts
const user = await ptero.users.createSmart({
  username: "aka_test",
  email: "user@example.com",
  password: "auto",
  administrator: false
});
```

Create server SDK:

```ts
const server = await ptero.servers.createSmart({
  name: "Bot WhatsApp Aka",
  email: "user@example.com",
  username: "aka_test",
  password: "password aman",
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

Dry-run SDK:

```ts
const preview = await ptero.servers.createSmart(input, { dryRun: true });
console.log(preview.payload);
```

Client SDK:

```ts
const server = ptero.server("311d56b7");

await server.resources();
await server.files.list("/");
await server.files.read("/package.json");
await server.files.write("/tmp/test.txt", "halo");
await server.startup.variables();
await server.startup.set("CMD_RUN", "node index.js");
await server.backups.list();
```

Raw request:

```ts
await ptero.raw.application.get("/users");
await ptero.raw.client.get("/servers/311d56b7/resources");
```

## Keamanan

- Jangan hardcode PTLA/PTLC di source code.
- Config lokal berisi API key; jangan upload `~/.pterodactyl-gateway/config.json`.
- Semua aksi tulis/ubah via CLI wajib `--yes`.
- Write file CLI default hanya boleh ke `/tmp`; untuk path lain wajib `--allow-any-path`.
- Command berbahaya seperti `rm -rf /` diblokir oleh guard command.
- Gunakan `--dry-run` sebelum create server asli.
- Command node/location/allocation management sengaja tidak dibuka.
- Delete user/server permanen sengaja tidak dibuka di CLI stabil.

## Testing lokal

```bash
git clone https://github.com/akaanakbaik/pterodactyl-gateway.git
cd pterodactyl-gateway
npm install
npm run verify
```

`npm run verify` menjalankan typecheck, unit test, CLI smoke test, release guard, dan pack dry-run.

## Release checklist

```bash
npm run verify
npm publish --access public
npm view @akaanakbaik/pterodactyl-gateway@0.9.0 version --prefer-online --registry=https://registry.npmjs.org/
npm i -g @akaanakbaik/pterodactyl-gateway@0.9.0 --force --prefer-online --registry=https://registry.npmjs.org/
ptero-gateway self-check
ptero-gateway release-check
```

## Menuju 1.0.0

`0.9.0` adalah hardening release sebelum stabil. Fokus berikutnya untuk `1.0.0` adalah stabilisasi API, dokumentasi final, dan kompatibilitas panel/fork yang lebih luas.

## Lisensi

MIT
