// scripts/release.sh — the backend handoff line.
//
// Production Convex is self-hosted, so a release builds the UI only and must
// end with the ONE backend deploy command for the Linux box. Both paths that
// end a release print it: the normal release, and the "already released,
// resume the archive only" path (a run that stopped after the main push).
//
// Offline proof: a throwaway git checkout with a local bare `origin` and a
// stub `bun` (the gate and the receipt do nothing). Nothing is contacted.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "..", "scripts", "release.sh");
// Git Bash on Windows, never the WSL stub (same lookup as scripts/windowsGitBashPath.ts).
const GIT_BASH = [
  process.env.GIT_BASH?.trim() ?? "",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
].find((path) => path !== "" && existsSync(path));
const BASH = process.platform === "win32" ? (GIT_BASH ?? "bash") : "bash";
const BRANCH = "feat/handoff-fixture";
const TIMEOUT = 120_000;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A checkout on BRANCH (one commit ahead of main), pushed to a local bare origin. */
function makeCheckout() {
  const root = mkdtempSync(join(tmpdir(), "capsule-release-handoff-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  const bin = join(root, "bin");
  mkdirSync(origin);
  mkdirSync(join(work, "scripts"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(bin, "bun"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(bin, "bun"), 0o755);

  git(origin, "init", "--bare", "-b", "main");
  git(work, "init", "-b", "main");
  git(work, "config", "user.email", "test@example.invalid");
  git(work, "config", "user.name", "Release Script Test");
  git(work, "config", "core.autocrlf", "false");
  git(work, "config", "core.hooksPath", join(root, "no-hooks"));
  writeFileSync(join(work, ".gitignore"), ".artifacts/\n");
  copyFileSync(SCRIPT, join(work, "scripts", "release.sh"));
  git(work, "add", "-A");
  git(work, "commit", "-m", "base");
  git(work, "remote", "add", "origin", origin.replace(/\\/g, "/"));
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", BRANCH);
  writeFileSync(join(work, "feature.txt"), "x\n");
  git(work, "add", "-A");
  git(work, "commit", "-m", "feature");
  git(work, "push", "-q", "origin", BRANCH);

  const release = () => {
    const launch =
      'export PATH="$(cygpath -u "$STUB_BIN" 2>/dev/null || echo "$STUB_BIN"):$PATH"; exec bash scripts/release.sh "$@"';
    const result = spawnSync(
      BASH,
      ["-c", launch, "bash", "--reviewer", "test-model"],
      {
        cwd: work,
        encoding: "utf8",
        env: { ...process.env, STUB_BIN: bin, CAPSULE_RELEASE_WAIT: "0" },
      },
    );
    return {
      status: result.status,
      output: `${result.stdout}\n${result.stderr}`,
    };
  };
  return { work, release };
}

/** The handoff block of a release.sh output, and the sha it names. */
function handoff(output: string): { block: string; sha: string } {
  const lines = output.split("\n").map((line) => line.trimEnd());
  const start = lines.findIndex((line) =>
    line.startsWith("release: BACKEND HANDOFF."),
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const block = lines.slice(start, start + 4).join("\n");
  const sha =
    /bash scripts\/deploy-backend\.sh --expect ([0-9a-f]{40})$/m.exec(
      block,
    )?.[1] ?? "";
  expect(sha).not.toBe("");
  return { block: block.replace(sha, "<sha>"), sha };
}

describe("scripts/release.sh backend handoff", () => {
  it(
    "the normal release and the resumed archive print the same handoff, with the [release] commit on origin/main",
    () => {
      const normal = makeCheckout();
      const released = normal.release();
      expect(released.output).toContain(`release: done. ${BRANCH} is now`);
      expect(released.status).toBe(0);
      const normalHandoff = handoff(released.output);
      expect(normalHandoff.sha).toBe(
        git(normal.work, "rev-parse", "origin/main"),
      );
      expect(git(normal.work, "log", "-1", "--format=%s", "origin/main")).toBe(
        `[release] ${BRANCH} (reviewed by test-model)`,
      );

      // A release that stopped after the main push: the [release] commit is on
      // origin/main, the branch is not archived yet.
      const resumed = makeCheckout();
      git(resumed.work, "checkout", "-q", "main");
      git(
        resumed.work,
        "merge",
        "--no-ff",
        BRANCH,
        "-m",
        `[release] ${BRANCH} (reviewed by test-model)`,
      );
      git(resumed.work, "push", "-q", "origin", "main");
      const releaseSha = git(resumed.work, "rev-parse", "origin/main");
      git(resumed.work, "checkout", "-q", BRANCH);
      const again = resumed.release();
      expect(again.output).toContain("Resuming the archive only.");
      expect(again.output).toContain(`release: done. ${BRANCH} is now`);
      expect(again.status).toBe(0);
      const resumedHandoff = handoff(again.output);
      expect(resumedHandoff.sha).toBe(releaseSha);
      expect(resumedHandoff.block).toBe(normalHandoff.block);
    },
    TIMEOUT,
  );
});
