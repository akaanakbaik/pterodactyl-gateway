import {
  AllocationStrategy,
  CapacityForecast,
  NodeCapacity,
  PlacementCandidate,
  PlacementPlan,
  PlacementStrategy,
  ServerSpecsInput
} from "./types.js";
import {
  asObject,
  clamp,
  geometricMean,
  getCollection,
  getDataAttributes,
  mulberry32,
  parseCpu,
  parseSizeToMiB,
  shuffle
} from "./utils.js";

export type AllocationItem = {
  id: number;
  ip: string;
  port: number;
  assigned: boolean;
  notes?: string;
};

export type AllocationSelection = {
  ids: number[];
  ports: number[];
  strategy: AllocationStrategy;
  fragmentation: number;
  largestGap: number;
};

export type NormalizedSpecs = {
  memory: number;
  disk: number;
  cpu: number;
  swap: number;
  io: number;
  databases: number;
  allocations: number;
  backups: number;
};

type NodeView = {
  id: number;
  name: string;
  memoryTotal: number;
  diskTotal: number;
  memoryUsed: number;
  diskUsed: number;
  memoryFree: number;
  diskFree: number;
  unlimited: boolean;
  freePorts: number;
  totalPorts: number;
  assignedPorts: number;
  fragmentation: number;
  largestGap: number;
  servers: number;
};

export function effectiveLimit(limit: number, overallocate = 0): number {
  if (!Number.isFinite(limit) || limit <= 0) return Number.POSITIVE_INFINITY;
  const bonus = Math.max(0, overallocate) / 100;
  return limit * (1 + bonus);
}

export function normalizeSpecs(specs: ServerSpecsInput): NormalizedSpecs {
  return {
    memory: parseSizeToMiB(specs.memory),
    disk: parseSizeToMiB(specs.disk),
    cpu: parseCpu(specs.cpu),
    swap: specs.swap === undefined ? 0 : parseSizeToMiB(specs.swap),
    io: specs.io === undefined ? 500 : Math.max(0, Math.floor(specs.io)),
    databases: Math.max(0, Math.floor(specs.databases)),
    allocations: Math.max(1, Math.floor(specs.allocations)),
    backups: Math.max(0, Math.floor(specs.backups))
  };
}

export function parseAllocations(raw: unknown): AllocationItem[] {
  const source = Array.isArray(raw) ? raw.map(item => asObject(item)) : getCollection(raw);
  return source
    .map(item => {
      const attributes = asObject(item.attributes ?? item);
      return {
        id: Number(attributes.id ?? 0),
        ip: String(attributes.ip ?? ""),
        port: Number(attributes.port ?? 0),
        assigned: Boolean(attributes.assigned),
        notes: attributes.notes === null || attributes.notes === undefined ? undefined : String(attributes.notes)
      };
    })
    .filter(item => item.id > 0 && item.port > 0);
}

export function analyzeAllocations(items: AllocationItem[], portRange?: [number, number]): AllocationSelection & { free: number; total: number } {
  const filtered = portRange ? items.filter(item => item.port >= portRange[0] && item.port <= portRange[1]) : items;
  const free = filtered.filter(item => !item.assigned).sort((a, b) => a.port - b.port);
  const assigned = filtered.filter(item => item.assigned).sort((a, b) => a.port - b.port);
  const runs = buildRuns(free.map(item => item.port));
  const gaps = buildGaps(assigned.map(item => item.port), portRange);
  return {
    ids: [],
    ports: [],
    strategy: "top",
    fragmentation: runs.length,
    largestGap: runs.reduce((max, run) => Math.max(max, run.length), 0),
    free: free.length,
    total: filtered.length
  };
}

