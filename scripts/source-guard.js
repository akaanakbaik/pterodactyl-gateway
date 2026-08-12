import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src", "test", "scripts"];
const files = [];
const errors = [];

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      collect(path);
      continue;
    }
    if (/\.(?:ts|js|mjs)$/.test(path)) files.push(path);
  }
}

for (const root of roots) collect(root);

for (const path of files) {
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/^\s*(?:\/\/|\/\*|\*)|\s\/\/\s/.test(line)) {
      errors.push(`${relative(process.cwd(), path)}:${index + 1} berisi komentar kode.`);
    }
  });
  const possibleSecrets = content.match(/(?:ptla|ptlc|ghp)_[A-Za-z0-9]{20,}/g) ?? [];
  for (const value of possibleSecrets) {
    if (!/^(?:ptla|ptlc)_x+$/.test(value)) {
      errors.push(`${relative(process.cwd(), path)} berisi pola kredensial yang tidak diizinkan.`);
      break;
    }
  }
}

if (errors.length) {
  console.error("Source guard gagal:");
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Source guard OK: ${files.length} file diperiksa.`);
