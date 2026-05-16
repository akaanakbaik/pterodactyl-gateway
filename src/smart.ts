import { noFreeAllocation, PteroError } from "./errors.js";
import { AllocationInput, CreateSmartServerInput, CreateUserSmartInput, OperationOptions, PreviewCreateServer, ServerSpecsInput } from "./types.js";
import { asObject, emitProgress, ensureNonEmptyString, ensureNonNegativeInteger, ensurePositiveInteger, generatePassword, getCollection, getDataAttributes, parseCpu, parseSizeToMiB, toBoolean } from "./utils.js";

export function buildUserPayload(input: CreateUserSmartInput): { payload: Record<string, unknown>; generatedPassword?: string } {
  const username = ensureNonEmptyString(input.username, "username");
  const email = ensureNonEmptyString(input.email, "email");
  const generatedPassword = input.password === "auto" ? generatePassword() : undefined;
  const password = generatedPassword ?? ensureNonEmptyString(input.password, "password");
  const administrator = toBoolean(input.administrator);
  return {
    payload: {
      username,
      email,
      first_name: input.firstName?.trim() || username,
      last_name: input.lastName?.trim() || username,
      password,
      root_admin: administrator,
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
  const memory = parseSizeToMiB(specs.memory);
  const disk = parseSizeToMiB(specs.disk);
  const cpu = parseCpu(specs.cpu);
  const swap = specs.swap === undefined ? 0 : parseSizeToMiB(specs.swap);
  const io = specs.io === undefined ? 500 : ensureNonNegativeInteger(specs.io, "io");
  const databases = ensureNonNegativeInteger(specs.databases, "databases");
  const allocations = ensureNonNegativeInteger(specs.allocations, "allocations");
  const backups = ensureNonNegativeInteger(specs.backups, "backups");
  return {
    limits: {
      memory,
      swap,
      disk,
      io,
      cpu,
      threads: specs.cpuPinning?.trim() ? specs.cpuPinning.trim() : null
    },
    featureLimits: {
      databases,
      allocations,
      backups
    }
  };
}

export function selectAllocations(raw: unknown, count: number, input: AllocationInput | undefined): { default: number; additional: number[] } {
  if (typeof input === "object" && typeof input.default === "number") {
    return {
      default: input.default,
      additional: Array.isArray(input.additional) ? input.additional : []
    };
  }

  const strategy = typeof input === "object" ? input.strategy ?? "top" : "top";
  const portRange = typeof input === "object" ? input.portRange : undefined;
  const free = getCollection(raw)
    .map(item => {
      const attributes = asObject(item.attributes ?? item);
      return {
        id: Number(attributes.id ?? 0),
        port: Number(attributes.port ?? 0),
        assigned: Boolean(attributes.assigned)
      };
    })
    .filter(item => item.id > 0 && !item.assigned)
    .filter(item => !portRange || (item.port >= portRange[0] && item.port <= portRange[1]));

  if (strategy === "lowest-port" || strategy === "range") free.sort((a, b) => a.port - b.port);
  if (strategy === "highest-port") free.sort((a, b) => b.port - a.port);
  if (strategy === "random") free.sort(() => Math.random() - 0.5);

  const required = Math.max(1, count);
  if (free.length < required) throw noFreeAllocation(0);
  return {
    default: free[0]!.id,
    additional: free.slice(1, required).map(item => item.id)
  };
}

export function buildEnvironment(rawEgg: unknown, input: CreateSmartServerInput): Record<string, string> {
  if (input.environment && input.environment !== "auto") {
    return Object.fromEntries(Object.entries(input.environment).map(([key, value]) => [key, String(value)]));
  }

  const attributes = getDataAttributes(rawEgg);
  const relationships = asObject(attributes.relationships);
  const variables = getCollection(relationships.variables);
  const output: Record<string, string> = {};

  for (const variable of variables) {
    const variableAttributes = asObject(variable.attributes ?? variable);
    const env = String(variableAttributes.env_variable ?? "");
    if (!env) continue;
    const defaultValue = variableAttributes.default_value;
    const isRequired = Boolean(variableAttributes.rules && String(variableAttributes.rules).includes("required"));
    if (defaultValue !== undefined && defaultValue !== null) output[env] = String(defaultValue);
    else if (isRequired) {
      throw new PteroError({
        code: "EGG_VARIABLE_REQUIRED",
        message: `Variable ${env} wajib diisi tetapi tidak punya default value.`,
        hint: `Tambahkan environment.${env} saat create server.`,
        example: { environment: { [env]: "isi-di-sini" } }
      });
    } else output[env] = "";
  }

  return output;
}

export function resolveDockerImage(rawEgg: unknown, input?: string): string {
  if (input && input !== "auto") return input;
  const attributes = getDataAttributes(rawEgg);
  const dockerImages = asObject(attributes.docker_images);
  const firstImage = Object.values(dockerImages).find(value => typeof value === "string");
  const dockerImage = firstImage ?? attributes.docker_image;
  if (typeof dockerImage === "string" && dockerImage.trim()) return dockerImage;
  throw new PteroError({
    code: "DOCKER_IMAGE_NOT_FOUND",
    message: "Docker image default tidak ditemukan dari egg.",
    hint: "Isi dockerImage manual atau atur Docker Images di egg.",
    example: { dockerImage: "ghcr.io/parkervcp/yolks:nodejs_22" }
  });
}

export function resolveStartup(rawEgg: unknown, input?: string): string {
  if (input && input !== "auto") return input;
  const attributes = getDataAttributes(rawEgg);
  if (typeof attributes.startup === "string" && attributes.startup.trim()) return attributes.startup;
  throw new PteroError({
    code: "STARTUP_NOT_FOUND",
    message: "Startup command tidak ditemukan dari egg.",
    hint: "Isi startup manual atau atur Startup Command pada egg.",
    example: { startup: "npm start" }
  });
}

export function buildServerPayload(input: CreateSmartServerInput, resolved: { userId: number; rawEgg: unknown; allocation: { default: number; additional: number[] }; specs: ReturnType<typeof normalizeSpecs> }): Record<string, unknown> {
  const name = ensureNonEmptyString(input.name, "name");
  const description = ensureNonEmptyString(input.description, "description");
  ensurePositiveInteger(input.nodeId, "nodeId");
  ensurePositiveInteger(input.nestId, "nestId");
  ensurePositiveInteger(input.eggId, "eggId");
  return {
    name,
    user: resolved.userId,
    description,
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
    start_on_completion: input.startOnCompletion ?? true
  };
}

export function validateCreateInput(input: CreateSmartServerInput, specs: ServerSpecsInput | undefined): ServerSpecsInput {
  ensureNonEmptyString(input.name, "name");
  ensureNonEmptyString(input.description, "description");
  ensurePositiveInteger(input.nodeId, "nodeId");
  ensurePositiveInteger(input.nestId, "nestId");
  ensurePositiveInteger(input.eggId, "eggId");
  if (!input.userId && !input.email) throw new PteroError({ code: "USER_REQUIRED", message: "email atau userId wajib diisi untuk create server." });
  if (!specs) throw new PteroError({ code: "SPECS_REQUIRED", message: "specs wajib diisi kecuali memakai preset yang tersedia." });
  return specs;
}

export function progress(options: OperationOptions | undefined, stage: string, percent: number, message: string): void {
  emitProgress(options?.onProgress, stage, percent, message);
}
