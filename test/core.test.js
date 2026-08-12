import test from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
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

test("retry config diterapkan dengan benar", () => {
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test",
    retry: {
      retries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      retryOn: [429, 503]
    }
  });
  assert.ok(ptero);
});

test("server find mengembalikan hasil pencarian", async () => {
  const fetcher = async (url) => {
    if (String(url).includes("/servers?filter[name]")) {
      return json({ 
        data: [{ 
          attributes: { id: 1, name: "Test Server", identifier: "abc123" } 
        }] 
      });
    }
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  const results = await ptero.application.servers.find("Test Server");
  assert.ok(Array.isArray(results));
  assert.equal(results[0].name, "Test Server");
});

test("findNestByName mengembalikan nest yang benar", async () => {
  const fetcher = async (url) => {
    if (String(url).includes("/nests")) {
      return json({ 
        data: [{ 
          attributes: { id: 5, name: "Node.js", description: "Node.js eggs" } 
        }] 
      });
    }
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  const nest = await ptero.application.nests.find("Node.js");
  assert.equal(nest.id, 5);
  assert.equal(nest.name, "Node.js");
});

test("findEggByName mengembalikan egg yang benar", async () => {
  const fetcher = async (url) => {
    if (String(url).includes("/nests/5/eggs")) {
      return json({ 
        data: [{ 
          attributes: { id: 15, name: "Node.js" } 
        }] 
      });
    }
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  const egg = await ptero.application.nests.eggs.find(5, "Node.js");
  assert.equal(egg.id, 15);
  assert.equal(egg.name, "Node.js");
});

test("findNestByName melempar error jika nest tidak ditemukan", async () => {
  const fetcher = async () => json({ data: [] });
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  try {
    await ptero.application.nests.find("NonExistent");
    assert.fail("Should throw");
  } catch (e) {
    assert.match(e.code, /NEST_NOT_FOUND/);
  }
});

test("autoResolveDefaults mengembalikan defaults yang benar", async () => {
  const fetcher = async (url) => {
    const u = String(url);
    if (u.includes("/nests?")) return json({ data: [{ attributes: { id: 5, name: "Node.js" } }] });
    if (u.includes("/nests/5/eggs")) return json({ data: { attributes: { id: 15, name: "Node.js", startup: "node index.js", docker_images: { "18": "ghcr.io/pterodactyl/yolks:nodejs_18" } } } });
    if (u.includes("/nests/5")) return json({ data: { attributes: { id: 5, name: "Node.js" } } });
    if (u.includes("/nodes/1/allocations")) return json({ data: [{ attributes: { id: 100, port: 25565, assigned: false } }] });
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  const defaults = await ptero.autoResolveDefaults(1);
  assert.equal(defaults.nestId, 5);
  assert.equal(defaults.eggId, 15);
  assert.equal(defaults.startup, "node index.js");
  assert.ok(defaults.dockerImage.includes("nodejs"));
  assert.equal(defaults.allocationId, 100);
});

test("batchServerOperation menjalankan operasi batch", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  const result = await ptero.batchServerOperation([1, 2, 3], "suspend");
  assert.equal(result.total, 3);
  assert.equal(result.success, 3);
  assert.equal(result.failed, 0);
});

test("getServerDetails mengembalikan detail lengkap", async () => {
  const fetcher = async (url) => {
    const u = String(url);
    if (u.includes("/servers/1")) return json({ data: { attributes: { id: 1, identifier: "abc123", name: "Test", node: 1, nest: 5, egg: 15, user: 100, container: { image: "test", startup_command: "node" }, limits: {}, feature_limits: {} } } });
    if (u.includes("/nodes/1")) return json({ data: { attributes: { name: "Node1" } } });
    if (u.includes("/nests/5/eggs/15")) return json({ data: { attributes: { name: "NodeJS Egg" } } });
    if (u.includes("/nests/5")) return json({ data: { attributes: { name: "NodeJS" } } });
    if (u.includes("/users/100")) return json({ data: { attributes: { username: "testuser" } } });
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ 
    domain: "https://panel.example.com", 
    ptla: "ptla_test", 
    fetcher 
  });
  const details = await ptero.getServerDetails(1);
  assert.equal(details.id, 1);
  assert.equal(details.name, "Test");
  assert.equal(details.nodeName, "Node1");
  assert.equal(details.nestName, "NodeJS");
  assert.equal(details.eggName, "NodeJS Egg");
  assert.equal(details.userName, "testuser");
});


test("file manager download memakai endpoint download yang benar", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return json({ attributes: { url: "https://download.example.com/file" } });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  const result = await ptero.server("abc123").files.download("/folder/test.txt");
  assert.equal(result.attributes.url, "https://download.example.com/file");
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /files\/download\?file=%2Ffolder%2Ftest.txt/);
});

