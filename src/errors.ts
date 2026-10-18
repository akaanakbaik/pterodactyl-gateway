export type PteroErrorInput = {
  code: string;
  message: string;
  hint?: string;
  steps?: string[];
  example?: unknown;
  status?: number;
  raw?: unknown;
  retryAfter?: number;
  cause?: unknown;
};

export class PteroError extends Error {
  code: string;
  hint?: string;
  steps: string[];
  example?: unknown;
  status?: number;
  raw?: unknown;
  retryAfter?: number;
  override cause?: unknown;

  constructor(input: PteroErrorInput) {
    super(input.message);
    this.name = "PteroError";
    this.code = input.code;
    this.hint = input.hint;
    this.steps = input.steps ?? [];
    this.example = input.example;
    this.status = input.status;
    this.raw = input.raw;
    this.retryAfter = input.retryAfter;
    if (input.cause !== undefined) this.cause = input.cause;
    Error.captureStackTrace?.(this, PteroError);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      hint: this.hint,
      steps: this.steps,
      status: this.status,
      retryAfter: this.retryAfter
    };
  }

  override toString() {
    const lines = [`[${this.code}] ${this.message}`];
    if (this.hint) lines.push(`Petunjuk: ${this.hint}`);
    if (this.steps.length > 0) {
      lines.push("Langkah perbaikan:");
      this.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    }
    if (this.example !== undefined) lines.push(`Contoh: ${JSON.stringify(this.example, null, 2)}`);
    return lines.join("\n");
  }
}

export function isPteroError(error: unknown): error is PteroError {
  return error instanceof PteroError;
}

export function getPteroErrorCode(error: unknown): string | undefined {
  if (error instanceof PteroError) return error.code;
  if (error instanceof Error && typeof (error as unknown as { code?: unknown }).code === "string") {
    return (error as unknown as { code: string }).code;
  }
  return undefined;
}

export function explainError(error: unknown): string {
  if (error instanceof PteroError) return error.toString();
  if (error instanceof Error) return `[${error.name}] ${error.message}`;
  return String(error);
}

export function toPteroError(error: unknown, fallbackCode = "UNKNOWN_ERROR"): PteroError {
  if (error instanceof PteroError) return error;
  if (error instanceof Error) {
    return new PteroError({ code: fallbackCode, message: error.message, cause: error });
  }
  return new PteroError({ code: fallbackCode, message: String(error), cause: error });
}

export const ErrorFactory = {
  domainRequired: () =>
    new PteroError({
      code: "DOMAIN_REQUIRED",
      message: "Domain atau panel URL wajib diisi.",
      hint: "SDK membutuhkan URL panel untuk melakukan request.",
      steps: ["Isi PTERO_DOMAIN atau opsi domain saat membuat gateway", "Sertakan protokol http:// atau https://"],
      example: { domain: "https://panel.example.com" }
    }),
  authFailed: (type: "application" | "client") =>
    new PteroError({
      code: "AUTH_FAILED",
      message: `Autentikasi ${type} API gagal.`,
      hint: `API key ${type === "application" ? "PTLA" : "PTLC"} tidak valid atau tidak memiliki izin.`,
      steps: ["Periksa kembali API key di panel", "Pastikan key memiliki permission yang dibutuhkan", "Jalankan doctor untuk validasi menyeluruh"]
    }),
  serverNotFound: (id: string) =>
    new PteroError({
      code: "SERVER_NOT_FOUND",
      message: `Server dengan identifier '${id}' tidak ditemukan.`,
      hint: "Identifier server biasanya berupa 8 karakter unik.",
      steps: ["Buka daftar server di panel", "Pastikan identifier bukan UUID atau ID numerik"]
    }),
  userNotFound: (email: string) =>
    new PteroError({
      code: "USER_NOT_FOUND",
      message: `User dengan email '${email}' tidak ditemukan.`,
      hint: "User harus terdaftar di panel agar bisa digunakan.",
      steps: ["Periksa menu Users di admin panel", "Gunakan autoCreateUser untuk membuat user otomatis"]
    }),
  noFreeAllocation: (nodeId: number) =>
    new PteroError({
      code: "NO_FREE_ALLOCATION",
      message: nodeId ? `Tidak ada alokasi port kosong di node ${nodeId}.` : "Tidak ada alokasi port kosong yang sesuai.",
      hint: "Setiap server membutuhkan minimal satu alokasi port.",
      steps: ["Buka Nodes lalu tab Allocations", "Tambahkan IP dan port baru", "Pastikan port belum dipakai server lain"]
    }),
  insufficientResources: (type: string) =>
    new PteroError({
      code: "INSUFFICIENT_RESOURCES",
      message: `Resource ${type} tidak mencukupi pada node yang dipilih.`,
      hint: "Node mungkin penuh atau melebihi batas over-allocation.",
      steps: ["Periksa statistik node", "Kurangi limit spesifikasi server", "Pilih node lain yang masih memiliki kapasitas"]
    }),
  circuitOpen: (retryAfter: number) =>
    new PteroError({
      code: "CIRCUIT_OPEN",
      message: "Circuit breaker terbuka karena terlalu banyak kegagalan.",
      hint: `Coba lagi dalam ${Math.ceil(retryAfter / 1000)} detik atau periksa kesehatan panel.`,
      retryAfter,
      steps: ["Pastikan panel dapat diakses", "Turunkan konkurensi request", "Periksa log panel dan jaringan"]
    }),
  requestTimeout: (timeout: number) =>
    new PteroError({
      code: "REQUEST_TIMEOUT",
      message: `Request ke panel melewati batas waktu ${timeout}ms.`,
      hint: "Jaringan lambat, panel sibuk, atau timeout terlalu kecil.",
      steps: ["Naikkan opsi timeout", "Periksa koneksi dan DNS", "Kurangi ukuran payload"]
    }),
  validation: (message: string, raw?: unknown) =>
    new PteroError({
      code: "VALIDATION_ERROR",
      message,
      hint: "Payload ditolak oleh validasi panel.",
      steps: ["Jalankan preview atau dryRun", "Periksa field wajib", "Cocokkan tipe data dengan dokumentasi panel"],
      status: 422,
      raw
    }),
  unsupported: (feature: string) =>
    new PteroError({
      code: "UNSUPPORTED_PANEL_FEATURE",
      message: `Panel tidak mendukung fitur: ${feature}.`,
      hint: "Versi atau varian panel tidak menyediakan endpoint tersebut.",
      steps: ["Periksa versi panel", "Gunakan endpoint alternatif yang tersedia", "Jalankan doctor untuk memetakan kemampuan panel"]
    })
};
