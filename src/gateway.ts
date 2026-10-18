import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { closeEmailTransports, normalizeSmtpConfig, sendEmailMessage, smtpFromEnv, verifySmtp } from "./email.js";
import { ErrorFactory, PteroError } from "./errors.js";
import { HttpCore } from "./http.js";
import { PteroLogger } from "./logger.js";
import {
  analyzeAllocations,
  binPack,
  capacityReport,
  forecastCapacity,
  normalizeSpecs as normalizePlannerSpecs,
  parseAllocations,
  planPlacement,
  selectAllocations as selectPlannerAllocations
} from "./planner.js";
import { PteroServerHandle } from "./server.js";
import {
  buildServerPayload,
  buildUserPayload,
  normalizeSpecs,
  normalizeUserResponse,
  progress,
  selectAllocations,
  validateCreateInput
} from "./smart.js";
import {
  BackupExportOptions,
  BackupExportResult,
  BulkOptions,
  BulkResult,
  CapacityForecast,
  ChangeServerNestEggInput,
  ChangeServerOwnershipInput,
  ConnectResult,
  CreateSmartServerInput,
  CreateUserSmartInput,
  DoctorReport,
  GatewayMetrics,
  NodeCapacity,
  NormalizedServer,
  NormalizedUser,
  OperationOptions,
  PanelCapabilities,
  PlacementPlan,
  PlacementStrategy,
  PteroConfig,
  PteroMode,
  SendEmailOptions,
  ServerSpecsInput,
  SmtpConfig,
  UpdateServerSpecsInput,
  WaitOptions
} from "./types.js";
import {
  asObject,
  ensurePositiveInteger,
  formatBytes,
  getCollection,
  getDataAttributes,
  getPagination,
  maskSecret,
  normalizeDomain,
  parseCpu,
  parseSizeToMiB,
  sleep,
  toBoolean,
  validateEmail
} from "./utils.js";
import { USER_AGENT, VERSION } from "./version.js";
import { PteroWebSocket } from "./websocket.js";

const execFileAsync = promisify(execFile);
const DEFAULT_IGNORED = ["node_modules", "vendor", "cache", "tmp", "temp", ".git", ".cache", "bower_components"];

export class PteroGateway {
  readonly domain: string;
  readonly applicationKey?: string;
  readonly clientKey?: string;
  readonly timeout: number;
  readonly userAgent: string;
  readonly safeMode: boolean;
  readonly presets: NonNullable<PteroConfig["presets"]>;
  readonly logger: PteroLogger;
  readonly version = VERSION;
  private readonly http: HttpCore;
  private capabilitiesCache?: PanelCapabilities;
  private readonly defaultNodeId?: number;
  private readonly defaultNestId: number;
  private readonly defaultEggId: number;
  private readonly defaultNodeStrategy: PlacementStrategy;

