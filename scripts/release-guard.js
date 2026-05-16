#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const version = pkg.version;
const lockVersion = lock.version;
const rootVersion = lock.packages?.[""]?.version;
const errors = [];

if (!version) errors.push("package.json version kosong.");
if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version harus semver stabil, ditemukan: ${version}`);
if (lockVersion !== version) errors.push(`package-lock.json version ${lockVersion} tidak sama dengan package.json ${version}.`);
if (rootVersion !== version) errors.push(`package-lock root version ${rootVersion} tidak sama dengan package.json ${version}.`);
if (!pkg.bin?.["ptero-gateway"] || !pkg.bin?.ptg) errors.push("bin ptero-gateway/ptg wajib ada.");
if (!pkg.bin?.["ptero-wizard"]) errors.push("bin ptero-wizard wajib ada.");
if (!pkg.scripts?.prepublishOnly?.includes("verify")) errors.push("prepublishOnly wajib menjalankan verify.");
if (!pkg.scripts?.verify?.includes("test:release")) errors.push("verify wajib menjalankan test:release.");
if (!pkg.scripts?.["test:cli"]?.includes("version")) errors.push("test:cli wajib mengetes command version.");
if (!pkg.scripts?.["test:cli"]?.includes("self-check")) errors.push("test:cli wajib mengetes command self-check.");
if (!pkg.scripts?.["test:cli"]?.includes("release-check")) errors.push("test:cli wajib mengetes command release-check.");
if (!pkg.files?.includes("dist")) errors.push("files wajib include dist.");
if (!pkg.files?.includes("README.md")) errors.push("files wajib include README.md.");
if (!pkg.homepage) errors.push("homepage wajib ada agar npm dan search engine mudah menemukan dokumentasi.");
if (!pkg.repository?.url) errors.push("repository.url wajib ada.");
if (!pkg.bugs?.url) errors.push("bugs.url wajib ada.");
if (!pkg.publishConfig || pkg.publishConfig.access !== "public") errors.push("publishConfig.access wajib public.");
if (!Array.isArray(pkg.keywords) || pkg.keywords.length < 15) errors.push("keywords minimal 15 item untuk discovery npm/search.");
for (const keyword of ["pterodactyl", "pterodactyl-api", "pterodactyl-sdk", "whatsapp-bot", "telegram-bot", "discord-bot", "typescript", "cli"]) {
  if (!pkg.keywords?.includes(keyword)) errors.push(`keyword wajib ada: ${keyword}`);
}

const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
if (!readme.includes(version)) errors.push(`README.md wajib menyebut versi ${version}.`);
if (/v0\.3|v0\.4|v0\.5|v0\.6/.test(readme)) errors.push("README.md masih berisi roadmap/versi lama yang perlu dibersihkan.");
for (const section of ["## Navigasi", "## Install", "## SDK usage", "## Integration helpers", "## Keamanan", "## Troubleshooting"]) {
  if (!readme.includes(section)) errors.push(`README.md wajib punya section: ${section}`);
}

if (errors.length) {
  console.error("Release guard gagal:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release guard OK: ${pkg.name}@${version}`);
