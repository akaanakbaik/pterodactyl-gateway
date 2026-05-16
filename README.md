# Akadev Pterodactyl Gateway

SDK TypeScript dan CLI sederhana untuk membantu project Node.js terhubung ke Pterodactyl Panel dengan lebih mudah.

Package ini dibuat untuk kebutuhan bot reseller panel, dashboard custom, automation server, dan admin tools. Fokus v0.2.x adalah memperluas kontrol server dengan file manager, startup variables, network allocations, dan database manager, sambil tetap menjaga smart create user/server, preview, dry run, error tutorial, raw request, test, dan pack check.

Package ini bukan package resmi dari Pterodactyl dan tidak berafiliasi dengan Pterodactyl Software.

## Status

Versi saat ini: `0.2.1`

Fitur utama:

- `createPtero()`
- `createPtero.fromEnv()`
- `connect()`
- `health()`
- `doctor()` dasar
- `compatibility()` dasar
- `raw.application` dan `raw.client`
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
- `server(identifier).files.list()`
- `server(identifier).files.read()`
- `server(identifier).files.write()`
- `server(identifier).files.delete()`
- `server(identifier).files.mkdir()`
- `server(identifier).files.rename()`
- `server(identifier).files.compress()`
- `server(identifier).files.decompress()`
- `server(identifier).files.json.read()`
- `server(identifier).files.json.write()`
- `server(identifier).startup.variables()`
- `server(identifier).startup.set()`
- `server(identifier).startup.setMany()`
- `server(identifier).network.list()`
- `server(identifier).network.assign()`
- `server(identifier).network.setNote()`
- `server(identifier).network.setPrimary()`
- `server(identifier).network.delete()`
- `server(identifier).databases.list()`
- `server(identifier).databases.create()`
- `server(identifier).databases.rotatePassword()`
- `server(identifier).databases.delete()`
- parser RAM, disk, CPU
- error tutorial
- CLI dasar `ptero-gateway`
- `npm run verify`
- `npm pack --dry-run`

## Install lokal

```bash
npm install @akadev/pterodactyl-gateway
```

Untuk development dari GitHub:

```bash
git clone https://github.com/akaanakbaik/pterodactyl-gateway.git
cd pterodactyl-gateway
npm install
npm run verify
```

## Env

Buat file `.env` di project kamu:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=ptla_xxxxxxxxxxxxxxxxx
PTERO_PTLC=ptlc_xxxxxxxxxxxxxxxxx
```

Penjelasan:

- `PTERO_DOMAIN` adalah domain panel Pterodactyl.
- `PTERO_PTLA` adalah Application API Key untuk aksi admin seperti create user dan create server.
- `PTERO_PTLC` adalah Client API Key untuk kontrol server seperti start, stop, command, resources, file manager, startup variables, network allocations, database manager, dan realtime pada versi berikutnya.

## Koneksi cepat

```ts
import { createPtero } from "@akadev/pterodactyl-gateway";

const ptero = createPtero({
  domain: "https://panel.example.com",
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});

const result = await ptero.connect();
console.log(result);
```

Atau dari env:

```ts
import { createPtero } from "@akadev/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
await ptero.connect();
```

## Create user smart

Field wajib:

- `username`
- `email`
- `password`
- `administrator`

Jika `firstName` dan `lastName` kosong, nilainya otomatis memakai username.

```ts
const user = await ptero.users.createSmart({
  username: "aka",
  email: "aka@example.com",
  password: "auto",
  administrator: "no"
});

console.log(user);
```

Jika `password: "auto"`, package membuat password aman dan mengembalikannya sekali pada response.

## Create server smart

Field wajib:

- `name`
- `email` atau `userId`
- `description`
- `nodeId`
- `nestId`
- `eggId`
- `memory`
- `disk`
- `cpu`
- `databases`
- `allocations`
- `backups`

Yang otomatis:

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

console.log(server);
```

## Preview sebelum create

