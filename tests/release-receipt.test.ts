// PR13-06 / AC-030 — the release receipt is the honesty instrument for
// "shipped": it may only say COMPLETE when every leg is independently
// verified against the integrated SHA. This test pins the complete/partial
// boundary itself (the gatherer in scripts/release-receipt.ts only feeds
// the pure builder; the semantics live here).
//
// Pure unit test over synthetic snapshots — no network, no CLI, no secrets.
import { describe, expect, it } from "vitest";
import {
  buildReleaseReceipt,
  receiptHeadline,
  renderReleaseReceiptMarkdown,
  type ReleaseReceiptInput,
} from "../src/lib/releaseReceipt";

const INTEGRATED_SHA = "0123456789abcdef0123456789abcdef01234567";
const STALE_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const CANONICAL_URL = "https://capsule.example.com";

/** A snapshot in which every leg independently verifies. */
function completeInput(): ReleaseReceiptInput {
  return {
    integratedSha: INTEGRATED_SHA,
    gatheredAt: Date.parse("2026-09-05T12:00:00Z"),
    vercel: {
      canonicalUrl: CANONICAL_URL,
      deployment: {
        uid: "dpl_fresh1",
        url: "capsule-example-abc123.vercel.app",
        readyState: "READY",
        commitSha: INTEGRATED_SHA,
      },
    },
    convex: {
      expectedDeployment: "pop-os",
      frontendDeployment: "pop-os",
      backendReleaseSha: INTEGRATED_SHA,
      backendChangesSinceDeployed: null,
    },
    config: { ok: true, blockerCount: 0, blockerCodes: [] },
    workflow: {
      unauthenticatedStatus: 401,
      authenticatedStatus: 200,
      commandCount: 597,
      productStep: {
        name: "Organization.configurePlanningChecks",
        status: 200,
        succeeded: true,
      },
    },
  };
}

/** Every way a leg stops verifying: [expected receipt code, mutation]. */
const scenarios: Array<[string, (input: ReleaseReceiptInput) => void]> = [
  [
    "vercel:canonical_url_unknown",
    (i) => {
      i.vercel.canonicalUrl = null;
    },
  ],
  [
    "vercel:deployment_unverifiable",
    (i) => {
      i.vercel.deployment = null;
    },
  ],
  [
    "vercel:not_ready",
    (i) => {
      i.vercel.deployment!.readyState = "BUILDING";
    },
  ],
  [
    "vercel:sha_unverifiable",
    (i) => {
      i.vercel.deployment!.commitSha = null;
    },
  ],
  [
    // The stale alias: the canonical URL serves an older commit — the exact
    // case PR13-06 says must never be called shipped.
    "vercel:stale_alias",
    (i) => {
      i.vercel.deployment!.commitSha = STALE_SHA;
    },
  ],
  [
    "vercel:integrated_sha_unknown",
    (i) => {
      i.integratedSha = null;
    },
  ],
  [
    "convex:deployment_unknown",
    (i) => {
      i.convex.expectedDeployment = null;
    },
  ],
  [
    "convex:frontend_deployment_unverifiable",
    (i) => {
      i.convex.frontendDeployment = null;
    },
  ],
  [
    "convex:deployment_mismatch",
    (i) => {
      i.convex.frontendDeployment = "veracious-oyster";
    },
  ],
  [
    "convex:backend_identity_unverifiable",
    (i) => {
      i.convex.backendReleaseSha = null;
    },
  ],
  [
    // Deployed by hand (or before the release stamp existed).
    "convex:backend_not_released",
    (i) => {
      i.convex.backendReleaseSha = "unreleased";
    },
  ],
  [
    "convex:backend_lineage_unverifiable",
    (i) => {
      i.convex.backendReleaseSha = STALE_SHA;
      i.convex.backendChangesSinceDeployed = null;
    },
  ],
  [
    // The stale self-hosted backend: the alias is right, the command count may
    // even be equal, but the backend runs an older release and this release
    // changes backend code after it (#382).
    "convex:stale_backend",
    (i) => {
      i.convex.backendReleaseSha = STALE_SHA;
      i.convex.backendChangesSinceDeployed = ["convex/lib/eventStageMoves.ts"];
    },
  ],
  [
    "config:not_run",
    (i) => {
      i.config.ok = null;
    },
  ],
  [
    "config:blockers",
    (i) => {
      i.config.ok = false;
      i.config.blockerCount = 1;
      i.config.blockerCodes = ["clerk:dev_credential_in_production"];
    },
  ],
  [
    "workflow:unauthenticated_probe_not_run",
    (i) => {
      i.workflow.unauthenticatedStatus = null;
    },
  ],
  [
    "workflow:auth_gate_absent",
    (i) => {
      i.workflow.unauthenticatedStatus = 200;
    },
  ],
  [
    "workflow:authenticated_probe_not_run",
    (i) => {
      i.workflow.authenticatedStatus = null;
    },
  ],
  [
    "workflow:authenticated_call_failed",
    (i) => {
      i.workflow.authenticatedStatus = 401;
    },
  ],
  [
    "workflow:registry_empty",
    (i) => {
      i.workflow.commandCount = 0;
    },
  ],
  [
    // A registry listing is not a product workflow.
    "workflow:product_step_not_configured",
    (i) => {
      i.workflow.productStep = null;
    },
  ],
  [
    "workflow:product_step_failed",
    (i) => {
      i.workflow.productStep = { name: "X.y", status: 400, succeeded: false };
    },
  ],
  [
    "workflow:product_step_failed",
    (i) => {
      i.workflow.productStep = { name: "X.y", status: 200, succeeded: false };
    },
  ],
  [
    "receipt:integrated_sha_missing",
    (i) => {
      i.integratedSha = "not-a-sha";
    },
  ],
];

