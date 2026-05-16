import { randomBytes } from "node:crypto";
import { BooleanLike, CpuInput, SizeInput } from "./types.js";

export function normalizeDomain(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function maskSecret(value?: string): string {
  if (!value) return "";
  if (value.length <= 10) return "********";
  return `${value.slice(0, 5)}********${value.slice(-4)}`;
}

export function toBoolean(value: BooleanLike): boolean {
  if (typeof value === "boolean") return value;
  const normalized = value.toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "1";
}

export function parseSizeToMiB(value: SizeInput): number {
  if (typeof value === "number") return ensureNonNegativeInteger(value, "size");
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(mib|mb|gib|gb)?$/);
  if (!match) throw new Error(`Ukuran tidak valid: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "mib";
  const mib = unit === "gb" || unit === "gib" ? amount * 1024 : amount;
  return ensureNonNegativeInteger(Math.round(mib), "size");
}

export function parseCpu(value: CpuInput): number {
  if (typeof value === "number") return ensureNonNegativeInteger(value, "cpu");
  const normalized = value.trim().replace(/%$/, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`CPU tidak valid: ${value}`);
  return ensureNonNegativeInteger(Math.round(parsed), "cpu");
}

export function formatMiB(value: number): string {
  if (value >= 1024) return `${trimNumber(value / 1024)} GB`;
  return `${trimNumber(value)} MB`;
}

export function generatePassword(length = 18): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const bytes = randomBytes(length);
  return Array.from(bytes, byte => chars[byte % chars.length]).join("");
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
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function getDataAttributes(value: unknown): Record<string, unknown> {
  const root = asObject(value);
  const data = asObject(root.data);
  return asObject(data.attributes);
}

export function getCollection(value: unknown): Record<string, unknown>[] {
  const root = asObject(value);
  const data = Array.isArray(root.data) ? root.data : [];
  return data.map(item => asObject(item));
}

export function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

export function emitProgress(onProgress: ((step: { stage: string; percent: number; message: string }) => void) | undefined, stage: string, percent: number, message: string): void {
  onProgress?.({ stage, percent, message });
}
