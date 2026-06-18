import { PteroError, ErrorFactory } from "./errors.js";
import { PteroRequestOptions } from "./types.js";
import { PteroLogger } from "./logger.js";

export type HttpCoreConfig = {
  domain: string;
  applicationKey?: string;
  clientKey?: string;
  timeout: number;
  userAgent: string;
  fetcher: typeof fetch;
  debug?: boolean;
  retry?: RetryConfig;
};

export type RetryConfig = {
  retries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: number[];
};

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  retries: 0,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [429, 502, 503, 504]
};

export class HttpCore {
  private config: HttpCoreConfig;
  private retryConfig: Required<RetryConfig>;
  readonly logger: PteroLogger;

  constructor(config: HttpCoreConfig) {
    this.config = config;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry,
      retries: config.retry?.retries ?? DEFAULT_RETRY_CONFIG.retries,
      baseDelay: config.retry?.baseDelay ?? DEFAULT_RETRY_CONFIG.baseDelay,
      maxDelay: config.retry?.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay,
      retryOn: config.retry?.retryOn ?? DEFAULT_RETRY_CONFIG.retryOn
    };
    this.logger = new PteroLogger(config.debug ?? true);
  }

  async request<T = unknown>(options: PteroRequestOptions): Promise<T> {
    const key = options.api === "application" ? this.config.applicationKey : this.config.clientKey;
    if (!key) {
      const err = options.api === "application" ? ErrorFactory.authFailed("application") : ErrorFactory.authFailed("client");
      this.logger.error(err.message);
      throw err;
    }

    let lastError: Error | undefined;
    const maxAttempts = this.retryConfig.retries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeRequest<T>(options, key);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof PteroError && this.retryConfig.retryOn.includes(error.status ?? 0) && attempt < maxAttempts) {
          const delay = this.calculateDelay(attempt);
          this.logger.warn(`Retry ${attempt}/${this.retryConfig.retries} setelah ${delay}ms (${error.code})`);
          await sleep(delay);
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error("Request gagal setelah semua retry");
  }

  private async executeRequest<T = unknown>(options: PteroRequestOptions, key: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);
    const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const prefix = options.api === "application" ? "/api/application" : "/api/client";
    const url = `${this.config.domain}${prefix}${path}`;
    const contentType = options.contentType ?? "json";

    try {
      this.logger.debug(`Request: ${options.method ?? "GET"} ${url}`);
      const response = await this.config.fetcher(url, {
        method: options.method ?? "GET",
        headers: {
          Accept: options.responseType === "text" ? "text/plain" : "Application/vnd.pterodactyl.v1+json",
          "Content-Type": contentType === "text" ? "text/plain" : "application/json",
          "User-Agent": this.config.userAgent,
          Authorization: `Bearer ${key}`
        },
        body: buildBody(options.body, contentType),
        signal: controller.signal
      });

      const text = await response.text();
      const data = options.responseType === "text" ? text : text ? safeJson(text) : undefined;

      if (!response.ok) {
        const err = new PteroError({
          code: normalizeStatusCode(response.status),
          message: extractMessage(data) ?? `Request gagal dengan status ${response.status}.`,
          status: response.status,
          hint: buildStatusHint(response.status, options.api),
          raw: data
        });
        this.logger.error(`[${err.code}] ${err.message}`);
        throw err;
      }

      this.logger.debug(`Response: ${response.status} OK`);
      return data as T;
    } catch (error) {
      if (error instanceof PteroError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        const err = new PteroError({
          code: "REQUEST_TIMEOUT",
          message: "Request ke Pterodactyl timeout.",
          hint: "Cek koneksi server, domain panel, Cloudflare, firewall, atau naikkan timeout."
        });
        this.logger.error(err.message);
        throw err;
      }
      const err = new PteroError({
        code: "PANEL_UNREACHABLE",
        message: error instanceof Error ? error.message : "Panel tidak bisa diakses.",
        hint: "Cek domain panel, SSL, firewall, dan koneksi VPS."
      });
      this.logger.error(err.message);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private calculateDelay(attempt: number): number {
    const exponential = this.retryConfig.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * this.retryConfig.baseDelay * 0.5;
    return Math.min(exponential + jitter, this.retryConfig.maxDelay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildBody(body: unknown, contentType: "json" | "text"): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (contentType === "text") return String(body);
  return JSON.stringify(body);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return undefined;
  const root = value as Record<string, unknown>;
  const errors = root.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as Record<string, unknown>;
    if (typeof first.detail === "string") return first.detail;
    if (typeof first.title === "string") return first.title;
  }
  if (typeof root.message === "string") return root.message;
  return undefined;
}

function normalizeStatusCode(status: number): string {
  if (status === 401 || status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PANEL_SERVER_ERROR";
  return "REQUEST_FAILED";
}

function buildStatusHint(status: number, api: "application" | "client"): string | undefined {
  if (status === 401 || status === 403) return api === "application" ? "Cek PTLA dan permission Application API." : "Cek PTLC dan permission Client API.";
  if (status === 404) return "Cek ID, endpoint, atau versi panel.";
  if (status === 422) return "Cek payload yang dikirim. Gunakan previewCreate atau dryRun untuk melihat payload final.";
  if (status === 429) return "Terlalu banyak request. Kurangi frekuensi atau aktifkan retry.";
  if (status >= 500) return "Panel mengembalikan error server. Cek log panel atau Wings.";
  return undefined;
}
