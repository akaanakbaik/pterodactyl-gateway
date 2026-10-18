import { randomBytes } from "node:crypto";
import { BooleanLike, CpuInput, PteroPagination, QueryInput, QueryValue, SizeInput } from "./types.js";

const SIZE_UNITS: Record<string, number> = {
  b: 1 / (1024 * 1024),
  kb: 1 / 1024,
  kib: 1 / 1024,
  mb: 1,
  mib: 1,
  gb: 1024,
  gib: 1024,
  tb: 1024 * 1024,
  tib: 1024 * 1024
};

export function normalizeDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Domain panel wajib diisi.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!parsed.hostname) throw new Error(`Domain panel tidak valid: ${input}`);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function maskSecret(value?: string): string {
  if (!value) return "";
  if (value.length <= 10) return "********";
  return `${value.slice(0, 5)}********${value.slice(-4)}`;
}

export function toBoolean(value: BooleanLike | undefined | null): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["yes", "y", "true", "1", "on", "ya", "iya"].includes(normalized);
}

export function parseSizeToMiB(value: SizeInput): number {
  if (typeof value === "number") return ensureNonNegativeInteger(value, "size");
  const normalized = value.trim().toLowerCase();
  if (["unlimited", "unlimitedspace", "inf", "infinity"].includes(normalized)) return 0;
  const match = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)?$/);
  if (!match) throw new Error(`Ukuran tidak valid: ${value}`);
  const amount = Number(match[1]!.replace(",", "."));
  const unit = match[2] ?? "mib";
  const multiplier = SIZE_UNITS[unit];
  if (multiplier === undefined) throw new Error(`Satuan ukuran tidak dikenal: ${value}`);
  return ensureNonNegativeInteger(Math.round(amount * multiplier), "size");
}

export function parseCpu(value: CpuInput): number {
  if (typeof value === "number") return ensureNonNegativeInteger(value, "cpu");
  const normalized = value.trim().replace(/%$/, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`CPU tidak valid: ${value}`);
  return ensureNonNegativeInteger(Math.round(parsed), "cpu");
}

export function formatMiB(value: number): string {
  if (!Number.isFinite(value)) return "unlimited";
  if (value <= 0) return "unlimited";
  if (value >= 1024 * 1024) return `${trimNumber(value / (1024 * 1024))} TB`;
  if (value >= 1024) return `${trimNumber(value / 1024)} GB`;
  return `${trimNumber(value)} MB`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${trimNumber(value / Math.pow(1024, exponent))} ${units[exponent]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts = [days ? `${days}d` : "", hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", rest ? `${rest}s` : ""].filter(Boolean);
  return parts.length ? parts.join(" ") : `${Math.round(ms)}ms`;
}

export function generatePassword(length = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const limit = 256 - (256 % chars.length);
  const output: string[] = [];
  while (output.length < length) {
    const bytes = randomBytes(Math.max(16, (length - output.length) * 2));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      output.push(chars[byte % chars.length]!);
      if (output.length === length) break;
    }
  }
  return output.join("");
}

export function generatePasswordWithPolicy(length = 20): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = `${upper}${lower}${digits}${symbols}`;
  const required = [pickRandom(upper), pickRandom(lower), pickRandom(digits), pickRandom(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pickRandom(all));
  return shuffle([...required, ...rest]).join("");
}

function pickRandom(source: string): string {
  const byte = randomBytes(1)[0]!;
  return source[byte % source.length]!;
}

export function ensureNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} wajib diisi.`);
  return value.trim();
}

export function ensurePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`${field} wajib berupa angka lebih dari 0.`);
  return value;
}

export function ensureNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${field} wajib berupa angka minimal 0.`);
  return value;
}

export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function getDataAttributes(value: unknown): Record<string, unknown> {
  const root = asObject(value);
  const data = asObject(root.data);
  const dataAttributes = asObject(data.attributes);
  if (Object.keys(dataAttributes).length > 0) return dataAttributes;
  return asObject(root.attributes);
}

export function getCollection(value: unknown): Record<string, unknown>[] {
  const root = asObject(value);
  const data = Array.isArray(root.data) ? root.data : [];
  return data.map(item => asObject(item));
}

export function getPagination(value: unknown): PteroPagination | undefined {
  const root = asObject(value);
  const meta = asObject(root.meta);
  const pagination = asObject(meta.pagination);
  if (!pagination.current_page) return undefined;
  return {
    current_page: Number(pagination.current_page),
    total_pages: Number(pagination.total_pages),
    total: pagination.total === undefined ? undefined : Number(pagination.total),
    count: pagination.count === undefined ? undefined : Number(pagination.count),
    per_page: pagination.per_page === undefined ? undefined : Number(pagination.per_page)
  };
}