export function selectAllocations(
  items: AllocationItem[],
  count: number,
  strategy: AllocationStrategy = "lowest-port",
  options: { portRange?: [number, number]; seed?: number } = {}
): AllocationSelection {
  const required = Math.max(1, Math.floor(count));
  const range = options.portRange;
  const free = items
    .filter(item => !item.assigned)
    .filter(item => !range || (item.port >= range[0] && item.port <= range[1]))
    .sort((a, b) => a.port - b.port);

  if (free.length < required) {
    throw new Error(`Butuh ${required} port kosong, tersedia ${free.length}${range ? ` dalam rentang ${range[0]}-${range[1]}` : ""}.`);
  }

  const random = options.seed === undefined ? Math.random : mulberry32(options.seed);
  let chosen: AllocationItem[] = [];

  if (strategy === "highest-port" || strategy === "top") {
    chosen = [...free].sort((a, b) => b.port - a.port).slice(0, required);
  } else if (strategy === "lowest-port" || strategy === "range") {
    chosen = free.slice(0, required);
  } else if (strategy === "random") {
    chosen = shuffle(free, random).slice(0, required);
  } else if (strategy === "contiguous") {
    chosen = pickContiguous(free, required, "smallest") ?? free.slice(0, required);
  } else if (strategy === "best-fit") {
    chosen = pickContiguous(free, required, "smallest") ?? pickNearest(free, required, random);
  } else if (strategy === "spread") {
    chosen = pickSpread(free, required);
  } else {
    chosen = free.slice(0, required);
  }

  const selectedPorts = chosen.map(item => item.port).sort((a, b) => a - b);
  return {
    ids: chosen.map(item => item.id),
    ports: selectedPorts,
    strategy,
    fragmentation: buildRuns(free.map(item => item.port)).length,
    largestGap: buildRuns(free.map(item => item.port)).reduce((max, run) => Math.max(max, run.length), 0)
  };
}

function pickContiguous(free: AllocationItem[], count: number, mode: "smallest" | "largest"): AllocationItem[] | null {
  const runs = buildRuns(free.map(item => item.port));
  const eligible = runs.filter(run => run.length >= count);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => (mode === "smallest" ? a.length - b.length : b.length - a.length));
  const run = sorted[0]!;
  const start = run.start;
  return free.filter(item => item.port >= start && item.port < start + count);
}

function pickNearest(free: AllocationItem[], count: number, random: () => number): AllocationItem[] {
  const sorted = [...free].sort((a, b) => a.port - b.port);
  const anchor = sorted[Math.floor(random() * sorted.length)]!.port;
  return [...sorted].sort((a, b) => Math.abs(a.port - anchor) - Math.abs(b.port - anchor)).slice(0, count);
}

