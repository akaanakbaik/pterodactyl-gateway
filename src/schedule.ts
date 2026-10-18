import { PteroError } from "./errors.js";
import type { PteroServerHandle } from "./server.js";
import { ScheduleDefinition, ScheduleTask } from "./types.js";
import { asObject, getDataAttributes, parseCron } from "./utils.js";

export class PteroScheduleBuilder {
  private readonly handle: PteroServerHandle;
  private name = "";
  private isActive = true;
  private onlyWhenOnline = false;
  private cron = "0 * * * *";
  private tasksList: ScheduleTask[] = [];

  constructor(handle: PteroServerHandle) {
    this.handle = handle;
  }

  setName(name: string): this {
    this.name = name.trim();
    return this;
  }

  setActive(active: boolean): this {
    this.isActive = active;
    return this;
  }

  setCron(expression: string): this {
    parseCron(expression);
    this.cron = expression.trim();
    return this;
  }

  setCronDetails(minute: string, hour: string, dayOfMonth: string, month: string, dayOfWeek: string): this {
    const expression = `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
    parseCron(expression);
    this.cron = expression;
    return this;
  }

  setOnlyWhenOnline(value: boolean): this {
    this.onlyWhenOnline = value;
    return this;
  }

  addTask(action: ScheduleTask["action"], payload: string, timeOffset = 0, continueOnFailure = false): this {
    if (!["power", "command", "backup"].includes(action)) throw new Error(`Aksi schedule tidak valid: ${action}`);
    if (!Number.isInteger(timeOffset) || timeOffset < 0) throw new Error("timeOffset harus bilangan bulat minimal 0.");
    if (action === "power" && !["start", "stop", "restart", "kill"].includes(payload)) {
      throw new Error("Payload power harus start, stop, restart, atau kill.");
    }
    this.tasksList.push({ action, payload, timeOffset, continueOnFailure });
    return this;
  }

  addPowerTask(signal: "start" | "stop" | "restart" | "kill", timeOffset = 0, continueOnFailure = false): this {
    return this.addTask("power", signal, timeOffset, continueOnFailure);
  }

  addCommandTask(command: string, timeOffset = 0, continueOnFailure = false): this {
    return this.addTask("command", command, timeOffset, continueOnFailure);
  }

  addBackupTask(timeOffset = 0, continueOnFailure = false): this {
    return this.addTask("backup", "", timeOffset, continueOnFailure);
  }

  clearTasks(): this {
    this.tasksList = [];
    return this;
  }

  getTasks(): ScheduleTask[] {
    return [...this.tasksList];
  }

  toDefinition(): ScheduleDefinition {
    return {
      name: this.name,
      cron: this.cron,
      onlyWhenOnline: this.onlyWhenOnline,
      isActive: this.isActive,
      tasks: this.getTasks()
    };
  }

  async save(): Promise<ScheduleDefinition & { id: number }> {
    if (!this.name) throw new Error("Nama schedule wajib diisi.");
    const definition = this.toDefinition();
    const created = await this.handle.schedules.create(definition);
    return { ...definition, id: created.id };
  }

  async update(scheduleId: number): Promise<ScheduleDefinition & { id: number }> {
    if (!this.name) throw new Error("Nama schedule wajib diisi.");
    const definition = this.toDefinition();
    await this.handle.schedules.update(scheduleId, definition);
    return { ...definition, id: scheduleId };
  }
}

export function schedulePayload(definition: ScheduleDefinition): Record<string, unknown> {
  if (!definition.name || !definition.name.trim()) throw new Error("Nama schedule wajib diisi.");
  const cron = parseCron(definition.cron);
  return {
    name: definition.name.trim(),
    is_active: definition.isActive ?? true,
    only_when_online: definition.onlyWhenOnline ?? false,
    minute: cron.minute,
    hour: cron.hour,
    day_of_month: cron.day_of_month,
    month: cron.month,
    day_of_week: cron.day_of_week
  };
}

export function normalizeSchedule(raw: unknown): ScheduleDefinition & { id: number; tasks: ScheduleTask[] } {
  const attributes = getDataAttributes(raw);
  const relationships = asObject(attributes.relationships);
  const taskCollection = asObject(relationships.tasks);
  const tasks = Array.isArray(taskCollection.data)
    ? taskCollection.data.map(item => {
        const task = getDataAttributes(item);
        return {
          action: String(task.action ?? "power") as ScheduleTask["action"],
          payload: String(task.payload ?? ""),
          timeOffset: Number(task.time_offset ?? 0),
          continueOnFailure: Boolean(task.continue_on_failure)
        };
      })
    : [];
  return {
    id: Number(attributes.id ?? 0),
    name: String(attributes.name ?? ""),
    cron: [attributes.minute, attributes.hour, attributes.day_of_month, attributes.month, attributes.day_of_week].map(value => String(value ?? "*")).join(" "),
    onlyWhenOnline: Boolean(attributes.only_when_online),
    isActive: Boolean(attributes.is_active),
    tasks
  };
}

export function assertScheduleId(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new PteroError({ code: "INVALID_SCHEDULE_ID", message: "ID schedule harus bilangan bulat positif." });
  }
  return id;
}
