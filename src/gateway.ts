import fs from "node:fs";
import { execSync } from "node:child_process";
import { PteroError, ErrorFactory } from "./errors.js";
import { HttpCore, RetryConfig } from "./http.js";
import { buildServerPayload, buildUserPayload, normalizeSpecs, normalizeUserResponse, progress, selectAllocations, validateCreateInput } from "./smart.js";
import {
  ConnectResult,
  CreateSmartServerInput,
  CreateUserSmartInput,
  DoctorReport,
  NormalizedServer,
  OperationOptions,
  PreviewCreateServer,
  PteroConfig,
  PteroMode,
  ServerPowerSignal,
  UpdateServerSpecsInput,
  ChangeServerOwnershipInput,
  ChangeServerNestEggInput
} from "./types.js";
import { asObject, getCollection, getDataAttributes, maskSecret, normalizeDomain, parseSizeToMiB, parseCpu, toBoolean, ensureNonNegativeInteger } from "./utils.js";
import { PteroWebSocket } from "./websocket.js";
import { PteroLogger } from "./logger.js";

export class PteroGateway {
  readonly domain: string;
  readonly applicationKey?: string;
  readonly clientKey?: string;
  readonly timeout: number;
  readonly userAgent: string;
  readonly safeMode: boolean;
  readonly presets: NonNullable<PteroConfig["presets"]>;
  readonly logger: PteroLogger;
  private http: HttpCore;

