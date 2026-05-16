# Cetak Biru Akadev Pterodactyl Gateway

Dokumen ini adalah acuan utama pengembangan `@akadev/pterodactyl-gateway`. Semua fitur baru wajib tetap sinkron dengan blueprint ini.

## Visi

`@akadev/pterodactyl-gateway` adalah SDK, CLI, dan nantinya TUI untuk mempermudah project Node.js mengelola Pterodactyl Panel.

Target utama:

- pemula bisa connect hanya dengan domain, PTLA, dan PTLC
- developer bisa memakai wrapper high-level dan raw request
- create user dan create server dibuat mudah melalui smart create
- field sulit seperti docker image, startup, environment, default allocation, dan additional allocation bisa otomatis
- error harus jelas dan berisi tutorial perbaikan
- semua versi dikembangkan melalui test sebelum lanjut

Package ini bukan package resmi dari Pterodactyl.

## Istilah utama

- `domain`: URL panel Pterodactyl
- `ptla`: Application API Key untuk aksi admin
- `ptlc`: Client API Key untuk kontrol server
- `nodeId`: ID node Pterodactyl
- `nestId`: ID nest Pterodactyl
- `eggId`: ID egg di dalam nest

## Prinsip pengembangan

1. Kode harus TypeScript strict.
2. Source code minim komentar, kecuali bagian penting.
3. README dan dokumen repo utama berbahasa Indonesia.
4. Fitur destructive harus aman secara default.
5. API key, password, dan Authorization header tidak boleh dilog.
6. Fitur yang belum pasti di semua versi Pterodactyl masuk `experimental`.
7. Raw mode wajib tersedia untuk panel custom atau endpoint baru.
8. Setiap versi wajib lulus `npm run typecheck`, `npm test`, dan `npm run build`.
9. Website docs lengkap dibuat terakhir di repo berbeda setelah core stabil.

## Mode koneksi

- `full`: domain + PTLA + PTLC valid
- `admin`: domain + PTLA valid
- `client`: domain + PTLC valid
- `raw`: hanya domain atau key belum dicek
- `invalid`: key diberikan tetapi tidak valid

## API utama

```ts
import { createPtero } from "@akadev/pterodactyl-gateway";

const ptero = createPtero({
  domain: "https://panel.example.com",
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});
```

## Fitur wajib v0.1.0

- `createPtero()`
- `createPtero.fromEnv()`
- `connect()`
- `health()`
- `doctor()` dasar
- `compatibility()` dasar
- raw request application/client
- `users.createSmart()`
- `users.getOrCreate()`
- `servers.previewCreate()`
- `servers.createSmart()`
- `servers.createFromPreset()`
- `servers.createRaw()`
- `server(identifier).start()`
- `server(identifier).stop()`
- `server(identifier).restart()`
- `server(identifier).kill()`
- `server(identifier).command()`
- `server(identifier).resources()`
- parser RAM, disk, CPU
- error tutorial
- CLI dasar
- GitHub Actions CI

## Create user smart

Field wajib:

- username
- email
- password
- administrator

Auto-fill:

- firstName kosong menjadi username
- lastName kosong menjadi username
- password `auto` membuat password aman
- administrator menerima boolean, yes/no, true/false, 1/0

## Create server smart

Field wajib:

- name
- email atau userId
- description
- nodeId
- nestId
- eggId
- memory
- disk
- cpu
- databases
- allocations
- backups

Auto-fill:

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

## Preview dan dryRun

`previewCreate()` wajib ada agar user bisa melihat hasil auto-sync sebelum server dibuat.

`dryRun: true` wajib ada agar payload final bisa dicek tanpa mengirim request create server.

## Allocation strategy

Default: `top`.

Strategy yang direncanakan:

- `top`
- `lowest-port`
- `highest-port`
- `random`
- `range`

Jika allocation limit lebih dari 1:

- allocation pertama menjadi default
- sisanya menjadi additional allocation

## Error tutorial

Setiap error penting harus berisi:

- code
- message
- hint
- steps
- example jika perlu

Contoh error wajib:

- `PTLA_REQUIRED`
- `PTLC_REQUIRED`
- `DOMAIN_REQUIRED`
- `USER_NOT_FOUND`
- `NODE_NOT_FOUND`
- `NEST_EGG_MISMATCH`
- `DOCKER_IMAGE_NOT_FOUND`
- `STARTUP_NOT_FOUND`
- `EGG_VARIABLE_REQUIRED`
- `NO_FREE_ALLOCATION`
- `VALIDATION_ERROR`
- `DANGEROUS_COMMAND_BLOCKED`

## Security

- mask PTLA dan PTLC
- jangan log password
- jangan log Authorization header
- command berbahaya diblokir default
- delete dan force delete harus butuh confirm pada versi mendatang
- tidak ada telemetry default

## CLI

Binary:

- `ptero-gateway`
- `ptg`

Command awal:

- `doctor`
- `connect`
- `ids`
- `ids --nest <nestId>`
- `server <identifier> resources`
- `server <identifier> start`
- `server <identifier> stop`
- `server <identifier> restart`
- `server <identifier> kill`
- `server <identifier> command "npm start"`

## TUI atau GUI CLI

TUI bagus ditambahkan setelah core stabil, bukan di v0.1.0.

Target v0.5.0:

- dashboard terminal
- doctor check visual
- list IDs
- create user wizard
- create server wizard
- preview screen
- server manager
- realtime console viewer
- settings `.env`

## Roadmap

### v0.1.0

Core SDK, smart create user, smart create server, preview, dryRun, doctor dasar, raw request, CLI dasar, test, CI.

### v0.2.0

File manager, database manager, backup manager, startup variables, network allocations, schedules, cache, pagination, preset lebih matang.

### v0.3.0

WebSocket console, realtime stats, polling fallback, token refresh, audit event, event emitter.

### v0.4.0

CLI lengkap: init, create-user wizard, create-server wizard, ids, server manager, console command.

### v0.5.0

TUI terminal interaktif.

### v0.6.0

Experimental nest/egg create/update/delete, import/export egg, compatibility adapter.

### v1.0.0

API stabil, docs lengkap, examples lengkap, test coverage kuat, siap publish npm stabil.
