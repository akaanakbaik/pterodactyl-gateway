import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAllocations,
  binPack,
  capacityReport,
  effectiveLimit,
  forecastCapacity,
  parseAllocations,
  planPlacement,
  PteroError,
  selectAllocations
} from "../dist/index.js";

const allocation = (id, port, assigned = false, ip = "10.0.0.1") => ({ attributes: { id, port, assigned, ip } });

const node = (id, options = {}) => ({
  attributes: {
    id,
    name: options.name ?? `node-${id}`,
    memory: options.memory ?? 4096,
    memory_overallocate: options.memory_overallocate ?? 0,
    disk: options.disk ?? 10000,
    disk_overallocate: options.disk_overallocate ?? 0,
    allocated_resources: options.allocated ?? { memory: 0, disk: 0 }
  }
});

const specs = (overrides = {}) => ({ memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0, ...overrides });

test("effectiveLimit menerapkan over-allocation dan unlimited", () => {
  assert.equal(effectiveLimit(1000, 0), 1000);
  assert.equal(effectiveLimit(1000, 50), 1500);
  assert.equal(effectiveLimit(0, 100), Number.POSITIVE_INFINITY);
  assert.equal(effectiveLimit(-5, 10), Number.POSITIVE_INFINITY);
});

test("parseAllocations menerima array maupun collection", () => {
  const fromCollection = parseAllocations({ data: [allocation(1, 3000), allocation(2, 3001, true)] });
  const fromArray = parseAllocations([allocation(1, 3000), allocation(2, 3001, true)]);
  assert.deepEqual(fromCollection, fromArray);
  assert.equal(fromArray.length, 2);
  assert.equal(fromArray[1].assigned, true);
});

test("analyzeAllocations menghitung fragmentasi dan gap terbesar", () => {
  const items = parseAllocations({
    data: [allocation(1, 3000, true), allocation(2, 3001), allocation(3, 3002), allocation(4, 3003, true), allocation(5, 3010), allocation(6, 3011)]
  });
  const analysis = analyzeAllocations(items);
  assert.equal(analysis.total, 6);
  assert.equal(analysis.free, 4);
  assert.ok(analysis.fragmentation >= 1);
  assert.equal(analysis.largestGap, 2);
});

test("strategi alokasi memilih port sesuai aturan", () => {
  const items = [
    allocation(1, 3001),
    allocation(2, 3002),
    allocation(3, 3003),
    allocation(4, 3005),
    allocation(5, 3006),
    allocation(6, 3009, true)
  ];
  const collection = { data: items };
  assert.deepEqual(selectAllocations(collection, 1, { strategy: "lowest-port" }), { default: 1, additional: [] });
  assert.deepEqual(selectAllocations(collection, 2, { strategy: "highest-port" }), { default: 5, additional: [4] });
  assert.deepEqual(selectAllocations(collection, 3, { strategy: "contiguous" }), { default: 1, additional: [2, 3] });
  const spread = selectAllocations(collection, 2, { strategy: "spread" });
  assert.equal(spread.additional.length, 1);
  assert.ok(Math.abs(spread.default - spread.additional[0]) >= 3);
  const seeded = selectAllocations(collection, 2, { strategy: "random", seed: 42 });
  assert.equal(new Set([seeded.default, ...seeded.additional]).size, 2);
});

test("selectAllocations melempar NO_FREE_ALLOCATION ketika port tidak cukup", () => {
  const collection = { data: [allocation(1, 3001)] };
  assert.throws(
    () => selectAllocations(collection, 2, { strategy: "lowest-port" }),
    error => error instanceof PteroError && error.code === "NO_FREE_ALLOCATION"
  );
  assert.throws(
    () => selectAllocations(collection, 1, { strategy: "range", portRange: [4000, 4100] }),
    error => error instanceof PteroError && error.code === "NO_FREE_ALLOCATION"
  );
});

