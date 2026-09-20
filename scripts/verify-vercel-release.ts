// Used by scripts/deploy-production.sh: prove that Vercel's PRODUCTION
// deployment for one release commit is READY and is what the production
// address serves.
//
//   bun scripts/verify-vercel-release.ts --sha <release sha> [--wait 900]
//
// Read-only. Uses the signed-in Vercel CLI (or VERCEL_TOKEN), the same way
// scripts/vercelInspectDeployment.ts does:
//   1. `vercel ls capsule --prod -m githubCommitSha=<sha>` finds the deployment
//      Vercel built FOR that commit (the CLI's inspect JSON often omits the sha).
//   2. `vercel inspect` waits for it to leave QUEUED/BUILDING; it must be READY.
//   3. The production address must serve that same deployment.
// Exit 0 only when all three hold.
import { spawnSync } from "node:child_process";
import { inspectVercelDeployment } from "./vercelInspectDeployment";

const PROJECT = "capsule";
const PRODUCTION_URL =
  process.env.CAPSULE_RELEASE_URL?.trim() ||
  "https://capsule-tau-eight.vercel.app";

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const sha = option("--sha") ?? "";
const waitSeconds = Number(option("--wait") ?? "900");
if (!/^[0-9a-f]{40}$/.test(sha) || !Number.isFinite(waitSeconds)) {
  console.error(
    "verify-vercel-release: --sha <full 40-character sha> [--wait <seconds>]",
  );
  process.exit(2);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The deployment URL Vercel lists for this commit, or null when none yet. */
function deploymentUrlForSha(): string | null {
  const tokenArgs = process.env.VERCEL_TOKEN
    ? ["-t", process.env.VERCEL_TOKEN]
    : [];
  const result = spawnSync(
    "vercel",
    ["ls", PROJECT, "--prod", "-m", `githubCommitSha=${sha}`, ...tokenArgs],
    { encoding: "utf8", timeout: 60_000, shell: process.platform === "win32" },
  );
  if (result.error || result.status !== 0) return null;
  const urls = result.stdout.match(/https:\/\/[^\s]+\.vercel\.app/g);
  return urls?.[0] ?? null;
}

const deadline = Date.now() + waitSeconds * 1000;
let url = deploymentUrlForSha();
while (!url && Date.now() < deadline) {
  await sleep(20_000);
  url = deploymentUrlForSha();
}
if (!url) {
  console.error(
    `verify-vercel-release: FAIL - Vercel lists no production deployment for ${sha}. Is the Vercel CLI signed in (vercel whoami)?`,
  );
  process.exit(1);
}

const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
const deployment = await inspectVercelDeployment(url, remaining, null);
if (deployment?.readyState !== "READY") {
  console.error(
    `verify-vercel-release: FAIL - ${url} is ${deployment?.readyState ?? "unreadable"}, not READY`,
  );
  process.exit(1);
}

// The alias moves a moment after READY.
let live = await inspectVercelDeployment(PRODUCTION_URL, 0, null);
while (live?.uid !== deployment.uid && Date.now() < deadline) {
  await sleep(10_000);
  live = await inspectVercelDeployment(PRODUCTION_URL, 0, null);
}
if (!deployment.uid || live?.uid !== deployment.uid) {
  console.error(
    `verify-vercel-release: FAIL - ${PRODUCTION_URL} serves ${live?.uid ?? "an unreadable deployment"}, not ${deployment.uid} (${sha})`,
  );
  process.exit(1);
}
console.log(
  `verify-vercel-release: ok - ${deployment.uid} READY for ${sha}, live at ${PRODUCTION_URL}`,
);