  constructor(config: PteroConfig) {
    const domain = config.domain ?? config.panelUrl;
    if (!domain) throw ErrorFactory.domainRequired();
    this.domain = normalizeDomain(domain);
    this.applicationKey = config.ptla ?? config.applicationKey;
    this.clientKey = config.ptlc ?? config.clientKey;
    this.timeout = config.timeout ?? 15000;
    this.userAgent = config.userAgent ?? "AkadevPterodactylGateway/1.3.0";
    this.safeMode = config.safeMode ?? true;
    this.presets = config.presets ?? {
      mini: { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 },
      basic: { memory: "1GB", disk: "2GB", cpu: 100, databases: 1, allocations: 1, backups: 1 },
      standard: { memory: "2GB", disk: "5GB", cpu: 200, databases: 2, allocations: 1, backups: 2 },
      premium: { memory: "4GB", disk: "10GB", cpu: 400, databases: 5, allocations: 1, backups: 5 }
    };
    this.logger = new PteroLogger(config.debug ?? true);
    this.http = new HttpCore({
      domain: this.domain,
      applicationKey: this.applicationKey,
      clientKey: this.clientKey,
      timeout: this.timeout,
      userAgent: this.userAgent,
      fetcher: config.fetcher ?? fetch,
      debug: config.debug,
      retry: config.retry
    });
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PteroGateway {
    return new PteroGateway({
      domain: env.PTERO_DOMAIN ?? env.PTERO_PANEL_URL,
      ptla: env.PTERO_PTLA ?? env.PTERO_APPLICATION_KEY,
      ptlc: env.PTERO_PTLC ?? env.PTERO_CLIENT_KEY
    });
  }

  get application() {
    return {
      users: {
        list: (page = 1) => this.request<any>({ api: "application", path: `/users?page=${page}` }),
        get: (id: number) => this.request<any>({ api: "application", path: `/users/${id}` }),
        create: (data: any) => this.request<any>({ api: "application", method: "POST", path: "/users", body: data }),
        update: (id: number, data: any) => this.request<any>({ api: "application", method: "PATCH", path: `/users/${id}`, body: data }),
        delete: (id: number) => this.request<any>({ api: "application", method: "DELETE", path: `/users/${id}` }),
        find: (email: string) => this.findUserByEmail(email)
      },
      nodes: {
        list: (page = 1) => this.request<any>({ api: "application", path: `/nodes?page=${page}` }),
        get: (id: number) => this.request<any>({ api: "application", path: `/nodes/${id}` }),
        config: (id: number) => this.request<any>({ api: "application", path: `/nodes/${id}/configuration` }),
        allocations: {
          list: (nodeId: number, page = 1) => this.request<any>({ api: "application", path: `/nodes/${nodeId}/allocations?page=${page}` }),
          create: (nodeId: number, data: any) => this.request<any>({ api: "application", method: "POST", path: `/nodes/${nodeId}/allocations`, body: data }),
          delete: (nodeId: number, id: number) => this.request<any>({ api: "application", method: "DELETE", path: `/nodes/${nodeId}/allocations/${id}` })
        }
      },
      servers: {
        list: (page = 1) => this.request<any>({ api: "application", path: `/servers?page=${page}` }),
        get: (id: number) => this.request<any>({ api: "application", path: `/servers/${id}` }),
        find: (query: string) => this.searchServers(query),
        create: (data: any) => this.request<any>({ api: "application", method: "POST", path: "/servers", body: data }),
        update: (id: number, data: any) => this.request<any>({ api: "application", method: "PATCH", path: `/servers/${id}/details`, body: data }),
        updateBuild: (id: number, data: any) => this.request<any>({ api: "application", method: "PATCH", path: `/servers/${id}/build`, body: data }),
        updateStartup: (id: number, data: any) => this.request<any>({ api: "application", method: "PATCH", path: `/servers/${id}/startup`, body: data }),
        updateInventory: (id: number, data: any) => this.request<any>({ api: "application", method: "PATCH", path: `/servers/${id}/inventory`, body: data }),
        suspend: (id: number) => this.request<any>({ api: "application", method: "POST", path: `/servers/${id}/suspend` }),
        unsuspend: (id: number) => this.request<any>({ api: "application", method: "POST", path: `/servers/${id}/unsuspend` }),
        reinstall: (id: number) => this.request<any>({ api: "application", method: "POST", path: `/servers/${id}/reinstall` }),
        delete: (id: number, force = false) => this.request<any>({ api: "application", method: "DELETE", path: `/servers/${id}${force ? "/force" : ""}` })
      },
      locations: {
        list: (page = 1) => this.request<any>({ api: "application", path: `/locations?page=${page}` }),
        get: (id: number) => this.request<any>({ api: "application", path: `/locations/${id}` })
      },
      nests: {
        list: (page = 1) => this.request<any>({ api: "application", path: `/nests?page=${page}` }),
        get: (id: number) => this.request<any>({ api: "application", path: `/nests/${id}` }),
        find: (name: string) => this.findNestByName(name),
        eggs: {
          list: (nestId: number) => this.request<any>({ api: "application", path: `/nests/${nestId}/eggs` }),
          get: (nestId: number, eggId: number) => this.request<any>({ api: "application", path: `/nests/${nestId}/eggs/${eggId}?include=variables` }),
          find: (nestId: number, name: string) => this.findEggByName(nestId, name)
        }
      }
    };
  }

  get client() {
    return {
      account: {
        get: () => this.request<any>({ api: "client", path: "/account" }),
        twoFactor: () => this.request<any>({ api: "client", path: "/account/two-factor" }),
        apiKeys: {
          list: () => this.request<any>({ api: "client", path: "/account/api-keys" }),
          create: (description: string, allowedIps: string[] = []) => this.request<any>({ api: "client", method: "POST", path: "/account/api-keys", body: { description, allowed_ips: allowedIps } }),
          delete: (identifier: string) => this.request<any>({ api: "client", method: "DELETE", path: `/account/api-keys/${identifier}` })
        }
      },
      servers: {
        list: (page = 1) => this.request<any>({ api: "client", path: `/?page=${page}` })
      }
    };
  }

  get smart() {
    return {
      users: {
        create: (input: CreateUserSmartInput, options?: OperationOptions) => this.createUserSmart(input, options),
        getOrCreate: (input: CreateUserSmartInput, options?: OperationOptions) => this.getOrCreateUser(input, options),
        findByEmail: (email: string) => this.findUserByEmail(email)
      },
      servers: {
        preview: (input: CreateSmartServerInput, options?: OperationOptions) => this.previewCreateServer(input, options),
        create: (input: CreateSmartServerInput, options?: OperationOptions) => this.createServerSmart(input, options),
        createFromPreset: (preset: string, input: Omit<CreateSmartServerInput, "preset" | "specs">, options?: OperationOptions) => this.createServerSmart({ ...input, preset }, options),
        updateSpecs: (serverId: number, input: UpdateServerSpecsInput, options?: OperationOptions) => this.updateServerSpecs(serverId, input, options),
        changeOwnership: (serverId: number, input: ChangeServerOwnershipInput, options?: OperationOptions) => this.changeServerOwnership(serverId, input, options),
        changeNestEgg: (serverId: number, input: ChangeServerNestEggInput, options?: OperationOptions) => this.changeServerNestEgg(serverId, input, options)
      }
    };
  }

  server(identifier: string) {
    return new PteroServerHandle(this, identifier);
  }

  async request<T = unknown>(options: Parameters<HttpCore["request"]>[0]): Promise<T> {
    return this.http.request<T>(options);
  }

  async connect(): Promise<ConnectResult> {
    const started = Date.now();
    this.logger.info(`Menghubungkan ke ${this.domain}...`);
    const application = await this.checkApplicationKey();
    const client = await this.checkClientKey();
    const mode = this.resolveMode(application.valid, client.valid);
    if (mode === "invalid") this.logger.error("Gagal terhubung ke panel. Cek domain dan API Key.");
    else this.logger.success(`Terhubung! Mode: ${mode} (${Date.now() - started}ms)`);
    return { ok: mode !== "invalid", mode, domain: this.domain, latency: Date.now() - started, application, client };
  }

  async health(): Promise<ConnectResult> {
    return this.connect();
  }

  async doctor(): Promise<DoctorReport> {
    const connect = await this.connect();
    const checks = [
      { name: "domain", ok: true, message: this.domain },
      { name: "ptla_provided", ok: Boolean(this.applicationKey), message: this.applicationKey ? maskSecret(this.applicationKey) : "PTLA kosong" },
      { name: "ptlc_provided", ok: Boolean(this.clientKey), message: this.clientKey ? maskSecret(this.clientKey) : "PTLC kosong" },
      { name: "application_api", ok: connect.application.valid, message: connect.application.message, fix: "Cek PTLA dan permission Application API." },
      { name: "client_api", ok: connect.client.valid, message: connect.client.message, fix: "Cek PTLC dan permission Client API." }
    ];
    return { ok: checks.every(check => check.ok || check.name.endsWith("provided")), mode: connect.mode, checks };
  }

  async findNestByName(name: string) {
    this.logger.info(`Mencari nest: ${name}`);
    const raw = await this.request<any>({ api: "application", path: "/nests" }).catch(() => undefined);
    const data = getCollection(raw);
    const match = data.find(item => {
      const attrs = getDataAttributes(item);
      return String(attrs.name ?? "").toLowerCase() === name.toLowerCase();
    });
    if (match) {
      const attrs = getDataAttributes(match);
      return { id: Number(attrs.id ?? 0), name: String(attrs.name ?? ""), description: String(attrs.description ?? ""), raw: match };
    }
    const available = data.map(item => {
      const attrs = getDataAttributes(item);
      return `  ID: ${attrs.id} | Nama: ${attrs.name}`;
    }).join("\n");
    throw new PteroError({
      code: "NEST_NOT_FOUND",
      message: `Nest dengan nama '${name}' tidak ditemukan.`,
      hint: `Nest yang tersedia:\n${available || "  Tidak ada nest"}`,
      steps: ["Cek nama nest di panel admin", "Gunakan nest ID langsung jika nama tidak ditemukan"]
    });
  }

  async findEggByName(nestId: number, name: string) {
    this.logger.info(`Mencari egg '${name}' di nest ${nestId}...`);
    const raw = await this.application.nests.eggs.list(nestId).catch(() => undefined);
    const data = getCollection(raw);
    const match = data.find(item => {
      const attrs = getDataAttributes(item);
      return String(attrs.name ?? "").toLowerCase() === name.toLowerCase();
    });
    if (match) {
      const attrs = getDataAttributes(match);
      return { id: Number(attrs.id ?? 0), name: String(attrs.name ?? ""), nestId, raw: match };
    }
    const available = data.map(item => {
      const attrs = getDataAttributes(item);
      return `  ID: ${attrs.id} | Nama: ${attrs.name}`;
    }).join("\n");
    throw new PteroError({
      code: "EGG_NOT_FOUND",
      message: `Egg dengan nama '${name}' tidak ditemukan di nest ${nestId}.`,
      hint: `Egg yang tersedia di nest ${nestId}:\n${available || "  Tidak ada egg"}`,
      steps: ["Cek nama egg di panel admin", "Gunakan egg ID langsung jika nama tidak ditemukan"]
    });
  }

  async findNestAndEgg(nestName?: string, eggName?: string, defaultNestId = 5, defaultEggId = 15) {
    let nestId = defaultNestId;
    let eggId = defaultEggId;
    let nestName2: string | undefined;
    let eggName2: string | undefined;

    if (nestName) {
      try {
        const nest = await this.findNestByName(nestName);
        nestId = nest.id;
        nestName2 = nest.name;
      } catch (error) {
        this.logger.warn(`Nest '${nestName}' tidak ditemukan, menggunakan default ID ${defaultNestId}`);
        try {
          await this.application.nests.get(defaultNestId);
        } catch {
          nestId = 1;
          this.logger.warn(`Nest ID ${defaultNestId} tidak ada, fallback ke ID 1`);
        }
      }
    } else {
      try {
        await this.application.nests.get(nestId);
      } catch {
        nestId = 1;
        this.logger.warn(`Nest ID ${defaultNestId} tidak ada, fallback ke ID 1`);
      }
    }

    if (eggName) {
      try {
        const egg = await this.findEggByName(nestId, eggName);
        eggId = egg.id;
        eggName2 = egg.name;
      } catch (error) {
        this.logger.warn(`Egg '${eggName}' tidak ditemukan di nest ${nestId}, menggunakan default ID ${defaultEggId}`);
        try {
          await this.application.nests.eggs.get(nestId, defaultEggId);
        } catch {
          eggId = 1;
          this.logger.warn(`Egg ID ${defaultEggId} tidak ada di nest ${nestId}, fallback ke ID 1`);
        }
      }
    } else {
      try {
        await this.application.nests.eggs.get(nestId, eggId);
      } catch {
        eggId = 1;
        this.logger.warn(`Egg ID ${defaultEggId} tidak ada di nest ${nestId}, fallback ke ID 1`);
      }
    }

    return { nestId, eggId, nestName: nestName2, eggName: eggName2 };
  }

  async autoResolveDefaults(nodeId: number, options?: { defaultNestId?: number; defaultEggId?: number }) {
    this.logger.info(`Auto-resolving defaults untuk node ${nodeId}...`);
    const { nestId, eggId } = await this.findNestAndEgg(undefined, undefined, options?.defaultNestId ?? 5, options?.defaultEggId ?? 15);
    
    const rawEgg = await this.application.nests.eggs.get(nestId, eggId);
    const eggAttr = getDataAttributes(rawEgg);
    
    const startup = String(eggAttr.startup ?? "node index.js");
    const dockerImages = asObject(eggAttr.docker_images);
    const dockerImage = Object.values(dockerImages).find(v => typeof v === "string") as string || String(eggAttr.docker_image ?? "ghcr.io/pterodactyl/yolks:nodejs_18");
    
    const rawAllocations = await this.application.nodes.allocations.list(nodeId);
    const freeAllocations = getCollection(rawAllocations).filter(item => {
      const attrs = getDataAttributes(item);
      return !attrs.assigned;
    });
    
    if (freeAllocations.length === 0) throw ErrorFactory.noFreeAllocation(nodeId);
    
    const defaultAlloc = getDataAttributes(freeAllocations[0]);
    const allocationId = Number(defaultAlloc.id ?? 0);
    
    return { nestId, eggId, startup, dockerImage, allocationId };
  }

  private async updateServerSpecs(serverId: number, input: UpdateServerSpecsInput, options?: OperationOptions) {
    this.logger.info(`Mengupdate specs server ${serverId}...`);
    progress(options, "validate", 10, "Memvalidasi input.");
    
    const raw = await this.application.servers.get(serverId);
    const attrs = getDataAttributes(raw);
    const currentLimits = asObject(attrs.limits);
    const currentFeatureLimits = asObject(attrs.feature_limits);
    const currentAllocation = attrs.allocation;
    
    const memory = input.memory !== undefined ? parseSizeToMiB(input.memory) : currentLimits.memory;
    const disk = input.disk !== undefined ? parseSizeToMiB(input.disk) : currentLimits.disk;
    const cpu = input.cpu !== undefined ? parseCpu(input.cpu) : currentLimits.cpu;
    const swap = input.swap !== undefined ? parseSizeToMiB(input.swap) : (currentLimits.swap ?? 0);
    const io = input.io !== undefined ? ensureNonNegativeInteger(input.io, "io") : (currentLimits.io ?? 500);
    const threads = input.cpuPinning !== undefined ? (input.cpuPinning?.trim() ? input.cpuPinning.trim() : null) : (currentLimits.threads ?? null);
    const oomDisabled = input.oomDisabled !== undefined ? toBoolean(input.oomDisabled) : (currentLimits.oom_disabled ?? false);
    
    const databases = input.databases !== undefined ? ensureNonNegativeInteger(input.databases, "databases") : currentFeatureLimits.databases;
    const allocations = input.allocations !== undefined ? ensureNonNegativeInteger(input.allocations, "allocations") : currentFeatureLimits.allocations;
    const backups = input.backups !== undefined ? ensureNonNegativeInteger(input.backups, "backups") : currentFeatureLimits.backups;
    
    progress(options, "request", 50, "Mengirim update ke panel.");
    
    const buildData = {
      allocation: currentAllocation,
      memory,
      swap,
      disk,
      io,
      cpu,
      threads,
      oom_disabled: oomDisabled,
      feature_limits: {
        databases,
        allocations,
        backups
      }
    };
    
    await this.application.servers.updateBuild(serverId, buildData);
    
    progress(options, "done", 100, "Specs server berhasil diupdate.");
    return { ok: true, serverId, updated: { memory, swap, disk, io, cpu, threads, oomDisabled, ...buildData.feature_limits } };
  }

  private async changeServerOwnership(serverId: number, input: ChangeServerOwnershipInput, options?: OperationOptions) {
    this.logger.info(`Mengubah kepemilikan server ${serverId}...`);
    progress(options, "resolve", 20, "Menyinkronkan user tujuan.");
    
    let targetUserId = input.userId;
    if (!targetUserId && input.email) {
      const user = await this.getOrCreateUser({
        username: input.username || input.email.split("@")[0] || "user",
        email: input.email,
        password: input.password ?? "auto",
        administrator: false
      });
      targetUserId = "id" in user ? user.id : undefined;
    }
    
    if (!targetUserId) throw new PteroError({ code: "USER_REQUIRED", message: "userId atau email wajib diisi." });
    
    progress(options, "request", 60, "Mengirim update ke panel.");
    
    const raw = await this.application.servers.get(serverId);
    const attrs = getDataAttributes(raw);
    
    await this.application.servers.update(serverId, {
      user: targetUserId,
      name: attrs.name,
      description: attrs.description,
      external_id: attrs.external_id
    });
    
    progress(options, "done", 100, "Kepemilikan server berhasil diubah.");
    return { ok: true, serverId, newOwnerId: targetUserId };
  }

  private async changeServerNestEgg(serverId: number, input: ChangeServerNestEggInput, options?: OperationOptions) {
    this.logger.info(`Mengubah nest/egg server ${serverId}...`);
    progress(options, "resolve", 20, "Menyinkronkan nest dan egg.");
    
    let nestId = input.nestId ?? 5;
    let eggId = input.eggId ?? 15;
    
    if (input.nestName || input.eggName) {
      const resolved = await this.findNestAndEgg(input.nestName, input.eggName, nestId, eggId);
      nestId = resolved.nestId;
      eggId = resolved.eggId;
    }
    
    const rawEgg = await this.application.nests.eggs.get(nestId, eggId);
    const eggAttr = getDataAttributes(rawEgg);
    
    const dockerImages = asObject(eggAttr.docker_images);
    const dockerImage = input.dockerImage || Object.values(dockerImages).find(v => typeof v === "string") as string || String(eggAttr.docker_image ?? "");
    const startup = input.startup || String(eggAttr.startup ?? "");
    
    progress(options, "request", 60, "Mengirim update ke panel.");
    
    await this.application.servers.updateStartup(serverId, {
      egg: eggId,
      startup,
      docker_image: dockerImage
    });
    
    progress(options, "done", 100, "Nest dan egg server berhasil diubah.");
    return { ok: true, serverId, nestId, eggId, dockerImage, startup };
  }

  async getServerDetails(serverId: number) {
    this.logger.info(`Mengambil detail server ${serverId}...`);
    const raw = await this.application.servers.get(serverId);
    const attrs = getDataAttributes(raw);
    
    const nodeId = Number(attrs.node ?? 0);
    const nestId = Number(attrs.nest ?? 0);
    const eggId = Number(attrs.egg ?? 0);
    const userId = Number(attrs.user ?? 0);
    
    let nodeName = "";
    let nestName = "";
    let eggName = "";
    let userName = "";
    let userEmail = "";
    
    try {
      const node = await this.application.nodes.get(nodeId);
      nodeName = String(getDataAttributes(node).name ?? "");
    } catch {}
    
    try {
      const nest = await this.application.nests.get(nestId);
      nestName = String(getDataAttributes(nest).name ?? "");
    } catch {}
    
    try {
      const egg = await this.application.nests.eggs.get(nestId, eggId);
      eggName = String(getDataAttributes(egg).name ?? "");
    } catch {}
    
    try {
      const user = await this.application.users.get(userId);
      const userAttrs = getDataAttributes(user);
      userName = String(userAttrs.username ?? "");
      userEmail = String(userAttrs.email ?? "");
    } catch {}
    
    return {
      id: Number(attrs.id ?? 0),
      identifier: String(attrs.identifier ?? ""),
      uuid: String(attrs.uuid ?? ""),
      name: String(attrs.name ?? ""),
      description: String(attrs.description ?? ""),
      status: String(attrs.status ?? ""),
      suspended: Boolean(attrs.suspended),
      nodeId,
      nodeName,
      nestId,
      nestName,
      eggId,
      eggName,
      userId,
      userName,
      userEmail,
      limits: attrs.limits,
      featureLimits: attrs.feature_limits,
      dockerImage: attrs.container ? String((attrs.container as any).image ?? "") : "",
      startup: attrs.container ? String((attrs.container as any).startup_command ?? "") : "",
      createdAt: String(attrs.created_at ?? ""),
      updatedAt: String(attrs.updated_at ?? ""),
      raw
    };
  }

  async batchServerOperation(serverIds: number[], operation: "suspend" | "unsuspend" | "reinstall" | "delete", options?: { force?: boolean }) {
    this.logger.info(`Batch ${operation} untuk ${serverIds.length} server...`);
    const results: Array<{ serverId: number; ok: boolean; error?: string }> = [];
    
    for (const serverId of serverIds) {
      try {
        if (operation === "suspend") await this.application.servers.suspend(serverId);
        else if (operation === "unsuspend") await this.application.servers.unsuspend(serverId);
        else if (operation === "reinstall") await this.application.servers.reinstall(serverId);
        else if (operation === "delete") await this.application.servers.delete(serverId, options?.force);
        results.push({ serverId, ok: true });
        this.logger.success(`Server ${serverId} ${operation} OK`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ serverId, ok: false, error: msg });
        this.logger.error(`Server ${serverId} ${operation} gagal: ${msg}`);
      }
    }
    
    return { operation, total: serverIds.length, success: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
  }

  async exportAndEmailBackup(serverId: number, targetEmail?: string) {
    this.logger.info(`Memulai auto-backup dan email untuk server ID ${serverId}...`);
    let smtp;
    try {
      smtp = getPteroSmtpConfig();
    } catch (err: any) {
      throw new Error(`Gagal memuat konfigurasi SMTP: ${err.message}`);
    }
    const details = await this.getServerDetails(serverId);
    const serverName = details.name;
    const identifier = details.identifier;
    const userEmail = targetEmail || details.userEmail;
    if (!userEmail) {
      throw new Error(`Email penerima tidak ditemukan untuk server ${serverName} (User ID ${details.userId})`);
    }
    const serverHandle = this.server(identifier);
    const defaultIgnored = ["node_modules", "vendor", "cache", "tmp", "temp", ".git", ".cache", "bower_components"];
    const ignoredStr = defaultIgnored.join("\n");
    this.logger.info(`Membuat backup panel untuk ${serverName}...`);
    const backupRes = await serverHandle.backups.create(`auto-backup-${identifier}-${Date.now()}`, ignoredStr);
    const backupUuid = backupRes.attributes.uuid;
    this.logger.info(`Menunggu backup selesai...`);
    let isSuccessful = false;
    let backupDetail;
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      backupDetail = await serverHandle.backups.get(backupUuid);
      if (backupDetail.attributes.is_successful) {
        isSuccessful = true;
        break;
      }
    }
    if (!isSuccessful) {
      throw new Error(`Pembuatan backup panel untuk ${serverName} timeout atau gagal.`);
    }
    this.logger.info(`Mengunduh file backup...`);
    const downloadRes = await serverHandle.backups.download(backupUuid);
    const downloadUrl = downloadRes.attributes.url;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Gagal mengunduh file backup dari URL: ${downloadUrl}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tempDir = "/tmp";
    const tarPath = `${tempDir}/backup-${backupUuid}.tar.gz`;
    const extractDir = `${tempDir}/extract-${backupUuid}`;
    const zipPath = `${tempDir}/backup-${backupUuid}.zip`;
    fs.writeFileSync(tarPath, buffer);
    this.logger.info(`Mengonversi backup ke format .zip...`);
    try {
      fs.mkdirSync(extractDir, { recursive: true });
      execSync(`tar -xzf ${tarPath} -C ${extractDir}`);
      fs.writeFileSync(`${extractDir}/backup_info.txt`, `Backup created automatically by Akadev Pterodactyl Gateway\nServer Name: ${serverName}\nServer ID: ${identifier}\nBackup Date: ${new Date().toISOString()}`);
      execSync(`cd ${extractDir} && zip -q -r ${zipPath} .`);
    } catch (err: any) {
      cleanupLocalFiles(tarPath, extractDir, zipPath);
      throw new Error(`Gagal mengonversi file backup ke zip: ${err.message}`);
    }
    let zipStats;
    try {
      zipStats = fs.statSync(zipPath);
    } catch (err: any) {
      cleanupLocalFiles(tarPath, extractDir, zipPath);
      throw new Error(`Gagal mengakses file zip yang dihasilkan: ${err.message}`);
    }
    const zipSizeBytes = zipStats.size;
    const zipSizeFormatted = (zipSizeBytes / (1024 * 1024)).toFixed(2) + " MB";
    const zipFileName = `${serverName.replace(/[^a-zA-Z0-9]/g, "_")}_backup.zip`;
    this.logger.info(`Mengirim email backup ke ${userEmail}...`);
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {
          user: smtp.username,
          pass: smtp.password
        },
        tls: {
          rejectUnauthorized: false
        }
      });
      const mailOptions = {
        from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
        to: userEmail,
        subject: `Backup Server Pterodactyl: ${serverName}`,
        text: `Data Backup Server:\nNama Server: ${serverName}\nServer ID: ${identifier}\nNama File: ${zipFileName}\nUkuran: ${zipSizeFormatted}\nFormat: ZIP Archive`,
        html: `<h3>Data Backup Server</h3>\n<table border="1" cellpadding="5" style="border-collapse: collapse;">\n  <tr><td><b>Nama Server</b></td><td>${serverName}</td></tr>\n  <tr><td><b>Server ID</b></td><td>${identifier}</td></tr>\n  <tr><td><b>Nama File</b></td><td>${zipFileName}</td></tr>\n  <tr><td><b>Ukuran</b></td><td>${zipSizeFormatted}</td></tr>\n  <tr><td><b>Format</b></td><td>ZIP Archive</td></tr>\n</table>`,
        attachments: [
          {
            filename: zipFileName,
            path: zipPath
          }
        ]
      };
      await transporter.sendMail(mailOptions);
      this.logger.success(`Email backup server ${serverName} berhasil terkirim ke ${userEmail}.`);
    } catch (err: any) {
      cleanupLocalFiles(tarPath, extractDir, zipPath);
      throw new Error(`Gagal mengirim email SMTP: ${err.message}`);
    }
    cleanupLocalFiles(tarPath, extractDir, zipPath);
    try {
      this.logger.info(`Menghapus file backup di panel...`);
      await serverHandle.backups.delete(backupUuid);
    } catch (err: any) {
      this.logger.warn(`Gagal menghapus backup di panel: ${err.message}`);
    }
    return {
      success: true,
      serverName,
      email: userEmail,
      fileName: zipFileName,
      size: zipSizeFormatted
    };
  }

  async backupAndEmailUserServers(userId: number) {
    this.logger.info(`Mencari server untuk User ID ${userId}...`);
    const listRes = await this.application.servers.list();
    const data = getCollection(listRes);
    const userServers = data.filter(server => {
      const attrs = getDataAttributes(server);
      return Number(attrs.user) === userId;
    });
    if (userServers.length === 0) {
      throw new Error(`Tidak ditemukan server untuk User ID ${userId}`);
    }
    this.logger.info(`Ditemukan ${userServers.length} server untuk User ID ${userId}. Memulai proses pengiriman backup terpisah...`);
    const results = [];
    for (const server of userServers) {
      const attrs = getDataAttributes(server);
      const serverId = Number(attrs.id);
      try {
        const res = await this.exportAndEmailBackup(serverId);
        results.push({ serverId, success: true, details: res });
      } catch (err: any) {
        this.logger.error(`Gagal mencadangkan server ID ${serverId}: ${err.message}`);
        results.push({ serverId, success: false, error: err.message });
      }
    }
    return results;
  }

  private async searchServers(query: string) {
    const raw = await this.request<any>({ api: "application", path: `/servers?filter[name]=${encodeURIComponent(query)}` }).catch(() => undefined);
    const data = getCollection(raw);
    return data.map(item => {
      const attributes = getDataAttributes(item);
      return { id: Number(attributes.id ?? 0), name: String(attributes.name ?? ""), identifier: String(attributes.identifier ?? ""), raw: item };
    });
  }

  private async findUserByEmail(email: string) {
    const raw = await this.request<any>({ api: "application", path: `/users?filter[email]=${encodeURIComponent(email)}` }).catch(() => undefined);
    const data = getCollection(raw);
    const first = data[0];
    if (!first) return undefined;
    const attributes = getDataAttributes(first);
    return { id: Number(attributes.id ?? 0), username: String(attributes.username ?? ""), email: String(attributes.email ?? email), raw: first };
  }

  private async createUserSmart(input: CreateUserSmartInput, options?: OperationOptions) {
    this.logger.info(`Membuat user smart: ${input.email}`);
    progress(options, "validate", 10, "Memvalidasi user.");
    const built = buildUserPayload(input);
    if (options?.dryRun) return { dryRun: true, payload: built.payload, generatedPassword: built.generatedPassword };
    progress(options, "request", 70, "Membuat user di Pterodactyl.");
    const raw = await this.application.users.create(built.payload);
    this.logger.success(`User berhasil dibuat: ${input.email}`);
    progress(options, "done", 100, "User berhasil dibuat.");
    return normalizeUserResponse(raw, built.generatedPassword);
  }

  private async getOrCreateUser(input: CreateUserSmartInput, options?: OperationOptions) {
    const found = await this.findUserByEmail(input.email);
    if (found) {
      this.logger.info(`User ditemukan: ${input.email}`);
      return { ...found, created: false };
    }
    return { ...(await this.createUserSmart(input, options)), created: true };
  }

  private async resolveUserForServer(input: CreateSmartServerInput) {
    if (input.userId) return { id: input.userId, created: false };
    if (!input.email) throw new PteroError({ code: "EMAIL_REQUIRED", message: "email wajib diisi jika userId kosong." });
    const found = await this.findUserByEmail(input.email);
    if (found) return { id: found.id, email: found.email, username: found.username, created: false };
    if (!input.autoCreateUser) throw ErrorFactory.userNotFound(input.email);
    const user = await this.createUserSmart({ username: input.username || input.email.split("@")[0]!, email: input.email, password: input.password ?? "auto", administrator: input.administrator ?? false });
    if ("dryRun" in user) throw new PteroError({ code: "INTERNAL_DRY_RUN_USER", message: "Dry run user tidak valid pada flow create server." });
    return { id: user.id, email: user.email, username: user.username, created: true };
  }

  private async previewCreateServer(input: CreateSmartServerInput, options?: OperationOptions) {
    this.logger.info(`Menyiapkan preview server: ${input.name}`);
    progress(options, "validate", 5, "Memvalidasi input server.");
    const specsInput = validateCreateInput(input, input.specs ?? (input.preset ? this.presets[input.preset] : undefined));
    const specs = normalizeSpecs(specsInput);
    progress(options, "user", 15, "Menyinkronkan user.");
    const user = await this.resolveUserForServer(input);
    progress(options, "node", 30, "Mengambil data node.");
    const rawNode = await this.application.nodes.get(input.nodeId);
    progress(options, "egg", 45, "Mengambil data nest dan egg.");
    const rawNest = await this.application.nests.get(input.nestId);
    const rawEgg = await this.application.nests.eggs.get(input.nestId, input.eggId);
    progress(options, "allocation", 60, "Mencari allocation kosong.");
    const allocationCount = specs.featureLimits.allocations || 1;
    const rawAllocations = await this.application.nodes.allocations.list(input.nodeId);
    let allocation;
    try {
      allocation = selectAllocations(rawAllocations, allocationCount, input.allocation ?? "auto");
    } catch (error) {
      if (error instanceof PteroError && error.code === "NO_FREE_ALLOCATION") throw ErrorFactory.noFreeAllocation(input.nodeId);
      throw error;
    }
    progress(options, "payload", 80, "Membangun payload server.");
    const payload = buildServerPayload(input, { userId: user.id, rawEgg, allocation, specs });
    const nodeAttr = getDataAttributes(rawNode);
    const nestAttr = getDataAttributes(rawNest);
    const eggAttr = getDataAttributes(rawEgg);
    const preview: PreviewCreateServer = {
      ok: true,
      user,
      node: { id: input.nodeId, name: typeof nodeAttr.name === "string" ? nodeAttr.name : undefined, raw: rawNode },
      nest: { id: input.nestId, name: typeof nestAttr.name === "string" ? nestAttr.name : undefined, raw: rawNest },
      egg: { id: input.eggId, name: typeof eggAttr.name === "string" ? (eggAttr.name as string) : undefined, raw: rawEgg },
      dockerImage: String(payload.docker_image),
      startup: String(payload.startup),
      environment: payload.environment as Record<string, string>,
      allocation,
      limits: payload.limits as Record<string, unknown>,
      featureLimits: specs.featureLimits,
      payload
    };
    progress(options, "done", 100, "Preview server selesai.");
    return preview;
  }

  private async createServerSmart(input: CreateSmartServerInput, options?: OperationOptions): Promise<NormalizedServer | { dryRun: true; preview: unknown; payload: Record<string, unknown> }> {
    const preview = await this.previewCreateServer(input, options);
    if (options?.dryRun) return { dryRun: true, preview, payload: preview.payload };
    this.logger.info(`Deploying server: ${input.name}`);
    progress(options, "request", 90, "Membuat server di Pterodactyl.");
    const raw = await this.application.servers.create(preview.payload);
    this.logger.success(`Server berhasil di-deploy: ${input.name}`);
    progress(options, "done", 100, "Server berhasil dibuat.");
    const attributes = getDataAttributes(raw);
    return { id: typeof attributes.id === "number" ? attributes.id : Number(attributes.id ?? 0) || undefined, identifier: typeof attributes.identifier === "string" ? attributes.identifier : undefined, uuid: typeof attributes.uuid === "string" ? attributes.uuid : undefined, name: typeof attributes.name === "string" ? attributes.name : undefined, raw };
  }

  private async checkApplicationKey() {
    if (!this.applicationKey) return { provided: false, valid: false, message: "PTLA kosong." };
    try {
      await this.application.users.list();
      return { provided: true, valid: true, message: "PTLA valid." };
    } catch (error) {
      return { provided: true, valid: false, message: error instanceof Error ? error.message : "PTLA tidak valid." };
    }
  }

  private async checkClientKey() {
    if (!this.clientKey) return { provided: false, valid: false, message: "PTLC kosong." };
    try {
      await this.client.account.get();
      return { provided: true, valid: true, message: "PTLC valid." };
    } catch (error) {
      return { provided: true, valid: false, message: error instanceof Error ? error.message : "PTLC tidak valid." };
    }
  }

  private resolveMode(applicationValid: boolean, clientValid: boolean): PteroMode {
    if (applicationValid && clientValid) return "full";
    if (applicationValid) return "admin";
    if (clientValid) return "client";
    if (!this.applicationKey && !this.clientKey) return "raw";
    return "invalid";
  }
}

