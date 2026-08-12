export type LogLevel = "info" | "success" | "warn" | "error" | "debug";

export class PteroLogger {
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  private format(level: LogLevel, message: string): string {
    const timestamp = new Date().toLocaleTimeString();
    const icons: Record<LogLevel, string> = {
      info: "ℹ️",
      success: "✅",
      warn: "⚠️",
      error: "❌",
      debug: "🔍"
    };
    const labels: Record<LogLevel, string> = {
      info: "[INFO]",
      success: "[SUCCESS]",
      warn: "[WARN]",
      error: "[ERROR]",
      debug: "[DEBUG]"
    };
    return `${timestamp} ${icons[level]} ${labels[level]} ${message}`;
  }

  log(level: LogLevel, message: string) {
    if (!this.enabled) return;
    const formatted = this.format(level, message);
    switch (level) {
      case "error": console.error(formatted); break;
      case "warn": console.warn(formatted); break;
      default: console.log(formatted); break;
    }
  }

  info(message: string) { this.log("info", message); }
  success(message: string) { this.log("success", message); }
  warn(message: string) { this.log("warn", message); }
  error(message: string) { this.log("error", message); }
  debug(message: string) { this.log("debug", message); }
}
