export type PteroMode = "full" | "admin" | "client" | "raw" | "invalid";

export type BooleanLike = boolean | "yes" | "no" | "true" | "false" | "1" | "0";

export type SizeInput = number | string;

export type CpuInput = number | string;

export type ServerPowerSignal = "start" | "stop" | "restart" | "kill";

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
  retry?: {
    retries?: number;
    baseDelay?: number;
    maxDelay?: number;
    retryOn?: number[];
  };
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

export type DoctorReport = {
  ok: boolean;
  mode: PteroMode;
  checks: DoctorCheck[];
};

export type ProgressStep = {
  stage: string;
  percent: number;
  message: string;
};

export type OperationOptions = {
  dryRun?: boolean;
  raw?: boolean;
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

export type AllocationStrategy = "top" | "lowest-port" | "highest-port" | "random" | "range";

export type AllocationInput = "auto" | {
  default?: number | "auto";
  additional?: number[] | "auto";
  strategy?: AllocationStrategy;
  portRange?: [number, number];
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
  nestId: number;
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
  raw?: unknown;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

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

export type PteroRequestOptions = {
  api: "application" | "client";
  method?: HttpMethod;
  path: string;
  body?: unknown;
  contentType?: "json" | "text";
  responseType?: "json" | "text";
  rejectHtml?: boolean;
  retryUnsafe?: boolean;
};

export interface PteroAppUser {
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
}

export interface PteroAppNode {
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
  created_at: string;
  updated_at: string;
}

export interface PteroAppServer {
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
  nest: number;
  egg: number;
  pack: number | null;
  container: {
    startup_command: string;
    image: string;
    installed: number;
    environment: Record<string, string | number | boolean>;
  };
  created_at: string;
  updated_at: string;
}

export interface PteroClientServer {
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
}

export interface PteroWebSocketAuth {
  token: string;
  socket: string;
}

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
