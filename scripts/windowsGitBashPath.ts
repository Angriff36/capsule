import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Git Bash on Windows, never the WSL stub (System32\\bash.exe).
 * Issue #338 — `bun run build` still says `bash`, so PATH must put Git first.
 */
export class WindowsGitBashPath {
  resolveExe(): string | null {
    const fromEnv = process.env.GIT_BASH?.trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;
    const candidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    return candidates.find((path) => existsSync(path)) ?? null;
  }

  /** Prepend Git Bash's bin so `bash` is not WSL. No-op on other OS. */
  prependToPath(): boolean {
    if (process.platform !== "win32") return false;
    const exe = this.resolveExe();
    if (!exe) return false;
    const bin = dirname(exe);
    const path = process.env.PATH ?? "";
    const first = path.split(";")[0]?.trim().toLowerCase();
    if (first === bin.toLowerCase()) return false;
    process.env.PATH = `${bin};${path}`;
    return true;
  }
}
