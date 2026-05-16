import { PteroError } from "./errors.js";
import { PteroRequestOptions } from "./types.js";

export type HttpCoreConfig = {
  domain: string;
  applicationKey?: string;
  clientKey?: string;
  timeout: number;
  userAgent: string;
  fetcher: typeof fetch;
};

export class HttpCore {
  private config: HttpCoreConfig;

  constructor(config: HttpCoreConfig) {
    this.config = config;
  }

  async request<T = unknown>(options: PteroRequestOptions): Promise<T> {
    const key = options.api === "application" ? this.config.applicationKey : this.config.clientKey;
    if (!key) {
      throw new PteroError({
        code: options.api === "application" ? "PTLA_REQUIRED" : "PTLC_REQUIRED",
        message: options.api === "application" ? "PTLA wajib diisi untuk Application API." : "PTLC wajib diisi untuk Client API.",
        hint: "Isi key yang sesuai di config atau .env."
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);
    const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const prefix = options.api === "application" ? "/api/application" : "/api/client";
    const url = `${this.config.domain}${prefix}${path}`;

    try {
      const response = await this.config.fetcher(url, {
        method: options.method ?? "GET",
        headers: {
          Accept: "Application/vnd.pterodactyl.v1+json",
          "Content-Type": "application/json",
          "User-Agent": this.config.userAgent,
          Authorization: `Bearer ${key}`
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });

      const text = await response.text();
      const data = text ? safeJson(text) : undefined;

      if (!response.ok) {
        throw new PteroError({
          code: normalizeStatusCode(response.status),
          message: extractMessage(data) ?? `Request gagal dengan status ${response.status}.`,
          status: response.status,
          hint: buildStatusHint(response.status, options.api),
          raw: data
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof PteroError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new PteroError({
          code: "REQUEST_TIMEOUT",
          message: "Request ke Pterodactyl timeout.",
          hint: "Cek koneksi server, domain panel, Cloudflare, firewall, atau naikkan timeout."
        });
      }
      throw new PteroError({
        code: "PANEL_UNREACHABLE",
        message: error instanceof Error ? error.message : "Panel tidak bisa diakses.",
        hint: "Cek domain panel, SSL, firewall, dan koneksi VPS."
      });
    } finally {
      clearTimeout(timer);
    }
  }
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
  if (status === 429) return "Terlalu banyak request. Kurangi frekuensi atau aktifkan queue di versi mendatang.";
  if (status >= 500) return "Panel mengembalikan error server. Cek log panel atau Wings. ";
  return undefined;
}