export function trimNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

export function emitProgress(onProgress: ((step: { stage: string; percent: number; message: string }) => void) | undefined, stage: string, percent: number, message: string): void {
  onProgress?.({ stage, percent: Math.max(0, Math.min(100, Math.round(percent))), message });
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Operasi dibatalkan.");
  error.name = "AbortError";
  return error;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = clamp(q, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function geometricMean(values: number[]): number {
  const positive = values.filter(value => value > 0);
  if (positive.length === 0) return 0;
  return Math.exp(positive.reduce((sum, value) => sum + Math.log(value), 0) / positive.length);
}

export function harmonicMean(values: number[]): number {
  const positive = values.filter(value => value > 0);
  if (positive.length === 0) return 0;
  return positive.length / positive.reduce((sum, value) => sum + 1 / value, 0);
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

export function buildQuery(query: QueryInput | undefined): string {
  if (!query) return "";
  const pairs: string[] = [];
  for (const key of Object.keys(query).sort()) {
    const raw = query[key];
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === undefined || value === null || value === "") continue;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs.length ? `?${pairs.join("&")}` : "";
}

export function appendQuery(path: string, query: QueryInput | undefined): string {
  const suffix = buildQuery(query);
  if (!suffix) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${suffix.slice(1)}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

export function safeJsonParse<T = unknown>(text: string): T | string {
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

export function isHtmlDocument(value: string): boolean {
  return /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(value);
}

export function validateEmail(email: string): string {
  const normalized = ensureNonEmptyString(email, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) throw new Error(`Email tidak valid: ${email}`);
  return normalized;
}

export function validateUsername(username: string): string {
  const normalized = ensureNonEmptyString(username, "username");
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(normalized)) throw new Error("Username harus 3-32 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau strip.");
  return normalized.toLowerCase();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "server";
}

export type CronFields = {
  minute: string;
  hour: string;
  day_of_month: string;
  month: string;
  day_of_week: string;
};

const CRON_RANGES: Array<[keyof CronFields, number, number]> = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["day_of_month", 1, 31],
  ["month", 1, 12],
  ["day_of_week", 0, 7]
];

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Cron harus terdiri dari 5 field: minute hour day-of-month month day-of-week.");
  const fields: CronFields = {
    minute: parts[0]!,
    hour: parts[1]!,
    day_of_month: parts[2]!,
    month: parts[3]!,
    day_of_week: parts[4]!
  };
  for (const [name, min, max] of CRON_RANGES) {
    validateCronField(name, fields[name], min, max);
  }
  return fields;
}

function validateCronField(name: string, field: string, min: number, max: number): void {
  for (const segment of field.split(",")) {
    const [rangePart, stepPart] = segment.split("/");
    if (stepPart !== undefined) {
      const step = Number(stepPart);
      if (!Number.isInteger(step) || step < 1) throw new Error(`Langkah cron ${name} tidak valid: ${segment}`);
    }
    if (rangePart === "*" || rangePart === "?") continue;
    for (const piece of rangePart!.split("-")) {
      const value = Number(piece);
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Nilai cron ${name} di luar batas ${min}-${max}: ${piece}`);
    }
  }
}

export function cronPreset(name: string): string {
  const presets: Record<string, string> = {
    hourly: "0 * * * *",
    daily: "0 0 * * *",
    weekly: "0 0 * * 0",
    monthly: "0 0 1 * *",
    "every-6-hours": "0 */6 * * *",
    "every-12-hours": "0 */12 * * *",
    "every-15-minutes": "*/15 * * * *",
    "every-30-minutes": "*/30 * * * *"
  };
  const value = presets[name.toLowerCase()];
  if (!value) throw new Error(`Preset cron tidak dikenal: ${name}. Pilihan: ${Object.keys(presets).join(", ")}`);
  return value;
}

export function pick<T extends Record<string, unknown>>(source: T, keys: string[]): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  return output as Partial<T>;
}

export function omit<T extends Record<string, unknown>>(source: T, keys: string[]): Partial<T> {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(key))) as Partial<T>;
}

export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = output[key];
    if (isPlainObject(current) && isPlainObject(value)) output[key] = deepMerge(current, value);
    else output[key] = value;
  }
  return output as T;
}
