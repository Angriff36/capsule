import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Git Bash on Windows, never the WSL stub (System32\\bash.exe).
 * Issue #338 — `bun run build` still says `bash`. PATH prepend is not
 * enough because the WSL App Execution Alias still wins, so we also
 * rewrite spawn("bash") to the Git Bash full path.
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

  /** Prepend a shim + Git Bash bin, and retarget spawn("bash"). */
  prependToPath(): boolean {
    if (process.platform !== "win32") return false;
    const exe = this.resolveExe();
    if (!exe) return false;
    const bin = dirname(exe);
    this.copyCwdBashExe(exe);
    const shim = this.writeShim(exe);
    const localBin = this.writeLocalBinShim(exe);
    const path = process.env.PATH ?? "";
    process.env.PATH = `${localBin};${shim};${bin};${path}`;
    this.patchSpawn(exe);
    return true;
  }

  /**
   * CreateProcess("bash") searches cwd before System32. PATH prepend cannot
   * beat C:\\Windows\\System32\\bash.exe (the WSL relay).
   */
  private copyCwdBashExe(exe: string): void {
    const dest = join(process.cwd(), "bash.exe");
    if (existsSync(dest)) return;
    try {
      copyFileSync(exe, dest);
    } catch {
      // Another bun process may be writing the same file.
    }
  }

  private writeShim(exe: string): string {
    const dir = join(tmpdir(), "capsule-git-bash-shim");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "bash.cmd"),
      `@echo off\r\n"${exe}" %*\r\n`,
      "utf8",
    );
    return dir;
  }

  /** bun run prepends node_modules/.bin — a local bash.cmd beats WSL. */
  private writeLocalBinShim(exe: string): string {
    const dir = join(process.cwd(), "node_modules", ".bin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "bash.cmd"),
      `@echo off\r\n"${exe}" %*\r\n`,
      "utf8",
    );
    writeFileSync(join(dir, "bash"), `#!/bin/sh\nexec "${exe}" "$@"\n`, "utf8");
    return dir;
  }

  private patchSpawn(exe: string): void {
    const rewrite = (command: unknown) =>
      typeof command === "string" && /^(bash|bash\.exe)$/i.test(command)
        ? exe
        : command;
    const child = require("node:child_process") as {
      spawn: typeof spawn;
      spawnSync: typeof spawnSync;
    };
    if ((child.spawn as { __capsuleGitBash?: boolean }).__capsuleGitBash)
      return;
    const originalSpawn = child.spawn.bind(child);
    const originalSync = child.spawnSync.bind(child);
    const wrapped = ((command, ...rest) =>
      originalSpawn(
        rewrite(command) as string,
        ...(rest as []),
      )) as typeof spawn;
    const wrappedSync = ((command, ...rest) =>
      originalSync(
        rewrite(command) as string,
        ...(rest as []),
      )) as typeof spawnSync;
    (wrapped as { __capsuleGitBash?: boolean }).__capsuleGitBash = true;
    child.spawn = wrapped;
    child.spawnSync = wrappedSync;
  }
}