describe("releaseReceipt", () => {
  it("complete only with READY Vercel + matching Convex + config checks + authenticated workflow; otherwise partial", () => {
    const complete = buildReleaseReceipt(completeInput());
    expect(complete.status).toBe("complete");
    expect(complete.codes).toEqual([]);
    for (const leg of [
      complete.vercel,
      complete.convex,
      complete.config,
      complete.workflow,
    ]) {
      expect(leg.state).toBe("verified");
      expect(leg.code).toBe("");
    }
    expect(receiptHeadline(complete)).toContain("SHIPPED");

    for (const [expectedCode, mutate] of scenarios) {
      const input = completeInput();
      mutate(input);
      const receipt = buildReleaseReceipt(input);
      expect(receipt.status, `status for ${expectedCode}`).toBe("partial");
      expect(receipt.codes, `codes for ${expectedCode}`).toContain(
        expectedCode,
      );
      expect(
        receiptHeadline(receipt),
        `headline for ${expectedCode}`,
      ).toContain("PARTIAL — NOT shipped");
    }
  });

  it("the stale alias and stale backend are named failures, not unverifiable blanks", () => {
    const staleAlias = completeInput();
    staleAlias.vercel.deployment!.commitSha = STALE_SHA;
    const aliasReceipt = buildReleaseReceipt(staleAlias);
    expect(aliasReceipt.vercel.state).toBe("failed");
    expect(aliasReceipt.vercel.code).toBe("vercel:stale_alias");
    expect(aliasReceipt.vercel.detail).toContain(STALE_SHA);

    // Same command count, older backend with backend changes since: stale.
    const staleBackend = completeInput();
    staleBackend.convex.backendReleaseSha = STALE_SHA;
    staleBackend.convex.backendChangesSinceDeployed = ["convex/schema.ts"];
    const backendReceipt = buildReleaseReceipt(staleBackend);
    expect(backendReceipt.convex.state).toBe("failed");
    expect(backendReceipt.convex.code).toBe("convex:stale_backend");
    expect(backendReceipt.convex.detail).toContain(STALE_SHA);
    expect(backendReceipt.convex.detail).toContain("convex/schema.ts");

    const markdown = renderReleaseReceiptMarkdown(aliasReceipt);
    expect(markdown).toContain("PARTIAL — NOT shipped");
    expect(markdown).toContain("vercel:stale_alias");
    expect(markdown).not.toContain("COMPLETE — shipped");
  });

  it("an earlier backend release with no backend change since still matches; a frontend-only release is not held back", () => {
    const input = completeInput();
    input.convex.backendReleaseSha = STALE_SHA;
    input.convex.backendChangesSinceDeployed = [];
    const receipt = buildReleaseReceipt(input);
    expect(receipt.status).toBe("complete");
    expect(receipt.convex.detail).toContain(STALE_SHA);
    expect(receipt.convex.detail).toContain("nothing between");
  });

  it("markdown marks a fully verified receipt as shipped and carries every leg's evidence", () => {
    const markdown = renderReleaseReceiptMarkdown(
      buildReleaseReceipt(completeInput()),
    );
    expect(markdown).toContain("COMPLETE — shipped");
    expect(markdown).toContain(CANONICAL_URL);
    expect(markdown).toContain(INTEGRATED_SHA);
    expect(markdown).toContain("pop-os");
    expect(markdown).not.toContain("PARTIAL");
  });
});
