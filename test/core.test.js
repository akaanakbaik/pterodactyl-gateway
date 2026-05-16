import test from "node:test";
import assert from "node:assert/strict";
import { createPtero, explainError, parseCpu, parseSizeToMiB, PteroError } from "../dist/index.js";

test("parseSizeToMiB mengubah GB dan MB ke MiB", () => {
  assert.equal(parseSizeToMiB("2GB"), 2048);
  assert.equal(parseSizeToMiB("512MB"), 512);
  assert.equal(parseSizeToMiB(128), 128);
});

test("parseCpu menerima angka dan persen", () => {
  assert.equal(parseCpu("100%"), 100);
  assert.equal(parseCpu(250), 250);
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
  assert.throws(() => ptero.server("abc123").command("rm -rf /"), /Command terlihat berbahaya/);
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
  assert.equal(calls[1].method, "PUT");
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
