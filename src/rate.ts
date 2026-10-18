import { PteroError, ErrorFactory } from "./errors.js";
import { GatewayMetrics } from "./types.js";
import { quantile, sleep } from "./utils.js";

export class TokenBucket {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefill: number;
  private tail: Promise<void> = Promise.resolve();
  waits = 0;

  constructor(ratePerSecond: number, burst?: number) {
    const rate = Math.max(0, ratePerSecond);
    this.capacity = Math.max(1, burst ?? Math.max(1, Math.ceil(rate)));
    this.refillPerMs = rate / 1000;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  get available(): number {
    this.refill();
    return this.tokens;
  }

  acquire(cost = 1, signal?: AbortSignal): Promise<void> {
    if (this.refillPerMs <= 0) return Promise.resolve();
    const run = this.tail.then(async () => {
      this.refill();
      if (this.tokens < cost) {
        this.waits += 1;
        const missing = cost - this.tokens;
        const delay = Math.ceil(missing / this.refillPerMs);
        await sleep(delay, signal);
        this.refill();
      }
      this.tokens = Math.max(0, this.tokens - cost);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  private refill() {
    const now = Date.now();
    if (now <= this.lastRefill) return;
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) * this.refillPerMs);
    this.lastRefill = now;
  }
}

export class Semaphore {
  private active = 0;
  private readonly limit: number;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get pending(): number {
    return this.queue.length;
  }

  acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const release = () => {
        this.active = Math.max(0, this.active - 1);
        const next = this.queue.shift();
        if (next) next();
      };
      if (this.active < this.limit) {
        this.active += 1;
        resolve(release);
      } else {
        this.queue.push(() => {
          this.active += 1;
          resolve(release);
        });
      }
    });
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }
}

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt = 0;
  private halfOpenTrials = 0;
  readonly failureThreshold: number;
  readonly resetTimeout: number;
  readonly halfOpenMax: number;
  openings = 0;

  constructor(failureThreshold = 5, resetTimeout = 30000, halfOpenMax = 1) {
    this.failureThreshold = Math.max(1, failureThreshold);
    this.resetTimeout = Math.max(1000, resetTimeout);
    this.halfOpenMax = Math.max(1, halfOpenMax);
  }

  current(): CircuitState {
    if (this.state === "open" && Date.now() - this.openedAt >= this.resetTimeout) {
      this.state = "half-open";
      this.halfOpenTrials = 0;
    }
    return this.state;
  }

  assertAllowed(): void {
    const state = this.current();
    if (state === "open") {
      const remaining = this.resetTimeout - (Date.now() - this.openedAt);
      throw ErrorFactory.circuitOpen(Math.max(0, remaining));
    }
    if (state === "half-open" && this.halfOpenTrials >= this.halfOpenMax) {
      throw ErrorFactory.circuitOpen(1000);
    }
  }

  acquireTrial(): void {
    if (this.current() === "half-open") this.halfOpenTrials += 1;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
    this.halfOpenTrials = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.state === "half-open" || this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
      this.openings += 1;
      this.halfOpenTrials = 0;
    }
  }

  snapshot() {
    return {
      state: this.current(),
      failures: this.failures,
      openings: this.openings,
      resetTimeout: this.resetTimeout,
      failureThreshold: this.failureThreshold
    };
  }
}

export class MetricsCollector {
  private requests = 0;
  private successes = 0;
  private failures = 0;
  private retries = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private circuitOpenings = 0;
  private rateLimitWaits = 0;
  private byStatus: Record<string, number> = {};
  private latencies: number[] = [];
  private readonly startedAt = Date.now();

  recordRequest(duration: number, status: number, cached = false): void {
    this.requests += 1;
    if (status >= 200 && status < 400) this.successes += 1;
    else this.failures += 1;
    this.byStatus[String(status)] = (this.byStatus[String(status)] ?? 0) + 1;
    if (!cached) {
      this.latencies.push(duration);
      if (this.latencies.length > 1024) this.latencies.splice(0, this.latencies.length - 1024);
    }
  }

  recordRetry(): void {
    this.retries += 1;
  }

  recordCache(hit: boolean): void {
    if (hit) this.cacheHits += 1;
    else this.cacheMisses += 1;
  }

  recordCircuitOpening(): void {
    this.circuitOpenings += 1;
  }

  recordRateLimitWait(): void {
    this.rateLimitWaits += 1;
  }

  snapshot(): GatewayMetrics {
    const latencies = [...this.latencies];
    const total = latencies.reduce((sum, value) => sum + value, 0);
    return {
      requests: this.requests,
      successes: this.successes,
      failures: this.failures,
      retries: this.retries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      circuitOpenings: this.circuitOpenings,
      rateLimitWaits: this.rateLimitWaits,
      byStatus: { ...this.byStatus },
      latency: {
        min: latencies.length ? Math.min(...latencies) : 0,
        max: latencies.length ? Math.max(...latencies) : 0,
        mean: latencies.length ? total / latencies.length : 0,
        p50: quantile(latencies, 0.5),
        p95: quantile(latencies, 0.95),
        p99: quantile(latencies, 0.99)
      },
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeMs: Date.now() - this.startedAt
    };
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new PteroError({ code: "ABORTED", message: "Operasi dibatalkan oleh pemanggil." });
  throw error;
}
