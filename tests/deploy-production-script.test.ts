// scripts/deploy-production.sh — the ONE production deployment command.
//
// Offline proof of the orchestration. A throwaway git checkout with a local
// bare `origin` runs the REAL scripts/release.sh; `bun` (gate, receipt, Vercel
// verifier, backend scope), `ssh` and `codex` are stubs that log their command
// line. Nothing here contacts Vercel, the production box, or a reviewer.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPTS = join(__dirname, "..", "scripts");
// Git Bash on Windows, never the WSL stub (same lookup as scripts/windowsGitBashPath.ts).
const GIT_BASH = [
  process.env.GIT_BASH?.trim() ?? "",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
].find((path) => path !== "" && existsSync(path));
const BASH = process.platform === "win32" ? (GIT_BASH ?? "bash") : "bash";
const BRANCH = "feat/deploy-fixture";
const TIMEOUT = 180_000;

const STUBS: Record<string, string> = {
  bun: `#!/usr/bin/env bash
case "$*" in
  *verify-vercel-release.ts*) echo "bun $*" >> "$STUB_LOG"; exit "\${STUB_VERCEL_EXIT:-0}" ;;
  *release-backend-scope.ts*) echo "bun $*" >> "$STUB_LOG"; printf '%b' "\${STUB_SCOPE:-backend=unchanged\\nverify=\\n}"; exit 0 ;;
  *) exit 0 ;;
esac
`,
  ssh: `#!/usr/bin/env bash
echo "ssh $*" >> "$STUB_LOG"
cat > "$STUB_LOG.remote-script"
sha=""
for arg in "$@"; do case "$arg" in [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) sha="$arg" ;; esac; done
case "\${STUB_SSH:-pass}" in
  pass) echo "RESULT: PASS - backend deployed from $sha; 1 queries respond; frontend HTTP 200" ;;
  silent) echo "connected, no result" ;;
  *) echo "RESULT: FAIL - a production query does not respond after the deploy (expected sha: $sha)"; exit 1 ;;
esac
`,
  codex: `#!/usr/bin/env bash
echo "codex $*" >> "$STUB_LOG"
cat
echo "codex"
printf '%b\\n' "\${STUB_REVIEW:-No blocking findings.\\nVERDICT: APPROVE}"
`,
};

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A checkout on BRANCH (one commit ahead of main), pushed to a local bare origin. */
function makeCheckout() {
  const root = mkdtempSync(join(tmpdir(), "capsule-deploy-production-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  const bin = join(root, "bin");
  const log = join(root, "calls.log");
  mkdirSync(origin);
  mkdirSync(join(work, "scripts"), { recursive: true });
  mkdirSync(bin);
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), body.replace(/\r\n/g, "\n"));
    chmodSync(join(bin, name), 0o755);
  }

  git(origin, "init", "--bare", "-b", "main");
  git(work, "init", "-b", "main");
  git(work, "config", "user.email", "test@example.invalid");
  git(work, "config", "user.name", "Deploy Production Test");
  git(work, "config", "core.autocrlf", "false");
  git(work, "config", "core.hooksPath", join(root, "no-hooks"));
  writeFileSync(join(work, ".gitignore"), ".artifacts/\n");
  for (const name of ["release.sh", "deploy-production.sh"])
    copyFileSync(join(SCRIPTS, name), join(work, "scripts", name));
  git(work, "add", "-A");
  git(work, "commit", "-m", "base");
  git(work, "remote", "add", "origin", origin.replace(/\\/g, "/"));
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", BRANCH);
  writeFileSync(join(work, "feature.txt"), "x\n");
  git(work, "add", "-A");
  git(work, "commit", "-m", "feature");
  git(work, "push", "-q", "origin", BRANCH);

  const run = (args: string[], env: Record<string, string> = {}) => {
    const launch =
      'export PATH="$(cygpath -u "$STUB_BIN" 2>/dev/null || echo "$STUB_BIN"):$PATH"; exec bash scripts/deploy-production.sh "$@"';
    const result = spawnSync(BASH, ["-c", launch, "bash", ...args], {
      cwd: work,
      encoding: "utf8",
      env: {
        ...process.env,
        STUB_BIN: bin,
        STUB_LOG: log.replace(/\\/g, "/"),
        CAPSULE_RELEASE_WAIT: "0",
        ...env,
      },
    });
    return {
      status: result.status,
      output: `${result.stdout}\n${result.stderr}`,
      lastLine:
        result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .at(-1) ?? "",
    };
  };
  const calls = () =>
    existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  const mainSha = () => git(work, "rev-parse", "origin/main");
  return { work, log, run, calls, mainSha };
}

const BACKEND =
  "backend=required\\nreason=convex/queries.ts\\nverify=listA,listB\\n";

