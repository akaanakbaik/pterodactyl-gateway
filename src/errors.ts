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
}

export function explainError(error: unknown): string {
  if (error instanceof PteroError) {
    const lines = [`${error.code}: ${error.message}`];
    if (error.hint) lines.push(`\nPetunjuk: ${error.hint}`);
    if (error.steps.length > 0) {
      lines.push("\nCara memperbaiki:");
      error.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    }
    if (error.example !== undefined) lines.push(`\nContoh: ${JSON.stringify(error.example, null, 2)}`);
    return lines.join("\n");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function nestEggMismatch(nestId: number, eggId: number, raw?: unknown): PteroError {
  return new PteroError({
    code: "NEST_EGG_MISMATCH",
    message: `Egg ID ${eggId} tidak ditemukan atau tidak cocok dengan Nest ID ${nestId}.`,
    hint: "Pastikan eggId berada di dalam nestId yang sama.",
    steps: [
      "Buka Admin Panel Pterodactyl.",
      "Masuk ke menu Nests.",
      "Pilih Nest yang ingin dipakai.",
      "Buka daftar Eggs di dalam Nest tersebut.",
      "Salin ID Egg yang benar.",
      "Jalankan ulang createSmart dengan nestId dan eggId yang sesuai."
    ],
    example: { nestId, eggId },
    raw
  });
}

export function nodeNotFound(nodeId: number, raw?: unknown): PteroError {
  return new PteroError({
    code: "NODE_NOT_FOUND",
    message: `Node ID ${nodeId} tidak ditemukan atau tidak bisa diakses.`,
    hint: "Cek kembali Node ID dan permission PTLA.",
    steps: [
      "Buka Admin Panel Pterodactyl.",
      "Masuk ke menu Nodes.",
      "Pilih node yang ingin dipakai.",
      "Salin ID node dari URL atau daftar node.",
      "Pastikan node aktif dan tidak maintenance."
    ],
    example: { nodeId },
    raw
  });
}

export function noFreeAllocation(nodeId: number): PteroError {
  return new PteroError({
    code: "NO_FREE_ALLOCATION",
    message: `Tidak ada allocation kosong di Node ID ${nodeId}.`,
    hint: "Tambahkan allocation di node atau pilih node lain.",
    steps: [
      "Buka Admin Panel Pterodactyl.",
      "Masuk ke menu Nodes.",
      `Pilih Node ID ${nodeId}.",
      "Buka tab Allocations.",
      "Tambahkan IP dan port baru.",
      "Pastikan allocation belum dipakai server lain.",
      "Jalankan ulang create server."
    ]
  });
}
