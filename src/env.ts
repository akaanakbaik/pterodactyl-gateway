import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function parseEnv(content: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
    output[key] = value;
  }
  return output;
}

export function loadEnvFiles(paths: string[] = [".env", ".env.local"], cwd = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const path of paths) {
    const target = resolve(cwd, path);
    if (!existsSync(target)) continue;
    const values = parseEnv(readFileSync(target, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(target);
  }
  return loaded;
}

export function environmentTemplate(): string {
  return [
    "PTERO_DOMAIN=https://panel.example.com",
    "PTERO_PTLA=ptla_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "PTERO_PTLC=ptlc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "PTERO_NODE_ID=1",
    "PTERO_NEST_ID=5",
    "PTERO_EGG_ID=15",
    "PTERO_SAFE_MODE=true",
    "PTERO_DEBUG=false",
    "",
    "SMTP_HOST=smtp.example.com",
    "SMTP_PORT=587",
    "SMTP_USER=user@example.com",
    "SMTP_PASS=password",
    "SMTP_FROM=user@example.com",
    "SMTP_FROM_NAME=Pterodactyl Gateway",
    "SMTP_ENCRYPTION=starttls",
    "SMTP_REJECT_UNAUTHORIZED=true"
  ].join("\n");
}
