import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

async function main() {
  const ptero = createPtero({
    domain: process.env.PTERO_DOMAIN ?? "https://panel.example.com",
    ptla: process.env.PTERO_PTLA,
    ptlc: process.env.PTERO_PTLC
  });

  const report = await ptero.doctor();
  console.log(`Mode: ${report.mode}`);
  console.log(`Sehat: ${report.ok}`);
  console.log(`Kemampuan: ${JSON.stringify(report.capabilities)}`);

  const nodes = await ptero.application.nodes.all();
  for (const node of nodes) {
    console.log(`Node ${node.attributes.id}: ${node.attributes.name}`);
  }

  const metrics = ptero.metrics();
  console.log(`Request: ${metrics.requests}, p95: ${metrics.latency.p95}ms`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
