import { createPtero } from "../src/index.js";

const ptero = createPtero.fromEnv();

const input = {
  name: "Bot WhatsApp Aka",
  email: "aka@example.com",
  description: "Server bot WhatsApp untuk Aka",
  nodeId: 1,
  nestId: 5,
  eggId: 15,
  specs: {
    memory: "2GB",
    disk: "5GB",
    cpu: "100%",
    databases: 1,
    allocations: 1,
    backups: 1
  }
} as const;

const preview = await ptero.smart.servers.preview(input);
console.log(preview.payload);

const dryRun = await ptero.smart.servers.create(input, { dryRun: true });
console.log(dryRun.payload);
