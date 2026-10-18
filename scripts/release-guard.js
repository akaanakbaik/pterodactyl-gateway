#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const version = pkg.version;
const errors = [];

if (!version) errors.push("package.json version kosong.");
if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version harus semver stabil, ditemukan: ${version}`);
if (lock.version !== version) errors.push(`package-lock.json version ${lock.version} tidak sama dengan package.json ${version}.`);
if (lock.packages?.[""]?.version !== version) errors.push(`package-lock root version ${lock.packages?.[""]?.version} tidak sama dengan package.json ${version}.`);
if (pkg.name !== "@akaanakbaik/pterodactyl-gateway") errors.push(`nama package tidak sesuai: ${pkg.name}`);
if (pkg.type !== "module") errors.push("package.json type wajib module untuk output ESM utama.");
if (pkg.main !== "./dist/index.cjs") errors.push("main wajib mengarah ke dist/index.cjs untuk konsumen require.");
if (pkg.module !== "./dist/index.js") errors.push("module wajib mengarah ke dist/index.js untuk konsumen import.");
if (pkg.types !== "./dist/index.d.ts") errors.push("types wajib mengarah ke dist/index.d.ts.");
if (!pkg.bin?.["ptero-gateway"] || !pkg.bin?.ptg) errors.push("bin ptero-gateway/ptg wajib ada.");
if (!pkg.bin?.["ptero-wizard"]) errors.push("bin ptero-wizard wajib ada.");
if (!pkg.scripts?.prepublishOnly?.includes("verify")) errors.push("prepublishOnly wajib menjalankan verify.");
if (!pkg.scripts?.verify?.includes("test:release")) errors.push("verify wajib menjalankan test:release.");
if (!pkg.scripts?.verify?.includes("test:types")) errors.push("verify wajib menjalankan test:types.");
if (!pkg.scripts?.["test:cli"]?.includes("version")) errors.push("test:cli wajib mengetes command version.");
if (!pkg.scripts?.["test:cli"]?.includes("self-check")) errors.push("test:cli wajib mengetes command self-check.");
if (!pkg.scripts?.["test:cli"]?.includes("release-check")) errors.push("test:cli wajib mengetes command release-check.");
if (!pkg.files?.includes("dist")) errors.push("files wajib include dist.");
if (!pkg.files?.includes("README.md")) errors.push("files wajib include README.md.");
if (!pkg.homepage) errors.push("homepage wajib ada agar dokumentasi mudah ditemukan.");
if (!pkg.repository?.url) errors.push("repository.url wajib ada.");
if (!pkg.bugs?.url) errors.push("bugs.url wajib ada.");
if (pkg.publishConfig?.access !== "public") errors.push("publishConfig.access wajib public.");
if (!Array.isArray(pkg.keywords) || pkg.keywords.length < 20) errors.push("keywords minimal 20 item untuk discovery npm.");
for (const keyword of ["pterodactyl", "pterodactyl-api", "pterodactyl-sdk", "whatsapp-bot", "discord-bot", "typescript", "esm", "commonjs", "cli"]) {
  if (!pkg.keywords?.includes(keyword)) errors.push(`keyword wajib ada: ${keyword}`);
}

const exportEntry = pkg.exports?.["."];
if (!exportEntry?.import?.types || !exportEntry?.import?.default) errors.push("exports.import wajib berisi types dan default.");
if (!exportEntry?.require?.types || !exportEntry?.require?.default) errors.push("exports.require wajib berisi types dan default.");
if (exportEntry?.require?.types !== "./dist/index.d.cts") errors.push("exports.require.types wajib mengarah ke dist/index.d.cts.");
for (const distFile of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/index.d.cts", "dist/cli-entry.js", "dist/wizard-cli.js"]) {
  if (!existsSync(distFile)) errors.push(`artefak build tidak ditemukan: ${distFile}`);
}

const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
if (!readme.includes(version)) errors.push(`README.md wajib menyebut versi ${version}.`);
for (const section of ["## Instalasi", "## Quick start", "## SDK", "## CLI", "## Perencanaan kapasitas", "## Keamanan", "## Publish ke npm", "## Troubleshooting"]) {
  if (!readme.includes(section)) errors.push(`README.md wajib punya section: ${section}`);
}

const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "";
if (!changelog.includes(`## ${version}`)) errors.push(`CHANGELOG.md wajib memuat versi ${version}.`);

const workflow = existsSync(".github/workflows/publish.yml") ? readFileSync(".github/workflows/publish.yml", "utf8") : "";
if (!workflow.includes("npm publish")) errors.push("workflow publish.yml wajib menjalankan npm publish.");

if (errors.length) {
  console.error("Release guard gagal:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release guard OK: ${pkg.name}@${version}`);
