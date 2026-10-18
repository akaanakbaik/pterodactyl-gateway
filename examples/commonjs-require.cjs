const { createPtero, explainError } = require("@akaanakbaik/pterodactyl-gateway");

async function main() {
  const ptero = createPtero.fromEnv();

  const report = await ptero.doctor();
  console.log("mode:", report.mode);

  const eggs = await ptero.listEggs();
  for (const egg of eggs.slice(0, 5)) {
    console.log(`egg ${egg.attributes.id}: ${egg.attributes.name}`);
  }

  const metrics = ptero.metrics();
  console.log("requests:", metrics.requests, "cache hits:", metrics.cacheHits);

  ptero.close();
}

main().catch(error => {
  console.error(explainError(error));
  process.exitCode = 1;
});
