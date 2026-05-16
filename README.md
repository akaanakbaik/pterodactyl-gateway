# Akadev Pterodactyl Gateway

SDK TypeScript dan CLI untuk menghubungkan project Node.js ke Pterodactyl Panel dengan lebih mudah, aman, dan cepat.

Package ini cocok untuk bot reseller panel, dashboard custom, automation server, admin tools, dan project yang perlu membuat user/server Pterodactyl secara otomatis.

Package ini bukan package resmi dari Pterodactyl dan tidak berafiliasi dengan Pterodactyl Software.

## Status

Versi saat ini: `0.3.0`

Package npm publik:

```bash
npm i @akaanakbaik/pterodactyl-gateway
```

Install global CLI:

```bash
npm i -g @akaanakbaik/pterodactyl-gateway
```

CLI tersedia sebagai:

```bash
ptero-gateway help
ptg help
```

## Yang sudah terbukti di panel asli

Fitur berikut sudah dites langsung pada panel Pterodactyl asli:

- koneksi PTLA dan PTLC
- `doctor`
- `ids`
- list admin users
- list admin servers
- create user
- create server dengan dry-run
- create server asli
- auto docker image dari egg
- auto startup dari egg
- auto allocation
- detail server admin
- limits server admin
- update limits server admin
- suspend server
- unsuspend server
- probe read-only client server
- summary server
- resources realtime/polling
- files list
- files read
- files write
- startup/env read
- startup/env set
- network/ports read
- backup list
- backup detail
- backup delete
- schedules list
- template `init-node-alive`
- start/stop/restart/kill server
- publish ke npm public registry

## Env

Gunakan env berikut:

```env
PTERO_DOMAIN=https://panel.example.com
PTERO_PTLA=ptla_xxxxxxxxxxxxxxxxx
PTERO_PTLC=ptlc_xxxxxxxxxxxxxxxxx
```

Penjelasan:

- `PTERO_DOMAIN`: domain panel Pterodactyl.
- `PTERO_PTLA`: Application API Key untuk aksi admin seperti list user, create user, create server, update limits, suspend, unsuspend, dan reinstall.
- `PTERO_PTLC`: Client API Key untuk kontrol server seperti resources, file manager, startup variables, ports, backups, schedules, dan power action.

Jangan hardcode API key ke source code.

## Koneksi SDK

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: "https://panel.example.com",
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC
});

const result = await ptero.connect();
console.log(result);
```

Atau langsung dari env:

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
await ptero.connect();
```

## CLI cepat

Cek koneksi:

```bash
ptero-gateway doctor
ptero-gateway connect
```

Ambil ID node, nest, dan egg:

```bash
ptero-gateway ids
ptero-gateway ids --nest 5
```

List server client:

```bash
ptero-gateway servers
```

List admin:

```bash
ptero-gateway admin users
ptero-gateway admin servers
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

Detail dan limit server admin:

```bash
ptero-gateway admin server 5 detail
ptero-gateway admin server 5 limits
ptero-gateway admin server 5 update-limits --backups 1 --yes
```

Lifecycle admin:

```bash
ptero-gateway admin server 5 suspend --yes
ptero-gateway admin server 5 unsuspend --yes
ptero-gateway admin server 5 reinstall --yes
```

Probe dan summary server client:

```bash
ptero-gateway probe 311d56b7
ptero-gateway server 311d56b7 summary
ptero-gateway server 311d56b7 resources
```

File manager:

```bash
ptero-gateway server 311d56b7 files /
ptero-gateway server 311d56b7 read /package.json
ptero-gateway server 311d56b7 write /tmp/test.txt "halo" --yes
ptero-gateway server 311d56b7 write /index.js "console.log('halo')" --yes --allow-any-path
```

Startup variables:

```bash
ptero-gateway server 311d56b7 env
ptero-gateway server 311d56b7 set-env CMD_RUN "node index.js" --yes
```

Template server Node yang tetap hidup:

```bash
ptero-gateway server 311d56b7 stop --yes
ptero-gateway server 311d56b7 init-node-alive --yes
ptero-gateway server 311d56b7 start --yes
ptero-gateway server 311d56b7 resources
```

Backup:

```bash
ptero-gateway server 311d56b7 backups
ptero-gateway server 311d56b7 create-backup --name "before-update" --yes
ptero-gateway server 311d56b7 backup <uuid>
ptero-gateway server 311d56b7 delete-backup <uuid> --yes
```

Power control:

```bash
ptero-gateway server 311d56b7 start --yes
ptero-gateway server 311d56b7 stop --yes
ptero-gateway server 311d56b7 restart --yes
ptero-gateway server 311d56b7 kill --yes
ptero-gateway server 311d56b7 command "npm start" --yes
```

## Create user SDK

```ts
const user = await ptero.users.createSmart({
  username: "aka_test",
  email: "user@example.com",
  password: "auto",
  administrator: "no"
});

