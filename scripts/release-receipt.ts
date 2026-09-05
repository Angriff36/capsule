// PR13-06 / AC-030: release-receipt gatherer.
//
//   bun scripts/release-receipt.ts --sha <sha> --url <canonical> [--wait 480]
//
// Gathers the legs of the pure builder in src/lib/releaseReceipt.ts from the
// real world and writes .artifacts/release/receipt-<sha>.{json,md}:
//   - Vercel: `vercel inspect <canonical-url> --json` — the deployment the
//     alias resolves to, its readyState and commit sha (stale-alias check).
//   - Convex: expected deployment (owner map flag) vs the production
//     VITE_CONVEX_URL host label (pulled via `vercel env pull --environment
//     production` into a temp file that is deleted after the check — values
//     never reach the receipt), plus the deployed command-registry size from
//     the authenticated workflow probe vs convex/http.ts's COMMAND_DISPATCH
//     count in this integrated tree.
//   - Config: scripts/check-deployment-config.ts --json over the pulled env.
//   - Workflow: GET <canonical>/api/manifest/commands — 401 anonymous,
//     200 authenticated (CAPSULE_API_KEY; the deployed API-key gateway does
//     the Clerk exchange).
//
// Every leg degrades to "unverified" (receipt stays PARTIAL) when its
// credential/tool is absent — vercel CLI auth, VERCEL_TOKEN, CAPSULE_API_KEY,
// a linked project. Partial is the honest state; --strict turns it into
// exit 1 for CI-style use. scripts/release.sh runs this in report mode.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  buildReleaseReceipt,
  firstHostLabel,
  receiptHeadline,
  renderReleaseReceiptMarkdown,
  type ReleaseReceiptInput,
} from "../src/lib/releaseReceipt";
import type { DeploymentConfigReport } from "../src/lib/deploymentConfigCheck";

/** Owner deployment map (CLAUDE.md): capsule production Convex deployment. */
const DEFAULT_EXPECTED_DEPLOYMENT = "impartial-mule-193";
const COMMAND_DISPATCH_COUNT_PATTERN = /\bref: api\./g;
const NON_TERMINAL_READY_STATES = new Set([
  "QUEUED",
  "BUILDING",
  "INITIALIZING",
]);

interface Options {
  sha?: string;
  url?: string;
  expectedDeployment: string;
  waitSeconds: number;
  outDir: string;
  strict: boolean;
  json: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    expectedDeployment: DEFAULT_EXPECTED_DEPLOYMENT,
    waitSeconds: 0,
    outDir: ".artifacts/release",
    strict: false,
    json: false,
  };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error(`release-receipt: ${arg} needs a value`);
      }
      index += 1;
      return value;
    };
    switch (arg) {
      case "--sha":
        options.sha = next();
        break;
      case "--url":
        options.url = next();
        break;
      case "--expected-deployment":
        options.expectedDeployment = next();
        break;
      case "--wait":
        options.waitSeconds = Number(next());
        break;
      case "--out":
        options.outDir = next();
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`release-receipt: unknown argument ${arg}`);
    }
    index += 1;
  }
  if (Number.isNaN(options.waitSeconds) || options.waitSeconds < 0) {
    throw new Error("release-receipt: --wait needs a non-negative number");
  }
  options.url =
    options.url ?? (process.env.CAPSULE_RELEASE_URL?.trim() || undefined);
  return options;
}

/** Run a command, capture stdout, never throw (callers degrade to null). */
function run(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): { stdout: string; status: number | null } | null {
  // Windows: vercel is a .cmd shim that spawnSync cannot resolve without a
  // shell. Args here are sha/url/token shaped — no spaces or quotes — so
  // shell joining is safe for this use.
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    shell: process.platform === "win32",
  });
  if (result.error || result.stdout == null) return null;
  return { stdout: result.stdout, status: result.status };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function vercelInspect(
  url: string,
  waitSeconds: number,
): Promise<ReleaseReceiptInput["vercel"]["deployment"]> {
  const tokenArgs = process.env.VERCEL_TOKEN
    ? ["-t", process.env.VERCEL_TOKEN]
    : [];
  const inspect = () =>
    run("vercel", ["inspect", url, "--json", ...tokenArgs], 60_000);
  const parse = (stdout: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(stdout) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  let latest = inspect();
  const deadline = Date.now() + waitSeconds * 1000;
  while (latest && waitSeconds > 0) {
    const state = parse(latest.stdout)?.readyState;
    if (typeof state !== "string" || !NON_TERMINAL_READY_STATES.has(state)) {
      break;
    }
    if (Date.now() >= deadline) break;
    await sleep(20_000);
    latest = inspect();
  }
  if (!latest) return null;
  const parsed = parse(latest.stdout);
  if (!parsed) return null;
  const meta = (parsed.meta ?? {}) as Record<string, unknown>;
  const commitSha =
    typeof meta.gitCommitSha === "string"
      ? meta.gitCommitSha
      : typeof meta.githubCommitSha === "string"
        ? meta.githubCommitSha
        : null;
  return {
    uid: typeof parsed.uid === "string" ? parsed.uid : null,
    url: typeof parsed.url === "string" ? parsed.url : null,
    readyState:
      typeof parsed.readyState === "string" ? parsed.readyState : null,
    commitSha,
  };
}

async function probeCommandRegistry(canonicalUrl: string): Promise<{
  unauthenticatedStatus: number | null;
  authenticatedStatus: number | null;
  commandCount: number | null;
}> {
  const endpoint = `${canonicalUrl.replace(/\/$/, "")}/api/manifest/commands`;
  const unauthenticatedStatus = await fetch(endpoint)
    .then((response) => response.status)
    .catch(() => null);
  const apiKey = process.env.CAPSULE_API_KEY?.trim();
  if (!apiKey) {
    return {
      unauthenticatedStatus,
      authenticatedStatus: null,
      commandCount: null,
    };
  }
  let authenticatedStatus: number | null = null;
  let commandCount: number | null = null;
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    authenticatedStatus = response.status;
    if (response.ok) {
      const body = (await response.json()) as { commands?: unknown[] };
      if (Array.isArray(body.commands)) commandCount = body.commands.length;
    }
  } catch {
    // Network failure leaves the status null — the leg reports unverified.
  }
  return { unauthenticatedStatus, authenticatedStatus, commandCount };
}

