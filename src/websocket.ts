import { PteroError } from "./errors.js";
import type { PteroGateway } from "./gateway.js";
import { PteroWebSocketOptions, PteroWebSocketStats } from "./types.js";
import { asObject, sleep } from "./utils.js";

type Listener = (...args: unknown[]) => void;

export class PteroWebSocket {
  private socket: any = null;
  private readonly gateway: PteroGateway;
  private readonly identifier: string;
  private readonly options: Required<PteroWebSocketOptions>;
  private readonly listeners = new Map<string, Set<Listener>>();
  private reconnectAttempts = 0;
  private manualClose = false;
  private opened = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token = "";
  private socketUrl = "";
  private messagesSent = 0;
  private messagesReceived = 0;
  private connectedAt?: number;
  private lastMessageAt?: number;
  private consoleBuffer: string[] = [];

  constructor(gateway: PteroGateway, identifier: string, options: PteroWebSocketOptions = {}) {
    this.gateway = gateway;
    this.identifier = identifier;
    this.options = {
      reconnect: options.reconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectBaseDelay: options.reconnectBaseDelay ?? 1000,
      reconnectMaxDelay: options.reconnectMaxDelay ?? 30000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      timeout: options.timeout ?? 15000,
      autoAuthenticate: options.autoAuthenticate ?? true
    };
  }