console.log(user);
```

Jika `password: "auto"`, package membuat password aman dan mengembalikannya sekali pada response.

## Create server SDK

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

console.log(server);
```

## Preview dan dry-run SDK

```ts
const result = await ptero.servers.createSmart(input, {
  dryRun: true
});

console.log(result.payload);
```

## File manager SDK

```ts
const server = ptero.server("311d56b7");

const files = await server.files.list("/");
const text = await server.files.read("/package.json");
await server.files.write("/index.js", "console.log('running')");

const config = await server.files.json.read("/config.json");
await server.files.json.write("/config.json", { ok: true });
```

## Startup variables SDK

```ts
const variables = await server.startup.variables();
await server.startup.set("CMD_RUN", "node index.js");
await server.startup.setMany({
  NODE_ENV: "production",
  STARTUP_FILE: "index.js"
});
```

## Network, database, backup, schedule SDK

```ts
await server.network.list();
await server.network.assign();
await server.network.setNote(123, "API port");
await server.network.setPrimary(123);
await server.network.delete(123);

await server.databases.list();
await server.databases.create({ database: "botdb" });
await server.databases.rotatePassword("database-id");
await server.databases.delete("database-id");

await server.backups.list();
await server.backups.create({ name: "before-update" });
await server.backups.details("backup-id");
await server.backups.download("backup-id");
await server.backups.delete("backup-id");

await server.schedules.list();
await server.schedules.create({
  name: "Daily restart",
  minute: "0",
  hour: "3",
  dayOfMonth: "*",
  month: "*",
  dayOfWeek: "*"
});
```

## Raw request

Raw mode disediakan agar fitur baru atau panel fork tetap bisa dipakai.

```ts
await ptero.raw.application.get("/users");
await ptero.raw.application.post("/servers", payload);
await ptero.raw.client.get("/servers/311d56b7/resources");
await ptero.raw.client.post("/servers/311d56b7/command", {
  command: "npm start"
});
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

## Catatan keamanan

- Jangan hardcode PTLA/PTLC di source code.
- Semua aksi tulis/ubah via CLI wajib `--yes`.
- Write file CLI default hanya boleh ke `/tmp`; untuk path lain wajib `--allow-any-path`.
- Command berbahaya seperti `rm -rf /` diblokir oleh guard command.
- Gunakan `--dry-run` sebelum create server asli.
- Untuk delete server/user permanen, fitur sengaja belum dibuka di v0.3.0 dan akan dibuat dengan guard tambahan.

## Roadmap ringkas

### v0.3.x

Perapihan docs, lifecycle aman, cleanup aman, validasi create server, dan command CLI yang lebih ramah pemula.

### v0.4.0

Wizard CLI interaktif untuk create user/server, allocation helper, dan template project siap jalan.

### v0.5.0

TUI/GUI CLI terminal: dashboard interaktif, preview, create server, kontrol server, dan console viewer.

### v0.6.0

Experimental nest/egg create/update/delete, import/export egg, dan compatibility adapter.

## Lisensi

MIT
