/**
 * Run the pinned Manifest CLI without a shell or a node_modules/.bin shim
 * (2026-09-25). The shim is a symlink on Linux/macOS but a .cmd/.exe on
 * Windows, which spawn/execFile cannot launch without a shell; the package's
 * own JS entry run by the current runtime (bun or node) works everywhere.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of the Manifest CLI entry declared in its package.json `bin`. */
export function manifestCliEntry(root = ROOT): string {
  const pkgDir = path.join(root, "node_modules", "@angriff36", "manifest");
  const pkg = JSON.parse(
    readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  ) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.manifest;
  if (!bin) throw new Error("@angriff36/manifest declares no `manifest` bin");
  return path.join(pkgDir, bin);
}

export function runManifestCli(
  args: string[],
  options: { cwd: string; inherit?: boolean },
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [manifestCliEntry(), ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...(options.inherit ? { stdio: "inherit" as const } : {}),
  });
}
