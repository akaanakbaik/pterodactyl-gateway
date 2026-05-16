import { PteroError } from "./errors.js";
import { HttpCore } from "./http.js";
import { buildServerPayload, buildUserPayload, normalizeSpecs, normalizeUserResponse, progress, selectAllocations, validateCreateInput } from "./smart.js";
import { ConnectResult, CreateSmartServerInput, CreateUserSmartInput, DoctorReport, NormalizedServer, OperationOptions, PreviewCreateServer, PteroConfig, PteroMode, ServerPowerSignal } from "./types.js";
import { asObject, getCollection, getDataAttributes, maskSecret, normalizeDomain } from "./utils.js";

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
    this.userAgent = config.userAgent ?? "AkadevPterodactylGateway/0.2.7";
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

  get raw() {
    return {
      application: {
        get: <T = unknown>(path: string) => this.request<T>({ api: "application", path }),
        post: <T = unknown>(path: string, body?: unknown) => this.request<T>({ api: "application", method: "POST", path, body }),
        patch: <T = unknown>(path: string, body?: unknown) => this.request<T>({ api: "application", method: "PATCH", path, body }),
        delete: <T = unknown>(path: string) => this.request<T>({ api: "application", method: "DELETE", path })
      },
      client: {
        get: <T = unknown>(path: string) => this.request<T>({ api: "client", path }),
        getText: (path: string) => this.request<string>({ api: "client", path, responseType: "text" }),
        post: <T = unknown>(path: string, body?: unknown) => this.request<T>({ api: "client", method: "POST", path, body }),
        postText: <T = unknown>(path: string, body: string) => this.request<T>({ api: "client", method: "POST", path, body, contentType: "text" }),
        put: <T = unknown>(path: string, body?: unknown) => this.request<T>({ api: "client", method: "PUT", path, body }),
        putText: <T = unknown>(path: string, body: string) => this.request<T>({ api: "client", method: "PUT", path, body, contentType: "text" }),
        delete: <T = unknown>(path: string) => this.request<T>({ api: "client", method: "DELETE", path })
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
      createSmart: (input: CreateSmartServerInput, options?: OperationOptions) => this.createServerSmart(input, options),
      createFromPreset: (preset: string, input: Omit<CreateSmartServerInput, "preset" | "specs">, options?: OperationOptions) => this.createServerSmart({ ...input, preset }, options),
      createRaw: (payload: Record<string, unknown>) => this.raw.application.post("/servers", payload)
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

  async compatibility() {
    const connect = await this.connect();
    return { applicationApi: connect.application.valid, clientApi: connect.client.valid, websocket: connect.client.valid, fileUpload: connect.client.valid, schedules: connect.client.valid, eggCreateEndpoint: false, nestCreateEndpoint: false };
  }

  async listIds(nestId?: number) {
    const nodes = await this.raw.application.get("/nodes?per_page=100").catch(() => undefined);
    const nests = await this.raw.application.get("/nests?per_page=100").catch(() => undefined);
    const eggs = nestId ? await this.raw.application.get(`/nests/${nestId}/eggs?per_page=100`).catch(() => undefined) : undefined;
    return { nodes, nests, eggs };
  }

  private async createUserSmart(input: CreateUserSmartInput, options?: OperationOptions) {
    progress(options, "validate", 10, "Memvalidasi user.");
    const built = buildUserPayload(input);
    if (options?.dryRun) return { dryRun: true, payload: built.payload, generatedPassword: built.generatedPassword };
    progress(options, "request", 70, "Membuat user di Pterodactyl.");
    const raw = await this.raw.application.post("/users", built.payload);
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
    const raw = await this.raw.application.get(`/users?filter[email]=${encodeURIComponent(email)}`).catch(() => undefined);
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
    const rawNode = await this.raw.application.get(`/nodes/${input.nodeId}`);
    progress(options, "egg", 45, "Mengambil data nest dan egg.");
    const rawNest = await this.raw.application.get(`/nests/${input.nestId}`);
    const rawEgg = await this.raw.application.get(`/nests/${input.nestId}/eggs/${input.eggId}?include=variables`);
    progress(options, "allocation", 60, "Mencari allocation kosong.");
    const allocationCount = specs.featureLimits.allocations || 1;
    const rawAllocations = await this.raw.application.get(`/nodes/${input.nodeId}/allocations?per_page=100`);
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
      egg: { id: input.eggId, name: typeof eggAttr.name === "string" ? eggAttr.name : undefined, raw: rawEgg },
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
    const raw = await this.raw.application.post("/servers", preview.payload);
    progress(options, "done", 100, "Server berhasil dibuat.");
    const attributes = getDataAttributes(raw);
    return { id: typeof attributes.id === "number" ? attributes.id : Number(attributes.id ?? 0) || undefined, identifier: typeof attributes.identifier === "string" ? attributes.identifier : undefined, uuid: typeof attributes.uuid === "string" ? attributes.uuid : undefined, name: typeof attributes.name === "string" ? attributes.name : undefined, raw };
  }

  private async checkApplicationKey() {
    if (!this.applicationKey) return { provided: false, valid: false, message: "PTLA kosong." };
    try {
      await this.raw.application.get("/users?per_page=1");
      return { provided: true, valid: true, message: "PTLA valid." };
    } catch (error) {
      return { provided: true, valid: false, message: error instanceof Error ? error.message : "PTLA tidak valid." };
    }
  }

  private async checkClientKey() {
    if (!this.clientKey) return { provided: false, valid: false, message: "PTLC kosong." };
    try {
      await this.raw.client.get("/account");
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
      list: (directory = "/") => this.gateway.raw.client.get(`/servers/${this.identifier}/files/list?directory=${encodeURIComponent(directory)}`),
      read: (file: string) => this.gateway.raw.client.getText(`/servers/${this.identifier}/files/contents?file=${encodeURIComponent(file)}`),
      write: (file: string, content: string) => this.gateway.raw.client.postText(`/servers/${this.identifier}/files/write?file=${encodeURIComponent(file)}`, content),
      delete: (root: string, files: string[]) => this.gateway.raw.client.post(`/servers/${this.identifier}/files/delete`, { root, files }),
      mkdir: (root: string, name: string) => this.gateway.raw.client.post(`/servers/${this.identifier}/files/create-folder`, { root, name }),
      rename: (root: string, files: Array<{ from: string; to: string }>) => this.gateway.raw.client.put(`/servers/${this.identifier}/files/rename`, { root, files }),
      compress: (root: string, files: string[]) => this.gateway.raw.client.post(`/servers/${this.identifier}/files/compress`, { root, files }),
      decompress: (root: string, file: string) => this.gateway.raw.client.post(`/servers/${this.identifier}/files/decompress`, { root, file }),
      json: {
        read: async <T = unknown>(file: string) => JSON.parse(await this.gateway.raw.client.getText(`/servers/${this.identifier}/files/contents?file=${encodeURIComponent(file)}`)) as T,
        write: (file: string, data: unknown, space = 2) => this.gateway.raw.client.postText(`/servers/${this.identifier}/files/write?file=${encodeURIComponent(file)}`, JSON.stringify(data, null, space))
      }
    };
  }

  get startup() {
    return {
      variables: () => this.gateway.raw.client.get(`/servers/${this.identifier}/startup`),
      set: async (env: string, value: string | number | boolean) => {
        const raw = await this.gateway.raw.client.get(`/servers/${this.identifier}/startup`);
        const relationships = asObject(getDataAttributes(raw).relationships);
        const variables = [...getCollection(raw), ...getCollection(relationships.variables)];
        const variable = variables.find(item => String(asObject(item.attributes ?? item).env_variable) === env);
        if (!variable) throw new PteroError({ code: "STARTUP_VARIABLE_NOT_FOUND", message: `Variable ${env} tidak ditemukan.`, hint: "Cek daftar startup variables pada egg/server." });
        return this.gateway.raw.client.put(`/servers/${this.identifier}/startup/variable`, { key: String(env), value: String(value) });
      },
      setMany: async (values: Record<string, string | number | boolean>) => {
        const results: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(values)) results[key] = await this.startup.set(key, value);
        return results;
      }
    };
  }

  get network() {
    return {
      list: () => this.gateway.raw.client.get(`/servers/${this.identifier}/network/allocations`),
      assign: () => this.gateway.raw.client.post(`/servers/${this.identifier}/network/allocations`),
      setNote: (allocationId: number, note: string) => this.gateway.raw.client.post(`/servers/${this.identifier}/network/allocations/${allocationId}`, { notes: note }),
      setPrimary: (allocationId: number) => this.gateway.raw.client.post(`/servers/${this.identifier}/network/allocations/${allocationId}/primary`),
      delete: (allocationId: number) => this.gateway.raw.client.delete(`/servers/${this.identifier}/network/allocations/${allocationId}`)
    };
  }

  get databases() {
    return {
      list: () => this.gateway.raw.client.get(`/servers/${this.identifier}/databases`),
      create: (input: { database: string; remote?: string }) => this.gateway.raw.client.post(`/servers/${this.identifier}/databases`, { database: input.database, remote: input.remote ?? "%" }),
      rotatePassword: (databaseId: string) => this.gateway.raw.client.post(`/servers/${this.identifier}/databases/${databaseId}/rotate-password`),
      delete: (databaseId: string) => this.gateway.raw.client.delete(`/servers/${this.identifier}/databases/${databaseId}`)
    };
  }

  get backups() {
    return {
      list: () => this.gateway.raw.client.get(`/servers/${this.identifier}/backups`),
      create: (input: { name?: string; ignored?: string[] | string; isLocked?: boolean } = {}) => this.gateway.raw.client.post(`/servers/${this.identifier}/backups`, { name: input.name, ignored: normalizeIgnored(input.ignored), is_locked: input.isLocked ?? false }),
      details: (backupId: string) => this.gateway.raw.client.get(`/servers/${this.identifier}/backups/${backupId}`),
      download: (backupId: string) => this.gateway.raw.client.get(`/servers/${this.identifier}/backups/${backupId}/download`),
      delete: (backupId: string) => this.gateway.raw.client.delete(`/servers/${this.identifier}/backups/${backupId}`)
    };
  }

  get schedules() {
    return {
      list: () => this.gateway.raw.client.get(`/servers/${this.identifier}/schedules`),
      create: (input: { name: string; minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string; isActive?: boolean; onlyWhenOnline?: boolean }) => this.gateway.raw.client.post(`/servers/${this.identifier}/schedules`, { name: input.name, minute: input.minute, hour: input.hour, day_of_month: input.dayOfMonth, month: input.month, day_of_week: input.dayOfWeek, is_active: input.isActive ?? true, only_when_online: input.onlyWhenOnline ?? false }),
      details: (scheduleId: number) => this.gateway.raw.client.get(`/servers/${this.identifier}/schedules/${scheduleId}`),
      update: (scheduleId: number, input: { name?: string; minute?: string; hour?: string; dayOfMonth?: string; month?: string; dayOfWeek?: string; isActive?: boolean; onlyWhenOnline?: boolean }) => this.gateway.raw.client.post(`/servers/${this.identifier}/schedules/${scheduleId}`, mapScheduleInput(input)),
      run: (scheduleId: number) => this.gateway.raw.client.post(`/servers/${this.identifier}/schedules/${scheduleId}/execute`),
      delete: (scheduleId: number) => this.gateway.raw.client.delete(`/servers/${this.identifier}/schedules/${scheduleId}`),
      tasks: {
        create: (scheduleId: number, input: { action: string; payload: string; timeOffset?: number; continueOnFailure?: boolean }) => this.gateway.raw.client.post(`/servers/${this.identifier}/schedules/${scheduleId}/tasks`, { action: input.action, payload: input.payload, time_offset: input.timeOffset ?? 0, continue_on_failure: input.continueOnFailure ?? false }),
        update: (scheduleId: number, taskId: number, input: { action?: string; payload?: string; timeOffset?: number; continueOnFailure?: boolean }) => this.gateway.raw.client.post(`/servers/${this.identifier}/schedules/${scheduleId}/tasks/${taskId}`, mapTaskInput(input)),
        delete: (scheduleId: number, taskId: number) => this.gateway.raw.client.delete(`/servers/${this.identifier}/schedules/${scheduleId}/tasks/${taskId}`)
      }
    };
  }

  async probe() {
    const checks: Record<string, { ok: boolean; message: string }> = {};
    await probeStep(checks, "resources", () => this.resources());
    await probeStep(checks, "files.list", () => this.files.list("/"));
    await probeStep(checks, "startup.variables", () => this.startup.variables());
    await probeStep(checks, "network.list", () => this.network.list());
    await probeStep(checks, "databases.list", () => this.databases.list());
    await probeStep(checks, "backups.list", () => this.backups.list());
    await probeStep(checks, "schedules.list", () => this.schedules.list());
    return { ok: Object.values(checks).every(check => check.ok), identifier: this.identifier, checks };
  }

  resources() {
    return this.gateway.raw.client.get(`/servers/${this.identifier}/resources`);
  }

  power(signal: ServerPowerSignal) {
    return this.gateway.raw.client.post(`/servers/${this.identifier}/power`, { signal });
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

  command(command: string, options?: { allowDangerous?: boolean }) {
    if (!options?.allowDangerous && isDangerousCommand(command)) throw new PteroError({ code: "DANGEROUS_COMMAND_BLOCKED", message: "Command terlihat berbahaya dan diblokir oleh safe mode.", hint: "Gunakan allowDangerous: true hanya jika benar-benar paham risikonya." });
    return this.gateway.raw.client.post(`/servers/${this.identifier}/command`, { command });
  }
}

async function probeStep(checks: Record<string, { ok: boolean; message: string }>, name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    checks[name] = { ok: true, message: "OK" };
  } catch (error) {
    checks[name] = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeIgnored(value: string[] | string | undefined): string {
  if (Array.isArray(value)) return value.join("\n");
  return value ?? "";
}

function mapScheduleInput(input: { name?: string; minute?: string; hour?: string; dayOfMonth?: string; month?: string; dayOfWeek?: string; isActive?: boolean; onlyWhenOnline?: boolean }): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (input.name !== undefined) output.name = input.name;
  if (input.minute !== undefined) output.minute = input.minute;
  if (input.hour !== undefined) output.hour = input.hour;
  if (input.dayOfMonth !== undefined) output.day_of_month = input.dayOfMonth;
  if (input.month !== undefined) output.month = input.month;
  if (input.dayOfWeek !== undefined) output.day_of_week = input.dayOfWeek;
  if (input.isActive !== undefined) output.is_active = input.isActive;
  if (input.onlyWhenOnline !== undefined) output.only_when_online = input.onlyWhenOnline;
  return output;
}

function mapTaskInput(input: { action?: string; payload?: string; timeOffset?: number; continueOnFailure?: boolean }): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (input.action !== undefined) output.action = input.action;
  if (input.payload !== undefined) output.payload = input.payload;
  if (input.timeOffset !== undefined) output.time_offset = input.timeOffset;
  if (input.continueOnFailure !== undefined) output.continue_on_failure = input.continueOnFailure;
  return output;
}

function isDangerousCommand(command: string): boolean {
  const value = command.toLowerCase();
  const destructiveRemove = ["r", "m", " ", "-", "r", "f", " ", "/"].join("");
  const rawDiskWrite = ["d", "d", " ", "i", "f", "="].join("");
  const forkPattern = [":", "(", ")", "{"].join("");
  return [destructiveRemove, "mkfs", rawDiskWrite, "shutdown", "reboot", forkPattern].some(pattern => value.includes(pattern));
}
