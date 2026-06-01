import { PteroError } from "./errors.js";
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
  ServerPowerSignal,
  PteroAppUser,
  PteroAppNode,
  PteroAppServer,
  PteroClientServer
} from "./types.js";
import { asObject, getCollection, getDataAttributes, maskSecret, normalizeDomain } from "./utils.js";
import { PteroWebSocket } from "./websocket.js";

export class PteroGateway {
  readonly domain: string;
  readonly applicationKey?: string;
  readonly clientKey?: string;
  readonly timeout: number;
  readonly userAgent: string;
  readonly safeMode: boolean;
  readonly presets: NonNullable<PteroConfig["presets"]>;
  private http: HttpCore;

  constructor(config: PteroConfig) {
    const domain = config.domain ?? config.panelUrl;
    if (!domain) throw new PteroError({ code: "DOMAIN_REQUIRED", message: "domain atau panelUrl wajib diisi." });
    this.domain = normalizeDomain(domain);
    this.applicationKey = config.ptla ?? config.applicationKey;
    this.clientKey = config.ptlc ?? config.clientKey;
    this.timeout = config.timeout ?? 15000;
    this.userAgent = config.userAgent ?? "AkadevPterodactylGateway/1.1.0";
    this.safeMode = config.safeMode ?? true;
    this.presets = config.presets ?? {};
    this.http = new HttpCore({
      domain: this.domain,
      applicationKey: this.applicationKey,
      clientKey: this.clientKey,
      timeout: this.timeout,
      userAgent: this.userAgent,
      fetcher: config.fetcher ?? fetch
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
        "2fa": () => this.request<any>({ api: "client", path: "/account/two-factor" }),
        apiKeys: {
          list: () => this.request<any>({ api: "client", path: "/account/api-keys" }),
          create: (description: string, allowedIps: string[] = []) => this.request<any>({ api: "client", method: "POST", path: "/account/api-keys", body: { description, allowed_ips: allowedIps } }),
          delete: (identifier: string) => this.request<any>({ api: "client", method: "DELETE", path: `/account/api-keys/${identifier}` })
        }
      },
      servers: {
        list: (page = 1) => this.request<any>({ api: "client", path: `/api/client?page=${page}` })
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

  get users() {
    return {
      createSmart: (input: CreateUserSmartInput, options?: OperationOptions) => this.createUserSmart(input, options),
      getOrCreate: (input: CreateUserSmartInput, options?: OperationOptions) => this.getOrCreateUser(input, options),
      findByEmail: (email: string) => this.findUserByEmail(email)
    };
  }

  get servers() {
    return {
      previewCreate: (input: CreateSmartServerInput, options?: OperationOptions) => this.previewCreateServer(input, options),
      createSmart: (input: CreateSmartServerInput, options?: OperationOptions) => this.createServerSmart(input, options)
    };
  }

  get raw() {
    return {
      application: {
        get: (path: string) => this.request<any>({ api: "application", path }),
        post: (path: string, body?: unknown) => this.request<any>({ api: "application", method: "POST", path, body }),
        patch: (path: string, body?: unknown) => this.request<any>({ api: "application", method: "PATCH", path, body }),
        delete: (path: string) => this.request<any>({ api: "application", method: "DELETE", path })
      },
      client: {
        get: (path: string) => this.request<any>({ api: "client", path }),
        post: (path: string, body?: unknown) => this.request<any>({ api: "client", method: "POST", path, body }),
        patch: (path: string, body?: unknown) => this.request<any>({ api: "client", method: "PATCH", path, body }),
        delete: (path: string) => this.request<any>({ api: "client", method: "DELETE", path })
      }
    };
  }

  server(identifier: string) {
    return new PteroServerHandle(this, identifier);
  }

  async listIds(nestId?: number) {
    const [rawNodes, rawNests] = await Promise.all([
      this.application.nodes.list(),
      this.application.nests.list()
    ]);
    const nodes = getCollection(rawNodes).map(item => getDataAttributes(item));
    const nests = getCollection(rawNests).map(item => getDataAttributes(item));
    const result: Record<string, unknown> = { nodes, nests };
    if (nestId) {
      const rawEggs = await this.application.nests.eggs.list(nestId);
      result.eggs = getCollection(rawEggs).map(item => getDataAttributes(item));
    }
    return result;
  }

  async request<T = unknown>(options: Parameters<HttpCore["request"]>[0]): Promise<T> {
    return this.http.request<T>(options);
  }

  async connect(): Promise<ConnectResult> {
    const started = Date.now();
    const application = await this.checkApplicationKey();
    const client = await this.checkClientKey();
    const mode = this.resolveMode(application.valid, client.valid);
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
    progress(options, "validate", 10, "Memvalidasi user.");
    const built = buildUserPayload(input);
    if (options?.dryRun) return { dryRun: true, payload: built.payload, generatedPassword: built.generatedPassword };
    progress(options, "request", 70, "Membuat user di Pterodactyl.");
    const raw = await this.application.users.create(built.payload);
    progress(options, "done", 100, "User berhasil dibuat.");
    return normalizeUserResponse(raw, built.generatedPassword);
  }

  private async getOrCreateUser(input: CreateUserSmartInput, options?: OperationOptions) {
    const found = await this.findUserByEmail(input.email);
    if (found) return { ...found, created: false };
    const created = await this.createUserSmart(input, options);
    return { ...created, created: true };
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
    if (!input.autoCreateUser) throw new PteroError({ code: "USER_NOT_FOUND", message: `User dengan email ${input.email} tidak ditemukan.`, hint: "Aktifkan autoCreateUser atau buat user terlebih dahulu." });
    if (!input.username) throw new PteroError({ code: "USERNAME_REQUIRED_FOR_AUTO_CREATE_USER", message: "username wajib diisi saat autoCreateUser aktif." });
    const user = await this.createUserSmart({ username: input.username, email: input.email, password: input.password ?? "auto", administrator: input.administrator ?? false });
    if ("dryRun" in user) throw new PteroError({ code: "INTERNAL_DRY_RUN_USER", message: "Dry run user tidak valid pada flow create server." });
    return { id: user.id, email: user.email, username: user.username, created: true };
  }

  private async previewCreateServer(input: CreateSmartServerInput, options?: OperationOptions) {
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
      if (error instanceof PteroError && error.code === "NO_FREE_ALLOCATION") throw new PteroError({ code: "NO_FREE_ALLOCATION", message: `Tidak ada allocation kosong di Node ID ${input.nodeId}.`, hint: error.hint, steps: error.steps, example: error.example, raw: error.raw });
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
      egg: {
        id: input.eggId,
        name: typeof eggAttr.egg_name === "string" ? eggAttr.egg_name : (typeof eggAttr.name === "string" ? eggAttr.name : undefined),
        raw: rawEgg
      },
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
    progress(options, "request", 90, "Membuat server di Pterodactyl.");
    const raw = await this.application.servers.create(preview.payload);
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
      variables: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/startup` }),
      set: async (env: string, value: string | number | boolean) => {
        const raw = await this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/startup` });
        const root = asObject(raw);
        const data = root.data;
        const variables = Array.isArray(data)
          ? data
          : asObject(asObject(asObject(data).attributes).relationships).variables;
        const list: unknown[] = Array.isArray(asObject(variables).data) ? asObject(variables).data as unknown[] : [];
        const matched = list.some((item: unknown) => String(asObject(asObject(item).attributes).env_variable ?? "").toUpperCase() === env.toUpperCase());
        if (!matched && Array.isArray(data)) {
          const fallbackMatched = data.some(item => String(asObject(asObject(item).attributes).env_variable ?? "").toUpperCase() === env.toUpperCase());
          if (!fallbackMatched) throw new PteroError({ code: "STARTUP_VARIABLE_NOT_FOUND", message: `Variable startup ${env} tidak ditemukan.` });
        }
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
      create: (database: string | { database: string; remote?: string }, remote = "%") => {
        const dbName = typeof database === "string" ? database : database.database;
        const remoteHost = typeof database === "string" ? remote : (database.remote ?? remote);
        return this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/databases`, body: { database: dbName, remote: remoteHost } });
      },
      rotatePassword: (databaseId: string) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/databases/${databaseId}/rotate-password` }),
      delete: (databaseId: string) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/databases/${databaseId}` })
    };
  }

  get backups() {
    return {
      list: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups` }),
      create: (nameOrOptions?: string | { name?: string; ignored?: string[] | string; isLocked?: boolean }, ignored?: string[] | string, isLocked = false) => {
        const name = typeof nameOrOptions === "string" || nameOrOptions === undefined ? nameOrOptions : nameOrOptions.name;
        const ignoredValue = typeof nameOrOptions === "object" && nameOrOptions !== null ? nameOrOptions.ignored : ignored;
        const locked = typeof nameOrOptions === "object" && nameOrOptions !== null ? (nameOrOptions.isLocked ?? false) : isLocked;
        return this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/backups`, body: { name, ignored: Array.isArray(ignoredValue) ? ignoredValue.join("\n") : ignoredValue, is_locked: locked } });
      },
      get: (backupId: string) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups/${backupId}` }),
      details: (backupId: string) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups/${backupId}` }),
      download: (backupId: string) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/backups/${backupId}/download` }),
      delete: (backupId: string) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/backups/${backupId}` })
    };
  }

  get schedules() {
    return {
      list: () => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/schedules` }),
      create: (input: { name: string; minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string; isActive?: boolean; onlyWhenOnline?: boolean }) => this.gateway.request<any>({
        api: "client",
        method: "POST",
        path: `/servers/${this.identifier}/schedules`,
        body: {
          name: input.name,
          minute: input.minute,
          hour: input.hour,
          day_of_month: input.dayOfMonth,
          month: input.month,
          day_of_week: input.dayOfWeek,
          is_active: input.isActive ?? true,
          only_when_online: input.onlyWhenOnline ?? false
        }
      }),
      details: (scheduleId: number) => this.gateway.request<any>({ api: "client", path: `/servers/${this.identifier}/schedules/${scheduleId}` }),
      update: (scheduleId: number, input: { name?: string; isActive?: boolean }) => this.gateway.request<any>({
        api: "client",
        method: "PATCH",
        path: `/servers/${this.identifier}/schedules/${scheduleId}`,
        body: {
          ...(typeof input.name === "string" ? { name: input.name } : {}),
          ...(typeof input.isActive === "boolean" ? { is_active: input.isActive } : {})
        }
      }),
      run: (scheduleId: number) => this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/schedules/${scheduleId}/execute` }),
      delete: (scheduleId: number) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/schedules/${scheduleId}` }),
      tasks: {
        create: (scheduleId: number, input: { action: string; payload?: string; timeOffset?: number; continueOnFailure?: boolean }) => this.gateway.request<any>({
          api: "client",
          method: "POST",
          path: `/servers/${this.identifier}/schedules/${scheduleId}/tasks`,
          body: {
            action: input.action,
            payload: input.payload,
            time_offset: input.timeOffset ?? 0,
            continue_on_failure: input.continueOnFailure ?? false
          }
        }),
        update: (scheduleId: number, taskId: number, input: { payload?: string; continueOnFailure?: boolean }) => this.gateway.request<any>({
          api: "client",
          method: "PATCH",
          path: `/servers/${this.identifier}/schedules/${scheduleId}/tasks/${taskId}`,
          body: {
            ...(typeof input.payload === "string" ? { payload: input.payload } : {}),
            ...(typeof input.continueOnFailure === "boolean" ? { continue_on_failure: input.continueOnFailure } : {})
          }
        }),
        delete: (scheduleId: number, taskId: number) => this.gateway.request<any>({ api: "client", method: "DELETE", path: `/servers/${this.identifier}/schedules/${scheduleId}/tasks/${taskId}` })
      }
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
    return this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/power`, body: { signal } });
  }

  start() {
    return this.power("start");
  }

  stop() {
    return this.power("stop");
  }

  restart() {
    return this.power("restart");
  }

  kill() {
    return this.power("kill");
  }

  async probe() {
    const [resources, startup, network, databases, backups, schedules, files] = await Promise.all([
      this.resources().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      this.startup.variables().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      this.network.list().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      this.databases.list().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      this.backups.list().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      this.schedules.list().catch(error => ({ error: error instanceof Error ? error.message : String(error) })),
      this.files.list().catch(error => ({ error: error instanceof Error ? error.message : String(error) }))
    ]);
    const checks = { resources, startup, network, databases, backups, schedules, files };
    const ok = Object.values(checks).every(item => !("error" in asObject(item)));
    return { ok, identifier: this.identifier, checks, resources, startup, network, databases, backups, schedules, files };
  }

  command(command: string) {
    if (/(^|[\s;&|])(rm\s+-rf\s+\/|:\(\)\{:\|:&\};:|mkfs\.|dd\s+if=\/dev\/zero)/i.test(command)) {
      throw new PteroError({ code: "DANGEROUS_COMMAND", message: "Command terlihat berbahaya dan diblokir oleh safe mode." });
    }
    return this.gateway.request<any>({ api: "client", method: "POST", path: `/servers/${this.identifier}/command`, body: { command } });
  }
}
