export type CliValue = string | boolean;
export type CliFlags = Record<string, CliValue | string[]>;
export type ParsedArgs = {
  positionals: string[];
  flags: CliFlags;
  raw: string[];
};

const BOOLEAN_FLAGS = new Set([
  "json",
  "yes",
  "y",
  "dry-run",
  "force",
  "debug",
  "help",
  "h",
  "admin",
  "keep",
  "follow",
  "no-reconnect",
  "refresh",
  "verbose",
  "quiet",
  "all",
  "wait",
  "no-cache",
  "zip",
  "tar"
]);

const SHORT_FLAGS: Record<string, string> = {
  y: "yes",
  h: "help",
  v: "version",
  j: "json"
};

export function parseCliArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: CliFlags = {};
  const raw = [...argv];
  let index = 0;

  while (index < argv.length) {
    const token = argv[index]!;
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const equal = body.indexOf("=");
      if (equal >= 0) {
        addFlag(flags, body.slice(0, equal), body.slice(equal + 1));
        index += 1;
        continue;
      }
      const key = body;
      if (BOOLEAN_FLAGS.has(key)) {
        addFlag(flags, key, true);
        index += 1;
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && (!next.startsWith("-") || next === "-")) {
        addFlag(flags, key, next);
        index += 2;
      } else {
        addFlag(flags, key, true);
        index += 1;
      }
      continue;
    }
    if (/^-[a-zA-Z]$/.test(token)) {
      const key = SHORT_FLAGS[token.slice(1)] ?? token.slice(1);
      addFlag(flags, key, true);
      index += 1;
      continue;
    }
    positionals.push(token);
    index += 1;
  }

  return { positionals, flags, raw };
}

function addFlag(flags: CliFlags, key: string, value: CliValue): void {
  if (value !== true || key in flags) {
    const current = flags[key];
    if (current === undefined) flags[key] = [value as string];
    else if (Array.isArray(current)) current.push(value as string);
    else flags[key] = [String(current), value as string];
    return;
  }
  flags[key] = value;
}

export function flagValue(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.flags[key];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[value.length - 1];
  if (typeof value !== "string") return undefined;
  return value;
}

export function flagValues(parsed: ParsedArgs, key: string): string[] {
  const value = parsed.flags[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

export function hasFlag(parsed: ParsedArgs, key: string): boolean {
  return parsed.flags[key] === true || parsed.flags[key] === "true";
}

export function numberFlag(parsed: ParsedArgs, key: string): number | undefined {
  const value = flagValue(parsed, key);
  if (value === undefined) return undefined;
  const parsedNumber = Number(value);
  if (!Number.isFinite(parsedNumber)) throw new Error(`--${key} harus berupa angka.`);
  return parsedNumber;
}

export function integerFlag(parsed: ParsedArgs, key: string): number | undefined {
  const value = numberFlag(parsed, key);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) throw new Error(`--${key} harus berupa bilangan bulat.`);
  return value;
}

export function requiredFlag(parsed: ParsedArgs, key: string): string {
  const value = flagValue(parsed, key);
  if (!value) throw new Error(`--${key} wajib diisi.`);
  return value;
}