export class PteroServerHandle {
  private gateway: PteroGateway;
  private identifier: string;

  constructor(gateway: PteroGateway, identifier: string) {
    this.gateway = gateway;
    this.identifier = identifier;
  }

  get files() {
    return {
      list: (directory = "/") => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/files/list?directory=${encodeURIComponent(directory)}` }),
      read: (file: string) => this.gateway.request<string>({ api: "client", path: `/servers/${this.identifier}/files/contents?file=${encodeURIComponent(file)}`, responseType: "text" }),
      write: (file: string, content: string) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/files/write?file=${encodeURIComponent(file)}`, body: content, contentType: "text" }),
      delete: (root: string, files: string[]) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/files/delete`, body: { root, files } }),
      mkdir: (root: string, name: string) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/files/create-folder`, body: { root, name } }),
      rename: (root: string, files: Array<{ from: string; to: string }>) => this.gateway.request<any>({ api: "client", method: "PUT", path: `/servers/${this.identifier}/files/rename`, body: { root, files } }),
      compress: (root: string, files: string[]) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/files/compress`, body: { root, files } }),
      decompress: (root: string, file: string) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/files/decompress`, body: { root, file } }),
      download: (file: string) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/files/pull?file=${encodeURIComponent(file)}` }),
      json: {
        read: async <T = unknown>(file: string) => JSON.parse(await this.files.read(file)) as T,
        write: (file: string, data: unknown, space = 2) => this.files.write(file, JSON.stringify(data, null, space))
      }
    };
  }

  get startup() {
    return {
      get: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/startup` }),
      set: async (env: string, value: string | number | boolean) => {
        return this.gateway.request<any>({ api: "client", method: "PUT", path: `/servers/${this.identifier}/startup/variable`, body: { key: String(env), value: String(value) } });
      }
    };
  }

  get network() {
    return {
      list: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/network/allocations` }),
      assign: () => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/network/allocations` }),
      setNote: (allocationId: number, note: string) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/network/allocations/${allocationId}`, body: { notes: note } }),
      setPrimary: (allocationId: number) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/network/allocations/${allocationId}/primary` }),
      delete: (allocationId: number) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/network/allocations/${allocationId}` })
    };
  }

  get databases() {
    return {
      list: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/databases` }),
      create: (database: string, remote = "%") => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/databases`, body: { database, remote } }),
      rotatePassword: (databaseId: string) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/databases/${databaseId}/rotate-password` }),
      delete: (databaseId: string) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/databases/${databaseId}` })
    };
  }

  get backups() {
    return {
      list: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups` }),
      create: (name?: string, ignored?: string[] | string, isLocked = false) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/backups`, body: { name, ignored: Array.isArray(ignored) ? ignored.join("\n") : ignored, is_locked: isLocked } }),
      get: (backupId: string) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups/${backupId}` }),
      download: (backupId: string) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups/${backupId}/download` }),
      delete: (backupId: string) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/backups/${backupId}` })
    };
  }

  get websocket() {
    return {
      auth: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/websocket` }),
      create: () => new PteroWebSocket(this.gateway, this.identifier)
    };
  }

  resources() {
    return this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/resources` });
  }

  power(signal: ServerPowerSignal) {
    this.gateway.logger.info(`Mengirim sinyal ${signal} ke server ${this.identifier}`);
    return this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/power`, body: { signal } });
  }

  command(command: string) {
    this.gateway.logger.info(`Mengirim command ke server ${this.identifier}: ${command}`);
    return this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/command`, body: { command } });
  }

  createScheduleBuilder() {
    return new PteroScheduleBuilder(this);
  }
}

