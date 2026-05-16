#!/usr/bin/env node

const rawArgs = process.argv.slice(2);
const command = rawArgs[0] ?? "help";
const jsonMode = rawArgs.includes("--json");

const EXPLAINS: Record<string, { title: string; reason: string; fix: string[] }> = {
  DOMAIN_REQUIRED: {
    title: "Domain panel belum diisi",
    reason: "Env PTERO_DOMAIN belum tersedia atau config createPtero belum berisi domain/panelUrl.",
    fix: [
      "export PTERO_DOMAIN=\"https://panel.example.com\"",
      "pastikan tidak ada spasi/kutip rusak pada env",
      "jalankan ulang: ptero-gateway doctor"
    ]
  },
  PTLA_REQUIRED: {
    title: "Application API Key belum diisi",
    reason: "Aksi admin membutuhkan PTERO_PTLA.",
    fix: [
      "buat Application API Key di panel admin Pterodactyl",
      "export PTERO_PTLA=\"ptla_xxx\"",
      "jalankan: ptero-gateway doctor"
    ]
  },
  PTLC_REQUIRED: {
    title: "Client API Key belum diisi",
    reason: "Aksi client server membutuhkan PTERO_PTLC.",
    fix: [
      "buat Client API Key dari account panel",
      "export PTERO_PTLC=\"ptlc_xxx\"",
      "jalankan: ptero-gateway doctor"
    ]
  },
  DOCKER_IMAGE_NOT_FOUND: {
    title: "Docker image egg tidak ditemukan",
    reason: "Egg tidak mengirim docker_image/docker_images yang bisa dipilih otomatis.",
    fix: [
      "cek egg ID dengan: ptero-gateway ids --nest <nestId>",
      "pastikan egg punya Docker Images di panel",
      "atau isi manual: --docker-image ghcr.io/parkervcp/yolks:nodejs_22"
    ]
  },
  STARTUP_VARIABLE_NOT_FOUND: {
    title: "Startup variable tidak ditemukan",
    reason: "Nama variable yang di-set tidak cocok dengan env_variable pada egg/server.",
    fix: [
      "lihat variable: ptero-gateway server <identifier> env",
      "salin nama variable dari kolom variable",
      "jalankan: ptero-gateway server <identifier> set-env KEY VALUE --yes"
    ]
  },
  VALIDATION_ERROR: {
    title: "Payload ditolak panel",
    reason: "Ada field yang tidak sesuai validasi Pterodactyl.",
    fix: [
      "jalankan create-server dengan --dry-run dulu",
      "cek node, nest, egg, allocation, dan feature limits",
      "pakai --json untuk melihat payload lengkap"
    ]
  },
  REQUEST_FAILED: {
    title: "Request ke panel gagal",
    reason: "Panel mengembalikan error HTTP atau response tidak sesuai.",
    fix: [
      "cek domain dan API key dengan: ptero-gateway doctor",
      "pastikan endpoint didukung versi panel",
      "coba ulang dengan --json untuk melihat response mentah"
    ]
  },
  BACKUP_LIMIT: {
    title: "Limit backup habis",
    reason: "Server tidak punya jatah backup atau sudah mencapai limit.",
    fix: [
      "cek: ptero-gateway admin server <id> limits",
      "update: ptero-gateway admin server <id> update-limits --backups 1 --yes",
      "lalu ulangi create-backup"
    ]
  },
  EEXIST: {
    title: "Binary global sudah ada",
    reason: "File /usr/bin/ptero-gateway atau /usr/bin/ptg masih ada dari npm link/install lama.",
    fix: [
      "npm unlink -g @akaanakbaik/pterodactyl-gateway 2>/dev/null || true",
      "rm -f /usr/bin/ptero-gateway /usr/bin/ptg",
      "npm i -g @akaanakbaik/pterodactyl-gateway"
    ]
  },
  E404: {
    title: "Package atau endpoint tidak ditemukan",
    reason: "NPM/package/endpoint belum tersedia atau nama salah.",
    fix: [
      "cek nama package atau identifier server",
      "untuk npm: npm view @akaanakbaik/pterodactyl-gateway@latest",
      "untuk server: ptero-gateway servers lalu salin identifier"
    ]
  }
};

if (command === "env-template") {
  const content = [
    "PTERO_DOMAIN=https://panel.example.com",
    "PTERO_PTLA=ptla_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "PTERO_PTLC=ptlc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ].join("\n");
  console.log(content);
} else if (command === "explain") {
  const code = (rawArgs[1] ?? "").toUpperCase();
  const result = EXPLAINS[code];
  if (jsonMode) {
    console.log(JSON.stringify(result ?? { error: "UNKNOWN_EXPLAIN", code }, null, 2));
  } else if (!code || !result) {
    console.log(`Kode error tersedia:\n${Object.keys(EXPLAINS).map(item => `- ${item}`).join("\n")}\n\nContoh: ptero-gateway explain DOMAIN_REQUIRED`);
  } else {
    console.log(`${result.title}\n\nPenyebab:\n${result.reason}\n\nCara perbaikan:\n${result.fix.map((item, index) => `${index + 1}. ${item}`).join("\n")}`);
  }
} else {
  await import("./cli.js");
}
