import { PteroError, ErrorFactory } from "./errors.js";
import { normalizeSpecs as normalizePlannerSpecs, selectAllocations as selectPlannerAllocations } from "./planner.js";
import { AllocationInput, CreateSmartServerInput, CreateUserSmartInput, OperationOptions, ServerSpecsInput } from "./types.js";
import {
  asObject,
  emitProgress,
  ensureNonEmptyString,
  ensureNonNegativeInteger,
  ensurePositiveInteger,
  generatePasswordWithPolicy,
  getCollection,
  getDataAttributes,
  toBoolean,
  validateEmail,
  validateUsername
} from "./utils.js";

export function buildUserPayload(input: CreateUserSmartInput): { payload: Record<string, unknown>; generatedPassword?: string } {
  const username = validateUsername(input.username);
  const email = validateEmail(input.email);
  const generatedPassword = input.password === "auto" ? generatePasswordWithPolicy(20) : undefined;
  const password = generatedPassword ?? ensureNonEmptyString(input.password, "password");
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  return {
    payload: {
      username,
      email,
      first_name: input.firstName?.trim() || username,
      last_name: input.lastName?.trim() || username,
      password,
      root_admin: toBoolean(input.administrator),
      language: input.language ?? "en"
    },
    generatedPassword
  };
}

export function normalizeUserResponse(raw: unknown, generatedPassword?: string) {
  const attributes = getDataAttributes(raw);
  const id = Number(attributes.id ?? asObject(raw).id ?? 0);
  return {
    id,
    username: String(attributes.username ?? ""),
    email: String(attributes.email ?? ""),
    firstName: typeof attributes.first_name === "string" ? attributes.first_name : undefined,
    lastName: typeof attributes.last_name === "string" ? attributes.last_name : undefined,
    administrator: typeof attributes.root_admin === "boolean" ? attributes.root_admin : undefined,
    generatedPassword,
    raw
  };
}

export function normalizeSpecs(specs: ServerSpecsInput) {
  const normalized = normalizePlannerSpecs(specs);
  return {
    limits: {
      memory: normalized.memory,
      swap: normalized.swap,
      disk: normalized.disk,
      io: normalized.io,
      cpu: normalized.cpu,
      threads: specs.cpuPinning?.trim() ? specs.cpuPinning.trim() : null
    },
    featureLimits: {
      databases: normalized.databases,
      allocations: normalized.allocations,
      backups: normalized.backups
    },
    normalized
  };
}

export function selectAllocations(
  raw: unknown,
  count: number,
  input: AllocationInput | undefined
): { default: number; additional: number[] } {
  if (typeof input === "object" && typeof input.default === "number") {
    if (input.default <= 0) throw new Error("allocation.default harus lebih dari 0.");
    const additional = Array.isArray(input.additional) ? input.additional.filter(id => Number.isInteger(id) && id > 0) : [];
    return { default: input.default, additional };
  }

  const strategy = typeof input === "object" ? input.strategy ?? "lowest-port" : "lowest-port";
  const portRange = typeof input === "object" ? input.portRange : undefined;
  const seed = typeof input === "object" ? input.seed : undefined;
  const items = getCollection(raw).map(item => {
    const attributes = asObject(item.attributes ?? item);
    return {
      id: Number(attributes.id ?? 0),
      ip: String(attributes.ip ?? ""),
      port: Number(attributes.port ?? 0),
      assigned: Boolean(attributes.assigned)
    };
  });

  try {
    const selection = selectPlannerAllocations(items, Math.max(1, count), strategy, { portRange, seed });
    return {
      default: selection.ids[0]!,
      additional: selection.ids.slice(1)
    };
  } catch (error) {
    if (strategy === "range" && portRange) {
      throw new PteroError({
        code: "NO_FREE_ALLOCATION",
        message: `Tidak ada alokasi port kosong dalam rentang ${portRange[0]}-${portRange[1]}.`,
        hint: "Perluas rentang port atau tambahkan alokasi baru di panel.",
        cause: error
      });
    }
    throw ErrorFactory.noFreeAllocation(0);
  }
}

export function buildEnvironment(rawEgg: unknown, input: CreateSmartServerInput): Record<string, string> {
  const attributes = getDataAttributes(rawEgg);
  const relationships = asObject(attributes.relationships);
  const variables = getCollection(relationships.variables);
  const output: Record<string, string> = {};
  const useEggDefaults = input.autoFillEnvironment !== false;

  if (useEggDefaults) {
    for (const variable of variables) {
      const variableAttributes = asObject(variable.attributes ?? variable);
      const env = String(variableAttributes.env_variable ?? "");
      if (!env) continue;
      const defaultValue = variableAttributes.default_value;
      const rules = String(variableAttributes.rules ?? "");
      if (defaultValue !== undefined && defaultValue !== null) output[env] = String(defaultValue);
      else if (rules.includes("required")) {
        throw new PteroError({
          code: "EGG_VARIABLE_REQUIRED",
          message: `Variable ${env} wajib diisi tetapi tidak memiliki nilai default.`,
          hint: `Tambahkan environment.${env} saat membuat server.`,
          example: { environment: { [env]: "isi-di-sini" } }
        });
      } else output[env] = "";
    }
  }

  if (input.environment && input.environment !== "auto") {
    for (const [key, value] of Object.entries(input.environment)) output[key] = String(value);
  }

  return output;
}

