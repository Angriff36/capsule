// Used by scripts/deploy-production.sh: prove that the production address
// serves the Vercel build OF one release commit.
//
//   bun scripts/verify-vercel-release.ts --sha <release sha> [--wait 900] [--url <site>]
//
// Read-only, no Vercel credential. Every build writes <site>/version.json with
// its commit (vite.config.ts, plugin capsule-version-json, from
// VERCEL_GIT_COMMIT_SHA). This script reads that file until `commit` equals the
// release sha. Vercel moves the production address only to a READY production
// deployment, so a match proves: built, READY, live, and built FROM that commit.
// A failed or stale deployment never matches and ends in a FAIL at the deadline.
// Exit 0 only on a match.
const option = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const sha = option("--sha") ?? "";
const waitSeconds = Number(option("--wait") ?? "900");
const site = (
  option("--url") ??
  process.env.CAPSULE_RELEASE_URL?.trim() ??
  "https://capsule-tau-eight.vercel.app"
).replace(/\/+$/, "");
if (!/^[0-9a-f]{40}$/.test(sha) || !Number.isFinite(waitSeconds)) {
  console.error(
    "verify-vercel-release: --sha <full 40-character sha> [--wait <seconds>] [--url <site>]",
  );
  process.exit(2);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** What the site serves now: a commit, or a short reason why none was read. */
async function liveCommit(): Promise<{ commit: string | null; note: string }> {
  try {
    const response = await fetch(`${site}/version.json?sha=${sha}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return { commit: null, note: `HTTP ${response.status}` };
    const body: unknown = await response.json();
    const commit =
      body && typeof body === "object" && "commit" in body
        ? (body as { commit: unknown }).commit
        : null;
    return typeof commit === "string"
      ? { commit, note: `commit ${commit}` }
      : { commit: null, note: "version.json has no commit" };
  } catch (error) {
    return {
      commit: null,
      note: error instanceof Error ? error.message : "unreadable",
    };
  }
}

const deadline = Date.now() + waitSeconds * 1000;
let live = await liveCommit();
while (live.commit !== sha && Date.now() < deadline) {
  await sleep(15_000);
  live = await liveCommit();
}
if (live.commit !== sha) {
  console.error(
    `verify-vercel-release: FAIL - ${site}/version.json does not serve ${sha} (last answer: ${live.note}). The Vercel build for that commit failed, is not finished, or did not start.`,
  );
  process.exit(1);
}
console.log(`verify-vercel-release: ok - ${site} serves the build of ${sha}`);
