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

const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
if (!readme.includes(version)) errors.push(`README.md wajib menyebut versi ${version}.`);
if (/v0\.3|v0\.4|v0\.5|v0\.6/.test(readme)) errors.push("README.md masih berisi roadmap/versi lama yang perlu dibersihkan.");

if (errors.length) {
  console.error("Release guard gagal:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release guard OK: ${pkg.name}@${version}`);