export class PteroScheduleBuilder {
  private handle: any;
  private name: string = "";
  private isActive: boolean = true;
  private cronConfig = {
    minute: "*",
    hour: "*",
    day_of_month: "*",
    month: "*",
    day_of_week: "*"
  };
  private onlyWhenOnline: boolean = false;
  private tasksList: Array<{
    action: "power" | "command" | "backup";
    payload: string;
    timeOffset: number;
    continueOnFailure: boolean;
  }> = [];

  constructor(serverHandle: any) {
    this.handle = serverHandle;
  }

  setName(name: string) {
    this.name = name;
    return this;
  }

  setActive(active: boolean) {
    this.isActive = active;
    return this;
  }

  setCron(cronStr: string) {
    const parts = cronStr.split(/\s+/);
    if (parts.length === 5) {
      this.cronConfig = {
        minute: parts[0]!,
        hour: parts[1]!,
        day_of_month: parts[2]!,
        month: parts[3]!,
        day_of_week: parts[4]!
      };
    }
    return this;
  }

  setCronDetails(minute: string, hour: string, dayOfMonth: string, month: string, dayOfWeek: string) {
    this.cronConfig = { minute, hour, day_of_month: dayOfMonth, month, day_of_week: dayOfWeek };
    return this;
  }

  setOnlyWhenOnline(value: boolean) {
    this.onlyWhenOnline = value;
    return this;
  }

