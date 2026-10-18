import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPtero, explainError, planPlacement, PteroError } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, "..", ".env"));

const mutate = process.argv.includes("--mutate");
const keepArtifacts = process.argv.includes("--keep");
const prefix = `gateway-live-${Date.now().toString(36)}`;
const bootToken = `boot-${prefix}`;
const results = [];
const createdUserIds = [];
const createdServerIds = [];
const createdServerNames = [];

const gateway = createPtero({
  domain: process.env.PTERO_DOMAIN,
  ptla: process.env.PTERO_PTLA,
  ptlc: process.env.PTERO_PTLC,
  safeMode: false,
  timeout: 30000
});

function record(name, ok, detail = "") {
  results.push({ name, ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function expectError(name, work, expectedCode) {
  try {
    await work();
    record(name, false, `tidak melempar error, diharapkan ${expectedCode}`);
  } catch (error) {
    const code = error instanceof PteroError ? error.code : error?.name;
    record(name, code === expectedCode || expectedCode === "ANY", `code=${code} message=${error?.message ?? error}`);
  }
}

async function main() {
  if (!process.env.PTERO_DOMAIN || !process.env.PTERO_PTLA) {
    throw new Error("PTERO_DOMAIN dan PTERO_PTLA wajib tersedia melalui .env atau environment.");
  }

  section("Koneksi dan kemampuan panel");
  const connect = await gateway.connect();
  record("connect", connect.ok, `mode=${connect.mode} latency=${connect.latency}ms`);
  const doctor = await gateway.doctor();
  record("doctor", doctor.ok, `checks=${doctor.checks.length} nests=${doctor.capabilities?.nests} eggs=${doctor.capabilities?.eggs}`);
  record("capabilities", Boolean(doctor.capabilities), JSON.stringify(doctor.capabilities));

  section("Pembacaan data");
  const nodes = await gateway.application.nodes.all();
  record("nodes", nodes.length > 0, `count=${nodes.length}`);
  const nodeId = Number(nodes[0]?.attributes?.id ?? 0);
  const eggs = await gateway.listEggs();
  const eggId = Number(eggs.find(egg => String(egg.attributes?.name ?? "").toLowerCase() === "nodejs")?.attributes?.id ?? eggs[0]?.attributes?.id ?? 0);
  record("eggs", eggs.length > 0 && eggId > 0, `count=${eggs.length} eggId=${eggId}`);
  const users = await gateway.application.users.all();
  record("users", users.length > 0, `count=${users.length}`);
  const servers = await gateway.listAllServers();
  record("servers", Array.isArray(servers), `count=${servers.length}`);
  const allocations = await gateway.application.nodes.allocations.all(nodeId);
  record("allocations", allocations.length > 0, `count=${allocations.length}`);
  const eggDetail = await gateway.getEggById(eggId, true);
  record("egg detail with variables", Boolean(eggDetail?.attributes?.relationships?.variables), `name=${eggDetail?.attributes?.name}`);

  section("Cache, dedupe, dan metrik");
  gateway.flushCache();
  await gateway.listEggs();
  await gateway.listEggs();
  const metrics = gateway.metrics();
  record("cache hit", metrics.cacheHits >= 1, `hits=${metrics.cacheHits} misses=${metrics.cacheMisses}`);
  record("metrics shape", metrics.requests > 0 && typeof metrics.latency.p95 === "number", `requests=${metrics.requests} p95=${metrics.latency.p95}`);

  section("Perencanaan kapasitas");
  const specs = { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 };
  const capacity = await gateway.capacity();
  record("capacity", capacity.length > 0 && capacity[0].memory.total > 0, JSON.stringify(capacity[0]?.memory ?? {}));
  const plan = await gateway.planServer(specs, { strategy: "balanced" });
  record("plan selected", Boolean(plan.plan.selected), `node=${plan.plan.selected?.nodeId} score=${plan.plan.selected?.score}`);
  record("plan allocations", plan.allocations.default !== undefined, JSON.stringify(plan.allocations));
  const forecast = await gateway.forecast(specs);
  record("forecast", forecast.length > 0 && forecast[0].serverCapacity >= 0, JSON.stringify(forecast[0]));
  const packed = await gateway.packServers([specs, specs], "pack");
  record("bin packing", packed.length === 2, JSON.stringify(packed));
  const infeasible = planPlacement({
    specs: { memory: "999GB", disk: "1GB", cpu: 100, databases: 0, allocations: 1, backups: 0 },
    nodes,
    allocations: { [nodeId]: allocations },
    servers
  });
  record("plan infeasible", infeasible.ok === false, `message=${infeasible.message ?? "-"}`);

  section("Penanganan error");
  await expectError("server tidak ditemukan", () => gateway.server("zzzzzzzz").details(), "ANY");
  await expectError("nest tidak tersedia", () => gateway.findNestByName("Tidak Ada"), "ANY");
  const invalidKey = createPtero({ domain: process.env.PTERO_DOMAIN, ptla: "ptla_invalid_key_value", cache: { enabled: false }, retry: { retries: 0 } });
  await expectError("ptla tidak valid", () => invalidKey.application.users.list(1), "PERMISSION_DENIED");
  const safeGateway = createPtero({ domain: process.env.PTERO_DOMAIN, ptla: process.env.PTERO_PTLA, retry: { retries: 0 } });
  await expectError("safe mode guard", () => safeGateway.application.servers.delete(99999999), "SAFE_MODE_CONFIRMATION_REQUIRED");

  section("Timeout, retry, dan circuit breaker");
  const local = await startTestServer();
  try {
    const slow = createPtero({ domain: `http://127.0.0.1:${local.port}/slow`, ptla: "ptla_local", timeout: 1000, retry: { retries: 0 } });
    await expectError("timeout", () => slow.application.users.list(1), "REQUEST_TIMEOUT");

    const flaky = createPtero({
      domain: `http://127.0.0.1:${local.port}/flaky`,
      ptla: "ptla_local",
      retry: { retries: 3, baseDelay: 10, maxDelay: 50 },
      cache: { enabled: false }
    });
    const flakyResult = await flaky.application.users.list(1);
    record("retry 503", flakyResult?.meta?.attempts >= 3, `attempts=${flakyResult?.meta?.attempts}`);

    const breaker = createPtero({
      domain: `http://127.0.0.1:${local.port}/fail`,
      ptla: "ptla_local",
      timeout: 1000,
      retry: { retries: 0 },
      cache: { enabled: false },
      circuitBreaker: { failureThreshold: 2, resetTimeout: 400 }
    });
    await expectError("circuit failure 1", () => breaker.application.users.list(1), "PANEL_SERVER_ERROR");
    await expectError("circuit failure 2", () => breaker.application.users.list(1), "PANEL_SERVER_ERROR");
    await expectError("circuit open", () => breaker.application.users.list(1), "CIRCUIT_OPEN");

    const limited = createPtero({
      domain: `http://127.0.0.1:${local.port}/ok`,
      ptla: "ptla_local",
      rateLimit: { requestsPerSecond: 20, burst: 1 },
      cache: { enabled: false },
      retry: { retries: 0 }
    });
    const started = Date.now();
    await Promise.all([1, 2, 3].map(page => limited.application.users.list(page)));
    const elapsed = Date.now() - started;
    record("rate limit", elapsed >= 50 && limited.metrics().rateLimitWaits >= 1, `elapsed=${elapsed}ms waits=${limited.metrics().rateLimitWaits}`);
  } finally {
    local.server.close();
  }

  section("Hook dan event");
  const events = [];
  const hooked = createPtero({
    domain: process.env.PTERO_DOMAIN,
    ptla: process.env.PTERO_PTLA,
    cache: { enabled: false },
    hooks: {
      onRequest: () => events.push("request"),
      onResponse: () => events.push("response"),
      onError: () => events.push("error")
    }
  });
  await hooked.application.nodes.list(1);
  record("hooks", events.includes("request") && events.includes("response"), events.join(","));

  if (!mutate) {
    finish();
    return;
  }

  section("Siklus hidup user dan server");
  const email = `${prefix}@example.com`;
  const username = `gw${Date.now().toString(36)}`.slice(0, 20);
  const created = await gateway.smart.users.create({ username, email, password: "auto", administrator: false });
  createdUserIds.push(created.id);
  record("create user", created.id > 0, `id=${created.id}`);
  const again = await gateway.smart.users.getOrCreate({ username, email, password: "auto", administrator: false });
  record("getOrCreate user", again.created === false && again.id === created.id, `id=${again.id}`);
  const foundUser = await gateway.smart.users.findByEmail(email);
  record("find user by email", foundUser?.id === created.id, `id=${foundUser?.id}`);

  const ownerId = Number(users[0]?.attributes?.id ?? 1);
  const serverName = `${prefix} server`;
  const serverResult = await gateway.smart.servers.create({
    name: serverName,
    email: "khaliqarrasyidabdul@gmail.com",
    userId: ownerId,
    description: "Live integration test server",
    nodeId,
    nestId: Number(process.env.PTERO_NEST_ID ?? 5),
    eggId,
    specs: { memory: "512MB", disk: "1GB", cpu: 50, databases: 1, allocations: 2, backups: 1 },
    allocation: { strategy: "best-fit" },
    startOnCompletion: false
  });
  if (!serverResult.identifier) throw new Error("Server tidak memiliki identifier.");
  createdServerIds.push(serverResult.id);
  createdServerNames.push(serverName);
  record("create server", Boolean(serverResult.identifier), `id=${serverResult.id} identifier=${serverResult.identifier}`);

  const handle = gateway.server(serverResult.identifier);
  const details = await gateway.getServerDetails(serverResult.id);
  record("server details", details.identifier === serverResult.identifier, `egg=${details.eggName} node=${details.nodeName} allocation=${details.allocationId}`);
  record("server handle", (await handle.details())?.attributes?.identifier === serverResult.identifier, "client api lookup");

  section("Instalasi server");
  try {
    await handle.waitForInstall({ timeout: 420000, interval: 5000 });
    record("wait install", true, "instalasi selesai");
  } catch (error) {
    record("wait install", false, error?.message ?? String(error));
  }

  section("Client API dan operasi file");
  const resources = await handle.resources();
  record("resources", Boolean(resources.current_state), `state=${resources.current_state}`);
  const listing = await handle.files.list("/");
  record("files list", Array.isArray(listing?.data), `entries=${listing?.data?.length ?? 0}`);
  await handle.files.write("/live-test.txt", `hello ${prefix}`);
  const content = await handle.files.read("/live-test.txt");
  record("files write/read", content.includes(prefix), content.trim());
  await handle.files.mkdir("/", "live-dir");
  await handle.files.rename("/", [{ from: "live-test.txt", to: "live-dir/moved.txt" }]);
  const moved = await handle.files.read("/live-dir/moved.txt");
  record("files rename", moved.includes(prefix), moved.trim());
  await handle.files.compress("/", ["live-dir"]);
  const afterCompress = await handle.files.list("/");
  const afterCompressNames = entryNames(afterCompress);
  const archive = afterCompressName(afterCompressNames);
  record("files compress", Boolean(archive), afterCompressNames.join(",") || JSON.stringify(afterCompress).slice(0, 200));
  if (archive) {
    await handle.files.decompress("/", archive);
    const afterDecompressNames = entryNames(await handle.files.list("/"));
    record("files decompress", afterDecompressNames.includes("live-dir"), afterDecompressNames.join(","));
    await handle.files.delete("/", [archive, "live-dir"]);
  }
  const runtime = await gateway.eggRuntime(eggId);
  const doneMarker = runtime.startupDone && runtime.startupDone.length < 40 ? runtime.startupDone : "running";
  record("egg runtime", Boolean(runtime.startupCommand), `done="${doneMarker}" variables=${runtime.variables.length}`);
  await handle.files.writeJson("/package.json", { name: "gateway-live-app", version: "1.0.0", main: "index.js", scripts: { start: "node index.js" } });
  await handle.files.write(
    "/index.js",
    [
      'const http = require("http");',
      `console.log("${bootToken}");`,
      'http.createServer((request, response) => response.end("ok")).listen(process.env.SERVER_PORT || 3000);',
      `console.log(${JSON.stringify(doneMarker)});`,
      'setInterval(() => console.log("heartbeat"), 15000);'
    ].join("\n")
  );
  const appFiles = entryNames(await handle.files.list("/"));
  record("files app bootstrap", appFiles.includes("index.js"), appFiles.join(","));
  const startup = await handle.startup.get();
  record("startup get", Array.isArray(startup?.data), `variables=${startup?.data?.length ?? 0}`);
  const mainVariable = startup.data.find(variable => variable.attributes?.env_variable === "CMD_RUN") ?? startup.data[0];
  if (mainVariable) {
    await handle.startup.set(mainVariable.attributes.env_variable, "npm start");
    record("startup set", true, mainVariable.attributes.env_variable);
  }
  const network = await handle.network.list();
  record("network list", Array.isArray(network?.data), `allocations=${network?.data?.length ?? 0}`);
  const databases = await handle.databases.list();
  record("databases list", Array.isArray(databases?.data), `count=${databases?.data?.length ?? 0}`);

  section("Backup dan schedule");
  const backup = await handle.backups.create(`${prefix}-backup`);
  const backupUuid = backup?.attributes?.uuid;
  record("backup create", Boolean(backupUuid), `uuid=${backupUuid}`);
  if (backupUuid) {
    const finished = await handle.backups.waitFor(backupUuid, { timeout: 300000, interval: 3000 });
    record("backup wait", Boolean(finished.completed_at || finished.is_successful), `successful=${finished.is_successful}`);
    const url = await handle.backups.downloadUrl(backupUuid);
    const downloaded = await fetch(url);
    record("backup download", downloaded.ok, `status=${downloaded.status}`);
    await downloaded.body?.cancel().catch(() => undefined);
    await handle.backups.delete(backupUuid);
    record("backup delete", true, backupUuid);
  }

  section("Menjalankan aplikasi dan WebSocket");
  const socket = await handle.websocket.connect();
  const consoleLines = [];
  const statsEvents = [];
  socket.onConsole(line => consoleLines.push(line));
  socket.onStats(stats => statsEvents.push(stats));
  socket.on("error", error => consoleLines.push(`error:${error?.message ?? error}`));
  await handle.power("start");
  let running = false;
  try {
    await handle.waitForState("running", { timeout: 120000, interval: 3000 });
    running = true;
    record("power start", true, "server running");
  } catch (error) {
    record("power start", false, `${error?.message ?? String(error)} | console=${consoleLines.slice(-4).join(" / ")}`);
  }
  await new Promise(resolve => setTimeout(resolve, 12000));
  const sawBoot = consoleLines.some(line => line.includes(bootToken));
  record("websocket console", sawBoot, `lines=${consoleLines.length} stats=${statsEvents.length}`);
  const webSocketStats = socket.stats();
  record("websocket stats", webSocketStats.connected || webSocketStats.messagesReceived > 0, JSON.stringify(webSocketStats));
  await socket.close();

  section("Schedule pada server aktif");
  const schedule = await handle.createScheduleBuilder()
    .setName(`${prefix}-schedule`)
    .setCron("*/30 * * * *")
    .addCommandTask("echo gateway")
    .addPowerTask("restart", 60)
    .save();
  record("schedule create", schedule.id > 0, `id=${schedule.id}`);
  const schedules = await handle.schedules.list();
  record("schedule list", Array.isArray(schedules?.data), `count=${schedules?.data?.length ?? 0}`);
  if (running) {
    try {
      await handle.schedules.execute(schedule.id);
      record("schedule execute", true, `id=${schedule.id}`);
    } catch (error) {
      record("schedule execute", false, error?.message ?? String(error));
    }
  } else {
    record("schedule execute", true, "dilewati karena server tidak running");
  }
  await handle.schedules.update(schedule.id, { name: `${prefix}-schedule-2`, cron: "0 */6 * * *", tasks: [{ action: "backup", payload: "" }] });
  record("schedule update", true, `id=${schedule.id}`);
  await handle.schedules.delete(schedule.id);
  record("schedule delete", true, `id=${schedule.id}`);

  section("Power, suspend, ownership, dan batch");
  await handle.power("restart");
  record("power restart", true, "signal terkirim");
  await handle.power("stop");
  record("power stop", true, "signal terkirim");
  await gateway.application.servers.suspend(serverResult.id);
  record("suspend", true, "ok");
  await gateway.application.servers.unsuspend(serverResult.id);
  record("unsuspend", true, "ok");
  await gateway.smart.servers.updateSpecs(serverResult.id, { memory: "640MB", cpu: "75%", backups: 1 });
  const updated = await gateway.getServerDetails(serverResult.id);
  record("update specs", Number(updated.limits.memory) === 640, JSON.stringify(updated.limits));
  await gateway.smart.servers.changeOwnership(serverResult.id, { userId: created.id });
  const owned = await gateway.getServerDetails(serverResult.id);
  record("change ownership", owned.userId === created.id, `owner=${owned.userId}`);
  await gateway.smart.servers.changeOwnership(serverResult.id, { userId: ownerId });
  const batch = await gateway.batchServerOperation([serverResult.id], "suspend", { concurrency: 1 });
  record("batch suspend", batch.success === 1, JSON.stringify(batch.results));
  await gateway.batchServerOperation([serverResult.id], "unsuspend", { concurrency: 1 });
  record("batch unsuspend", true, "ok");
  const cloned = await gateway.cloneServer(serverResult.id, { name: `${prefix} clone`, startOnCompletion: false });
  if (cloned.identifier) {
    createdServerIds.push(cloned.id);
    createdServerNames.push(`${prefix} clone`);
    record("clone server", true, `identifier=${cloned.identifier}`);
    await gateway.application.servers.reinstall(cloned.id);
    record("reinstall clone", true, `id=${cloned.id}`);
  } else {
    record("clone server", false, "tidak ada identifier");
  }

  section("Email");
  if (process.env.SMTP_HOST && process.env.SMTP_USER && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)) {
    const verification = await gateway.email.verify({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      username: process.env.SMTP_USER,
      password: process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD,
      fromAddress: process.env.SMTP_FROM,
      fromName: process.env.SMTP_FROM_NAME,
      encryption: process.env.SMTP_ENCRYPTION
    });
    record("smtp verify", verification.ok, verification.message);
  } else {
    record("smtp verify", true, "dilewati karena SMTP belum dikonfigurasi");
  }

  finish();
}

function finish() {
  const failed = results.filter(item => !item.ok);
  console.log(`\n=== Ringkasan ===`);
  console.log(`Total: ${results.length} | Lulus: ${results.length - failed.length} | Gagal: ${failed.length}`);
  for (const item of failed) console.log(`FAIL ${item.name}: ${item.detail}`);
  process.exitCode = failed.length ? 1 : 0;
}

async function cleanup() {
  if (!mutate || keepArtifacts) return;
  section("Cleanup");
  for (const serverId of createdServerIds) {
    try {
      await gateway.application.servers.delete(serverId, { confirm: true, force: true });
      console.log(`deleted server ${serverId}`);
    } catch (error) {
      console.log(`cleanup server ${serverId} gagal: ${error?.message ?? error}`);
    }
  }
  const leftovers = await gateway.listAllServers().catch(() => []);
  for (const server of leftovers) {
    const attributes = server?.attributes ?? {};
    const name = String(attributes.name ?? "");
    if (createdServerNames.includes(name) || name.startsWith(prefix)) {
      try {
        await gateway.application.servers.delete(Number(attributes.id), { confirm: true, force: true });
        console.log(`deleted leftover server ${attributes.id}`);
      } catch (error) {
        console.log(`cleanup leftover ${attributes.id} gagal: ${error?.message ?? error}`);
      }
    }
  }
  const users = await gateway.application.users.all().catch(() => []);
  for (const user of users) {
    const attributes = user?.attributes ?? {};
    if (attributes.email === `${prefix}@example.com` || String(attributes.email ?? "").startsWith(prefix)) {
      try {
        await gateway.application.users.delete(Number(attributes.id), true);
        console.log(`deleted user ${attributes.id}`);
      } catch (error) {
        console.log(`cleanup user ${attributes.id} gagal: ${error?.message ?? error}`);
      }
    }
  }
  for (const userId of createdUserIds) {
    try {
      await gateway.application.users.delete(userId, true);
      console.log(`deleted tracked user ${userId}`);
    } catch {
      undefined;
    }
  }
}

function entryNames(response) {
  const data = Array.isArray(response?.data) ? response.data : [];
  return data.map(entry => String(entry?.attributes?.name ?? entry?.name ?? ""));
}

function afterCompressName(names) {
  return names.find(name => name.endsWith(".tar.gz") || name.endsWith(".zip"));
}

function startTestServer() {
  return new Promise(resolve => {
    const counters = new Map();
    const server = createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/slow")) {
        setTimeout(() => {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ object: "list", data: [] }));
        }, 3000);
        return;
      }
      if (url.pathname.startsWith("/fail")) {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ errors: [{ detail: "forced failure" }] }));
        return;
      }
      if (url.pathname.startsWith("/flaky")) {
        const attempts = (counters.get("flaky") ?? 0) + 1;
        counters.set("flaky", attempts);
        if (attempts <= 2) {
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ errors: [{ detail: "temporary" }] }));
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ object: "list", data: [], meta: { attempts, pagination: { current_page: 1, total_pages: 1 } } }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [], meta: { pagination: { current_page: 1, total_pages: 1 } } }));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

try {
  await main();
} catch (error) {
  console.error(explainError(error));
  process.exitCode = 1;
} finally {
  await cleanup();
  gateway.close();
}
