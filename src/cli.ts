import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseCliArgs, flagValue, flagValues, hasFlag, integerFlag, requiredFlag } from "./cli-args.js";
import { applyConfigProfile } from "./config.js";
import { loadEnvFiles } from "./env.js";
import { createPtero, explainError, formatBytes, formatMiB, getCollection, getDataAttributes, PteroError } from "./index.js";
import type { PteroGateway } from "./gateway.js";
import type { AllocationStrategy, CreateSmartServerInput, HttpMethod, PlacementStrategy, PteroConfig, ServerSpecsInput, SmtpConfig } from "./types.js";
import { sleep } from "./utils.js";

type Parsed = ReturnType<typeof parseCliArgs>;

type Row = Record<string, string | number | boolean | null | undefined>;

export async function runCli(argv: string[]): Promise<void> {
  const parsed = parseCliArgs(argv);
  const command = parsed.positionals[0] ?? "help";
  const json = hasFlag(parsed, "json");
  const yes = hasFlag(parsed, "yes");
  const dryRun = hasFlag(parsed, "dry-run");

  loadEnvFiles();
  applyConfigProfile(flagValue(parsed, "profile"));

  if (command === "help" || hasFlag(parsed, "help")) {
    printHelp();
    return;
  }

  const gateway = () => buildGateway(readConfigFromEnv());
  const context = { parsed, json, yes, dryRun };

  try {
    switch (command) {
      case "completion":
        printCompletion(parsed.positionals[1] ?? "bash");
        return;
      case "doctor":
        await doctorCommand(gateway(), context);
        return;
      case "connect":
      case "status":
        await connectCommand(gateway(), context);
        return;
      case "nodes":
        await nodesCommand(gateway(), context);
        return;
      case "allocations":
      case "ports":
        await allocationsCommand(gateway(), context);
        return;
      case "nests":
        await nestsCommand(gateway(), context);
        return;
      case "eggs":
        await eggsCommand(gateway(), context);
        return;
      case "egg-runtime":
        await eggRuntimeCommand(gateway(), context);
        return;
      case "users":
        await usersCommand(gateway(), context);
        return;
      case "servers":
        await serversCommand(gateway(), context);
        return;
      case "plan":
        await planCommand(gateway(), context);
        return;
      case "forecast":
        await forecastCommand(gateway(), context);
        return;
      case "create-user":
        await createUserCommand(gateway(), context);
        return;
      case "create-server":
        await createServerCommand(gateway(), context);
        return;
      case "delete-user":
        await deleteUserCommand(gateway(), context);
        return;
      case "delete-server":
        await deleteServerCommand(gateway(), context);
        return;
      case "suspend":
      case "unsuspend":
      case "reinstall":
        await serverLifecycleCommand(gateway(), context, command);
        return;
      case "server":
        await serverCommand(gateway(), context);
        return;
      case "backup":
        await backupCommand(gateway(), context);
        return;
      case "email-test":
        await emailTestCommand(gateway(), context);
        return;
      case "raw":
        await rawCommand(gateway(), context);
        return;
      default:
        throw new Error(`Command tidak dikenal: ${command}. Jalankan ptero-gateway help.`);
    }
  } catch (error) {
    if (json) console.error(JSON.stringify({ ok: false, error: error instanceof PteroError ? error.toJSON() : { message: error instanceof Error ? error.message : String(error) } }, null, 2));
    else console.error(explainError(error));
    process.exitCode = 1;
  }
}

function buildGateway(config: PteroConfig): PteroGateway {
  return createPtero(config);
}

function readConfigFromEnv(): PteroConfig {
  return {
    domain: process.env.PTERO_DOMAIN ?? process.env.PTERO_PANEL_URL,
    ptla: process.env.PTERO_PTLA ?? process.env.PTERO_APPLICATION_KEY,
    ptlc: process.env.PTERO_PTLC ?? process.env.PTERO_CLIENT_KEY,
    defaultNodeId: process.env.PTERO_NODE_ID ? Number(process.env.PTERO_NODE_ID) : undefined,
    defaultNestId: process.env.PTERO_NEST_ID ? Number(process.env.PTERO_NEST_ID) : undefined,
    defaultEggId: process.env.PTERO_EGG_ID ? Number(process.env.PTERO_EGG_ID) : undefined,
    safeMode: process.env.PTERO_SAFE_MODE === undefined ? true : process.env.PTERO_SAFE_MODE !== "false",
    debug: process.env.PTERO_DEBUG === "true"
  };
}

async function doctorCommand(gateway: PteroGateway, context: Context) {
  const report = await gateway.doctor();
  if (context.json) {
    outputJson(report);
    return;
  }
  console.log(`Mode: ${report.mode}`);
  console.log(`Status: ${report.ok ? "SEHAT" : "PERLU PERBAIKAN"}`);
  printTable(
    report.checks.map(check => ({
      check: check.name,
      status: check.ok ? "OK" : "FAIL",
      detail: check.message ?? "",
      fix: check.fix ?? ""
    })),
    ["check", "status", "detail", "fix"]
  );
  if (report.capabilities) {
    console.log(`\nKemampuan panel: nests=${report.capabilities.nests} eggs=${report.capabilities.eggs} application=${report.capabilities.applicationApi} client=${report.capabilities.clientApi}`);
  }
}