  addTask(action: "power" | "command" | "backup", payload: string, timeOffset = 0, continueOnFailure = false) {
    this.tasksList.push({ action, payload, timeOffset, continueOnFailure });
    return this;
  }

  async save() {
    if (!this.name) throw new Error("Schedule name is required.");
    const schedulePayload = {
      name: this.name,
      is_active: this.isActive,
      only_when_online: this.onlyWhenOnline,
      minute: this.cronConfig.minute,
      hour: this.cronConfig.hour,
      day_of_month: this.cronConfig.day_of_month,
      month: this.cronConfig.month,
      day_of_week: this.cronConfig.day_of_week
    };
    const scheduleRes = await this.handle.gateway.request({
      api: "client",
      method: "POST",
      path: `/servers/${this.handle.identifier}/schedules`,
      body: schedulePayload
    });
    const scheduleId = (scheduleRes as any).attributes.id;
    for (let i = 0; i < this.tasksList.length; i++) {
      const task = this.tasksList[i]!;
      await this.handle.gateway.request({
        api: "client",
        method: "POST",
        path: `/servers/${this.handle.identifier}/schedules/${scheduleId}/tasks`,
        body: {
          sequence_id: i + 1,
          action: task.action,
          payload: task.payload,
          time_offset: task.timeOffset,
          continue_on_failure: task.continueOnFailure
        }
      });
    }
    return scheduleRes;
  }
}

function getPteroSmtpConfig() {
  const envPath = "/var/www/pterodactyl/.env";
  if (!fs.existsSync(envPath)) {
    throw new Error("Pterodactyl environment file tidak ditemukan di /var/www/pterodactyl/.env");
  }
  const content = fs.readFileSync(envPath, "utf-8");
  const config: Record<string, string> = {};
  content.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const parts = trimmed.split("=");
      const key = parts[0]!.trim();
      let val = parts.slice(1).join("=").trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      config[key] = val;
    }
  });
  const host = config.MAIL_HOST;
  const port = config.MAIL_PORT;
  const username = config.MAIL_USERNAME;
  const password = config.MAIL_PASSWORD;
  const encryption = config.MAIL_ENCRYPTION;
  const fromAddress = config.MAIL_FROM_ADDRESS;
  const fromName = config.MAIL_FROM_NAME || "Pterodactyl Panel";
  if (!host || !port || !username || !password) {
    throw new Error("SMTP configuration tidak lengkap di Pterodactyl .env");
  }
  return { host, port: Number(port), username, password, encryption, fromAddress, fromName };
}

function cleanupLocalFiles(tarPath: string, extractDir: string, zipPath: string) {
  try {
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  } catch {}
}
