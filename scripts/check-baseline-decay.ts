/**
 * Monthly/on-demand baseline decay checks (objective yes/no).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Includes live-Manifest roots: `manifest.config.yaml` + `.builder/`. */
const ROOT_CAP = 37;
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
    const entries = readdirSync(ROOT).filter((name) => {
      if (name === "node_modules" || name === "dist" || name === "graphify-out")
        return false;
      return true;
    });
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
