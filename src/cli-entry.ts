#!/usr/bin/env node

const EXPLAINS: Record<string, { title: string; reason: string; fix: string[] }> = {
  DOMAIN_REQUIRED: {
    title: "Domain panel belum diisi",
    reason: "PTERO_DOMAIN belum tersedia atau config tidak memiliki domain.",
    fix: [
      'export PTERO_DOMAIN="https://panel.example.com"',
      "ptero-gateway config init --domain https://panel.example.com --ptla ptla_xxx --ptlc ptlc_xxx",
      "ptero-gateway doctor"
    ]
  },
  AUTH_FAILED: {
    title: "Autentikasi API gagal",
    reason: "PTLA atau PTLC tidak valid, kedaluwarsa, atau tidak memiliki permission.",
    fix: ["Buat ulang API key di panel", "Simpan key melalui config init", "Jalankan doctor --json"]
  },
  PTLA_REQUIRED: {
    title: "Application API key belum diisi",
    reason: "Aksi admin membutuhkan PTERO_PTLA.",
    fix: ["Buat Application API key di panel admin", "export PTERO_PTLA=ptla_xxx", "ptero-gateway doctor"]
  },
  PTLC_REQUIRED: {
    title: "Client API key belum diisi",
    reason: "Aksi client membutuhkan PTERO_PTLC.",
    fix: ["Buat Client API key dari account panel", "export PTERO_PTLC=ptlc_xxx", "ptero-gateway doctor"]
  },
  VALIDATION_ERROR: {
    title: "Payload ditolak panel",
    reason: "Ada field wajib atau tipe data yang tidak sesuai.",
    fix: ["Jalankan create-server --dry-run", "Periksa node, nest, egg, dan allocation", "Gunakan --json untuk payload lengkap"]
  },
  NO_FREE_ALLOCATION: {
    title: "Tidak ada port kosong",
    reason: "Node tidak memiliki allocation yang belum dipakai.",
    fix: ["Tambahkan allocation di panel", "Pilih node lain", "Longgarkan port range"]
  },
  SAFE_MODE_CONFIRMATION_REQUIRED: {
    title: "Konfirmasi safe mode diperlukan",
    reason: "Operasi destruktif membutuhkan konfirmasi eksplisit.",
    fix: ["Tambahkan --yes", "Gunakan opsi confirm true pada SDK", "Atur safeMode false hanya untuk otomasi tepercaya"]
  },
  NESTS_ENDPOINT_UNAVAILABLE: {
    title: "Panel tidak memiliki endpoint nests",
    reason: "Varian panel hanya menyediakan endpoint eggs.",
    fix: ["Gunakan egg ID langsung", "Atur PTERO_NEST_ID", "Jalankan doctor untuk melihat kemampuan panel"]
  },
  CIRCUIT_OPEN: {
    title: "Circuit breaker terbuka",
    reason: "Terlalu banyak request gagal berturut-turut.",
    fix: ["Tunggu reset timeout", "Periksa kesehatan panel", "Turunkan konkurensi"]
  },
  PANEL_UNREACHABLE: {
    title: "Panel tidak dapat diakses",
    reason: "DNS, SSL, firewall, atau jaringan bermasalah.",
    fix: ["Cek domain di browser", "Ping panel dari VPS", "Periksa konfigurasi Cloudflare"]
  }
};

async function main() {
  const raw = process.argv.slice(2);
  const command = raw[0] ?? "help";
  const jsonMode = raw.includes("--json");

  if (command === "version" || command === "--version" || command === "-v") {
    const { versionCommand } = await import("./meta.js");
    versionCommand(jsonMode);
    return;
  }
  if (command === "self-check") {
    const { selfCheckCommand } = await import("./meta.js");
    selfCheckCommand(jsonMode);
    return;
  }
  if (command === "release-check") {
    const { releaseCheckCommand } = await import("./meta.js");
    releaseCheckCommand(jsonMode);
    return;
  }
  if (command === "env-template") {
    const { environmentTemplate } = await import("./env.js");
    console.log(environmentTemplate());
    return;
  }
  if (command === "explain") {
    const code = (raw[1] ?? "").toUpperCase();
    const result = EXPLAINS[code];
    if (jsonMode) console.log(JSON.stringify(result ?? { error: "UNKNOWN_EXPLAIN", code, available: Object.keys(EXPLAINS) }, null, 2));
    else if (!code || !result) console.log(`Kode error tersedia:\n${Object.keys(EXPLAINS).map(item => `- ${item}`).join("\n")}\n\nContoh: ptero-gateway explain AUTH_FAILED`);
    else console.log(`${result.title}\n\nPenyebab:\n${result.reason}\n\nPerbaikan:\n${result.fix.map((item, index) => `${index + 1}. ${item}`).join("\n")}`);
    return;
  }
  if (command === "config") {
    const { loadEnvFiles } = await import("./env.js");
    const { applyConfigProfile, configCommand } = await import("./config.js");
    loadEnvFiles();
    applyConfigProfile();
    await configCommand(raw.slice(1));
    return;
  }
  if (command === "templates") {
    const { templatesCommand } = await import("./templates.js");
    templatesCommand(raw.slice(1));
    return;
  }

  const { runCli } = await import("./cli.js");
  await runCli(raw);
}

main().catch(async error => {
  const jsonMode = process.argv.includes("--json");
  if (jsonMode) {
    console.log(JSON.stringify({ ok: false, error: { code: "CLI_ERROR", message: error instanceof Error ? error.message : String(error) } }, null, 2));
  } else {
    const { explainError } = await import("./errors.js");
    console.error(explainError(error));
  }
  process.exitCode = 1;
});
