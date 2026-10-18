const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const gatewayPackage = require("../dist/index.cjs");

test("CJS entry mengekspor API utama", () => {
  assert.equal(typeof gatewayPackage.createPtero, "function");
  assert.equal(typeof gatewayPackage.PteroGateway, "function");
  assert.equal(typeof gatewayPackage.planPlacement, "function");
  assert.equal(typeof gatewayPackage.sendEmailMessage, "function");
  assert.match(gatewayPackage.VERSION, /^\d+\.\d+\.\d+$/);
});

test("CJS gateway menjalankan request dengan mock fetcher", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(JSON.stringify({ data: [{ attributes: { id: 15, name: "Nodejs" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const gateway = gatewayPackage.createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const eggs = await gateway.listEggs();
  assert.equal(eggs.length, 1);
  assert.ok(calls.some(call => /api\/application\/eggs/.test(call.url)));
});

test("declaration CJS tersedia untuk konsumen require", () => {
  assert.equal(existsSync(join(__dirname, "..", "dist", "index.cjs")), true);
  assert.equal(existsSync(join(__dirname, "..", "dist", "index.d.cts")), true);
  assert.equal(existsSync(join(__dirname, "..", "dist", "index.d.ts")), true);
});

test("CJS planner dapat dipakai tanpa transformasi", () => {
  const plan = gatewayPackage.planPlacement({
    specs: { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 },
    nodes: [{ attributes: { id: 1, name: "n1", memory: 2048, disk: 2048, allocated_resources: { memory: 0, disk: 0 } } }],
    allocations: { 1: [{ attributes: { id: 1, port: 3000, assigned: false, ip: "1.1.1.1" } }] },
    servers: []
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.selected.nodeId, 1);
});
