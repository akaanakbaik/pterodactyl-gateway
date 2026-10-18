export type LogLevel = "debug" | "info" | "success" | "warn" | "error" | "silent";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  success: 25,
  warn: 30,
  error: 40,
  silent: 100
};

export type LoggerOptions = {
  enabled?: boolean;
  level?: LogLevel;
  prefix?: string;
  timestamps?: boolean;
};

export class PteroLogger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;

  constructor(options: boolean | LoggerOptions = false) {
    const normalized = typeof options === "boolean" ? { enabled: options } : options;
    this.level = normalized.level ?? (normalized.enabled ? "info" : "silent");
    this.prefix = normalized.prefix ?? "";
    this.timestamps = normalized.timestamps ?? false;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  child(prefix: string): PteroLogger {
    return new PteroLogger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      timestamps: this.timestamps
    });
  }

  log(level: Exclude<LogLevel, "silent">, message: string): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;
    const parts: string[] = [];
    if (this.timestamps) parts.push(new Date().toISOString());
    if (this.prefix) parts.push(`[${this.prefix}]`);
    parts.push(`[${level.toUpperCase()}]`);
    parts.push(redact(message));
    const line = parts.join(" ");
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  debug(message: string) {
    this.log("debug", message);
  }

  info(message: string) {
    this.log("info", message);
  }

  success(message: string) {
    this.log("success", message);
  }

  warn(message: string) {
    this.log("warn", message);
  }

  error(message: string) {
    this.log("error", message);
  }
}

export function redact(value: string): string {
  return value
    .replace(/ptla_[A-Za-z0-9]+/g, "ptla_********")
    .replace(/ptlc_[A-Za-z0-9]+/g, "ptlc_********")
    .replace(/("?(?:password|passwd|secret|token|authorization)"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1********");
}
