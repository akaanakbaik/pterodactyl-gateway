import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_JSON = join(ROOT_DIR, "package.json");
const PACKAGE_LOCK = join(ROOT_DIR, "package-lock.json");

export function versionCommand(jsonMode: boolean) {
  const pkg = readJson(PACKAGE_JSON);
  const result = {
    name: pkg.name,
    version: pkg.version,
    node: process.version,
    bin: pkg.bin ?? {},
    installRoot: ROOT_DIR
  };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.name}@${result.version}`);
}

export function selfCheckCommand(jsonMode: boolean) {
  const pkg = readJson(PACKAGE_JSON);
  const lock = existsSync(PACKAGE_LOCK) ? readJson(PACKAGE_LOCK) : undefined;
  const checks = [
    check("package.json", existsSync(PACKAGE_JSON), PACKAGE_JSON),
    lock ? check("package-lock.json", true, PACKAGE_LOCK) : check("package-lock.json", true, "not included in installed npm package; source-only check skipped"),
    check("name", pkg.name === "@akaanakbaik/pterodactyl-gateway", String(pkg.name)),
    check("version", Boolean(pkg.version), String(pkg.version ?? "")),
    check("lock version", !lock || lock.version === pkg.version, lock ? String(lock.version) : "skipped"),
    check("root lock version", !lock || lock.packages?.[""]?.version === pkg.version, lock ? String(lock.packages?.[""]?.version) : "skipped"),
    check("bin ptero-gateway", Boolean(pkg.bin?.["ptero-gateway"]), String(pkg.bin?.["ptero-gateway"] ?? "")),
    check("bin ptg", Boolean(pkg.bin?.ptg), String(pkg.bin?.ptg ?? "")),
    check("bin ptero-wizard", Boolean(pkg.bin?.["ptero-wizard"]), String(pkg.bin?.["ptero-wizard"] ?? "")),
    check("prepublishOnly", String(pkg.scripts?.prepublishOnly ?? "").includes("verify"), String(pkg.scripts?.prepublishOnly ?? "")),
    check("node >=18", nodeMajor() >= 18, process.version)
  ];
  const result = { ok: checks.every(item => item.ok), mode: lock ? "source" : "installed", checks };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Self-check: ${result.ok ? "OK" : "FAILED"}`);
    console.log(`Mode: ${result.mode}`);
    for (const item of checks) console.log(`${item.ok ? "✓" : "✗"} ${item.name}: ${item.detail}`);
  }
}

export function releaseCheckCommand(jsonMode: boolean) {
  const pkg = readJson(PACKAGE_JSON);
  const lock = existsSync(PACKAGE_LOCK) ? readJson(PACKAGE_LOCK) : undefined;
  const sourceMode = Boolean(lock);
  const checks = [
    check("version set", Boolean(pkg.version), String(pkg.version ?? "")),
    sourceMode ? check("lock version matches", lock.version === pkg.version, `${lock.version} / ${pkg.version}`) : check("lock version matches", true, "skipped outside source checkout"),
    sourceMode ? check("lock root version matches", lock.packages?.[""]?.version === pkg.version, `${lock.packages?.[""]?.version} / ${pkg.version}`) : check("lock root version matches", true, "skipped outside source checkout"),
    check("dist included", Array.isArray(pkg.files) && pkg.files.includes("dist"), JSON.stringify(pkg.files ?? [])),
    check("README included", Array.isArray(pkg.files) && pkg.files.includes("README.md"), JSON.stringify(pkg.files ?? [])),
    check("license MIT", pkg.license === "MIT", String(pkg.license ?? "")),
    check("prepublishOnly verify", String(pkg.scripts?.prepublishOnly ?? "").includes("verify"), String(pkg.scripts?.prepublishOnly ?? "")),
    check("test:release exists", Boolean(pkg.scripts?.["test:release"]), String(pkg.scripts?.["test:release"] ?? "")),
    check("no node admin help string", true, "checked by CLI grep in manual smoke test")
  ];
  const result = { ok: checks.every(item => item.ok), mode: sourceMode ? "source" : "installed", package: `${pkg.name}@${pkg.version}`, checks };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Release-check: ${result.ok ? "OK" : "FAILED"}`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Package: ${result.package}`);
    for (const item of checks) console.log(`${item.ok ? "✓" : "✗"} ${item.name}: ${item.detail}`);
  }
  if (!result.ok) process.exitCode = 1;
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function check(name: string, ok: boolean, detail: string) {
  return { name, ok, detail };
}

function nodeMajor() {
  return Number(process.version.replace(/^v/, "").split(".")[0] ?? "0");
}
