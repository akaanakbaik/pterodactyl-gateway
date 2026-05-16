#!/usr/bin/env node
import { createPtero, explainError } from "./index.js";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const yesMode = rawArgs.includes("--yes") || rawArgs.includes("-y");
const dryRunMode = rawArgs.includes("--dry-run");
const allowAnyPath = rawArgs.includes("--allow-any-path");
const args = rawArgs.filter(arg => arg !== "--json" && arg !== "--yes" && arg !== "-y" && arg !== "--dry-run" && arg !== "--allow-any-path");
const command = args[0] ?? "help";

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const ptero = createPtero.fromEnv();

  if (command === "doctor") {
    const report = await ptero.doctor();
    output(report, formatDoctor(report));
    process.exitCode = asRecord(report).ok ? 0 : 1;
    return;
  }

  if (command === "connect") {
    const result = await ptero.connect();
    output(result, formatConnect(result));
    return;
  }

  if (command === "ids") {
    const nestIndex = args.indexOf("--nest");
    const nestId = nestIndex >= 0 ? Number(args[nestIndex + 1]) : undefined;
    const result = await ptero.listIds(nestId);
    output(result);
    return;
  }

  if (command === "servers") {
    const raw = await ptero.raw.client.get("/");
    const servers = formatClientServers(raw);
    output(servers, table(servers, ["identifier", "name", "node", "serverOwner"]));
    return;
  }

  if (command === "admin") {
    const scope = args[1];
    if (!scope) throw new Error("Format: ptero-gateway admin <users|servers|server|create-user|create-server>");

    if (scope === "users") {
      const result = await ptero.raw.application.get("/users?per_page=100");
      output(result, formatAdminUsers(result));
      return;
    }

    if (scope === "servers") {
      const result = await ptero.raw.application.get("/servers?per_page=100");
      output(result, formatAdminServers(result));
      return;
    }

    if (scope === "create-user") {
      if (!dryRunMode) requireYes("create user");
      const username = getRequiredOption("--username");
      const email = getRequiredOption("--email");
      const password = getOption("--password") ?? "auto";
      const administrator = parseBooleanOption("--admin", false);
      const result = await ptero.users.createSmart({ username, email, password, administrator }, { dryRun: dryRunMode });
      output(result, dryRunMode ? formatDryRun("Create user", result) : formatCreatedUser(result));
      return;
    }

    if (scope === "create-server") {
      if (!dryRunMode) requireYes("create server");
      const input = buildCreateServerInput();
      const result = await ptero.servers.createSmart(input, { dryRun: dryRunMode });
      output(result, dryRunMode ? formatDryRun("Create server", result) : formatCreatedServer(result));
      return;
    }

    if (scope === "server") {
      const serverId = args[2];
      const action = args[3];
      if (!serverId || !action) throw new Error("Format: ptero-gateway admin server <serverId> <detail|limits|update-limits|suspend|unsuspend|reinstall>");

      if (action === "detail") {
        const result = await ptero.raw.application.get(`/servers/${serverId}`);
        output(result, formatAdminServerDetail(result));
        return;
      }

      if (action === "limits") {
        const result = await ptero.raw.application.get(`/servers/${serverId}`);
        output(result, formatAdminServerLimits(result));
        return;
      }

      if (action === "update-limits") {
        requireYes("update server limits");
        const current = await ptero.raw.application.get(`/servers/${serverId}`);
        const payload = buildLimitPayload(current);
        const result = await ptero.raw.application.patch(`/servers/${serverId}/build`, payload);
        output(result, "Limit server berhasil di-update.");
        return;
      }

      if (action === "suspend") {
        requireYes("suspend server");
        output(await ptero.raw.application.post(`/servers/${serverId}/suspend`), `Server ${serverId} berhasil di-suspend.`);
        return;
      }

      if (action === "unsuspend") {
        requireYes("unsuspend server");
        output(await ptero.raw.application.post(`/servers/${serverId}/unsuspend`), `Server ${serverId} berhasil di-unsuspend.`);
        return;
      }

      if (action === "reinstall") {
        requireYes("reinstall server");
        output(await ptero.raw.application.post(`/servers/${serverId}/reinstall`), `Server ${serverId} berhasil diminta reinstall.`);
        return;
      }
    }

    throw new Error(`Admin command tidak dikenal: ${scope}`);
  }

  if (command === "probe") {
    const id = args[1];
    if (!id) throw new Error("Format: ptero-gateway probe <identifier>");
    if (isPlaceholderIdentifier(id)) throw new Error("IDENTIFIER_SERVER hanya placeholder. Jalankan `ptero-gateway servers`, lalu salin nilai `identifier` server yang ingin dicek.");
    const report = await ptero.server(id).probe();
    output(report, formatProbe(report));
    process.exitCode = asRecord(report).ok ? 0 : 1;
    return;
  }

  if (command === "server") {
    const id = args[1];
    const action = args[2];
    if (!id || !action) throw new Error("Format: ptero-gateway server <identifier> <action>");
    if (isPlaceholderIdentifier(id)) throw new Error("IDENTIFIER_SERVER hanya placeholder. Jalankan `ptero-gateway servers`, lalu salin nilai `identifier` server yang ingin dikontrol.");
    const server = ptero.server(id);

    if (action === "summary") {
      const [resources, startup, network, databases, backups, schedules] = await Promise.all([
        server.resources().catch(errorResult),
        server.startup.variables().catch(errorResult),
        server.network.list().catch(errorResult),
        server.databases.list().catch(errorResult),
        server.backups.list().catch(errorResult),
        server.schedules.list().catch(errorResult)
      ]);
      const result = { identifier: id, resources, startup, network, databases, backups, schedules };
      output(result, formatSummary(result));
    }
    else if (action === "start") {
      requireYes("start server");
      output(await server.start(), "Power signal terkirim: start");
    }
    else if (action === "stop") {
      requireYes("stop server");
      output(await server.stop(), "Power signal terkirim: stop");
    }
    else if (action === "restart") {
      requireYes("restart server");
      output(await server.restart(), "Power signal terkirim: restart");
    }
    else if (action === "kill") {
      requireYes("kill server");
      output(await server.kill(), "Power signal terkirim: kill");
    }
    else if (action === "resources") {
      const result = await server.resources();
      output(result, formatResources(result));
    }
    else if (action === "command") {
      requireYes("send command");
      const commandToSend = args.slice(3).join(" ");
      if (!commandToSend) throw new Error("Format: ptero-gateway server <identifier> command \"npm start\" --yes");
      output(await server.command(commandToSend), `Command terkirim: ${commandToSend}`);
    }
    else if (action === "files") {
      const result = await server.files.list(args[3] ?? "/");
      output(result, formatFiles(result));
    }
    else if (action === "read") console.log(await server.files.read(args[3] ?? "/"));
    else if (action === "write") {
      requireYes("write file");
      const file = args[3];
      const content = args.slice(4).join(" ");
      if (!file || !content) throw new Error("Format: ptero-gateway server <identifier> write /tmp/test.txt \"isi file\" --yes");
      if (!allowAnyPath && !isSafeTmpPath(file)) throw new Error("Demi keamanan, write via CLI default hanya boleh ke /tmp/. Tambahkan --allow-any-path jika benar-benar ingin menulis ke path lain.");
      output(await server.files.write(file, content), `File berhasil ditulis: ${file}`);
    }
    else if (action === "init-node-alive") {
      requireYes("init node alive template");
      const packageJson = JSON.stringify({ scripts: { start: "node index.js" }, dependencies: {} });
      const indexJs = 'console.log("running"); setInterval(() => console.log("tick", new Date().toISOString()), 30000);';
      await server.files.write("/package.json", packageJson);
      await server.files.write("/index.js", indexJs);
      await server.startup.set("CMD_RUN", "node index.js");
      output({ ok: true }, "Template Node alive berhasil dipasang. Jalankan: ptero-gateway server <identifier> start --yes");
    }
    else if (action === "startup" || action === "env") {
      const result = await server.startup.variables();
      output(result, formatStartup(result));
    }
    else if (action === "set-env") {
      requireYes("set startup variable");
      const key = args[3];
      const value = args.slice(4).join(" ");
      if (!key || !value) throw new Error("Format: ptero-gateway server <identifier> set-env KEY VALUE --yes");
      output(await server.startup.set(key, value), `Variable ${key} berhasil diubah menjadi ${maskIfSecret(key, value)}`);
    }
    else if (action === "network" || action === "ports") {
      const result = await server.network.list();
      output(result, formatNetwork(result));
    }
    else if (action === "databases") {
      const result = await server.databases.list();
      output(result, formatNamedList(result, "database"));
    }
    else if (action === "backups") {
      const result = await server.backups.list();
      output(result, formatNamedList(result, "backup"));
    }
    else if (action === "backup") {
      const backupId = args[3];
      if (!backupId) throw new Error("Format: ptero-gateway server <identifier> backup <uuid>");
      const result = await server.backups.details(backupId);
      output(result, formatBackupDetail(result));
    }
    else if (action === "delete-backup") {
      requireYes("delete backup");
      const backupId = args[3];
      if (!backupId) throw new Error("Format: ptero-gateway server <identifier> delete-backup <uuid> --yes");
      output(await server.backups.delete(backupId), `Backup ${backupId} berhasil dihapus.`);
    }
    else if (action === "create-backup") {
      requireYes("create backup");
      const name = getOption("--name") ?? `backup-${new Date().toISOString()}`;
      output(await server.backups.create({ name }), `Backup dibuat: ${name}`);
    }
    else if (action === "schedules") {
      const result = await server.schedules.list();
      output(result, formatNamedList(result, "schedule"));
    }
    else throw new Error(`Action server tidak dikenal: ${action}`);
    return;
  }

  throw new Error(`Command tidak dikenal: ${command}`);
}

