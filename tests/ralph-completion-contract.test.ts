// ralph-worker.ps1 — a provider error or an empty answer is never a done task
// (AC-160, PL-LOOP-COMPLETION, issue #381).
//
// Offline proof: a copy of the worker in a throwaway folder, with a stand-in
// for the model launcher (~/.claude/claude-glm.ps1) that prints a chosen
// answer and exits 0, like the real launcher did on a 429. Nothing is
// contacted. Windows only: the worker is PowerShell.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "..", "ralph-worker.ps1");
const TIMEOUT = 60_000;
const LAUNCHER = `[Console]::In.ReadToEnd() | Out-Null
if ($env:STUB_ANSWER) { Write-Output $env:STUB_ANSWER }
exit 0
`;

function worker(answer: string, taskFile = ".ralph-tasks/001-task.md") {
  const root = mkdtempSync(join(tmpdir(), "capsule-ralph-worker-"));
  const home = join(root, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", "claude-glm.ps1"), LAUNCHER);
  copyFileSync(SCRIPT, join(root, "ralph-worker.ps1"));
  mkdirSync(join(root, ".ralph-tasks"));
  writeFileSync(join(root, ".ralph-tasks", "001-task.md"), "Add one field.\n");
  const result = spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(root, "ralph-worker.ps1"),
      "-TaskFile",
      taskFile,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, USERPROFILE: home, STUB_ANSWER: answer },
    },
  );
  let log = "";
  try {
    log = readFileSync(join(root, ".ralph-workers.log"), "utf8");
  } catch {
    log = "";
  }
  return {
    status: result.status,
    out: `${result.stdout}${result.stderr}`,
    log,
  };
}

describe.skipIf(process.platform !== "win32")(
  "ralph-worker.ps1 never counts a provider failure as a done task",
  () => {
    it(
      "a 429 answer with launcher exit 0 fails, keeps the provider message, and logs the failure",
      () => {
        const run = worker(
          "API Error: Request rejected (429) - [1302][Rate limit reached for requests]",
        );
        expect(run.status).toBe(3);
        expect(run.out).toContain("Rate limit reached");
        expect(run.out).toContain("task NOT done");
        expect(run.log).toMatch(/task=\.ralph-tasks\/001-task\.md exit=3 /);
      },
      TIMEOUT,
    );

    it(
      "no answer at all fails",
      () => {
        const run = worker("");
        expect(run.status).toBe(3);
        expect(run.log).toContain("exit=3");
      },
      TIMEOUT,
    );

    it(
      "a real answer passes and is relayed",
      () => {
        const run = worker("Added the field and its test.");
        expect(run.status).toBe(0);
        expect(run.out).toContain("Added the field and its test.");
        expect(run.log).toContain("exit=0");
      },
      TIMEOUT,
    );

    it(
      "a missing task file fails before anything runs",
      () => {
        const run = worker("Added the field.", ".ralph-tasks/missing.md");
        expect(run.status).toBe(2);
        expect(run.log).toBe("");
      },
      TIMEOUT,
    );
  },
);
