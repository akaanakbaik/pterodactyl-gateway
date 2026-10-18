import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { applyConfigProfile } from "./config.js";
import { loadEnvFiles } from "./env.js";
import { createPtero } from "./index.js";
import { getDataAttributes, maskSecret } from "./utils.js";
import type { PteroGateway } from "./gateway.js";
import type { CreateSmartServerInput, ServerSpecsInput } from "./types.js";

const PRESETS = ["mini", "basic", "standard", "premium", "unlimited"];

type WizardFlags = {
  dryRun: boolean;
  yes: boolean;
  json: boolean;
};

export async function runWizard(args: string[]) {
  const action = args[0] ?? "help";
  const flags = parseFlags(args);
  loadEnvFiles();
  applyConfigProfile();

  if (["help", "--help", "-h"].includes(action)) {
    printWizardHelp();
    return;
  }
  if (action === "create-user") {
    await wizardCreateUser(flags);
    return;
  }
  if (action === "create-server") {
    await wizardCreateServer(flags);
    return;
  }
  if (action === "doctor") {
    const gateway = createPtero.fromEnv();
    const report = await gateway.doctor();
    printResult(report, flags, report.ok ? "Panel sehat." : "Panel perlu perbaikan.");
    return;
  }
  throw new Error(`Wizard tidak dikenal: ${action}`);
}

async function wizardCreateUser(flags: WizardFlags) {
  const rl = createInterface({ input, output });
  try {
    console.log("Wizard Create User");
    const username = await required(rl, "Username");
    const email = await required(rl, "Email");
    const password = await question(rl, "Password (kosong = auto)", "auto");
    const administrator = parseYesNo(await question(rl, "Administrator? yes/no", "no"));
    const payload = { username, email, password, administrator };
    const gateway = createPtero.fromEnv();

    if (flags.dryRun) {
      printResult(await gateway.smart.users.create(payload, { dryRun: true }), flags, "Dry run create user.");
      return;
    }
    if (!(await confirm(rl, flags, "Buat user sekarang?"))) return;
    const result = await gateway.smart.users.create(payload);
    printResult(result, flags, `User dibuat: ${"id" in result ? result.id : "-"}`);
  } finally {
    rl.close();
  }
}

async function wizardCreateServer(flags: WizardFlags) {
  const rl = createInterface({ input, output });
  try {
    const gateway = createPtero.fromEnv();
    console.log("Wizard Create Server");
    const connect = await gateway.connect();
    if (!connect.ok) throw new Error("Koneksi panel gagal. Jalankan ptero-gateway doctor.");

    const nodes = await gateway.application.nodes.all();
    if (nodes.length === 0) throw new Error("Tidak ada node pada panel.");
    printRows(
      nodes.map(node => {
        const attributes = getDataAttributes(node);
        return { id: attributes.id, name: attributes.name, memory: attributes.memory, disk: attributes.disk };
      })
    );

    const nodeId = Number(await question(rl, "Node ID", String(getDataAttributes(nodes[0]).id ?? 1)));
    const eggs = await gateway.listEggs();
    printRows(
      eggs.slice(0, 25).map(egg => {
        const attributes = getDataAttributes(egg);
        return { id: attributes.id, name: attributes.name, image: attributes.docker_image };
      })
    );
    const eggId = Number(await question(rl, "Egg ID", "15"));
    const nestId = Number(await question(rl, "Nest ID", "5"));
    const name = await required(rl, "Nama server");
    const email = await required(rl, "Email owner");
    const username = await question(rl, "Username owner (kosong = dari email)", "");
    const preset = await choosePreset(rl);
    const memory = await question(rl, "Memory override (kosong = preset)", "");
    const disk = await question(rl, "Disk override (kosong = preset)", "");
    const cpu = await question(rl, "CPU override (kosong = preset)", "");
    const useExistingUser = username ? false : await confirm(rl, flags, "Gunakan user existing / auto create tanpa password custom?", true);
    const payload: CreateSmartServerInput = {
      name,
      email,
      username: username || undefined,
      password: "auto",
      autoCreateUser: !useExistingUser || Boolean(username),
      description: `Managed by Pterodactyl Gateway (${new Date().toISOString().slice(0, 10)})`,
      nodeId,
      nestId,
      eggId,
      preset,
      specs: {
        ...presetSpecs(preset),
        ...(memory ? { memory } : {}),
        ...(disk ? { disk } : {}),
        ...(cpu ? { cpu } : {})
      },
      startup: "auto",
      dockerImage: "auto",
      environment: "auto",
      startOnCompletion: false
    };

    console.log("\nPreview input:");
    console.log(JSON.stringify(maskPayload(payload), null, 2));

    if (flags.dryRun) {
      printResult(await gateway.smart.servers.create(payload, { dryRun: true }), flags, "Dry run create server.");
      return;
    }
    if (!(await confirm(rl, flags, "Buat server sekarang?"))) return;
    const result = await gateway.smart.servers.create(payload, {
      onProgress: flags.json ? undefined : step => process.stderr.write(`[${step.percent}%] ${step.message}\n`)
    });
    printResult(result, flags, `Server dibuat: ${"identifier" in result ? result.identifier ?? "-" : "-"}`);
  } finally {
    rl.close();
  }
}

