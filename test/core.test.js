import test from "node:test";
import assert from "node:assert/strict";
import { 
  createPtero, 
  explainError, 
  PteroError, 
  parseCpu, 
  parseSizeToMiB,
  createIntegrationServerInput,
  getIntegrationKinds
} from "../dist/index.js";

const json = (data) => new Response(JSON.stringify(data), { 
  status: 200, 
  headers: { "Content-Type": "application/json" } 
});

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
  assert.match(text, /Langkah Perbaikan/);
});

test("connect mendeteksi full mode dengan mock fetch", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ domain: "panel.example.com/", ptla: "ptla_test", ptlc: "ptlc_test", fetcher });
  const result = await ptero.connect();
  assert.equal(result.ok, true);
  assert.equal(result.mode, "full");
  assert.equal(ptero.domain, "https://panel.example.com");
});

test("integration helper membuat input server bot", () => {
  assert.ok(getIntegrationKinds().includes("whatsapp-bot"));
  const input = createIntegrationServerInput({
    kind: "whatsapp-bot",
    name: "WA Bot Aka",
    email: "aka@example.com",
    nodeId: 1,
    nestId: 5,
    eggId: 18
  });
  assert.equal(input.name, "WA Bot Aka");
  assert.equal(input.preset, "standard");
  assert.equal(input.environment.BOT_PLATFORM, "whatsapp");
});

test("smart users getOrCreate dryRun", async () => {
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher: async () => json({ data: [] }) 
  });
  const result = await ptero.smart.users.create({
    username: "aka",
    email: "aka@example.com",
    password: "auto",
    administrator: false
  }, { dryRun: true });
  
  assert.equal(result.dryRun, true);
  assert.equal(result.payload.username, "aka");
});

test("server power and command", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body });
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const server = ptero.server("abc123");
  
  await server.power("start");
  await server.command("say hi");
  
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /power/);
  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].url, /command/);
});

test("file manager write", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body });
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  await ptero.server("abc123").files.write("/test.txt", "hello");
  
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].url, /files\/write/);
});
