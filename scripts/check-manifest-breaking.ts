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
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACKS = path.join(ROOT, "scripts", "manifest-breaking-acks.json");
const MANIFEST_BIN = path.join(ROOT, "node_modules", ".bin", "manifest");
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
  const result = spawnSync(MANIFEST_BIN, ["compile", "--all"], {
    cwd,
    encoding: "utf8",
  });
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

function baselineIr(sha: string, scratch: string): string {
  const dir = path.join(scratch, "baseline");
  execFileSync("mkdir", ["-p", dir]);
  const archive = execFileSync(
    "git",
    ["archive", sha, "src", "manifest.config.yaml"],
    { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 },
  );
  execFileSync("tar", ["-x", "-C", dir], { input: archive });
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
    const result = spawnSync(MANIFEST_BIN, args, {
      cwd: ROOT,
      stdio: "inherit",
    });
    return result.status ?? 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) process.exit(checkManifestBreaking());
