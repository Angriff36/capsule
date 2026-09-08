import fs from "node:fs";
import path from "node:path";
import { readOption } from "./args.ts";

export function resolveTargetDir(argv: string[]): string {
  return readOption(argv, "--target") ?? process.cwd();
}

export function resolveProjectName(targetDir: string, argv: string[]): string {
  const explicit = readOption(argv, "--name");
  if (explicit) {
    return explicit;
  }
  try {
    const packagePath = path.join(targetDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
      name?: string;
    };
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch {
    // fall through
  }
  return path.basename(targetDir);
}
