# Catatan Proyek

## Identitas

- Nama paket: `@akaanakbaik/pterodactyl-gateway`
- Versi saat ini: `1.5.0`
- Lisensi: MIT
- Repository: <https://github.com/akaanakbaik/pterodactyl-gateway>
- Penulis: akaanakbaik

## Perintah penting

| Perintah | Fungsi |
| --- | --- |
| `npm run build` | Build ESM, CJS, deklarasi, dan tipe `.d.cts` |
| `npm run typecheck` | Typecheck ketat tanpa emit |
| `npm test` | Build lalu menjalankan seluruh unit test |
| `npm run test:types` | Verifikasi konsumsi tipe ESM dan CJS |
| `npm run test:live` | Live test terhadap panel asli |
| `npm run verify` | Quality gate lengkap sebelum rilis |
| `npm run publish:dry` | Simulasi publikasi npm |

## Struktur build

- ESM: `dist/index.js`, `dist/cli-entry.js`, `dist/wizard-cli.js`
- CJS: `dist/index.cjs`, `dist/cli-entry.cjs`, `dist/wizard-cli.cjs`
- Tipe ESM: `dist/*.d.ts`
- Tipe CJS: `dist/*.d.cts`

## Aturan source

- Tanpa komentar kode di `src`.
- Tanpa watermark atau atribusi pihak ketiga.
- Tanpa kredensial nyata di source; kredensial hanya lewat environment atau profil lokal.
- Semua error domain memakai `PteroError` dengan kode stabil.

## Catatan panel live

Panel uji `https://panel.akaa.dev` adalah varian Pterodactyl:

- Endpoint `/api/application/nests` tidak tersedia (404).
- Endpoint `/api/application/eggs` dan `/api/application/eggs/{id}?include=variables` tersedia.
- Payload pembuatan server memakai field `nest` dan `egg`.
- Entri direktori file dibungkus dalam `attributes`.
- Respons `/api/client/servers/{id}/resources` dibungkus `attributes`.
- Status server baru tetap `starting` sampai Wings menemukan string `config.startup.done` pada console.

Semua perbedaan ini ditangani otomatis oleh gateway.

## Pembersihan artefak uji

`scripts/live-test.mjs` menghapus server dan user yang dibuat melalui blok `finally`. Untuk pembersihan manual:

```bash
ptero-gateway servers
ptero-gateway delete-server <id> --yes --force
ptero-gateway users
ptero-gateway delete-user <id> --yes
```