export function resolveDockerImage(rawEgg: unknown, input?: string): string {
  if (input && input !== "auto") return input;
  const attributes = getDataAttributes(rawEgg);
  const dockerImages = asObject(attributes.docker_images);
  const preferred = Object.values(dockerImages).find(value => typeof value === "string" && value.trim());
  const dockerImage = preferred ?? attributes.docker_image;
  if (typeof dockerImage === "string" && dockerImage.trim()) return dockerImage.trim();
  throw new PteroError({
    code: "DOCKER_IMAGE_NOT_FOUND",
    message: "Docker image default tidak ditemukan pada egg.",
    hint: "Isi dockerImage secara manual atau atur Docker Images pada egg.",
    example: { dockerImage: "ghcr.io/parkervcp/yolks:nodejs_22" }
  });
}

export function resolveStartup(rawEgg: unknown, input?: string): string {
  if (input && input !== "auto") return input;
  const attributes = getDataAttributes(rawEgg);
  if (typeof attributes.startup === "string" && attributes.startup.trim()) return attributes.startup;
  throw new PteroError({
    code: "STARTUP_NOT_FOUND",
    message: "Startup command tidak ditemukan pada egg.",
    hint: "Isi startup secara manual atau atur Startup Command pada egg.",
    example: { startup: "npm start" }
  });
}

export function buildServerPayload(
  input: CreateSmartServerInput,
  resolved: {
    userId: number;
    rawEgg: unknown;
    allocation: { default: number; additional: number[] };
    specs: ReturnType<typeof normalizeSpecs>;
  }
): Record<string, unknown> {
  const name = ensureNonEmptyString(input.name, "name");
  const description = ensureNonEmptyString(input.description, "description");
  ensurePositiveInteger(input.nodeId, "nodeId");
  ensurePositiveInteger(input.eggId, "eggId");
  const nestId = input.nestId ?? 5;
  ensurePositiveInteger(nestId, "nestId");
  return {
    name,
    user: resolved.userId,
    description,
    nest: nestId,
    egg: input.eggId,
    docker_image: resolveDockerImage(resolved.rawEgg, input.dockerImage),
    startup: resolveStartup(resolved.rawEgg, input.startup),
    environment: buildEnvironment(resolved.rawEgg, input),
    limits: {
      ...resolved.specs.limits,
      oom_disabled: input.oomDisabled ?? false
    },
    feature_limits: resolved.specs.featureLimits,
    allocation: resolved.allocation,
    start_on_completion: input.startOnCompletion ?? true,
    skip_scripts: input.skipScripts ?? false
  };
}

export function validateCreateInput(input: CreateSmartServerInput, specs: ServerSpecsInput | undefined): ServerSpecsInput {
  ensureNonEmptyString(input.name, "name");
  ensureNonEmptyString(input.description, "description");
  ensurePositiveInteger(input.nodeId, "nodeId");
  ensurePositiveInteger(input.eggId, "eggId");
  if (input.nestId !== undefined) ensurePositiveInteger(input.nestId, "nestId");
  if (!input.userId && !input.email) throw new PteroError({ code: "USER_REQUIRED", message: "email atau userId wajib diisi untuk membuat server." });
  if (!specs) throw new PteroError({ code: "SPECS_REQUIRED", message: "specs wajib diisi kecuali menggunakan preset yang tersedia." });
  return specs;
}

export function validateUpdateSpecs(input: {
  memory?: unknown;
  disk?: unknown;
  cpu?: unknown;
  io?: unknown;
  databases?: unknown;
  allocations?: unknown;
  backups?: unknown;
}): void {
  if (input.io !== undefined) ensureNonNegativeInteger(input.io, "io");
  if (input.databases !== undefined) ensureNonNegativeInteger(input.databases, "databases");
  if (input.allocations !== undefined) ensureNonNegativeInteger(input.allocations, "allocations");
  if (input.backups !== undefined) ensureNonNegativeInteger(input.backups, "backups");
}

export function progress(options: OperationOptions | undefined, stage: string, percent: number, message: string): void {
  emitProgress(options?.onProgress, stage, percent, message);
}