function pickSpread(free: AllocationItem[], count: number): AllocationItem[] {
  const sorted = [...free].sort((a, b) => a.port - b.port);
  if (sorted.length === count) return sorted;
  const chosen: AllocationItem[] = [sorted[0]!];
  while (chosen.length < count) {
    let best: AllocationItem | null = null;
    let bestDistance = -1;
    for (const candidate of sorted) {
      if (chosen.some(item => item.id === candidate.id)) continue;
      const distance = Math.min(...chosen.map(item => Math.abs(item.port - candidate.port)));
      if (distance > bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

function buildRuns(ports: number[]): Array<{ start: number; length: number }> {
  if (ports.length === 0) return [];
  const sorted = [...new Set(ports)].sort((a, b) => a - b);
  const runs: Array<{ start: number; length: number }> = [];
  let start = sorted[0]!;
  let previous = sorted[0]!;
  for (let index = 1; index < sorted.length; index += 1) {
    const port = sorted[index]!;
    if (port === previous + 1) {
      previous = port;
      continue;
    }
    runs.push({ start, length: previous - start + 1 });
    start = port;
    previous = port;
  }
  runs.push({ start, length: previous - start + 1 });
  return runs;
}

function buildGaps(assignedPorts: number[], range?: [number, number]): number[] {
  if (!range) return [];
  const gaps: number[] = [];
  const sorted = [...assignedPorts].sort((a, b) => a - b);
  let cursor = range[0];
  for (const port of sorted) {
    if (port > cursor) gaps.push(port - cursor);
    cursor = Math.max(cursor, port + 1);
  }
  if (cursor <= range[1]) gaps.push(range[1] - cursor + 1);
  return gaps;
}

function toNodeViews(nodes: unknown[], allocations: Record<number, unknown[]>, servers: unknown[]): NodeView[] {
  const serverList = servers.length ? servers : [];
  const usageByNode = new Map<number, { memory: number; disk: number; count: number }>();
  for (const server of serverList) {
    const attributes = getDataAttributes(server);
    const nodeId = Number(attributes.node ?? 0);
    if (!nodeId) continue;
    const limits = asObject(attributes.limits);
    const memory = Number(limits.memory ?? 0);
    const disk = Number(limits.disk ?? 0);
    const current = usageByNode.get(nodeId) ?? { memory: 0, disk: 0, count: 0 };
    current.memory += memory > 0 ? memory : 0;
    current.disk += disk > 0 ? disk : 0;
    current.count += 1;
    usageByNode.set(nodeId, current);
  }

  return nodes.map(raw => {
    const attributes = getDataAttributes(raw);
    const id = Number(attributes.id ?? 0);
    const totalMemory = Number(attributes.memory ?? 0);
    const totalDisk = Number(attributes.disk ?? 0);
    const memoryLimit = effectiveLimit(totalMemory, Number(attributes.memory_overallocate ?? 0));
    const diskLimit = effectiveLimit(totalDisk, Number(attributes.disk_overallocate ?? 0));
    const allocated = asObject(attributes.allocated_resources);
    const fallback = usageByNode.get(id) ?? { memory: 0, disk: 0, count: 0 };
    const memoryUsed = Number(allocated.memory ?? fallback.memory) || 0;
    const diskUsed = Number(allocated.disk ?? fallback.disk) || 0;
    const portItems = parseAllocations(allocations[id] ?? []);
    const free = portItems.filter(item => !item.assigned);
    const assigned = portItems.filter(item => item.assigned);
    const runs = buildRuns(free.map(item => item.port));
    return {
      id,
      name: String(attributes.name ?? `node-${id}`),
      memoryTotal: memoryLimit,
      diskTotal: diskLimit,
      memoryUsed,
      diskUsed,
      memoryFree: Number.isFinite(memoryLimit) ? Math.max(0, memoryLimit - memoryUsed) : Number.POSITIVE_INFINITY,
      diskFree: Number.isFinite(diskLimit) ? Math.max(0, diskLimit - diskUsed) : Number.POSITIVE_INFINITY,
      unlimited: !Number.isFinite(memoryLimit) || !Number.isFinite(diskLimit),
      freePorts: free.length,
      totalPorts: portItems.length,
      assignedPorts: assigned.length,
      fragmentation: runs.length,
      largestGap: runs.reduce((max, run) => Math.max(max, run.length), 0),
      servers: fallback.count
    };
  }).filter(view => view.id > 0);
}

export function capacityReport(
  nodes: unknown[],
  allocations: Record<number, unknown[]> = {},
  servers: unknown[] = []
): NodeCapacity[] {
  return toNodeViews(nodes, allocations, servers).map(view => {
    const memoryPercent = Number.isFinite(view.memoryTotal) ? clamp((view.memoryUsed / view.memoryTotal) * 100, 0, 100) : 0;
    const diskPercent = Number.isFinite(view.diskTotal) ? clamp((view.diskUsed / view.diskTotal) * 100, 0, 100) : 0;
    const portPercent = view.totalPorts ? (view.assignedPorts / view.totalPorts) * 100 : 0;
    return {
      nodeId: view.id,
      name: view.name,
      memory: {
        total: view.memoryTotal,
        allocated: view.memoryUsed,
        free: view.memoryFree,
        percent: round2(memoryPercent)
      },
      disk: {
        total: view.diskTotal,
        allocated: view.diskUsed,
        free: view.diskFree,
        percent: round2(diskPercent)
      },
      allocations: {
        total: view.totalPorts,
        assigned: view.assignedPorts,
        free: view.freePorts,
        fragmentation: view.fragmentation,
        largestGap: view.largestGap
      },
      servers: view.servers,
      score: round2(100 - (memoryPercent + diskPercent + portPercent) / 3),
      unlimited: view.unlimited
    };
  });
}

export function planPlacement(input: {
  specs: ServerSpecsInput;
  nodes: unknown[];
  allocations?: Record<number, unknown[]>;
  servers?: unknown[];
  strategy?: PlacementStrategy;
  reservePercent?: number;
  requiredPorts?: number;
}): PlacementPlan {
  const specs = normalizeSpecs(input.specs);
  const strategy = input.strategy ?? "balanced";
  const reserve = clamp(input.reservePercent ?? 0, 0, 90) / 100;
  const requiredPorts = Math.max(1, input.requiredPorts ?? specs.allocations);
  const views = toNodeViews(input.nodes, input.allocations ?? {}, input.servers ?? []);

  const candidates: PlacementCandidate[] = views.map(view => {
    const usableMemory = Number.isFinite(view.memoryTotal) ? Math.max(0, view.memoryTotal * (1 - reserve) - view.memoryUsed) : Number.POSITIVE_INFINITY;
    const usableDisk = Number.isFinite(view.diskTotal) ? Math.max(0, view.diskTotal * (1 - reserve) - view.diskUsed) : Number.POSITIVE_INFINITY;
    const memoryRatio = specs.memory > 0 ? usableMemory / specs.memory : Number.POSITIVE_INFINITY;
    const diskRatio = specs.disk > 0 ? usableDisk / specs.disk : Number.POSITIVE_INFINITY;
    const portRatio = view.freePorts / requiredPorts;
    const reasons: string[] = [];
    if (memoryRatio < 1) reasons.push(`RAM kurang: butuh ${specs.memory} MiB, tersedia ${Math.floor(usableMemory)} MiB`);
    if (diskRatio < 1) reasons.push(`Disk kurang: butuh ${specs.disk} MiB, tersedia ${Math.floor(usableDisk)} MiB`);
    if (portRatio < 1) reasons.push(`Port kurang: butuh ${requiredPorts}, tersedia ${view.freePorts}`);
    const feasible = reasons.length === 0;
    const score = feasible ? scoreCandidate(view, specs, requiredPorts, strategy) : 0;
    return {
      nodeId: view.id,
      nodeName: view.name,
      feasible,
      score: round2(score),
      freeMemory: round2(usableMemory),
      freeDisk: round2(usableDisk),
      freePorts: view.freePorts,
      utilization: round2(utilization(view)),
      reasons
    };
  });

  const feasible = candidates.filter(item => item.feasible);
  const maxScore = feasible.reduce((max, item) => Math.max(max, item.score), 0) || 1;
  for (const candidate of feasible) candidate.score = round2((candidate.score / maxScore) * 100);
  candidates.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);

  return {
    ok: feasible.length > 0,
    strategy,
    requiredPorts,
    selected: candidates[0]?.feasible ? candidates[0] : null,
    candidates,
    message: feasible.length === 0 ? "Tidak ada node yang memiliki kapasitas memadai untuk spesifikasi ini." : undefined
  };
}

function scoreCandidate(view: NodeView, specs: NormalizedSpecs, ports: number, strategy: PlacementStrategy): number {
  const memoryHeadroom = specs.memory > 0 && Number.isFinite(view.memoryFree) ? Math.max(0, view.memoryFree / specs.memory) : 100;
  const diskHeadroom = specs.disk > 0 && Number.isFinite(view.diskFree) ? Math.max(0, view.diskFree / specs.disk) : 100;
  const portHeadroom = view.freePorts / ports;

  if (strategy === "pack") {
    const remaining = [memoryHeadroom, diskHeadroom, portHeadroom].filter(Number.isFinite);
    return 1000 / (1 + geometricMean(remaining));
  }
  if (strategy === "spread") {
    return Math.log1p(Math.min(memoryHeadroom, 1e6)) + Math.log1p(Math.min(diskHeadroom, 1e6)) + Math.log1p(portHeadroom);
  }
  if (strategy === "memory") return Math.log1p(Math.min(memoryHeadroom, 1e6)) * 2 + Math.log1p(portHeadroom);
  if (strategy === "disk") return Math.log1p(Math.min(diskHeadroom, 1e6)) * 2 + Math.log1p(portHeadroom);
  if (strategy === "ports") return Math.log1p(portHeadroom) * 2 + Math.log1p(Math.min(memoryHeadroom, 1e6));
  const balance = geometricMean([memoryHeadroom, diskHeadroom, portHeadroom].filter(Number.isFinite));
  const fragmentationPenalty = view.fragmentation > 0 ? 1 - Math.min(0.25, view.fragmentation / 200) : 1;
  return Math.log1p(Math.min(balance, 1e6)) * fragmentationPenalty;
}

function utilization(view: NodeView): number {
  const memory = Number.isFinite(view.memoryTotal) && view.memoryTotal > 0 ? view.memoryUsed / view.memoryTotal : 0;
  const disk = Number.isFinite(view.diskTotal) && view.diskTotal > 0 ? view.diskUsed / view.diskTotal : 0;
  const ports = view.totalPorts > 0 ? view.assignedPorts / view.totalPorts : 0;
  return clamp(((memory + disk + ports) / 3) * 100, 0, 100);
}

export function forecastCapacity(
  nodes: unknown[],
  specs: ServerSpecsInput,
  allocations: Record<number, unknown[]> = {},
  servers: unknown[] = []
): CapacityForecast[] {
  const normalized = normalizeSpecs(specs);
  return toNodeViews(nodes, allocations, servers).map(view => {
    const memoryCapacity = normalized.memory > 0 && Number.isFinite(view.memoryFree) ? Math.floor(view.memoryFree / normalized.memory) : Number.MAX_SAFE_INTEGER;
    const diskCapacity = normalized.disk > 0 && Number.isFinite(view.diskFree) ? Math.floor(view.diskFree / normalized.disk) : Number.MAX_SAFE_INTEGER;
    const portCapacity = Math.floor(view.freePorts / normalized.allocations);
    const serverCapacity = Math.max(0, Math.min(memoryCapacity, diskCapacity, portCapacity));
    const limitingFactor =
      serverCapacity === memoryCapacity && memoryCapacity <= diskCapacity && memoryCapacity <= portCapacity
        ? "memory"
        : serverCapacity === diskCapacity && diskCapacity <= portCapacity
          ? "disk"
          : portCapacity <= serverCapacity
            ? "ports"
            : "none";
    return {
      nodeId: view.id,
      serverCapacity: Number.isFinite(serverCapacity) ? serverCapacity : 0,
      memoryCapacity: Number.isFinite(memoryCapacity) ? memoryCapacity : 0,
      diskCapacity: Number.isFinite(diskCapacity) ? diskCapacity : 0,
      portCapacity,
      limitingFactor
    };
  });
}

export function binPack(
  items: ServerSpecsInput[],
  nodes: unknown[],
  allocations: Record<number, unknown[]> = {},
  servers: unknown[] = [],
  strategy: PlacementStrategy = "pack"
): Array<{ index: number; nodeId: number | null; score: number }> {
  const views = toNodeViews(nodes, allocations, servers);
  const remainingMemory = views.map(view => view.memoryFree);
  const remainingDisk = views.map(view => view.diskFree);
  const remainingPorts = views.map(view => view.freePorts);
  const normalized = items.map(normalizeSpecs);
  const assignments: Array<{ index: number; nodeId: number | null; score: number }> = [];

  const order = normalized
    .map((specs, index) => ({ specs, index, weight: specs.memory + specs.disk }))
    .sort((a, b) => b.weight - a.weight);

  for (const item of order) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index < views.length; index += 1) {
      if (item.specs.memory > 0 && remainingMemory[index]! < item.specs.memory) continue;
      if (item.specs.disk > 0 && remainingDisk[index]! < item.specs.disk) continue;
      if (remainingPorts[index]! < item.specs.allocations) continue;
      const score = strategy === "spread"
        ? remainingMemory[index]! + remainingDisk[index]!
        : 1 / (1 + remainingMemory[index]! / Math.max(1, item.specs.memory) + remainingDisk[index]! / Math.max(1, item.specs.disk));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) {
      assignments.push({ index: item.index, nodeId: null, score: 0 });
      continue;
    }
    remainingMemory[bestIndex] = remainingMemory[bestIndex]! - item.specs.memory;
    remainingDisk[bestIndex] = remainingDisk[bestIndex]! - item.specs.disk;
    remainingPorts[bestIndex] = remainingPorts[bestIndex]! - item.specs.allocations;
    assignments.push({ index: item.index, nodeId: views[bestIndex]!.id, score: round2(bestScore) });
  }

  return assignments.sort((a, b) => a.index - b.index);
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return Math.round(value * 100) / 100;
}

export function allocationFragmentation(items: AllocationItem[]): number {
  const runs = buildRuns(items.filter(item => !item.assigned).map(item => item.port));
  return runs.length;
}
