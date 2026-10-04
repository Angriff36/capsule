// loop.sh — what a round really did (AC-160, PL-LOOP-COMPLETION, PR13-04).
//
// Offline proof: loop.sh, ralph-sync.sh and ralph-rounds.sh run in a throwaway
// checkout with a local bare `origin`. A stand-in `claude` / `codex` on PATH
// plays each round from a script; nothing is contacted.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const REPO = join(__dirname, "..");
// Git Bash on Windows, never the WSL stub (same lookup as scripts/windowsGitBashPath.ts).
const GIT_BASH = [
  process.env.GIT_BASH?.trim() ?? "",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
].find((path) => path !== "" && existsSync(path));
const BASH = process.platform === "win32" ? (GIT_BASH ?? "bash") : "bash";
const TIMEOUT = 120_000;

// Each call is one round: round-<n>.sh runs in the checkout; its exit is the CLI's.
const STUB = `#!/bin/bash
cat > "$STUB_DIR/prompt-last.txt"
n=$(( $(cat "$STUB_DIR/n" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STUB_DIR/n"
cp "$STUB_DIR/prompt-last.txt" "$STUB_DIR/prompt-$n.txt"
[ -f "$STUB_DIR/round-$n.sh" ] || exit 0
bash "$STUB_DIR/round-$n.sh"
`;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function configure(cwd: string) {
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Loop Test");
  git(cwd, "config", "core.autocrlf", "false");
  git(cwd, "config", "core.hooksPath", join(cwd, "..", "no-hooks"));
}

