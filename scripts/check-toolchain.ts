/**
 * Fail early when Bun/Node do not match pinned repo versions, and when
 * Windows would invoke the WSL bash stub instead of Git Bash (#338, #299).
 * Run via `bun scripts/check-toolchain.ts` (not part of tsc project graph).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

class ToolchainGate {
  private readonly root: string;

  constructor(root = process.cwd()) {
    this.root = root;
  }

  enforce(): void {
    this.assertBunVersion();
    this.assertHostNodeMajor();
    this.assertWindowsBash();
  }

  private assertBunVersion(): void {
    const pinned = readFileSync(
      resolve(this.root, ".bun-version"),
      "utf8",
    ).trim();
    const actual = process.versions.bun;
    if (!actual || actual !== pinned) {
      throw new Error(
        `Bun ${pinned} required (see .bun-version / packageManager); running ${actual ?? "unknown"}.`,
      );
    }
  }

  /** Vitest/jsdom use the Node on PATH, not Bun's embedded compatibility
   *  version (#299). */
  private assertHostNodeMajor(): void {
    const nvmrc = readFileSync(resolve(this.root, ".nvmrc"), "utf8").trim();
    const requiredMajor = Number.parseInt(nvmrc, 10);
    const host = this.hostNodeVersion();
    const nodeMajor = Number.parseInt(host.split(".")[0] ?? "", 10);
    if (
      !Number.isFinite(requiredMajor) ||
      !Number.isFinite(nodeMajor) ||
      nodeMajor < requiredMajor
    ) {
      throw new Error(
        `Node >= ${requiredMajor} required on PATH (see .nvmrc / engines.node); host node reported ${host}.`,
      );
    }
  }

  private hostNodeVersion(): string {
    const result = spawnSync("node", ["-p", "process.versions.node"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const text = result.stdout?.trim();
    if (!text || result.status !== 0) {
      throw new Error(
        "Could not read the Node executable on PATH (`node -p process.versions.node`). Install the version in .nvmrc.",
      );
    }
    return text;
  }

  private assertWindowsBash(): void {
    if (process.platform !== "win32") return;
    const located = spawnSync("where.exe", ["bash"], { encoding: "utf8" });
    const first = located.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!first || !/System32\\bash\.exe/i.test(first)) return;
    const gitBash = [
      process.env.GIT_BASH,
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ].find((path) => path && existsSync(path));
    throw new Error(
      `Windows check would use WSL bash (${first}) which fails when no distro is installed. Prepend Git Bash to PATH and re-run:\n$env:Path = "${gitBash ? gitBash.replace(/\\bash\.exe$/i, "") : "C:\\Program Files\\Git\\bin"};" + $env:Path`,
    );
  }
}

new ToolchainGate().enforce();
const hostNode = spawnSync("node", ["-p", "process.versions.node"], {
  encoding: "utf8",
  shell: process.platform === "win32",
}).stdout.trim();
console.log(
  `toolchain: bun ${process.versions.bun}, host node ${hostNode} (ok)`,
);
