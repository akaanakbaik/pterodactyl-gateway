import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEnvironment,
  createPtero,
  parseSizeToMiB,
  PteroError
} from "../dist/index.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const empty = () => new Response(null, { status: 204 });

function routeFetcher(routes, log = []) {
  return async (url, init) => {
    const target = new URL(String(url));
    const method = (init?.method ?? "GET").toUpperCase();
    log.push({ method, path: `${target.pathname}${target.search}`, body: init?.body });
    for (const route of routes) {
      if (route.method && route.method !== method) continue;
      if (route.match(target.pathname, target.search)) return route.handler(target, init);
    }
    return json({ data: [] });
  };
}

const v2Egg = {
  data: {
    attributes: {
      id: 15,
      name: "Node.js",
      startup: "node index.js",
      docker_images: { Node: "ghcr.io/parkervcp/yolks:nodejs_20" },
      relationships: {
        variables: {
          data: [
            { attributes: { env_variable: "CMD_RUN", default_value: "npm start", rules: "required|string" } },
            { attributes: { env_variable: "MAIN_FILE", default_value: "index.js", rules: "required|string" } }
          ]
        },
        tags: {
          data: [
            { attributes: { id: 3, name: "Minecraft", slug: "minecraft", legacy_nest_id: 5 } }
          ]
        }
      }
    }
  }
};

function v2Routes(extra = []) {
  return [
    { match: path => path === "/api/admin/version", handler: () => json({ current: "2.0.0-beta.2", latest: "2.0.0-beta.2", daemon: "1.13.3" }) },
    { match: path => path === "/api/application/tags", handler: () => json({ data: [{ attributes: { id: 3, name: "Minecraft", slug: "minecraft", legacy_nest_id: 5 } }] }) },
    { match: path => path.startsWith("/api/application/nests"), handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/users", handler: () => json({ data: [] }) },
    { match: path => path === "/api/client/account", handler: () => json({ data: { attributes: { id: 1 } } }) },
    { match: path => path === "/api/application/eggs", handler: () => json({ data: [v2Egg.data] }) },
    { match: path => path === "/api/application/eggs/15", handler: () => json(v2Egg) },
    ...extra
  ];
}

test("panel v2 terdeteksi dari Admin API dan tags", async () => {
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    ptlc: "ptlc_test",
    adminKey: "ptlc_admin",
    fetcher: routeFetcher(v2Routes())
  });
  const info = await ptero.panel();
  assert.equal(info.apiVersion, "v2");
  assert.equal(info.panelVersion, "2.0.0-beta.2");
  assert.equal(info.adminApi, true);
  assert.equal(info.nests, false);
  assert.equal(info.tags, true);

  const capabilities = await ptero.capabilities();
  assert.equal(capabilities.apiVersion, "v2");
  assert.equal(capabilities.eggs, true);
  assert.equal(capabilities.tags, true);
  assert.equal(capabilities.adminApi, true);

  const connect = await ptero.connect();
  assert.equal(connect.apiVersion, "v2");
  assert.equal(connect.admin.valid, true);
});

test("panel v1 tetap terdeteksi lewat endpoint nests", async () => {
  const fetcher = routeFetcher([
    { match: path => path === "/api/admin/version", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/tags", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/nests", handler: () => json({ data: [{ attributes: { id: 5, name: "Nodejs" } }] }) },
    { match: path => path === "/api/application/users", handler: () => json({ data: [] }) },
    { match: path => path === "/api/client/account", handler: () => json({ data: { attributes: { id: 1 } } }) }
  ]);
  const ptero = createPtero({ domain: "https://panel.example.com", ptla: "ptla_test", ptlc: "ptlc_test", fetcher });
  const info = await ptero.panel();
  assert.equal(info.apiVersion, "v1");
  assert.equal(info.nests, true);
  assert.equal(info.tags, false);
});

test("listEggs dan listTags memakai endpoint v2 tanpa nests", async () => {
  const log = [];
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    adminKey: "ptlc_admin",
    fetcher: routeFetcher(v2Routes(), log)
  });
  const eggs = await ptero.listEggs();
  assert.equal(eggs.length, 1);
  const tags = await ptero.listTags();
  assert.equal(tags[0].name, "Minecraft");
  assert.equal(tags[0].legacyNestId, 5);
  assert.ok(log.some(entry => entry.path === "/api/application/eggs?include=variables%2Ctags&page=1"));
  assert.ok(!log.some(entry => entry.path.startsWith("/api/application/nests/")));
});

test("findNestByName memetakan tag v2", async () => {
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    adminKey: "ptlc_admin",
    fetcher: routeFetcher(v2Routes())
  });
  const nest = await ptero.findNestByName("Minecraft");
  assert.equal(nest.id, 5);
  assert.equal(nest.tagId, 3);
  assert.equal(nest.name, "Minecraft");
});

test("create server v2 tidak mengirim nest dan memakai egg v2", async () => {
  let payload;
  const extra = [
    { match: path => path === "/api/application/nests/5", handler: () => json({ errors: [{ detail: "not found" }] }, 404) },
    { match: path => path === "/api/application/users/1", handler: () => json({ data: { attributes: { id: 1, username: "owner" } } }) },
    { match: path => path === "/api/application/nodes/1", handler: () => json({ data: { attributes: { id: 1, name: "Node-01" } } }) },
    { match: path => path === "/api/application/nodes/1/allocations", handler: () => json({ data: [{ attributes: { id: 4, port: 3003, assigned: false } }] }) },
    {
      method: "POST",
      match: path => path === "/api/application/servers",
      handler: (_target, init) => {
        payload = JSON.parse(String(init.body));
        return json({ data: { attributes: { id: 9, identifier: "abc12345", name: "Demo" } } }, 201);
      }
    }
  ];
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    adminKey: "ptlc_admin",
    fetcher: routeFetcher(v2Routes(extra))
  });
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
  assert.equal("nest" in payload, false);
  assert.equal(payload.egg, 15);
  assert.equal(payload.environment.CMD_RUN, "npm start");
});

