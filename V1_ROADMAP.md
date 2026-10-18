# Roadmap

Baseline saat ini: **1.5.0**.

## Selesai di 1.5.0

- Dual module lengkap: ESM dan CommonJS untuk JavaScript maupun TypeScript, termasuk deklarasi `.d.cts`.
- Mesin HTTP dengan retry, rate limit, circuit breaker, cache LRU + TTL, dedupe, metrik, dan hook.
- Planner kapasitas dengan skor penempatan, forecast, bin packing, dan analisis fragmentasi port.
- Alur pembuatan server pintar dengan deteksi kemampuan panel, resolusi environment, dan `waitForInstall`.
- Handle server lengkap dengan file manager, backup, schedule, database, network, dan WebSocket.
- CLI operasional penuh, wizard interaktif, profil config, dan loader `.env`.
- Live test end-to-end dengan pembersihan otomatis serta type consumer test.

## Berikutnya

### 1.6

- Webhook terverifikasi untuk event server dan backup.
- Antrean job persisten untuk backup massal dan deploy batch.
- Mode read-only untuk dashboard publik.
- Retensi backup otomatis berbasis kebijakan.

### 1.7

- Adapter Pelican Panel.
- Routing multi-panel berbasis profil dalam satu proses.
- Exporter metrics Prometheus.
- CLI interaktif penuh untuk manajemen node dan allocation.

### 2.0

- Runtime edge untuk Cloudflare Workers.
- Streaming terminal dua arah dengan multiplex.
- Manajemen node, location, dan allocation end-to-end melalui CLI.
- Plugin system untuk integrasi pihak ketiga.
