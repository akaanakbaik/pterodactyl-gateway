import { createHash } from "node:crypto";
import { PteroError } from "./errors.js";
import { EmailAttachment, SendEmailOptions, SmtpConfig } from "./types.js";
import { maskSecret } from "./utils.js";

export type NormalizedSmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  secure: boolean;
  requireTls: boolean;
  rejectUnauthorized: boolean;
};

export type EmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
  envelope: unknown;
};

const transporters = new Map<string, any>();

export function normalizeSmtpConfig(value?: SmtpConfig): NormalizedSmtpConfig {
  const host = value?.host?.trim();
  const username = value?.username?.trim();
  const password = value?.password;
  if (!host || !value || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || !username || !password) {
    throw new PteroError({
      code: "SMTP_CONFIG_REQUIRED",
      message: "Konfigurasi SMTP lengkap wajib diisi.",
      hint: "Sediakan host, port, username, password, dan opsional fromAddress.",
      steps: ["Gunakan SMTP dari penyedia email", "Aktifkan TLS", "Simpan kredensial di environment, bukan di source code"]
    });
  }
  const encryption = (value.encryption ?? "").trim().toLowerCase();
  const secure = value.port === 465 || encryption === "ssl" || encryption === "tls";
  return {
    host,
    port: value.port,
    username,
    password,
    fromAddress: value.fromAddress?.trim() || username,
    fromName: (value.fromName?.trim() || "Pterodactyl Gateway").replace(/["\r\n]/g, ""),
    secure,
    requireTls: encryption === "starttls" || (!secure && value.port === 587),
    rejectUnauthorized: value.rejectUnauthorized ?? true
  };
}

export async function sendEmailMessage(options: SendEmailOptions): Promise<EmailResult> {
  if (!options.to || (Array.isArray(options.to) && options.to.length === 0)) {
    throw new PteroError({ code: "EMAIL_RECIPIENT_REQUIRED", message: "Penerima email wajib diisi." });
  }
  if (!options.subject || !options.subject.trim()) {
    throw new PteroError({ code: "EMAIL_SUBJECT_REQUIRED", message: "Subjek email wajib diisi." });
  }
  if (!options.text && !options.html) {
    throw new PteroError({ code: "EMAIL_BODY_REQUIRED", message: "Isi email (text atau html) wajib diisi." });
  }

  const smtp = normalizeSmtpConfig(options.smtp);
  const transporter = await getTransporter(smtp);
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const attachments = (options.attachments ?? []).map((attachment: EmailAttachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    path: attachment.path,
    contentType: attachment.contentType
  }));

  const info = await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromAddress}>`,
    to: recipients.join(", "),
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments
  });

  return {
    messageId: String(info.messageId ?? ""),
    accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
    rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
    response: String(info.response ?? ""),
    envelope: info.envelope
  };
}

export async function verifySmtp(value: SmtpConfig): Promise<{ ok: boolean; message: string }> {
  const smtp = normalizeSmtpConfig(value);
  const transporter = await getTransporter(smtp);
  try {
    await transporter.verify();
    return { ok: true, message: `SMTP ${smtp.host}:${smtp.port} siap (${maskSecret(smtp.username)}).` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function getTransporter(smtp: NormalizedSmtpConfig): Promise<any> {
  const key = createHash("sha256")
    .update(`${smtp.host}:${smtp.port}:${smtp.username}:${smtp.password}:${smtp.secure}:${smtp.rejectUnauthorized}`)
    .digest("hex");
  const cached = transporters.get(key);
  if (cached) return cached;

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTls,
    auth: { user: smtp.username, pass: smtp.password },
    tls: { rejectUnauthorized: smtp.rejectUnauthorized },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000
  });
  if (transporters.size >= 16) {
    const oldest = transporters.keys().next();
    if (!oldest.done) {
      const previous = transporters.get(oldest.value);
      transporters.delete(oldest.value);
      previous?.close?.();
    }
  }
  transporters.set(key, transporter);
  return transporter;
}

export function closeEmailTransports(): void {
  for (const transporter of transporters.values()) {
    try {
      transporter.close?.();
    } catch {
      undefined;
    }
  }
  transporters.clear();
}

export function renderEmailTemplate(template: string, variables: Record<string, string | number | boolean>, escape = true): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    if (!(key in variables)) return match;
    const value = String(variables[key]);
    return escape ? escapeHtml(value) : value;
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatSmtpSummary(value?: SmtpConfig): string {
  if (!value) return "SMTP belum dikonfigurasi.";
  const smtp = normalizeSmtpConfig(value);
  return `${smtp.host}:${smtp.port} user=${maskSecret(smtp.username)} secure=${smtp.secure}`;
}

export function smtpFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | undefined {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT ?? 587);
  const username = env.SMTP_USER ?? env.SMTP_USERNAME;
  const password = env.SMTP_PASS ?? env.SMTP_PASSWORD;
  if (!host || !username || !password) return undefined;
  return {
    host,
    port,
    username,
    password,
    fromAddress: env.SMTP_FROM ?? username,
    fromName: env.SMTP_FROM_NAME,
    encryption: env.SMTP_ENCRYPTION,
    rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED === undefined ? true : env.SMTP_REJECT_UNAUTHORIZED !== "false"
  };
}
