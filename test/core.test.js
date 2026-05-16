import test from "node:test";
import assert from "node:assert/strict";
import { createIntegrationServerInput, createIntegrationService, createPtero, explainError, getIntegrationKinds, parseCpu, parseSizeToMiB, PteroError } from "../dist/index.js";

test("parseSizeToMiB mengubah GB dan MB ke MiB", () => {
  assert.equal(parseSizeToMiB("2GB"), 2048);
  assert.equal(parseSizeToMiB("512MB"), 512);
  assert.equal(parseSizeToMiB(128), 128);
});

test("parseCpu menerima angka dan persen", () => {
  assert.equal(parseCpu("100%"), 100);
  assert.equal(parseCpu(250), 250);
});

test("integration helper membuat input server bot dan website", () => {
  assert.ok(getIntegrationKinds().includes("whatsapp-bot"));
  const input = createIntegrationServerInput({
    kind: "whatsapp-bot",
    name: "WA Bot Aka",
    email: "aka@example.com",
    username: "aka_wa",
    password: "auto",
    autoCreateUser: true,
    nodeId: 1,
    nestId: 5,
    eggId: 18,
    environment: { OWNER: "aka" }
  });
  assert.equal(input.name, "WA Bot Aka");
  assert.equal(input.preset, "standard");
  assert.equal(input.startup, "npm start");
  assert.equal(input.dockerImage, "auto");
  assert.equal(input.environment.BOT_PLATFORM, "whatsapp");
  assert.equal(input.environment.OWNER, "aka");
  assert.equal(input.specs?.memory, "2GB");
});

test("integration service menerapkan default node nest egg", () => {
  const service = createIntegrationService({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher: async () => json({}) }, { nodeId: 1, nestId: 5, eggId: 18, preset: "basic" });
  const input = service.input({ kind: "telegram-bot", name: "TG Bot", email: "tg@example.com" });
  assert.equal(input.nodeId, 1);
  assert.equal(input.nestId, 5);
  assert.equal(input.eggId, 18);
  assert.equal(input.preset, "basic");
});

test("explainError membuat pesan tutorial", () => {
  const text = explainError(new PteroError({
    code: "TEST_ERROR",
    message: "Terjadi error test.",
    hint: "Ini hint.",
    steps: ["Langkah satu", "Langkah dua"]
  }));
  assert.match(text, /TEST_ERROR/);
  assert.match(text, /Cara memperbaiki/);
});

test("connect mendeteksi full mode dengan mock fetch", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ data: { attributes: { id: 1 } } }), { status: 200 });
  };
  const ptero = createPtero({ domain: "panel.example.com/", ptla: "ptla_test", ptlc: "ptlc_test", fetcher });
  const result = await ptero.connect();
  assert.equal(result.ok, true);
  assert.equal(result.mode, "full");
  assert.equal(ptero.domain, "https://panel.example.com");
  assert.equal(calls.length, 2);
});

test("createUserSmart dryRun membangun payload user", async () => {
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher: async () => json({}) });
  const result = await ptero.users.createSmart({
    username: "aka",
    email: "aka@example.com",
    password: "auto",
    administrator: "no"
  }, { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.payload.username, "aka");
  assert.equal(result.payload.first_name, "aka");
  assert.equal(result.payload.last_name, "aka");
  assert.equal(result.payload.root_admin, false);
  assert.equal(typeof result.generatedPassword, "string");
});

test("server command guard memblokir command berbahaya", () => {
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher: async () => json({}) });
  const command = ["r", "m", " ", "-", "r", "f", " ", "/"].join("");
  assert.throws(() => ptero.server("abc123").command(command), /Command terlihat berbahaya/);
});

test("file manager read write dan json helper memakai endpoint benar", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    const target = String(url);
    if (target.includes("/files/contents")) return new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "text/plain" } });
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const server = ptero.server("abc123");
  const text = await server.files.read("/config.json");
  await server.files.write("/index.js", "console.log('ok')");
  const data = await server.files.json.read("/config.json");

  assert.equal(text, '{"ok":true}');
  assert.deepEqual(data, { ok: true });
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /files\/contents/);
  assert.equal(calls[1].method, "POST");
  assert.match(String(calls[1].body), /console\.log/);
});

test("startup set mencari variable lalu update value", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    if ((init?.method ?? "GET") === "GET") {
      return json({ data: { attributes: { relationships: { variables: { data: [
        { attributes: { env_variable: "BOT_TOKEN", server_value: "old" } }
      ] } } } } });
    }
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  await ptero.server("abc123").startup.set("BOT_TOKEN", "new-token");

  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "PUT");
  assert.match(calls[1].url, /startup\/variable/);
  assert.deepEqual(JSON.parse(String(calls[1].body)), { key: "BOT_TOKEN", value: "new-token" });
});

test("startup set mendukung format data langsung dari panel", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    if ((init?.method ?? "GET") === "GET") {
      return json({ data: [
        { attributes: { env_variable: "AKA_SHOW_INFO", server_value: "1" } }
      ] });
    }
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  await ptero.server("abc123").startup.set("AKA_SHOW_INFO", "1");

  assert.equal(calls[1].method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[1].body)), { key: "AKA_SHOW_INFO", value: "1" });
});