test("file manager read menolak fallback HTML", async () => {
  const fetcher = async () => new Response("<!DOCTYPE html><html><body>Panel</body></html>", {
    status: 200,
    headers: { "Content-Type": "text/html" }
  });
  const ptero = createPtero({ domain: "https://panel.example.com", ptlc: "ptlc_test", fetcher });
  await assert.rejects(
    () => ptero.server("abc123").files.read("/missing.txt"),
    error => error instanceof PteroError && error.code === "UNEXPECTED_TEXT_RESPONSE"
  );
});

test("changeNestEgg mempertahankan environment yang diperlukan", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    const endpoint = String(url);
    calls.push({ url: endpoint, method: init?.method, body: init?.body });
    if (endpoint.includes("/nests/5/eggs/15")) {
      return json({
        data: {
          attributes: {
            id: 15,
            startup: "node index.js",
            docker_images: { node: "ghcr.io/example/node:20" },
            relationships: {
              variables: {
                data: [
                  { attributes: { env_variable: "CMD_RUN", default_value: "npm start" } },
                  { attributes: { env_variable: "OPTIONAL_VALUE", default_value: "" } }
                ]
              }
            }
          }
        }
      });
    }
    if (endpoint.includes("/servers/1") && init?.method === "GET") {
      return json({ data: { attributes: { container: { environment: { CMD_RUN: "node app.js", EXISTING: "value" } } } } });
    }
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const result = await ptero.smart.servers.changeNestEgg(1, { nestId: 5, eggId: 15 });
  assert.equal(result.environment.CMD_RUN, "node app.js");
  const update = calls.find(call => call.url.includes("/servers/1/startup"));
  assert.ok(update);
  const payload = JSON.parse(update.body);
  assert.equal(payload.image, "ghcr.io/example/node:20");
  assert.equal(payload.skip_scripts, false);
  assert.deepEqual(payload.environment, { CMD_RUN: "node app.js", OPTIONAL_VALUE: "" });
});

test("retry menghormati Retry-After dan berhasil pada percobaan berikutnya", async () => {
  let attempts = 0;
  const fetcher = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify({ errors: [{ detail: "Terlalu banyak request" }] }), {
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
    retry: { retries: 1, baseDelay: 1, maxDelay: 1 }
  });
  const user = await ptero.application.users.get(1);
  assert.equal(user.data.attributes.id, 1);
  assert.equal(attempts, 2);
});

test("email tanpa SMTP eksplisit mengembalikan error konfigurasi", async () => {
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test" });
  await assert.rejects(
    () => ptero.email.send({ to: "user@example.com", subject: "Test" }),
    error => error instanceof PteroError && error.code === "SMTP_CONFIG_REQUIRED"
  );
});

test("application servers tidak mengekspos updateInventory yang tidak valid", () => {
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test" });
  assert.equal("updateInventory" in ptero.application.servers, false);
});

test("WebSocket Node.js mengirim Origin dan connect menunggu koneksi terbuka", async () => {
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
  const closed = new Promise(resolve => server.once("close", resolve));
  websocket.close();
  server.close();
  await closed;
});


