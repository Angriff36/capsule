// PL-STALE-ASSETS (AC-166): which Capsule this page is, and which Capsule is
// live now. Every build writes <site>/version.json (vite.config.ts) and bakes
// the same commit into the page, so an open tab can see it is older.

/** The commit this page was built from; null for a local build. */
export const RUNNING_BUILD: string | null = __CAPSULE_BUILD__;

export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/**
 * The commit the site serves now, or null when it cannot be read (offline,
 * or a host that answers with the page instead of the file). Null never
 * means "up to date": the page then makes no claim either way.
 */
export async function fetchLiveBuild(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(`/version.json?at=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { commit?: unknown };
    return typeof body.commit === "string" && body.commit !== ""
      ? body.commit
      : null;
  } catch {
    return null;
  }
}

/** The live commit when it differs from this page's commit, else null. */
export function newerBuild(
  running: string | null,
  live: string | null,
): string | null {
  return running && live && live !== running ? live : null;
}

/**
 * A screen's code file could not load. After a new version goes live the old
 * page asks for files that no longer exist; browsers word it differently.
 */
export function isMissingCodeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  );
}