  constructor(config: PteroConfig) {
    const domain = config.domain ?? config.panelUrl;
    if (!domain) throw ErrorFactory.domainRequired();
    this.domain = normalizeDomain(domain);
    this.applicationKey = config.ptla ?? config.applicationKey;
    this.clientKey = config.ptlc ?? config.clientKey;
    this.timeout = Math.max(1000, config.timeout ?? 20000);
    this.userAgent = config.userAgent ?? USER_AGENT;
    this.safeMode = config.safeMode ?? true;
    this.defaultNodeId = config.defaultNodeId;
    this.defaultNestId = config.defaultNestId ?? 5;
    this.defaultEggId = config.defaultEggId ?? 15;
    this.defaultNodeStrategy = config.nodeStrategy ?? "balanced";
    this.presets = config.presets ?? {
      mini: { memory: "512MB", disk: "1GB", cpu: 50, databases: 0, allocations: 1, backups: 0 },
      basic: { memory: "1GB", disk: "2GB", cpu: 100, databases: 1, allocations: 1, backups: 1 },
      standard: { memory: "2GB", disk: "5GB", cpu: 200, databases: 2, allocations: 1, backups: 2 },
      premium: { memory: "4GB", disk: "10GB", cpu: 400, databases: 5, allocations: 1, backups: 5 },
      unlimited: { memory: 0, disk: 0, cpu: 0, databases: 10, allocations: 1, backups: 10 }
    };
    this.logger = new PteroLogger({
      enabled: config.debug ?? false,
      level: config.debug ? "debug" : "silent",
      prefix: "ptero"
    });
    this.http = new HttpCore({
      domain: this.domain,
      applicationKey: this.applicationKey,
      clientKey: this.clientKey,
      timeout: this.timeout,
      userAgent: this.userAgent,
      fetcher: config.fetcher ?? fetch,
      debug: config.debug,
      retry: config.retry,
      rateLimit: config.rateLimit,
      cache: config.cache,
      circuitBreaker: config.circuitBreaker,
      hooks: config.hooks
    });
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PteroGateway {
    return new PteroGateway({
      domain: env.PTERO_DOMAIN ?? env.PTERO_PANEL_URL,
      ptla: env.PTERO_PTLA ?? env.PTERO_APPLICATION_KEY,
      ptlc: env.PTERO_PTLC ?? env.PTERO_CLIENT_KEY,
      defaultNodeId: env.PTERO_NODE_ID ? Number(env.PTERO_NODE_ID) : undefined,
      defaultNestId: env.PTERO_NEST_ID ? Number(env.PTERO_NEST_ID) : undefined,
      defaultEggId: env.PTERO_EGG_ID ? Number(env.PTERO_EGG_ID) : undefined,
      safeMode: env.PTERO_SAFE_MODE === undefined ? true : env.PTERO_SAFE_MODE !== "false",
      debug: env.PTERO_DEBUG === "true"
    });
  }

  get application() {
    return {
      users: {
        list: (page = 1, filters?: Record<string, string>) =>
          this.request<unknown>({ api: "application", path: "/users", query: { page, ...filters } }),
        get: (id: number) => this.request<unknown>({ api: "application", path: `/users/${ensurePositiveInteger(id, "userId")}` }),
        create: (data: Record<string, unknown>) => this.request<unknown>({ api: "application", method: "POST", path: "/users", body: data }),
        update: (id: number, data: Record<string, unknown>) =>
          this.request<unknown>({ api: "application", method: "PATCH", path: `/users/${ensurePositiveInteger(id, "userId")}`, body: data }),
        delete: (id: number, confirm?: boolean) => this.deleteApplicationUser(id, confirm ?? false),
        find: (email: string) => this.findUserByEmail(email),
        findById: (id: number) => this.application.users.get(id),
        all: () => this.listAllPages<unknown>(page => this.application.users.list(page))
      },
      nodes: {
        list: (page = 1) => this.request<unknown>({ api: "application", path: "/nodes", query: { page } }),
        get: (id: number) => this.request<unknown>({ api: "application", path: `/nodes/${ensurePositiveInteger(id, "nodeId")}` }),
        config: (id: number) => this.request<unknown>({ api: "application", path: `/nodes/${ensurePositiveInteger(id, "nodeId")}/configuration` }),
        all: () => this.listAllPages<unknown>(page => this.application.nodes.list(page)),
        allocations: {
          list: (nodeId: number, page = 1) =>
            this.request<unknown>({ api: "application", path: `/nodes/${ensurePositiveInteger(nodeId, "nodeId")}/allocations`, query: { page } }),
          create: (nodeId: number, data: Record<string, unknown>) =>
            this.request<unknown>({ api: "application", method: "POST", path: `/nodes/${ensurePositiveInteger(nodeId, "nodeId")}/allocations`, body: data }),
          delete: (nodeId: number, id: number, confirm?: boolean) => this.deleteApplicationAllocation(nodeId, id, confirm ?? false),
          all: (nodeId: number) => this.listAllPages<unknown>(page => this.application.nodes.allocations.list(nodeId, page))
        }
      },
      servers: {
        list: (page = 1, filters?: Record<string, string>) =>
          this.request<unknown>({ api: "application", path: "/servers", query: { page, ...filters } }),
        get: (id: number) => this.request<unknown>({ api: "application", path: `/servers/${ensurePositiveInteger(id, "serverId")}` }),
        find: (query: string) => this.searchServers(query),
        create: (data: Record<string, unknown>) => this.request<unknown>({ api: "application", method: "POST", path: "/servers", body: data }),
        update: (id: number, data: Record<string, unknown>) =>
          this.request<unknown>({ api: "application", method: "PATCH", path: `/servers/${ensurePositiveInteger(id, "serverId")}/details`, body: data }),
        updateBuild: (id: number, data: Record<string, unknown>) =>
          this.request<unknown>({ api: "application", method: "PATCH", path: `/servers/${ensurePositiveInteger(id, "serverId")}/build`, body: data }),
        updateStartup: (id: number, data: Record<string, unknown>) =>
          this.request<unknown>({ api: "application", method: "PATCH", path: `/servers/${ensurePositiveInteger(id, "serverId")}/startup`, body: data }),
        suspend: (id: number) =>
          this.request<unknown>({ api: "application", method: "POST", path: `/servers/${ensurePositiveInteger(id, "serverId")}/suspend` }),
        unsuspend: (id: number) =>
          this.request<unknown>({ api: "application", method: "POST", path: `/servers/${ensurePositiveInteger(id, "serverId")}/unsuspend` }),
        reinstall: (id: number) =>
          this.request<unknown>({ api: "application", method: "POST", path: `/servers/${ensurePositiveInteger(id, "serverId")}/reinstall` }),
        delete: (id: number, confirmOrOptions?: boolean | { confirm?: boolean; force?: boolean }) =>
          this.deleteApplicationServer(id, confirmOrOptions),
        all: (filters?: Record<string, string>) => this.listAllPages<unknown>(page => this.application.servers.list(page, filters)),
        findByUser: (userId: number) => this.findServersByUser(userId)
      },
      locations: {
        list: (page = 1) => this.request<unknown>({ api: "application", path: "/locations", query: { page } }),
        get: (id: number) => this.request<unknown>({ api: "application", path: `/locations/${ensurePositiveInteger(id, "locationId")}` }),
        all: () => this.listAllPages<unknown>(page => this.application.locations.list(page))
      },
      nests: {
        list: (page = 1) => this.request<unknown>({ api: "application", path: "/nests", query: { page } }),
        get: (id: number) => this.request<unknown>({ api: "application", path: `/nests/${ensurePositiveInteger(id, "nestId")}` }),
        find: (name: string) => this.findNestByName(name),
        all: () => this.listAllPages<unknown>(page => this.application.nests.list(page)),
        eggs: {
          list: (nestId: number) => this.listEggs(nestId),
          get: (nestId: number, eggId: number, includeVariables = true) => this.getEgg(nestId, eggId, includeVariables),
          find: (nestId: number, name: string) => this.findEggByName(nestId, name)
        }
      },
      eggs: {
        list: () => this.listEggs(),
        get: (eggId: number, includeVariables = true) => this.getEggById(eggId, includeVariables),
        find: (name: string) => this.findEggByName(undefined, name),
        runtime: (eggId: number) => this.eggRuntime(eggId)
      }
    };
  }

  get client() {
    return {
      account: {
        get: () => this.request<unknown>({ api: "client", path: "/account" }),
        twoFactor: {
          get: () => this.request<unknown>({ api: "client", path: "/account/two-factor" }),
          enable: (code: string) => this.request<unknown>({ api: "client", method: "POST", path: "/account/two-factor", body: { code } }),
          disable: (password: string) => this.request<unknown>({ api: "client", method: "DELETE", path: "/account/two-factor", body: { password }, retryUnsafe: false })
        },
        apiKeys: {
          list: () => this.request<unknown>({ api: "client", path: "/account/api-keys" }),
          create: (description: string, allowedIps: string[] = []) =>
            this.request<unknown>({ api: "client", method: "POST", path: "/account/api-keys", body: { description, allowed_ips: allowedIps } }),
          delete: (identifier: string) =>
            this.request<unknown>({ api: "client", method: "DELETE", path: `/account/api-keys/${identifier}` })
        }
      },
      servers: {
        list: (page = 1) => this.request<unknown>({ api: "client", path: "/", query: { page } }),
        all: () => this.listAllPages<unknown>(page => this.client.servers.list(page)),
        get: (identifier: string) => this.server(identifier).details(),
        handle: (identifier: string) => this.server(identifier)
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
        createFromPreset: (preset: string, input: Omit<CreateSmartServerInput, "preset" | "specs">, options?: OperationOptions) =>
          this.createServerSmart({ ...input, preset }, options),
        updateSpecs: (serverId: number, input: UpdateServerSpecsInput, options?: OperationOptions) =>
          this.updateServerSpecs(serverId, input, options),
        changeOwnership: (serverId: number, input: ChangeServerOwnershipInput, options?: OperationOptions) =>
          this.changeServerOwnership(serverId, input, options),
        changeNestEgg: (serverId: number, input: ChangeServerNestEggInput, options?: OperationOptions) =>
          this.changeServerNestEgg(serverId, input, options),
        plan: (input: ServerSpecsInput, options?: { nodeIds?: number[]; strategy?: PlacementStrategy; reservePercent?: number }) =>
          this.planServer(input, options)
      }
    };
  }

  get email() {
    return {
      send: (options: SendEmailOptions) => sendEmailMessage(options),
      sendToUser: (userId: number, options: Omit<SendEmailOptions, "to">) => this.sendEmailToUser(userId, options),
      broadcast: (options: Omit<SendEmailOptions, "to">) => this.broadcastEmail(options),
      verify: (smtp: SmtpConfig) => verifySmtp(smtp),
      fromEnv: (env: NodeJS.ProcessEnv = process.env) => smtpFromEnv(env)
    };
  }

  server(identifier: string): PteroServerHandle {
    return new PteroServerHandle(this, identifier);
  }

  request<T = unknown>(options: Parameters<HttpCore["request"]>[0]): Promise<T> {
    return this.http.request<T>(options);
  }

  async connect(): Promise<ConnectResult> {
    const started = Date.now();
    this.logger.info(`Menghubungkan ke ${this.domain}.`);
    const [application, client] = await Promise.all([this.checkApplicationKey(), this.checkClientKey()]);
    const mode = this.resolveMode(application.valid, client.valid);
    const latency = Date.now() - started;
    if (mode === "invalid") this.logger.error("Koneksi panel gagal. Periksa domain dan API key.");
    else this.logger.success(`Terhubung dalam mode ${mode} (${latency}ms).`);
    return { ok: mode !== "invalid", mode, domain: this.domain, latency, application, client };
  }

  health(): Promise<ConnectResult> {
    return this.connect();
  }

  async capabilities(): Promise<PanelCapabilities> {
    if (this.capabilitiesCache) return this.capabilitiesCache;
    const [nests, eggs, applicationApi, clientApi] = await Promise.all([
      this.probe("/nests", "application"),
      this.probe("/eggs", "application"),
      this.probe("/users?page=1", "application"),
      this.probe("/account", "client")
    ]);
    this.capabilitiesCache = { nests, eggs, applicationApi, clientApi };
    return this.capabilitiesCache;
  }

  private async probe(path: string, api: "application" | "client"): Promise<boolean> {
    try {
      await this.request<unknown>({ api, path, cache: false, retryUnsafe: false });
      return true;
    } catch (error) {
      if (error instanceof PteroError && (error.status === 404 || error.code === "NOT_FOUND")) return false;
      return false;
    }
  }

  async doctor(): Promise<DoctorReport> {
    const connect = await this.connect();
    const capabilities = await this.capabilities();
    const checks = [
      { name: "domain", ok: true, message: this.domain },
      { name: "ptla_provided", ok: Boolean(this.applicationKey), message: this.applicationKey ? maskSecret(this.applicationKey) : "PTLA kosong" },
      { name: "ptlc_provided", ok: Boolean(this.clientKey), message: this.clientKey ? maskSecret(this.clientKey) : "PTLC kosong" },
      {
        name: "application_api",
        ok: connect.application.valid,
        message: connect.application.message,
        fix: "Periksa PTLA dan permission Application API."
      },
      { name: "client_api", ok: connect.client.valid, message: connect.client.message, fix: "Periksa PTLC dan permission Client API." },
      {
        name: "nests_endpoint",
        ok: capabilities.nests,
        message: capabilities.nests ? "Tersedia" : "Tidak tersedia; gunakan egg ID langsung atau endpoint /eggs",
        fix: capabilities.nests ? undefined : "Gunakan defaultNestId atau varian endpoint eggs"
      },
      {
        name: "eggs_endpoint",
        ok: capabilities.eggs || capabilities.nests,
        message: capabilities.eggs ? "Tersedia endpoint /eggs" : capabilities.nests ? "Tersedia melalui /nests" : "Tidak tersedia",
        fix: capabilities.eggs || capabilities.nests ? undefined : "Periksa versi panel"
      }
    ];
    return { ok: connect.ok && (capabilities.eggs || capabilities.nests), mode: connect.mode, checks, capabilities };
  }

  async listNests() {
    return this.application.nests.all();
  }

  async listEggs(nestId?: number) {
    const capabilities = await this.capabilities();
    if (nestId && capabilities.nests) {
      try {
        const items = await this.listAllPages<unknown>(page => this.request<unknown>({ api: "application", path: `/nests/${nestId}/eggs`, query: { page } }));
        if (items.length > 0) return items;
      } catch (error) {
        if (!(error instanceof PteroError)) throw error;
      }
    }
    if (capabilities.eggs) {
      return this.listAllPages<unknown>(page => this.request<unknown>({ api: "application", path: "/eggs", query: { page } }));
    }
    if (capabilities.nests && nestId) {
      return this.listAllPages<unknown>(page => this.request<unknown>({ api: "application", path: `/nests/${nestId}/eggs`, query: { page } }));
    }
    throw ErrorFactory.unsupported("Daftar egg");
  }

  async getEgg(nestId: number, eggId: number, includeVariables = true): Promise<unknown> {
    const capabilities = await this.capabilities();
    if (capabilities.nests) {
      try {
        return await this.request<unknown>({
          api: "application",
          path: `/nests/${nestId}/eggs/${eggId}${includeVariables ? "?include=variables" : ""}`,
          cache: false
        });
      } catch (error) {
        if (!(error instanceof PteroError) || error.status !== 404) throw error;
      }
    }
    if (capabilities.eggs) {
      return this.request<unknown>({
        api: "application",
        path: `/eggs/${eggId}${includeVariables ? "?include=variables" : ""}`,
        cache: false
      });
    }
    throw ErrorFactory.unsupported(`Egg ${eggId} pada nest ${nestId}`);
  }

  async getEggById(eggId: number, includeVariables = true): Promise<unknown> {
    const capabilities = await this.capabilities();
    if (capabilities.eggs) {
      return this.request<unknown>({
        api: "application",
        path: `/eggs/${eggId}${includeVariables ? "?include=variables" : ""}`,
        cache: false
      });
    }
    if (capabilities.nests) {
      const nests = await this.listNests();
      for (const nest of nests) {
        const nestId = Number(getDataAttributes(nest).id ?? 0);
        if (!nestId) continue;
        try {
          return await this.getEgg(nestId, eggId, includeVariables);
        } catch {
          continue;
        }
      }
    }
    throw ErrorFactory.unsupported(`Egg ${eggId}`);
  }

  async eggRuntime(eggId: number) {
    const attributes = getDataAttributes(await this.getEggById(eggId, true));
    const config = asObject(attributes.config);
    const startup = asObject(config.startup);
    const dockerImages = asObject(attributes.docker_images);
    const variables = getCollection(asObject(asObject(attributes.relationships).variables)).map(variable => {
      const item = getDataAttributes(variable);
      return {
        env: String(item.env_variable ?? ""),
        name: String(item.name ?? ""),
        defaultValue: item.default_value === undefined || item.default_value === null ? "" : String(item.default_value),
        required: String(item.rules ?? "").includes("required")
      };
    }).filter(variable => Boolean(variable.env));
    return {
      id: Number(attributes.id ?? eggId),
      name: String(attributes.name ?? ""),
      startupCommand: String(attributes.startup ?? ""),
      startupDone: typeof startup.done === "string" && startup.done.trim() ? startup.done : undefined,
      stopCommand: typeof config.stop === "string" ? config.stop : undefined,
      dockerImages: Object.values(dockerImages).filter((value): value is string => typeof value === "string"),
      variables
    };
  }

  async findNestByName(name: string) {
    this.logger.info(`Mencari nest ${name}.`);
    let data: unknown[];
    try {
      data = await this.listNests();
    } catch (error) {
      throw new PteroError({
        code: "NESTS_ENDPOINT_UNAVAILABLE",
        message: "Panel tidak menyediakan endpoint nests.",
        hint: "Gunakan egg ID langsung. Nest default dapat diatur melalui defaultNestId.",
        cause: error
      });
    }
    const match = data.find(item => String(getDataAttributes(item).name ?? "").toLowerCase() === name.toLowerCase());
    if (match) {
      const attributes = getDataAttributes(match);
      return {
        id: Number(attributes.id ?? 0),
        name: String(attributes.name ?? ""),
        description: String(attributes.description ?? ""),
        raw: match
      };
    }
    const available = data.map(item => `ID ${getDataAttributes(item).id} | ${getDataAttributes(item).name}`).join("\n");
    throw new PteroError({
      code: "NEST_NOT_FOUND",
      message: `Nest dengan nama '${name}' tidak ditemukan.`,
      hint: `Nest tersedia:\n${available || "Tidak ada nest"}`,
      steps: ["Periksa nama nest di panel", "Gunakan nest ID langsung"]
    });
  }

  async findEggByName(nestId: number | undefined, name: string) {
    this.logger.info(`Mencari egg ${name}.`);
    const data = await this.listEggs(nestId);
    const match = data.find(item => {
      const attributes = getDataAttributes(item);
      return String(attributes.name ?? "").toLowerCase() === name.toLowerCase();
    });
    if (match) {
      const attributes = getDataAttributes(match);
      return {
        id: Number(attributes.id ?? 0),
        name: String(attributes.name ?? ""),
        nestId: nestId ?? Number(attributes.nest ?? 0),
        raw: match
      };
    }
    const available = data.map(item => `ID ${getDataAttributes(item).id} | ${getDataAttributes(item).name}`).join("\n");
    throw new PteroError({
      code: "EGG_NOT_FOUND",
      message: `Egg dengan nama '${name}' tidak ditemukan.`,
      hint: `Egg tersedia:\n${available || "Tidak ada egg"}`,
      steps: ["Periksa nama egg di panel", "Gunakan egg ID langsung"]
    });
  }

  async findNestAndEgg(nestName?: string, eggName?: string, defaultNestId = this.defaultNestId, defaultEggId = this.defaultEggId) {
    const capabilities = await this.capabilities();
    let nestId = defaultNestId;
    let resolvedNestName = "";
    if (nestName) {
      const nest = await this.findNestByName(nestName);
      nestId = nest.id;
      resolvedNestName = nest.name;
    } else if (capabilities.nests) {
      try {
        const nest = getDataAttributes(await this.application.nests.get(nestId));
        resolvedNestName = String(nest.name ?? "");
      } catch {
        resolvedNestName = "";
      }
    }

    const egg = eggName ? await this.findEggByName(nestId, eggName) : await this.getEgg(nestId, defaultEggId, true);
    const eggAttributes = getDataAttributes(egg);
    const eggId = Number(eggAttributes.id ?? 0);
    if (!eggId) throw new PteroError({ code: "EGG_NOT_FOUND", message: "Egg tidak memiliki ID valid." });

    return {
      nestId,
      eggId,
      nestName: resolvedNestName,
      eggName: String(eggAttributes.name ?? "")
    };
  }

  async autoResolveDefaults(nodeId: number, options?: { defaultNestId?: number; defaultEggId?: number }) {
    this.logger.info(`Menyiapkan default untuk node ${nodeId}.`);
    const { nestId, eggId, nestName, eggName } = await this.findNestAndEgg(
      undefined,
      undefined,
      options?.defaultNestId ?? this.defaultNestId,
      options?.defaultEggId ?? this.defaultEggId
    );
    const egg = getDataAttributes(await this.getEgg(nestId, eggId, true));
    const dockerImages = asObject(egg.docker_images);
    const dockerImage =
      Object.values(dockerImages).find(value => typeof value === "string" && value.trim()) ??
      egg.docker_image ??
      "ghcr.io/parkervcp/yolks:nodejs_20";
    const startup = String(egg.startup ?? "node index.js");
    const allocations = await this.application.nodes.allocations.all(nodeId);
    const free = parseAllocations({ data: allocations }).filter(item => !item.assigned);
    if (free.length === 0) throw ErrorFactory.noFreeAllocation(nodeId);
    const selection = selectPlannerAllocations(free, 1, "lowest-port");
    return {
      nodeId,
      nestId,
      eggId,
      nestName,
      eggName,
      startup,
      dockerImage: String(dockerImage),
      allocationId: selection.ids[0]!,
      allocationPort: selection.ports[0]!,
      freeAllocations: free.length
    };
  }

  private async updateServerSpecs(serverId: number, input: UpdateServerSpecsInput, options?: OperationOptions) {
    this.logger.info(`Memperbarui spesifikasi server ${serverId}.`);
    progress(options, "validate", 10, "Memvalidasi input.");
    const response = await this.application.servers.get(serverId);
    const attributes = getDataAttributes(response);
    const limits = asObject(attributes.limits);
    const featureLimits = asObject(attributes.feature_limits);
    const memory = input.memory !== undefined ? parseSizeToMiB(input.memory) : Number(limits.memory ?? 0);
    const disk = input.disk !== undefined ? parseSizeToMiB(input.disk) : Number(limits.disk ?? 0);
    const cpu = input.cpu !== undefined ? parseCpu(input.cpu) : Number(limits.cpu ?? 0);
    const swap = input.swap !== undefined ? parseSizeToMiB(input.swap) : Number(limits.swap ?? 0);
    const io = input.io !== undefined ? Math.max(0, Math.floor(input.io)) : Number(limits.io ?? 500);
    const threads = input.cpuPinning !== undefined ? (input.cpuPinning.trim() ? input.cpuPinning.trim() : null) : limits.threads ?? null;
    const oomDisabled = input.oomDisabled !== undefined ? toBoolean(input.oomDisabled) : Boolean(limits.oom_disabled);
    const databases = input.databases !== undefined ? Math.max(0, Math.floor(input.databases)) : Number(featureLimits.databases ?? 0);
    const allocations = input.allocations !== undefined ? Math.max(0, Math.floor(input.allocations)) : Number(featureLimits.allocations ?? 0);
    const backups = input.backups !== undefined ? Math.max(0, Math.floor(input.backups)) : Number(featureLimits.backups ?? 0);

    progress(options, "request", 60, "Mengirim update ke panel.");
    await this.application.servers.updateBuild(serverId, {
      allocation: Number(attributes.allocation ?? 0),
      memory,
      swap,
      disk,
      io,
      cpu,
      threads,
      oom_disabled: oomDisabled,
      feature_limits: { databases, allocations, backups }
    });
    progress(options, "done", 100, "Spesifikasi server diperbarui.");
    return {
      ok: true,
      serverId,
      updated: { memory, swap, disk, io, cpu, threads, oomDisabled, databases, allocations, backups }
    };
  }

  private async changeServerOwnership(serverId: number, input: ChangeServerOwnershipInput, options?: OperationOptions) {
    this.logger.info(`Memindahkan kepemilikan server ${serverId}.`);
    progress(options, "resolve", 20, "Menyiapkan user tujuan.");
    let targetUserId = input.userId;
    if (!targetUserId && input.email) {
      const found = await this.findUserByEmail(input.email);
      if (found) targetUserId = found.id;
      else {
        const created = await this.getOrCreateUser({
          username: input.username || input.email.split("@")[0] || "user",
          email: input.email,
          password: input.password ?? "auto",
          administrator: false
        });
        targetUserId = created.id;
      }
    }
    if (!targetUserId) throw new PteroError({ code: "USER_REQUIRED", message: "userId atau email wajib diisi." });

    const attributes = getDataAttributes(await this.application.servers.get(serverId));
    progress(options, "request", 60, "Memindahkan server.");
    await this.application.servers.update(serverId, {
      user: targetUserId,
      name: String(attributes.name ?? ""),
      description: String(attributes.description ?? ""),
      external_id: attributes.external_id ?? null
    });
    progress(options, "done", 100, "Kepemilikan server diperbarui.");
    return { ok: true, serverId, newOwnerId: targetUserId };
  }

  private async changeServerNestEgg(serverId: number, input: ChangeServerNestEggInput, options?: OperationOptions) {
    this.logger.info(`Mengubah nest/egg server ${serverId}.`);
    progress(options, "resolve", 20, "Menyiapkan nest dan egg.");
    let nestId = input.nestId ?? this.defaultNestId;
    let eggId = input.eggId ?? this.defaultEggId;
    if (input.nestName || input.eggName) {
      const resolved = await this.findNestAndEgg(input.nestName, input.eggName, nestId, eggId);
      nestId = resolved.nestId;
      eggId = resolved.eggId;
    }
    const egg = getDataAttributes(await this.getEgg(nestId, eggId, true));
    const server = getDataAttributes(await this.application.servers.get(serverId));
    const dockerImages = asObject(egg.docker_images);
    const dockerImage =
      input.dockerImage ||
      (Object.values(dockerImages).find(value => typeof value === "string") as string | undefined) ||
      String(egg.docker_image ?? "");
    const startup = input.startup || String(egg.startup ?? "");
    const currentEnvironment = asObject(asObject(server.container).environment);
    const providedEnvironment = input.environment ?? {};
    const variables = getCollection(asObject(asObject(egg.relationships).variables));
    const environment = variables.length
      ? Object.fromEntries(
          variables
            .map(variable => {
              const attributes = getDataAttributes(variable);
              const env = String(attributes.env_variable ?? "");
              const value = providedEnvironment[env] ?? currentEnvironment[env] ?? attributes.default_value ?? "";
              return [env, String(value)] as const;
            })
            .filter(([env]) => Boolean(env))
        )
      : Object.fromEntries(
          Object.entries({ ...currentEnvironment, ...providedEnvironment }).map(([key, value]) => [key, String(value)])
        );

    progress(options, "request", 60, "Menerapkan perubahan.");
    await this.application.servers.updateStartup(serverId, {
      egg: eggId,
      image: dockerImage,
      startup,
      environment,
      skip_scripts: input.skipScripts ?? false
    });
    progress(options, "done", 100, "Nest dan egg diperbarui.");
    return { ok: true, serverId, nestId, eggId, dockerImage, startup, environment };
  }

  async getServerDetails(serverId: number) {
    this.logger.info(`Mengambil detail server ${serverId}.`);
    const response = await this.application.servers.get(serverId);
    const attributes = getDataAttributes(response);
    const nodeId = Number(attributes.node ?? 0);
    const nestId = Number(attributes.nest ?? this.defaultNestId);
    const eggId = Number(attributes.egg ?? 0);
    const userId = Number(attributes.user ?? 0);
    const [node, nest, egg, user] = await Promise.allSettled([
      this.application.nodes.get(nodeId),
      this.application.nests.get(nestId),
      this.getEgg(nestId, eggId, false),
      this.application.users.get(userId)
    ]);
    const container = asObject(attributes.container);
    return {
      id: Number(attributes.id ?? 0),
      identifier: String(attributes.identifier ?? ""),
      uuid: String(attributes.uuid ?? ""),
      name: String(attributes.name ?? ""),
      description: String(attributes.description ?? ""),
      status: String(attributes.status ?? ""),
      suspended: Boolean(attributes.suspended),
      nodeId,
      nodeName: node.status === "fulfilled" ? String(getDataAttributes(node.value).name ?? "") : "",
      nestId,
      nestName: nest.status === "fulfilled" ? String(getDataAttributes(nest.value).name ?? "") : "",
      eggId,
      eggName: egg.status === "fulfilled" ? String(getDataAttributes(egg.value).name ?? "") : "",
      userId,
      userName: user.status === "fulfilled" ? String(getDataAttributes(user.value).username ?? "") : "",
      userEmail: user.status === "fulfilled" ? String(getDataAttributes(user.value).email ?? "") : "",
      limits: asObject(attributes.limits),
      featureLimits: asObject(attributes.feature_limits),
      dockerImage: String(container.image ?? ""),
      startup: String(container.startup_command ?? ""),
      environment: asObject(container.environment),
      allocationId: Number(attributes.allocation ?? 0),
      createdAt: String(attributes.created_at ?? ""),
      updatedAt: String(attributes.updated_at ?? ""),
      raw: response
    };
  }

  async batchServerOperation(
    serverIds: number[],
    operation: "suspend" | "unsuspend" | "reinstall" | "delete",
    options: { force?: boolean; concurrency?: number; confirm?: boolean } = {}
  ) {
    this.logger.info(`Menjalankan ${operation} untuk ${serverIds.length} server.`);
    return this.bulk(
      serverIds,
      async serverId => {
        if (operation === "suspend") return this.application.servers.suspend(serverId);
        if (operation === "unsuspend") return this.application.servers.unsuspend(serverId);
        if (operation === "reinstall") return this.application.servers.reinstall(serverId);
        return this.application.servers.delete(serverId, {
          confirm: options.confirm ?? options.force ?? false,
          force: options.force ?? false
        });
      },
      { concurrency: options.concurrency ?? 3 }
    );
  }

  async bulk<T, R>(items: T[], task: (item: T, index: number) => Promise<R>, options: BulkOptions = {}): Promise<BulkResult<R>> {
    const concurrency = Math.max(1, options.concurrency ?? 5);
    const results: BulkResult<R>["results"] = new Array(items.length);
    let cursor = 0;
    let completed = 0;
    let stopped = false;

    const worker = async () => {
      while (true) {
        if (stopped) return;
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          const value = await task(items[index]!, index);
          results[index] = { index, ok: true, value };
        } catch (error) {
          results[index] = { index, ok: false, error: error instanceof Error ? error.message : String(error) };
          if (options.stopOnError) stopped = true;
        } finally {
          completed += 1;
          options.onProgress?.(completed, items.length);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
    const finalResults = results.filter(Boolean);
    return {
      total: items.length,
      success: finalResults.filter(item => item.ok).length,
      failed: finalResults.filter(item => !item.ok).length,
      results: finalResults
    };
  }

  async listAllServers(filters?: Record<string, string>) {
    return this.listAllPages<unknown>(page => this.application.servers.list(page, filters));
  }

  async findServersByUser(userId: number) {
    const servers = await this.listAllServers();
    return servers.filter(server => Number(getDataAttributes(server).user ?? 0) === userId);
  }

  async findServerByIdentifier(identifier: string) {
    const servers = await this.listAllServers();
    return servers.find(server => String(getDataAttributes(server).identifier ?? "") === identifier);
  }

  async capacity(): Promise<NodeCapacity[]> {
    const nodes = await this.application.nodes.all();
    const servers = await this.listAllServers();
    const allocations: Record<number, unknown[]> = {};
    for (const node of nodes) {
      const nodeId = Number(getDataAttributes(node).id ?? 0);
      if (!nodeId) continue;
      allocations[nodeId] = await this.application.nodes.allocations.all(nodeId);
    }
    return capacityReport(nodes, allocations, servers);
  }

  async forecast(specs: ServerSpecsInput): Promise<CapacityForecast[]> {
    const nodes = await this.application.nodes.all();
    const servers = await this.listAllServers();
    const allocations: Record<number, unknown[]> = {};
    for (const node of nodes) {
      const nodeId = Number(getDataAttributes(node).id ?? 0);
      if (!nodeId) continue;
      allocations[nodeId] = await this.application.nodes.allocations.all(nodeId);
    }
    return forecastCapacity(nodes, specs, allocations, servers);
  }

  async planServer(
    specs: ServerSpecsInput,
    options: { nodeIds?: number[]; strategy?: PlacementStrategy; reservePercent?: number } = {}
  ): Promise<{ plan: PlacementPlan; allocations: { nodeId: number | null; default?: number; additional?: number[]; available?: number } }> {
    const nodes = (await this.application.nodes.all()).filter(node => {
      if (!options.nodeIds?.length) return true;
      return options.nodeIds.includes(Number(getDataAttributes(node).id ?? 0));
    });
    const servers = await this.listAllServers();
    const allocations: Record<number, unknown[]> = {};
    for (const node of nodes) {
      const nodeId = Number(getDataAttributes(node).id ?? 0);
      if (!nodeId) continue;
      allocations[nodeId] = await this.application.nodes.allocations.all(nodeId);
    }
    const plan = planPlacement({
      specs,
      nodes,
      allocations,
      servers,
      strategy: options.strategy ?? this.defaultNodeStrategy,
      reservePercent: options.reservePercent,
      requiredPorts: normalizePlannerSpecs(specs).allocations
    });
    if (!plan.selected) return { plan, allocations: { nodeId: null } };
    const items = parseAllocations({ data: allocations[plan.selected.nodeId] ?? [] });
    const free = items.filter(item => !item.assigned);
    try {
      const selection = selectPlannerAllocations(free, normalizePlannerSpecs(specs).allocations, "best-fit");
      return {
        plan,
        allocations: { nodeId: plan.selected.nodeId, default: selection.ids[0], additional: selection.ids.slice(1), available: free.length }
      };
    } catch {
      return { plan, allocations: { nodeId: plan.selected.nodeId, available: free.length } };
    }
  }

  async packServers(specs: ServerSpecsInput[], strategy: PlacementStrategy = "pack") {
    const nodes = await this.application.nodes.all();
    const servers = await this.listAllServers();
    const allocations: Record<number, unknown[]> = {};
    for (const node of nodes) {
      const nodeId = Number(getDataAttributes(node).id ?? 0);
      if (!nodeId) continue;
      allocations[nodeId] = await this.application.nodes.allocations.all(nodeId);
    }
    return binPack(specs, nodes, allocations, servers, strategy);
  }

  async waitForServer(identifier: string, target: string | string[] = "running", options: WaitOptions = {}) {
    return this.server(identifier).waitForState(target, options);
  }

  async cloneServer(serverId: number, overrides: Partial<CreateSmartServerInput> = {}) {
    const details = await this.getServerDetails(serverId);
    const limits = asObject(details.limits);
    const features = asObject(details.featureLimits);
    const specs: ServerSpecsInput = {
      memory: Number(limits.memory ?? 0),
      disk: Number(limits.disk ?? 0),
      cpu: Number(limits.cpu ?? 0),
      swap: Number(limits.swap ?? 0),
      io: Number(limits.io ?? 500),
      databases: Number(features.databases ?? 0),
      allocations: Math.max(1, Number(features.allocations ?? 1)),
      backups: Number(features.backups ?? 0),
      cpuPinning: limits.threads === null || limits.threads === undefined ? undefined : String(limits.threads)
    };
    return this.createServerSmart({
      name: `${details.name} clone`,
      userId: details.userId,
      description: details.description || "Cloned server",
      nodeId: details.nodeId,
      nestId: details.nestId,
      eggId: details.eggId,
      specs,
      startup: details.startup || "auto",
      dockerImage: details.dockerImage || "auto",
      environment: Object.fromEntries(Object.entries(details.environment).map(([key, value]) => [key, String(value)])),
      allocation: "auto",
      startOnCompletion: false,
      ...overrides
    });
  }

  async exportAndEmailBackup(
    serverId: number,
    targetEmail?: string,
    smtpConfig?: SmtpConfig,
    options: BackupExportOptions = {}
  ): Promise<BackupExportResult> {
    const smtp = smtpConfig ?? smtpFromEnv();
    if (!smtp) {
      throw new PteroError({
        code: "SMTP_CONFIG_REQUIRED",
        message: "Konfigurasi SMTP diperlukan untuk mengirim backup.",
        hint: "Isi SMTP_HOST, SMTP_PORT, SMTP_USER, dan SMTP_PASS atau kirim objek smtp.",
        steps: ["Siapkan kredensial SMTP", "Atur environment SMTP_*", "Ulangi proses backup"]
      });
    }
    const details = await this.getServerDetails(serverId);
    const email = validateEmail(targetEmail ?? details.userEmail);
    const handle = this.server(details.identifier);
    const ignored = options.ignored ?? DEFAULT_IGNORED;
    const backupName = `auto-backup-${details.identifier}-${Date.now()}`;
    this.logger.info(`Membuat backup untuk ${details.name}.`);
    const backup = await handle.backups.createAndWait(backupName, ignored, {
      timeout: options.timeout ?? 900000,
      interval: options.pollInterval ?? 5000
    });
    const backupUuid = String(backup.uuid ?? "");
    if (!backupUuid) throw new PteroError({ code: "BACKUP_UUID_MISSING", message: "Backup tidak memiliki UUID." });

    const workdir = await mkdtemp(join(tmpdir(), "ptero-gateway-"));
    const tarPath = join(workdir, `${details.identifier}.tar.gz`);
    let panelBackupRetained = false;

    try {
      const url = await handle.backups.downloadUrl(backupUuid);
      const response = await fetch(url);
      if (!response.ok || !response.body) {
        throw new PteroError({
          code: "BACKUP_DOWNLOAD_FAILED",
          message: `Gagal mengunduh backup (HTTP ${response.status}).`,
          status: response.status
        });
      }
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tarPath));
      const tarInfo = await stat(tarPath);

      let attachmentPath = tarPath;
      let fileName = `${sanitizeFileName(details.name)}_backup.tar.gz`;
      if ((options.format ?? "zip") === "zip") {
        const converted = await convertTarToZip(tarPath, workdir, details.name, details.identifier);
        if (converted) {
          attachmentPath = converted.path;
          fileName = converted.name;
          await rm(tarPath, { force: true });
        }
      }

      const attachmentInfo = await stat(attachmentPath);
      const limit = options.attachmentLimitBytes ?? 20 * 1024 * 1024;
      if (attachmentInfo.size > limit) {
        throw new PteroError({
          code: "ATTACHMENT_TOO_LARGE",
          message: `Ukuran backup ${formatBytes(attachmentInfo.size)} melebihi batas lampiran ${formatBytes(limit)}.`,
          hint: "Naikkan attachmentLimitBytes atau unduh backup langsung dari panel.",
          steps: ["Naikkan batas lampiran", "Kurangi isi server yang dibackup", "Gunakan unduhan langsung"]
        });
      }

      this.logger.info(`Mengirim backup ${formatBytes(attachmentInfo.size)} ke ${email}.`);
      await sendEmailMessage({
        to: email,
        subject: `Backup Server: ${details.name}`,
        text: [
          "Backup server Pterodactyl",
          `Nama server: ${details.name}`,
          `Identifier: ${details.identifier}`,
          `File: ${fileName}`,
          `Ukuran: ${formatBytes(attachmentInfo.size)}`,
          `Tanggal: ${new Date().toISOString()}`
        ].join("\n"),
        html: `<h2>Backup Server</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td><b>Nama</b></td><td>${escapeValue(details.name)}</td></tr><tr><td><b>Identifier</b></td><td>${escapeValue(details.identifier)}</td></tr><tr><td><b>File</b></td><td>${escapeValue(fileName)}</td></tr><tr><td><b>Ukuran</b></td><td>${formatBytes(attachmentInfo.size)}</td></tr><tr><td><b>Tanggal</b></td><td>${new Date().toISOString()}</td></tr></table>`,
        attachments: [{ filename: fileName, path: attachmentPath }],
        smtp
      });

      if (!options.keepPanelBackup) {
        try {
          await handle.backups.delete(backupUuid);
        } catch (error) {
          panelBackupRetained = true;
          this.logger.warn(`Gagal menghapus backup panel: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        panelBackupRetained = true;
      }

      return {
        success: true,
        serverName: details.name,
        email,
        fileName,
        size: formatBytes(attachmentInfo.size),
        bytes: attachmentInfo.size,
        backupUuid,
        panelBackupRetained
      };
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async backupAndEmailUserServers(userId: number, smtpConfig?: SmtpConfig) {
    const servers = await this.findServersByUser(userId);
    if (servers.length === 0) throw new PteroError({ code: "NO_SERVERS_FOUND", message: `Tidak ada server untuk user ${userId}.` });
    this.logger.info(`Memproses backup ${servers.length} server untuk user ${userId}.`);
    return this.bulk(
      servers,
      async server => {
        const serverId = Number(getDataAttributes(server).id ?? 0);
        return this.exportAndEmailBackup(serverId, undefined, smtpConfig);
      },
      { concurrency: 1 }
    );
  }

  private async sendEmailToUser(userId: number, options: Omit<SendEmailOptions, "to">) {
    const attributes = getDataAttributes(await this.application.users.get(userId));
    const email = String(attributes.email ?? "");
    if (!email) throw new PteroError({ code: "USER_EMAIL_MISSING", message: `User ${userId} tidak memiliki email.` });
    return sendEmailMessage({ ...options, to: email });
  }

  private async broadcastEmail(options: Omit<SendEmailOptions, "to">) {
    const users = await this.application.users.all();
    const emails = [...new Set(users.map(user => String(getDataAttributes(user).email ?? "")).filter(Boolean))];
    if (emails.length === 0) throw new PteroError({ code: "NO_RECIPIENTS", message: "Tidak ada user dengan email." });
    return this.bulk(
      emails,
      async email => sendEmailMessage({ ...options, to: email }),
      { concurrency: 3 }
    );
  }

  private async listAllPages<T>(fetchPage: (page: number) => Promise<unknown>, maxPages = 200): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await fetchPage(page);
      const collection = getCollection(response) as T[];
      items.push(...collection);
      const pagination = getPagination(response);
      if (!pagination) return items;
      if (pagination.current_page >= pagination.total_pages) return items;
      if (pagination.total_pages <= 0) return items;
    }
    throw new PteroError({
      code: "PAGINATION_LIMIT_REACHED",
      message: `Pagination melebihi batas aman ${maxPages} halaman.`,
      hint: "Gunakan filter atau bagi proses menjadi beberapa bagian."
    });
  }

  private async searchServers(query: string) {
    const response = await this.request<unknown>({
      api: "application",
      path: "/servers",
      query: { "filter[name]": query }
    });
    let data: unknown[] = getCollection(response);
    if (data.length === 0) {
      const all = await this.listAllServers();
      const needle = query.toLowerCase();
      data = all.filter(item => String(getDataAttributes(item).name ?? "").toLowerCase().includes(needle));
    }
    return data.map(item => {
      const attributes = getDataAttributes(item);
      return {
        id: Number(attributes.id ?? 0),
        name: String(attributes.name ?? ""),
        identifier: String(attributes.identifier ?? ""),
        raw: item
      };
    });
  }

  private async findUserByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    const response = await this.request<unknown>({
      api: "application",
      path: "/users",
      query: { "filter[email]": normalized }
    });
    let data: unknown[] = getCollection(response);
    if (data.length === 0) {
      const all = await this.application.users.all();
      data = all.filter(item => String(getDataAttributes(item).email ?? "").toLowerCase() === normalized);
    }
    const first = data[0];
    if (!first) return undefined;
    const attributes = getDataAttributes(first);
    return {
      id: Number(attributes.id ?? 0),
      username: String(attributes.username ?? ""),
      email: String(attributes.email ?? normalized),
      raw: first
    };
  }

  private async createUserSmart(input: CreateUserSmartInput, options?: OperationOptions): Promise<NormalizedUser | { dryRun: true; payload: Record<string, unknown>; generatedPassword?: string }> {
    this.logger.info(`Membuat user ${input.email}.`);
    progress(options, "validate", 10, "Memvalidasi data user.");
    const built = buildUserPayload(input);
    if (options?.dryRun) return { dryRun: true, payload: built.payload, generatedPassword: built.generatedPassword };
    progress(options, "request", 70, "Mengirim user ke panel.");
    const response = await this.application.users.create(built.payload);
    this.logger.success(`User ${input.email} dibuat.`);
    progress(options, "done", 100, "User berhasil dibuat.");
    return normalizeUserResponse(response, built.generatedPassword);
  }

  private async getOrCreateUser(input: CreateUserSmartInput, options?: OperationOptions) {
    const found = await this.findUserByEmail(input.email);
    if (found) return { ...found, created: false };
    const created = await this.createUserSmart(input, options);
    if ("dryRun" in created) {
      throw new PteroError({ code: "USER_CREATE_DRY_RUN", message: "User belum dibuat karena mode dry run." });
    }
    return { ...created, created: true };
  }

  private async resolveUserForServer(input: CreateSmartServerInput, allowCreate: boolean) {
    if (input.userId) return { id: input.userId, created: false, pending: false };
    if (!input.email) throw new PteroError({ code: "EMAIL_REQUIRED", message: "email wajib diisi jika userId kosong." });
    const found = await this.findUserByEmail(input.email);
    if (found) return { id: found.id, email: found.email, username: found.username, created: false, pending: false };
    if (!input.autoCreateUser) throw ErrorFactory.userNotFound(input.email);
    if (!allowCreate) {
      return {
        id: 0,
        email: input.email,
        username: input.username ?? input.email.split("@")[0],
        created: false,
        pending: true
      };
    }
    const created = await this.createUserSmart({
      username: input.username || input.email.split("@")[0] || "user",
      email: input.email,
      password: input.password ?? "auto",
      administrator: input.administrator ?? false
    });
    if ("dryRun" in created) throw new PteroError({ code: "USER_CREATE_FAILED", message: "User tidak dapat dibuat dalam mode dry run." });
    return { id: created.id, email: created.email, username: created.username, created: true, pending: false, generatedPassword: created.generatedPassword };
  }

  private async prepareServer(input: CreateSmartServerInput, allowCreate: boolean, options?: OperationOptions) {
    progress(options, "validate", 5, "Memvalidasi input server.");
    const specsInput = validateCreateInput(input, input.specs ?? (input.preset ? this.presets[input.preset] : undefined));
    const specs = normalizeSpecs(specsInput);
    progress(options, "user", 15, "Menyiapkan owner server.");
    const user = await this.resolveUserForServer(input, allowCreate);
    progress(options, "node", 30, "Mengambil node.");
    const node = await this.application.nodes.get(input.nodeId);
    progress(options, "egg", 45, "Mengambil nest dan egg.");
    const nestId = input.nestId ?? this.defaultNestId;
    const nest = await this.application.nests.get(nestId).catch(() => ({ data: { attributes: { id: nestId, name: "" } } }));
    const egg = await this.getEgg(nestId, input.eggId, true);
    progress(options, "allocation", 60, "Mencari allocation port.");
    const allocationCount = specs.normalized.allocations || 1;
    const allocations = await this.application.nodes.allocations.all(input.nodeId);
    let allocation;
    try {
      allocation = selectAllocations({ data: allocations }, allocationCount, input.allocation ?? "auto");
    } catch (error) {
      if (error instanceof PteroError && error.code === "NO_FREE_ALLOCATION") throw ErrorFactory.noFreeAllocation(input.nodeId);
      throw error;
    }
    progress(options, "payload", 80, "Menyusun payload server.");
    const payload = buildServerPayload(
      { ...input, nestId },
      { userId: user.id, rawEgg: egg, allocation, specs }
    );
    const nodeAttributes = getDataAttributes(node);
    const nestAttributes = getDataAttributes(nest);
    const eggAttributes = getDataAttributes(egg);
    const preview = {
      ok: true,
      user,
      node: { id: input.nodeId, name: typeof nodeAttributes.name === "string" ? nodeAttributes.name : undefined, raw: node },
      nest: { id: nestId, name: typeof nestAttributes.name === "string" ? nestAttributes.name : undefined, raw: nest },
      egg: { id: input.eggId, name: typeof eggAttributes.name === "string" ? String(eggAttributes.name) : undefined, raw: egg },
      dockerImage: String(payload.docker_image),
      startup: String(payload.startup),
      environment: payload.environment as Record<string, string>,
      allocation,
      limits: payload.limits as Record<string, unknown>,
      featureLimits: specs.featureLimits,
      payload
    };
    progress(options, "done", 100, "Preview server siap.");
    return { preview, specs: specsInput, user, payload };
  }

  private async previewCreateServer(input: CreateSmartServerInput, options?: OperationOptions) {
    const prepared = await this.prepareServer(input, false, options);
    return prepared.preview;
  }

  private async createServerSmart(
    input: CreateSmartServerInput,
    options?: OperationOptions
  ): Promise<NormalizedServer | { dryRun: true; preview: unknown; payload: Record<string, unknown> }> {
    const prepared = await this.prepareServer(input, true, options);
    if (options?.dryRun) return { dryRun: true, preview: prepared.preview, payload: prepared.payload };
    this.logger.info(`Membuat server ${input.name}.`);
    progress(options, "request", 90, "Mengirim server ke panel.");
    const response = await this.createServerWithEnvironmentRetry(prepared.payload);
    const attributes = getDataAttributes(response);
    this.logger.success(`Server ${input.name} dibuat.`);
    const identifier = typeof attributes.identifier === "string" ? attributes.identifier : undefined;
    if (options?.waitForInstall && identifier) {
      const timeout = typeof options.waitForInstall === "number" ? options.waitForInstall : 600000;
      progress(options, "install", 95, "Menunggu instalasi server selesai.");
      await this.server(identifier).waitForInstall({ timeout, interval: 5000 });
      this.logger.success(`Instalasi server ${identifier} selesai.`);
    }
    progress(options, "done", 100, "Server berhasil dibuat.");
    return {
      id: Number(attributes.id ?? 0) || undefined,
      identifier,
      uuid: typeof attributes.uuid === "string" ? attributes.uuid : undefined,
      name: typeof attributes.name === "string" ? attributes.name : undefined,
      user: prepared.user,
      raw: response
    };
  }

  private async createServerWithEnvironmentRetry(payload: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.application.servers.create(payload);
    } catch (error) {
      const missing = missingEnvironmentFields(error);
      if (missing.length === 0) throw error;
      const environment: Record<string, unknown> = { ...asObject(payload.environment) };
      for (const field of missing) {
        if (environment[field] === undefined) environment[field] = "";
      }
      this.logger.warn(`Melengkapi environment yang diminta panel: ${missing.join(", ")}.`);
      return this.application.servers.create({ ...payload, environment });
    }
  }

  private async checkApplicationKey() {
    if (!this.applicationKey) return { provided: false, valid: false, message: "PTLA kosong." };
    try {
      await this.request<unknown>({ api: "application", path: "/users", query: { page: 1 }, cache: false });
      return { provided: true, valid: true, message: "PTLA valid." };
    } catch (error) {
      return { provided: true, valid: false, message: error instanceof Error ? error.message : "PTLA tidak valid." };
    }
  }

  private async checkClientKey() {
    if (!this.clientKey) return { provided: false, valid: false, message: "PTLC kosong." };
    try {
      await this.request<unknown>({ api: "client", path: "/account", cache: false });
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

  metrics(): GatewayMetrics & { cache: ReturnType<HttpCore["cacheStats"]>; breaker: ReturnType<HttpCore["breakerStats"]> } {
    return { ...this.http.metricsSnapshot(), cache: this.http.cacheStats(), breaker: this.http.breakerStats() };
  }

  flushCache(prefix?: string): number {
    return this.http.flushCache(prefix);
  }

  close(): void {
    closeEmailTransports();
  }

  async closeAsync(): Promise<void> {
    closeEmailTransports();
    await sleep(0);
  }

  private async deleteApplicationUser(id: number, confirm: boolean) {
    this.ensureDestructiveOperation(`menghapus user ${id}`, confirm);
    return this.request<unknown>({ api: "application", method: "DELETE", path: `/users/${ensurePositiveInteger(id, "userId")}` });
  }

  private async deleteApplicationAllocation(nodeId: number, id: number, confirm: boolean) {
    this.ensureDestructiveOperation(`menghapus allocation ${id} pada node ${nodeId}`, confirm);
    return this.request<unknown>({
      api: "application",
      method: "DELETE",
      path: `/nodes/${ensurePositiveInteger(nodeId, "nodeId")}/allocations/${ensurePositiveInteger(id, "allocationId")}`
    });
  }

  private async deleteApplicationServer(id: number, confirmOrOptions?: boolean | { confirm?: boolean; force?: boolean }) {
    const options = typeof confirmOrOptions === "boolean" ? { confirm: confirmOrOptions, force: confirmOrOptions } : confirmOrOptions ?? {};
    this.ensureDestructiveOperation(`menghapus server ${id}`, options.confirm ?? false);
    return this.request<unknown>({
      api: "application",
      method: "DELETE",
      path: `/servers/${ensurePositiveInteger(id, "serverId")}${options.force ? "/force" : ""}`
    });
  }

  private ensureDestructiveOperation(operation: string, confirmed: boolean) {
    if (!this.safeMode || confirmed) return;
    throw new PteroError({
      code: "SAFE_MODE_CONFIRMATION_REQUIRED",
      message: `Safe mode memerlukan konfirmasi eksplisit untuk ${operation}.`,
      hint: "Kirim konfirmasi true atau inisialisasi gateway dengan safeMode: false untuk otomasi tepercaya."
    });
  }
}

async function convertTarToZip(
  tarPath: string,
  workdir: string,
  serverName: string,
  identifier: string
): Promise<{ path: string; name: string } | null> {
  if (!(await binaryExists("zip")) || !(await binaryExists("tar"))) return null;
  const extractDir = join(workdir, "extract");
  const zipPath = join(workdir, `${sanitizeFileName(serverName)}_backup.zip`);
  await mkdir(extractDir, { recursive: true });
  await execFileAsync("tar", ["-xzf", tarPath, "-C", extractDir]);
  await writeFile(
    join(extractDir, "backup_info.txt"),
    [`Server: ${serverName}`, `Identifier: ${identifier}`, `Created: ${new Date().toISOString()}`, "Generated by @akaanakbaik/pterodactyl-gateway"].join("\n"),
    "utf8"
  );
  await execFileAsync("zip", ["-q", "-r", zipPath, "."], { cwd: extractDir });
  return { path: zipPath, name: basename(zipPath) };
}

async function binaryExists(name: string): Promise<boolean> {
  try {
    await execFileAsync(name, ["--version"]);
    return true;
  } catch {
    try {
      await execFileAsync(name, ["-v"]);
      return true;
    } catch {
      return false;
    }
  }
}

function missingEnvironmentFields(error: unknown): string[] {
  if (!(error instanceof PteroError) || error.status !== 422) return [];
  const raw = asObject(error.raw);
  const errors = Array.isArray(raw.errors) ? raw.errors : [];
  const fields = new Set<string>();
  for (const item of errors) {
    const entry = asObject(item);
    const meta = asObject(entry.meta);
    const source = String(meta.source_field ?? "");
    if (source.startsWith("environment.")) fields.add(source.slice("environment.".length));
    const detail = String(entry.detail ?? "");
    const match = detail.match(/environment\.([A-Za-z0-9_]+)/);
    if (match) fields.add(match[1]!);
  }
  return [...fields].filter(Boolean);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "server";
}

function escapeValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export { PteroScheduleBuilder } from "./schedule.js";
export { PteroServerHandle } from "./server.js";
export { PteroWebSocket } from "./websocket.js";
export type { PteroServerHandle as PteroServerHandleType, PteroWebSocket as PteroWebSocketType };
