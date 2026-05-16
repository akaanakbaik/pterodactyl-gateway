import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type GatewayProfile = {
  domain: string;
  ptla?: string;
  ptlc?: string;
};

type GatewayConfig = {
  active?: string;
  profiles: Record<string, GatewayProfile>;
};

const CONFIG_DIR = join(homedir(), ".pterodactyl-gateway");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export async function configCommand(args: string[]) {
  const action = args[0] ?? "help";
  const jsonMode = args.includes("--json");

  if (["help", "--help", "-h"].includes(action)) {
    printConfigHelp();
    return;
  }

  if (action === "path") {
    console.log(CONFIG_FILE);
    return;
  }

  if (action === "init" || action === "set") {
    const profile = getOption(args, "--profile") ?? getOption(args, "--name") ?? "default";
    const domain = getOption(args, "--domain") ?? process.env.PTERO_DOMAIN;
    const ptla = getOption(args, "--ptla") ?? process.env.PTERO_PTLA;
    const ptlc = getOption(args, "--ptlc") ?? process.env.PTERO_PTLC;
    if (!domain) throw new Error("--domain wajib diisi atau set PTERO_DOMAIN dulu.");
    const config = readConfig();
    config.profiles[profile] = compactProfile({ domain, ptla, ptlc });
    config.active = profile;
    writeConfig(config);
    printJsonOrText(jsonMode, safeConfig(config), `Profile '${profile}' tersimpan dan aktif.`);
    return;
  }

  if (action === "list") {
    const config = readConfig();
    const rows = Object.entries(config.profiles).map(([name, profile]) => ({
      name,
      active: config.active === name ? "yes" : "no",
      domain: profile.domain,
      ptla: profile.ptla ? maskSecret(profile.ptla) : "-",
      ptlc: profile.ptlc ? maskSecret(profile.ptlc) : "-"
    }));
    printJsonOrText(jsonMode, safeConfig(config), rows.length ? table(rows, ["name", "active", "domain", "ptla", "ptlc"]) : "Belum ada config profile.");
    return;
  }

  if (action === "show") {
    const config = readConfig();
    const profileName = args[1] && !args[1].startsWith("--") ? args[1] : config.active;
    if (!profileName) throw new Error("Belum ada active profile. Jalankan: ptero-gateway config init --domain ...");
    const profile = config.profiles[profileName];
    if (!profile) throw new Error(`Profile tidak ditemukan: ${profileName}`);
    printJsonOrText(jsonMode, { name: profileName, ...safeProfile(profile) }, formatProfile(profileName, profile));
    return;
  }

  if (action === "use") {
    const profileName = args[1];
    if (!profileName) throw new Error("Format: ptero-gateway config use <profile>");
    const config = readConfig();
    if (!config.profiles[profileName]) throw new Error(`Profile tidak ditemukan: ${profileName}`);
    config.active = profileName;
    writeConfig(config);
    printJsonOrText(jsonMode, safeConfig(config), `Profile aktif: ${profileName}`);
    return;
  }

  if (action === "rename") {
    const oldName = args[1];
    const newName = args[2];
    if (!oldName || !newName) throw new Error("Format: ptero-gateway config rename <old> <new>");
    const config = readConfig();
    if (!config.profiles[oldName]) throw new Error(`Profile tidak ditemukan: ${oldName}`);
    if (config.profiles[newName]) throw new Error(`Profile tujuan sudah ada: ${newName}`);
    config.profiles[newName] = config.profiles[oldName];
    delete config.profiles[oldName];
    if (config.active === oldName) config.active = newName;
    writeConfig(config);
    printJsonOrText(jsonMode, safeConfig(config), `Profile '${oldName}' diganti menjadi '${newName}'.`);
    return;
  }

  if (action === "delete" || action === "remove" || action === "rm") {
    const profileName = args[1];
    if (!profileName) throw new Error("Format: ptero-gateway config delete <profile> --yes");
    if (!args.includes("--yes")) throw new Error("Aksi delete config butuh --yes.");
    const config = readConfig();
    if (!config.profiles[profileName]) throw new Error(`Profile tidak ditemukan: ${profileName}`);
    delete config.profiles[profileName];
    if (config.active === profileName) config.active = Object.keys(config.profiles)[0];
    writeConfig(config);
    printJsonOrText(jsonMode, safeConfig(config), `Profile '${profileName}' dihapus.`);
    return;
  }

  if (action === "env") {
    const config = readConfig();
    const profileName = args[1] && !args[1].startsWith("--") ? args[1] : config.active;
    if (!profileName) throw new Error("Belum ada active profile.");
    const profile = config.profiles[profileName];
    if (!profile) throw new Error(`Profile tidak ditemukan: ${profileName}`);
    console.log(toEnv(profile));
    return;
  }

  if (action === "doctor") {
    const config = readConfig();
    const profileName = args[1] && !args[1].startsWith("--") ? args[1] : config.active;
    const profile = profileName ? config.profiles[profileName] : undefined;
    const result = {
      ok: Boolean(profile?.domain && (profile.ptla || profile.ptlc)),
      path: CONFIG_FILE,
      active: profileName ?? null,
      profileExists: Boolean(profile),
      hasDomain: Boolean(profile?.domain),
      hasPtla: Boolean(profile?.ptla),
      hasPtlc: Boolean(profile?.ptlc)
    };
    const pretty = [
      `Config: ${result.ok ? "OK" : "PERLU DILENGKAPI"}`,
      `Path: ${result.path}`,
      `Active: ${result.active ?? "-"}`,
      `${result.profileExists ? "✓" : "✗"} profile tersedia`,
      `${result.hasDomain ? "✓" : "✗"} domain`,
      `${result.hasPtla ? "✓" : "-"} PTLA`,
      `${result.hasPtlc ? "✓" : "-"} PTLC`
    ].join("\n");
    printJsonOrText(jsonMode, result, pretty);
    return;
  }

  throw new Error(`Config command tidak dikenal: ${action}`);
}

