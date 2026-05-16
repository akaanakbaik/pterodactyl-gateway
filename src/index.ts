export { PteroGateway } from "./gateway.js";
export { PteroError, explainError } from "./errors.js";
export { formatMiB, maskSecret, normalizeDomain, parseCpu, parseSizeToMiB } from "./utils.js";
export * from "./types.js";

import { PteroGateway } from "./gateway.js";
import { PteroConfig } from "./types.js";

export function createPtero(config: PteroConfig): PteroGateway {
  return new PteroGateway(config);
}

createPtero.fromEnv = function fromEnv(env: NodeJS.ProcessEnv = process.env): PteroGateway {
  return PteroGateway.fromEnv(env);
};

export const ptero = createPtero;
