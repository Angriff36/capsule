// PR13-06 / AC-030: the release receipt.
//
// Pure module — no I/O, no environment access. Callers feed it a snapshot:
//   - scripts/release-receipt.ts (gatherer: vercel inspect, HTTP probes,
//     the PR12-01 config checker, git)
//   - tests/release-receipt.test.ts (the AC-030 gate)
//
// Semantics (specs/ralph/production-13-release-recovery.md PR13-06): the
// receipt ties the EXACT integrated SHA to the canonical Vercel URL, a READY
// deployment, matching Convex code/schema, configuration checks, and a
// successful authenticated production workflow. Any leg that is not proven
// keeps the receipt PARTIAL — a stale alias or backend is never called
// shipped. "Unverified" (could not be checked from this context) is NOT
// success; it is partial, with a code that names what was missing.
//
// Evidence chain for "matching Convex code/schema" (#382): production Convex
// is SELF-HOSTED and the Vercel build is UI-only, so a READY build proves
// nothing about the backend. scripts/deploy-backend.sh stamps the release sha
// into the deployed code (convex/lib/backendRelease.ts), and
// deploymentProbe:health reports it. The leg is verified only when the backend
// the shipped frontend calls names the integrated SHA, or names an earlier
// release with NO backend change (code, schema, manifests, convex imports)
// between that release and the integrated SHA. A same-size but older backend
// is stale; a hand-deployed backend ("unreleased") is never called shipped.
// Convex deploys functions and schema together, so the code identity is the
// schema identity.

/** Deployment states Vercel reports; only READY counts as shipped. */
export const VERCEL_READY_STATE = "READY";

export type ReceiptLegState = "verified" | "failed" | "unverified";

export interface ReceiptLeg {
  state: ReceiptLegState;
  /** Stable machine code (`vercel:not_ready`); "" when verified. */
  code: string;
  /** Names the evidence (verified) or exactly what is missing. */
  detail: string;
}

export interface ReleaseReceiptInput {
  /** The commit main was pushed to for this release (40-hex). */
  integratedSha: string | null;
  /** Epoch ms the snapshot was gathered. */
  gatheredAt: number;
  /** Canonical production origin, e.g. https://capsule.example.com. */
  vercel: {
    canonicalUrl: string | null;
    /** Deployment the canonical URL currently resolves to
     *  (`vercel inspect <url> --json`), or null when the inspect could not
     *  run (no CLI auth, network, unknown URL). */
    deployment: {
      uid: string | null;
      url: string | null;
      /** READY | BUILDING | QUEUED | ERROR | CANCELED | INITIALIZING. */
      readyState: string | null;
      /** meta.gitCommitSha of the inspected deployment, when Vercel has it. */
      commitSha: string | null;
    } | null;
  };
  convex: {
    /** Convex deployment this release targets (owner deployment map). */
    expectedDeployment: string | null;
    /** Host label of the production VITE_CONVEX_URL (the backend the shipped
     *  frontend actually calls), when it could be read. */
    frontendDeployment: string | null;
    /** releaseSha that deploymentProbe:health on that backend reported
     *  ("unreleased" for a hand deploy); null when it could not be read. */
    backendReleaseSha: string | null;
    /** Backend-changing paths between backendReleaseSha and the integrated
     *  SHA (scripts/release-backend-scope.ts --since); [] = none; null when
     *  not computed. Ignored when the two SHAs are equal. */
    backendChangesSinceDeployed: readonly string[] | null;
  };
  config: {
    /** PR12-01 DeploymentConfigReport.ok for the production environment. */
    ok: boolean | null;
    /** Blocker findings count (codes, never values, in the report). */
    blockerCount: number;
    /** Blocker codes for the receipt detail (already redacted upstream). */
    blockerCodes: readonly string[];
  };
  workflow: {
    /** HTTP status of GET /api/manifest/commands WITHOUT credentials. */
    unauthenticatedStatus: number | null;
    /** HTTP status of the same GET WITH production credentials. */
    authenticatedStatus: number | null;
    /** Command count parsed from the authenticated response body. */
    commandCount: number | null;
    /** The real product step run through the command API with production
     *  credentials (CAPSULE_RELEASE_WORKFLOW names it); null when none is
     *  configured or it could not run. */
    productStep: {
      /** "Entity.command". */
      name: string;
      status: number | null;
      /** True when the answer carried the command's `data` result. */
      succeeded: boolean;
    } | null;
  };
}

export interface ReleaseReceipt {
  integratedSha: string | null;
  gatheredAt: number;
  /** "complete" ONLY when every leg is verified. */
  status: "complete" | "partial";
  vercel: ReceiptLeg;
  convex: ReceiptLeg;
  config: ReceiptLeg;
  workflow: ReceiptLeg;
  /** Every non-empty leg code plus root codes; [] when complete. */
  codes: string[];
}

function verified(detail: string): ReceiptLeg {
  return { state: "verified", code: "", detail };
}

function failed(code: string, detail: string): ReceiptLeg {
  return { state: "failed", code, detail };
}

