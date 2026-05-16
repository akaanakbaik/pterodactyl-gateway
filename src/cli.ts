#!/usr/bin/env node
import { createPtero, explainError } from "./index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const ptero = createPtero.fromEnv();

  if (command === "doctor") {
    const report = await ptero.doctor();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  if (command === "connect") {
    console.log(JSON.stringify(await ptero.connect(), null, 2));
    return;
  }

  if (command === "ids") {
    const nestIndex = args.indexOf("--nest");
    const nestId = nestIndex >= 0 ? Number(args[nestIndex + 1]) : undefined;
    console.log(JSON.stringify(await ptero.listIds(nestId), null, 2));
    return;
  }

  if (command === "servers") {
    const raw = await ptero.raw.client.get("/");
    console.log(JSON.stringify(formatClientServers(raw), null, 2));
    return;
  }

  if (command === "probe") {
    const id = args[1];
    if (!id) throw new Error("Format: ptero-gateway probe <identifier>");
    if (isPlaceholderIdentifier(id)) throw new Error("IDENTIFIER_SERVER hanya placeholder. Jalankan `ptero-gateway servers`, lalu salin nilai `identifier` server yang ingin dicek.");
    const report = await ptero.server(id).probe();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  if (command === "server") {
    const id = args[1];
    const action = args[2];
    if (!id || !action) throw new Error("Format: ptero-gateway server <identifier> <start|stop|restart|kill|resources|command>");
    if (isPlaceholderIdentifier(id)) throw new Error("IDENTIFIER_SERVER hanya placeholder. Jalankan `ptero-gateway servers`, lalu salin nilai `identifier` server yang ingin dikontrol.");
    const server = ptero.server(id);
    if (action === "start") console.log(JSON.stringify(await server.start(), null, 2));
    else if (action === "stop") console.log(JSON.stringify(await server.stop(), null, 2));
    else if (action === "restart") console.log(JSON.stringify(await server.restart(), null, 2));
    else if (action === "kill") console.log(JSON.stringify(await server.kill(), null, 2));
    else if (action === "resources") console.log(JSON.stringify(await server.resources(), null, 2));
    else if (action === "command") console.log(JSON.stringify(await server.command(args.slice(3).join(" ")), null, 2));
    else throw new Error(`Action server tidak dikenal: ${action}`);
    return;
  }

  throw new Error(`Command tidak dikenal: ${command}`);
}

function formatClientServers(raw: unknown) {
  const root = asRecord(raw);
  const data = Array.isArray(root.data) ? root.data : [];
  return data.map(item => {
    const attributes = asRecord(asRecord(item).attributes);
    return {
      identifier: String(attributes.identifier ?? ""),
      uuid: String(attributes.uuid ?? ""),
      name: String(attributes.name ?? ""),
      node: String(attributes.node ?? ""),
      serverOwner: Boolean(attributes.server_owner ?? false)
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isPlaceholderIdentifier(value: string): boolean {
  return value === "IDENTIFIER_SERVER" || value === "<identifier>" || value === "abc12345";
}

function printHelp() {
  console.log(`Akadev Pterodactyl Gateway

Perintah:
  ptero-gateway doctor
  ptero-gateway connect
  ptero-gateway ids
  ptero-gateway ids --nest <nestId>
  ptero-gateway servers
  ptero-gateway probe <identifier>
  ptero-gateway server <identifier> resources
  ptero-gateway server <identifier> start
  ptero-gateway server <identifier> stop
  ptero-gateway server <identifier> restart
  ptero-gateway server <identifier> kill
  ptero-gateway server <identifier> command "npm start"

Env:
  PTERO_DOMAIN=https://panel.example.com
  PTERO_PTLA=ptla_xxx
  PTERO_PTLC=ptlc_xxx`);
}

main().catch(error => {
  console.error(explainError(error));
  process.exitCode = 1;
});
