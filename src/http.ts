import { TtlCache } from "./cache.js";
import { PteroError } from "./errors.js";
import { PteroLogger } from "./logger.js";
import { CircuitBreaker, MetricsCollector, TokenBucket, isAbortError, throwIfAborted } from "./rate.js";
import {
  ApiScope,
  CacheConfig,
  CircuitBreakerConfig,
  GatewayHooks,
  GatewayMetrics,
  HttpMethod,
  RateLimitConfig,
  RequestOptions,
  RetryConfig
} from "./types.js";
import { appendQuery, isHtmlDocument, safeJsonParse, sleep } from "./utils.js";

export type HttpCoreConfig = {
  domain: string;
  applicationKey?: string;
  clientKey?: string;
  timeout: number;
  userAgent: string;
  fetcher: typeof fetch;
  debug?: boolean;
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  circuitBreaker?: CircuitBreakerConfig;
  hooks?: GatewayHooks;
};

const DEFAULT_RETRY: Required<RetryConfig> = {
  retries: 2,
  baseDelay: 400,
  maxDelay: 10000,
  retryOn: [408, 425, 429, 500, 502, 503, 504],
  retryOnNetwork: true
};

const RETRY_SAFE_METHODS = new Set<HttpMethod>(["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]);

export class HttpCore {
  readonly logger: PteroLogger;
  readonly metrics = new MetricsCollector();
  private readonly config: HttpCoreConfig;
  private readonly retryConfig: Required<RetryConfig>;
  private readonly cache: TtlCache | null;
  private readonly breaker: CircuitBreaker | null;
  private readonly limiter: TokenBucket | null;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(config: HttpCoreConfig) {
    this.config = config;
    this.retryConfig = {
      retries: Math.max(0, config.retry?.retries ?? DEFAULT_RETRY.retries),
      baseDelay: Math.max(0, config.retry?.baseDelay ?? DEFAULT_RETRY.baseDelay),
      maxDelay: Math.max(1, config.retry?.maxDelay ?? DEFAULT_RETRY.maxDelay),
      retryOn: config.retry?.retryOn ?? DEFAULT_RETRY.retryOn,
      retryOnNetwork: config.retry?.retryOnNetwork ?? DEFAULT_RETRY.retryOnNetwork
    };
    this.logger = new PteroLogger(config.debug ?? false);
    const cacheEnabled = config.cache?.enabled ?? true;
    this.cache = cacheEnabled
      ? new TtlCache(config.cache?.maxEntries ?? 500, config.cache?.ttl ?? 15000)
      : null;
    this.breaker = config.circuitBreaker?.enabled === false
      ? null
      : new CircuitBreaker(
          config.circuitBreaker?.failureThreshold ?? 6,
          config.circuitBreaker?.resetTimeout ?? 30000,
          config.circuitBreaker?.halfOpenMax ?? 1
        );
    this.limiter = config.rateLimit?.requestsPerSecond
      ? new TokenBucket(config.rateLimit.requestsPerSecond, config.rateLimit.burst)
      : null;
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const api = options.api;
    const key = api === "application" ? this.config.applicationKey : this.config.clientKey;
    if (!key) {
      const error = new PteroError({
        code: api === "application" ? "PTLA_REQUIRED" : "PTLC_REQUIRED",
        message: `API key ${api === "application" ? "PTLA" : "PTLC"} belum diisi.`,
        hint: `Aksi ini membutuhkan ${api === "application" ? "Application" : "Client"} API.`,
        steps: ["Isi key saat membuat gateway", "Atau set environment variable yang sesuai", "Jalankan doctor untuk validasi"]
      });
      this.logger.error(error.message);
      throw error;
    }

    const method = (options.method ?? "GET").toUpperCase() as HttpMethod;
    const path = appendQuery(options.path.startsWith("/") ? options.path : `/${options.path}`, options.query);
    const url = `${this.config.domain}${api === "application" ? "/api/application" : "/api/client"}${path}`;
    const cacheable = method === "GET" && this.cache !== null && options.cache !== false;
    const cacheKey = `${api}:${url}`;
    const ttl = typeof options.cache === "number" ? options.cache : undefined;

    if (cacheable) {
      const cached = this.cache!.get<T>(cacheKey);
      if (cached !== undefined) {
        this.metrics.recordCache(true);
        this.metrics.recordRequest(0, 200, true);
        this.emitResponse({ api, method, url, attempt: 1, status: 200, duration: 0, cached: true });
        return cached;
      }
      this.metrics.recordCache(false);
    }

    const dedupe = cacheable && options.dedupe !== false;
    if (dedupe) {
      const pending = this.inflight.get(cacheKey);
      if (pending) return pending as Promise<T>;
    }

    const task = this.perform<T>(options, api, method, url, key, cacheKey, cacheable, ttl);
    if (dedupe) {
      this.inflight.set(cacheKey, task);
      try {
        return await task;
      } finally {
        this.inflight.delete(cacheKey);
      }
    }
    return task;
  }

  private async perform<T>(
    options: RequestOptions,
    api: ApiScope,
    method: HttpMethod,
    url: string,
    key: string,
    cacheKey: string,
    cacheable: boolean,
    ttl: number | undefined
  ): Promise<T> {
    const maxAttempts = this.retryConfig.retries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      throwIfAborted(options.signal);
      try {
        this.breaker?.assertAllowed();
        this.breaker?.acquireTrial();
        if (this.limiter) {
          const before = this.limiter.waits;
          await this.limiter.acquire(1, options.signal);
          if (this.limiter.waits > before) this.metrics.recordRateLimitWait();
        }
        this.emitRequest({ api, method, url, attempt });
        const started = Date.now();
        const result = await this.execute<T>(options, method, url, key, attempt);
        const duration = Date.now() - started;
        if (method !== "GET" && method !== "HEAD") this.cache?.clear();
        this.breaker?.recordSuccess();
        this.metrics.recordRequest(duration, 200);
        if (cacheable && this.cache) this.cache.set(cacheKey, result, ttl);
        this.emitResponse({ api, method, url, attempt, status: 200, duration, cached: false });
        return result;
      } catch (error) {
        lastError = error;
        if (isAbortError(error) || options.signal?.aborted) {
          throw new PteroError({ code: "ABORTED", message: "Operasi dibatalkan oleh pemanggil.", cause: error });
        }
        if (error instanceof PteroError && error.code === "ABORTED") throw error;
        const status = error instanceof PteroError ? error.status : undefined;
        const canRetry = this.shouldRetry(method, options.retryUnsafe === true, status, attempt, maxAttempts);
        if (canRetry) {
          const delay = this.retryDelay(attempt, error instanceof PteroError ? error.retryAfter : undefined);
          this.metrics.recordRetry();
          this.logger.warn(`Retry ${attempt}/${this.retryConfig.retries} dalam ${delay}ms${status ? ` setelah HTTP ${status}` : ""}`);
          this.emitRetry({
            api,
            method,
            url,
            attempt,
            delay,
            status,
            error: error instanceof Error ? error.message : String(error)
          });
          await sleep(delay, options.signal);
          continue;
        }
        this.breaker?.recordFailure();
        if (this.breaker?.current() === "open") this.metrics.recordCircuitOpening();
        this.emitError({
          api,
          method,
          url,
          attempt,
          status,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
    throw lastError ?? new PteroError({ code: "REQUEST_FAILED", message: "Request gagal setelah semua percobaan." });
  }

  private async execute<T>(options: RequestOptions, method: HttpMethod, url: string, key: string, attempt: number): Promise<T> {
    const controller = new AbortController();
    const timeout = Math.max(1, options.timeout ?? this.config.timeout);
    const timer = setTimeout(() => controller.abort(), timeout);
    const onAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      this.logger.debug(`Request ${method} ${url} (attempt ${attempt})`);
      const headers: Record<string, string> = {
        Accept: options.responseType === "text" ? "text/plain" : "Application/vnd.pterodactyl.v1+json",
        "User-Agent": this.config.userAgent,
        Authorization: `Bearer ${key}`,
        ...(options.headers ?? {})
      };
      const contentType = options.contentType ?? "json";
      const body = buildBody(options.body, contentType);
      if (body !== undefined && contentType !== "multipart") {
        headers["Content-Type"] = contentType === "text" ? "text/plain" : "application/json";
      }

      const response = await this.config.fetcher(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      const text = await response.text();
      const data = options.responseType === "text" ? text : text ? safeJsonParse(text) : undefined;

      if (!response.ok) {
        const message = extractMessage(data) ?? `Request gagal dengan status ${response.status}.`;
        const error = new PteroError({
          code: normalizeStatusCode(response.status),
          message,
          status: response.status,
          hint: buildStatusHint(response.status, options.api),
          raw: data,
          retryAfter: parseRetryAfter(response.headers.get("retry-after"))
        });
        this.metrics.recordRequest(0, response.status);
        this.logger.error(`[${error.code}] ${error.message}`);
        throw error;
      }

      if (options.rejectHtml && isHtmlDocument(text)) {
        this.metrics.recordRequest(0, response.status);
        throw new PteroError({
          code: "UNEXPECTED_TEXT_RESPONSE",
          message: "Panel mengembalikan dokumen HTML, bukan konten yang diminta.",
          hint: "Periksa path file, identifier server, dan sesi Client API.",
          status: response.status,
          raw: text
        });
      }

      this.logger.debug(`Response ${response.status} OK`);
      return data as T;
    } catch (error) {
      if (error instanceof PteroError) throw error;
      if (isAbortError(error)) {
        this.metrics.recordRequest(0, 0);
        if (options.signal?.aborted) {
          throw new PteroError({ code: "ABORTED", message: "Operasi dibatalkan oleh pemanggil.", cause: error });
        }
        throw ErrorFactoryTimeout(timeout);
      }
      this.metrics.recordRequest(0, 0);
      throw new PteroError({
        code: "PANEL_UNREACHABLE",
        message: error instanceof Error ? error.message : "Panel tidak dapat diakses.",
        hint: "Periksa domain panel, SSL, DNS, firewall, dan koneksi jaringan.",
        cause: error
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  private shouldRetry(method: HttpMethod, retryUnsafe: boolean, status: number | undefined, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) return false;
    const methodAllowed = RETRY_SAFE_METHODS.has(method) || retryUnsafe;
    if (!methodAllowed) return false;
    if (status === undefined) return this.retryConfig.retryOnNetwork;
    return this.retryConfig.retryOn.includes(status);
  }

  private retryDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter !== undefined) return Math.min(this.retryConfig.maxDelay, Math.max(0, retryAfter));
    const exponential = Math.min(this.retryConfig.maxDelay, this.retryConfig.baseDelay * Math.pow(2, attempt - 1));
    const jitter = Math.random() * Math.max(1, exponential * 0.5);
    return Math.min(this.retryConfig.maxDelay, Math.round(exponential + jitter));
  }

  flushCache(prefix?: string): number {
    return this.cache?.clear(prefix) ?? 0;
  }

  cacheStats() {
    return this.cache?.stats() ?? { size: 0, maxEntries: 0, hits: 0, misses: 0, evictions: 0, expirations: 0 };
  }

  metricsSnapshot(): GatewayMetrics {
    const snapshot = this.metrics.snapshot();
    if (this.breaker) snapshot.circuitOpenings = this.breaker.openings;
    snapshot.rateLimitWaits = this.limiter?.waits ?? 0;
    return snapshot;
  }

  breakerStats() {
    return this.breaker?.snapshot() ?? { state: "disabled" as const, failures: 0, openings: 0, resetTimeout: 0, failureThreshold: 0 };
  }

  private emitRequest(context: Parameters<NonNullable<GatewayHooks["onRequest"]>>[0]) {
    try {
      this.config.hooks?.onRequest?.(context);
    } catch {
      undefined;
    }
  }

  private emitResponse(context: Parameters<NonNullable<GatewayHooks["onResponse"]>>[0]) {
    try {
      this.config.hooks?.onResponse?.(context);
    } catch {
      undefined;
    }
  }

  private emitRetry(context: Parameters<NonNullable<GatewayHooks["onRetry"]>>[0]) {
    try {
      this.config.hooks?.onRetry?.(context);
    } catch {
      undefined;
    }
  }

  private emitError(context: Parameters<NonNullable<GatewayHooks["onError"]>>[0]) {
    try {
      this.config.hooks?.onError?.(context);
    } catch {
      undefined;
    }
  }
}

function ErrorFactoryTimeout(timeout: number): PteroError {
  return new PteroError({
    code: "REQUEST_TIMEOUT",
    message: `Request ke panel melewati batas waktu ${timeout}ms.`,
    hint: "Tingkatkan timeout atau periksa koneksi dan beban panel.",
    steps: ["Naikkan opsi timeout", "Periksa DNS dan firewall", "Ulangi request setelah beberapa saat"]
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const target = Date.parse(value);
  if (Number.isNaN(target)) return undefined;
  return Math.max(0, target - Date.now());
}

function buildBody(body: unknown, contentType: "json" | "text" | "multipart"): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (contentType === "multipart") return body as BodyInit;
  if (contentType === "text") return String(body);
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function extractMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (isHtmlDocument(trimmed)) return "Panel mengembalikan halaman HTML, bukan respons API.";
    return trimmed.slice(0, 500);
  }
  if (typeof value !== "object" || value === null) return undefined;
  const root = value as Record<string, unknown>;
  const errors = root.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const details = errors
      .map(error => {
        const item = error as Record<string, unknown>;
        const meta = (item.meta ?? {}) as Record<string, unknown>;
        const field = typeof meta.source_field === "string" ? `${meta.source_field}: ` : "";
        return `${field}${typeof item.detail === "string" ? item.detail : typeof item.title === "string" ? item.title : ""}`.trim();
      })
      .filter(Boolean);
    if (details.length) return details.join("; ");
  }
  if (typeof root.message === "string") return root.message;
  if (typeof root.detail === "string") return root.detail;
  return undefined;
}

function normalizeStatusCode(status: number): string {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401 || status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PANEL_SERVER_ERROR";
  return "REQUEST_FAILED";
}

function buildStatusHint(status: number, api: ApiScope): string | undefined {
  if (status === 401 || status === 403) {
    return api === "application" ? "Periksa PTLA dan permission Application API." : "Periksa PTLC dan permission Client API.";
  }
  if (status === 404) return "Periksa ID, endpoint, dan versi panel. Beberapa panel tidak menyediakan endpoint tertentu.";
  if (status === 409) return "Resource sedang dipakai atau statusnya tidak memungkinkan operasi ini.";
  if (status === 422) return "Periksa payload. Gunakan preview atau dryRun untuk melihat payload final.";
  if (status === 429) return "Terlalu banyak request. Aktifkan rate limit atau kurangi konkurensi.";
  if (status >= 500) return "Panel mengembalikan error server. Periksa log panel dan Wings.";
  return undefined;
}
