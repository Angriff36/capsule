/**
 * Enforces Builder-only regeneration for Capsule (convex-application preset).
 *
 * - Denies legacy `manifest generate` / `manifest:build` npm scripts.
 * - Denies direct `place-manifest-convex-react` (Manifest CLI layout shim).
 * - `check`: fails when on-disk Builder-owned files diverge from ownership digests.
 * - `check-staged`: pre-commit gate — owned-file commits must refresh ownership.json.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OWNERSHIP_PATH = ".builder/ownership.json";

const DENY_MESSAGE = `
builder-regen-guard: BLOCKED — use the single regen entry point:

  bun run manifest:regen

Builder update-mode only. Updates generated output and .builder/ownership.json together.
Do not use manifest generate / manifest:build / place-manifest-convex-react.

See docs/generation/manifest-builder.md
`.trim();

export interface OwnershipManifest {
  version: number;
  files: Record<string, { sha256: string }>;
}

export class BuilderRegenGuard {
  constructor(private readonly root: string = process.cwd()) {}

  denyLegacyInvocation(label: string): never {
    console.error(`${DENY_MESSAGE}\n\nAttempted: ${label}`);
    process.exit(1);
  }

  loadOwnership(): OwnershipManifest {
    const abs = path.join(this.root, OWNERSHIP_PATH);
    if (!existsSync(abs)) {
      this.fail(
        `missing ${OWNERSHIP_PATH} — run Builder initial/adopt before regenerating`,
      );
    }
    return JSON.parse(readFileSync(abs, "utf8")) as OwnershipManifest;
  }

  /** Compare recorded digests to files on disk. */
  checkOwnershipSync(): string[] {
    const ownership = this.loadOwnership();
    const mismatches: string[] = [];
    for (const [rel, { sha256: expected }] of Object.entries(ownership.files)) {
      const abs = path.join(this.root, rel);
      if (!existsSync(abs)) {
        mismatches.push(`${rel}: missing (ownership expects file)`);
        continue;
      }
      const actual = this.hashFile(abs);
      if (actual !== expected) {
        mismatches.push(
          `${rel}: digest mismatch (ledger stale or edited outside Builder apply)`,
        );
      }
    }
    return mismatches;
  }

  /** Pre-commit: staged owned paths require staged ownership manifest with matching digests. */
  checkStagedCommit(): string[] {
    const ownership = this.loadOwnership();
    const staged = this.gitStagedPaths();
    if (staged.length === 0) return [];

    const owned = new Set(Object.keys(ownership.files));
    const stagedOwned = staged.filter((p) => owned.has(p));
    if (stagedOwned.length === 0) return [];

    const violations: string[] = [];
    if (!staged.includes(OWNERSHIP_PATH)) {
      violations.push(
        `staged Builder-owned files without ${OWNERSHIP_PATH}: ${stagedOwned.join(", ")}`,
      );
      return violations;
    }

    let stagedOwnership: OwnershipManifest;
    try {
      const stagedContent = this.gitShowStaged(OWNERSHIP_PATH);
      stagedOwnership = JSON.parse(stagedContent) as OwnershipManifest;
    } catch {
      violations.push(`could not read staged ${OWNERSHIP_PATH}`);
      return violations;
    }

    for (const rel of stagedOwned) {
      const expected = stagedOwnership.files[rel]?.sha256;
      if (!expected) {
        violations.push(
          `${rel}: staged but not listed in staged ownership manifest`,
        );
        continue;
      }
      const stagedContent = this.gitShowStaged(rel);
      const actual = this.hashContent(stagedContent);
      if (actual !== expected) {
        violations.push(
          `${rel}: staged content does not match staged ${OWNERSHIP_PATH} digest`,
        );
      }
    }

    return violations;
  }

  runCheckOwnership(): void {
    const mismatches = this.checkOwnershipSync();
    if (mismatches.length > 0) {
      console.error("builder-regen-guard: ownership drift detected:\n");
      for (const line of mismatches) console.error(`  - ${line}`);
      console.error(`\n${DENY_MESSAGE}`);
      process.exit(1);
    }
    console.log(
      `builder-regen-guard: ok (${Object.keys(this.loadOwnership().files).length} owned paths match ledger)`,
    );
  }

  runCheckStaged(): void {
    const violations = this.checkStagedCommit();
    if (violations.length > 0) {
      console.error("builder-regen-guard: commit blocked:\n");
      for (const line of violations) console.error(`  - ${line}`);
      console.error(
        `\nRefresh ownership in the same commit via bun run manifest:regen`,
      );
      process.exit(1);
    }
  }

  private hashFile(abs: string): string {
    return this.hashContent(readFileSync(abs));
  }

  private hashContent(content: string | Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private gitStagedPaths(): string[] {
    const result = spawnSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
      {
        cwd: this.root,
        encoding: "utf8",
      },
    );
    if (result.status !== 0) return [];
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.replace(/\\/g, "/"))
      .filter(Boolean);
  }

  private gitShowStaged(rel: string): string {
    const result = spawnSync("git", ["show", `:${rel}`], {
      cwd: this.root,
      encoding: "utf8",
    });
    if (result.status !== 0 || !result.stdout) {
      throw new Error(`git show :${rel} failed`);
    }
    return result.stdout;
  }

  private fail(message: string): never {
    console.error(`builder-regen-guard: ${message}`);
    process.exit(1);
  }
}

function main(): void {
  const guard = new BuilderRegenGuard();
  const argv = process.argv.slice(2);
  const mode = argv[0];

  if (mode === "--deny") {
    guard.denyLegacyInvocation(
      argv.slice(1).join(" ") || "legacy manifest generation",
    );
  }
  if (mode === "--check-ownership") {
    guard.runCheckOwnership();
    return;
  }
  if (mode === "--check-staged") {
    guard.runCheckStaged();
    return;
  }

  console.error(
    "Usage: bun scripts/builder-regen-guard.ts --deny <label> | --check-ownership | --check-staged",
  );
  process.exit(2);
}

if (import.meta.main) {
  main();
}
