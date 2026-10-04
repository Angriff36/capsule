// ralph-sync.sh — keeping a work copy up to date with the shared branch
// (AC-157, AC-158, PL-GIT-MAINTENANCE).
//
// Offline proof: a throwaway checkout with a local bare `origin`. Another
// copy adds work to `dev` after the checkout last looked, so only a real
// fetch can see it (old remote refs are not evidence). Nothing is contacted.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(__dirname, "..", "ralph-sync.sh").replace(/\\/g, "/");
// Git Bash on Windows, never the WSL stub (same lookup as scripts/windowsGitBashPath.ts).
const GIT_BASH = [
  process.env.GIT_BASH?.trim() ?? "",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files (x86)/Git/bin/bash.exe",
].find((path) => path !== "" && existsSync(path));
const BASH = process.platform === "win32" ? (GIT_BASH ?? "bash") : "bash";
const TIMEOUT = 60_000;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function configure(cwd: string) {
  git(cwd, "config", "user.email", "test@example.invalid");
  git(cwd, "config", "user.name", "Sync Test");
  git(cwd, "config", "core.autocrlf", "false");
  git(cwd, "config", "core.hooksPath", join(cwd, "..", "no-hooks"));
}

/** `work` on its own branch from dev; `other` is a second copy that adds to dev. */
function makeCopies() {
  const root = mkdtempSync(join(tmpdir(), "capsule-ralph-sync-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  const other = join(root, "other");
  mkdirSync(origin);
  mkdirSync(work);
  git(origin, "init", "--bare", "-b", "dev");
  git(work, "init", "-b", "dev");
  configure(work);
  writeFileSync(join(work, "menu.txt"), "soup\nsalad\n");
  git(work, "add", "menu.txt");
  git(work, "commit", "-m", "start");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-u", "origin", "dev");
  git(work, "switch", "-c", "loop/work");
  git(root, "clone", "-b", "dev", origin, "other");
  configure(other);
  return { root, origin, work, other };
}

function addUpstream(other: string, file: string, body: string) {
  writeFileSync(join(other, file), body);
  git(other, "add", file);
  git(other, "commit", "-m", `upstream ${file}`);
  git(other, "push", "origin", "dev");
  return git(other, "rev-parse", "HEAD");
}

function sync(work: string) {
  const result = spawnSync(
    BASH,
    ["-c", `source "${SCRIPT}" && ralph_sync_base`],
    {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, RALPH_BASE_BRANCH: "dev", RALPH_REMOTE: "origin" },
    },
  );
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("ralph-sync.sh brings a work copy up to date with dev", () => {
  it(
    "fetches first: work added after the last look is found and merged in (clean copy)",
    () => {
      const { work, other } = makeCopies();
      const upstream = addUpstream(other, "drinks.txt", "lemonade\n");
      // The checkout's own remote ref is old; only a fetch can see `upstream`.
      expect(git(work, "rev-parse", "origin/dev")).not.toBe(upstream);
      const before = git(work, "rev-parse", "HEAD");

      const run = sync(work);
      expect(run.status).toBe(0);
      expect(run.out).toContain(`this copy is loop/work at ${before}`);
      expect(run.out).toContain("missing 1 commit(s) from origin/dev");
      expect(run.out).toContain(`${upstream.slice(0, 7)} upstream drinks.txt`);
      expect(run.out.indexOf(before)).toBeLessThan(
        run.out.indexOf("integrating newer origin/dev"),
      );
      expect(run.out).toContain("integrating newer origin/dev");
      expect(run.out).toContain("loop/work");
      expect(git(work, "rev-parse", "origin/dev")).toBe(upstream);
      expect(
        spawnSync("git", ["merge-base", "--is-ancestor", upstream, "HEAD"], {
          cwd: work,
        }).status,
      ).toBe(0);
      expect(git(work, "branch", "--show-current")).toBe("loop/work");
    },
    TIMEOUT,
  );

  it(
    "says it is current only after fetching, and names the dev commit",
    () => {
      const { work } = makeCopies();
      const tip = git(work, "rev-parse", "dev");
      const run = sync(work);
      expect(run.status).toBe(0);
      expect(run.out).toContain(`this copy is loop/work at ${tip}`);
      expect(run.out).not.toContain("missing");
      expect(run.out).toContain(`current with origin/dev (${tip.slice(0, 8)})`);
    },
    TIMEOUT,
  );

  it(
    "never claims anything when dev cannot be reached",
    () => {
      const { work } = makeCopies();
      git(work, "remote", "set-url", "origin", join(work, "..", "missing.git"));
      const run = sync(work);
      expect(run.status).not.toBe(0);
      expect(run.out).not.toContain("current with");
    },
    TIMEOUT,
  );

  it(
    "leaves unsaved and new files alone: no merge, no stash, no reset",
    () => {
      const { work, other } = makeCopies();
      addUpstream(other, "drinks.txt", "lemonade\n");
      const before = git(work, "rev-parse", "HEAD");
      writeFileSync(join(work, "menu.txt"), "soup\nsalad\nbread\n");
      writeFileSync(join(work, "notes.txt"), "call the venue\n");

      const run = sync(work);
      expect(run.status).toBe(0);
      expect(run.out).toContain("needs agent attention");
      expect(git(work, "rev-parse", "HEAD")).toBe(before);
      expect(git(work, "stash", "list")).toBe("");
      expect(readFileSync(join(work, "menu.txt"), "utf8")).toBe(
        "soup\nsalad\nbread\n",
      );
      expect(readFileSync(join(work, "notes.txt"), "utf8")).toBe(
        "call the venue\n",
      );
    },
    TIMEOUT,
  );

  it(
    "a clash names the exact file and keeps both sides",
    () => {
      const { work, other } = makeCopies();
      writeFileSync(join(work, "menu.txt"), "soup\ncaesar salad\n");
      git(work, "commit", "-am", "ours");
      addUpstream(other, "menu.txt", "soup\ngreek salad\n");

      const run = sync(work);
      expect(run.status).toBe(0);
      expect(run.out).toContain("Merge conflict in menu.txt");
      expect(run.out).toContain("needs agent attention");
      const menu = readFileSync(join(work, "menu.txt"), "utf8");
      expect(menu).toContain("caesar salad");
      expect(menu).toContain("greek salad");
      expect(git(work, "branch", "--show-current")).toBe("loop/work");
    },
    TIMEOUT,
  );

  it(
    "a release refuses a copy with unsaved or new files, so they never ride along",
    () => {
      const { work } = makeCopies();
      writeFileSync(join(work, "notes.txt"), "call the venue\n");
      const before = git(work, "rev-parse", "HEAD");
      const release = join(__dirname, "..", "scripts", "release.sh");
      const run = spawnSync(
        BASH,
        [release.replace(/\\/g, "/"), "--no-review"],
        {
          cwd: work,
          encoding: "utf8",
        },
      );
      expect(run.status).toBe(1);
      expect(`${run.stdout}${run.stderr}`).toContain(
        "working tree is not clean",
      );
      expect(git(work, "rev-parse", "HEAD")).toBe(before);
      expect(git(work, "branch", "--show-current")).toBe("loop/work");
      expect(readFileSync(join(work, "notes.txt"), "utf8")).toBe(
        "call the venue\n",
      );
    },
    TIMEOUT,
  );
});