test("getServerDetails v2 memakai tag sebagai pengganti nest", async () => {
  const log = [];
  const extra = [
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
    { match: path => path === "/api/application/users/100", handler: () => json({ data: { attributes: { username: "owner", email: "owner@example.com" } } }) }
  ];
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    adminKey: "ptlc_admin",
    fetcher: routeFetcher(v2Routes(extra), log)
  });
  const details = await ptero.getServerDetails(1);
  assert.equal(details.apiVersion, "v2");
  assert.equal(details.nestId, 5);
  assert.equal(details.tagName, "Minecraft");
  assert.equal(details.eggName, "Node.js");
  assert.ok(!log.some(entry => entry.path.startsWith("/api/application/nests/")));
});

test("admin API memakai scope admin dan key root", async () => {
  const log = [];
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptla: "ptla_test",
    ptlc: "ptlc_test",
    adminKey: "ptlc_admin",
    fetcher: routeFetcher([
      { match: path => path === "/api/admin/version", handler: () => json({ current: "2.0.0-beta.2" }) },
      { match: path => path === "/api/admin/tags", handler: () => json({ data: [{ attributes: { id: 3, name: "Minecraft", slug: "minecraft" } }] }) },
      { match: path => path === "/api/admin/eggs", handler: () => json({ data: [] }) }
    ], log)
  });
  const version = await ptero.admin.version();
  assert.equal(version.current, "2.0.0-beta.2");
  const tags = await ptero.admin.tags.all();
  assert.equal(tags.length, 1);
  assert.ok(log.every(entry => entry.path.startsWith("/api/admin/")));
});

test("fitur client baru memakai endpoint yang benar", async () => {
  const log = [];
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptlc: "ptlc_test",
    fetcher: async (url, init) => {
      log.push({ method: (init?.method ?? "GET").toUpperCase(), path: new URL(String(url)).pathname, body: init?.body });
      return empty();
    }
  });
  await ptero.client.account.updateEmail("new@example.com", "secret");
  await ptero.client.account.updatePassword("old", "new");
  await ptero.client.account.sshKeys.create("laptop", "ssh-ed25519 AAAA");
  const server = ptero.server("abc12345");
  await server.subusers.create("user@example.com", ["control.start"]);
  await server.files.chmod("/", [{ file: "server.properties", mode: "0644" }]);
  await server.files.copy("/server.properties");
  await server.backups.restore("backup-uuid", true);
  await server.backups.setLock("backup-uuid", true);
  await server.settings.setDockerImage("ghcr.io/parkervcp/yolks:nodejs_20");
  assert.ok(log.some(entry => entry.method === "PUT" && entry.path === "/api/client/account/email"));
  assert.ok(log.some(entry => entry.method === "PUT" && entry.path === "/api/client/account/password"));
  assert.ok(log.some(entry => entry.method === "POST" && entry.path === "/api/client/account/ssh-keys"));
  assert.ok(log.some(entry => entry.method === "POST" && entry.path === "/api/client/servers/abc12345/users"));
  assert.ok(log.some(entry => entry.path === "/api/client/servers/abc12345/files/chmod"));
  const copyRequest = log.find(entry => entry.path === "/api/client/servers/abc12345/files/copy");
  assert.deepEqual(JSON.parse(copyRequest.body), { location: "/server.properties" });
  assert.ok(log.some(entry => entry.path === "/api/client/servers/abc12345/backups/backup-uuid/restore"));
  assert.ok(log.some(entry => entry.path === "/api/client/servers/abc12345/backups/backup-uuid/lock"));
  assert.ok(log.some(entry => entry.method === "PUT" && entry.path === "/api/client/servers/abc12345/settings/docker-image"));
});

test("file manager mengirim Buffer biner tanpa merusak isi", async () => {
  let body;
  const ptero = createPtero({
    domain: "https://panel.example.com",
    ptlc: "ptlc_test",
    fetcher: async (_url, init) => {
      body = init?.body;
      return empty();
    }
  });
  const original = Buffer.from([0, 1, 2, 250, 255]);
  await ptero.server("abc12345").files.write("/binary.dat", original);
  assert.ok(Buffer.isBuffer(body) || body instanceof Uint8Array);
  assert.deepEqual([...Buffer.from(body)], [...original]);
});

test("environment wajib yang diisi user tidak memicu error", () => {
  const egg = {
    data: {
      attributes: {
        relationships: {
          variables: {
            data: [
              { attributes: { env_variable: "REQUIRED_VALUE", default_value: null, rules: "required|string" } },
              { attributes: { env_variable: "WITH_DEFAULT", default_value: "ok", rules: "string" } }
            ]
          }
        }
      }
    }
  };
  const environment = buildEnvironment(egg, {
    name: "Demo",
    description: "demo",
    nodeId: 1,
    eggId: 15,
    environment: { REQUIRED_VALUE: "dari-user" }
  });
  assert.equal(environment.REQUIRED_VALUE, "dari-user");
  assert.equal(environment.WITH_DEFAULT, "ok");
  assert.throws(
    () => buildEnvironment(egg, { name: "Demo", description: "demo", nodeId: 1, eggId: 15 }),
    error => error instanceof PteroError && error.code === "EGG_VARIABLE_REQUIRED"
  );
});

test("swap -1 dipertahankan sebagai unlimited", () => {
  assert.equal(parseSizeToMiB(-1), -1);
  assert.equal(parseSizeToMiB("-1"), -1);
});
