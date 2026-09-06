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
      expectedDeployment: "impartial-mule-193",
      frontendDeployment: "impartial-mule-193",
      functionsReachable: true,
      commandCount: 597,
      expectedCommandCount: 597,
    },
    config: { ok: true, blockerCount: 0, blockerCodes: [] },
    workflow: {
      unauthenticatedStatus: 401,
      authenticatedStatus: 200,
      commandCount: 597,
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
    "convex:functions_unreachable",
    (i) => {
      i.convex.functionsReachable = false;
    },
  ],
  [
    "convex:command_surface_unverifiable",
    (i) => {
      i.convex.expectedCommandCount = null;
    },
  ],
  [
    // The stale backend: the alias is right but the backend still serves the
    // previous release's command surface.
    "convex:command_surface_mismatch",
    (i) => {
      i.convex.commandCount = 596;
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

    const staleBackend = completeInput();
    staleBackend.convex.commandCount = 596;
    const backendReceipt = buildReleaseReceipt(staleBackend);
    expect(backendReceipt.convex.state).toBe("failed");
    expect(backendReceipt.convex.code).toBe("convex:command_surface_mismatch");

    const markdown = renderReleaseReceiptMarkdown(aliasReceipt);
    expect(markdown).toContain("PARTIAL — NOT shipped");
    expect(markdown).toContain("vercel:stale_alias");
    expect(markdown).not.toContain("COMPLETE — shipped");
  });

  it("markdown marks a fully verified receipt as shipped and carries every leg's evidence", () => {
    const markdown = renderReleaseReceiptMarkdown(
      buildReleaseReceipt(completeInput()),
    );
    expect(markdown).toContain("COMPLETE — shipped");
    expect(markdown).toContain(CANONICAL_URL);
    expect(markdown).toContain(INTEGRATED_SHA);
    expect(markdown).toContain("impartial-mule-193");
    expect(markdown).not.toContain("PARTIAL");
  });
});