test("retry default tidak mengulang POST yang tidak idempotent", async () => {
  let attempts = 0;
  const fetcher = async () => {
    attempts += 1;
    return new Response(JSON.stringify({ errors: [{ detail: "Terlalu banyak request" }] }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "0" }
    });
  };
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    fetcher,
    retry: { retries: 2, baseDelay: 1, maxDelay: 1 }
  });
  await assert.rejects(() => ptero.application.users.create({ username: "user" }));
  assert.equal(attempts, 1);
});

test("retryUnsafe mengizinkan caller mengulang POST secara eksplisit", async () => {
  let attempts = 0;
  const fetcher = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify({ errors: [{ detail: "Terlalu banyak request" }] }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "0" }
      });
    }
    return json({ data: { attributes: { ok: true } } });
  };
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    fetcher,
    retry: { retries: 1, baseDelay: 1, maxDelay: 1 }
  });
  const result = await ptero.request({ api: "application", method: "POST", path: "/safe-retry", body: {}, retryUnsafe: true });
  assert.equal(result.data.attributes.ok, true);
  assert.equal(attempts, 2);
});

test("findNestByName menjangkau halaman berikutnya", async () => {
  const fetcher = async url => {
    const endpoint = String(url);
    if (endpoint.includes("/nests?page=1")) {
      return json({ data: [{ attributes: { id: 1, name: "Minecraft" } }], meta: { pagination: { current_page: 1, total_pages: 2 } } });
    }
    if (endpoint.includes("/nests?page=2")) {
      return json({ data: [{ attributes: { id: 5, name: "Nodejs" } }], meta: { pagination: { current_page: 2, total_pages: 2 } } });
    }
    return json({ data: [] });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const nest = await ptero.application.nests.find("Nodejs");
  assert.equal(nest.id, 5);
});

test("autoResolveDefaults memilih allocation kosong dari halaman berikutnya", async () => {
  const fetcher = async url => {
    const endpoint = String(url);
    if (endpoint.includes("/nests/5/eggs/15")) {
      return json({ data: { attributes: { id: 15, startup: "node index.js", docker_images: { node: "node:20" } } } });
    }
    if (endpoint.includes("/nests/5")) return json({ data: { attributes: { id: 5, name: "Nodejs" } } });
    if (endpoint.includes("/nodes/1/allocations?page=1")) {
      return json({ data: [{ attributes: { id: 1, assigned: true, port: 25565 } }], meta: { pagination: { current_page: 1, total_pages: 2 } } });
    }
    if (endpoint.includes("/nodes/1/allocations?page=2")) {
      return json({ data: [{ attributes: { id: 99, assigned: false, port: 25566 } }], meta: { pagination: { current_page: 2, total_pages: 2 } } });
    }
    return json({ data: { attributes: { id: 1 } } });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  const defaults = await ptero.autoResolveDefaults(1);
  assert.equal(defaults.allocationId, 99);
});

test("resolver Nest/Egg meneruskan error ketika default tidak tersedia", async () => {
  const fetcher = async () => new Response(JSON.stringify({ errors: [{ detail: "Tidak ditemukan" }] }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  await assert.rejects(
    () => ptero.findNestAndEgg(),
    error => error instanceof PteroError && error.code === "NOT_FOUND"
  );
});

test("safe mode memerlukan konfirmasi untuk penghapusan user", async () => {
  let deleteCalls = 0;
  const fetcher = async (_url, init) => {
    if (init?.method === "DELETE") deleteCalls += 1;
    return new Response(null, { status: 204 });
  };
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", fetcher });
  await assert.rejects(
    () => ptero.application.users.delete(1),
    error => error instanceof PteroError && error.code === "SAFE_MODE_CONFIRMATION_REQUIRED"
  );
  await ptero.application.users.delete(1, true);
  assert.equal(deleteCalls, 1);
});
