import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const workspace = mkdtempSync(join(tmpdir(), "ptero-gateway-types-"));
const scope = join(workspace, "node_modules", "@akaanakbaik");
mkdirSync(scope, { recursive: true });
symlinkSync(root, join(scope, "pterodactyl-gateway"), "dir");

const tsconfig = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    typeRoots: [join(root, "node_modules", "@types")],
    types: ["node"]
  },
  include: ["consumer.mts", "consumer.cts"]
};

const esmConsumer = `import { createPtero, PteroError, planPlacement, VERSION } from "@akaanakbaik/pterodactyl-gateway";
import type { CreateSmartServerInput, PanelCapabilities } from "@akaanakbaik/pterodactyl-gateway";

const gateway = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test" });
const specs = { memory: "1GB", disk: "2GB", cpu: 100, databases: 0, allocations: 1, backups: 0 };
const plan = planPlacement({ specs, nodes: [], allocations: {}, servers: [] });
const input: CreateSmartServerInput = { name: "demo", description: "demo", nodeId: 1, eggId: 15, specs };
const capabilities = Promise.resolve<PanelCapabilities>({ nests: true, eggs: true, applicationApi: true, clientApi: true });

async function run() {
  await gateway.connect();
  await capabilities;
  void input;
  void plan;
  void VERSION;
  void new PteroError({ code: "X", message: "x" });
}

void run();
`;

const cjsConsumer = `import { createPtero, PteroError, VERSION } from "@akaanakbaik/pterodactyl-gateway";
import type { GatewayMetrics } from "@akaanakbaik/pterodactyl-gateway";

const gateway = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test" });

function readMetrics(): GatewayMetrics {
  return gateway.metrics();
}

export async function boot(): Promise<string> {
  await gateway.connect();
  readMetrics();
  void new PteroError({ code: "X", message: "x" });
  return VERSION;
}
`;

writeFileSync(join(workspace, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
writeFileSync(join(workspace, "consumer.mts"), esmConsumer);
writeFileSync(join(workspace, "consumer.cts"), cjsConsumer);

const tsc = spawnSync(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], {
  cwd: workspace,
  encoding: "utf8"
});

const output = `${tsc.stdout ?? ""}${tsc.stderr ?? ""}`.trim();
rmSync(workspace, { recursive: true, force: true });

if (tsc.status !== 0) {
  console.error("Type consumer gagal:");
  console.error(output);
  process.exit(1);
}

console.log("Type consumer OK: ESM dan CJS types terselesaikan.");
