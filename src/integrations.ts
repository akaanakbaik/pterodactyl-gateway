import type { BackupExportOptions, CreateSmartServerInput, OperationOptions, PteroConfig, ServerSpecsInput } from "./types.js";
import type { PteroGateway } from "./gateway.js";
import { PteroGateway as Gateway } from "./gateway.js";

export type IntegrationKind =
  | "whatsapp-bot"
  | "telegram-bot"
  | "discord-bot"
  | "nodejs-api"
  | "nodejs-worker"
  | "website"
  | "python-bot"
  | "minecraft-java"
  | "minecraft-bedrock"
  | "laravel"
  | "blank";

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
  nestId?: number;
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

type KindDefinition = {
  preset: IntegrationPreset;
  startup: string | "auto";
  description: string;
  environment: Record<string, string>;
  recommendedFiles: string[];
  dockerHint?: string;
};

const KIND_DEFAULTS: Record<IntegrationKind, KindDefinition> = {
  "whatsapp-bot": {
    preset: "standard",
    startup: "npm start",
    description: "WhatsApp bot server managed by Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "whatsapp", NODE_ENV: "production" },
    recommendedFiles: ["package.json", "index.js", "sessions/"]
  },
  "telegram-bot": {
    preset: "basic",
    startup: "npm start",
    description: "Telegram bot server managed by Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "telegram", NODE_ENV: "production" },
    recommendedFiles: ["package.json", "index.js"]
  },
  "discord-bot": {
    preset: "basic",
    startup: "npm start",
    description: "Discord bot server managed by Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "discord", NODE_ENV: "production" },
    recommendedFiles: ["package.json", "index.js"]
  },
  "nodejs-api": {
    preset: "standard",
    startup: "npm start",
    description: "Node.js API server managed by Pterodactyl Gateway.",
    environment: { APP_TYPE: "api", NODE_ENV: "production" },
    recommendedFiles: ["package.json", "src/index.js"]
  },
  "nodejs-worker": {
    preset: "basic",
    startup: "npm start",
    description: "Node.js worker or queue consumer managed by Pterodactyl Gateway.",
    environment: { APP_TYPE: "worker", NODE_ENV: "production" },
    recommendedFiles: ["package.json", "worker.js"]
  },
  website: {
    preset: "standard",
    startup: "npm start",
    description: "Website server managed by Pterodactyl Gateway.",
    environment: { APP_TYPE: "website", NODE_ENV: "production" },
    recommendedFiles: ["package.json", "public/"]
  },
  "python-bot": {
    preset: "basic",
    startup: "python3 main.py",
    description: "Python bot server managed by Pterodactyl Gateway.",
    environment: { BOT_PLATFORM: "python", PYTHONUNBUFFERED: "1" },
    recommendedFiles: ["requirements.txt", "main.py"]
  },
  "minecraft-java": {
    preset: "premium",
    startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
    description: "Minecraft Java server managed by Pterodactyl Gateway.",
    environment: { SERVER_JARFILE: "server.jar", BUILD_NUMBER: "latest", MINECRAFT_VERSION: "latest" },
    recommendedFiles: ["server.properties", "server.jar"],
    dockerHint: "ghcr.io/parkervcp/yolks:java_21"
  },
  "minecraft-bedrock": {
    preset: "premium",
    startup: "./bedrock_server",
    description: "Minecraft Bedrock server managed by Pterodactyl Gateway.",
    environment: { SERVER_NAME: "Bedrock Server", GAMEMODE: "survival", DIFFICULTY: "normal" },
    recommendedFiles: ["server.properties", "bedrock_server"],
    dockerHint: "ghcr.io/parkervcp/yolks:debian"
  },
  laravel: {
    preset: "standard",
    startup: "php artisan serve --host 0.0.0.0 --port {{SERVER_PORT}}",
    description: "Laravel application managed by Pterodactyl Gateway.",
    environment: { APP_ENV: "production", APP_DEBUG: "false" },
    recommendedFiles: ["artisan", "composer.json", "public/"],
    dockerHint: "ghcr.io/parkervcp/yolks:php_8.3"
  },
  blank: {
    preset: "mini",
    startup: "bash",
    description: "Blank server managed by Pterodactyl Gateway.",
    environment: {},
    recommendedFiles: []
  }
};

