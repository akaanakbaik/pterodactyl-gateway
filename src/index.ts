export { PteroGateway, PteroServerHandle, PteroScheduleBuilder } from "./gateway.js";
export { PteroWebSocket, connectWebSocket, waitForWebSocket } from "./websocket.js";
export { PteroLogger, redact } from "./logger.js";
export type { LogLevel, LoggerOptions } from "./logger.js";
export { PteroError, ErrorFactory, explainError, getPteroErrorCode, isPteroError, toPteroError } from "./errors.js";
export { HttpCore } from "./http.js";
export type { HttpCoreConfig } from "./http.js";
export { TtlCache } from "./cache.js";
export type { CacheStats } from "./cache.js";
export { CircuitBreaker, MetricsCollector, Semaphore, TokenBucket } from "./rate.js";
export { analyzeAllocations, binPack, capacityReport, effectiveLimit, forecastCapacity, parseAllocations, planPlacement } from "./planner.js";
export type { AllocationItem, AllocationSelection, NormalizedSpecs } from "./planner.js";
export {
  buildEnvironment,
  buildServerPayload,
  buildUserPayload,
  normalizeSpecs,
  normalizeUserResponse,
  resolveDockerImage,
  resolveStartup,
  selectAllocations,
  validateCreateInput
} from "./smart.js";
export {
  closeEmailTransports,
  formatSmtpSummary,
  normalizeSmtpConfig,
  renderEmailTemplate,
  sendEmailMessage,
  smtpFromEnv,
  verifySmtp
} from "./email.js";
export type { EmailResult, NormalizedSmtpConfig } from "./email.js";
export {
  createIntegrationServerInput,
  createIntegrationService,
  getIntegrationDefaults,
  getIntegrationKinds,
  getIntegrationPresets
} from "./integrations.js";
export type {
  IntegrationDefaults,
  IntegrationKind,
  IntegrationPreset,
  IntegrationServerInput
} from "./integrations.js";
export {
  appendQuery,
  buildQuery,
  clamp,
  cronPreset,
  deepMerge,
  formatBytes,
  formatDuration,
  formatMiB,
  generatePassword,
  generatePasswordWithPolicy,
  getCollection,
  getDataAttributes,
  getPagination,
  isHtmlDocument,
  maskSecret,
  normalizeDomain,
  parseCpu,
  parseCron,
  parseSizeToMiB,
  quantile,
  safeJsonParse,
  slugify,
  stableStringify,
  toBoolean,
  validateEmail,
  validateUsername
} from "./utils.js";
export { PACKAGE_NAME, USER_AGENT, VERSION } from "./version.js";
export * from "./types.js";

import { PteroGateway } from "./gateway.js";
import { PteroConfig } from "./types.js";

type CreatePtero = {
  (config: PteroConfig): PteroGateway;
  fromEnv(env?: NodeJS.ProcessEnv): PteroGateway;
};

export const createPtero: CreatePtero = Object.assign(
  (config: PteroConfig) => new PteroGateway(config),
  {
    fromEnv: (env: NodeJS.ProcessEnv = process.env) => PteroGateway.fromEnv(env)
  }
);

export const ptero = createPtero;

export function createGateway(config: PteroConfig): PteroGateway {
  return new PteroGateway(config);
}
