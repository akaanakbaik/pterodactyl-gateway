# Referensi CLI

Semua command mendukung `--json` untuk output mesin, `--yes` untuk konfirmasi non-interaktif, dan `--dry-run` untuk simulasi.

## Diagnosa

```bash
ptero-gateway doctor [--json]
ptero-gateway connect [--json]
ptero-gateway explain AUTH_FAILED
ptero-gateway self-check [--json]
ptero-gateway release-check [--json]
```

## Inventaris

```bash
ptero-gateway nodes
ptero-gateway allocations [--node 1]
ptero-gateway nests
ptero-gateway eggs [nestId] [--nest 5]
ptero-gateway egg-runtime 15
ptero-gateway users
ptero-gateway servers
```

## Perencanaan

```bash
ptero-gateway plan --memory 2GB --disk 5GB --cpu 200 --strategy balanced [--reserve 10] [--node 1]
ptero-gateway forecast --memory 1GB --disk 2GB --cpu 100
```

Spec dapat dioverride dengan `--memory`, `--disk`, `--cpu`, `--swap`, `--io`, `--databases`, `--allocations`, `--backups`, dan `--cpu-pinning`.

## Membuat resource

```bash
ptero-gateway create-user --username botuser --email owner@example.com --password auto [--admin] [--yes]
ptero-gateway create-server --name "bot saya" --email owner@example.com --node 1 --egg 15 --preset standard [--dry-run] [--yes]
ptero-gateway create-server --name demo --user-id 1 --node 1 --egg 15 --memory 1GB --disk 2GB --cpu 100 --env KEY=VALUE --allocation-strategy best-fit --yes
```

Opsi penting `create-server`:

| Opsi | Fungsi |
| --- | --- |
| `--preset` | `mini`, `basic`, `standard`, `premium`, `unlimited` |
| `--nest` | Nest ID, default dari `PTERO_NEST_ID` atau 5 |
| `--egg` | Egg ID, default dari `PTERO_EGG_ID` |
| `--startup` | Override startup command, default `auto` |
| `--docker-image` | Override image, default `auto` |
| `--env KEY=VALUE` | Dapat diulang |
| `--allocation-strategy` | `lowest-port`, `highest-port`, `best-fit`, `spread`, `contiguous`, `random`, `range` |
| `--port-range 3000-3100` | Batas port untuk strategi `range` |
| `--auto-create-user` | Buat user otomatis jika email belum terdaftar |
| `--no-start` | Jangan jalankan server setelah dibuat |

## Siklus hidup server

```bash
ptero-gateway suspend 12 --yes
ptero-gateway unsuspend 12 --yes
ptero-gateway reinstall 12 --yes
ptero-gateway delete-server 12 --yes [--force]
ptero-gateway delete-user 5 --yes
```

## Aksi server

```bash
ptero-gateway server <identifier> summary
ptero-gateway server <identifier> resources
ptero-gateway server <identifier> files [directory]
ptero-gateway server <identifier> read <file>
ptero-gateway server <identifier> download <file> [destination]
ptero-gateway server <identifier> write <file> [content] [--from local.txt] --yes
ptero-gateway server <identifier> upload <localFile> [remoteDir] --yes
ptero-gateway server <identifier> mkdir <root> <name> --yes
ptero-gateway server <identifier> startup
ptero-gateway server <identifier> set-env KEY VALUE --yes
ptero-gateway server <identifier> network
ptero-gateway server <identifier> databases
ptero-gateway server <identifier> backups
ptero-gateway server <identifier> create-backup [--name <name>] [--ignore node_modules] --yes
ptero-gateway server <identifier> wait-backup <uuid>
ptero-gateway server <identifier> delete-backup <uuid> --yes
ptero-gateway server <identifier> schedules
ptero-gateway server <identifier> schedule-create --name <name> --cron "0 3 * * *" --task backup: --yes
ptero-gateway server <identifier> schedule-run <scheduleId> --yes
ptero-gateway server <identifier> schedule-delete <scheduleId> --yes
ptero-gateway server <identifier> setup-backup --cron "0 3 * * *" --yes
ptero-gateway server <identifier> activity [page]
ptero-gateway server <identifier> console [--seconds 15]
ptero-gateway server <identifier> wait-state running
ptero-gateway server <identifier> ws-auth
ptero-gateway server <identifier> start|stop|restart|kill --yes
ptero-gateway server <identifier> command "npm start" --yes
```

Task schedule:

- `--task power:start`, `--task power:stop`, `--task power:restart`, `--task power:kill`
- `--task command:npm run build`
- `--task backup:`

## Backup dan email

```bash
ptero-gateway backup 12 --to owner@example.com [--keep] [--tar] --yes
ptero-gateway email-test --to owner@example.com --smtp-host smtp.example.com --smtp-port 587 --smtp-user user --smtp-pass secret
```

## Raw API

```bash
ptero-gateway raw application GET "/users?page=1"
ptero-gateway raw client POST "/servers/abc123/power" --body '{"signal":"start"}' --yes
```

## Konfigurasi

```bash
ptero-gateway config init --domain https://panel.example.com --ptla ptla_xxx --ptlc ptlc_xxx --profile prod
ptero-gateway config init --profile prod --from-env
ptero-gateway config list
ptero-gateway config show prod
ptero-gateway config use prod
ptero-gateway config rename prod produksi
ptero-gateway config delete produksi --yes
ptero-gateway config env
ptero-gateway config doctor
```

## Template dan completion

```bash
ptero-gateway templates list
ptero-gateway templates show nodejs-bot
ptero-gateway templates command wa-bot --name "wa" --email owner@example.com --node 1 --egg 15
ptero-gateway env-template
ptero-gateway completion bash
ptero-gateway completion zsh
ptero-gateway completion fish
```

## Wizard interaktif

```bash
ptero-wizard doctor
ptero-wizard create-user [--dry-run] [--yes]
ptero-wizard create-server [--dry-run] [--yes]
```