export function applyConfigProfile(profileName = process.env.PTERO_PROFILE) {
  if (!existsSync(CONFIG_FILE)) return false;
  const config = readConfig();
  const active = profileName || config.active;
  if (!active) return false;
  const profile = config.profiles[active];
  if (!profile) return false;
  process.env.PTERO_DOMAIN ||= profile.domain;
  if (profile.ptla) process.env.PTERO_PTLA ||= profile.ptla;
  if (profile.ptlc) process.env.PTERO_PTLC ||= profile.ptlc;
  return true;
}

function readConfig(): GatewayConfig {
  if (!existsSync(CONFIG_FILE)) return { profiles: {} };
  const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as Partial<GatewayConfig>;
  return { active: raw.active, profiles: raw.profiles ?? {} };
}

function writeConfig(config: GatewayConfig) {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {}
}

function compactProfile(profile: GatewayProfile): GatewayProfile {
  return {
    domain: profile.domain.replace(/\/$/, ""),
    ...(profile.ptla ? { ptla: profile.ptla } : {}),
    ...(profile.ptlc ? { ptlc: profile.ptlc } : {})
  };
}

function getOption(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function safeConfig(config: GatewayConfig) {
  return {
    active: config.active,
    profiles: Object.fromEntries(Object.entries(config.profiles).map(([name, profile]) => [name, safeProfile(profile)]))
  };
}

function safeProfile(profile: GatewayProfile) {
  return {
    domain: profile.domain,
    ptla: profile.ptla ? maskSecret(profile.ptla) : undefined,
    ptlc: profile.ptlc ? maskSecret(profile.ptlc) : undefined
  };
}

function formatProfile(name: string, profile: GatewayProfile) {
  return [
    `Profile: ${name}`,
    `Domain: ${profile.domain}`,
    `PTLA: ${profile.ptla ? maskSecret(profile.ptla) : "-"}`,
    `PTLC: ${profile.ptlc ? maskSecret(profile.ptlc) : "-"}`
  ].join("\n");
}

function toEnv(profile: GatewayProfile) {
  return [
    `export PTERO_DOMAIN=${JSON.stringify(profile.domain)}`,
    profile.ptla ? `export PTERO_PTLA=${JSON.stringify(profile.ptla)}` : "",
    profile.ptlc ? `export PTERO_PTLC=${JSON.stringify(profile.ptlc)}` : ""
  ].filter(Boolean).join("\n");
}

function maskSecret(value: string) {
  if (value.length <= 10) return "********";
  return `${value.slice(0, 5)}********${value.slice(-4)}`;
}

function printJsonOrText(jsonMode: boolean, raw: unknown, text: string) {
  if (jsonMode) console.log(JSON.stringify(raw, null, 2));
  else console.log(text);
}

function table(rows: Array<Record<string, string>>, columns: string[]) {
  const widths = columns.map(column => Math.max(column.length, ...rows.map(row => String(row[column] ?? "").length)));
  return [
    columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  "),
    widths.map(width => "-".repeat(width)).join("  "),
    ...rows.map(row => columns.map((column, index) => String(row[column] ?? "").padEnd(widths[index] ?? column.length)).join("  "))
  ].join("\n");
}

function printConfigHelp() {
  console.log(`Akadev Pterodactyl Gateway Config

Perintah:
  ptero-gateway config path
  ptero-gateway config init --domain https://panel.example.com --ptla ptla_xxx --ptlc ptlc_xxx
  ptero-gateway config init --profile prod --domain https://panel.example.com --ptla ptla_xxx --ptlc ptlc_xxx
  ptero-gateway config list
  ptero-gateway config show [profile]
  ptero-gateway config use <profile>
  ptero-gateway config rename <old> <new>
  ptero-gateway config delete <profile> --yes
  ptero-gateway config env [profile]
  ptero-gateway config doctor

Catatan:
  File config disimpan di ~/.pterodactyl-gateway/config.json dengan permission 600.
  CLI otomatis memakai active profile jika env PTERO_DOMAIN/PTERO_PTLA/PTERO_PTLC belum di-set.`);
}