const PRESET_SPECS: Record<IntegrationPreset, ServerSpecsInput> = {
  mini: { memory: "512MB", disk: "1GB", cpu: "50%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 },
  basic: { memory: "1GB", disk: "2GB", cpu: "100%", databases: 0, allocations: 1, backups: 0, swap: 0, io: 500 },
  standard: { memory: "2GB", disk: "5GB", cpu: "200%", databases: 1, allocations: 1, backups: 1, swap: 0, io: 500 },
  premium: { memory: "4GB", disk: "10GB", cpu: "300%", databases: 2, allocations: 2, backups: 2, swap: 0, io: 500 },
  unlimited: { memory: 0, disk: 0, cpu: 0, databases: 5, allocations: 3, backups: 3, swap: 0, io: 500 }
};

export function getIntegrationKinds(): IntegrationKind[] {
  return Object.keys(KIND_DEFAULTS) as IntegrationKind[];
}

export function getIntegrationDefaults(kind: IntegrationKind) {
  const definition = KIND_DEFAULTS[kind];
  if (!definition) throw new Error(`Integration kind tidak dikenal: ${kind}`);
  return { ...definition, environment: { ...definition.environment }, recommendedFiles: [...definition.recommendedFiles] };
}

export function getIntegrationPresets(): Record<IntegrationPreset, ServerSpecsInput> {
  return Object.fromEntries(
    Object.entries(PRESET_SPECS).map(([name, specs]) => [name, { ...specs }])
  ) as Record<IntegrationPreset, ServerSpecsInput>;
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
    nestId: input.nestId ?? 5,
    eggId: input.eggId,
    preset,
    specs,
    startup: input.startup ?? defaults.startup,
    dockerImage: input.dockerImage ?? defaults.dockerHint ?? "auto",
    environment: input.environment === "auto" ? "auto" : { ...defaults.environment, ...(input.environment ?? {}) },
    autoFillEnvironment: true,
    startOnCompletion: input.startOnCompletion ?? false
  };
}

export function createIntegrationService(config: PteroConfig | PteroGateway, defaults: IntegrationDefaults = {}) {
  const gateway = config instanceof Gateway ? config : new Gateway(config);
  const withDefaults = (input: Omit<IntegrationServerInput, "nodeId" | "nestId" | "eggId"> & Partial<Pick<IntegrationServerInput, "nodeId" | "nestId" | "eggId">>) => {
    const nodeId = input.nodeId ?? defaults.nodeId;
    const eggId = input.eggId ?? defaults.eggId;
    if (!nodeId || !eggId) throw new Error("nodeId dan eggId wajib diisi di input atau defaults.");
    return createIntegrationServerInput({
      ...input,
      nodeId,
      nestId: input.nestId ?? defaults.nestId ?? 5,
      eggId,
      preset: input.preset ?? defaults.preset,
      autoCreateUser: input.autoCreateUser ?? defaults.autoCreateUser,
      startOnCompletion: input.startOnCompletion ?? defaults.startOnCompletion
    });
  };
  return {
    gateway,
    input: withDefaults,
    preview: (input: Parameters<typeof withDefaults>[0], options?: OperationOptions) => gateway.smart.servers.preview(withDefaults(input), options),
    dryRun: (input: Parameters<typeof withDefaults>[0], options?: OperationOptions) =>
      gateway.smart.servers.create(withDefaults(input), { ...options, dryRun: true }),
    create: (input: Parameters<typeof withDefaults>[0], options?: OperationOptions) => gateway.smart.servers.create(withDefaults(input), options),
    plan: (input: Parameters<typeof withDefaults>[0], options?: { strategy?: "balanced" | "pack" | "spread"; reservePercent?: number }) => {
      const prepared = withDefaults(input);
      return gateway.smart.servers.plan(prepared.specs!, options);
    },
    backup: (serverId: number, options?: BackupExportOptions) => gateway.exportAndEmailBackup(serverId, undefined, undefined, options),
    server: (identifier: string) => gateway.server(identifier)
  };
}
