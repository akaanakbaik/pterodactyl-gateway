#!/usr/bin/env node
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const version = pkg.version;
const lockVersion = lock.version;
const rootVersion = lock.packages?.[""]?.version;
const errors = [];

if (!version) errors.push("package.json version kosong.");
if (lockVersion !== version) errors.push(`package-lock.json version ${lockVersion} tidak sama dengan package.json ${version}.`);
if (rootVersion !== version) errors.push(`package-lock root version ${rootVersion} tidak sama dengan package.json ${version}.`);
if (!pkg.bin?.["ptero-gateway"] || !pkg.bin?.ptg) errors.push("bin ptero-gateway/ptg wajib ada.");
if (!pkg.bin?.["ptero-wizard"]) errors.push("bin ptero-wizard wajib ada.");
if (!pkg.scripts?.prepublishOnly?.includes("verify")) errors.push("prepublishOnly wajib menjalankan verify.");
if (!pkg.files?.includes("dist")) errors.push("files wajib include dist.");

if (errors.length) {
  console.error("Release guard gagal:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release guard OK: ${pkg.name}@${version}`);