function output(raw: unknown, pretty?: string) {
  if (jsonMode || !pretty) console.log(JSON.stringify(raw, null, 2));
  else console.log(pretty);
}

function requireYes(action: string) {
  if (!yesMode) throw new Error(`Aksi '${action}' mengubah server. Tambahkan --yes jika kamu yakin.`);
}

function getOption(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function getRequiredOption(name: string): string {
  const value = getOption(name);
  if (!value) throw new Error(`Opsi ${name} wajib diisi.`);
  return value;
}

function getNumberOption(name: string, fallback: number): number {
  const value = getOption(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} harus berupa angka.`);
  return parsed;
}

function parseBooleanOption(name: string, fallback: boolean): boolean {
  const value = getOption(name);
  if (value === undefined) return fallback;
  if (["1", "true", "yes", "y"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "n"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} harus true/false.`);
}

function errorResult(error: unknown) {
  return { error: error instanceof Error ? error.message : String(error) };
}

function buildCreateServerInput() {
  const username = getOption("--username");
  const password = getOption("--password");
  return {
    name: getRequiredOption("--name"),
    email: getRequiredOption("--email"),
    username,
    password,
    autoCreateUser: Boolean(username),
    description: getOption("--description") ?? "Created by Akadev Pterodactyl Gateway",
    nodeId: getNumberOption("--node", 1),
    nestId: getNumberOption("--nest", 5),
    eggId: getNumberOption("--egg", 18),
    dockerImage: getOption("--docker-image") ?? "auto",
    startup: getOption("--startup") ?? "auto",
    specs: {
      memory: getOption("--memory") ?? "1GB",
      disk: getOption("--disk") ?? "2GB",
      cpu: getOption("--cpu") ?? "100%",
      databases: getNumberOption("--databases", 0),
      allocations: getNumberOption("--allocations", 1),
      backups: getNumberOption("--backups", 0),
      swap: getNumberOption("--swap", 0),
      io: getNumberOption("--io", 500)
    }
  };
}