function unverified(code: string, detail: string): ReceiptLeg {
  return { state: "unverified", code, detail };
}

function isSha(value: string | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

/** First hostname label ("impartial-mule-193" of the deployment URL). */
export function firstHostLabel(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function evaluateVercel(input: ReleaseReceiptInput): ReceiptLeg {
  const { vercel } = input;
  const sha = input.integratedSha;
  if (!vercel.canonicalUrl) {
    return unverified(
      "vercel:canonical_url_unknown",
      "The canonical production URL is not configured for this release (pass --url / CAPSULE_RELEASE_URL).",
    );
  }
  const deployment = vercel.deployment;
  if (!deployment) {
    return unverified(
      "vercel:deployment_unverifiable",
      `The deployment serving ${vercel.canonicalUrl} could not be inspected (Vercel CLI auth, network, or the URL does not resolve).`,
    );
  }
  if (deployment.readyState !== VERCEL_READY_STATE) {
    return failed(
      "vercel:not_ready",
      `The deployment serving ${vercel.canonicalUrl} is ${deployment.readyState ?? "in an unknown state"}, not READY.`,
    );
  }
  if (deployment.commitSha === null) {
    return unverified(
      "vercel:sha_unverifiable",
      `The deployment ${deployment.url ?? deployment.uid ?? "?"} is READY but Vercel reported no commit sha for it, so it cannot be tied to the integrated SHA.`,
    );
  }
  if (!isSha(sha)) {
    return unverified(
      "vercel:integrated_sha_unknown",
      "The integrated SHA is missing, so the READY deployment cannot be tied to this release.",
    );
  }
  if (deployment.commitSha.toLowerCase() !== sha.toLowerCase()) {
    return failed(
      "vercel:stale_alias",
      `${vercel.canonicalUrl} serves ${deployment.commitSha} but this release integrated ${sha}; the canonical URL is a stale alias and this release is NOT shipped there.`,
    );
  }
  return verified(
    `${vercel.canonicalUrl} serves the READY deployment ${deployment.url ?? deployment.uid ?? "?"} built from ${sha}.`,
  );
}

function evaluateConvex(input: ReleaseReceiptInput): ReceiptLeg {
  const { convex } = input;
  if (!convex.expectedDeployment) {
    return unverified(
      "convex:deployment_unknown",
      "The target Convex deployment for this release is not configured (--expected-deployment / owner deployment map).",
    );
  }
  if (convex.frontendDeployment === null) {
    return unverified(
      "convex:frontend_deployment_unverifiable",
      "The production VITE_CONVEX_URL could not be read, so the backend the shipped frontend calls is unknown.",
    );
  }
  if (convex.frontendDeployment !== convex.expectedDeployment) {
    return failed(
      "convex:deployment_mismatch",
      `The shipped frontend points at Convex deployment "${convex.frontendDeployment}" but this release targets "${convex.expectedDeployment}".`,
    );
  }
  const deployed = convex.backendReleaseSha;
  if (deployed === null) {
    return unverified(
      "convex:backend_identity_unverifiable",
      `The ${convex.expectedDeployment} backend did not say which release its code came from (deploymentProbe:health did not answer).`,
    );
  }
  if (!isSha(deployed)) {
    return failed(
      "convex:backend_not_released",
      `The ${convex.expectedDeployment} backend runs code that was not deployed by the release path (it reports "${deployed}"), so its code and schema are unknown.`,
    );
  }
  const sha = input.integratedSha;
  if (!isSha(sha)) {
    return unverified(
      "convex:integrated_sha_unknown",
      `The ${convex.expectedDeployment} backend runs ${deployed}, but the integrated SHA is missing.`,
    );
  }
  if (deployed.toLowerCase() === sha.toLowerCase()) {
    return verified(
      `Frontend points at ${convex.expectedDeployment}; its backend code and schema were deployed from ${sha}.`,
    );
  }
  const changes = convex.backendChangesSinceDeployed;
  if (changes === null) {
    return unverified(
      "convex:backend_lineage_unverifiable",
      `The ${convex.expectedDeployment} backend runs ${deployed}, not ${sha}, and the backend changes between them could not be read.`,
    );
  }
  if (changes.length > 0) {
    return failed(
      "convex:stale_backend",
      `The ${convex.expectedDeployment} backend runs ${deployed}, but this release changes the backend after it (${changes.slice(0, 5).join(", ")}); the backend does not match this release.`,
    );
  }
  return verified(
    `Frontend points at ${convex.expectedDeployment}; its backend runs ${deployed} and nothing between that and ${sha} changes the backend.`,
  );
}

function evaluateConfig(input: ReleaseReceiptInput): ReceiptLeg {
  const { config } = input;
  if (config.ok === null) {
    return unverified(
      "config:not_run",
      "The PR12-01 deployment-config check did not run against the production environment.",
    );
  }
  if (!config.ok) {
    const codes = config.blockerCodes.slice(0, 5).join(", ");
    return failed(
      "config:blockers",
      `Deployment config check reports ${config.blockerCount} blocker(s)${codes ? `: ${codes}` : ""}.`,
    );
  }
  return verified(
    config.blockerCount === 0
      ? "Deployment config check passed with zero blockers."
      : `Deployment config check passed (${config.blockerCount} non-blocker finding(s)).`,
  );
}

function evaluateWorkflow(input: ReleaseReceiptInput): ReceiptLeg {
  const { workflow } = input;
  const path = "GET /api/manifest/commands";
  if (workflow.unauthenticatedStatus === null) {
    return unverified(
      "workflow:unauthenticated_probe_not_run",
      "The anonymous probe of the command API did not run.",
    );
  }
  if (workflow.unauthenticatedStatus !== 401) {
    return failed(
      "workflow:auth_gate_absent",
      `${path} without credentials answered ${workflow.unauthenticatedStatus}, expected 401 — the authenticated surface is open or missing.`,
    );
  }
  if (workflow.authenticatedStatus === null) {
    return unverified(
      "workflow:authenticated_probe_not_run",
      "The authenticated probe did not run (no production credential available to the gatherer).",
    );
  }
  if (workflow.authenticatedStatus !== 200) {
    return failed(
      "workflow:authenticated_call_failed",
      `${path} with production credentials answered ${workflow.authenticatedStatus} (expected 200); the authenticated workflow does not succeed.`,
    );
  }
  if (workflow.commandCount === null || workflow.commandCount === 0) {
    return unverified(
      "workflow:registry_empty",
      `${path} answered 200 but the command registry could not be read from the response.`,
    );
  }
  // A registry listing is not a product workflow (#382): a real command must
  // run through the deployed guards and answer with its result.
  const step = workflow.productStep;
  if (step === null) {
    return unverified(
      "workflow:product_step_not_configured",
      "No real product step ran (set CAPSULE_RELEASE_WORKFLOW to the command the receipt runs with production credentials).",
    );
  }
  if (step.status !== 200 || !step.succeeded) {
    return failed(
      "workflow:product_step_failed",
      `The product step ${step.name} answered ${step.status ?? "nothing"} without a result; the signed-in workflow does not succeed.`,
    );
  }
  return verified(
    `On the canonical URL: ${path} 401 anonymous / 200 signed in, and the product step ${step.name} ran with production credentials and returned its result.`,
  );
}

/**
 * Build a release receipt from a gathered snapshot. Complete requires every
 * leg verified; anything else is partial with named codes.
 */
export function buildReleaseReceipt(
  input: ReleaseReceiptInput,
): ReleaseReceipt {
  const vercel = evaluateVercel(input);
  const convex = evaluateConvex(input);
  const config = evaluateConfig(input);
  const workflow = evaluateWorkflow(input);
  const rootCodes: string[] = [];
  if (!isSha(input.integratedSha)) {
    rootCodes.push("receipt:integrated_sha_missing");
  }
  const legs = [vercel, convex, config, workflow];
  const codes = [
    ...rootCodes,
    ...legs.map((leg) => leg.code).filter((code) => code !== ""),
  ];
  return {
    integratedSha: input.integratedSha,
    gatheredAt: input.gatheredAt,
    status: codes.length === 0 ? "complete" : "partial",
    vercel,
    convex,
    config,
    workflow,
    codes,
  };
}

/** One-line human summary; the markdown form is for the receipt file. */
export function receiptHeadline(receipt: ReleaseReceipt): string {
  const sha = receipt.integratedSha ?? "<no sha>";
  return receipt.status === "complete"
    ? `SHIPPED ${sha}: every leg verified.`
    : `PARTIAL — NOT shipped (${sha}); missing/failed: ${receipt.codes.join(", ")}`;
}

/** Render the receipt as markdown for .artifacts/release/receipt-<sha>.md. */
export function renderReleaseReceiptMarkdown(receipt: ReleaseReceipt): string {
  const lines: string[] = [
    "# Release receipt",
    "",
    `- Integrated SHA: ${receipt.integratedSha ?? "<missing>"}`,
    `- Gathered at: ${new Date(receipt.gatheredAt).toISOString()}`,
    `- Status: ${receipt.status === "complete" ? "COMPLETE — shipped" : "PARTIAL — NOT shipped"}`,
    ...(receipt.codes.length > 0
      ? [`- Codes: ${receipt.codes.join(", ")}`]
      : []),
    "",
  ];
  const section = (name: string, leg: ReceiptLeg): void => {
    lines.push(`## ${name} — ${leg.state}`, "", `- ${leg.detail}`, "");
  };
  section("Vercel (canonical URL, READY, exact SHA)", receipt.vercel);
  section("Convex (matching code/schema)", receipt.convex);
  section("Deployment config checks", receipt.config);
  section("Authenticated production workflow", receipt.workflow);
  lines.push(
    "Partial stays partial. A stale alias or backend is never called shipped",
    "(PR13-06 / AC-030).",
  );
  return lines.join("\n") + "\n";
}
