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
