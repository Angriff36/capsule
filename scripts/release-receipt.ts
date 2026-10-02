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
//     never reach the receipt), plus the release sha that backend's
//     deploymentProbe:health reports, and (when it is an earlier release)
//     `scripts/release-backend-scope.ts --since` for backend changes since.
//   - Config: scripts/check-deployment-config.ts --json over the pulled env.
//   - Workflow: GET <canonical>/api/manifest/commands — 401 anonymous,
//     200 authenticated (CAPSULE_API_KEY; the deployed API-key gateway does
//     the Clerk exchange) — then the real product step CAPSULE_RELEASE_WORKFLOW
//     names, as JSON {"entity":"…","command":"…","body":{…}}, POSTed through
//     the same gateway with idempotencyKey release-receipt-<sha>.
//
// Every leg degrades to "unverified" (receipt stays PARTIAL) when its
// credential/tool is absent — vercel CLI auth, VERCEL_TOKEN, CAPSULE_API_KEY,
// CAPSULE_RELEASE_WORKFLOW, a linked project. Partial is the honest state;
// --strict turns it into exit 1 for CI-style use. scripts/deploy-production.sh
// runs this in report mode after the backend deploy (scripts/release.sh runs
// it itself only when it is used alone).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  buildReleaseReceipt,
  firstHostLabel,
  receiptHeadline,
  renderReleaseReceiptMarkdown,
  type ReleaseReceiptInput,
} from "../src/lib/releaseReceipt";
import type { DeploymentConfigReport } from "../src/lib/deploymentConfigCheck";
import { inspectVercelDeployment } from "./vercelInspectDeployment";

/** Owner deployment map (CLAUDE.md): production Convex is self-hosted on the
 *  box pop-os (https://pop-os.<tailnet>.ts.net); impartial-mule-193 is only
 *  the Cloud fallback. */
const DEFAULT_EXPECTED_DEPLOYMENT = "pop-os";
const IDENTITY_QUERY = "deploymentProbe:health";
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
  const localVercel = command === "vercel";
  const executable = localVercel ? "node" : command;
  const commandArgs = localVercel
    ? [createRequire(import.meta.url).resolve("vercel/dist/vc.js"), ...args]
    : [...args];
  const result = spawnSync(executable, commandArgs, {
    encoding: "utf8",
    timeout: timeoutMs,
    shell: false,
  });
  if (result.error || result.stdout == null) return null;
  return { stdout: result.stdout, status: result.status };
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

/** The real product step: one command named by CAPSULE_RELEASE_WORKFLOW,
 *  through the deployed gateway with production credentials. */
async function runProductStep(
  canonicalUrl: string,
  integratedSha: string | null,
): Promise<ReleaseReceiptInput["workflow"]["productStep"]> {
  const apiKey = process.env.CAPSULE_API_KEY?.trim();
  const raw = process.env.CAPSULE_RELEASE_WORKFLOW?.trim();
  if (!apiKey || !raw) return null;
  let step: { entity?: unknown; command?: unknown; body?: unknown };
  try {
    step = JSON.parse(raw) as typeof step;
  } catch {
    return null;
  }
  if (
    typeof step.entity !== "string" ||
    typeof step.command !== "string" ||
    !/^[A-Za-z0-9_]+$/.test(step.entity) ||
    !/^[A-Za-z0-9_]+$/.test(step.command)
  ) {
    return null;
  }
  const body =
    step.body && typeof step.body === "object" && !Array.isArray(step.body)
      ? (step.body as Record<string, unknown>)
      : {};
  const name = `${step.entity}.${step.command}`;
  try {
    const response = await fetch(
      `${canonicalUrl.replace(/\/$/, "")}/api/manifest/${step.entity}/commands/${step.command}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: `release-receipt-${integratedSha ?? "unknown"}`,
          ...body,
        }),
      },
    );
    const answer = (await response.json().catch(() => null)) as {
      data?: unknown;
    } | null;
    return {
      name,
      status: response.status,
      succeeded: answer !== null && "data" in answer,
    };
  } catch {
    return { name, status: null, succeeded: false };
  }
}

/** releaseSha the backend reports; "unreleased" when it answers without one
 *  (a backend deployed before the stamp existed); null when it does not answer. */
async function probeBackendRelease(
  convexUrl: string | null,
): Promise<string | null> {
  if (!convexUrl) return null;
  try {
    const response = await fetch(`${convexUrl.replace(/\/$/, "")}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: IDENTITY_QUERY, args: {}, format: "json" }),
    });
    const answer = (await response.json()) as {
      status?: string;
      value?: { releaseSha?: unknown };
    };
    if (answer.status !== "success") return null;
    const sha = answer.value?.releaseSha;
    return typeof sha === "string" ? sha : "unreleased";
  } catch {
    return null;
  }
}

/** Backend-changing paths between the deployed release and this one, from
 *  the same rule the deploy uses; null when it cannot be computed (working
 *  tree not at the integrated sha, unknown commit). */
function backendChangesSince(
  integratedSha: string | null,
  deployedSha: string | null,
): string[] | null {
  const sha40 = /^[0-9a-f]{40}$/i;
  if (!integratedSha || !deployedSha) return null;
  if (!sha40.test(integratedSha) || !sha40.test(deployedSha)) return null;
  if (integratedSha.toLowerCase() === deployedSha.toLowerCase()) return [];
  const scope = run(
    "bun",
    [
      "scripts/release-backend-scope.ts",
      "--sha",
      integratedSha,
      "--since",
      deployedSha,
    ],
    60_000,
  );
  if (!scope || scope.status !== 0) return null;
  const lines = scope.stdout.split(/\r?\n/);
  if (lines.includes("backend=unchanged")) return [];
  if (!lines.includes("backend=required")) return null;
  return lines
    .filter((line) => line.startsWith("reason="))
    .map((line) => line.slice("reason=".length));
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
  /** Production VITE_CONVEX_URL: the backend the shipped frontend calls. */
  convexUrl: string | null;
} {
  if (!canonicalUrl) {
    return {
      config: { ok: null, blockerCount: 0, blockerCodes: [] },
      convexUrl: null,
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
      convexUrl: null,
    };
  }
  try {
    const convexUrl = readEnvValue(envPath, "VITE_CONVEX_URL");
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
        convexUrl,
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
        convexUrl,
      };
    } catch {
      return {
        config: { ok: null, blockerCount: 0, blockerCodes: [] },
        convexUrl,
      };
    }
  } finally {
    rmSync(envPath, { force: true });
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
    ? await inspectVercelDeployment(
        options.url,
        options.waitSeconds,
        integratedSha,
      )
    : null;
  const workflow: ReleaseReceiptInput["workflow"] = options.url
    ? {
        ...(await probeCommandRegistry(options.url)),
        productStep: await runProductStep(options.url, integratedSha),
      }
    : {
        unauthenticatedStatus: null,
        authenticatedStatus: null,
        commandCount: null,
        productStep: null,
      };
  const { config, convexUrl } = gatherConfig(
    options.url,
    options.expectedDeployment,
    options.outDir,
  );
  const backendReleaseSha = await probeBackendRelease(convexUrl);

  const input: ReleaseReceiptInput = {
    integratedSha,
    gatheredAt: Date.now(),
    vercel: { canonicalUrl: options.url ?? null, deployment },
    convex: {
      expectedDeployment: options.expectedDeployment,
      frontendDeployment: convexUrl ? firstHostLabel(convexUrl) : null,
      backendReleaseSha,
      backendChangesSinceDeployed: backendChangesSince(
        integratedSha,
        backendReleaseSha,
      ),
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
