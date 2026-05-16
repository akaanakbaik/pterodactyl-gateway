import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createPtero } from "./index.js";

const PRESETS = ["mini", "basic", "standard", "premium", "unlimited"];

type WizardFlags = {
  dryRun: boolean;
  yes: boolean;
  json: boolean;
};

export async function runWizard(args: string[]) {
  const action = args[0] ?? "help";
  const flags = parseFlags(args);

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

  throw new Error(`Wizard tidak dikenal: ${action}`);
}

async function wizardCreateUser(flags: WizardFlags) {
  const rl = createInterface({ input, output });
  try {
    console.log("Wizard Create User");
    const username = await required(rl, "Username");
    const email = await required(rl, "Email");
    const password = await question(rl, "Password (kosong = auto)", "auto");
    const administratorRaw = await question(rl, "Administrator? yes/no", "no");
    const administrator = parseYesNo(administratorRaw);
    const payload = { username, email, password, administrator };

    if (flags.dryRun) {
      printResult({ dryRun: true, payload }, flags);
      return;
    }

    if (!flags.yes) {
      const ok = parseYesNo(await question(rl, "Buat user sekarang? yes/no", "no"));
      if (!ok) {
        console.log("Dibatalkan.");
        return;
      }
    }

    const ptero = createPtero.fromEnv();
    const result = await ptero.users.createSmart(payload);
    printResult(result, flags, "User berhasil dibuat.");
  } finally {
    rl.close();
  }
}

async function wizardCreateServer(flags: WizardFlags) {
  const rl = createInterface({ input, output });
  try {
    console.log("Wizard Create Server");
    console.log("Catatan: node/nest/egg ID tetap diisi manual oleh admin. Jalankan `ptero-gateway ids` jika perlu melihat ID.");

    const name = await required(rl, "Nama server");
    const email = await required(rl, "Email owner");
    const username = await question(rl, "Username owner jika ingin auto-create user (kosong = pakai user existing dari email)", "");
    const password = username ? await question(rl, "Password user (kosong = auto)", "auto") : undefined;
    const description = await question(rl, "Description", "Created by Akadev Pterodactyl Gateway Wizard");
    const nodeId = parseRequiredNumber(await required(rl, "Node ID"), "Node ID");
    const nestId = parseRequiredNumber(await required(rl, "Nest ID"), "Nest ID");
    const eggId = parseRequiredNumber(await required(rl, "Egg ID"), "Egg ID");
    const preset = await choosePreset(rl);
    const memory = await question(rl, "Memory override (kosong = preset)", "");
    const disk = await question(rl, "Disk override (kosong = preset)", "");
    const cpu = await question(rl, "CPU override (kosong = preset)", "");
    const databases = await optionalNumber(rl, "Database limit override (kosong = preset)");
    const allocations = await optionalNumber(rl, "Allocation limit override (kosong = preset)");
    const backups = await optionalNumber(rl, "Backup limit override (kosong = preset)");

    const inputPayload = {
      name,
      email,
      username: username || undefined,
      password,
      autoCreateUser: Boolean(username),
      description,
      nodeId,
      nestId,
      eggId,
      dockerImage: "auto",
      startup: "auto",
      preset,
      specs: {
        ...(memory ? { memory } : {}),
        ...(disk ? { disk } : {}),
        ...(cpu ? { cpu } : {}),
        ...(databases !== undefined ? { databases } : {}),
        ...(allocations !== undefined ? { allocations } : {}),
        ...(backups !== undefined ? { backups } : {})
      }
    };

    console.log("\nPreview input:");
    console.log(JSON.stringify(maskPayload(inputPayload), null, 2));

    const ptero = createPtero.fromEnv();

    if (flags.dryRun) {
      const result = await ptero.servers.createSmart(normalizeCreateServerInput(inputPayload), { dryRun: true });
      printResult(result, flags, "Create server dry-run OK.");
      return;
    }

    if (!flags.yes) {
      const ok = parseYesNo(await question(rl, "Buat server sekarang? yes/no", "no"));
      if (!ok) {
        console.log("Dibatalkan.");
        return;
      }
    }

    const result = await ptero.servers.createSmart(normalizeCreateServerInput(inputPayload));
    printResult(result, flags, "Server berhasil dibuat.");
  } finally {
    rl.close();
  }
}

function normalizeCreateServerInput(inputPayload: Record<string, unknown>) {
  const preset = String(inputPayload.preset ?? "basic");
  const fallback = presetToSpecs(preset);
  const specs = { ...fallback, ...(inputPayload.specs as Record<string, unknown>) };
  return { ...inputPayload, specs };
}

function presetToSpecs(preset: string) {
  if (preset === "mini") return { memory: "512MB", disk: "1GB", cpu: "50%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 };
  if (preset === "standard") return { memory: "2GB", disk: "5GB", cpu: "200%", databases: 1, allocations: 1, backups: 1, swap: 0, io: 500 };
  if (preset === "premium") return { memory: "4GB", disk: "10GB", cpu: "300%", databases: 2, allocations: 2, backups: 2, swap: 0, io: 500 };
  if (preset === "unlimited") return { memory: "0", disk: "0", cpu: "0", databases: 5, allocations: 3, backups: 3, swap: 0, io: 500 };
  return { memory: "1GB", disk: "2GB", cpu: "100%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 };
}

async function choosePreset(rl: ReturnType<typeof createInterface>) {
  const answer = await question(rl, `Preset (${PRESETS.join("/")})`, "basic");
  if (!PRESETS.includes(answer)) throw new Error(`Preset tidak dikenal: ${answer}`);
  return answer;
}

async function optionalNumber(rl: ReturnType<typeof createInterface>, label: string) {
  const value = await question(rl, label, "");
  if (!value) return undefined;
  return parseRequiredNumber(value, label);
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

function parseRequiredNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} harus angka.`);
  return parsed;
}

function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "1", "iya", "ya"].includes(normalized)) return true;
  if (["no", "n", "false", "0", "tidak", "nggak", "ga", "gak"].includes(normalized)) return false;
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
    output[key] = /(password|token|key|secret|auth)/i.test(key) && typeof item === "string" ? maskSecret(item) : maskPayload(item);
  }
  return output;
}

function maskSecret(value: string) {
  if (!value || value === "auto") return value;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
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
  console.log(`Akadev Pterodactyl Gateway Wizard

Perintah:
  ptero-gateway wizard create-user
  ptero-gateway wizard create-user --dry-run
  ptero-gateway wizard create-server
  ptero-gateway wizard create-server --dry-run
  ptero-gateway wizard create-server --yes

Catatan:
  Wizard tidak mengelola node/location/allocation.
  Node ID, Nest ID, dan Egg ID tetap diisi manual oleh admin.
  Jalankan ptero-gateway ids untuk melihat daftar ID yang tersedia.`);
}
