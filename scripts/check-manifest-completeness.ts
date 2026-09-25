/**
 * Reaction + domain completeness gate (2026-09-25).
 *
 * Compiles the domain IR and runs `manifest validate-ai` (domain category:
 * REACTION_UNWIRED, DOMAIN_UNWIRED_FK, DOMAIN_ORPHAN_CREATE, …). Every error
 * must be listed in scripts/manifest-completeness-tracked.json with the issue
 * that owns it; anything else fails. It is a ratchet: a tracked entry that is
 * no longer reported also fails until it is removed from the list.
 * Reaction wiring has no tracked entries — any REACTION_UNWIRED fails.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_BIN = path.join(ROOT, "node_modules", ".bin", "manifest");
const IR = path.join(ROOT, "generated", "ir", "merged.ir.json");
const TRACKED = path.join(
  ROOT,
  "scripts",
  "manifest-completeness-tracked.json",
);

interface Diagnostic {
  code: string;
  severity: string;
  message: string;
}

interface TrackedEntry {
  code: string;
  /** Stable key: `Entity.field` for FK findings, `Entity` for orphans. */
  key: string;
  issue: string;
}

/** `Entity.field` (FK) or `Entity` (orphan) named by a finding. */
export function findingKey(diagnostic: Diagnostic): string {
  const fk = /^Entity '(\w+)' references parent '\w+' via '(\w+)'/.exec(
    diagnostic.message,
  );
  if (fk) return `${fk[1]}.${fk[2]}`;
  const entity = /^Entity '(\w+)'/.exec(diagnostic.message);
  return entity ? entity[1]! : diagnostic.message;
}

function run(args: string[]): { status: number; stdout: string } {
  const result = spawnSync(MANIFEST_BIN, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: result.status ?? 1, stdout: result.stdout };
}

export function checkManifestCompleteness(): number {
  if (run(["compile", "--all"]).status !== 0) {
    console.error("check-manifest-completeness: manifest compile --all failed");
    return 1;
  }
  const report = JSON.parse(
    run(["validate-ai", IR, "--format", "json"]).stdout,
  ) as { reports: Array<{ diagnostics: Diagnostic[] }> };
  const errors = report.reports
    .flatMap((r) => r.diagnostics)
    .filter((d) => d.severity === "error");

  const tracked = (
    JSON.parse(readFileSync(TRACKED, "utf8")) as { tracked: TrackedEntry[] }
  ).tracked;
  const trackedIds = new Set(tracked.map((t) => `${t.code} ${t.key}`));
  const reportedIds = new Set(errors.map((e) => `${e.code} ${findingKey(e)}`));

  const untracked = errors.filter(
    (e) => !trackedIds.has(`${e.code} ${findingKey(e)}`),
  );
  const resolved = tracked.filter(
    (t) => !reportedIds.has(`${t.code} ${t.key}`),
  );

  for (const e of untracked) console.error(`- [${e.code}] ${e.message}`);
  for (const t of resolved) {
    console.error(
      `- resolved, remove from scripts/manifest-completeness-tracked.json: [${t.code}] ${t.key} (${t.issue})`,
    );
  }
  if (untracked.length > 0 || resolved.length > 0) {
    console.error(
      `check-manifest-completeness: ${String(untracked.length)} untracked error(s), ${String(resolved.length)} stale tracked entr(y/ies).`,
    );
    return 1;
  }
  console.log(
    `check-manifest-completeness: 0 reaction-wiring errors; ${String(tracked.length)} tracked domain finding(s), no new ones.`,
  );
  return 0;
}

if (import.meta.main) process.exit(checkManifestCompleteness());