  async connect(): Promise<void> {
    this.manualClose = false;
    const credentials = await this.gateway.server(this.identifier).websocket.auth();
    const data = asObject(asObject(credentials).data);
    this.token = String(data.token ?? asObject(credentials).token ?? "");
    this.socketUrl = String(data.socket ?? asObject(credentials).socket ?? "");
    if (!this.token || !this.socketUrl) {
      throw new PteroError({ code: "WEBSOCKET_AUTH_INVALID", message: "Panel tidak mengembalikan token atau URL WebSocket." });
    }

    const socket = await this.openSocket();
    this.socket = socket;
    this.opened = false;
    this.connectedAt = Date.now();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          socket.close();
        } catch {
          undefined;
        }
        reject(new PteroError({ code: "WEBSOCKET_TIMEOUT", message: `Koneksi WebSocket tidak terbuka dalam ${this.options.timeout}ms.` }));
      }, this.options.timeout);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };

      socket.onopen = () => {
        this.opened = true;
        this.reconnectAttempts = 0;
        if (this.options.autoAuthenticate) this.sendRaw({ event: "auth", args: [this.token] });
        this.emit("open", {});
        this.startHeartbeat();
        finish();
      };

      socket.onmessage = (event: any) => {
        this.handleMessage(event?.data);
      };

      socket.onerror = (event: unknown) => {
        const error = event instanceof Error ? event : new Error("WebSocket error.");
        this.emit("error", error);
        if (!this.opened) finish(error);
      };

      socket.onclose = (event: any) => {
        this.stopHeartbeat();
        const wasOpen = this.opened;
        this.opened = false;
        this.emit("close", { code: event?.code, reason: event?.reason });
        if (!wasOpen) {
          finish(new PteroError({ code: "WEBSOCKET_CLOSED", message: "WebSocket tertutup sebelum koneksi terbuka." }));
          return;
        }
        if (!this.manualClose) this.scheduleReconnect();
      };

      socket.onpong = () => {
        this.lastMessageAt = Date.now();
      };
    });
  }

  private async openSocket(): Promise<any> {
    if (typeof WebSocket !== "undefined" && typeof window !== "undefined") {
      return new WebSocket(this.socketUrl);
    }
    const imported = await import("ws");
    const WS = imported.default;
    return new WS(this.socketUrl, {
      origin: this.gateway.domain,
      headers: {
        "User-Agent": this.gateway.userAgent
      }
    });
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string" && !Buffer.isBuffer(raw)) return;
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
    this.messagesReceived += 1;
    this.lastMessageAt = Date.now();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      this.emit("error", error);
      return;
    }
    const event = String(payload.event ?? "");
    const args = Array.isArray(payload.args) ? payload.args : [];
    if (!event) return;

    if (event === "console output") {
      const line = String(args[0] ?? "");
      this.consoleBuffer.push(line);
      if (this.consoleBuffer.length > 500) this.consoleBuffer.splice(0, this.consoleBuffer.length - 500);
      this.emit("console", line);
      this.emit("console output", line);
      return;
    }
    if (event === "stats") {
      let stats: unknown = args[0];
      if (typeof stats === "string") {
        try {
          stats = JSON.parse(stats);
        } catch {
          stats = { raw: stats };
        }
      }
      this.emit("stats", stats);
      this.emit("stats_update", stats);
      return;
    }
    if (event === "status") {
      this.emit("status", String(args[0] ?? ""));
      this.emit("status_change", String(args[0] ?? ""));
      return;
    }
    if (event === "token expiring" || event === "token expired") {
      void this.refreshToken();
      return;
    }
    this.emit(event, args);
  }

  private async refreshToken() {
    try {
      const credentials = await this.gateway.server(this.identifier).websocket.auth();
      const data = asObject(asObject(credentials).data);
      this.token = String(data.token ?? asObject(credentials).token ?? "");
      if (this.token) this.sendRaw({ event: "auth", args: [this.token] });
      this.emit("token_refreshed", {});
    } catch (error) {
      this.emit("error", error);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    if (this.options.heartbeatInterval <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket) return;
      if (typeof this.socket.ping === "function") {
        try {
          this.socket.ping();
        } catch {
          undefined;
        }
      }
    }, this.options.heartbeatInterval);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.manualClose || !this.options.reconnect) return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit("reconnect_failed", { attempts: this.reconnectAttempts });
      this.gateway.logger.error(`WebSocket gagal tersambung kembali setelah ${this.reconnectAttempts} percobaan.`);
      return;
    }
    this.reconnectAttempts += 1;
    const exponential = Math.min(
      this.options.reconnectMaxDelay,
      this.options.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1)
    );
    const delay = Math.round(exponential * (0.75 + Math.random() * 0.5));
    this.emit("reconnecting", { attempt: this.reconnectAttempts, delay });
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch(error => {
        this.emit("error", error);
        this.scheduleReconnect();
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private sendRaw(payload: { event: string; args: unknown[] }): boolean {
    if (!this.socket || this.socket.readyState !== 1) return false;
    try {
      this.socket.send(JSON.stringify(payload));
      this.messagesSent += 1;
      return true;
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }

  send(event: string, args: unknown[] = []): boolean {
    return this.sendRaw({ event, args });
  }

  sendCommand(command: string): boolean {
    return this.send("send command", [command]);
  }

  requestStats(): boolean {
    return this.send("send stats", []);
  }

  setState(state: "start" | "stop" | "restart" | "kill"): boolean {
    return this.send("set state", [state]);
  }

  on(event: string, callback: Listener): () => void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(callback);
    this.listeners.set(event, set);
    return () => this.off(event, callback);
  }

  once(event: string, callback: Listener): () => void {
    const wrapper: Listener = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, callback: Listener): void {
    this.listeners.get(event)?.delete(callback);
  }

  onConsole(callback: (line: string) => void): () => void {
    return this.on("console", callback as Listener);
  }

  onStats(callback: (stats: unknown) => void): () => void {
    return this.on("stats", callback as Listener);
  }

  onStatus(callback: (status: string) => void): () => void {
    return this.on("status", callback as Listener);
  }

  waitFor(event: string, timeout = 30000): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new PteroError({ code: "WEBSOCKET_EVENT_TIMEOUT", message: `Event '${event}' tidak diterima dalam ${timeout}ms.` }));
      }, timeout);
      const unsubscribe = this.on(event, (...args: unknown[]) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(args);
      });
    });
  }

  getConsole(limit = 100): string[] {
    return this.consoleBuffer.slice(-Math.max(1, limit));
  }

  stats(): PteroWebSocketStats {
    return {
      connected: Boolean(this.socket && this.socket.readyState === 1),
      reconnects: this.reconnectAttempts,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt
    };
  }

  private emit(event: string, ...args: unknown[]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const callback of [...set]) {
      try {
        callback(...args);
      } catch (error) {
        if (event !== "error") this.emit("error", error);
      }
    }
  }

  async close(code = 1000, reason = "client disconnect"): Promise<void> {
    this.manualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    await new Promise<void>(resolve => {
      try {
        socket.close(code, reason);
      } catch {
        undefined;
      }
      setTimeout(resolve, 50);
    });
  }
}

export async function connectWebSocket(
  gateway: PteroGateway,
  identifier: string,
  options?: PteroWebSocketOptions
): Promise<PteroWebSocket> {
  const socket = new PteroWebSocket(gateway, identifier, options);
  await socket.connect();
  return socket;
}

export function waitForWebSocket(socket: PteroWebSocket, event: string, timeout?: number): Promise<unknown[]> {
  return socket.waitFor(event, timeout);
}

export function webSocketDelay(attempt: number, base = 1000, max = 30000): Promise<void> {
  return sleep(Math.min(max, base * Math.pow(2, attempt - 1)));
}