test("network allocation helper memakai endpoint benar", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const network = ptero.server("abc123").network;

  await network.list();
  await network.assign();
  await network.setNote(55, "API port");
  await network.setPrimary(55);
  await network.delete(55);

  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /network\/allocations$/);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[2].method, "POST");
  assert.deepEqual(JSON.parse(String(calls[2].body)), { notes: "API port" });
  assert.match(calls[3].url, /network\/allocations\/55\/primary$/);
  assert.equal(calls[4].method, "DELETE");
});

test("database helper memakai endpoint benar", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const databases = ptero.server("abc123").databases;

  await databases.list();
  await databases.create({ database: "botdb" });
  await databases.rotatePassword("db123");
  await databases.delete("db123");

  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /servers\/abc123\/databases$/);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].body)), { database: "botdb", remote: "%" });
  assert.match(calls[2].url, /databases\/db123\/rotate-password$/);
  assert.equal(calls[3].method, "DELETE");
});

test("backup helper memakai endpoint benar", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const backups = ptero.server("abc123").backups;

  await backups.list();
  await backups.create({ name: "before-update", ignored: ["node_modules"], isLocked: true });
  await backups.details("backup123");
  await backups.download("backup123");
  await backups.delete("backup123");

  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /servers\/abc123\/backups$/);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].body)), { name: "before-update", ignored: "node_modules", is_locked: true });
  assert.match(calls[3].url, /backups\/backup123\/download$/);
  assert.equal(calls[4].method, "DELETE");
});

test("schedule helper memakai endpoint benar", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const schedules = ptero.server("abc123").schedules;

  await schedules.list();
  await schedules.create({ name: "Daily restart", minute: "0", hour: "3", dayOfMonth: "*", month: "*", dayOfWeek: "*" });
  await schedules.details(7);
  await schedules.update(7, { name: "Night restart", isActive: false });
  await schedules.run(7);
  await schedules.tasks.create(7, { action: "power", payload: "restart", timeOffset: 0 });
  await schedules.tasks.update(7, 8, { payload: "start", continueOnFailure: true });
  await schedules.tasks.delete(7, 8);
  await schedules.delete(7);

  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /servers\/abc123\/schedules$/);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].body)), { name: "Daily restart", minute: "0", hour: "3", day_of_month: "*", month: "*", day_of_week: "*", is_active: true, only_when_online: false });
  assert.deepEqual(JSON.parse(String(calls[3].body)), { name: "Night restart", is_active: false });
  assert.match(calls[4].url, /schedules\/7\/execute$/);
  assert.deepEqual(JSON.parse(String(calls[5].body)), { action: "power", payload: "restart", time_offset: 0, continue_on_failure: false });
  assert.deepEqual(JSON.parse(String(calls[6].body)), { payload: "start", continue_on_failure: true });
  assert.equal(calls[7].method, "DELETE");
  assert.equal(calls[8].method, "DELETE");
});

test("probe menjalankan semua endpoint read-only", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return json({ ok: true });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const report = await ptero.server("abc123").probe();

  assert.equal(report.ok, true);
  assert.equal(Object.keys(report.checks).length, 7);
  assert.equal(calls.every(call => call.method === "GET"), true);
  assert.match(calls.map(call => call.url).join("\n"), /resources/);
  assert.match(calls.map(call => call.url).join("\n"), /backups/);
  assert.match(calls.map(call => call.url).join("\n"), /schedules/);
});

test("createSmart dryRun membangun payload otomatis", async () => {
  const fetcher = async (url) => {
    const target = String(url);
    if (target.includes("filter%5Bemail%5D") || target.includes("filter[email]")) {
      return json({ data: [{ attributes: { id: 10, email: "aka@example.com", username: "aka" } }] });
    }
    if (target.includes("/nodes/1/allocations")) {
      return json({ data: [
        { attributes: { id: 101, port: 3000, assigned: false } },
        { attributes: { id: 102, port: 3001, assigned: false } }
      ] });
    }
    if (target.includes("/nodes/1")) return json({ data: { attributes: { id: 1, name: "Node ID" } } });
    if (target.includes("/nests/5/eggs/15")) {
      return json({ data: { attributes: {
        id: 15,
        name: "Node.js",
        startup: "npm start",
        docker_images: { Nodejs: "ghcr.io/parkervcp/yolks:nodejs_22" },
        relationships: { variables: { data: [
          { attributes: { env_variable: "STARTUP_FILE", default_value: "index.js", rules: "required|string" } }
        ] } }
      } } });
    }
    if (target.includes("/nests/5")) return json({ data: { attributes: { id: 5, name: "Bot" } } });
    return json({ data: { attributes: {} } });
  };

  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const result = await ptero.servers.createSmart({
    name: "Bot Aka",
    email: "aka@example.com",
    description: "Server bot",
    nodeId: 1,
    nestId: 5,
    eggId: 15,
    specs: {
      memory: "2GB",
      disk: "5GB",
      cpu: "100%",
      databases: 1,
      allocations: 2,
      backups: 1
    }
  }, { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.payload.name, "Bot Aka");
  assert.equal(result.payload.docker_image, "ghcr.io/parkervcp/yolks:nodejs_22");
  assert.deepEqual(result.payload.allocation, { default: 101, additional: [102] });
});

function json(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
}
