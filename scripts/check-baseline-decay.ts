/**
 * Monthly/on-demand baseline decay checks (objective yes/no).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Includes live-Manifest roots (`manifest.config.yaml` + `.builder/`) and the
 * durable loop-engineering roots (`loop-budget.md`, `loop-constraints.md`,
 * `loop-ledger.json`) — see BASELINE.md § Root cap.
 */
/** Clean CI checkout root entries (see BASELINE.md § Root cap). */
const ROOT_CAP = 71; // 71 after bunfig.toml (Windows Git Bash preload, #338 workaround). bash.exe is local-only.
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
    // Count distinct root entries in the GIT INDEX — what a clean CI checkout
    // materializes — not whatever readdirSync sees on one machine. Staged
    // additions are already in `ls-files --cached`; staged removals are
    // already out. Untracked and gitignored local artifacts never count.
    let out: Buffer;
    try {
      out = execFileSync("git", ["ls-files", "--cached", "--full-name", "-z"], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      this.failures.push(
        `root cap needs the Git index: git ls-files failed in ${ROOT} (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
      return;
    }
    const roots = new Set<string>();
    for (const entry of out.toString().split("\0")) {
      if (entry === "") continue;
      roots.add(entry.split("/")[0]);
    }
    if (roots.size > ROOT_CAP) {
      this.failures.push(
        `root entry count ${roots.size} exceeds cap ${ROOT_CAP}`,
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
