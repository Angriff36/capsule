/**
 * Breaking-change gate (2026-09-25): the domain IR compiled from this tree
 * must not break the IR of the last `[release]` commit on main unless each
 * break is acknowledged in scripts/manifest-breaking-acks.json.
 *
 * Both IRs are compiled here from source with the pinned Manifest CLI
 * (`manifest compile --all`, config-driven merge), then compared with
 * `manifest diff breaking --ci --ack`. The baseline is the release commit's
 * own src/ + manifest.config.yaml, so it needs git history (CI checks out
 * with fetch-depth: 0).
 *
 * Acknowledge an intentional break by adding
 *   { "path": "Entity.field", "category": "property-removed",
 *     "acknowledgedAt": "<ISO date>", "reason": "<why>" }
 * to `acknowledged`; the gate prints the path and category it needs.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runManifestCli } from "./manifest-cli";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACKS = path.join(ROOT, "scripts", "manifest-breaking-acks.json");
const IR_REL = path.join("generated", "ir", "merged.ir.json");

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/** Last `[release]` commit reachable from main (remote first, then local). */
export function lastReleaseCommit(): string {
  for (const ref of ["origin/main", "main"]) {
    try {
      const sha = git([
        "log",
        ref,
        "--grep=^\\[release\\]",
        "--format=%H",
        "-1",
      ]);
      if (sha) return sha;
    } catch {
      // ref missing in this checkout; try the next one
    }
  }
  throw new Error(
    "check-manifest-breaking: no [release] commit found on origin/main or main (shallow clone? fetch full history)",
  );
}

function compile(cwd: string): string {
  const result = runManifestCli(["compile", "--all"], { cwd });
  const out = path.join(cwd, IR_REL);
  if (result.status !== 0 || !existsSync(out)) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(
      `check-manifest-breaking: manifest compile failed in ${cwd}`,
    );
  }
  return out;
}

/**
 * Write the release commit's src/ and manifest.config.yaml into `dir` using
 * git plumbing and Node fs only (no mkdir/tar on PATH; works from PowerShell).
 */
export function materializeBaseline(sha: string, dir: string): number {
  const listed = execFileSync(
    "git",
    [
      "ls-tree",
      "-r",
      "-z",
      "--name-only",
      sha,
      "--",
      "src",
      "manifest.config.yaml",
    ],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
  )
    .toString("utf8")
    .split("\0")
    .filter((file) => file.length > 0);
  for (const file of listed) {
    const target = path.join(dir, ...file.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      execFileSync("git", ["show", `${sha}:${file}`], {
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  }
  return listed.length;
}

function baselineIr(sha: string, scratch: string): string {
  const dir = path.join(scratch, "baseline");
  if (materializeBaseline(sha, dir) === 0) {
    throw new Error(`check-manifest-breaking: ${sha} has no src/ to compare`);
  }
  return compile(dir);
}

export function checkManifestBreaking(): number {
  const sha = lastReleaseCommit();
  const scratch = mkdtempSync(path.join(tmpdir(), "capsule-breaking-"));
  try {
    const oldIr = baselineIr(sha, scratch);
    const newIr = compile(ROOT);
    console.log(
      `check-manifest-breaking: comparing ${sha.slice(0, 7)} ([release]) → working tree`,
    );
    const args = ["diff", "breaking", oldIr, newIr, "--ci"];
    if (existsSync(ACKS)) args.push("--ack", ACKS);
    const result = runManifestCli(args, { cwd: ROOT, inherit: true });
    return result.status ?? 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(checkManifestBreaking());
