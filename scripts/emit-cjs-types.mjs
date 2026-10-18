import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const dist = "dist";
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      collect(path);
      continue;
    }
    if (path.endsWith(".d.ts")) files.push(path);
  }
}

collect(dist);

let generated = 0;
for (const path of files) {
  const content = readFileSync(path, "utf8").replace(/(["'(])(\.{1,2}\/[^"')]+)\.js(["')])/g, "$1$2.cjs$3");
  writeFileSync(path.replace(/\.d\.ts$/, ".d.cts"), content, "utf8");
  generated += 1;
}

console.log(`CJS types OK: ${generated} file (${relative(process.cwd(), dist)}).`);
