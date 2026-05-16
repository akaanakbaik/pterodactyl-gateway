export type PteroMode = "full" | "admin" | "client" | "raw" | "invalid";

export type BooleanLike = boolean | "yes" | "no" | "true" | "false" | "1" | "0";

export type SizeInput = number | string;

export type CpuInput = number | string;

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

export type PteroRequestOptions = {
  api: "application" | "client";
  method?: string;
  path: string;
  body?: unknown;
  contentType?: "json" | "text";
  responseType?: "json" | "text";
};
