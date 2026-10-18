# Blueprint Pterodactyl Gateway v1.5.0

## Visi

Menjadi gateway Pterodactyl paling lengkap untuk JavaScript dan TypeScript: satu paket yang bisa dipakai sebagai SDK, CLI, dan lapisan otomasi panel tanpa mengorbankan keamanan atau kejelasan error.

## Prinsip

1. Satu paket, empat jalur konsumsi: TS ESM, TS CJS, JS ESM, JS CJS.
2. Semua operasi punya jalur gagal yang jelas dengan kode error, petunjuk, dan langkah perbaikan.
3. Aman secara default: safe mode, redaksi kredensial, verifikasi TLS, dan konfirmasi destruktif.
4. Adatif terhadap varian panel: deteksi kemampuan endpoint dan fallback otomatis.
5. Performa terukur: retry, rate limit, circuit breaker, cache, dan metrik.
6. Nol komentar di source code; dokumentasi hidup di README dan folder docs.

## Arsitektur

| Lapisan | Modul | Tanggung jawab |
| --- | --- | --- |
| Publik | `index.ts`, `types.ts`, `version.ts` | Permukaan API, tipe, versi |
| Transport | `http.ts`, `cache.ts`, `rate.ts` | Request, cache, rate limit, circuit breaker, metrik |
| Domain | `gateway.ts`, `server.ts`, `schedule.ts`, `websocket.ts` | Resource Application/Client, handle server, schedule, realtime |
| Kecerdasan | `planner.ts`, `smart.ts`, `integrations.ts`, `templates.ts` | Kapasitas, alokasi, payload, preset |
| Layanan | `email.ts`, `logger.ts`, `errors.ts`, `utils.ts`, `env.ts` | Email, log, error, util, loader env |
| Antarmuka | `cli.ts`, `cli-entry.ts`, `wizard.ts`, `wizard-cli.ts`, `config.ts`, `meta.ts` | CLI, wizard, profil, metadata |

## Alur request

1. Pemanggil memanggil method resource atau `request()`.
2. `HttpCore` memvalidasi key, membangun URL, dan mengecek cache GET.
3. Dedupe singleflight mencegah request GET ganda bersamaan.
4. Rate limiter token bucket mengatur laju.
5. Circuit breaker memutus alur saat kegagalan beruntun.
6. `fetch` dijalankan dengan timeout dan `AbortSignal`.
7. Respons sukses menyimpan cache, memperbarui metrik, dan memicu hook.
8. Respons gagal dipetakan ke kode error, di-retry bila aman, atau dilempar.
9. Request non-GET membersihkan cache agar data tidak basi.

## Alur pembuatan server

1. Validasi input dan normalisasi spesifikasi.
2. Resolusi user (pakai yang ada, buat otomatis, atau tandai pending pada preview).
3. Ambil node, nest, dan egg dengan fallback endpoint.
4. Susun environment dari variable egg dan override pemanggil.
5. Pilih allocation sesuai strategi.
6. Bangun payload final dan kirim.
7. Bila panel meminta environment tambahan, lengkapi dan ulangi sekali.
8. Opsional menunggu instalasi selesai.

## Model kapasitas

- Kapasitas efektif: `limit x (1 + overallocate / 100)`, `0` berarti tak terbatas.
- Headroom: `(kapasitas efektif x (1 - reserve) - terpakai) / kebutuhan`.
- Skor penempatan: geometric mean headroom dengan log-scaling dan penalti fragmentasi port.
- Strategi: `balanced`, `pack`, `spread`, `memory`, `disk`, `ports`.
- Forecast: `min(kapasitas memori, disk, port)` dengan faktor pembatas utama.

## Roadmap

### 1.6
- Webhook terverifikasi untuk event panel.
- Antrean job persisten untuk backup massal.
- Mode read-only untuk dashboard publik.

### 1.7
- Adapter Pelican Panel.
- Dukungan multi-panel dengan routing profil.
- Plugin metrics Prometheus.

### 2.0
- Runtime edge untuk Cloudflare Workers.
- Streaming terminal dua arah dengan multiplex.
- Manajemen node dan allocation melalui CLI penuh.
