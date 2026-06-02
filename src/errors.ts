export type PteroErrorInput = {
  code: string;
  message: string;
  hint?: string;
  steps?: string[];
  example?: unknown;
  status?: number;
  raw?: unknown;
};

export class PteroError extends Error {
  code: string;
  hint?: string;
  steps: string[];
  example?: unknown;
  status?: number;
  raw?: unknown;

  constructor(input: PteroErrorInput) {
    super(input.message);
    this.name = "PteroError";
    this.code = input.code;
    this.hint = input.hint;
    this.steps = input.steps ?? [];
    this.example = input.example;
    this.status = input.status;
    this.raw = input.raw;
  }

  toString() {
    let out = `\n[${this.code}] ${this.message}\n`;
    if (this.hint) out += `💡 Petunjuk: ${this.hint}\n`;
    if (this.steps.length > 0) {
      out += `🛠️  Langkah Perbaikan:\n`;
      this.steps.forEach((s, i) => out += `   ${i + 1}. ${s}\n`);
    }
    if (this.example) out += `📝 Contoh: ${JSON.stringify(this.example, null, 2)}\n`;
    return out;
  }
}

export function explainError(error: unknown): string {
  if (error instanceof PteroError) return error.toString();
  if (error instanceof Error) return `[Error] ${error.message}`;
  return String(error);
}

export const ErrorFactory = {
  domainRequired: () => new PteroError({
    code: "DOMAIN_REQUIRED",
    message: "Domain atau Panel URL wajib diisi.",
    hint: "SDK membutuhkan URL panel untuk melakukan request.",
    steps: ["Cek konfigurasi saat memanggil createPtero()", "Pastikan domain menyertakan http:// atau https://"]
  }),
  authFailed: (type: "application" | "client") => new PteroError({
    code: "AUTH_FAILED",
    message: `Autentikasi ${type} API gagal.`,
    hint: `API Key ${type === "application" ? "PTLA" : "PTLC"} tidak valid atau tidak memiliki izin.`,
    steps: ["Cek kembali API Key di panel Pterodactyl", "Pastikan API Key memiliki permission yang cukup"]
  }),
  serverNotFound: (id: string) => new PteroError({
    code: "SERVER_NOT_FOUND",
    message: `Server dengan identifier '${id}' tidak ditemukan.`,
    hint: "Identifier server biasanya berupa 8 karakter unik (misal: 311d56b7).",
    steps: ["Cek daftar server di panel", "Pastikan identifier benar dan tidak tertukar dengan UUID"]
  }),
  userNotFound: (email: string) => new PteroError({
    code: "USER_NOT_FOUND",
    message: `User dengan email '${email}' tidak ditemukan.`,
    hint: "User harus terdaftar di panel agar bisa digunakan.",
    steps: ["Cek menu Users di Admin Panel", "Gunakan autoCreateUser: true jika ingin otomatis membuat user baru"]
  }),
  noFreeAllocation: (nodeId: number) => new PteroError({
    code: "NO_FREE_ALLOCATION",
    message: `Tidak ada alokasi port kosong di Node ID ${nodeId}.`,
    hint: "Setiap server membutuhkan minimal satu alokasi port.",
    steps: ["Buka Admin Panel > Nodes > Pilih Node > Tab Allocations", "Tambahkan IP dan port baru", "Pastikan alokasi belum dipakai server lain"]
  }),
  insufficientResources: (type: string) => new PteroError({
    code: "INSUFFICIENT_RESOURCES",
    message: `Resource ${type} tidak mencukupi di node pilihan.`,
    hint: "Node mungkin sudah penuh atau melebihi limit over-allocation.",
    steps: ["Cek statistik node di panel", "Kurangi limit RAM/Disk pada specs server", "Gunakan node lain yang masih memiliki kapasitas"]
  })
};
