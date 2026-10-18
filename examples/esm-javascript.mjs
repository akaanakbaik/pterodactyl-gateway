import { createPtero, formatMiB } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero.fromEnv();

const capacity = await ptero.capacity();
for (const node of capacity) {
  console.log(`${node.name}: RAM ${formatMiB(node.memory.allocated)} terpakai, ${node.allocations.free} port kosong`);
}

const servers = await ptero.listAllServers();
console.log(`Total server: ${servers.length}`);

for (const server of servers) {
  const attributes = server.attributes;
  console.log(`- ${attributes.name} (${attributes.identifier})`);
}