async function connectCommand(gateway: PteroGateway, context: Context) {
  const result = await gateway.connect();
  if (context.json) outputJson(result);
  else {
    console.log(`Domain: ${result.domain}`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Latency: ${result.latency}ms`);
    console.log(`Application API: ${result.application.valid ? "valid" : result.application.message}`);
    console.log(`Client API: ${result.client.valid ? "valid" : result.client.message}`);
  }
}

async function nodesCommand(gateway: PteroGateway, context: Context) {
  const capacity = await gateway.capacity();
  if (context.json) {
    outputJson(capacity);
    return;
  }
  if (capacity.length === 0) {
    console.log("Tidak ada node.");
    return;
  }
  printTable(
    capacity.map(node => ({
      id: node.nodeId,
      name: node.name,
      memory: `${formatMiB(node.memory.allocated)} / ${node.unlimited ? "unlimited" : formatMiB(node.memory.total)}`,
      memoryPct: `${node.memory.percent}%`,
      disk: `${formatMiB(node.disk.allocated)} / ${node.unlimited ? "unlimited" : formatMiB(node.disk.total)}`,
      diskPct: `${node.disk.percent}%`,
      ports: `${node.allocations.assigned}/${node.allocations.total}`,
      freePorts: node.allocations.free,
      servers: node.servers
    })),
    ["id", "name", "memory", "memoryPct", "disk", "diskPct", "ports", "freePorts", "servers"]
  );
}

async function allocationsCommand(gateway: PteroGateway, context: Context) {
  const nodeFlag = integerFlag(context.parsed, "node");
  const nodes = nodeFlag ? [nodeFlag] : (await gateway.application.nodes.all()).map(node => Number(getDataAttributes(node).id ?? 0)).filter(Boolean);
  const rows: Row[] = [];
  const payload: unknown[] = [];
  for (const nodeId of nodes) {
    const items = await gateway.application.nodes.allocations.all(nodeId);
    payload.push({ nodeId, allocations: items });
    for (const item of items) {
      const attributes = getDataAttributes(item);
      rows.push({
        node: nodeId,
        id: Number(attributes.id ?? 0),
        ip: String(attributes.ip ?? ""),
        port: Number(attributes.port ?? 0),
        assigned: Boolean(attributes.assigned)
      });
    }
  }
  if (context.json) outputJson(payload);
  else if (rows.length === 0) console.log("Tidak ada allocation.");
  else printTable(rows, ["node", "id", "ip", "port", "assigned"]);
}

async function nestsCommand(gateway: PteroGateway, context: Context) {
  const nests = await gateway.listNests();
  if (context.json) outputJson(nests);
  else if (nests.length === 0) console.log("Tidak ada nest.");
  else
    printTable(
      nests.map(nest => ({
        id: Number(getDataAttributes(nest).id ?? 0),
        name: String(getDataAttributes(nest).name ?? ""),
        description: String(getDataAttributes(nest).description ?? "")
      })),
      ["id", "name", "description"]
    );
}

async function eggsCommand(gateway: PteroGateway, context: Context) {
  const nest = integerFlag(context.parsed, "nest") ?? (context.parsed.positionals[1] ? Number(context.parsed.positionals[1]) : undefined);
  const eggs = await gateway.listEggs(nest);
  if (context.json) {
    outputJson(eggs);
    return;
  }
  if (eggs.length === 0) {
    console.log("Tidak ada egg.");
    return;
  }
  printTable(
    eggs.map(egg => {
      const attributes = getDataAttributes(egg);
      return {
        id: Number(attributes.id ?? 0),
        name: String(attributes.name ?? ""),
        author: String(attributes.author ?? ""),
        docker: String(attributes.docker_image ?? "")
      };
    }),
    ["id", "name", "author", "docker"]
  );
}

async function eggRuntimeCommand(gateway: PteroGateway, context: Context) {
  const eggId = integerFlag(context.parsed, "egg") ?? Number(context.parsed.positionals[1]);
  if (!Number.isInteger(eggId) || eggId <= 0) throw new Error("Format: ptero-gateway egg-runtime <eggId>");
  const runtime = await gateway.eggRuntime(eggId);
  if (context.json) {
    outputJson(runtime);
    return;
  }
  console.log(`Egg: ${runtime.name} (${runtime.id})`);
  console.log(`Startup: ${runtime.startupCommand}`);
  console.log(`Done marker: ${runtime.startupDone ?? "-"}`);
  console.log(`Stop command: ${runtime.stopCommand ?? "-"}`);
  console.log(`Docker images: ${runtime.dockerImages.join(", ") || "-"}`);
  printTable(
    runtime.variables.map(variable => ({ env: variable.env, name: variable.name, default: variable.defaultValue, required: variable.required })),
    ["env", "name", "default", "required"]
  );
}

async function usersCommand(gateway: PteroGateway, context: Context) {
  const users = await gateway.application.users.all();
  if (context.json) outputJson(users);
  else
    printTable(
      users.map(user => {
        const attributes = getDataAttributes(user);
        return {
          id: Number(attributes.id ?? 0),
          username: String(attributes.username ?? ""),
          email: String(attributes.email ?? ""),
          admin: Boolean(attributes.root_admin),
          twoFactor: Boolean(attributes["2fa"])
        };
      }),
      ["id", "username", "email", "admin", "twoFactor"]
    );
}

async function serversCommand(gateway: PteroGateway, context: Context) {
  const servers = await gateway.listAllServers();
  if (context.json) outputJson(servers);
  else if (servers.length === 0) console.log("Tidak ada server.");
  else
    printTable(
      servers.map(server => {
        const attributes = getDataAttributes(server);
        return {
          id: Number(attributes.id ?? 0),
          name: String(attributes.name ?? ""),
          identifier: String(attributes.identifier ?? ""),
          user: Number(attributes.user ?? 0),
          node: Number(attributes.node ?? 0),
          egg: Number(attributes.egg ?? 0),
          suspended: Boolean(attributes.suspended)
        };
      }),
      ["id", "name", "identifier", "user", "node", "egg", "suspended"]
    );
}

async function planCommand(gateway: PteroGateway, context: Context) {
  const specs = specsFromFlags(context.parsed, gateway);
  const strategy = (flagValue(context.parsed, "strategy") ?? "balanced") as PlacementStrategy;
  const nodeIds = flagValues(context.parsed, "node").map(Number).filter(Boolean);
  const result = await gateway.planServer(specs, {
    strategy,
    nodeIds: nodeIds.length ? nodeIds : undefined,
    reservePercent: integerFlag(context.parsed, "reserve")
  });
  if (context.json) {
    outputJson(result);
    return;
  }
  console.log(`Strategi: ${result.plan.strategy}`);
  console.log(`Port dibutuhkan: ${result.plan.requiredPorts}`);
  printTable(
    result.plan.candidates.map(candidate => ({
      node: candidate.nodeId,
      name: candidate.nodeName,
      feasible: candidate.feasible,
      score: candidate.score,
      freeMemory: candidate.freeMemory,
      freeDisk: candidate.freeDisk,
      freePorts: candidate.freePorts,
      note: candidate.reasons.join("; ")
    })),
    ["node", "name", "feasible", "score", "freeMemory", "freeDisk", "freePorts", "note"]
  );
  if (result.plan.selected) {
    console.log(`\nNode terpilih: ${result.plan.selected.nodeId} (${result.plan.selected.nodeName})`);
    if (result.allocations.default) {
      console.log(`Allocation: default=${result.allocations.default} additional=${(result.allocations.additional ?? []).join(",") || "-"}`);
    }
  } else {
    console.log(`\n${result.plan.message ?? "Tidak ada node yang cocok."}`);
  }
}

async function forecastCommand(gateway: PteroGateway, context: Context) {
  const specs = specsFromFlags(context.parsed, gateway);
  const forecast = await gateway.forecast(specs);
  if (context.json) outputJson(forecast);
  else
    printTable(
      forecast.map(item => ({
        node: item.nodeId,
        servers: item.serverCapacity,
        memory: item.memoryCapacity,
        disk: item.diskCapacity,
        ports: item.portCapacity,
        limiting: item.limitingFactor
      })),
      ["node", "servers", "memory", "disk", "ports", "limiting"]
    );
}

async function createUserCommand(gateway: PteroGateway, context: Context) {
  const username = requiredFlag(context.parsed, "username");
  const email = requiredFlag(context.parsed, "email");
  const password = flagValue(context.parsed, "password") ?? "auto";
  const administrator = hasFlag(context.parsed, "admin");
  const result = await gateway.smart.users.create(
    { username, email, password, administrator, firstName: flagValue(context.parsed, "first-name"), lastName: flagValue(context.parsed, "last-name") },
    { dryRun: context.dryRun }
  );
  if (context.json) {
    outputJson(result);
    return;
  }
  if ("dryRun" in result) {
    console.log("Dry run create user:");
    console.log(JSON.stringify({ ...result, payload: { ...result.payload, password: "********" } }, null, 2));
    return;
  }
  console.log(`User dibuat: id=${result.id} username=${result.username} email=${result.email}`);
  if (result.generatedPassword) console.log(`Password: ${result.generatedPassword}`);
}

async function createServerCommand(gateway: PteroGateway, context: Context) {
  const input = serverInputFromFlags(context.parsed, gateway);
  if (context.dryRun) {
    const preview = await gateway.smart.servers.preview(input);
    if (context.json) outputJson(preview);
    else {
      console.log("Dry run create server:");
      console.log(JSON.stringify(preview, null, 2));
    }
    return;
  }
  await requireConfirmation(context, `Buat server '${input.name}'?`);
  const result = await gateway.smart.servers.create(input, {
    onProgress: context.json ? undefined : step => process.stderr.write(`[${step.percent}%] ${step.message}\n`)
  });
  if (context.json) {
    outputJson(result);
    return;
  }
  if ("dryRun" in result) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Server dibuat: id=${result.id ?? "-"} identifier=${result.identifier ?? "-"}`);
  if (result.user?.generatedPassword) console.log(`Password owner: ${result.user.generatedPassword}`);
}

async function deleteUserCommand(gateway: PteroGateway, context: Context) {
  const id = Number(context.parsed.positionals[1] ?? flagValue(context.parsed, "id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Format: ptero-gateway delete-user <id> --yes");
  await requireConfirmation(context, `Hapus user ${id}?`);
  await gateway.application.users.delete(id, true);
  if (context.json) outputJson({ ok: true, deletedUserId: id });
  else console.log(`User ${id} dihapus.`);
}

async function deleteServerCommand(gateway: PteroGateway, context: Context) {
  const id = Number(context.parsed.positionals[1] ?? flagValue(context.parsed, "id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Format: ptero-gateway delete-server <id> --yes [--force]");
  await requireConfirmation(context, `Hapus server ${id}?`);
  await gateway.application.servers.delete(id, { confirm: true, force: hasFlag(context.parsed, "force") });
  if (context.json) outputJson({ ok: true, deletedServerId: id });
  else console.log(`Server ${id} dihapus.`);
}

async function serverLifecycleCommand(gateway: PteroGateway, context: Context, operation: "suspend" | "unsuspend" | "reinstall") {
  const id = Number(context.parsed.positionals[1] ?? flagValue(context.parsed, "id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Format: ptero-gateway ${operation} <serverId> --yes`);
  await requireConfirmation(context, `Jalankan ${operation} untuk server ${id}?`);
  if (operation === "suspend") await gateway.application.servers.suspend(id);
  else if (operation === "unsuspend") await gateway.application.servers.unsuspend(id);
  else await gateway.application.servers.reinstall(id);
  if (context.json) outputJson({ ok: true, serverId: id, operation });
  else console.log(`${operation} server ${id} berhasil.`);
}

async function serverCommand(gateway: PteroGateway, context: Context) {
  const identifier = context.parsed.positionals[1];
  const action = context.parsed.positionals[2];
  if (!identifier || !action) {
    throw new Error("Format: ptero-gateway server <identifier> <action>. Jalankan help untuk daftar aksi.");
  }
  const handle = gateway.server(identifier);

  if (action === "summary" || action === "details") {
    const details = await handle.details();
    if (context.json) outputJson(details);
    else {
      const attributes = getDataAttributes(details);
      printTable(
        [
          { field: "name", value: String(attributes.name ?? "") },
          { field: "identifier", value: String(attributes.identifier ?? "") },
          { field: "state", value: String(attributes.status ?? "") },
          { field: "suspended", value: Boolean(attributes.is_suspended ?? attributes.suspended) },
          { field: "installing", value: Boolean(attributes.is_installing) },
          { field: "node", value: String(attributes.node ?? "") }
        ],
        ["field", "value"]
      );
    }
    return;
  }

  if (action === "resources" || action === "usage") {
    const resources = await handle.resources();
    if (context.json) outputJson(resources);
    else {
      console.log(`State: ${resources.current_state}`);
      console.log(`Memory: ${formatBytes(resources.resources.memory_bytes)}`);
      console.log(`CPU: ${resources.resources.cpu_absolute.toFixed(2)}%`);
      console.log(`Disk: ${formatBytes(resources.resources.disk_bytes)}`);
      console.log(`Network RX: ${formatBytes(resources.resources.network_rx_bytes)}`);
      console.log(`Network TX: ${formatBytes(resources.resources.network_tx_bytes)}`);
      console.log(`Uptime: ${resources.resources.uptime}ms`);
    }
    return;
  }

  if (action === "files") {
    const response = await handle.files.list(context.parsed.positionals[3] ?? "/");
    if (context.json) outputJson(response);
    else {
      const entries = Array.isArray((response as any).data) ? (response as any).data : [];
      printTable(
        entries.map((entry: any) => ({
          name: entry.name,
          type: entry.is_file ? "file" : "dir",
          size: formatBytes(Number(entry.size ?? 0)),
          modified: entry.modified_at
        })),
        ["name", "type", "size", "modified"]
      );
    }
    return;
  }

  if (action === "read") {
    const file = context.parsed.positionals[3];
    if (!file) throw new Error("Format: ptero-gateway server <id> read <file>");
    const content = await handle.files.read(file);
    if (context.json) outputJson({ file, content });
    else process.stdout.write(content);
    return;
  }

  if (action === "download") {
    const file = context.parsed.positionals[3];
    if (!file) throw new Error("Format: ptero-gateway server <id> download <file> [destination]");
    const destination = context.parsed.positionals[4] ?? basename(file);
    const result = await handle.files.downloadToFile(file, destination);
    console.log(`Download selesai: ${result.destination} (${formatBytes(result.bytes)})`);
    return;
  }

  if (action === "write") {
    await requireConfirmation(context, `Tulis file di server ${identifier}?`);
    const file = context.parsed.positionals[3];
    if (!file) throw new Error("Format: ptero-gateway server <id> write <file> [content] --from <local> --yes");
    const from = flagValue(context.parsed, "from");
    const content = from ? await readFile(from, "utf8") : context.parsed.positionals[4] ?? "";
    await handle.files.write(file, content);
    if (context.json) outputJson({ ok: true, file, bytes: Buffer.byteLength(content) });
    else console.log(`File ${file} ditulis (${Buffer.byteLength(content)} byte).`);
    return;
  }

  if (action === "upload") {
    await requireConfirmation(context, `Upload file ke server ${identifier}?`);
    const local = context.parsed.positionals[3];
    const remote = context.parsed.positionals[4] ?? "/";
    if (!local) throw new Error("Format: ptero-gateway server <id> upload <localFile> [remoteDir] --yes");
    await handle.files.uploadFromFile(remote, local);
    console.log(`Upload selesai: ${local} -> ${remote}`);
    return;
  }

  if (action === "mkdir") {
    await requireConfirmation(context, `Buat folder di server ${identifier}?`);
    const root = context.parsed.positionals[3] ?? "/";
    const name = context.parsed.positionals[4];
    if (!name) throw new Error("Format: ptero-gateway server <id> mkdir <root> <name> --yes");
    await handle.files.mkdir(root, name);
    console.log(`Folder ${name} dibuat.`);
    return;
  }

  if (action === "startup" || action === "env") {
    const response = await handle.startup.get();
    if (context.json) outputJson(response);
    else {
      const attributes = getDataAttributes(response);
      const variables = getCollection(attributes.relationships ? (attributes.relationships as any).variables : []);
      printTable(
        variables.map(variable => {
          const item = getDataAttributes(variable);
          return { variable: String(item.env_variable ?? ""), value: String(item.server_value ?? item.default_value ?? "") };
        }),
        ["variable", "value"]
      );
    }
    return;
  }

  if (action === "set-env") {
    await requireConfirmation(context, `Ubah environment server ${identifier}?`);
    const key = context.parsed.positionals[3];
    const value = context.parsed.positionals[4];
    if (!key || value === undefined) throw new Error("Format: ptero-gateway server <id> set-env <KEY> <VALUE> --yes");
    await handle.startup.set(key, value);
    console.log(`${key} diperbarui.`);
    return;
  }

  if (action === "network" || action === "ports") {
    const response = await handle.network.list();
    if (context.json) outputJson(response);
    else {
      const entries = Array.isArray((response as any).data) ? (response as any).data : [];
      printTable(
        entries.map((entry: any) => ({
          id: Number(entry.attributes.id ?? 0),
          ip: entry.attributes.ip,
          port: entry.attributes.port,
          primary: Boolean(entry.attributes.is_default),
          notes: entry.attributes.notes ?? ""
        })),
        ["id", "ip", "port", "primary", "notes"]
      );
    }
    return;
  }

  if (action === "databases") {
    const response = await handle.databases.list();
    if (context.json) outputJson(response);
    else console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (action === "backups") {
    const response = await handle.backups.list();
    if (context.json) outputJson(response);
    else {
      const entries = Array.isArray((response as any).data) ? (response as any).data : [];
      printTable(
        entries.map((entry: any) => ({
          uuid: entry.attributes.uuid,
          name: entry.attributes.name,
          bytes: formatBytes(Number(entry.attributes.bytes ?? 0)),
          successful: Boolean(entry.attributes.is_successful),
          created: entry.attributes.created_at
        })),
        ["uuid", "name", "bytes", "successful", "created"]
      );
    }
    return;
  }

  if (action === "create-backup") {
    await requireConfirmation(context, `Buat backup server ${identifier}?`);
    const name = flagValue(context.parsed, "name") ?? `backup-${Date.now()}`;
    const ignored = flagValues(context.parsed, "ignore");
    const response = await handle.backups.create(name, ignored.length ? ignored : undefined, hasFlag(context.parsed, "lock"));
    if (context.json) outputJson(response);
    else console.log(`Backup ${name} dibuat.`);
    return;
  }

  if (action === "wait-backup") {
    const backupId = context.parsed.positionals[3];
    if (!backupId) throw new Error("Format: ptero-gateway server <id> wait-backup <uuid>");
    const result = await handle.backups.waitFor(backupId, { timeout: 900000, interval: 5000 });
    if (context.json) outputJson(result);
    else console.log(`Backup selesai: ${String(result.uuid ?? backupId)}`);
    return;
  }

  if (action === "delete-backup") {
    await requireConfirmation(context, `Hapus backup server ${identifier}?`);
    const backupId = context.parsed.positionals[3];
    if (!backupId) throw new Error("Format: ptero-gateway server <id> delete-backup <uuid> --yes");
    await handle.backups.delete(backupId);
    console.log(`Backup ${backupId} dihapus.`);
    return;
  }

  if (action === "schedules") {
    const response = await handle.schedules.list();
    if (context.json) outputJson(response);
    else console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (action === "schedule-create") {
    await requireConfirmation(context, `Buat schedule untuk server ${identifier}?`);
    const name = requiredFlag(context.parsed, "name");
    const cron = requiredFlag(context.parsed, "cron");
    const tasks = flagValues(context.parsed, "task");
    const builder = handle.createScheduleBuilder().setName(name).setCron(cron).setOnlyWhenOnline(hasFlag(context.parsed, "online"));
    for (const task of tasks) {
      const [kind, ...rest] = task.split(":");
      const payload = rest.join(":");
      if (kind === "power") builder.addPowerTask(payload as "start" | "stop" | "restart" | "kill");
      else if (kind === "command") builder.addCommandTask(payload);
      else if (kind === "backup") builder.addBackupTask();
      else throw new Error(`Task tidak valid: ${task}. Gunakan power:start, command:<cmd>, atau backup:.`);
    }
    if (tasks.length === 0) builder.addBackupTask();
    const result = await builder.save();
    if (context.json) outputJson(result);
    else console.log(`Schedule ${result.id} dibuat.`);
    return;
  }

  if (action === "schedule-delete") {
    await requireConfirmation(context, `Hapus schedule server ${identifier}?`);
    const id = Number(context.parsed.positionals[3]);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Format: ptero-gateway server <id> schedule-delete <scheduleId> --yes");
    await handle.schedules.delete(id);
    console.log(`Schedule ${id} dihapus.`);
    return;
  }

  if (action === "schedule-run") {
    await requireConfirmation(context, `Jalankan schedule server ${identifier}?`);
    const id = Number(context.parsed.positionals[3]);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Format: ptero-gateway server <id> schedule-run <scheduleId> --yes");
    await handle.schedules.execute(id);
    console.log(`Schedule ${id} dieksekusi.`);
    return;
  }

  if (action === "activity") {
    const response = await handle.activity(Number(context.parsed.positionals[3] ?? 1));
    if (context.json) outputJson(response);
    else console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (action === "ws-auth") {
    const auth = await handle.websocket.auth();
    if (context.json) outputJson(auth);
    else {
      console.log(`Socket: ${auth.socket}`);
      console.log(`Token: ${auth.token.slice(0, 12)}... (disembunyikan)`);
    }
    return;
  }

  if (action === "console") {
    const seconds = integerFlag(context.parsed, "seconds");
    const socket = await handle.websocket.connect();
    socket.onConsole(line => process.stdout.write(`${line}\n`));
    socket.onStatus(status => process.stderr.write(`[status] ${status}\n`));
    socket.on("error", error => process.stderr.write(`[ws] ${error instanceof Error ? error.message : String(error)}\n`));
    if (seconds) {
      await sleep(seconds * 1000);
      await socket.close();
      return;
    }
    await new Promise<void>(resolve => {
      process.once("SIGINT", () => resolve());
      process.once("SIGTERM", () => resolve());
    });
    await socket.close();
    return;
  }

  if (action === "wait-state" || action === "wait") {
    const target = context.parsed.positionals[3] ?? "running";
    const result = await handle.waitForState(target, { timeout: integerFlag(context.parsed, "timeout") ?? 120000 });
    if (context.json) outputJson(result);
    else console.log(`Server mencapai state ${result.current_state}.`);
    return;
  }

  if (action === "setup-backup") {
    await requireConfirmation(context, `Pasang auto-backup untuk server ${identifier}?`);
    const cron = flagValue(context.parsed, "cron") ?? "0 3 * * *";
    const result = await handle.setupAutoBackupSchedule({ cron, name: flagValue(context.parsed, "name"), onlyWhenOnline: hasFlag(context.parsed, "online") });
    if (context.json) outputJson(result);
    else console.log(`Auto-backup schedule ${result.id} dibuat (${cron}).`);
    return;
  }

  if (["start", "stop", "restart", "kill"].includes(action)) {
    await requireConfirmation(context, `Kirim ${action} ke server ${identifier}?`);
    await handle.power(action as "start" | "stop" | "restart" | "kill");
    console.log(`Sinyal ${action} dikirim.`);
    return;
  }

  if (action === "command") {
    await requireConfirmation(context, `Kirim command ke server ${identifier}?`);
    const value = context.parsed.positionals.slice(3).join(" ");
    if (!value) throw new Error('Format: ptero-gateway server <id> command "npm start" --yes');
    await handle.command(value);
    console.log("Command dikirim.");
    return;
  }

  throw new Error(`Aksi server tidak dikenal: ${action}`);
}

async function backupCommand(gateway: PteroGateway, context: Context) {
  const serverId = Number(context.parsed.positionals[1] ?? flagValue(context.parsed, "server"));
  if (!Number.isInteger(serverId) || serverId <= 0) throw new Error("Format: ptero-gateway backup <serverId> --to <email> --yes");
  await requireConfirmation(context, `Backup dan kirim server ${serverId}?`);
  const smtp = smtpFromFlags(context.parsed);
  const result = await gateway.exportAndEmailBackup(serverId, flagValue(context.parsed, "to"), smtp, {
    keepPanelBackup: hasFlag(context.parsed, "keep"),
    format: hasFlag(context.parsed, "tar") ? "tar.gz" : "zip",
    attachmentLimitBytes: integerFlag(context.parsed, "max-bytes")
  });
  if (context.json) outputJson(result);
  else console.log(`Backup terkirim: ${result.fileName} (${result.size}) -> ${result.email}`);
}

async function emailTestCommand(gateway: PteroGateway, context: Context) {
  const to = requiredFlag(context.parsed, "to");
  const smtp = smtpFromFlags(context.parsed);
  if (!smtp) throw new Error("Konfigurasi SMTP wajib diisi melalui --smtp-host, --smtp-port, --smtp-user, --smtp-pass atau environment SMTP_*.");
  const verification = await gateway.email.verify(smtp);
  if (!verification.ok) throw new Error(`SMTP tidak valid: ${verification.message}`);
  const result = await gateway.email.send({
    to,
    subject: flagValue(context.parsed, "subject") ?? "Pterodactyl Gateway SMTP Test",
    text: "SMTP berhasil dikonfigurasi.",
    smtp
  });
  if (context.json) outputJson({ ...verification, ...result });
  else console.log(`Email test terkirim ke ${to} (${result.messageId}).`);
}

async function rawCommand(gateway: PteroGateway, context: Context) {
  const api = context.parsed.positionals[1];
  const method = (context.parsed.positionals[2] ?? "GET").toUpperCase();
  const path = context.parsed.positionals[3];
  if ((api !== "application" && api !== "client") || !path) {
    throw new Error("Format: ptero-gateway raw <application|client> <METHOD> <path> [--body JSON] [--yes]");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    await requireConfirmation(context, `Kirim ${method} ${path} ke ${api} API?`);
  }
  const body = flagValue(context.parsed, "body");
  const response = await gateway.request({
    api,
    method: method as HttpMethod,
    path,
    body: body ? JSON.parse(body) : undefined,
    retryUnsafe: method === "GET" || method === "HEAD"
  });
  outputJson(response);
}

function serverInputFromFlags(parsed: Parsed, gateway: PteroGateway): CreateSmartServerInput {
  const nodeId = integerFlag(parsed, "node") ?? (process.env.PTERO_NODE_ID ? Number(process.env.PTERO_NODE_ID) : undefined);
  const eggId = integerFlag(parsed, "egg") ?? (process.env.PTERO_EGG_ID ? Number(process.env.PTERO_EGG_ID) : undefined);
  if (!nodeId) throw new Error("--node wajib diisi (atau set PTERO_NODE_ID).");
  if (!eggId) throw new Error("--egg wajib diisi (atau set PTERO_EGG_ID).");
  const name = requiredFlag(parsed, "name");
  const email = flagValue(parsed, "email");
  const userId = integerFlag(parsed, "user-id");
  if (!email && !userId) throw new Error("--email atau --user-id wajib diisi.");
  const environment = environmentFromFlags(parsed);
  const allocationStrategy = flagValue(parsed, "allocation-strategy") as AllocationStrategy | undefined;
  const portRange = flagValue(parsed, "port-range");
  return {
    name,
    email,
    userId,
    username: flagValue(parsed, "username"),
    password: flagValue(parsed, "password") ?? "auto",
    autoCreateUser: hasFlag(parsed, "auto-create-user") || Boolean(email),
    administrator: false,
    description: flagValue(parsed, "description") ?? `Managed by Pterodactyl Gateway (${new Date().toISOString().slice(0, 10)})`,
    nodeId,
    nestId: integerFlag(parsed, "nest") ?? (process.env.PTERO_NEST_ID ? Number(process.env.PTERO_NEST_ID) : 5),
    eggId,
    specs: specsFromFlags(parsed, gateway),
    startup: flagValue(parsed, "startup") ?? "auto",
    dockerImage: flagValue(parsed, "docker-image") ?? "auto",
    environment: environment ?? "auto",
    allocation: allocationStrategy
      ? {
          strategy: allocationStrategy,
          portRange: portRange ? (portRange.split("-").map(Number) as [number, number]) : undefined
        }
      : "auto",
    startOnCompletion: !hasFlag(parsed, "no-start")
  };
}

function specsFromFlags(parsed: Parsed, gateway: PteroGateway): ServerSpecsInput {
  const presetName = flagValue(parsed, "preset") ?? "basic";
  const preset = gateway.presets[presetName];
  if (!preset) throw new Error(`Preset tidak dikenal: ${presetName}. Pilihan: ${Object.keys(gateway.presets).join(", ")}`);
  return {
    memory: flagValue(parsed, "memory") ?? preset.memory,
    disk: flagValue(parsed, "disk") ?? preset.disk,
    cpu: flagValue(parsed, "cpu") ?? preset.cpu,
    swap: flagValue(parsed, "swap") ?? preset.swap,
    io: integerFlag(parsed, "io") ?? preset.io,
    databases: integerFlag(parsed, "databases") ?? preset.databases,
    allocations: integerFlag(parsed, "allocations") ?? preset.allocations,
    backups: integerFlag(parsed, "backups") ?? preset.backups,
    cpuPinning: flagValue(parsed, "cpu-pinning") ?? preset.cpuPinning
  };
}

function environmentFromFlags(parsed: Parsed): Record<string, string> | undefined {
  const values = flagValues(parsed, "env");
  if (values.length === 0) return undefined;
  const output: Record<string, string> = {};
  for (const entry of values) {
    const separator = entry.indexOf("=");
    if (separator <= 0) throw new Error(`Format --env harus KEY=VALUE: ${entry}`);
    output[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return output;
}

function smtpFromFlags(parsed: Parsed): SmtpConfig | undefined {
  const host = flagValue(parsed, "smtp-host") ?? process.env.SMTP_HOST;
  const port = integerFlag(parsed, "smtp-port") ?? (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined);
  const username = flagValue(parsed, "smtp-user") ?? process.env.SMTP_USER ?? process.env.SMTP_USERNAME;
  const password = flagValue(parsed, "smtp-pass") ?? process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  if (!host || !port || !username || !password) return undefined;
  return {
    host,
    port,
    username,
    password,
    fromAddress: flagValue(parsed, "smtp-from") ?? process.env.SMTP_FROM,
    fromName: flagValue(parsed, "smtp-name") ?? process.env.SMTP_FROM_NAME,
    encryption: flagValue(parsed, "smtp-encryption") ?? process.env.SMTP_ENCRYPTION,
    rejectUnauthorized: (flagValue(parsed, "smtp-reject-unauthorized") ?? process.env.SMTP_REJECT_UNAUTHORIZED ?? "true") !== "false"
  };
}

type Context = { parsed: Parsed; json: boolean; yes: boolean; dryRun: boolean };

async function requireConfirmation(context: Context, message: string): Promise<void> {
  if (context.yes) return;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new PteroError({
      code: "CONFIRMATION_REQUIRED",
      message: "Aksi ini membutuhkan konfirmasi.",
      hint: "Tambahkan --yes untuk menjalankan di lingkungan non-interaktif.",
      example: { command: "ptero-gateway <command> --yes" }
    });
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    if (!["y", "yes", "ya", "iya"].includes(answer)) {
      throw new PteroError({ code: "CANCELLED", message: "Aksi dibatalkan." });
    }
  } finally {
    rl.close();
  }
}

function outputJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printTable(rows: Row[], columns: string[]) {
  if (rows.length === 0) {
    console.log("Tidak ada data.");
    return;
  }
  const widths = columns.map(column => Math.max(column.length, ...rows.map(row => String(row[column] ?? "").length)));
  const header = columns.map((column, index) => column.padEnd(widths[index]!)).join("  ");
  const separator = widths.map(width => "-".repeat(width)).join("  ");
  console.log(header);
  console.log(separator);
  for (const row of rows) {
    console.log(columns.map((column, index) => String(row[column] ?? "").padEnd(widths[index]!)).join("  "));
  }
}

function printCompletion(shell: string) {
  const commands = [
    "help",
    "doctor",
    "connect",
    "nodes",
    "allocations",
    "nests",
    "eggs",
    "users",
    "servers",
    "plan",
    "forecast",
    "create-user",
    "create-server",
    "delete-user",
    "delete-server",
    "suspend",
    "unsuspend",
    "reinstall",
    "server",
    "backup",
    "email-test",
    "raw",
    "config",
    "templates",
    "version",
    "self-check",
    "release-check",
    "env-template"
  ];
  if (shell === "zsh") {
    console.log(`#compdef ptero-gateway ptg\n_arguments '1:command:(${commands.join(" ")})' '*::arg:->args'`);
    return;
  }
  if (shell === "fish") {
    console.log(commands.map(command => `complete -c ptero-gateway -f -a "${command}"`).join("\n"));
    return;
  }
  console.log(`complete -W "${commands.join(" ")}" ptero-gateway ptg`);
}

function printHelp() {
  console.log(`Pterodactyl Gateway CLI v1.5.0

Pemakaian:
  ptero-gateway <command> [options]

Koneksi dan diagnosa:
  doctor [--json]                       Validasi domain, key, dan kemampuan panel
  connect [--json]                      Cek koneksi Application dan Client API
  nodes                                 Ringkasan kapasitas semua node
  allocations [--node <id>]             Daftar allocation port
  nests                                 Daftar nest yang tersedia
  eggs [nestId] [--nest <id>]           Daftar egg
  egg-runtime <eggId>                   Startup command, done marker, dan variables egg
  users                                 Daftar user
  servers                               Daftar server

Perencanaan:
  plan --memory 2GB --disk 5GB --cpu 200 [--node 1] [--strategy balanced]
  forecast --memory 1GB --disk 2GB --cpu 100

Membuat resource:
  create-user --username <name> --email <email> [--password auto] [--admin] [--dry-run] [--yes]
  create-server --name <name> --email <email> --node <id> --egg <id> [--nest 5] [--preset basic] [--dry-run] [--yes]
  create-server --name <name> --user-id 1 --node 1 --egg 15 --memory 1GB --disk 2GB --cpu 100 --yes

Mengelola server:
  delete-user <userId> --yes [--force]
  delete-server <serverId> --yes [--force]
  suspend <serverId> --yes
  unsuspend <serverId> --yes
  reinstall <serverId> --yes
  server <identifier> summary|resources|files|read|download|write|upload|mkdir|startup|env
  server <identifier> set-env KEY VALUE --yes
  server <identifier> network|databases|backups|schedules|activity
  server <identifier> create-backup [--name <name>] --yes
  server <identifier> wait-backup <uuid>
  server <identifier> schedule-create --name <name> --cron "0 3 * * *" --task backup: --yes
  server <identifier> setup-backup --cron "0 3 * * *" --yes
  server <identifier> console [--seconds 10]
  server <identifier> start|stop|restart|kill --yes
  server <identifier> command "npm start" --yes

Backup dan email:
  backup <serverId> --to <email> [--keep] [--tar] --yes
  email-test --to <email> [--smtp-host ...] 

Lainnya:
  raw <application|client> <METHOD> <path> [--body JSON] [--yes]
  config init --domain <url> --ptla <key> --ptlc <key> [--profile <name>]
  config list|show|use|rename|delete|env|doctor
  templates list|show|command
  explain <ERROR_CODE>
  version | self-check | release-check | env-template | completion <bash|zsh|fish>

Environment:
  PTERO_DOMAIN, PTERO_PTLA, PTERO_PTLC
  PTERO_NODE_ID, PTERO_NEST_ID, PTERO_EGG_ID, PTERO_SAFE_MODE
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

Global flags:
  --json   Output JSON
  --yes    Konfirmasi aksi non-interaktif
  --dry-run
  --profile <name>
  --help`);
}
