/**
 * Monthly/on-demand baseline decay checks (objective yes/no).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Includes live-Manifest roots (`manifest.config.yaml` + `.builder/`) and the
 * durable loop-engineering roots (`loop-budget.md`, `loop-constraints.md`,
 * `loop-ledger.json`) — see BASELINE.md § Root cap.
 */
/** Clean CI checkout root entries (see BASELINE.md § Root cap). */
const ROOT_CAP = 49; // Clean CI checkout; local-only dirs excluded below must stay out of the count.
const ROOT = process.cwd();

class BaselineDecayCheck {
  private readonly failures: string[] = [];

  run(): void {
    this.checkRootCap();
    this.checkOneInstructionEntry();
    this.checkFormatGateWired();
    this.checkIgnoreArtifacts();
    this.checkNoCompetingLockfiles();
    this.checkCoverageThresholdPresent();

    if (this.failures.length > 0) {
      console.error("baseline-decay: FAIL");
      for (const f of this.failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log("baseline-decay: ok");
  }

  private checkRootCap(): void {
    // Count only entries that would appear in a clean CI checkout + committed
    // roots. Local tool caches (.git, .convex, .codex, …) must not inflate the
    // cap — otherwise baseline:decay is machine-dependent.
    const localOnly = new Set([
      "node_modules",
      "dist",
      "graphify-out",
      "coverage",
      ".git",
      ".convex",
      ".artifacts",
      ".codex",
      ".agents",
      ".fallow",
      ".tmp",
      ".env.local",
      // Editor / IDE local state — never part of a clean CI checkout
      ".cursor",
      ".sonarlint",
      ".vscode",
      // Gitignored local tool/loop state — never part of a clean CI checkout
      ".aboardai",
      ".local",
      ".loop-worktrees",
      ".worktrees",
      ".playwright-mcp",
      ".scannerwork",
      ".vercel",
      "test-results",
      "work",
      "output",
    ]);
    const entries = readdirSync(ROOT).filter((name) => !localOnly.has(name));
    if (entries.length > ROOT_CAP) {
      this.failures.push(
        `root entry count ${entries.length} exceeds cap ${ROOT_CAP}`,
      );
    }
  }

  private checkOneInstructionEntry(): void {
    if (!existsSync(resolve(ROOT, "AGENTS.md"))) {
      this.failures.push("AGENTS.md missing (canonical command entry)");
    }
    if (!existsSync(resolve(ROOT, "CLAUDE.md"))) {
      this.failures.push("CLAUDE.md missing (behavior ruleset)");
    }
    const claude = readFileSync(resolve(ROOT, "CLAUDE.md"), "utf8");
    if (!claude.includes("AGENTS.md")) {
      this.failures.push("CLAUDE.md must point at AGENTS.md for commands");
    }
  }

  private checkFormatGateWired(): void {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const check = pkg.scripts?.check ?? "";
    if (!check.includes("format:check")) {
      this.failures.push("package.json check must include format:check");
    }
    if (existsSync(resolve(ROOT, "biome.json"))) {
      this.failures.push("biome.json present — Prettier owns format");
    }
  }

  private checkIgnoreArtifacts(): void {
    const gi = readFileSync(resolve(ROOT, ".gitignore"), "utf8");
    for (const required of [".artifacts/", "graphify-out/", ".env.local"]) {
      if (!gi.includes(required.replace(/\/$/, "")) && !gi.includes(required)) {
        this.failures.push(`.gitignore must ignore ${required}`);
      }
    }
  }

  private checkNoCompetingLockfiles(): void {
    for (const bad of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
      if (existsSync(resolve(ROOT, bad))) {
        this.failures.push(`competing lockfile present: ${bad}`);
      }
    }
    if (!existsSync(resolve(ROOT, "bun.lock"))) {
      this.failures.push("bun.lock missing");
    }
  }

  private checkCoverageThresholdPresent(): void {
    const vite = readFileSync(resolve(ROOT, "vite.config.ts"), "utf8");
    if (!vite.includes("thresholds")) {
      this.failures.push("vite.config.ts must define coverage thresholds");
    }
  }
}

new BaselineDecayCheck().run();
