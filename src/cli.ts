#!/usr/bin/env node
import { createPtero, explainError } from "./index.js";

const rawArgs = process.argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const yesMode = rawArgs.includes("--yes") || rawArgs.includes("-y");
const dryRunMode = rawArgs.includes("--dry-run");
const args = rawArgs.filter(arg => arg !== "--json" && arg !== "--yes" && arg !== "-y" && arg !== "--dry-run");
const command = args[0] ?? "help";

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    console.log("Pterodactyl Gateway CLI (v1.1.0)");
    return;
  }

  const ptero = createPtero.fromEnv();

  try {
    if (command === "doctor") {
      const report = await ptero.doctor();
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (command === "servers") {
      const res = await ptero.client.servers.list();
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    if (command === "server") {
      const id = args[1];
      const action = args[2];
      if (!id || !action) throw new Error("Format: ptero-gateway server <id> <action>");
      const server = ptero.server(id);

      if (action === "resources") {
        console.log(JSON.stringify(await server.resources(), null, 2));
      } else if (action === "start") {
        await server.power("start");
        console.log("Start signal sent.");
      } else if (action === "stop") {
        await server.power("stop");
        console.log("Stop signal sent.");
      } else if (action === "restart") {
        await server.power("restart");
        console.log("Restart signal sent.");
      } else if (action === "kill") {
        await server.power("kill");
        console.log("Kill signal sent.");
      }
      return;
    }

    console.log(`Command '${command}' not found.`);
  } catch (err) {
    console.error(explainError(err));
    process.exit(1);
  }
}

main();
