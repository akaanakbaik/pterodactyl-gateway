import test from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import {
  createPtero,
  explainError,
  formatMiB,
  getPteroErrorCode,
  normalizeDomain,
  parseCpu,
  parseSizeToMiB,
  PteroError,
  VERSION,
  createIntegrationServerInput,
  getIntegrationKinds,
  getIntegrationPresets
} from "../dist/index.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const text = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain" } });

function routeFetcher(routes, log = []) {
  return async (url, init) => {
    const target = new URL(String(url));
    const method = (init?.method ?? "GET").toUpperCase();
    const path = `${target.pathname}${target.search}`;
    log.push({ method, path, body: init?.body });
    for (const route of routes) {
      if (route.method && route.method !== method) continue;
      if (route.match(target.pathname, target.search)) return route.handler(target, init);
    }
    return json({ data: [] });
  };
}

test("parseSizeToMiB memahami berbagai satuan dan unlimited", () => {
  assert.equal(parseSizeToMiB("2GB"), 2048);
  assert.equal(parseSizeToMiB("512MB"), 512);
  assert.equal(parseSizeToMiB("1.5GB"), 1536);
  assert.equal(parseSizeToMiB("2TiB"), 2097152);
  assert.equal(parseSizeToMiB("unlimited"), 0);
  assert.equal(parseSizeToMiB(128), 128);
  assert.throws(() => parseSizeToMiB("abc"), /tidak valid/);
});

test("parseCpu dan formatMiB konsisten", () => {
  assert.equal(parseCpu("100%"), 100);
  assert.equal(parseCpu(250), 250);
  assert.equal(formatMiB(2048), "2 GB");
  assert.equal(formatMiB(512), "512 MB");
  assert.equal(formatMiB(0), "unlimited");
});

test("normalizeDomain membersihkan trailing slash dan protokol", () => {
  assert.equal(normalizeDomain("panel.example.com/"), "https://panel.example.com");
  assert.equal(normalizeDomain("http://panel.example.com///"), "http://panel.example.com");
  assert.throws(() => normalizeDomain("   "));
});

test("explainError menghasilkan pesan tutorial", () => {
  const message = explainError(
    new PteroError({ code: "TEST_ERROR", message: "Terjadi error test.", hint: "Ini hint.", steps: ["Langkah satu", "Langkah dua"] })
  );
  assert.match(message, /TEST_ERROR/);
  assert.match(message, /Langkah perbaikan/);
  assert.match(message, /Langkah satu/);
});

