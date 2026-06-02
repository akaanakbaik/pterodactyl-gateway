import { PteroGateway } from "./gateway.js";

export class PteroWebSocket {
  private ws: any = null;
  private gateway: PteroGateway;
  private serverId: string;
  private listeners: Record<string, Function[]> = {};

  constructor(gateway: PteroGateway, serverId: string) {
    this.gateway = gateway;
    this.serverId = serverId;
  }

  async connect() {
    const auth = await this.gateway.server(this.serverId).websocket.auth();
    const { token, socket } = auth.data ? auth.data : auth;

    if (typeof (globalThis as any).WebSocket === 'undefined') {
        const WS = (await import('ws')).default;
        this.ws = new WS(socket);
    } else {
        this.ws = new (globalThis as any).WebSocket(socket);
    }

    this.ws.onopen = () => {
      this.send("auth", [token]);
      this.emit("open", {});
    };

    this.ws.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      this.emit(data.event, data.args);
    };

    this.ws.onclose = () => this.emit("close", {});
    this.ws.onerror = (err: any) => this.emit("error", err);
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

  private emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
