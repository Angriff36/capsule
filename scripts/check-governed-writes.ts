/**
 * Governed-writes gate (2026-09-29).
 *
 * Domain data changes only through generated Manifest commands (runtime:
 * policies → guards → mutations → emitted events → reactions). Authored Convex
 * code must not write tables directly, and must never insert into
 * `manifestEvents` (that forges an event no command emitted).
 *
 * The narrow exception: a table listed in scripts/governed-write-exceptions.json
 * with the reason it must stay outside Manifest and the files allowed to write
 * it. Every raw write site names its table in a `// raw-write: <table>` marker
 * on the line above (or the same line); an insert's literal table must match.
 * It is a ratchet: a listed file that no longer writes the table fails too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXCEPTIONS = path.join(
  ROOT,
  "scripts",
  "governed-write-exceptions.json",
);
const FORBIDDEN_TABLES = new Set(["manifestEvents"]);
const WRITE = /\bdb\s*\.\s*(insert|patch|replace|delete)\s*\(/g;
const MARKER = /\/\/\s*raw-write:\s*(\w+)/;

export interface ExceptionEntry {
  reason: string;
  files: string[];
}

export interface WriteViolation {
  file: string;
  line: number;
  detail: string;
}

/** Authored Convex sources: tracked, not Builder-owned, not convex/_generated. */
export function authoredConvexFiles(root = ROOT): string[] {
  const owned = new Set(
    Object.keys(
      (
        JSON.parse(
          readFileSync(path.join(root, ".builder", "ownership.json"), "utf8"),
        ) as { files: Record<string, unknown> }
      ).files,
    ),
  );
  return execFileSync("git", ["ls-files", "convex"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(
      (file) =>
        /\.ts$/.test(file) &&
        !file.startsWith("convex/_generated/") &&
        !/\.test\.ts$/.test(file) &&
        !owned.has(file),
    );
}

/** Raw write sites in one source, with the table each names. */
export function inspectSource(
  file: string,
  source: string,
  exceptions: Readonly<Record<string, ExceptionEntry>>,
): { violations: WriteViolation[]; tables: Set<string> } {
  const lines = source.split("\n");
  const violations: WriteViolation[] = [];
  const tables = new Set<string>();
  lines.forEach((text, index) => {
    for (const match of text.matchAll(WRITE)) {
      const kind = match[1]!;
      const rest = text.slice((match.index ?? 0) + match[0].length);
      const literal =
        kind === "insert" ? (/^\s*["'](\w+)["']/.exec(rest)?.[1] ?? null) : null;
      const marker =
        MARKER.exec(text)?.[1] ?? MARKER.exec(lines[index - 1] ?? "")?.[1];
      const table = marker ?? literal;
      const at = { file, line: index + 1 };
      if (literal !== null && FORBIDDEN_TABLES.has(literal)) {
        violations.push({
          ...at,
          detail: `inserts into ${literal}; emit the event from a Manifest command`,
        });
        continue;
      }
      if (table === undefined || table === null) {
        violations.push({
          ...at,
          detail: `raw db.${kind} with no "// raw-write: <table>" marker; call a generated command`,
        });
        continue;
      }
      if (literal !== null && marker !== undefined && literal !== marker) {
        violations.push({
          ...at,
          detail: `marker names ${marker} but the insert writes ${literal}`,
        });
        continue;
      }
      const entry = exceptions[table];
      if (FORBIDDEN_TABLES.has(table) || entry === undefined) {
        violations.push({
          ...at,
          detail: `raw db.${kind} on ${table}, which has no exception; call a generated command`,
        });
        continue;
      }
      if (!entry.files.includes(file)) {
        violations.push({
          ...at,
          detail: `${file} is not listed as a writer of ${table}`,
        });
        continue;
      }
      tables.add(table);
    }
  });
  return { violations, tables };
}

export function checkGovernedWrites(root = ROOT): WriteViolation[] {
  const exceptions = (
    JSON.parse(readFileSync(EXCEPTIONS, "utf8")) as {
      tables: Record<string, ExceptionEntry>;
    }
  ).tables;
  const violations: WriteViolation[] = [];
  const written = new Map<string, Set<string>>();
  for (const file of authoredConvexFiles(root)) {
    const result = inspectSource(
      file,
      readFileSync(path.join(root, file), "utf8"),
      exceptions,
    );
    violations.push(...result.violations);
    written.set(file, result.tables);
  }
  for (const [table, entry] of Object.entries(exceptions)) {
    for (const file of entry.files) {
      if (!written.get(file)?.has(table)) {
        violations.push({
          file,
          line: 0,
          detail: `listed as a writer of ${table} but no longer writes it; remove it from scripts/governed-write-exceptions.json`,
        });
      }
    }
  }
  return violations;
}

if (import.meta.main) {
  const violations = checkGovernedWrites();
  if (violations.length > 0) {
    console.error("Governed-writes gate failed:");
    for (const v of violations) {
      console.error(`- ${v.file}${v.line ? `:${String(v.line)}` : ""}: ${v.detail}`);
    }
    process.exit(1);
  }
  console.log(
    "check-governed-writes: authored Convex code writes only the documented exception tables.",
  );
}
