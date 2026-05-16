#!/usr/bin/env node
import { createPtero, explainError } from "./index.js";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter(arg => arg !== "--json");
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
    process.exitCode = report.ok ? 0 : 1;
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

  if (command === "probe") {
    const id = args[1];
    if (!id) throw new Error("Format: ptero-gateway probe <identifier>");
    if (isPlaceholderIdentifier(id)) throw new Error("IDENTIFIER_SERVER hanya placeholder. Jalankan `ptero-gateway servers`, lalu salin nilai `identifier` server yang ingin dicek.");
    const report = await ptero.server(id).probe();
    output(report, formatProbe(report));
    process.exitCode = report.ok ? 0 : 1;
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
    else if (action === "start") output(await server.start());
    else if (action === "stop") output(await server.stop());
    else if (action === "restart") output(await server.restart());
    else if (action === "kill") output(await server.kill());
    else if (action === "resources") {
      const result = await server.resources();
      output(result, formatResources(result));
    }
    else if (action === "command") output(await server.command(args.slice(3).join(" ")));
    else if (action === "files") {
      const result = await server.files.list(args[3] ?? "/");
      output(result, formatFiles(result));
    }
    else if (action === "read") console.log(await server.files.read(args[3] ?? "/"));
    else if (action === "startup" || action === "env") {
      const result = await server.startup.variables();
      output(result, formatStartup(result));
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

function errorResult(error: unknown) {
  return { error: error instanceof Error ? error.message : String(error) };
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
  ptero-gateway probe <identifier> [--json]
  ptero-gateway server <identifier> summary [--json]
  ptero-gateway server <identifier> resources [--json]
  ptero-gateway server <identifier> files [directory] [--json]
  ptero-gateway server <identifier> read <file>
  ptero-gateway server <identifier> startup|env [--json]
  ptero-gateway server <identifier> network|ports [--json]
  ptero-gateway server <identifier> databases [--json]
  ptero-gateway server <identifier> backups [--json]
  ptero-gateway server <identifier> schedules [--json]
  ptero-gateway server <identifier> start
  ptero-gateway server <identifier> stop
  ptero-gateway server <identifier> restart
  ptero-gateway server <identifier> kill
  ptero-gateway server <identifier> command "npm start"

Env:
  PTERO_DOMAIN=https://panel.example.com
  PTERO_PTLA=ptla_xxx
  PTERO_PTLC=ptlc_xxx`);
}

main().catch(error => {
  console.error(explainError(error));
  process.exitCode = 1;
});
