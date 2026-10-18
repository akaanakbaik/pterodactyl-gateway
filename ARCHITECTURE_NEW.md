# Arsitektur v1.5.0

Dokumen ini menjelaskan struktur modul, aliran data, dan titik ekstensi gateway.

## Peta modul

```
src/
  index.ts          permukaan API publik
  version.ts        konstanta versi dan user agent
  types.ts          seluruh tipe publik
  errors.ts         PteroError, ErrorFactory, helper error
  logger.ts         logger dengan level dan redaksi
  utils.ts          parsing, matematika, format, cron, kriptografi
  cache.ts          LRU + TTL
  rate.ts           token bucket, semaphore, circuit breaker, metrik
  http.ts           mesin HTTP tunggal untuk kedua API
  planner.ts        analitik kapasitas, skor penempatan, bin packing
  smart.ts          payload user/server, environment, allocation
  integrations.ts   preset integrasi siap pakai
  templates.ts      template deployment
  email.ts          transport SMTP, template, verifikasi
  gateway.ts        PteroGateway: resources, perencanaan, backup
  server.ts         PteroServerHandle: file, backup, schedule, dsb
  schedule.ts       PteroScheduleBuilder tervalidasi
  websocket.ts      klien WebSocket resilien
  config.ts         profil CLI di ~/.pterodactyl-gateway
  env.ts            loader .env tanpa dependensi
  cli-args.ts       parser argumen
  cli.ts            implementasi command
  cli-entry.ts      dispatcher CLI
  wizard.ts         alur interaktif
  wizard-cli.ts     entry wizard
  meta.ts           version, self-check, release-check
```

## Grafik dependensi

```
index ─▶ gateway ─▶ http ─▶ rate/cache/errors/logger/utils
             │        └▶ planner
             ├▶ server ─▶ schedule ─▶ websocket
             ├▶ smart ─▶ planner
             ├▶ email
             └▶ integrations ─▶ types
cli-entry ─▶ cli ─▶ index
wizard-cli ─▶ wizard ─▶ index
```

Tidak ada siklus runtime: ketergantungan yang berputar memakai `import type`.

## Kontrak build

- `tsup` menghasilkan ESM (`dist/*.js`) dan CJS (`dist/*.cjs`).
- `tsc -p tsconfig.types.json` menghasilkan deklarasi ESM (`dist/*.d.ts`).
- `scripts/emit-cjs-types.mjs` menyalin deklarasi menjadi `dist/*.d.cts` dengan specifier `.cjs`.
- `package.json` memakai kondisi `import` dan `require` terpisah agar resolusi tipe tepat.

## Titik ekstensi

1. **Fetcher kustom** melalui opsi `fetcher` untuk proxy, mock, atau runtime non-Node.
2. **Hook** `onRequest`, `onResponse`, `onRetry`, `onError` untuk tracing dan audit.
3. **Preset** kustom melalui opsi `presets` pada `PteroConfig`.
4. **Strategi penempatan** melalui `nodeStrategy` atau parameter `planServer`.
5. **Integrasi** melalui `createIntegrationService` untuk alur deploy berulang.
6. **Raw request** melalui `ptero.request()` untuk endpoint yang belum dibungkus.

## Invarian

- Setiap request memakai tepat satu kunci API sesuai scope.
- Cache hanya menyimpan GET sukses dan selalu dibersihkan setelah mutasi.
- Operasi destruktif selalu melewati `ensureDestructiveOperation`.
- Semua file sementara backup dihapus pada blok `finally`.
- Semua error domain melewati `PteroError` dengan kode stabil.
