export type PteroMode = "full" | "admin" | "client" | "raw" | "invalid";

export type BooleanLike = boolean | "yes" | "no" | "true" | "false" | "1" | "0";

export type SizeInput = number | string;

export type CpuInput = number | string;

export type ServerPowerSignal = "start" | "stop" | "restart" | "kill";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type ApiScope = "application" | "client";

export type QueryValue = string | number | boolean | null | undefined;

export type QueryInput = Record<string, QueryValue | QueryValue[]>;

export type RetryConfig = {
  retries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: number[];
  retryOnNetwork?: boolean;
};

export type RateLimitConfig = {
  requestsPerSecond?: number;
  burst?: number;
};

export type CacheConfig = {
  enabled?: boolean;
  ttl?: number;
  maxEntries?: number;
};

export type CircuitBreakerConfig = {
  enabled?: boolean;
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMax?: number;
};

export type RequestHookContext = {
  api: ApiScope;
  method: HttpMethod;
  url: string;
  attempt: number;
};

export type ResponseHookContext = RequestHookContext & {
  status: number;
  duration: number;
  cached: boolean;
};

export type RetryHookContext = RequestHookContext & {
  delay: number;
  status?: number;
  error: string;
};

export type ErrorHookContext = RequestHookContext & {
  status?: number;
  error: string;
};

export type GatewayHooks = {
  onRequest?: (context: RequestHookContext) => void;
  onResponse?: (context: ResponseHookContext) => void;
  onRetry?: (context: RetryHookContext) => void;
  onError?: (context: ErrorHookContext) => void;
};

export type PteroConfig = {
  domain?: string;
  panelUrl?: string;
  ptla?: string;
  ptlc?: string;
  applicationKey?: string;
  clientKey?: string;
  timeout?: number;
  userAgent?: string;
  safeMode?: boolean;
  debug?: boolean;
  fetcher?: typeof fetch;
  presets?: Record<string, ServerSpecsInput>;
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  circuitBreaker?: CircuitBreakerConfig;
  hooks?: GatewayHooks;
  defaultNodeId?: number;
  defaultNestId?: number;
  defaultEggId?: number;
  nodeStrategy?: PlacementStrategy;
};

export type ConnectResult = {
  ok: boolean;
  mode: PteroMode;
  domain: string;
  latency: number;
  application: KeyCheckResult;
  client: KeyCheckResult;
};

export type KeyCheckResult = {
  provided: boolean;
  valid: boolean;
  message?: string;
};

export type DoctorCheck = {
  name: string;
  ok: boolean;
  message?: string;
  fix?: string;
};

export type PanelCapabilities = {
  nests: boolean;
  eggs: boolean;
  applicationApi: boolean;
  clientApi: boolean;
};

export type DoctorReport = {
  ok: boolean;
  mode: PteroMode;
  checks: DoctorCheck[];
  capabilities?: PanelCapabilities;
};

export type ProgressStep = {
  stage: string;
  percent: number;
  message: string;
};

export type OperationOptions = {
  dryRun?: boolean;
  raw?: boolean;
  waitForInstall?: boolean | number;
  onProgress?: (step: ProgressStep) => void;
};

export type CreateUserSmartInput = {
  username: string;
  email: string;
  password: string | "auto";
  administrator: BooleanLike;
  firstName?: string;
  lastName?: string;
  language?: string;
};

export type NormalizedUser = {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  administrator?: boolean;
  generatedPassword?: string;
  created?: boolean;
  raw?: unknown;
};

export type ServerSpecsInput = {
  memory: SizeInput;
  disk: SizeInput;
  cpu: CpuInput;
  cpuPinning?: string;
  swap?: SizeInput;
  io?: number;
  databases: number;
  allocations: number;
  backups: number;
};

export type AllocationStrategy =
  | "top"
  | "lowest-port"
  | "highest-port"
  | "random"
  | "range"
  | "best-fit"
  | "spread"
  | "contiguous";

export type AllocationInput =
  | "auto"
  | {
      default?: number | "auto";
      additional?: number[] | "auto";
      strategy?: AllocationStrategy;
      portRange?: [number, number];
      seed?: number;
    };