describe("scripts/deploy-production.sh", () => {
  it(
    "frontend-only release: releases, verifies Vercel, never opens SSH",
    () => {
      const checkout = makeCheckout();
      const result = checkout.run(["--reviewer", "test-model"]);
      const sha = checkout.mainSha();
      expect(result.lastLine).toBe(
        `RESULT: PASS - frontend deployed at ${sha}; backend unchanged`,
      );
      expect(result.status).toBe(0);
      expect(git(checkout.work, "log", "-1", "--format=%s", sha)).toBe(
        `[release] ${BRANCH} (reviewed by test-model)`,
      );
      expect(checkout.calls()).toEqual([
        `bun scripts/verify-vercel-release.ts --sha ${sha} --wait 900`,
        `bun scripts/release-backend-scope.ts --sha ${sha}`,
      ]);
    },
    TIMEOUT,
  );

  it(
    "backend release: runs the canonical backend deploy on the box with the release sha and the new queries",
    () => {
      const checkout = makeCheckout();
      const result = checkout.run(["--reviewer", "test-model"], {
        STUB_SCOPE: BACKEND,
      });
      const sha = checkout.mainSha();
      expect(result.lastLine).toBe(
        `RESULT: PASS - frontend and backend deployed at ${sha}`,
      );
      expect(result.status).toBe(0);
      const ssh = checkout.calls().at(-1) ?? "";
      expect(ssh).toContain("-o BatchMode=yes");
      expect(ssh).toContain(
        `oc@pop-os bash -l -s -- ${sha} Angriff36/capsule listA,listB`,
      );
      const remote = readFileSync(`${checkout.log}.remote-script`, "utf8");
      expect(remote).toContain("remote get-url origin");
      expect(remote).toContain("git pull --ff-only origin main");
      expect(remote).toContain('[ "$(git rev-parse HEAD)" = "$sha" ]');
      expect(remote).toContain(
        'exec bash scripts/deploy-backend.sh --expect "$sha" --verify "$verify"',
      );
      expect(remote).not.toContain("/home/");
    },
    TIMEOUT,
  );

  it(
    "stops at the first failure: Vercel, SSH, a missing PASS line, a failed release",
    () => {
      const vercel = makeCheckout();
      const vercelRun = vercel.run(["--reviewer", "test-model"], {
        STUB_VERCEL_EXIT: "1",
        STUB_SCOPE: BACKEND,
      });
      expect(vercelRun.lastLine).toContain("RESULT: FAIL - the Vercel");
      expect(vercelRun.status).toBe(1);
      expect(vercel.calls()).toHaveLength(1);

      for (const mode of ["fail", "silent"]) {
        const checkout = makeCheckout();
        const result = checkout.run(["--reviewer", "test-model"], {
          STUB_SCOPE: BACKEND,
          STUB_SSH: mode,
        });
        expect(result.lastLine).toContain("RESULT: FAIL");
        expect(result.output).not.toContain("frontend and backend deployed");
        expect(result.status).toBe(1);
      }

      // release.sh refuses a dirty tree: nothing after it runs.
      const dirty = makeCheckout();
      const before = dirty.mainSha();
      writeFileSync(join(dirty.work, "feature.txt"), "changed\n");
      const dirtyRun = dirty.run(["--reviewer", "test-model"]);
      expect(dirtyRun.lastLine).toContain(
        "RESULT: FAIL - scripts/release.sh failed",
      );
      expect(dirty.mainSha()).toBe(before);
      expect(dirty.calls()).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "with no --reviewer it runs the review and releases only on VERDICT: APPROVE",
    () => {
      const rejected = makeCheckout();
      const before = rejected.mainSha();
      const rejectedRun = rejected.run([], {
        STUB_REVIEW: "[P1] Something breaks.\\nVERDICT: REJECT",
      });
      expect(rejectedRun.lastLine).toContain("the review REJECTED");
      expect(rejected.mainSha()).toBe(before);

      const silent = makeCheckout();
      const silentBefore = silent.mainSha();
      const silentRun = silent.run([], { STUB_REVIEW: "Looks fine." });
      expect(silentRun.lastLine).toContain("the review gave no verdict");
      expect(silent.mainSha()).toBe(silentBefore);

      const approved = makeCheckout();
      const approvedRun = approved.run([]);
      expect(approvedRun.lastLine).toContain(
        "RESULT: PASS - frontend deployed",
      );
      expect(approved.calls()[0]).toBe(
        'codex -c model="gpt-5.6-sol" review -'.replace(/"/g, ""),
      );
      expect(
        git(approved.work, "log", "-1", "--format=%s", approved.mainSha()),
      ).toBe(`[release] ${BRANCH} (reviewed by gpt-5.6-sol)`);
    },
    TIMEOUT,
  );

  it(
    "run again on main at the [release] commit: continues without a second release",
    () => {
      const checkout = makeCheckout();
      const first = checkout.run(["--reviewer", "test-model"], {
        STUB_SCOPE: BACKEND,
        STUB_SSH: "fail",
      });
      expect(first.status).toBe(1);
      const sha = checkout.mainSha();
      expect(git(checkout.work, "symbolic-ref", "--short", "HEAD")).toBe(
        "main",
      );

      const second = checkout.run([], { STUB_SCOPE: BACKEND });
      expect(second.output).toContain("Continuing that release.");
      expect(second.lastLine).toBe(
        `RESULT: PASS - frontend and backend deployed at ${sha}`,
      );
      expect(checkout.mainSha()).toBe(sha);
      expect(checkout.calls().some((call) => call.startsWith("codex"))).toBe(
        false,
      );
    },
    TIMEOUT,
  );
});
