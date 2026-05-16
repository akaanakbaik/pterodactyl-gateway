const TEMPLATES = {
  "nodejs-bot": {
    description: "Bot Node.js umum dengan preset basic dan startup node index.js.",
    preset: "basic",
    startup: "node index.js",
    dockerImage: "auto",
    recommendedFiles: ["package.json", "index.js"]
  },
  "nodejs-api": {
    description: "API Express/Fastify ringan dengan preset standard.",
    preset: "standard",
    startup: "npm start",
    dockerImage: "auto",
    recommendedFiles: ["package.json", "src/index.js"]
  },
  "wa-bot": {
    description: "Bot WhatsApp/Baileys dengan preset standard.",
    preset: "standard",
    startup: "npm start",
    dockerImage: "auto",
    recommendedFiles: ["package.json", "index.js", "sessions/"]
  },
  "python-bot": {
    description: "Bot Python ringan dengan preset basic.",
    preset: "basic",
    startup: "python3 main.py",
    dockerImage: "auto",
    recommendedFiles: ["requirements.txt", "main.py"]
  },
  "blank": {
    description: "Server kosong untuk upload manual.",
    preset: "mini",
    startup: "bash",
    dockerImage: "auto",
    recommendedFiles: []
  }
};

type TemplateName = keyof typeof TEMPLATES;

export function templatesCommand(args: string[]) {
  const action = args[0] ?? "list";
  const jsonMode = args.includes("--json");

  if (["help", "--help", "-h"].includes(action)) {
    printTemplatesHelp();
    return;
  }

  if (action === "list") {
    const rows = Object.entries(TEMPLATES).map(([name, template]) => ({
      name,
      preset: template.preset,
      startup: template.startup,
      description: template.description
    }));
    printJsonOrText(jsonMode, TEMPLATES, table(rows, ["name", "preset", "startup", "description"]));
    return;
  }

  if (action === "show") {
    const name = args[1];
    const template = getTemplate(name);
    printJsonOrText(jsonMode, template, formatTemplate(name, template));
    return;
  }

  if (action === "command") {
    const name = args[1];
    const template = getTemplate(name);
    const serverName = getOption(args, "--name") ?? "my-server";
    const email = getOption(args, "--email") ?? "user@example.com";
    const node = getOption(args, "--node") ?? "1";
    const nest = getOption(args, "--nest") ?? "5";
    const egg = getOption(args, "--egg") ?? "18";
    const username = getOption(args, "--username");
    const pieces = [
      "ptero-gateway admin create-server",
      `--name ${quote(serverName)}`,
      `--email ${quote(email)}`,
      username ? `--username ${quote(username)}` : "",
      `--node ${quote(node)}`,
      `--nest ${quote(nest)}`,
      `--egg ${quote(egg)}`,
      `--preset ${quote(template.preset)}`,
      `--startup ${quote(template.startup)}`,
      "--dry-run"
    ].filter(Boolean);
    console.log(pieces.join(" "));
    return;
  }

  throw new Error(`Template command tidak dikenal: ${action}`);
}

function getTemplate(name: string | undefined) {
  if (!name) throw new Error(`Template wajib diisi. Jalankan: ptero-gateway templates list`);
  if (!(name in TEMPLATES)) throw new Error(`Template tidak dikenal: ${name}`);
  return TEMPLATES[name as TemplateName];
}

function getOption(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function quote(value: string) {
  return JSON.stringify(value);
}

function formatTemplate(name: string | undefined, template: (typeof TEMPLATES)[TemplateName]) {
  return [
    `Template: ${name}`,
    `Description: ${template.description}`,
    `Preset: ${template.preset}`,
    `Startup: ${template.startup}`,
    `Docker: ${template.dockerImage}`,
    `Recommended files: ${template.recommendedFiles.length ? template.recommendedFiles.join(", ") : "-"}`
  ].join("\n");
}

function printJsonOrText(jsonMode: boolean, raw: unknown, text: string) {
  if (jsonMode) console.log(JSON.stringify(raw, null, 2));
  else console.log(text);
}

function table(rows: Array<Record<string, string>>, columns: string[]) {
  const widths = columns.map(column => Math.max(column.length, ...rows.map(row => String(row[column] ?? "").length)));
  return [
    columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  "),
    widths.map(width => "-".repeat(width)).join("  "),
    ...rows.map(row => columns.map((column, index) => String(row[column] ?? "").padEnd(widths[index] ?? column.length)).join("  "))
  ].join("\n");
}

function printTemplatesHelp() {
  console.log(`Akadev Pterodactyl Gateway Templates

Perintah:
  ptero-gateway templates list
  ptero-gateway templates show nodejs-bot
  ptero-gateway templates command nodejs-bot --name "bot saya" --email user@example.com --node 1 --nest 5 --egg 18

Catatan:
  Template hanya membuat rekomendasi command create-server.
  Template tidak membuat node/location/allocation dan tidak mengeksekusi server otomatis.`);
}