export type CreateSmartServerInput = {
  name: string;
  email?: string;
  userId?: number;
  username?: string;
  password?: string | "auto";
  administrator?: BooleanLike;
  autoCreateUser?: boolean;
  description: string;
  nodeId: number;
  nestId?: number;
  eggId: number;
  specs?: ServerSpecsInput;
  preset?: string;
  startup?: string | "auto";
  dockerImage?: string | "auto";
  environment?: Record<string, string | number | boolean> | "auto";
  autoFillEnvironment?: boolean;
  allocation?: AllocationInput;
  startOnCompletion?: boolean;
  oomDisabled?: boolean;
  skipScripts?: boolean;
};

export type PreviewCreateServer = {
  ok: boolean;
  user: { id: number; email?: string; username?: string; created?: boolean };
  node: { id: number; name?: string; raw?: unknown };
  nest: { id: number; name?: string; raw?: unknown };
  egg: { id: number; name?: string; raw?: unknown };
  dockerImage: string;
  startup: string;
  environment: Record<string, string>;
  allocation: { default: number; additional: number[] };
  limits: Record<string, unknown>;
  featureLimits: Record<string, number>;
  payload: Record<string, unknown>;
};

export type NormalizedServer = {
  id?: number;
  identifier?: string;
  uuid?: string;
  name?: string;
  user?: {
    id: number;
    email?: string;
    username?: string;
    created?: boolean;
    pending?: boolean;
    generatedPassword?: string;
  };
  raw?: unknown;
};

export type PteroResource<T> = {
  object?: string;
  attributes: T;
  meta?: Record<string, unknown>;
};

export type PteroPagination = {
  current_page: number;
  total_pages: number;
  total?: number;
  count?: number;
  per_page?: number;
};

export type PteroCollection<T> = {
  object?: string;
  data: PteroResource<T>[];
  meta?: { pagination?: PteroPagination };
};

export type RequestOptions = {
  api: ApiScope;
  method?: HttpMethod;
  path: string;
  query?: QueryInput;
  body?: unknown;
  contentType?: "json" | "text" | "multipart";
  responseType?: "json" | "text";
  rejectHtml?: boolean;
  retryUnsafe?: boolean;
  cache?: boolean | number;
  dedupe?: boolean;
  timeout?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export type PteroRequestOptions = RequestOptions;

export type GatewayMetrics = {
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  cacheHits: number;
  cacheMisses: number;
  circuitOpenings: number;
  rateLimitWaits: number;
  byStatus: Record<string, number>;
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  startedAt: string;
  uptimeMs: number;
};

export type NodeCapacity = {
  nodeId: number;
  name: string;
  memory: { total: number; allocated: number; free: number; percent: number };
  disk: { total: number; allocated: number; free: number; percent: number };
  allocations: { total: number; assigned: number; free: number; fragmentation: number; largestGap: number };
  servers: number;
  score: number;
  unlimited: boolean;
};

export type PlacementStrategy = "balanced" | "pack" | "spread" | "memory" | "disk" | "ports";

export type PlacementRequest = {
  specs: ServerSpecsInput;
  nodes: unknown[];
  allocations?: Record<number, unknown[]>;
  servers?: unknown[];
  strategy?: PlacementStrategy;
  reservePercent?: number;
  requirePorts?: number;
};

export type PlacementCandidate = {
  nodeId: number;
  nodeName: string;
  feasible: boolean;
  score: number;
  freeMemory: number;
  freeDisk: number;
  freePorts: number;
  utilization: number;
  reasons: string[];
};

export type PlacementPlan = {
  ok: boolean;
  strategy: PlacementStrategy;
  requiredPorts: number;
  selected: PlacementCandidate | null;
  candidates: PlacementCandidate[];
  message?: string;
};

export type CapacityForecast = {
  nodeId: number;
  serverCapacity: number;
  memoryCapacity: number;
  diskCapacity: number;
  portCapacity: number;
  limitingFactor: "memory" | "disk" | "ports" | "none";
};

export type BulkResult<T = unknown> = {
  total: number;
  success: number;
  failed: number;
  results: Array<{ index: number; ok: boolean; value?: T; error?: string }>;
};

export type BulkOptions = {
  concurrency?: number;
  stopOnError?: boolean;
  onProgress?: (done: number, total: number) => void;
};

export type WaitOptions = {
  timeout?: number;
  interval?: number;
  signal?: AbortSignal;
  onPoll?: (snapshot: unknown) => void;
};

export type PteroAppUser = {
  id: number;
  external_id: string | null;
  uuid: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  language: string;
  root_admin: boolean;
  "2fa": boolean;
  created_at: string;
  updated_at: string;
};

export type PteroAppNode = {
  id: number;
  uuid: string;
  public: boolean;
  name: string;
  description: string | null;
  location_id: number;
  fqdn: string;
  scheme: string;
  behind_proxy: boolean;
  maintenance_mode: boolean;
  memory: number;
  memory_overallocate: number;
  disk: number;
  disk_overallocate: number;
  upload_size: number;
  daemon_listen: number;
  daemon_sftp: number;
  daemon_base: string;
  allocated_resources?: { memory: number; disk: number };
  created_at: string;
  updated_at: string;
};

export type PteroAppServer = {
  id: number;
  external_id: string | null;
  uuid: string;
  identifier: string;
  name: string;
  description: string;
  status: string | null;
  suspended: boolean;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
    threads: string | null;
    oom_disabled: boolean;
  };
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
  user: number;
  node: number;
  allocation: number;
  nest?: number;
  egg: number;
  pack: number | null;
  container: {
    startup_command: string;
    image: string;
    installed: number;
    environment: Record<string, string | number | boolean>;
    skip_scripts?: boolean;
  };
  created_at: string;
  updated_at: string;
};

