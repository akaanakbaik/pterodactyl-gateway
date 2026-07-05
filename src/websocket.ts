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

  async connect() {
    this.isManualClose = false;
    try {
      const auth = await this.gateway.server(this.serverId).websocket.auth();
      const { token, socket } = auth.data ? auth.data : auth;

      if (typeof (globalThis as any).WebSocket === "undefined") {
        const WS = (await import("ws")).default;
        this.ws = new WS(socket);
      } else {
        this.ws = new (globalThis as any).WebSocket(socket);
      }

      this.ws.onopen = () => {
        this.reconnectCount = 0;
        this.send("auth", [token]);
        this.emit("open", {});
      };

      this.ws.onmessage = (event: any) => {
        const data = JSON.parse(event.data);
        this.emit(data.event, data.args);

        if (data.event === "console output") {
          this.emit("console", data.args[0]);
        } else if (data.event === "stats") {
          this.emit("stats_update", JSON.parse(data.args[0]));
        } else if (data.event === "status") {
          this.emit("status_change", data.args[0]);
        }
      };

      this.ws.onclose = () => {
        this.emit("close", {});
        if (!this.isManualClose) {
          this.handleReconnect();
        }
      };

      this.ws.onerror = (err: any) => {
        this.emit("error", err);
      };
    } catch (error) {
      this.emit("error", error);
      if (!this.isManualClose) {
        this.handleReconnect();
      }
    }
  }

  private handleReconnect() {
    if (this.reconnectCount < this.maxReconnectAttempts) {
      this.reconnectCount++;
      this.gateway.logger.warn(`WebSocket disconnected. Reconnecting in ${this.reconnectDelay}ms (Attempt ${this.reconnectCount}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    } else {
      this.gateway.logger.error(`WebSocket reconnection failed after ${this.maxReconnectAttempts} attempts.`);
    }
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
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  close() {
    this.isManualClose = true;
    if (this.ws) {
      this.ws.close();
    }
  }
}
