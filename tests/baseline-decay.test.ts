/**
 * Regression tests for #380 — the baseline root cap must be machine-independent.
 *
 * The decay check must count the DISTINCT ROOT ENTRIES IN THE GIT INDEX (what
 * a clean CI checkout contains), not whatever readdirSync happens to see on
 * one developer machine. Each test builds a real temporary Git repository in
 * the OS temp dir and runs the REAL scripts/check-baseline-decay.ts CLI with
 * the resolved Bun executable. Git is only ever mutated inside those fixture
 * directories — never in the capsule checkout.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(
  new URL("../scripts/check-baseline-decay.ts", import.meta.url),
);
// process.execPath is the Vitest host's executable, not reliably Bun when the
// suite starts through bunx. Ask Bun itself where it lives. The Windows npm
// shim named `bun` has no extension, so the spawn needs a shell to resolve it.
const BUN = execFileSync("bun", ["--print", "process.execPath"], {
  encoding: "utf8",
  shell: true,
}).trim();

// 6 required files + "src" (holding nested files) + 64 pads = 71 distinct
// indexed root entries, exactly the ROOT_CAP the script enforces.
const PAD_FILES = 64;
const EXPECTED_ROOTS = 71;

interface DecayResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs the real decay-check CLI inside the fixture. Never mocked. */
function runDecayCheck(cwd: string): DecayResult {
  try {
    const stdout = execFileSync(BUN, [SCRIPT], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      status: number | null;
      stdout: string;
      stderr: string;
    };
    return {
      status: e.status ?? 1,
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
    };
  }
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Independent expected result: the distinct root entries the GIT INDEX holds.
 * This is the same view a clean CI checkout would materialize — computed here
 * with git itself, never with the production function under test.
 */
function indexedRootEntries(cwd: string): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const roots = new Set<string>();
  for (const entry of out.toString().split("\0")) {
    if (entry === "") continue;
    roots.add(entry.split("/")[0]);
  }
  return [...roots].sort();
}

const tempRoots: string[] = [];

/** Builds a valid fixture repo satisfying every non-root baseline check. */
function buildFixture(options: { withGit: boolean }): string {
  const root = mkdtempSync(path.join(tmpdir(), "capsule-baseline-decay-"));
  tempRoots.push(root);
  const files: Record<string, string> = {
    "AGENTS.md": "# Fixture command entry\n",
    "CLAUDE.md": "Behavior rules live in AGENTS.md.\n",
    "package.json": JSON.stringify({
      scripts: { check: "bun run format:check" },
    }),
    ".gitignore": [
      ".artifacts/",
      "graphify-out/",
      ".env.local",
      "# Ralph loop state",
      ".ralph-tasks/",
      ".ralph-workers.log",
      "# Editor backup scratch",
      "IMPLEMENTATION_PLAN.md.bak",
      "",
    ].join("\n"),
    "bun.lock": "{}\n",
    "vite.config.ts":
      "export default { test: { coverage: { thresholds: { lines: 1 } } } };\n",
    // Nested files: two index entries that must collapse to ONE root entry.
    "src/nested-a.ts": "export const a = 1;\n",
    "src/nested/b.ts": "export const b = 2;\n",
  };
  for (let i = 0; i < PAD_FILES; i++) {
    files[`fixture-pad-${String(i).padStart(2, "0")}.txt`] = "pad\n";
  }
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  if (options.withGit) {
    git(root, ["init"]);
    git(root, ["add", "."]);
  }
  return root;
}

/** Stages a 72nd root entry named .codex, force-added past the local ignore. */
function stageCodexRoot(root: string): void {
  mkdirSync(path.join(root, ".codex"), { recursive: true });
  writeFileSync(path.join(root, ".codex", "config.toml"), "[model]\n");
  git(root, ["add", "-f", ".codex/config.toml"]);
}

/** Removes a temp dir Windows-greedily: git objects are read-only files. */
function removeTempDir(dir: string): void {
  const options = {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  } as const;
  try {
    rmSync(dir, options);
  } catch {
    clearReadOnly(dir);
    rmSync(dir, options);
  }
}

function clearReadOnly(dir: string): void {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) {
      clearReadOnly(abs);
    } else {
      chmodSync(abs, 0o666);
    }
  }
}

describe("baseline decay root cap (#380)", () => {
  afterEach(() => {
    const owned = tempRoots.splice(0, tempRoots.length);
    for (const dir of owned) removeTempDir(dir);
  });

  it(
    "passes at exactly 71 indexed root entries; untracked local files must not break it",
    { timeout: 30_000 },
    () => {
      const root = buildFixture({ withGit: true });
      expect(indexedRootEntries(root)).toHaveLength(EXPECTED_ROOTS);
      // Nested staged files count once, under their single root entry.
      expect(indexedRootEntries(root)).toContain("src");
      expect(runDecayCheck(root).status).toBe(0);

      // Machine-local state a real checkout accumulates: gitignored Ralph
      // loop files, a gitignored editor backup, plus an unrelated NONignored
      // untracked owner spec.
      mkdirSync(path.join(root, ".ralph-tasks"), { recursive: true });
      writeFileSync(path.join(root, ".ralph-tasks", "task.md"), "task\n");
      writeFileSync(path.join(root, ".ralph-workers.log"), "{}\n");
      writeFileSync(path.join(root, "IMPLEMENTATION_PLAN.md.bak"), "old\n");
      writeFileSync(path.join(root, "capsule-owner-spec.md"), "untracked\n");
      // Nothing above was staged, so the index — and a clean CI checkout —
      // still holds exactly 71 root entries. The check must still pass.
      expect(indexedRootEntries(root)).toHaveLength(EXPECTED_ROOTS);
      expect(runDecayCheck(root).status).toBe(0);
    },
  );

  it(
    "fails a 72nd indexed root entry even under an old local-only exclusion name",
    { timeout: 30_000 },
    () => {
      const root = buildFixture({ withGit: true });
      stageCodexRoot(root); // .codex is force-added: the index is authoritative
      expect(indexedRootEntries(root)).toHaveLength(EXPECTED_ROOTS + 1);

      const result = runDecayCheck(root);
      expect(result.status).not.toBe(0);
      // The refusal must name the concrete cap failure, not just any error.
      expect(result.stderr).toContain("root entry count 72");
      expect(result.stderr).toContain("cap 71");
    },
  );

  it(
    "keeps failing until a tracked root entry's removal is staged",
    { timeout: 60_000 },
    () => {
      const root = buildFixture({ withGit: true });
      stageCodexRoot(root);
      expect(runDecayCheck(root).status).not.toBe(0);

      // Delete from disk WITHOUT staging: the index still holds 72 entries,
      // and the index — not local file existence — is what ships to CI.
      rmSync(path.join(root, ".codex"), { recursive: true, force: true });
      const afterDiskRemoval = runDecayCheck(root);
      expect(afterDiskRemoval.status).not.toBe(0);
      expect(afterDiskRemoval.stderr).toContain("root entry count 72");

      // Staging the removal is what restores the pass.
      git(root, ["rm", "--cached", "-r", "-q", ".codex"]);
      expect(runDecayCheck(root).status).toBe(0);
    },
  );

  it(
    "fails with an actionable Git diagnostic when no Git metadata exists",
    { timeout: 30_000 },
    () => {
      const root = buildFixture({ withGit: false });
      const result = runDecayCheck(root);
      // Without an index the cap cannot be measured honestly: refuse loudly
      // instead of passing. Only the actionable words are asserted — not any
      // incidental stack text.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/git|index/i);
    },
  );
});
