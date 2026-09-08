/**
 * Fail early when Bun/Node do not match pinned repo versions.
 * Run via `bun scripts/check-toolchain.ts` (not part of tsc project graph).
 */
import { spawnSync } from "node:child_process";
import semver from "semver";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

class ToolchainGate {
  private readonly root: string;

  constructor(root = process.cwd()) {
    this.root = root;
  }

  enforce(): void {
    this.assertBunVersion();
    this.assertNodeMajor();
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

  private assertNodeMajor(): void {
    const nvmrc = readFileSync(resolve(this.root, ".nvmrc"), "utf8").trim();
    // Bun's process.versions.node describes Bun compatibility, not the Node
    // executable used by Vite/Vitest/Vercel and their dependencies.
    const result = spawnSync("node", ["--version"], { encoding: "utf8" });
    const actual = result.stdout?.trim().replace(/^v/, "");
    const { engines } = JSON.parse(
      readFileSync(resolve(this.root, "package.json"), "utf8"),
    );
    if (
      result.status !== 0 ||
      !semver.valid(actual) ||
      !semver.satisfies(actual, engines.node)
    ) {
      throw new Error(
        `Node ${engines.node} required (recommended ${nvmrc} from .nvmrc); running ${actual || "unavailable"}.`,
      );
    }
  }
}

new ToolchainGate().enforce();
console.log(
  `toolchain: bun ${process.versions.bun}, external Node meets .nvmrc (ok)`,
);
