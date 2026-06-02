import { PteroError, ErrorFactory } from "./errors.js";
import { HttpCore } from "./http.js";
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
  ServerPowerSignal
} from "./types.js";
import { asObject, getCollection, getDataAttributes, maskSecret, normalizeDomain } from "./utils.js";
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
    this.userAgent = config.userAgent ?? "AkadevPterodactylGateway/1.1.0";
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
      debug: config.debug
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
        delete: (id: number) => this.request<any>({ api: "application", method: "DELETE", path: `/users/${id}` })
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
        eggs: {
          list: (nestId: number) => this.request<any>({ api: "application", path: `/nests/${nestId}/eggs` }),
          get: (nestId: number, eggId: number) => this.request<any>({ api: "application", path: `/nests/${nestId}/eggs/${eggId}?include=variables` })
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
        createFromPreset: (preset: string, input: Omit<CreateSmartServerInput, "preset" | "specs">, options?: OperationOptions) => this.createServerSmart({ ...input, preset }, options)
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

  private async findUserByEmail(email: string) {
    const raw = await this.request<any>({ api: "application", path: `/users?filter[email]=${encodeURIComponent(email)}` }).catch(() => undefined);
    const data = Array.isArray(asObject(raw).data) ? asObject(raw).data as unknown[] : [];
    const first = data[0];
    if (!first) return undefined;
    const attributes = asObject(asObject(first).attributes);
    return { id: Number(attributes.id ?? 0), username: String(attributes.username ?? ""), email: String(attributes.email ?? email), raw: first };
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
}
