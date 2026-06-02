export { PteroGateway } from "./gateway.js";
export { PteroWebSocket } from "./websocket.js";
export { PteroLogger } from "./logger.js";
export { PteroError, explainError } from "./errors.js";
export { formatMiB, maskSecret, normalizeDomain, parseCpu, parseSizeToMiB } from "./utils.js";
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