function buildLimitPayload(raw: unknown): Record<string, unknown> {
  const attributes = getAttributes(raw);
  const limits = asRecord(attributes.limits);
  const featureLimits = asRecord(attributes.feature_limits);
  const allocation = Number(attributes.allocation ?? 0);
  if (!allocation) throw new Error("Tidak bisa membaca default allocation server dari Application API.");
  return {
    allocation,
    memory: getNumberOption("--memory", Number(limits.memory ?? 0)),
    swap: getNumberOption("--swap", Number(limits.swap ?? 0)),
    disk: getNumberOption("--disk", Number(limits.disk ?? 0)),
    io: getNumberOption("--io", Number(limits.io ?? 500)),
    cpu: getNumberOption("--cpu", Number(limits.cpu ?? 0)),
    threads: getOption("--threads") ?? String(limits.threads ?? ""),
    feature_limits: {
      databases: getNumberOption("--databases", Number(featureLimits.databases ?? 0)),
      allocations: getNumberOption("--allocations", Number(featureLimits.allocations ?? 0)),
      backups: getNumberOption("--backups", Number(featureLimits.backups ?? 0))
    }
  };
}

function formatDoctor(report: unknown): string {
  const root = asRecord(report);
  const checks = Array.isArray(root.checks) ? root.checks.map(asRecord) : [];
  const lines = [`Doctor: ${root.ok ? "OK" : "FAILED"}`, `Mode: ${root.mode ?? "unknown"}`, ""];
  for (const check of checks) lines.push(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.message ?? ""}`);
  return lines.join("\n");
}

function formatConnect(result: unknown): string {
  const root = asRecord(result);
  return [`Connect: ${root.ok ? "OK" : "FAILED"}`, `Mode: ${root.mode ?? "unknown"}`, `Domain: ${root.domain ?? "-"}`, `Latency: ${root.latency ?? 0}ms`].join("\n");
}

function formatProbe(report: unknown): string {
  const root = asRecord(report);
  const checks = asRecord(root.checks);
  const lines = [`Probe ${root.identifier ?? ""}: ${root.ok ? "OK" : "FAILED"}`, ""];
  for (const [name, checkValue] of Object.entries(checks)) {
    const check = asRecord(checkValue);
    lines.push(`${check.ok ? "✓" : "✗"} ${name}: ${check.message ?? ""}`);
  }
  return lines.join("\n");
}

function formatSummary(result: unknown): string {
  const root = asRecord(result);
  const lines = [`Server Summary: ${root.identifier}`, ""];
  lines.push(formatResources(root.resources));
  lines.push("");
  lines.push("Files/Startup/Network/DB/Backup/Schedule:");
  lines.push(`startup variables: ${countCollection(root.startup)}`);
  lines.push(`ports: ${countCollection(root.network)}`);
  lines.push(`databases: ${countCollection(root.databases)}`);
  lines.push(`backups: ${countCollection(root.backups)}`);
  lines.push(`schedules: ${countCollection(root.schedules)}`);
  return lines.join("\n");
}

function formatResources(raw: unknown): string {
  const attributes = asRecord(asRecord(raw).attributes);
  const resources = asRecord(attributes.resources);
  return [
    `State: ${attributes.current_state ?? "unknown"}`,
    `Suspended: ${attributes.is_suspended ? "yes" : "no"}`,
    `Memory: ${formatBytes(Number(resources.memory_bytes ?? 0))}`,
    `Disk: ${formatBytes(Number(resources.disk_bytes ?? 0))}`,
    `CPU: ${Number(resources.cpu_absolute ?? 0).toFixed(2)}%`,
    `Network RX: ${formatBytes(Number(resources.network_rx_bytes ?? 0))}`,
    `Network TX: ${formatBytes(Number(resources.network_tx_bytes ?? 0))}`,
    `Uptime: ${formatDuration(Number(resources.uptime ?? 0))}`
  ].join("\n");
}

function formatFiles(raw: unknown): string {
  const rows = getCollection(raw).map(item => {
    const attributes = asRecord(item.attributes);
    return {
      type: attributes.is_file ? "file" : "dir",
      name: String(attributes.name ?? ""),
      size: attributes.is_file ? formatBytes(Number(attributes.size ?? 0)) : "-",
      modified: String(attributes.modified_at ?? "")
    };
  });
  return rows.length ? table(rows, ["type", "name", "size", "modified"]) : "Folder kosong.";
}

function formatStartup(raw: unknown): string {
  const rows = getCollection(raw).map(item => {
    const attributes = asRecord(item.attributes);
    return {
      variable: String(attributes.env_variable ?? ""),
      value: maskIfSecret(String(attributes.env_variable ?? ""), String(attributes.server_value ?? "")),
      editable: String(Boolean(attributes.is_editable))
    };
  });
  return rows.length ? table(rows, ["variable", "value", "editable"]) : "Startup variable kosong.";
}

function formatNetwork(raw: unknown): string {
  const rows = getCollection(raw).map(item => {
    const attributes = asRecord(item.attributes);
    return {
      id: String(attributes.id ?? ""),
      ip: String(attributes.ip_alias ?? attributes.ip ?? ""),
      port: String(attributes.port ?? ""),
      default: attributes.is_default ? "yes" : "no",
      notes: String(attributes.notes ?? "")
    };
  });
  return rows.length ? table(rows, ["id", "ip", "port", "default", "notes"]) : "Allocation kosong.";
}

function formatNamedList(raw: unknown, label: string): string {
  const rows = getCollection(raw).map((item, index) => {
    const attributes = asRecord(item.attributes);
    return {
      no: String(index + 1),
      name: String(attributes.name ?? attributes.database ?? attributes.uuid ?? attributes.id ?? "-"),
      status: String(attributes.completed_at ? "completed" : attributes.is_successful === false ? "failed" : attributes.is_active === false ? "inactive" : "active")
    };
  });
  return rows.length ? table(rows, ["no", "name", "status"]) : `${label} kosong.`;
}

function formatClientServers(raw: unknown) {
  const data = getCollection(raw);
  return data.map(item => {
    const attributes = asRecord(item.attributes);
    return {
      identifier: String(attributes.identifier ?? ""),
      uuid: String(attributes.uuid ?? ""),
      name: String(attributes.name ?? ""),
      node: String(attributes.node ?? ""),
      serverOwner: Boolean(attributes.server_owner ?? false)
    };
  });
}

function formatAdminUsers(raw: unknown): string {
  const rows = getCollection(raw).map(item => {
    const attributes = asRecord(item.attributes);
    return {
      id: String(attributes.id ?? ""),
      username: String(attributes.username ?? ""),
      email: String(attributes.email ?? ""),
      admin: String(Boolean(attributes.root_admin ?? false))
    };
  });
  return rows.length ? table(rows, ["id", "username", "email", "admin"]) : "User kosong.";
}

function formatAdminServers(raw: unknown): string {
  const rows = getCollection(raw).map(item => {
    const attributes = asRecord(item.attributes);
    const limits = asRecord(attributes.limits);
    const feature = asRecord(attributes.feature_limits);
    return {
      id: String(attributes.id ?? ""),
      identifier: String(attributes.identifier ?? ""),
      name: String(attributes.name ?? ""),
      memory: String(limits.memory ?? ""),
      disk: String(limits.disk ?? ""),
      cpu: String(limits.cpu ?? ""),
      backups: String(feature.backups ?? "")
    };
  });
  return rows.length ? table(rows, ["id", "identifier", "name", "memory", "disk", "cpu", "backups"]) : "Server kosong.";
}

function formatAdminServerDetail(raw: unknown): string {
  const attributes = getAttributes(raw);
  return [
    `ID: ${attributes.id ?? "-"}`,
    `Identifier: ${attributes.identifier ?? "-"}`,
    `UUID: ${attributes.uuid ?? "-"}`,
    `Name: ${attributes.name ?? "-"}`,
    `Owner ID: ${attributes.user ?? "-"}`,
    `Node ID: ${attributes.node ?? "-"}`,
    `Allocation ID: ${attributes.allocation ?? "-"}`,
    "",
    formatAdminServerLimits(raw)
  ].join("\n");
}

function formatAdminServerLimits(raw: unknown): string {
  const attributes = getAttributes(raw);
  const limits = asRecord(attributes.limits);
  const feature = asRecord(attributes.feature_limits);
  const rows = [
    { name: "memory", value: String(limits.memory ?? "") },
    { name: "swap", value: String(limits.swap ?? "") },
    { name: "disk", value: String(limits.disk ?? "") },
    { name: "io", value: String(limits.io ?? "") },
    { name: "cpu", value: String(limits.cpu ?? "") },
    { name: "threads", value: String(limits.threads ?? "") },
    { name: "databases", value: String(feature.databases ?? "") },
    { name: "allocations", value: String(feature.allocations ?? "") },
    { name: "backups", value: String(feature.backups ?? "") }
  ];
  return table(rows, ["name", "value"]);
}

function formatBackupDetail(raw: unknown): string {
  const attributes = getAttributes(raw);
  return [
    `UUID: ${attributes.uuid ?? "-"}`,
    `Name: ${attributes.name ?? "-"}`,
    `Successful: ${attributes.is_successful ? "yes" : "no"}`,
    `Locked: ${attributes.is_locked ? "yes" : "no"}`,
    `Bytes: ${formatBytes(Number(attributes.bytes ?? 0))}`,
    `Checksum: ${attributes.checksum ?? "-"}`,
    `Created: ${attributes.created_at ?? "-"}`,
    `Completed: ${attributes.completed_at ?? "-"}`
  ].join("\n");
}

function formatDryRun(title: string, raw: unknown): string {
  const root = asRecord(raw);
  const payload = asRecord(root.payload);
  const preview = asRecord(root.preview);
  const lines = [`${title} dry-run OK`, ""];
  if (payload.username || payload.email) {
    lines.push(`username: ${payload.username ?? "-"}`);
    lines.push(`email: ${payload.email ?? "-"}`);
  }
  if (payload.name || preview.dockerImage) {
    lines.push(`server: ${payload.name ?? "-"}`);
    lines.push(`docker: ${preview.dockerImage ?? payload.docker_image ?? "-"}`);
    lines.push(`startup: ${preview.startup ?? payload.startup ?? "-"}`);
  }
  lines.push("");
  lines.push("Tambahkan --yes untuk eksekusi asli.");
  lines.push("Gunakan --json untuk melihat payload lengkap.");
  return lines.join("\n");
}

function formatCreatedUser(raw: unknown): string {
  const root = asRecord(raw);
  return [`User berhasil dibuat.`, `id: ${root.id ?? "-"}`, `username: ${root.username ?? "-"}`, `email: ${root.email ?? "-"}`, root.generatedPassword ? `password: ${root.generatedPassword}` : ""].filter(Boolean).join("\n");
}

function formatCreatedServer(raw: unknown): string {
  const root = asRecord(raw);
  return [`Server berhasil dibuat.`, `id: ${root.id ?? "-"}`, `identifier: ${root.identifier ?? "-"}`, `uuid: ${root.uuid ?? "-"}`, `name: ${root.name ?? "-"}`].join("\n");
}

function getAttributes(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  return asRecord(data.attributes ?? root.attributes ?? raw);
}

function table(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (rows.length === 0) return "";
  const widths = columns.map(column => Math.max(column.length, ...rows.map(row => String(row[column] ?? "").length)));
  const header = columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  ");
  const divider = widths.map(width => "-".repeat(width)).join("  ");
  const body = rows.map(row => columns.map((column, index) => String(row[column] ?? "").padEnd(widths[index] ?? column.length)).join("  "));
  return [header, divider, ...body].join("\n");
}

function getCollection(raw: unknown): Array<Record<string, unknown>> {
  const root = asRecord(raw);
  const data = Array.isArray(root.data) ? root.data : [];
  return data.map(item => asRecord(item));
}

function countCollection(raw: unknown): number | string {
  if ("error" in asRecord(raw)) return "error";
  return getCollection(raw).length;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isPlaceholderIdentifier(value: string): boolean {
  return value === "IDENTIFIER_SERVER" || value === "<identifier>" || value === "abc12345";
}

function isSafeTmpPath(value: string): boolean {
  return value === "/tmp" || value.startsWith("/tmp/");
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 2)} ${units[unit] ?? "B"}`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${secs}s`);
  return parts.join(" ");
}

function maskIfSecret(key: string, value: string): string {
  if (!value) return "";
  if (!/(token|key|secret|password|pass|auth|credential)/i.test(key)) return value;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 3)}********${value.slice(-3)}`;
}