function presetSpecs(preset: string): ServerSpecsInput {
  const table: Record<string, ServerSpecsInput> = {
    mini: { memory: "512MB", disk: "1GB", cpu: "50%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 },
    basic: { memory: "1GB", disk: "2GB", cpu: "100%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 },
    standard: { memory: "2GB", disk: "5GB", cpu: "200%", databases: 1, allocations: 1, backups: 1, swap: 0, io: 500 },
    premium: { memory: "4GB", disk: "10GB", cpu: "300%", databases: 2, allocations: 2, backups: 2, swap: 0, io: 500 },
    unlimited: { memory: 0, disk: 0, cpu: 0, databases: 5, allocations: 3, backups: 3, swap: 0, io: 500 }
  };
  return table[preset] ?? table.basic!;
}

async function choosePreset(rl: ReturnType<typeof createInterface>) {
  const answer = await question(rl, `Preset (${PRESETS.join("/")})`, "basic");
  if (!PRESETS.includes(answer)) throw new Error(`Preset tidak dikenal: ${answer}`);
  return answer;
}

async function confirm(rl: ReturnType<typeof createInterface>, flags: WizardFlags, message: string, defaultValue = false) {
  if (flags.yes) return true;
  const answer = (await question(rl, `${message} yes/no`, defaultValue ? "yes" : "no")).toLowerCase();
  return parseYesNo(answer);
}

async function required(rl: ReturnType<typeof createInterface>, label: string) {
  const value = await question(rl, label, "");
  if (!value) throw new Error(`${label} wajib diisi.`);
  return value;
}

async function question(rl: ReturnType<typeof createInterface>, label: string, fallback: string) {
  const suffix = fallback ? ` [${fallback}]` : "";
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || fallback;
}

function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "1", "ya", "iya"].includes(normalized)) return true;
  if (["no", "n", "false", "0", "tidak", "nggak", "gak", ""].includes(normalized)) return false;
  throw new Error("Jawaban harus yes/no.");
}

function parseFlags(args: string[]): WizardFlags {
  return {
    dryRun: args.includes("--dry-run"),
    yes: args.includes("--yes") || args.includes("-y"),
    json: args.includes("--json")
  };
}

function maskPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskPayload);
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = /(password|token|key|secret|auth)/i.test(key) && typeof item === "string" && item !== "auto" ? maskSecret(item) : maskPayload(item);
  }
  return output;
}

function printRows(rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    console.log(Object.entries(row).map(([key, value]) => `${key}=${String(value ?? "-")}`).join("  "));
  }
}

function printResult(result: unknown, flags: WizardFlags, message?: string) {
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (message) console.log(message);
  console.log(JSON.stringify(maskPayload(result), null, 2));
}

function printWizardHelp() {
  console.log(`Pterodactyl Gateway Wizard

Perintah:
  ptero-wizard doctor
  ptero-wizard create-user [--dry-run] [--yes]
  ptero-wizard create-server [--dry-run] [--yes]

Catatan:
  Wizard membaca node dan egg langsung dari panel.
  Gunakan ptero-gateway plan untuk simulasi penempatan server.
  API key dibaca dari environment atau profile config.`);
}

export async function wizardGateway(): Promise<PteroGateway> {
  return createPtero.fromEnv();
}
