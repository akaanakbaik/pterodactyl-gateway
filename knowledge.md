# Akadev Pterodactyl Gateway Knowledge Base

This document contains full API references and integration guidelines for `@akaanakbaik/pterodactyl-gateway` SDK.

## Initialization

```typescript
import { createPtero } from "@akaanakbaik/pterodactyl-gateway";

const ptero = createPtero({
  domain: "panel.example.com",
  ptla: "ptla_your_application_key",
  ptlc: "ptlc_your_client_key",
  debug: true
});
```

---

## Connection & Diagnostics

Check panel availability and API key validity.

```typescript
const conn = await ptero.connect();
const doc = await ptero.doctor();
```

---

## User Management

Manage administrative users on the panel.

### Create or Get User (Smart)
```typescript
const user = await ptero.smart.users.getOrCreate({
  username: "customer_user",
  email: "customer@akadev.me",
  password: "auto",
  administrator: false
});
```

### Find User by Email
```typescript
const user = await ptero.application.users.find("customer@akadev.me");
```

---

## Server Deployment & Specs Management

Deploy servers with automatic allocation mappings and update specifications.

### Smart Server Deploy
```typescript
const server = await ptero.smart.servers.create({
  name: "Express API Server",
  email: "customer@akadev.me",
  autoCreateUser: true,
  nodeId: 1,
  nestId: 5,
  eggId: 15,
  preset: "mini",
  startOnCompletion: false
});
```

### Update Server Specifications
```typescript
await ptero.smart.servers.updateSpecs(18, {
  memory: "1GB",
  disk: "2GB",
  cpu: "100%",
  databases: 1,
  backups: 1,
  allocations: 1
});
```

### Transfer Server Ownership
```typescript
await ptero.smart.servers.changeOwnership(18, {
  userId: 1
});
```

---

## Client Server Actions

Control individual servers using the server identifier.

```typescript
const server = ptero.server("ca7b58fd");
```

### Power Signals & Console Commands
```typescript
await server.power("start");
await server.power("stop");
await server.power("restart");
await server.power("kill");
await server.command("say Hello!");
```

### File Manager
```typescript
await server.files.write("/index.js", "console.log('App running');");
const code = await server.files.read("/index.js");
const list = await server.files.list("/");
await server.files.mkdir("/", "temp_folder");
await server.files.rename("/", [{ from: "index.js", to: "main.js" }]);
await server.files.compress("/", ["main.js"]);
await server.files.delete("/", ["main.js.tar.gz"]);
```

### Database Management
```typescript
const dbs = await server.databases.list();
const newDb = await server.databases.create("customer_db");
await server.databases.rotatePassword(newDb.attributes.id);
await server.databases.delete(newDb.attributes.id);
```

### Backup & Restore
```typescript
const backups = await server.backups.list();
const backup = await server.backups.create("manual_snapshot", "node_modules\nvendor");
await server.backups.delete(backup.attributes.uuid);
```

---

## WebSocket with Auto-Reconnect & Stream Listeners

Listen to server statistics and console logs in real time.

```typescript
const ws = server.websocket.create();

ws.onConsole((log) => {
  console.log("Console Log:", log);
});

ws.onStats((stats) => {
  console.log("RAM Bytes:", stats.memory_bytes);
});

ws.onStatus((status) => {
  console.log("Server Status:", status);
});

await ws.connect();
```

---

## Fluent Schedule & Task Builder

Build and register cron-based panel schedules natively.

```typescript
const schedule = server.createScheduleBuilder()
  .setName("Daily Restart")
  .setCron("0 3 * * *")
  .setOnlyWhenOnline(true)
  .addTask("command", "say Server restarting in 30 seconds", 0, true)
  .addTask("power", "restart", 30, false);

await schedule.save();
```

---

## SMTP Email & Automated Backups

Automatically retrieve local panel SMTP configurations and send messages or server backup zips.

### Send Targeted Email
```typescript
await ptero.email.sendToUser(1, {
  subject: "Server Notification",
  html: "<h3>Hello User</h3><p>Your server has been setup.</p>",
  attachments: [
    {
      filename: "terms.txt",
      content: "Terms of service text content."
    }
  ]
});
```

### Broadcast Email to All Users
```typescript
await ptero.email.broadcast({
  subject: "System Maintenance",
  html: "<h2>Maintenance Alert</h2><p>The node will restart in 10 minutes.</p>"
});
```

### Automated ZIP Backup Exporter via Email
Automatically filters heavy directories (`node_modules`, `vendor`, `cache`, `tmp`, `temp`, `.git`), creates a ZIP, mails it directly to the owner via SMTP, and deletes the panel backup:
```typescript
await ptero.exportAndEmailBackup(18);
```

### Batch User Backup Exporter
```typescript
await ptero.backupAndEmailUserServers(1);
```