function printHelp() {
  console.log(`Akadev Pterodactyl Gateway

Perintah:
  ptero-gateway doctor [--json]
  ptero-gateway connect [--json]
  ptero-gateway ids [--nest <nestId>] [--json]
  ptero-gateway servers [--json]
  ptero-gateway admin users [--json]
  ptero-gateway admin servers [--json]
  ptero-gateway admin create-user --username aka_test --email user@example.com --password "secret" --yes
  ptero-gateway admin create-server --name "aka test" --email user@example.com --node 1 --nest 5 --egg 18 --dry-run
  ptero-gateway admin create-server --name "aka test" --email user@example.com --node 1 --nest 5 --egg 18 --yes
  ptero-gateway admin server <serverId> detail [--json]
  ptero-gateway admin server <serverId> limits [--json]
  ptero-gateway admin server <serverId> update-limits --backups 1 --yes
  ptero-gateway admin server <serverId> suspend --yes
  ptero-gateway admin server <serverId> unsuspend --yes
  ptero-gateway admin server <serverId> reinstall --yes
  ptero-gateway probe <identifier> [--json]
  ptero-gateway server <identifier> summary [--json]
  ptero-gateway server <identifier> resources [--json]
  ptero-gateway server <identifier> files [directory] [--json]
  ptero-gateway server <identifier> read <file>
  ptero-gateway server <identifier> startup|env [--json]
  ptero-gateway server <identifier> network|ports [--json]
  ptero-gateway server <identifier> databases [--json]
  ptero-gateway server <identifier> backups [--json]
  ptero-gateway server <identifier> backup <uuid> [--json]
  ptero-gateway server <identifier> delete-backup <uuid> --yes
  ptero-gateway server <identifier> schedules [--json]
  ptero-gateway server <identifier> write /tmp/test.txt "isi file" --yes
  ptero-gateway server <identifier> write /index.js "isi file" --yes --allow-any-path
  ptero-gateway server <identifier> init-node-alive --yes
  ptero-gateway server <identifier> set-env KEY VALUE --yes
  ptero-gateway server <identifier> create-backup --name "backup-name" --yes
  ptero-gateway server <identifier> start --yes
  ptero-gateway server <identifier> stop --yes
  ptero-gateway server <identifier> restart --yes
  ptero-gateway server <identifier> kill --yes
  ptero-gateway server <identifier> command "npm start" --yes

Env:
  PTERO_DOMAIN=https://panel.example.com
  PTERO_PTLA=ptla_xxx
  PTERO_PTLC=ptlc_xxx`);
}

main().catch(error => {
  console.error(explainError(error));
  process.exitCode = 1;
});