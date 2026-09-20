// Gatherer for src/lib/releaseBackendScope.ts. Used by scripts/deploy-production.sh.
//
//   bun scripts/release-backend-scope.ts --sha <release sha>
//
// Prints machine-readable lines:
//   backend=required|unchanged
//   reason=<changed path>          (up to 10)
//   verify=<listA,listB>           (new zero-argument list queries; may be empty)
//
// Reads git and the working tree only. The working tree must be AT the release
// commit, because the import closure of convex/ is read from disk.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { releaseBackendScope } from "../src/lib/releaseBackendScope";

const root = resolve(import.meta.dir, "..");

function git(args: string[], allowFailure = false): string | null {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules") files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

function resolveImport(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    base.replace(/\.js$/, ".ts"),
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return (
    candidates.find((path) => existsSync(path) && statSync(path).isFile()) ??
    null
  );
}

/** Files outside convex/ that convex/ code imports, with their own relative imports. */
function convexImportedPaths(): string[] {
  const convexDir = join(root, "convex");
  const outside = new Set<string>();
  const queue = existsSync(convexDir) ? sourceFiles(convexDir) : [];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    const specifiers = source.matchAll(
      /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g,
    );
    for (const match of specifiers) {
      const target = resolveImport(file, match[1]);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
      const repoPath = relative(root, target).replace(/\\/g, "/");
      if (!repoPath.startsWith("convex/") && !repoPath.startsWith(".."))
        outside.add(repoPath);
    }
  }
  return [...outside];
}

const shaIndex = process.argv.indexOf("--sha");
const sha = shaIndex >= 0 ? (process.argv[shaIndex + 1] ?? "") : "";
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error(
    "release-backend-scope: --sha <full 40-character sha> is required",
  );
  process.exit(2);
}
if ((git(["rev-parse", "HEAD"]) ?? "").trim() !== sha) {
  console.error(
    `release-backend-scope: the working tree is not at ${sha}; the import closure would be wrong`,
  );
  process.exit(2);
}

const changedPaths = (git(["diff", "--name-only", `${sha}^1`, sha]) ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const scope = releaseBackendScope({
  changedPaths,
  convexImportedPaths: convexImportedPaths(),
  queriesBefore: git(["show", `${sha}^1:convex/queries.ts`], true),
  queriesAfter: git(["show", `${sha}:convex/queries.ts`], true),
});

console.log(`backend=${scope.backendRequired ? "required" : "unchanged"}`);
for (const reason of scope.reasons.slice(0, 10))
  console.log(`reason=${reason}`);
console.log(`verify=${scope.verifyQueries.join(",")}`);
