import { spawnSync } from "node:child_process";
import {
  vercelDeploymentCommitSha,
  vercelDeploymentUid,
  vercelDeploymentUrl,
  vercelReadyState,
} from "../src/lib/vercelInspectParse";
import type { ReleaseReceiptInput } from "../src/lib/releaseReceipt";

const NON_TERMINAL = new Set(["QUEUED", "BUILDING", "INITIALIZING"]);

export type InspectedDeployment = ReleaseReceiptInput["vercel"]["deployment"];

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): { stdout: string; status: number } | null {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    shell: process.platform === "win32",
  });
  if (result.error || result.stdout == null) return null;
  return { stdout: result.stdout, status: result.status ?? 1 };
}

function parseJson(stdout: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fromPayload(payload: Record<string, unknown>): InspectedDeployment {
  return {
    uid: vercelDeploymentUid(payload),
    url: vercelDeploymentUrl(payload),
    readyState: vercelReadyState(payload),
    commitSha: vercelDeploymentCommitSha(payload),
  };
}

async function apiDeployment(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) return null;
  try {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function shaMatches(actual: string | null, wanted: string | null): boolean {
  return (
    typeof actual === "string" &&
    typeof wanted === "string" &&
    actual.toLowerCase() === wanted.toLowerCase()
  );
}

/** Inspect the alias, fill SHA from CLI or Deployment API, and keep waiting
 *  for the requested SHA instead of stopping at the first stale READY. */
export async function inspectVercelDeployment(
  url: string,
  waitSeconds: number,
  wantedSha: string | null,
): Promise<InspectedDeployment> {
  const tokenArgs = process.env.VERCEL_TOKEN
    ? ["-t", process.env.VERCEL_TOKEN]
    : [];
  const inspect = () =>
    run("vercel", ["inspect", url, "--json", ...tokenArgs], 60_000);

  const read = async (): Promise<InspectedDeployment> => {
    const latest = inspect();
    if (!latest) return null;
    const parsed = parseJson(latest.stdout);
    if (!parsed) return null;
    let snapshot = fromPayload(parsed);
    if (snapshot && !snapshot.commitSha && snapshot.uid) {
      const api = await apiDeployment(snapshot.uid);
      if (api) {
        snapshot = {
          ...snapshot,
          commitSha: vercelDeploymentCommitSha(api) ?? snapshot.commitSha,
          url: snapshot.url ?? vercelDeploymentUrl(api),
          readyState: snapshot.readyState ?? vercelReadyState(api),
        };
      }
    }
    return snapshot;
  };

  let snapshot = await read();
  const deadline = Date.now() + waitSeconds * 1000;
  while (snapshot && waitSeconds > 0 && Date.now() < deadline) {
    const state = snapshot.readyState ?? "";
    const building = NON_TERMINAL.has(state);
    const waitingForSha =
      state === "READY" &&
      wantedSha != null &&
      !shaMatches(snapshot.commitSha, wantedSha);
    if (!building && !waitingForSha) break;
    await sleep(20_000);
    snapshot = (await read()) ?? snapshot;
  }
  return snapshot;
}
