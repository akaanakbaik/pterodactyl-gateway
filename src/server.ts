import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PteroError } from "./errors.js";
import type { PteroGateway } from "./gateway.js";
import { PteroScheduleBuilder, assertScheduleId, normalizeSchedule, schedulePayload } from "./schedule.js";
import {
  FileListResult,
  PteroServerResources,
  PteroWebSocketAuth,
  ScheduleDefinition,
  ServerPowerSignal,
  WaitOptions
} from "./types.js";
import { asObject, getCollection, getDataAttributes, sleep } from "./utils.js";
import { PteroWebSocket } from "./websocket.js";

const POWER_SIGNALS = new Set<ServerPowerSignal>(["start", "stop", "restart", "kill"]);

export class PteroServerHandle {
  readonly gateway: PteroGateway;
  readonly identifier: string;

  constructor(gateway: PteroGateway, identifier: string) {
    if (!identifier || !identifier.trim()) throw new Error("Identifier server wajib diisi.");
    this.gateway = gateway;
    this.identifier = identifier.trim();
  }

  get files() {
    const base = `/servers/${this.identifier}/files`;
    return {
      list: async (directory = "/"): Promise<FileListResult> => {
        const response = await this.gateway.request<unknown>({ api: "client", path: `${base}/list`, query: { directory } });
        const root = asObject(response);
        const rawData = Array.isArray(root.data) ? root.data : getCollection(response);
        const data = rawData.map(item => {
          const entry = asObject(item);
          const attributes = asObject(entry.attributes);
          return (Object.keys(attributes).length > 0 ? attributes : entry) as unknown as FileListResult["data"][number];
        });
        return { object: String(root.object ?? "list"), data };
      },
      read: (file: string): Promise<string> =>
        this.gateway.request<string>({ api: "client", path: `${base}/contents`, query: { file }, responseType: "text", rejectHtml: true }),
      readJson: async <T = unknown>(file: string): Promise<T> => {
        const content = await this.files.read(file);
        try {
          return JSON.parse(content) as T;
        } catch (error) {
          throw new PteroError({
            code: "INVALID_JSON_FILE",
            message: `File ${file} bukan JSON yang valid.`,
            hint: "Periksa isi file sebelum membaca sebagai JSON.",
            cause: error
          });
        }
      },
      write: (file: string, content: string | Buffer): Promise<unknown> =>
        this.gateway.request({ api: "client", method: "POST", path: `${base}/write`, query: { file }, body: content, contentType: "text" }),
      writeJson: (file: string, data: unknown, space = 2): Promise<unknown> => this.files.write(file, JSON.stringify(data, null, space)),
      append: async (file: string, content: string): Promise<unknown> => {
        let current = "";
        try {
          current = await this.files.read(file);
        } catch {
          current = "";
        }
        return this.files.write(file, `${current}${content}`);
      },
      tail: async (file: string, lines = 100): Promise<string[]> => {
        const content = await this.files.read(file);
        return content.split(/\r?\n/).slice(-Math.max(1, lines));
      },
      delete: (root: string, files: string[]): Promise<unknown> =>
        this.gateway.request({ api: "client", method: "POST", path: `${base}/delete`, body: { root, files } }),
      mkdir: (root: string, name: string): Promise<unknown> =>
        this.gateway.request({ api: "client", method: "POST", path: `${base}/create-folder`, body: { root, name } }),
      rename: (root: string, files: Array<{ from: string; to: string }>): Promise<unknown> =>
        this.gateway.request({ api: "client", method: "PUT", path: `${base}/rename`, body: { root, files } }),
      compress: (root: string, files: string[]): Promise<unknown> =>
        this.gateway.request({ api: "client", method: "POST", path: `${base}/compress`, body: { root, files } }),
      decompress: (root: string, file: string): Promise<unknown> =>
        this.gateway.request({ api: "client", method: "POST", path: `${base}/decompress`, body: { root, file } }),
      downloadUrl: async (file: string): Promise<string> => {
        const response = await this.gateway.request<unknown>({ api: "client", path: `${base}/download`, query: { file } });
        const attributes = getDataAttributes(response);
        const url = String(attributes.url ?? "");
        if (!url) throw new PteroError({ code: "DOWNLOAD_URL_MISSING", message: "Panel tidak mengembalikan URL download." });
        return url;
      },
      download: async (file: string): Promise<Buffer> => {
        const url = await this.files.downloadUrl(file);
        const response = await fetch(url);
        if (!response.ok) {
          throw new PteroError({
            code: "DOWNLOAD_FAILED",
            message: `Gagal mengunduh file dari panel (HTTP ${response.status}).`,
            status: response.status
          });
        }
        return Buffer.from(await response.arrayBuffer());
      },
      downloadToFile: async (file: string, destination: string, maxBytes?: number): Promise<{ bytes: number; destination: string }> => {
        const url = await this.files.downloadUrl(file);
        const response = await fetch(url);
        if (!response.ok || !response.body) {
          throw new PteroError({
            code: "DOWNLOAD_FAILED",
            message: `Gagal mengunduh file dari panel (HTTP ${response.status}).`,
            status: response.status
          });
        }
        const declared = Number(response.headers.get("content-length") ?? 0);
        if (maxBytes && declared > maxBytes) {
          throw new PteroError({
            code: "DOWNLOAD_TOO_LARGE",
            message: `File melebihi batas ${maxBytes} byte.`,
            hint: "Naikkan maxBytes atau unduh manual dari panel."
          });
        }
        await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destination));
        const { stat } = await import("node:fs/promises");
        const info = await stat(destination);
        return { bytes: info.size, destination };
      },
      upload: async (root: string, filename: string, content: Buffer | string): Promise<unknown> => {
        const form = new FormData();
        form.append("files", new Blob([content as unknown as BlobPart]), filename);
        return this.gateway.request({
          api: "client",
          method: "POST",
          path: `${base}/upload`,
          query: { directory: root },
          body: form,
          contentType: "multipart",
          retryUnsafe: false
        });
      },
      uploadFromFile: async (root: string, localPath: string): Promise<unknown> => {
        const { basename } = await import("node:path");
        return this.files.upload(root, basename(localPath), await readFile(localPath));
      }
    };
  }

  get backups() {
    const base = `/servers/${this.identifier}/backups`;
    return {
      list: (page = 1) => this.gateway.request<unknown>({ api: "client", path: base, query: { page } }),
      get: (backupId: string) => this.gateway.request<unknown>({ api: "client", path: `${base}/${backupId}` }),
      create: (name?: string, ignored?: string[] | string, isLocked = false) =>
        this.gateway.request<unknown>({
          api: "client",
          method: "POST",
          path: base,
          body: {
            name,
            ignored: Array.isArray(ignored) ? ignored.join("\n") : ignored,
            is_locked: isLocked
          }
        }),
      delete: (backupId: string) => this.gateway.request<unknown>({ api: "client", method: "DELETE", path: `${base}/${backupId}` }),
      downloadUrl: async (backupId: string): Promise<string> => {
        const response = await this.gateway.request<unknown>({ api: "client", path: `${base}/${backupId}/download` });
        const attributes = getDataAttributes(response);
        const url = String(attributes.url ?? "");
        if (!url) throw new PteroError({ code: "DOWNLOAD_URL_MISSING", message: "Panel tidak mengembalikan URL backup." });
        return url;
      },
      waitFor: async (backupId: string, options: WaitOptions = {}) => {
        const timeout = options.timeout ?? 600000;
        const interval = options.interval ?? 5000;
        const started = Date.now();
        while (true) {
          const response = await this.backups.get(backupId);
          const attributes = getDataAttributes(response);
          options.onPoll?.(response);
          if (attributes.completed_at || attributes.is_successful === true) return attributes;
          if (Date.now() - started > timeout) {
            throw new PteroError({
              code: "BACKUP_TIMEOUT",
              message: `Backup ${backupId} tidak selesai dalam ${timeout}ms.`,
              hint: "Periksa status backup dan ruang disk node."
            });
          }
          await sleep(interval, options.signal);
        }
      },
      createAndWait: async (name?: string, ignored?: string[] | string, options: WaitOptions = {}) => {
        const response = await this.backups.create(name, ignored);
        const uuid = String(getDataAttributes(response).uuid ?? "");
        if (!uuid) throw new PteroError({ code: "BACKUP_UUID_MISSING", message: "Panel tidak mengembalikan UUID backup." });
        return this.backups.waitFor(uuid, options);
      }
    };
  }

  get schedules() {
    const base = `/servers/${this.identifier}/schedules`;
    return {
      list: (page = 1) => this.gateway.request<unknown>({ api: "client", path: base, query: { page } }),
      get: (scheduleId: number) => this.gateway.request<unknown>({ api: "client", path: `${base}/${assertScheduleId(scheduleId)}` }),
      create: async (definition: ScheduleDefinition) => {
        const response = await this.gateway.request<unknown>({ api: "client", method: "POST", path: base, body: schedulePayload(definition) });
        const id = Number(getDataAttributes(response).id ?? 0);
        if (!id) throw new PteroError({ code: "SCHEDULE_CREATE_FAILED", message: "Panel tidak mengembalikan ID schedule." });
        for (let index = 0; index < definition.tasks.length; index += 1) {
          const task = definition.tasks[index]!;
          await this.gateway.request({
            api: "client",
            method: "POST",
            path: `${base}/${id}/tasks`,
            body: {
              sequence_id: index + 1,
              action: task.action,
              payload: task.payload ?? "",
              time_offset: task.timeOffset ?? 0,
              continue_on_failure: task.continueOnFailure ?? false
            }
          });
        }
        return { id, ...definition };
      },
      update: async (scheduleId: number, definition: ScheduleDefinition) => {
        const id = assertScheduleId(scheduleId);
        await this.gateway.request({ api: "client", method: "POST", path: `${base}/${id}`, body: schedulePayload(definition) });
        const existing = await this.gateway.request<unknown>({ api: "client", path: `${base}/${id}` });
        const relationships = asObject(getDataAttributes(existing).relationships);
        const tasks = asObject(relationships.tasks);
        const currentTasks = Array.isArray(tasks.data) ? tasks.data : [];
        for (const task of currentTasks) {
          const taskId = Number(getDataAttributes(task).id ?? 0);
          if (taskId) await this.gateway.request({ api: "client", method: "DELETE", path: `${base}/${id}/tasks/${taskId}` });
        }
        for (let index = 0; index < definition.tasks.length; index += 1) {
          const task = definition.tasks[index]!;
          await this.gateway.request({
            api: "client",
            method: "POST",
            path: `${base}/${id}/tasks`,
            body: {
              sequence_id: index + 1,
              action: task.action,
              payload: task.payload ?? "",
              time_offset: task.timeOffset ?? 0,
              continue_on_failure: task.continueOnFailure ?? false
            }
          });
        }
        return { id, ...definition };
      },
      delete: (scheduleId: number) => this.gateway.request<unknown>({ api: "client", method: "DELETE", path: `${base}/${assertScheduleId(scheduleId)}` }),
      execute: (scheduleId: number) => this.gateway.request<unknown>({ api: "client", method: "POST", path: `${base}/${assertScheduleId(scheduleId)}/execute` }),
      task: {
        create: (scheduleId: number, task: { action: string; payload: string; timeOffset?: number; continueOnFailure?: boolean; sequenceId?: number }) =>
          this.gateway.request<unknown>({
            api: "client",
            method: "POST",
            path: `${base}/${assertScheduleId(scheduleId)}/tasks`,
            body: {
              sequence_id: task.sequenceId ?? 1,
              action: task.action,
              payload: task.payload,
              time_offset: task.timeOffset ?? 0,
              continue_on_failure: task.continueOnFailure ?? false
            }
          }),
        update: (scheduleId: number, taskId: number, task: { action?: string; payload?: string; timeOffset?: number; continueOnFailure?: boolean; sequenceId?: number }) =>
          this.gateway.request<unknown>({
            api: "client",
            method: "POST",
            path: `${base}/${assertScheduleId(scheduleId)}/tasks/${taskId}`,
            body: {
              sequence_id: task.sequenceId,
              action: task.action,
              payload: task.payload,
              time_offset: task.timeOffset,
              continue_on_failure: task.continueOnFailure
            }
          }),
        delete: (scheduleId: number, taskId: number) =>
          this.gateway.request<unknown>({ api: "client", method: "DELETE", path: `${base}/${assertScheduleId(scheduleId)}/tasks/${taskId}` })
      }
    };
  }

  get network() {
    const base = `/servers/${this.identifier}/network/allocations`;
    return {
      list: () => this.gateway.request<unknown>({ api: "client", path: base }),
      assign: () => this.gateway.request<unknown>({ api: "client", method: "POST", path: base }),
      setNote: (allocationId: number, note: string) =>
        this.gateway.request<unknown>({ api: "client", method: "POST", path: `${base}/${allocationId}`, body: { notes: note } }),
      setPrimary: (allocationId: number) =>
        this.gateway.request<unknown>({ api: "client", method: "POST", path: `${base}/${allocationId}/primary` }),
      delete: (allocationId: number) =>
        this.gateway.request<unknown>({ api: "client", method: "DELETE", path: `${base}/${allocationId}` })
    };
  }

  get databases() {
    const base = `/servers/${this.identifier}/databases`;
    return {
      list: (page = 1) => this.gateway.request<unknown>({ api: "client", path: base, query: { page } }),
      create: (database: string, remote = "%") =>
        this.gateway.request<unknown>({ api: "client", method: "POST", path: base, body: { database, remote } }),
      rotatePassword: (databaseId: string) =>
        this.gateway.request<unknown>({ api: "client", method: "POST", path: `${base}/${databaseId}/rotate-password` }),
      delete: (databaseId: string) => this.gateway.request<unknown>({ api: "client", method: "DELETE", path: `${base}/${databaseId}` })
    };
  }

  get startup() {
    const base = `/servers/${this.identifier}/startup`;
    return {
      get: () => this.gateway.request<unknown>({ api: "client", path: base }),
      set: (env: string, value: string | number | boolean) =>
        this.gateway.request<unknown>({
          api: "client",
          method: "PUT",
          path: `${base}/variable`,
          body: { key: String(env), value: String(value) }
        })
    };
  }

  get settings() {
    const base = `/servers/${this.identifier}/settings`;
    return {
      rename: (name: string) => this.gateway.request<unknown>({ api: "client", method: "POST", path: `${base}/rename`, body: { name } }),
      reinstall: () => this.gateway.request<unknown>({ api: "client", method: "POST", path: `${base}/reinstall` })
    };
  }

  get websocket() {
    return {
      auth: () => this.gateway.request<PteroWebSocketAuth>({ api: "client", path: `/servers/${this.identifier}/websocket` }),
      create: (options?: ConstructorParameters<typeof PteroWebSocket>[2]) => new PteroWebSocket(this.gateway, this.identifier, options),
      connect: async (options?: ConstructorParameters<typeof PteroWebSocket>[2]) => {
        const socket = new PteroWebSocket(this.gateway, this.identifier, options);
        await socket.connect();
        return socket;
      }
    };
  }

  activity(page = 1) {
    return this.gateway.request<unknown>({ api: "client", path: `/servers/${this.identifier}/activity`, query: { page } });
  }

  details() {
    return this.gateway.request<unknown>({ api: "client", path: `/servers/${this.identifier}` }).catch(async error => {
      const response = await this.gateway.client.servers.list();
      const items = Array.isArray(asObject(response).data) ? (asObject(response).data as unknown[]) : [];
      const found = items.find(item => String(getDataAttributes(item).identifier ?? "") === this.identifier);
      if (!found) throw error;
      return found;
    });
  }

  async resources(): Promise<PteroServerResources> {
    const response = await this.gateway.request<unknown>({ api: "client", path: `/servers/${this.identifier}/resources` });
    const attributes = getDataAttributes(response);
    const resources = asObject(attributes.resources);
    return {
      current_state: String(attributes.current_state ?? "unknown"),
      is_suspended: Boolean(attributes.is_suspended),
      resources: {
        memory_bytes: Number(resources.memory_bytes ?? 0),
        cpu_absolute: Number(resources.cpu_absolute ?? 0),
        disk_bytes: Number(resources.disk_bytes ?? 0),
        network_rx_bytes: Number(resources.network_rx_bytes ?? 0),
        network_tx_bytes: Number(resources.network_tx_bytes ?? 0),
        uptime: Number(resources.uptime ?? 0)
      }
    };
  }

  power(signal: ServerPowerSignal) {
    if (!POWER_SIGNALS.has(signal)) throw new Error(`Sinyal power tidak valid: ${signal}`);
    this.gateway.logger.info(`Mengirim sinyal ${signal} ke server ${this.identifier}.`);
    return this.gateway.request<unknown>({
      api: "client",
      method: "POST",
      path: `/servers/${this.identifier}/power`,
      body: { signal }
    });
  }

  start() {
    return this.power("start");
  }

  stop() {
    return this.power("stop");
  }

  restart() {
    return this.power("restart");
  }

  kill() {
    return this.power("kill");
  }

  command(command: string) {
    const value = command.trim();
    if (!value) throw new Error("Command wajib diisi.");
    this.gateway.logger.info(`Mengirim command ke server ${this.identifier}.`);
    return this.gateway.request<unknown>({
      api: "client",
      method: "POST",
      path: `/servers/${this.identifier}/command`,
      body: { command: value }
    });
  }

  async waitForState(target: string | string[], options: WaitOptions = {}) {
    const targets = Array.isArray(target) ? target : [target];
    const timeout = options.timeout ?? 120000;
    const interval = options.interval ?? 2000;
    const started = Date.now();
    while (true) {
      const response = await this.resources();
      options.onPoll?.(response);
      if (targets.includes(response.current_state)) return response;
      if (Date.now() - started > timeout) {
        throw new PteroError({
          code: "STATE_TIMEOUT",
          message: `Server ${this.identifier} tidak mencapai state ${targets.join("/")} dalam ${timeout}ms.`,
          hint: "Periksa console server dan status Wings."
        });
      }
      await sleep(interval, options.signal);
    }
  }

  async waitForInstall(options: WaitOptions = {}) {
    const timeout = options.timeout ?? 600000;
    const interval = options.interval ?? 5000;
    const started = Date.now();
    while (true) {
      const details = await this.details();
      const attributes = getDataAttributes(details);
      options.onPoll?.(details);
      if (attributes.is_installing === false || attributes.is_installing === undefined) return details;
      if (Date.now() - started > timeout) {
        throw new PteroError({
          code: "INSTALL_TIMEOUT",
          message: `Instalasi server ${this.identifier} tidak selesai dalam ${timeout}ms.`,
          hint: "Periksa status instalasi di panel dan koneksi node."
        });
      }
      await sleep(interval, options.signal);
    }
  }

  createScheduleBuilder() {
    return new PteroScheduleBuilder(this);
  }

  async setupAutoBackupSchedule(options: { cron: string; name?: string; onlyWhenOnline?: boolean }) {
    const builder = this.createScheduleBuilder()
      .setName(options.name ?? "Auto Backup Schedule")
      .setCron(options.cron)
      .setOnlyWhenOnline(options.onlyWhenOnline ?? false)
      .addBackupTask();
    return builder.save();
  }

  clientServerPages(page = 1) {
    return this.gateway.request<unknown>({ api: "client", path: "/", query: { page } });
  }

}
