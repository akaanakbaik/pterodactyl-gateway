export type CacheStats = {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
};

type Entry = {
  value: unknown;
  expiresAt: number;
};

export class TtlCache {
  private readonly maxEntries: number;
  private readonly defaultTtl: number;
  private readonly store = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(maxEntries = 500, defaultTtl = 15000) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.defaultTtl = Math.max(0, defaultTtl);
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.expirations += 1;
      this.misses += 1;
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value as T;
  }

  set(key: string, value: unknown, ttl?: number): void {
    const effectiveTtl = ttl ?? this.defaultTtl;
    if (effectiveTtl <= 0) return;
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + effectiveTtl });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
      this.evictions += 1;
    }
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(prefix?: string): number {
    if (!prefix) {
      const size = this.store.size;
      this.store.clear();
      return size;
    }
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  stats(): CacheStats {
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations
    };
  }
}
