// Gatherer for src/lib/releaseBackendScope.ts. Used by scripts/deploy-production.sh.
//
//   bun scripts/release-backend-scope.ts --sha <release sha>
//
// Prints machine-readable lines:
//   backend=required|unchanged
//   reason=<changed path>          (up to 10)
//   verify=<listA,listB>           (new zero-argument list queries; may be empty)
//
// The change set is everything since the PREVIOUS [release] commit on main, not
// only the release commit itself: a release of a branch that already landed on
// main (a GitHub-side merge) is an empty [release] commit, and merges that
// landed between two releases were never deployed either. No previous release
// means "required".
//
// Reads git and the working tree only. The working tree must be AT the release
// commit with no tracked edits under convex/ or src/, because the import
// closure of convex/ is read from disk.
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

const dirty = (
  git([
    "status",
    "--porcelain",
    "--untracked-files=no",
    "--",
    "convex",
    "src",
  ]) ?? ""
).trim();
if (dirty !== "") {
  console.error(
    `release-backend-scope: tracked files under convex/ or src/ have local changes; the import closure would be wrong:
${dirty}`,
  );
  process.exit(2);
}

// The last commit that was released before this one (first-parent history).
const previousRelease = (
  git(
    [
      "log",
      "--first-parent",
      "-n",
      "1",
      "--format=%H",
      String.raw`--grep=^\[release\] `,
      `${sha}^1`,
    ],
    true,
  ) ?? ""
).trim();
if (!/^[0-9a-f]{40}$/.test(previousRelease)) {
  console.log("backend=required");
  console.log("reason=no previous [release] commit on main to compare with");
  console.log("verify=");
  process.exit(0);
}

const changedPaths = (git(["diff", "--name-only", previousRelease, sha]) ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const scope = releaseBackendScope({
  changedPaths,
  convexImportedPaths: convexImportedPaths(),
  queriesBefore: git(["show", `${previousRelease}:convex/queries.ts`], true),
  queriesAfter: git(["show", `${sha}:convex/queries.ts`], true),
});

console.log(`backend=${scope.backendRequired ? "required" : "unchanged"}`);
for (const reason of scope.reasons.slice(0, 10))
  console.log(`reason=${reason}`);
console.log(`verify=${scope.verifyQueries.join(",")}`);