export type PteroClientServer = {
  server_owner: boolean;
  identifier: string;
  uuid: string;
  name: string;
  node: string;
  sftp_details: {
    ip: string;
    port: number;
  };
  description: string;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
    threads: string | null;
  };
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
  is_suspended: boolean;
  is_installing: boolean;
  relationships?: {
    allocations?: {
      data: Array<{
        attributes: {
          id: number;
          ip: string;
          ip_alias: string | null;
          port: number;
          notes: string | null;
          is_default: boolean;
        };
      }>;
    };
  };
};

export type PteroWebSocketAuth = {
  token: string;
  socket: string;
};

export type PteroWebSocketOptions = {
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  heartbeatInterval?: number;
  timeout?: number;
  autoAuthenticate?: boolean;
};

export type PteroWebSocketStats = {
  connected: boolean;
  reconnects: number;
  messagesSent: number;
  messagesReceived: number;
  connectedAt?: number;
  lastMessageAt?: number;
};

export type PteroServerResources = {
  current_state: string;
  is_suspended: boolean;
  resources: {
    memory_bytes: number;
    cpu_absolute: number;
    disk_bytes: number;
    network_rx_bytes: number;
    network_tx_bytes: number;
    uptime: number;
  };
};

export type UpdateServerSpecsInput = {
  memory?: SizeInput;
  disk?: SizeInput;
  cpu?: CpuInput;
  cpuPinning?: string;
  swap?: SizeInput;
  io?: number;
  oomDisabled?: boolean;
  databases?: number;
  allocations?: number;
  backups?: number;
};

export type ChangeServerOwnershipInput = {
  userId?: number;
  email?: string;
  username?: string;
  password?: string;
};

export type ChangeServerNestEggInput = {
  nestId?: number;
  nestName?: string;
  eggId?: number;
  eggName?: string;
  dockerImage?: string;
  startup?: string;
  environment?: Record<string, string | number | boolean>;
  skipScripts?: boolean;
};

export type EmailAttachment = {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption?: string;
  fromAddress?: string;
  fromName?: string;
  rejectUnauthorized?: boolean;
};

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  smtp?: SmtpConfig;
};

export type BackupExportOptions = {
  targetEmail?: string;
  smtp?: SmtpConfig;
  ignored?: string[];
  pollInterval?: number;
  timeout?: number;
  keepPanelBackup?: boolean;
  attachmentLimitBytes?: number;
  format?: "zip" | "tar.gz";
};

export type BackupExportResult = {
  success: boolean;
  serverName: string;
  email: string;
  fileName: string;
  size: string;
  bytes: number;
  backupUuid: string;
  panelBackupRetained: boolean;
};

export type ScheduleTask = {
  action: "power" | "command" | "backup";
  payload: string;
  timeOffset?: number;
  continueOnFailure?: boolean;
};

export type ScheduleDefinition = {
  name: string;
  cron: string;
  onlyWhenOnline?: boolean;
  isActive?: boolean;
  tasks: ScheduleTask[];
};

export type FileEntry = {
  name: string;
  mode: string;
  mode_bits: string;
  size: number;
  is_file: boolean;
  is_symlink: boolean;
  mimetype: string;
  created_at: string;
  modified_at: string;
  directory?: string;
  file?: boolean;
};

export type FileListResult = {
  object?: string;
  data: FileEntry[];
};
