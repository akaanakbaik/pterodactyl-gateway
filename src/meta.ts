import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { PACKAGE_NAME, VERSION } from "./version.js";

export function versionCommand(jsonMode: boolean) {
  const result = {
    name: PACKAGE_NAME,
    version: VERSION,
    node: process.version,
    bin: { "ptero-gateway": "dist/cli-entry.js", ptg: "dist/cli-entry.js", "ptero-wizard": "dist/wizard-cli.js" },
    installRoot: findPackageRoot()
  };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.name}@${result.version}`);
}

export function selfCheckCommand(jsonMode: boolean) {
  const root = findPackageRoot();
  const packagePath = join(root, "package.json");
  const lockPath = join(root, "package-lock.json");
  const pkg = existsSync(packagePath) ? readJson(packagePath) : {};
  const lock = existsSync(lockPath) ? readJson(lockPath) : undefined;
  const checks = [
    check("package.json", existsSync(packagePath), packagePath),
    check("package version", pkg.version === VERSION, `${pkg.version ?? "missing"} / ${VERSION}`),
    check("package name", pkg.name === PACKAGE_NAME, String(pkg.name ?? "missing")),
    check("lock version", !lock || lock.version === VERSION, lock ? String(lock.version) : "skipped outside source checkout"),
    check("bin ptero-gateway", Boolean(pkg.bin?.["ptero-gateway"]), String(pkg.bin?.["ptero-gateway"] ?? "missing")),
    check("bin ptg", Boolean(pkg.bin?.ptg), String(pkg.bin?.ptg ?? "missing")),
    check("bin ptero-wizard", Boolean(pkg.bin?.["ptero-wizard"]), String(pkg.bin?.["ptero-wizard"] ?? "missing")),
    check("dual exports", Boolean(pkg.exports?.["."]?.import && pkg.exports?.["."]?.require), JSON.stringify(pkg.exports?.["."] ?? {})),
    check("node >=18", nodeMajor() >= 18, process.version),
    check("prepublishOnly", String(pkg.scripts?.prepublishOnly ?? "").includes("verify"), String(pkg.scripts?.prepublishOnly ?? "missing"))
  ];
  const result = { ok: checks.every(item => item.ok), mode: lock ? "source" : "installed", version: VERSION, checks };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Self-check: ${result.ok ? "OK" : "FAILED"}`);
    console.log(`Mode: ${result.mode}`);
    for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }
  if (!result.ok) process.exitCode = 1;
}

export function releaseCheckCommand(jsonMode: boolean) {
  const root = findPackageRoot();
  const packagePath = join(root, "package.json");
  const pkg = existsSync(packagePath) ? readJson(packagePath) : {};
  const checks = [
    check("version set", pkg.version === VERSION, `${pkg.version ?? "missing"} / ${VERSION}`),
    check("dist included", Array.isArray(pkg.files) && pkg.files.includes("dist"), JSON.stringify(pkg.files ?? [])),
    check("README included", Array.isArray(pkg.files) && pkg.files.includes("README.md"), JSON.stringify(pkg.files ?? [])),
    check("CHANGELOG included", Array.isArray(pkg.files) && pkg.files.includes("CHANGELOG.md"), JSON.stringify(pkg.files ?? [])),
    check("license MIT", pkg.license === "MIT", String(pkg.license ?? "missing")),
    check("dual exports", Boolean(pkg.exports?.["."]?.import && pkg.exports?.["."]?.require), JSON.stringify(pkg.exports?.["."] ?? {})),
    check("publishConfig public", pkg.publishConfig?.access === "public", String(pkg.publishConfig?.access ?? "missing")),
    check("prepublishOnly verify", String(pkg.scripts?.prepublishOnly ?? "").includes("verify"), String(pkg.scripts?.prepublishOnly ?? "missing")),
    check("test:release exists", Boolean(pkg.scripts?.["test:release"]), String(pkg.scripts?.["test:release"] ?? "missing"))
  ];
  const result = { ok: checks.every(item => item.ok), package: `${PACKAGE_NAME}@${VERSION}`, checks };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Release-check: ${result.ok ? "OK" : "FAILED"}`);
    console.log(`Package: ${result.package}`);
    for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }
  if (!result.ok) process.exitCode = 1;
}

export function findPackageRoot(): string {
  const starts = [dirname(resolve(process.argv[1] ?? process.cwd())), resolve(process.cwd())];
  for (const start of starts) {
    let current = start;
    const root = parse(current).root;
    while (true) {
      const candidate = join(current, "package.json");
      if (existsSync(candidate)) {
        const pkg = readJson(candidate);
        if (pkg.name === PACKAGE_NAME) return current;
      }
      if (current === root) break;
      current = dirname(current);
    }
  }
  return resolve(process.cwd());
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function check(name: string, ok: boolean, detail: string) {
  return { name, ok, detail };
}

function nodeMajor() {
  return Number(process.version.replace(/^v/, "").split(".")[0] ?? "0");
}
