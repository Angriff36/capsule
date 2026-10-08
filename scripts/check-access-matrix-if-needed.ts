// Runs the tenant access matrix (tests/proofs/tenant-access-matrix.*) only
// when a sign-in or access rule changed since the release base, so it does
// not cost every release gate several minutes. Part of `bun run check`.
//
//   bun scripts/check-access-matrix-if-needed.ts [--dry-run] [--base <ref>] [--head <ref>]
//
// Base: `git merge-base origin/main HEAD` (in a release that is origin/main,
// the commit the release merges onto). Without --head the change set is the
// base against the working tree plus untracked files; with --head it is the
// committed range base..head only. CAPSULE_ACCESS_MATRIX=1 forces a run.
// --dry-run prints the decision and runs nothing.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const option = (name: string) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};

function git(args: string[]): string | null {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

/** Rule a: files whose change is a sign-in or access change on its own. */
const ACCESS_FILES = new Set([
  "convex/lib/authContext.ts",
  "convex/search.ts",
  "convex/lib/ownWorkspaceLinks.ts",
  "convex/lib/serverOnlyStep.ts",
  "scripts/apply-own-workspace-links.ts",
]);
function isAccessFile(path: string): boolean {
  return (
    ACCESS_FILES.has(path) ||
    path.startsWith("convex/auth") ||
    (path.startsWith("src/") && /role|permission|auth/i.test(path))
  );
}

/** Rule b: words in a changed .manifest line under src/. */
const MANIFEST_WORDS = [
  "policy",
  "roleAllows",
  "checkRole",
  "private command",
  "user.role",
  // Role grants and role sets (e.g. `allow financeAccess` in
  // src/foundation/base.manifest) change who may read or write.
  "allow ",
  "Access",
  "role",
];
/** Rule c: text in a changed line of a convex .ts file (generated rules count). */
const CONVEX_WORDS = [
  "canRead(",
  "checkRole(",
  "__allowsRead(",
  "getAuthContext(",
  "tenantId !==",
  "tenantId ===",
  "assertOwnWorkspaceLinks",
  "assertServerOnlyStep",
  // Tenant scoping (e.g. `.eq("tenantId", tenantId)`), role tables and role
  // sets (ROLE_READS, ROLE_PERMISSIONS, EQUIPMENT_ROLES) and capability names.
  "tenantId",
  "ROLE",
  'Access"',
  "role",
];
/** Rule c also: a changed line that names a role, as role sets list them. */
const ROLE_NAME =
  /"(owner|admin|system|manager|staff|driver|[a-z]+(_[a-z]+)*_(manager|staff|lead|chef|cook))"|^\s*(owner|admin|system|manager|staff|driver|[a-z]+_manager)\s*:/;

/** Rule d: the matrix itself. */
function isMatrixFile(path: string): boolean {
  return path.startsWith("tests/proofs/tenant-access-matrix.");
}

const matrixFiles = readdirSync(join(root, "tests/proofs"))
  .filter((name) => /^tenant-access-matrix\..*\.test\.ts$/.test(name))
  .sort()
  .map((name) => `tests/proofs/${name}`);

function decide(): { run: boolean; why: string[]; base: string } {
  if (process.env.CAPSULE_ACCESS_MATRIX === "1")
    return { run: true, why: ["rule e: CAPSULE_ACCESS_MATRIX=1"], base: "" };
  const head = option("--head");
  const base =
    option("--base") ??
    git(["merge-base", "origin/main", head ?? "HEAD"])?.trim() ??
    "";
  const baseSha = base
    ? git(["rev-parse", "--verify", `${base}^{commit}`])
    : null;
  if (!baseSha)
    return {
      run: true,
      why: ["no release base (origin/main is missing), so run to be safe"],
      base,
    };
  const range = head ? [baseSha.trim(), head] : [baseSha.trim()];
  const changed = new Set(
    (git(["diff", "--name-only", "--no-renames", ...range]) ?? "")
      .split("\n")
      .filter(Boolean),
  );
  // Changed lines per file: removed and added lines of the diff.
  const lines: { path: string; text: string }[] = [];
  const diff =
    git([
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--no-renames",
      ...range,
      "--",
      "src",
      "convex",
    ]) ?? "";
  let minus = "";
  let plus = "";
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) inHeader = true;
    else if (line.startsWith("@@")) inHeader = false;
    else if (inHeader && line.startsWith("--- "))
      minus = line.slice(4).replace(/^a\//, "");
    else if (inHeader && line.startsWith("+++ "))
      plus = line.slice(4).replace(/^b\//, "");
    else if (!inHeader && (line.startsWith("+") || line.startsWith("-")))
      lines.push({
        path: plus === "/dev/null" ? minus : plus,
        text: line.slice(1),
      });
  }
  if (!head) {
    // New files not yet added to git: every line of them is added.
    for (const path of (
      git(["ls-files", "--others", "--exclude-standard"]) ?? ""
    )
      .split("\n")
      .filter(Boolean)) {
      changed.add(path);
      if (!/^(src|convex)\//.test(path)) continue;
      if (!/\.(ts|manifest)$/.test(path)) continue;
      for (const text of readFileSync(join(root, path), "utf8").split("\n"))
        lines.push({ path, text });
    }
  }
  const why: string[] = [];
  const first = (items: string[]) =>
    items.slice(0, 5).join(" | ") +
    (items.length > 5 ? ` | and ${items.length - 5} more` : "");
  const files = [...changed].sort();
  const a = files.filter(isAccessFile);
  if (a.length)
    why.push(`rule a (sign-in or access file changed): ${first(a)}`);
  const b = lines
    .filter(
      (l) =>
        l.path.startsWith("src/") &&
        l.path.endsWith(".manifest") &&
        MANIFEST_WORDS.some((w) => l.text.includes(w)),
    )
    .map((l) => `${l.path}: ${l.text.trim().slice(0, 100)}`);
  if (b.length) why.push(`rule b (manifest access line changed): ${first(b)}`);
  const c: string[] = lines
    .filter(
      (l) =>
        l.path.startsWith("convex/") &&
        !l.path.startsWith("convex/_generated/") &&
        l.path.endsWith(".ts") &&
        (CONVEX_WORDS.some((w) => l.text.includes(w)) ||
          ROLE_NAME.test(l.text)),
    )
    .map((l) => `${l.path}: ${l.text.trim().slice(0, 100)}`);
  // Role tables and role sets also live in src/ (generated ROLE_PERMISSIONS,
  // screen role lists): a changed line there that names a role or a role
  // table is an access change too.
  c.push(
    ...lines
      .filter(
        (l) =>
          l.path.startsWith("src/") &&
          /\.tsx?$/.test(l.path) &&
          (/ROLE/.test(l.text) || ROLE_NAME.test(l.text)),
      )
      .map((l) => `${l.path}: ${l.text.trim().slice(0, 100)}`),
  );
  if (c.length) why.push(`rule c (convex access line changed): ${first(c)}`);
  const d = files.filter(isMatrixFile);
  if (d.length) why.push(`rule d (matrix or its ledger changed): ${first(d)}`);
  return { run: why.length > 0, why, base: baseSha.trim() };
}

const decision = decide();
const short = decision.base.slice(0, 9);
if (!decision.run) {
  console.log(
    `access matrix skipped: no sign-in or access change since ${short}`,
  );
  process.exit(0);
}
console.log(
  `access matrix: running${short ? ` (changes since ${short})` : ""} because`,
);
for (const reason of decision.why) console.log(`  ${reason}`);
if (matrixFiles.length === 0) {
  console.error(
    "access matrix: no tests/proofs/tenant-access-matrix.*.test.ts files found",
  );
  process.exit(1);
}
if (dryRun) {
  console.log(`access matrix: dry run, would run ${matrixFiles.length} files`);
  process.exit(0);
}
const result = spawnSync("bun", ["run", "test", ...matrixFiles], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, CAPSULE_ACCESS_MATRIX: "1" },
});
process.exit(result.status ?? 1);