test("versi package diekspor", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test("connect mendeteksi mode full dengan mock fetch", async () => {
  const fetcher = async () => json({ data: { attributes: { id: 1 } } });
  const ptero = createPtero({ domain: "panel.example.com/", ptla: "ptla_test", ptlc: "ptlc_test", fetcher });
  const result = await ptero.connect();
  assert.equal(result.ok, true);
  assert.equal(result.mode, "full");
  assert.equal(ptero.domain, "https://panel.example.com");
});

test("capabilities mendeteksi panel tanpa endpoint nests", async () => {
  const fetcher = routeFetcher([
    { match: path => path === "/api/application/nests", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/eggs", handler: () => json({ data: [{ attributes: { id: 15, name: "Nodejs" } }] }) },
    { match: path => path === "/api/application/users", handler: () => json({ data: [] }) },
    { match: path => path === "/api/client/account", handler: () => json({ data: { attributes: { id: 1 } } }) }
  ]);
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", ptlc: "ptlc_test", fetcher });
  const capabilities = await ptero.capabilities();
  assert.equal(capabilities.nests, false);
  assert.equal(capabilities.eggs, true);
  const eggs = await ptero.listEggs();
  assert.equal(eggs.length, 1);
});

test("getEgg memakai include=variables pada varian endpoint eggs", async () => {
  const log = [];
  const fetcher = routeFetcher(
    [
      { match: path => path === "/api/application/nests", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
      { match: path => path === "/api/application/eggs", handler: () => json({ data: [{ attributes: { id: 15 } }] }) },
      {
        match: path => path === "/api/application/eggs/15",
        handler: target =>
          json({
            data: {
              attributes: {
                id: 15,
                startup: "node index.js",
                docker_images: { node: "ghcr.io/example/node:20" },
                relationships: target.searchParams.get("include") === "variables" ? { variables: { data: [{ attributes: { env_variable: "CMD_RUN", default_value: "npm start" } }] } } : {}
              }
            }
          })
      }
    ],
    log
  );
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const egg = await ptero.getEggById(15, true);
  assert.equal(egg.data.attributes.startup, "node index.js");
  assert.ok(log.some(entry => entry.path.includes("include=variables")));
});

test("createServerSmart melengkapi environment yang diminta panel", async () => {
  let serverPosts = 0;
  const fetcher = routeFetcher([
    { match: path => path === "/api/application/nests", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/eggs", handler: () => json({ data: [{ attributes: { id: 15 } }] }) },
    {
      match: path => path === "/api/application/eggs/15",
      handler: () =>
        json({
          data: {
            attributes: {
              id: 15,
              startup: "node index.js",
              docker_images: { node: "ghcr.io/example/node:20" },
              relationships: {}
            }
          }
        })
    },
    { match: path => path === "/api/application/users", handler: () => json({ data: [] }) },
    { match: path => path === "/api/application/users/1", handler: () => json({ data: { attributes: { id: 1 } } }) },
    { match: path => path === "/api/application/nodes/1", handler: () => json({ data: { attributes: { id: 1, name: "Node" } } }) },
    { match: path => path === "/api/application/nodes/1/allocations", handler: () => json({ data: [{ attributes: { id: 4, port: 3003, assigned: false } }] }) },
    {
      method: "POST",
      match: path => path === "/api/application/servers",
      handler: () => {
        serverPosts += 1;
        if (serverPosts === 1) {
          return json({ errors: [{ detail: "The Command Run variable field is required.", meta: { source_field: "environment.CMD_RUN" } }] }, 422);
        }
        return json({ data: { attributes: { id: 9, identifier: "abc12345", name: "Demo" } } }, 201);
      }
    }
  ]);
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const result = await ptero.smart.servers.create({
    name: "Demo",
    userId: 1,
    description: "demo",
    nodeId: 1,
    nestId: 5,
    eggId: 15,
    specs: { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 },
    startOnCompletion: false
  });
  assert.equal(result.identifier, "abc12345");
  assert.equal(serverPosts, 2);
});

test("createServerSmart dryRun tidak membuat resource", async () => {
  let posts = 0;
  const fetcher = routeFetcher([
    { match: path => path === "/api/application/nests", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/eggs", handler: () => json({ data: [{ attributes: { id: 15 } }] }) },
    {
      match: path => path === "/api/application/eggs/15",
      handler: () => json({ data: { attributes: { id: 15, startup: "node index.js", docker_images: { a: "img" } } } })
    },
    { match: path => path === "/api/application/users", handler: () => json({ data: [] }) },
    { match: path => path === "/api/application/users/1", handler: () => json({ data: { attributes: { id: 1 } } }) },
    { match: path => path === "/api/application/nodes/1", handler: () => json({ data: { attributes: { id: 1, name: "Node" } } }) },
    { match: path => path === "/api/application/nodes/1/allocations", handler: () => json({ data: [{ attributes: { id: 4, port: 3003, assigned: false } }] }) },
    {
      method: "POST",
      match: path => path === "/api/application/servers",
      handler: () => {
        posts += 1;
        return json({ data: { attributes: { id: 9 } } }, 201);
      }
    }
  ]);
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const result = await ptero.smart.servers.create(
    {
      name: "Demo",
      userId: 1,
      description: "demo",
      nodeId: 1,
      nestId: 5,
      eggId: 15,
      specs: { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 }
    },
    { dryRun: true }
  );
  assert.equal(result.dryRun, true);
  assert.equal(posts, 0);
});

test("preview server tidak membuat user baru", async () => {
  let createdUsers = 0;
  const fetcher = routeFetcher([
    { match: path => path === "/api/application/nests", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/eggs", handler: () => json({ data: [{ attributes: { id: 15 } }] }) },
    {
      match: path => path === "/api/application/eggs/15",
      handler: () => json({ data: { attributes: { id: 15, startup: "node index.js", docker_images: { a: "img" } } } })
    },
    { match: path => path === "/api/application/users", handler: () => json({ data: [] }) },
    { match: path => path === "/api/application/nodes/1", handler: () => json({ data: { attributes: { id: 1, name: "Node" } } }) },
    { match: path => path === "/api/application/nodes/1/allocations", handler: () => json({ data: [{ attributes: { id: 4, port: 3003, assigned: false } }] }) },
    {
      method: "POST",
      match: path => path === "/api/application/users",
      handler: () => {
        createdUsers += 1;
        return json({ data: { attributes: { id: 5 } } }, 201);
      }
    }
  ]);
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const preview = await ptero.smart.servers.preview({
    name: "Demo",
    email: "baru@example.com",
    autoCreateUser: true,
    description: "demo",
    nodeId: 1,
    nestId: 5,
    eggId: 15,
    specs: { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 }
  });
  assert.equal(createdUsers, 0);
  assert.equal(preview.user.pending, true);
  assert.equal(preview.allocation.default, 4);
});

test("safe mode memblokir penghapusan tanpa konfirmasi", async () => {
  let deletes = 0;
  const fetcher = async (_url, init) => {
    if (init?.method === "DELETE") deletes += 1;
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  await assert.rejects(() => ptero.application.users.delete(1), error => error.code === "SAFE_MODE_CONFIRMATION_REQUIRED");
  await ptero.application.users.delete(1, true);
  assert.equal(deletes, 1);
});

test("server power dan command memakai endpoint client", async () => {
  const log = [];
  const fetcher = async (url, init) => {
    log.push({ url: String(url), method: init?.method });
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const server = ptero.server("abc123");
  await server.start();
  await server.command("say hi");
  assert.equal(log[0].method, "POST");
  assert.match(log[0].url, /power/);
  assert.match(log[1].url, /command/);
});

test("resources menormalkan respons berbentuk stats", async () => {
  const fetcher = async () =>
    json({ object: "stats", attributes: { current_state: "running", is_suspended: false, resources: { memory_bytes: 1024, cpu_absolute: 12.5, disk_bytes: 2048, network_rx_bytes: 1, network_tx_bytes: 2, uptime: 5000 } } });
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const resources = await ptero.server("abc123").resources();
  assert.equal(resources.current_state, "running");
  assert.equal(resources.resources.cpu_absolute, 12.5);
  assert.equal(resources.resources.uptime, 5000);
});

test("file manager menulis, membaca, dan menolak HTML", async () => {
  const log = [];
  const fetcher = async (url, init) => {
    log.push({ url: String(url), method: init?.method, body: init?.body });
    if (String(url).includes("files/contents")) return text("<!DOCTYPE html><html></html>");
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const server = ptero.server("abc123");
  await server.files.write("/test.txt", "hello");
  assert.equal(log[0].method, "POST");
  assert.match(log[0].url, /files\/write/);
  await assert.rejects(() => server.files.read("/missing.txt"), error => error.code === "UNEXPECTED_TEXT_RESPONSE");
});

test("files.downloadUrl mengambil URL dari panel", async () => {
  const fetcher = async () => json({ attributes: { url: "https://download.example.com/file" } });
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const url = await ptero.server("abc123").files.downloadUrl("/folder/test.txt");
  assert.equal(url, "https://download.example.com/file");
});

test("getServerDetails menyatukan data node, egg, dan user", async () => {
  const fetcher = routeFetcher([
    { match: path => path === "/api/application/nests", handler: () => json({ data: [{ attributes: { id: 5, name: "Nodejs" } }] }) },
    {
      match: path => path === "/api/application/servers/1",
      handler: () =>
        json({
          data: {
            attributes: {
              id: 1,
              identifier: "abc12345",
              uuid: "uuid",
              name: "Demo",
              node: 1,
              nest: 5,
              egg: 15,
              user: 100,
              limits: { memory: 512 },
              feature_limits: { databases: 0, allocations: 1, backups: 0 },
              container: { image: "img", startup_command: "node", environment: { A: "1" } }
            }
          }
        })
    },
    { match: path => path === "/api/application/nodes/1", handler: () => json({ data: { attributes: { name: "Node1" } } }) },
    { match: path => path === "/api/application/nests/5", handler: () => json({ data: { attributes: { name: "Nodejs" } } }) },
    { match: path => path === "/api/application/nests/5/eggs/15", handler: () => json({ data: { attributes: { name: "Nodejs Egg" } } }) },
    { match: path => path === "/api/application/users/100", handler: () => json({ data: { attributes: { username: "owner", email: "owner@example.com" } } }) }
  ]);
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const details = await ptero.getServerDetails(1);
  assert.equal(details.identifier, "abc12345");
  assert.equal(details.nodeName, "Node1");
  assert.equal(details.eggName, "Nodejs Egg");
  assert.equal(details.userEmail, "owner@example.com");
});

test("batchServerOperation mengembalikan ringkasan", async () => {
  const fetcher = async () => new Response(null, { status: 204 });
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const result = await ptero.batchServerOperation([1, 2, 3], "suspend", { concurrency: 2 });
  assert.equal(result.total, 3);
  assert.equal(result.success, 3);
  assert.equal(result.failed, 0);
});

test("retry menghormati Retry-After dan berhenti pada POST tanpa retryUnsafe", async () => {
  let getAttempts = 0;
  const fetcher = async (_url, init) => {
    if (init?.method === "POST") {
      return json({ errors: [{ detail: "rate limited" }] }, 429);
    }
    getAttempts += 1;
    if (getAttempts === 1) {
      return new Response(JSON.stringify({ errors: [{ detail: "rate limited" }] }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "0" }
      });
    }
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    fetcher,
    retry: { retries: 2, baseDelay: 1, maxDelay: 5 }
  });
  const user = await ptero.application.users.get(1);
  assert.equal(user.data.attributes.id, 1);
  assert.equal(getAttempts, 2);
  let posts = 0;
  await assert.rejects(
    () =>
      ptero.request({ api: "application", method: "POST", path: "/servers", body: {} }).catch(error => {
        posts += 1;
        throw error;
      }),
    error => error.status === 429
  );
  assert.equal(posts, 1);
});

test("cache GET mengurangi request berulang", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return json({ data: [{ attributes: { id: 15 } }] });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  await ptero.application.nodes.list(1);
  await ptero.application.nodes.list(1);
  assert.equal(calls, 1);
  const metrics = ptero.metrics();
  assert.ok(metrics.cacheHits >= 1);
  ptero.flushCache();
  await ptero.application.nodes.list(1);
  assert.equal(calls, 2);
});

test("email memvalidasi body sebelum konfigurasi SMTP", async () => {
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test" });
  await assert.rejects(
    () => ptero.email.send({ to: "user@example.com", subject: "Test" }),
    error => error.code === "EMAIL_BODY_REQUIRED"
  );
  await assert.rejects(
    () => ptero.email.send({ to: "user@example.com", subject: "Test", text: "halo" }),
    error => error.code === "SMTP_CONFIG_REQUIRED"
  );
});

test("WebSocket mengirim Origin dan menunggu koneksi terbuka", async () => {
  const server = new WebSocketServer({ port: 0 });
  await new Promise(resolve => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  let origin = "";
  server.on("connection", (socket, request) => {
    origin = String(request.headers.origin ?? "");
    socket.on("message", () => socket.send(JSON.stringify({ event: "auth success", args: [] })));
  });
  const fetcher = async () => json({ data: { token: "token", socket: `ws://127.0.0.1:${port}` } });
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const websocket = ptero.server("abc123").websocket.create();
  await websocket.connect();
  assert.equal(origin, "https://panel.example.com");
  assert.equal(websocket.stats().connected, true);
  const closed = new Promise(resolve => server.once("close", resolve));
  await websocket.close();
  server.close();
  await closed;
});

test("integration helper membuat input server bot", () => {
  assert.ok(getIntegrationKinds().includes("whatsapp-bot"));
  assert.ok(getIntegrationKinds().includes("minecraft-java"));
  const presets = getIntegrationPresets();
  assert.equal(presets.mini.memory, "512MB");
  const input = createIntegrationServerInput({
    kind: "whatsapp-bot",
    name: "WA Bot",
    email: "aka@example.com",
    nodeId: 1,
    eggId: 15
  });
  assert.equal(input.preset, "standard");
  assert.equal(input.environment.BOT_PLATFORM, "whatsapp");
  assert.equal(input.nestId, 5);
});

test("getPteroErrorCode membaca kode error dengan aman", () => {
  assert.equal(getPteroErrorCode(new PteroError({ code: "X", message: "x" })), "X");
  assert.equal(getPteroErrorCode(new Error("biasa")), undefined);
});
