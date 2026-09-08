export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export function readOption(
  argv: string[],
  name: string,
  fallback?: string,
): string | undefined {
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return fallback;
}

export function readRequiredOption(
  argv: string[],
  name: string,
  label: string,
): string {
  const value = readOption(argv, name);
  if (!value) {
    throw new Error(`Missing required option ${name} (${label}).`);
  }
  return value;
}

export type ApplyMode = "dry-run" | "apply";

export function resolveApplyMode(argv: string[]): ApplyMode {
  const apply = hasFlag(argv, "--apply");
  const dryRun = hasFlag(argv, "--dry-run");
  if (apply && dryRun) {
    throw new Error("Pass either --dry-run or --apply, not both.");
  }
  return apply ? "apply" : "dry-run";
}

export function wantsJsonOutput(argv: string[]): boolean {
  return hasFlag(argv, "--json");
}