test("planPlacement memilih node dengan kapasitas dan menghormati port", () => {
  const nodes = [node(1, { allocated: { memory: 4096, disk: 0 } }), node(2, { allocated: { memory: 0, disk: 0 } })];
  const allocations = { 1: [allocation(1, 3000)], 2: [allocation(2, 4000)] };
  const plan = planPlacement({ specs: specs(), nodes, allocations, servers: [] });
  assert.equal(plan.ok, true);
  assert.equal(plan.selected?.nodeId, 2);
  assert.equal(plan.candidates.find(candidate => candidate.nodeId === 1)?.feasible, false);
});

test("planPlacement gagal ketika tidak ada node yang cukup", () => {
  const nodes = [node(1, { memory: 256, allocated: { memory: 0, disk: 0 } })];
  const plan = planPlacement({ specs: specs({ memory: "1GB" }), nodes, allocations: { 1: [allocation(1, 3000)] }, servers: [] });
  assert.equal(plan.ok, false);
  assert.equal(plan.selected, null);
  assert.match(plan.message, /kapasitas/);
});

test("planPlacement menghormati reservePercent", () => {
  const nodes = [node(1, { memory: 4096, allocated: { memory: 0, disk: 0 } })];
  const allocations = { 1: [allocation(1, 3000)] };
  const tight = planPlacement({ specs: specs({ memory: "1GB", disk: "1GB" }), nodes, allocations, servers: [], reservePercent: 0 });
  const reserved = planPlacement({ specs: specs({ memory: "1GB", disk: "1GB" }), nodes, allocations, servers: [], reservePercent: 90 });
  assert.equal(tight.ok, true);
  assert.equal(reserved.ok, false);
  assert.ok(tight.selected.score > reserved.candidates[0].score);
});

test("forecastCapacity menghitung faktor pembatas", () => {
  const nodes = [node(1, { memory: 2048, disk: 102400, allocated: { memory: 0, disk: 0 } })];
  const allocations = { 1: Array.from({ length: 10 }, (_, index) => allocation(index + 1, 3000 + index)) };
  const forecast = forecastCapacity(nodes, specs({ memory: "1GB", disk: "1GB" }), allocations, []);
  assert.equal(forecast[0].memoryCapacity, 2);
  assert.equal(forecast[0].serverCapacity, 2);
  assert.equal(forecast[0].limitingFactor, "memory");
});

test("binPack menyebar atau memadatkan server sesuai strategi", () => {
  const nodes = [node(1), node(2)];
  const allocations = {
    1: [allocation(1, 3000), allocation(2, 3001)],
    2: [allocation(3, 4000), allocation(4, 4001)]
  };
  const pack = binPack([specs(), specs()], nodes, allocations, [], "pack");
  const spread = binPack([specs(), specs()], nodes, allocations, [], "spread");
  assert.equal(pack[0].nodeId, pack[1].nodeId);
  assert.notEqual(spread[0].nodeId, spread[1].nodeId);
});

test("binPack menandai item yang tidak muat", () => {
  const nodes = [node(1, { memory: 512, disk: 512 })];
  const allocations = { 1: [allocation(1, 3000)] };
  const result = binPack([specs({ memory: "1GB" })], nodes, allocations, [], "pack");
  assert.equal(result[0].nodeId, null);
});

test("capacityReport menghitung utilisasi dan unlimited", () => {
  const nodes = [node(1, { memory: 0, disk: 0, allocated: { memory: 0, disk: 0 } })];
  const report = capacityReport(nodes, { 1: [allocation(1, 3000, true), allocation(2, 3001)] }, []);
  assert.equal(report[0].unlimited, true);
  assert.equal(report[0].allocations.free, 1);
  assert.equal(report[0].memory.free, Number.POSITIVE_INFINITY);
});

test("capacityReport menghitung utilisasi normal", () => {
  const nodes = [node(1, { memory: 1000, disk: 2000, allocated: { memory: 250, disk: 500 } })];
  const report = capacityReport(nodes, { 1: [] }, []);
  assert.equal(report[0].memory.percent, 25);
  assert.equal(report[0].disk.percent, 25);
  assert.equal(report[0].score, 83.33);
});
