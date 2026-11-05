# Panduan Publish ke npm

Paket ini bernama `@akaanakbaik/pterodactyl-gateway` dan dipublikasikan sebagai public package dengan provenance.

## Ringkasan alur

1. Naikkan versi dan perbarui changelog.
2. Jalankan quality gate lokal.
3. Commit dan push ke `main`.
4. Workflow GitHub Actions memvalidasi, mempublikasikan, menunggu registry, lalu membuat tag dan GitHub Release otomatis.
5. Tag manual `v<versi>` tetap didukung untuk rilis yang dipicu langsung dari tag.

## Cara otomatis melalui GitHub Actions

### Sekali setup

1. Login ke npm sebagai `akaanakbaik`, lalu buka <https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway/access> dan pilih **Trusted Publisher**.
2. Pilih **GitHub Actions**, isi owner `akaanakbaik`, repository `pterodactyl-gateway`, workflow `publish.yml`, environment kosong, dan aktifkan izin **npm publish**.
3. Pastikan akun `akaanakbaik` adalah owner scope `@akaanakbaik` di npm. Bila belum, buat organization tersebut lebih dulu di <https://www.npmjs.com/org/create>.
4. Workflow sudah memakai `id-token: write` dan Node 24, sehingga OIDC dan provenance aktif tanpa token jangka panjang. Konfigurasi trusted publisher harus dipakai untuk publish sukses pertama dalam 2 hari.
5. Secret `NPM_TOKEN` hanya fallback. Jangan mengandalkan token automation dengan bypass 2FA karena npm menolaknya untuk publish langsung.

### Uji workflow tanpa mempublikasikan

Dari VPS yang sudah terpasang GitHub CLI dan login:

```bash
gh workflow run publish.yml -f dry-run=true
gh run list --workflow=publish.yml --limit 1
gh run watch
```

Workflow akan menjalankan seluruh quality gate lalu `npm publish --dry-run` tanpa mengirim paket ke registry.

### Setiap rilis

```bash
npm version patch --no-git-tag-version
npm run verify
git add -A
git commit -m "chore: rilis 1.6.1"
git push origin main
```

Workflow `.github/workflows/publish.yml` akan:

1. Menjalankan `npm ci` dan memeriksa versi yang sudah ada di npm.
2. Menjalankan `npm run verify` (typecheck, source guard, unit test, type consumer, CLI test, pack test, release guard).
3. Menjalankan `npm publish --provenance --access public` melalui OIDC, dengan `NPM_TOKEN` hanya sebagai fallback.
4. Menunggu versi dan dist-tag muncul di registry npm.
5. Membuat tag `v<versi>` dan GitHub Release dengan catatan changelog.

Jika ingin memicu rilis dari tag, buat tag yang sama dengan versi `package.json`:

```bash
git tag v1.6.1
git push origin v1.6.1
```

Semua publish memakai concurrency group yang sama agar tidak balapan. Jika versi sudah ada di npm, langkah publish dilewati dan workflow tetap boleh membuat atau memperbarui GitHub Release untuk tag tersebut.

Versi di `package.json`, `package-lock.json`, `src/version.ts`, README, dan CHANGELOG harus sama. Release guard akan gagal jika tidak sinkron.

## Trusted Publishing tanpa token

Cara ini menghindari penyimpanan token jangka panjang dan tetap menghasilkan provenance. Ini jalur utama workflow.

1. Buka <https://www.npmjs.com/package/@akaanakbaik/pterodactyl-gateway/access> lalu pilih **Trusted Publisher**.
2. Pilih **GitHub Actions**, isi owner `akaanakbaik`, repository `pterodactyl-gateway`, workflow `publish.yml`, dan environment kosong.
3. Aktifkan izin **npm publish** pada konfigurasi tersebut.
4. Workflow mencoba OIDC lebih dulu, lalu memakai `NPM_TOKEN` hanya jika OIDC gagal.
5. Pastikan runner memakai npm 11.5 atau lebih baru; workflow sudah memakai Node 24 yang memenuhinya.
6. Workflow berjalan otomatis dari push ke `main` dan dari tag `v*.*.*`; tidak perlu publish manual dari VPS.

## Cara manual dari VPS

```bash
npm login
npm whoami
npm run verify
npm publish --access public
```

Untuk uji tanpa mempublikasikan:

```bash
npm run publish:dry
```

Dry run tetap menjalankan seluruh quality gate lalu menampilkan isi paket.

## Verifikasi hasil publikasi

```bash
npm view @akaanakbaik/pterodactyl-gateway version
npm view @akaanakbaik/pterodactyl-gateway dist-tags
npx @akaanakbaik/pterodactyl-gateway@latest version --json
```

Uji konsumsi ESM dan CJS:

```bash
mkdir -p /tmp/pkg-check && cd /tmp/pkg-check
npm init -y
npm install @akaanakbaik/pterodactyl-gateway
node -e "import('@akaanakbaik/pterodactyl-gateway').then(m => console.log('esm', m.VERSION))"
node -e "console.log('cjs', require('@akaanakbaik/pterodactyl-gateway').VERSION)"
```

## Jika publikasi gagal

| Error | Penyebab | Solusi |
| --- | --- | --- |
| `E401` / `ENEEDAUTH` | Token tidak valid | Perbarui secret `NPM_TOKEN` |
| `E403` | Scope atau permission kurang | Pastikan token memiliki akses publish ke scope `@akaanakbaik` |
| `E403 Two-factor authentication is required` | npm menolak publish langsung dari token automation/bypass 2FA | Aktifkan Trusted Publishing dan biarkan workflow memakai OIDC; token hanya fallback |
| `EPUBLISHCONFLICT` | Versi sudah ada | Naikkan versi dengan `npm version patch` |
| `release guard gagal` | Versi tidak sinkron | Samakan versi di semua file lalu jalankan `npm run verify` |
| `provenance` gagal | Workflow tidak berjalan di GitHub Actions | Publikasikan melalui workflow, bukan lokal |