Gunakan ini untuk melihat hasil auto-sync sebelum server benar-benar dibuat.

```ts
const preview = await ptero.servers.previewCreate({
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

console.log(preview.payload);
```

## File manager

```ts
const server = ptero.server("abc12345");

const files = await server.files.list("/");
const text = await server.files.read("/package.json");
await server.files.write("/index.js", "console.log('halo')");
await server.files.mkdir("/", "logs");
await server.files.rename("/", [{ from: "old.js", to: "new.js" }]);
await server.files.delete("/", ["old.js"]);
await server.files.compress("/", ["src", "package.json"]);
await server.files.decompress("/", "archive.tar.gz");

const config = await server.files.json.read("/config.json");
await server.files.json.write("/config.json", { ok: true });
```

## Startup variables

```ts
const variables = await server.startup.variables();
await server.startup.set("BOT_TOKEN", "token-baru");
await server.startup.setMany({
  NODE_ENV: "production",
  STARTUP_FILE: "index.js"
});
```

## Network allocations

```ts
const allocations = await server.network.list();
await server.network.assign();
await server.network.setNote(123, "API port");
await server.network.setPrimary(123);
await server.network.delete(123);
```

## Database manager

```ts
const databases = await server.databases.list();
await server.databases.create({ database: "botdb" });
await server.databases.create({ database: "botdb", remote: "%" });
await server.databases.rotatePassword("database-id");
await server.databases.delete("database-id");
```

## Dry run

`dryRun` membuat payload final tanpa mengirim request create server.

```ts
const result = await ptero.servers.createSmart(input, {
  dryRun: true
});

console.log(result.payload);
```

## Preset paket

```ts
const ptero = createPtero({
  domain: "https://panel.example.com",
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

## Kontrol server

```ts
const server = ptero.server("abc12345");

await server.start();
await server.stop();
await server.restart();
await server.kill();
await server.command("npm start");
const resources = await server.resources();
```

Command berbahaya seperti `rm -rf /` diblokir secara default.

```ts
await server.command("rm -rf /tmp/cache", {
  allowDangerous: true
});
```

## Raw request

Raw mode disediakan agar fitur baru atau panel fork tetap bisa dipakai.

```ts
await ptero.raw.application.get("/users");
await ptero.raw.application.post("/servers", payload);
await ptero.raw.client.get("/servers/abc123/resources");
await ptero.raw.client.post("/servers/abc123/command", {
  command: "npm start"
});
```

## CLI dasar

Setelah build atau install global:

```bash
ptero-gateway doctor
ptero-gateway connect
ptero-gateway ids
ptero-gateway ids --nest 5
ptero-gateway server abc123 resources
ptero-gateway server abc123 restart
ptero-gateway server abc123 command "npm start"
```

## Testing di VPS Ubuntu

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
git clone https://github.com/akaanakbaik/pterodactyl-gateway.git
cd pterodactyl-gateway
npm install
npm run verify
```

`npm run verify` menjalankan:

- `npm run typecheck`
- `npm test`
- `npm run test:cli`
- `npm run test:pack`

Jika semua berhasil, package siap dilanjutkan ke fitur versi berikutnya.

## Roadmap ringkas

### v0.1.x

Core SDK, smart create user, smart create server, preview, dryRun, doctor dasar, CLI dasar, raw request, test, CI, pack check.

### v0.2.x

File manager, startup variables, database manager, backup manager, network allocations, schedules, cache, pagination, preset lebih matang.

### v0.3.0

WebSocket console, stats realtime, polling fallback, audit event, event emitter.

### v0.4.0

CLI lebih lengkap: init, create-user wizard, create-server wizard, ids, server manager.

### v0.5.0

TUI atau GUI CLI terminal: dashboard interaktif, preview, create server, kontrol server, console viewer.

### v0.6.0

Experimental nest/egg create/update/delete, import/export egg, compatibility adapter.

## Lisensi

MIT
