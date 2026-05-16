# Changelog

## 0.3.0

Rilis publik pertama yang sudah dites langsung pada panel Pterodactyl asli dan dipublish ke npm sebagai `@akaanakbaik/pterodactyl-gateway`.

### Package

- Publish ke npm public registry.
- Nama package publik: `@akaanakbaik/pterodactyl-gateway`.
- CLI global: `ptero-gateway` dan `ptg`.
- Support Node.js `>=18`.

### CLI admin

- `ptero-gateway admin users`
- `ptero-gateway admin servers`
- `ptero-gateway admin create-user`
- `ptero-gateway admin create-server --dry-run`
- `ptero-gateway admin create-server --yes`
- `ptero-gateway admin server <serverId> detail`
- `ptero-gateway admin server <serverId> limits`
- `ptero-gateway admin server <serverId> update-limits --backups 1 --yes`
- `ptero-gateway admin server <serverId> suspend --yes`
- `ptero-gateway admin server <serverId> unsuspend --yes`
- `ptero-gateway admin server <serverId> reinstall --yes`

### CLI client

- `ptero-gateway doctor`
- `ptero-gateway connect`
- `ptero-gateway ids`
- `ptero-gateway ids --nest <nestId>`
- `ptero-gateway servers`
- `ptero-gateway probe <identifier>`
- `ptero-gateway server <identifier> summary`
- `ptero-gateway server <identifier> resources`
- `ptero-gateway server <identifier> files [directory]`
- `ptero-gateway server <identifier> read <file>`
- `ptero-gateway server <identifier> write <file> <content> --yes`
- `ptero-gateway server <identifier> write <file> <content> --yes --allow-any-path`
- `ptero-gateway server <identifier> env`
- `ptero-gateway server <identifier> set-env KEY VALUE --yes`
- `ptero-gateway server <identifier> ports`
- `ptero-gateway server <identifier> databases`
- `ptero-gateway server <identifier> backups`
- `ptero-gateway server <identifier> backup <uuid>`
- `ptero-gateway server <identifier> delete-backup <uuid> --yes`
- `ptero-gateway server <identifier> schedules`
- `ptero-gateway server <identifier> init-node-alive --yes`
- `ptero-gateway server <identifier> start --yes`
- `ptero-gateway server <identifier> stop --yes`
- `ptero-gateway server <identifier> restart --yes`
- `ptero-gateway server <identifier> kill --yes`
- `ptero-gateway server <identifier> command "npm start" --yes`

### SDK

- `createPtero()`
- `createPtero.fromEnv()`
- `connect()`
- `doctor()`
- `raw.application`
- `raw.client`
- `users.createSmart()`
- `users.getOrCreate()`
- `servers.previewCreate()`
- `servers.createSmart()`
- `servers.createFromPreset()`
- `server(identifier).probe()`
- `server(identifier).resources()`
- `server(identifier).start()`
- `server(identifier).stop()`
- `server(identifier).restart()`
- `server(identifier).kill()`
- `server(identifier).command()`
- `server(identifier).files.*`
- `server(identifier).startup.*`
- `server(identifier).network.*`
- `server(identifier).databases.*`
- `server(identifier).backups.*`
- `server(identifier).schedules.*`

### Perbaikan penting

- File write Pterodactyl client memakai `POST /files/write`.
- Backup create memakai `ignored` string sesuai validasi panel.
- Startup variables mendukung format response `data[]` dan `relationships.variables.data[]`.
- Docker image egg auto-detect mendukung response `data.attributes` dan `attributes` langsung.
- CLI binary permission otomatis via `chmod:bin`.
- `SizeInput` dan `CpuInput` menerima string CLI biasa lalu divalidasi runtime.
- Guard command berbahaya tetap aktif.
- Write file CLI ke luar `/tmp` wajib `--allow-any-path`.

### Terbukti berhasil di panel asli

- create user `aka_test`.
- create server `aka test`.
- auto allocation.
- auto docker image.
- auto startup egg.
- probe client server.
- write/read file.
- set env `CMD_RUN`.
- server running dengan `node index.js`.
- update backup limit.
- backup detail dan delete backup.
- suspend dan unsuspend server.

## 0.2.x

- File manager wrapper.
- Startup variables wrapper.
- Network allocations wrapper.
- Database manager wrapper.
- Backup manager wrapper.
- Schedule manager wrapper.
- Probe read-only.
- Human-friendly CLI table output.

## 0.1.x

- Core SDK.
- Smart create user.
- Smart create server.
- Preview dan dry-run.
- Raw request.
- Error tutorial.
- CLI dasar.
- Test, typecheck, pack check.
