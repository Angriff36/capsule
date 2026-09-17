/** Shared path/hash helpers for project generation planning and apply. */
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { OwnershipManifest } from "./projectGenerationTypes";

export const OWNERSHIP_MANIFEST_PATH = ".builder/ownership.json";

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function normalizeRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    isAbsolute(path) ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(
      `Generated path must be a safe relative file path: ${path}`,
    );
  }
  return normalized;
}

export function resolveTargetPath(targetDir: string, path: string): string {
  const root = resolve(targetDir);
  const absolute = resolve(root, ...normalizeRelativePath(path).split("/"));
  if (absolute === root || !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Generated path escapes target directory: ${path}`);
  }
  return absolute;
}

export async function existsPath(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readPathIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function formatOwnershipManifest(ownership: OwnershipManifest): string {
  return `${JSON.stringify(ownership, null, 2)}\n`;
}
