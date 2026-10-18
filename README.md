# @akaanakbaik/pterodactyl-gateway v1.5.0

Gateway Pterodactyl profesional untuk JavaScript dan TypeScript. Satu paket berisi SDK Application API, Client API, perencanaan kapasitas, WebSocket realtime, backup otomatis, email SMTP, dan CLI operasional.

- Dukungan penuh **TypeScript**, **JavaScript**, **ESM**, dan **CommonJS**
- Retry adaptif, rate limiter, circuit breaker, cache GET, dan metrik latensi
- Perencanaan penempatan server berbasis matematika kapasitas node
- Alur pembuatan server pintar: user, nest, egg, environment, allocation, dan validasi payload
- Toolkit operasional: file manager, backup, schedule, database, network, console WebSocket
- CLI lengkap untuk admin, otomasi, dan audit tanpa menulis kode

Versi ini diuji langsung terhadap panel produksi `https://panel.akaa.dev` termasuk membuat, menjalankan, membackup, memindahkan kepemilikan, menggandakan, dan menghapus server.

## Daftar isi

- [Instalasi](#instalasi)
- [Quick start](#quick-start)
- [SDK](#sdk)
- [Perencanaan kapasitas](#perencanaan-kapasitas)
- [Operasi server](#operasi-server)
- [Backup dan email](#backup-dan-email)
- [WebSocket](#websocket)
- [CLI](#cli)
- [Konfigurasi](#konfigurasi)
- [Kompatibilitas panel](#kompatibilitas-panel)
- [Keamanan](#keamanan)
- [Publish ke npm](#publish-ke-npm)
- [Troubleshooting](#troubleshooting)

## Instalasi

```bash
npm install @akaanakbaik/pterodactyl-gateway
```

Requirement: Node.js 18 atau lebih baru. Dependensi runtime hanya `ws` dan `nodemailer`.

## Quick start

Buat Application API key (PTLA) dan Client API key (PTLC) dari panel, lalu simpan sebagai environment:

```bash
export PTERO_DOMAIN="https://panel.example.com"
export PTERO_PTLA="ptla_xxxxxxxxxxxxxxxxx"
export PTERO_PTLC="ptlc_xxxxxxxxxxxxxxxxx"
```

Cek koneksi:

```bash
npx ptero-gateway doctor
```

## SDK

### TypeScript ESM

```ts
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: process.env.PTERO_DOMAIN!,
  ptla: process.env.PTERO_PTLA!,
  ptlc: process.env.PTERO_PTLC!
});

const report = await ptero.doctor();
console.log(report.mode, report.capabilities);
```

### JavaScript ESM

```js
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero.fromEnv();
const nodes = await ptero.application.nodes.all();
console.log(nodes.map(node => node.attributes.name));
```

### CommonJS

```js
const { createPtero } = require("@akaanakbaik/pterodactyl-gateway");

async function main() {
  const ptero = createPtero.fromEnv();
  const servers = await ptero.listAllServers();
  console.log(servers.length);
}

main();
```

### Konfigurasi lanjutan

```ts
const ptero = createPtero({
  domain: "https://panel.example.com",
  ptla: "ptla_xxx",
  ptlc: "ptlc_xxx",
  timeout: 20000,
  safeMode: true,
  retry: { retries: 3, baseDelay: 400, maxDelay: 10000, retryOn: [429, 502, 503, 504], retryOnNetwork: true },
  rateLimit: { requestsPerSecond: 25, burst: 10 },
  cache: { enabled: true, ttl: 15000, maxEntries: 500 },
  circuitBreaker: { enabled: true, failureThreshold: 6, resetTimeout: 30000, halfOpenMax: 1 },
  hooks: {
    onRequest: context => console.log("->", context.method, context.url),
    onResponse: context => console.log("<-", context.status, `${context.duration}ms`),
    onRetry: context => console.log("retry", context.attempt, context.delay),
    onError: context => console.error(context.error)
  },
  defaultNestId: 5,
  defaultEggId: 15,
  nodeStrategy: "balanced"
});
```

### Metrik dan cache

```ts
const metrics = ptero.metrics();
console.log(metrics.requests, metrics.latency.p95, metrics.cacheHits, metrics.breaker.state);

ptero.flushCache();
```

Semua request non-GET otomatis menginvalidasi cache GET agar data tidak basi setelah operasi tulis.

### Helper

```ts
import { formatBytes, formatMiB, parseCron, planPlacement, renderEmailTemplate, slugify } from "@akaanakbaik/pterodactyl-gateway";
```

## Perencanaan kapasitas

Hitung kapasitas riil node, ramalkan jumlah server yang muat, dan pilih node terbaik sebelum membuat server.

```ts
const capacity = await ptero.capacity();
console.table(capacity.map(node => ({
  node: node.name,
  ram: `${node.memory.percent}%`,
  disk: `${node.disk.percent}%`,
  port: `${node.allocations.assigned}/${node.allocations.total}`
})));

const forecast = await ptero.forecast({ memory: "2GB", disk: "5GB", cpu: 200, databases: 1, allocations: 1, backups: 1 });

const plan = await ptero.planServer(
  { memory: "2GB", disk: "5GB", cpu: 200, databases: 1, allocations: 1, backups: 1 },
  { strategy: "balanced", reservePercent: 10 }
);

console.log(plan.plan.selected, plan.allocations);
```

Strategi yang tersedia: `balanced`, `pack`, `spread`, `memory`, `disk`, `ports`.

Bin packing untuk beberapa server sekaligus:

```ts
const assignment = await ptero.packServers([specA, specB, specC], "pack");
```

Model matematika yang dipakai:

- Kapasitas efektif node: `limit x (1 + overallocate / 100)`, dengan `limit = 0` berarti tak terbatas
- Headroom per dimensi: `(kapasitas - terpakai - reserve) / kebutuhan`
- Skor gabungan memakai geometric mean, log-scaling, dan penalti fragmentasi port
- Fragmentasi port dihitung dari jumlah blok port kosong yang terpisah

## Operasi server

```ts
const server = ptero.server("6e04fb6f");

await server.resources();
await server.files.write("/index.js", "console.log('hi')");
await server.files.list("/");
await server.files.uploadFromFile("/", "./dist/app.zip");
await server.files.downloadToFile("/app.zip", "./app.zip");

await server.start();
await server.waitForState("running", { timeout: 60000 });
await server.command("npm start");

const backup = await server.backups.createAndWait("harian");
await server.createScheduleBuilder()
  .setName("restart malam")
  .setCron("0 3 * * *")
  .addPowerTask("restart")
  .save();
```

Pembuatan server pintar:

```ts
const result = await ptero.smart.servers.create({
  name: "wa-bot",
  email: "owner@example.com",
  autoCreateUser: true,
  description: "WhatsApp bot",
  nodeId: 1,
  nestId: 5,
  eggId: 15,
  preset: "standard",
  allocation: { strategy: "best-fit" },
  startOnCompletion: true
}, {
  waitForInstall: 600000,
  onProgress: step => console.log(`[${step.percent}%] ${step.message}`)
});
```

## Backup dan email

```ts
const result = await ptero.exportAndEmailBackup(12, "owner@example.com", {
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "password",
  encryption: "starttls"
}, {
  keepPanelBackup: false,
  attachmentLimitBytes: 25 * 1024 * 1024,
  format: "zip"
});
```

Alternatif environment: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_ENCRYPTION`.

## WebSocket

```ts
const socket = await ptero.server("6e04fb6f").websocket.connect({
  reconnect: true,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000
});

socket.onConsole(line => console.log(line));
socket.onStats(stats => console.log(stats.cpu_absolute));
socket.onStatus(status => console.log(status));

await socket.waitFor("auth success", 10000);
await socket.close();
```

Token WebSocket di-refresh otomatis saat panel mengirim `token expiring`.

## CLI

```bash
ptero-gateway help
ptero-gateway doctor --json
ptero-gateway nodes
ptero-gateway eggs
ptero-gateway plan --memory 2GB --disk 5GB --cpu 200
ptero-gateway create-server --name "bot saya" --email owner@example.com --node 1 --egg 15 --preset standard --dry-run
ptero-gateway server 6e04fb6f resources
ptero-gateway server 6e04fb6f console --seconds 15
ptero-gateway backup 12 --to owner@example.com --yes
```

CLI aman secara default: operasi destruktif membutuhkan `--yes`, dan semua command mendukung `--json` untuk otomasi.

## Konfigurasi

Simpan profil agar tidak perlu mengulang key:

```bash
ptero-gateway config init --domain https://panel.example.com --ptla ptla_xxx --ptlc ptlc_xxx --profile prod
ptero-gateway config use prod
ptero-gateway config env
```

File berada di `~/.pterodactyl-gateway/config.json` dengan permission `600`. CLI juga membaca `.env` dan `.env.local` dari direktori kerja.

Environment yang didukung:

| Variabel | Fungsi |
| --- | --- |
| `PTERO_DOMAIN` | URL panel |
| `PTERO_PTLA` | Application API key |
| `PTERO_PTLC` | Client API key |
| `PTERO_NODE_ID` | Node default |
| `PTERO_NEST_ID` | Nest default |
| `PTERO_EGG_ID` | Egg default |
| `PTERO_SAFE_MODE` | `false` untuk mematikan guard penghapusan |
| `SMTP_*` | Konfigurasi email |

## Kompatibilitas panel

Gateway mendeteksi kemampuan panel secara otomatis:

- Panel standar dengan endpoint `/nests` dan `/nests/{id}/eggs`
- Panel varian dengan endpoint `/eggs` dan `/eggs/{id}?include=variables`
- Panel tanpa kedua endpoint akan menghasilkan error `UNSUPPORTED_PANEL_FEATURE` yang jelas

Jika panel meminta environment variable tertentu saat membuat server, gateway melengkapi field yang kurang secara otomatis berdasarkan respons validasi panel.

## Keamanan

- API key tidak pernah ditulis ke log; nilai sensitif diredaksi otomatis
- `safeMode` aktif secara default untuk operasi hapus
- `prepublishOnly` menjalankan seluruh quality gate sebelum rilis
- Source guard menolak komentar, watermark, dan kredensial di source code
- Verifikasi TLS SMTP aktif secara default

## Publish ke npm

Otomatis melalui GitHub Actions:

1. Buka <https://github.com/akaanakbaik/pterodactyl-gateway/settings/secrets/actions> lalu tambahkan secret `NPM_TOKEN` berisi granular access token npm dengan izin publish pada package `@akaanakbaik/pterodactyl-gateway`.
2. Buat tag versi: `git tag v1.5.0 && git push origin v1.5.0`.
3. Workflow `.github/workflows/publish.yml` menjalankan `npm ci`, seluruh quality gate, `npm publish --provenance --access public`, lalu membuat GitHub Release.

Alternatif tanpa token adalah Trusted Publishing: daftarkan repository dan workflow `publish.yml` pada halaman package di npmjs.com, lalu hapus secret `NPM_TOKEN`. Workflow sudah memakai `id-token: write` sehingga provenance dan autentikasi OIDC bekerja otomatis.

Uji workflow tanpa publikasi:

```bash
gh workflow run publish.yml -f dry-run=true
```

Manual dari VPS:

```bash
npm login
npm run verify
npm publish --access public
```

Panduan lengkap ada di [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Troubleshooting

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| `DOMAIN_REQUIRED` | Domain belum diisi | Set `PTERO_DOMAIN` atau jalankan `config init` |
| `AUTH_FAILED` / `PERMISSION_DENIED` | Key salah atau kurang permission | Buat key baru di panel, cek permission |
| `NO_FREE_ALLOCATION` | Node tanpa port kosong | Tambah allocation atau pilih node lain |
| `CIRCUIT_OPEN` | Terlalu banyak kegagalan | Tunggu reset timeout, cek kesehatan panel |
| `CONFLICT` saat operasi file | Server belum selesai instalasi | Gunakan `waitForInstall` |
| `VALIDATION_ERROR` soal environment | Egg tidak mengekspos variable | Isi `environment` manual atau biarkan gateway melengkapi otomatis |
| `UNSUPPORTED_PANEL_FEATURE` | Endpoint tidak tersedia | Gunakan `ptero-gateway doctor` untuk melihat kemampuan panel |

Jalankan `ptero-gateway explain <KODE_ERROR>` untuk penjelasan detail dan langkah perbaikan.

## Lisensi

MIT. Lihat [LICENSE](LICENSE).
