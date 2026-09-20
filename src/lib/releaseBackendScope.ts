/**
 * Does a release need the self-hosted Convex backend deploy, and which new
 * queries can the deploy verify? Pure: scripts/release-backend-scope.ts feeds
 * it the git and file facts; scripts/deploy-production.sh reads the answer.
 *
 * The rule is the documented one (AGENTS.md, deploy section): a release that
 * changes `.manifest` files, `convex/`, or generated Convex files needs the
 * backend deploy. The Convex bundle also reads files outside `convex/`:
 * `convex.json`, the dependency pins, and every `src/` module that `convex/`
 * code imports. A change there changes the deployed backend too, so it counts.
 * A false "required" costs one idempotent deploy; a false "unchanged" leaves
 * production screens ahead of the backend.
 */

const ALWAYS_BACKEND = [
  /\.manifest$/,
  /^convex\//,
  /^convex\.json$/,
  /^package\.json$/,
  /^bun\.lock$/,
];

export interface BackendScopeInput {
  /** Repo-relative paths (forward slashes) the release changed. */
  changedPaths: readonly string[];
  /** Repo-relative files outside `convex/` that `convex/` code imports, closure included. */
  convexImportedPaths: readonly string[];
  /** `convex/queries.ts` at the release's first parent; null when absent. */
  queriesBefore: string | null;
  /** `convex/queries.ts` at the release commit; null when absent. */
  queriesAfter: string | null;
}

export interface BackendScope {
  backendRequired: boolean;
  /** The changed paths that make the backend deploy necessary (max 10 shown by callers). */
  reasons: string[];
  /** New zero-argument `list*` queries in `queries:`, for `deploy-backend.sh --verify`. */
  verifyQueries: string[];
}

/**
 * Zero-argument generated list queries: `export const listX = query({ args: {},`.
 * Only these are safe to probe with no sign-in and no payload: a denied read
 * answers `[]`. A query with arguments needs a payload no script can invent.
 */
export function zeroArgListQueries(source: string | null): string[] {
  if (!source) return [];
  const names: string[] = [];
  const pattern =
    /^export const (list[A-Za-z0-9_]*) = query\(\{\s*args: \{\},/gm;
  for (const match of source.matchAll(pattern)) names.push(match[1]);
  return names;
}

export function releaseBackendScope(input: BackendScopeInput): BackendScope {
  const imported = new Set(input.convexImportedPaths);
  const reasons = input.changedPaths.filter(
    (path) =>
      ALWAYS_BACKEND.some((rule) => rule.test(path)) || imported.has(path),
  );
  const before = new Set(zeroArgListQueries(input.queriesBefore));
  const verifyQueries = zeroArgListQueries(input.queriesAfter).filter(
    (name) => !before.has(name),
  );
  return {
    backendRequired: reasons.length > 0,
    reasons,
    verifyQueries: reasons.length > 0 ? verifyQueries : [],
  };
}