function makeLoop(rounds: Record<number, string>) {
  const root = mkdtempSync(join(tmpdir(), "capsule-ralph-loop-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  const stub = join(root, "stub");
  const bin = join(root, "bin");
  for (const dir of [origin, work, stub, bin]) mkdirSync(dir);
  for (const file of ["loop.sh", "ralph-sync.sh", "ralph-rounds.sh"])
    copyFileSync(join(REPO, file), join(work, file));
  writeFileSync(join(bin, "claude"), STUB);
  writeFileSync(join(bin, "codex"), STUB);
  for (const [n, body] of Object.entries(rounds))
    writeFileSync(join(stub, `round-${n}.sh`), body);

  git(origin, "init", "--bare", "-b", "dev");
  git(work, "init", "-b", "dev");
  configure(work);
  writeFileSync(join(work, "PROMPT_build.md"), "Build the next item.\n");
  writeFileSync(
    join(work, "IMPLEMENTATION_PLAN.md"),
    "- [x] soup\n- [ ] salad\n",
  );
  mkdirSync(join(work, "specs"));
  writeFileSync(join(work, "specs", "menu.md"), "Soup and salad.\n");
  writeFileSync(
    join(work, ".gitignore"),
    ".ralph-checkpoint\n.ralph-complete\n.ralph-telemetry.jsonl\n.ralph-failures.md\n",
  );
  git(work, "add", "-A");
  git(work, "commit", "-m", "start");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-u", "origin", "dev");
  git(work, "switch", "-c", "loop/work");
  git(root, "clone", "-b", "dev", origin, "other");
  configure(join(root, "other"));
  return { root, work, stub, bin };
}

function runLoop(
  loop: ReturnType<typeof makeLoop>,
  iterations: number,
  env: Record<string, string> = {},
) {
  const result = spawnSync(BASH, ["loop.sh", String(iterations)], {
    cwd: loop.work,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${loop.bin}${delimiter}${process.env.PATH ?? ""}`,
      STUB_DIR: loop.stub.replace(/\\/g, "/"),
      RALPH_FAIL_WAIT: "0",
      RALPH_ROUND_TEST_CMD: "",
      ...env,
    },
  });
  const rounds = readFileSync(join(loop.work, ".ralph-telemetry.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, string | number>);
  let failures = "";
  try {
    failures = readFileSync(join(loop.work, ".ralph-failures.md"), "utf8");
  } catch {
    failures = "";
  }
  return {
    status: result.status,
    out: `${result.stdout}${result.stderr}`,
    rounds,
    failures,
  };
}

const TICK_AND_COMMIT = `sed -i 's/- \\[ \\] salad/- [x] salad/' IMPLEMENTATION_PLAN.md
git add IMPLEMENTATION_PLAN.md && git commit -qm "salad done"
`;

describe("loop.sh records what each round really did", () => {
  it(
    "(1) records tests, push, integration and deployment states separately; a dev push is never a deployment",
    () => {
      const loop = makeLoop({ 1: TICK_AND_COMMIT, 2: "exit 1\n" });
      const run = runLoop(loop, 2, { RALPH_ROUND_TEST_CMD: "true" });
      expect(run.rounds).toHaveLength(2);
      expect(run.rounds[0]).toMatchObject({
        round: "pass",
        tests: "pass",
        push: "pass",
        integration: "pass",
        frontend_deploy: "not_run",
        backend_deploy: "not_run",
        signed_in_check: "not_run",
      });
      expect(run.rounds[1]).toMatchObject({
        round: "fail",
        exit_code: 1,
        tests: "not_run",
        push: "not_run",
        frontend_deploy: "not_run",
        backend_deploy: "not_run",
      });
    },
    TIMEOUT,
  );

  it(
    "(1) a failing test run is recorded as fail, not hidden in the exit code",
    () => {
      const loop = makeLoop({ 1: TICK_AND_COMMIT });
      const run = runLoop(loop, 1, { RALPH_ROUND_TEST_CMD: "false" });
      expect(run.rounds[0]).toMatchObject({ round: "pass", tests: "fail" });
    },
    TIMEOUT,
  );

  it(
    "(2) a codex turn whose answer is a 429 provider error is a failed round",
    () => {
      const answer = (text: string) =>
        `echo '{"type":"thread.started"}'
echo '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"${text}"}}'
echo '{"type":"turn.completed","usage":{}}'
exit 0
`;
      const loop = makeLoop({
        1: answer(
          "API Error: Request rejected (429) - [1302][Rate limit reached for requests]",
        ),
        2: answer("Ticked nothing; the plan is current."),
      });
      const run = runLoop(loop, 2, { RALPH_CLI: "codex" });
      expect(run.rounds[0]).toMatchObject({
        round: "fail",
        failure: "provider-fail",
        push: "not_run",
      });
      expect(run.rounds[0].exit_code).not.toBe(0);
      expect(run.out).toContain("round NOT done");
      expect(run.failures).toContain("provider-fail");
      expect(run.failures).toContain("Rate limit reached");
      expect(run.rounds[1]).toMatchObject({ round: "pass", exit_code: 0 });
    },
    TIMEOUT,
  );

  it(
    "(3) an all-complete claim is recorded with the specs/ hash and dies when specs/ change",
    () => {
      const loop = makeLoop({
        // Round 1 ticks the last box; meanwhile someone adds a spec on dev.
        1: `${TICK_AND_COMMIT}
cd ../other && echo "Add bread." > specs/bread.md && git add specs && git commit -qm "new spec" && git push -q origin dev
`,
      });
      const run = runLoop(loop, 3);
      const claimFile = join(loop.work, ".ralph-complete");
      expect(run.rounds[0]).toMatchObject({ specs_claim: "none" });
      expect(run.rounds[1]).toMatchObject({ specs_claim: "stale" });
      expect(run.rounds[2]).toMatchObject({ specs_claim: "current" });
      expect(run.rounds[1].specs).not.toBe(run.rounds[0].specs);
      expect(run.out).toContain("all-complete claim");
      expect(run.out).toContain("is stale: specs/ changed");
      expect(readFileSync(join(loop.stub, "prompt-2.txt"), "utf8")).toContain(
        "SPECS CHANGED",
      );
      expect(
        readFileSync(join(loop.stub, "prompt-3.txt"), "utf8"),
      ).not.toContain("SPECS CHANGED");
      // The claim now standing was made against the new specs/.
      expect(readFileSync(claimFile, "utf8")).toContain(
        `specs=${String(run.rounds[2].specs)}`,
      );
    },
    TIMEOUT,
  );

  it(
    "(4) rounds that change nothing get a diagnosis, and the loop keeps going",
    () => {
      const loop = makeLoop({
        1: "echo 'lint error in menu.ts' >&2\nexit 1\n",
      });
      const run = runLoop(loop, 4);
      expect(run.rounds).toHaveLength(4);
      expect(run.out).toContain(
        "no progress in 3 rounds in a row (no plan tick, no commit): round 1 exit 1 (lint-fail);round 2 exit 0;round 3 exit 0",
      );
      expect(run.out).toContain("no progress in 4 rounds in a row");
      expect(run.out).toContain("Last failure: lint-fail in round 1");
      expect(run.out).toContain("The loop keeps going.");
      expect(run.failures).toContain("no progress in 3 rounds");
      expect(run.rounds.map((r) => r.no_progress_rounds)).toEqual([1, 2, 3, 4]);
    },
    TIMEOUT,
  );

  it(
    "(4) a round with a commit resets the count",
    () => {
      const loop = makeLoop({ 3: TICK_AND_COMMIT });
      const run = runLoop(loop, 4);
      expect(run.rounds.map((r) => r.no_progress_rounds)).toEqual([1, 2, 0, 1]);
      expect(run.out).not.toContain("no progress in");
    },
    TIMEOUT,
  );
});
