import { PteroGateway } from "./gateway.js";

export class PteroWebSocket {
  private ws: any = null;
  private gateway: PteroGateway;
  private serverId: string;
  private listeners: Record<string, Function[]> = {};
  private reconnectCount = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private isManualClose = false;

  constructor(gateway: PteroGateway, serverId: string) {
    this.gateway = gateway;
    this.serverId = serverId;
  }

  async connect(): Promise<void> {
    this.isManualClose = false;
    try {
      const auth = await this.gateway.server(this.serverId).websocket.auth();
      const { token, socket } = auth.data ? auth.data : auth;

      if (typeof window === "undefined") {
        const WS = (await import("ws")).default;
        this.ws = new WS(socket, { origin: this.gateway.domain });
      } else {
        this.ws = new (globalThis as any).WebSocket(socket);
      }

      await new Promise<void>((resolve, reject) => {
        let opened = false;

        this.ws.onopen = () => {
          opened = true;
          this.reconnectCount = 0;
          this.send("auth", [token]);
          this.emit("open", {});
          resolve();
        };

        this.ws.onmessage = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            this.emit(data.event, data.args);

            if (data.event === "console output") {
              this.emit("console", data.args[0]);
            } else if (data.event === "stats") {
              this.emit("stats_update", JSON.parse(data.args[0]));
            } else if (data.event === "status") {
              this.emit("status_change", data.args[0]);
            }
          } catch (error) {
            this.emit("error", error);
          }
        };

        this.ws.onclose = () => {
          this.emit("close", {});
          if (!opened) {
            reject(new Error("WebSocket tertutup sebelum koneksi terbuka."));
            return;
          }
          if (!this.isManualClose) this.handleReconnect();
        };

        this.ws.onerror = (error: unknown) => {
          this.emit("error", error);
          if (!opened) reject(error instanceof Error ? error : new Error("WebSocket mengalami error sebelum koneksi terbuka."));
        };
      });
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }

  private handleReconnect() {
    if (this.reconnectCount >= this.maxReconnectAttempts || this.isManualClose) {
      if (!this.isManualClose) this.gateway.logger.error(`WebSocket reconnection failed after ${this.maxReconnectAttempts} attempts.`);
      return;
    }

    this.reconnectCount++;
    this.gateway.logger.warn(`WebSocket disconnected. Reconnecting in ${this.reconnectDelay}ms (Attempt ${this.reconnectCount}/${this.maxReconnectAttempts})...`);
    setTimeout(() => {
      void this.connect().catch(error => {
        this.emit("error", error);
        this.handleReconnect();
      });
    }, this.reconnectDelay);
  }

  send(event: string, args: any[] = []) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ event, args }));
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  onConsole(callback: (log: string) => void) {
    this.on("console", callback);
  }

  onStats(callback: (stats: any) => void) {
    this.on("stats_update", callback);
  }

  onStatus(callback: (status: string) => void) {
    this.on("status_change", callback);
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  close() {
    this.isManualClose = true;
    if (this.ws) this.ws.close();
  }
}
