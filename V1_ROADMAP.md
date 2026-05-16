# Roadmap Menuju v1.0.0

Dokumen ini menjadi patokan pengembangan Akadev Pterodactyl Gateway dari `0.3.x` sampai `1.0.0`.

Prinsip utama: setiap fitur besar boleh dibuat bertahap, tetapi setiap rilis tetap wajib melewati `npm run verify` sebelum publish. Jangan menumpuk perubahan sampai v1 tanpa test, karena risiko bug akan terlalu besar.

## Status saat ini

Versi npm publik terbaru: `@akaanakbaik/pterodactyl-gateway@0.3.1`.

Fitur yang sudah terbukti di panel asli:

- koneksi PTLA/PTLC
- create user
- create server dry-run
- create server asli
- auto docker image
- auto startup egg
- auto allocation
- admin users
- admin servers
- admin server detail/limits/update-limits
- admin suspend/unsuspend/reinstall
- client probe
- server summary/resources
- file list/read/write
- startup/env read/set
- ports/network read
- databases list
- backups list/detail/delete/create
- schedules list
- init-node-alive
- power control
- npm publish public
- global install CLI

## v0.4.0 - Admin helper dan allocation helper

Target:

- `admin user <id> detail`
- `admin node <id> detail`
- `admin node <id> allocations`
- `admin node <id> create-allocation --ip 0.0.0.0 --ports 2006-2010 --yes`
- `admin node <id> allocation-summary`
- CLI output lebih ramah untuk allocation kosong/terpakai
- command `version`
- README update sesuai fitur baru

Alasan:

Create server sangat bergantung pada allocation kosong. Sebelum fitur besar seperti wizard/TUI, allocation helper wajib kuat dulu.

## v0.5.0 - Wizard CLI pemula

Target:

- `ptero-gateway wizard create-user`
- `ptero-gateway wizard create-server`
- prompt interaktif untuk domain, PTLA, PTLC, node, nest, egg, spek, email, username, password
- preview payload sebelum eksekusi
- validasi ID node/nest/egg dengan petunjuk jelas
- rekomendasi spek dari preset

Alasan:

Agar pemula tidak perlu hafal semua argumen CLI.

## v0.6.0 - Template deploy project

Target:

- `server <id> init-node-alive`
- `server <id> init-node-api`
- `server <id> init-express`
- `server <id> init-bot`
- `server <id> deploy-git --repo <url> --branch main --yes`
- `server <id> install --yes`
- `server <id> run-script start --yes`

Alasan:

Gateway bukan hanya membuat server, tetapi juga membantu menghidupkan project siap jalan.

## v0.7.0 - Console dan realtime bridge

Target:

- `server <id> websocket --json`
- `server <id> console`
- `server <id> logs --tail 100`
- fallback polling resources
- event emitter SDK untuk resources dan console
- masking token websocket di output non-json

Alasan:

Kontrol server belum lengkap tanpa console/logs.

## v0.8.0 - Cleanup aman dan guard permanen

Target:

- `admin server <id> delete --confirm-server-id <id> --yes`
- `admin user <id> delete --confirm-user-id <id> --yes`
- `server <id> delete-file <path> --confirm-file <path> --yes`
- `server <id> clean-node-modules --yes`
- dry-run untuk aksi destructive
- audit log lokal opsional

Alasan:

Delete permanen harus ada, tetapi wajib punya double-confirm agar aman.

## v0.9.0 - Stabilitas SDK dan compatibility layer

Target:

- adapter untuk variasi response panel/fork
- retry ringan untuk request tertentu
- timeout lebih rapi
- error mapping lebih lengkap
- pagination helper
- unit test lebih banyak untuk edge cases
- fixture untuk response panel asli

Alasan:

Sebelum v1, SDK harus stabil untuk banyak panel dan fork Pterodactyl.

## v1.0.0 - Stabil release

Target wajib v1:

- API publik stabil
- CLI stabil
- docs lengkap
- changelog lengkap
- semua fitur utama sudah dites di panel asli
- `npm run verify` hijau
- GitHub Actions hijau
- npm package public install sukses
- README cocok dengan fitur asli
- add-promt.md cocok untuk integrasi AI
- tidak ada fitur yang diklaim tapi belum tersedia

Definisi v1 selesai:

- user bisa install dengan `npm i -g @akaanakbaik/pterodactyl-gateway`
- user bisa connect panel dengan env
- user bisa membuat user dan server dengan dry-run/create asli
- user bisa mengontrol server, file, env, backup, schedule, port
- user bisa melihat console/logs atau minimal websocket info
- user bisa melakukan cleanup aman
- user pemula bisa memakai wizard tanpa membaca source

## Aturan testing

Setiap milestone wajib:

```bash
npm run verify
```

Sebelum publish wajib:

```bash
npm view @akaanakbaik/pterodactyl-gateway@<version> version --registry=https://registry.npmjs.org/
npm publish --access public
npm i -g @akaanakbaik/pterodactyl-gateway@<version>
ptero-gateway doctor
```

Untuk test panel asli minimal:

```bash
ptero-gateway doctor
ptero-gateway ids
ptero-gateway admin users
ptero-gateway admin servers
ptero-gateway servers
ptero-gateway probe <identifier>
ptero-gateway server <identifier> summary
```

## Catatan penting

Jangan klaim fitur sudah stabil sebelum:

- ada command atau API-nya di source
- masuk README/add-promt
- lulus typecheck
- lulus unit test minimal
- diuji di VPS/panel asli jika fitur menyentuh Pterodactyl langsung