/** KEY=VALUE subset reader (same contract as check-deployment-config.ts). */
function readEnvValue(path: string, name: string): string | null {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith(`${name}=`)) continue;
    return line
      .slice(name.length + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Config leg: pull the production env, run the PR12-01 checker over it,
 *  and read the frontend's Convex URL. Values stay in temp files/memory;
 *  only redacted codes and host labels reach the receipt. */
function gatherConfig(
  canonicalUrl: string | undefined,
  expectedDeployment: string,
  outDir: string,
): {
  config: ReleaseReceiptInput["config"];
  frontendDeployment: string | null;
} {
  if (!canonicalUrl) {
    return {
      config: { ok: null, blockerCount: 0, blockerCodes: [] },
      frontendDeployment: null,
    };
  }
  const envPath = `${outDir}/prod.env`;
  const tokenArgs = process.env.VERCEL_TOKEN
    ? ["-t", process.env.VERCEL_TOKEN]
    : [];
  const pulled = run(
    "vercel",
    ["env", "pull", envPath, "--environment", "production", "-y", ...tokenArgs],
    120_000,
  );
  if (!pulled || pulled.status !== 0) {
    return {
      config: { ok: null, blockerCount: 0, blockerCodes: [] },
      frontendDeployment: null,
    };
  }
  try {
    const frontendDeployment = firstHostLabel(
      readEnvValue(envPath, "VITE_CONVEX_URL") ?? "",
    );
    const checked = run(
      "bun",
      [
        "scripts/check-deployment-config.ts",
        "--environment",
        "production",
        "--env-file",
        envPath,
        "--site-url",
        canonicalUrl,
        "--expected-deployment",
        expectedDeployment,
        "--require",
        "VITE_CONVEX_URL,VITE_CLERK_PUBLISHABLE_KEY",
        "--json",
      ],
      60_000,
    );
    if (!checked) {
      return {
        config: { ok: null, blockerCount: 0, blockerCodes: [] },
        frontendDeployment,
      };
    }
    try {
      const report = JSON.parse(checked.stdout) as DeploymentConfigReport;
      const blockers = report.findings.filter(
        (finding) => finding.severity === "blocker",
      );
      return {
        config: {
          ok: report.ok,
          blockerCount: blockers.length,
          blockerCodes: blockers.map((finding) => finding.code),
        },
        frontendDeployment,
      };
    } catch {
      return {
        config: { ok: null, blockerCount: 0, blockerCodes: [] },
        frontendDeployment,
      };
    }
  } finally {
    rmSync(envPath, { force: true });
  }
}

function expectedCommandCount(): number | null {
  try {
    const http = readFileSync("convex/http.ts", "utf8");
    return http.match(COMMAND_DISPATCH_COUNT_PATTERN)?.length ?? null;
  } catch {
    return null;
  }
}

async function main(argv: readonly string[]): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`[release-receipt] ${(error as Error).message}`);
    return 2;
  }
  const integratedSha =
    options.sha?.trim() ||
    run("git", ["rev-parse", "HEAD"], 15_000)?.stdout.trim() ||
    null;

  const deployment = options.url
    ? await vercelInspect(options.url, options.waitSeconds)
    : null;
  const workflow = options.url
    ? await probeCommandRegistry(options.url)
    : {
        unauthenticatedStatus: null,
        authenticatedStatus: null,
        commandCount: null,
      };
  const { config, frontendDeployment } = gatherConfig(
    options.url,
    options.expectedDeployment,
    options.outDir,
  );

  const input: ReleaseReceiptInput = {
    integratedSha,
    gatheredAt: Date.now(),
    vercel: { canonicalUrl: options.url ?? null, deployment },
    convex: {
      expectedDeployment: options.expectedDeployment,
      frontendDeployment,
      functionsReachable: workflow.authenticatedStatus === 200 ? true : null,
      commandCount: workflow.commandCount,
      expectedCommandCount: expectedCommandCount(),
    },
    config,
    workflow,
  };

  const receipt = buildReleaseReceipt(input);
  mkdirSync(options.outDir, { recursive: true });
  const shortSha = (integratedSha ?? "unknown").slice(0, 10);
  writeFileSync(
    `${options.outDir}/receipt-${shortSha}.json`,
    JSON.stringify({ input, receipt }, null, 2),
  );
  writeFileSync(
    `${options.outDir}/receipt-${shortSha}.md`,
    renderReleaseReceiptMarkdown(receipt),
  );

  console.log(receiptHeadline(receipt));
  for (const [name, leg] of [
    ["vercel", receipt.vercel],
    ["convex", receipt.convex],
    ["config", receipt.config],
    ["workflow", receipt.workflow],
  ] as const) {
    console.log(`  ${name}: ${leg.state}${leg.code ? ` (${leg.code})` : ""}`);
    console.log(`    ${leg.detail}`);
  }
  console.log(`receipt: ${options.outDir}/receipt-${shortSha}.{json,md}`);
  if (options.json) console.log(JSON.stringify(receipt, null, 2));
  if (options.strict && receipt.status === "partial") return 1;
  return 0;
}

const exitCode = await main(process.argv.slice(2));
if (exitCode !== 0) process.exit(exitCode);
