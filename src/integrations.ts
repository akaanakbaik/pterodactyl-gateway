import type { CreateSmartServerInput, OperationOptions, PteroConfig, ServerSpecsInput } from "./types.js";
import { PteroGateway } from "./gateway.js";

export type IntegrationKind = "whatsapp-bot" | "telegram-bot" | "discord-bot" | "nodejs-api" | "website" | "python-bot" | "blank";

export type IntegrationPreset = "mini" | "basic" | "standard" | "premium" | "unlimited";

export type IntegrationServerInput = {
  kind: IntegrationKind;
  name: string;
  email?: string;
  userId?: number;
  username?: string;
  password?: string | "auto";
  autoCreateUser?: boolean;
  nodeId: number;
  nestId: number;
  eggId: number;
  preset?: IntegrationPreset;
  description?: string;
  startup?: string | "auto";
  dockerImage?: string | "auto";
  environment?: Record<string, string | number | boolean> | "auto";
  specs?: Partial<ServerSpecsInput>;
  startOnCompletion?: boolean;
};

export type IntegrationDefaults = {
  nodeId?: number;
  nestId?: number;
  eggId?: number;
  preset?: IntegrationPreset;
  autoCreateUser?: boolean;
  startOnCompletion?: boolean;
};

const KIND_DEFAULTS: Record<IntegrationKind, { preset: IntegrationPreset; startup: string | "auto"; description: string; environment: Record<string, string> }> = {
  "whatsapp-bot": {
    preset: "standard",
    startup: "npm start",
    description: "WhatsApp bot server managed by Akadev Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "whatsapp", NODE_ENV: "production" }
  },
  "telegram-bot": {
    preset: "basic",
    startup: "npm start",
    description: "Telegram bot server managed by Akadev Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "telegram", NODE_ENV: "production" }
  },
  "discord-bot": {
    preset: "basic",
    startup: "npm start",
    description: "Discord bot server managed by Akadev Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "discord", NODE_ENV: "production" }
  },
  "nodejs-api": {
    preset: "standard",
    startup: "npm start",
    description: "Node.js API server managed by Akadev Pterodactyl Gateway.",
    environment: { APP_TYPE: "api", NODE_ENV: "production" }
  },
  website: {
    preset: "standard",
    startup: "npm start",
    description: "Website server managed by Akadev Pterodactyl Gateway.",
    environment: { APP_TYPE: "website", NODE_ENV: "production" }
  },
  "python-bot": {
    preset: "basic",
    startup: "python3 main.py",
    description: "Python bot server managed by Akadev Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "python", PYTHONUNBUFFERED: "1" }
  },
  blank: {
    preset: "mini",
    startup: "bash",
    description: "Blank server managed by Akadev Pterodactyl Gateway.",
    environment: {}
  }
};

const PRESET_SPECS: Record<IntegrationPreset, ServerSpecsInput> = {
  mini: { memory: "512MB", disk: "1GB", cpu: "50%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 },
  basic: { memory: "1GB", disk: "2GB", cpu: "100%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 },
  standard: { memory: "2GB", disk: "5GB", cpu: "200%", databases: 1, allocations: 1, backups: 1, swap: 0, io: 500 },
  premium: { memory: "4GB", disk: "10GB", cpu: "300%", databases: 2, allocations: 2, backups: 2, swap: 0, io: 500 },
  unlimited: { memory: "0", disk: "0", cpu: "0", databases: 5, allocations: 3, backups: 3, swap: 0, io: 500 }
};

export function getIntegrationKinds(): IntegrationKind[] {
  return Object.keys(KIND_DEFAULTS) as IntegrationKind[];
}

export function getIntegrationDefaults(kind: IntegrationKind) {
  return KIND_DEFAULTS[kind];
}

export function createIntegrationServerInput(input: IntegrationServerInput): CreateSmartServerInput {
  const defaults = KIND_DEFAULTS[input.kind];
  if (!defaults) throw new Error(`Integration kind tidak dikenal: ${input.kind}`);
  const preset = input.preset ?? defaults.preset;
  const specs = { ...PRESET_SPECS[preset], ...input.specs };
  return {
    name: input.name,
    email: input.email,
    userId: input.userId,
    username: input.username,
    password: input.password,
    autoCreateUser: input.autoCreateUser,
    description: input.description ?? defaults.description,
    nodeId: input.nodeId,
    nestId: input.nestId,
    eggId: input.eggId,
    preset,
    specs,
    startup: input.startup ?? defaults.startup,
    dockerImage: input.dockerImage ?? "auto",
    environment: input.environment === "auto" ? "auto" : { ...defaults.environment, ...(input.environment ?? {}) },
    autoFillEnvironment: true,
    startOnCompletion: input.startOnCompletion ?? false
  };
}

export function createIntegrationService(config: PteroConfig | PteroGateway, defaults: IntegrationDefaults = {}) {
  const gateway = config instanceof PteroGateway ? config : new PteroGateway(config);
  const withDefaults = (input: Omit<IntegrationServerInput, "nodeId" | "nestId" | "eggId"> & Partial<Pick<IntegrationServerInput, "nodeId" | "nestId" | "eggId">>) => {
    const nodeId = input.nodeId ?? defaults.nodeId;
    const nestId = input.nestId ?? defaults.nestId;
    const eggId = input.eggId ?? defaults.eggId;
    if (!nodeId || !nestId || !eggId) throw new Error("nodeId, nestId, dan eggId wajib diisi di input atau defaults.");
    return createIntegrationServerInput({
      ...input,
      nodeId,
      nestId,
      eggId,
      preset: input.preset ?? defaults.preset,
      autoCreateUser: input.autoCreateUser ?? defaults.autoCreateUser,
      startOnCompletion: input.startOnCompletion ?? defaults.startOnCompletion
    });
  };
  return {
    gateway,
    input: withDefaults,
    preview: (input: Parameters<typeof withDefaults>[0], options?: OperationOptions) => gateway.servers.previewCreate(withDefaults(input), options),
    dryRun: (input: Parameters<typeof withDefaults>[0], options?: OperationOptions) => gateway.servers.createSmart(withDefaults(input), { ...options, dryRun: true }),
    create: (input: Parameters<typeof withDefaults>[0], options?: OperationOptions) => gateway.servers.createSmart(withDefaults(input), options),
    server: (identifier: string) => gateway.server(identifier)
  };
}
