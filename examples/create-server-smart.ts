import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

async function main() {
  const ptero = createPtero.fromEnv();
  const specs = {
    memory: "2GB",
    disk: "5GB",
    cpu: "200%",
    databases: 1,
    allocations: 1,
    backups: 1
  };

  const plan = await ptero.planServer(specs, { strategy: "balanced", reservePercent: 10 });
  if (!plan.plan.selected) throw new Error(plan.plan.message ?? "Tidak ada node yang cocok.");
  console.log(`Node terpilih: ${plan.plan.selected.nodeName} (skor ${plan.plan.selected.score})`);

  const preview = await ptero.smart.servers.preview({
    name: "demo-api",
    email: "owner@example.com",
    autoCreateUser: true,
    description: "Demo API server",
    nodeId: plan.plan.selected.nodeId,
    nestId: 5,
    eggId: 15,
    specs,
    allocation: { strategy: "best-fit" }
  });
  console.log(`Docker image: ${preview.dockerImage}`);
  console.log(`Allocation: ${preview.allocation.default}`);

  const created = await ptero.smart.servers.create(
    {
      name: "demo-api",
      email: "owner@example.com",
      autoCreateUser: true,
      description: "Demo API server",
      nodeId: plan.plan.selected.nodeId,
      nestId: 5,
      eggId: 15,
      specs,
      allocation: { strategy: "best-fit" },
      startOnCompletion: true
    },
    {
      waitForInstall: 600000,
      onProgress: step => console.log(`[${step.percent}%] ${step.message}`)
    }
  );

  if ("identifier" in created && created.identifier) {
    const server = ptero.server(created.identifier);
    await server.files.writeJson("/package.json", { name: "demo-api", version: "1.0.0", scripts: { start: "node index.js" } });
    console.log(`Server siap: ${created.identifier}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
