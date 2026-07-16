/**
 * Fail early when Bun/Node do not match pinned repo versions.
 * Run via `bun scripts/check-toolchain.ts` (not part of tsc project graph).
 */
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
    const requiredMajor = Number.parseInt(nvmrc, 10);
    const nodeMajor = Number.parseInt(
      process.versions.node.split(".")[0] ?? "",
      10,
    );
    if (
      !Number.isFinite(requiredMajor) ||
      !Number.isFinite(nodeMajor) ||
      nodeMajor < requiredMajor
    ) {
      throw new Error(
        `Node >= ${requiredMajor} required (see .nvmrc / engines.node); running ${process.versions.node}.`,
      );
    }
  }
}

new ToolchainGate().enforce();
console.log(
  `toolchain: bun ${process.versions.bun}, node ${process.versions.node} (ok)`,
);
