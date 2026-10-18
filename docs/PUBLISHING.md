# Panduan Publish ke npm

Paket ini bernama `@akaanakbaik/pterodactyl-gateway` dan dipublikasikan sebagai public package dengan provenance.

## Ringkasan alur

1. Naikkan versi dan perbarui changelog.
2. Jalankan quality gate lokal.
3. Buat tag versi.
4. Workflow GitHub Actions memvalidasi dan mempublikasikan otomatis.

## Cara otomatis melalui GitHub Actions

### Sekali setup

1. Login ke npm sebagai `akaanakbaik`, lalu buka <https://www.npmjs.com/settings/tokens> dan buat **Granular Access Token** dengan izin **Read and write** untuk package `@akaanakbaik/pterodactyl-gateway` (atau **Automation** token bila memakai akun klasik).
2. Buka <https://github.com/akaanakbaik/pterodactyl-gateway/settings/secrets/actions>.
3. Klik **New repository secret**, isi nama `NPM_TOKEN`, lalu tempel token npm tadi.
4. Pastikan akun `akaanakbaik` adalah owner scope `@akaanakbaik` di npm. Bila belum, buat organization tersebut lebih dulu di <https://www.npmjs.com/org/create>.
5. Bila memakai 2FA publish, gunakan token granular dengan bypass 2FA atau aktifkan **Require two-factor authentication for write actions** pada level token.

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
git commit -m "chore: rilis 1.5.1"
git push
git tag v1.5.1
git push origin v1.5.1
```

Workflow `.github/workflows/publish.yml` akan:

1. Menjalankan `npm ci`.
2. Menjalankan `npm run verify` (typecheck, source guard, unit test, type consumer, CLI test, pack test, release guard).
3. Menjalankan `npm publish --provenance --access public`.
4. Membuat GitHub Release dengan catatan changelog.

Versi di `package.json`, `package-lock.json`, `src/version.ts`, README, dan CHANGELOG harus sama. Release guard akan gagal jika tidak sinkron.

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
| `EPUBLISHCONFLICT` | Versi sudah ada | Naikkan versi dengan `npm version patch` |
| `release guard gagal` | Versi tidak sinkron | Samakan versi di semua file lalu jalankan `npm run verify` |
| `provenance` gagal | Workflow tidak berjalan di GitHub Actions | Publikasikan melalui workflow, bukan lokal |
