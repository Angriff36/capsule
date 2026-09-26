/**
 * Runtime proof (PL-AUTH, AC-212 switch check reads): the hand-written reads
 * in convex/cutover.ts give the same answer as the read policies of the
 * records they show. Import runs and import matches (importAccess) and
 * outside-service connections (manageAccess) are for the manager tier only,
 * checked through the role mirror in convex/search.ts, so field staff and an
 * invented role that only looks like a manager see no run, no match and no
 * check details. A removed run never counts as the latest import, and an
 * import match with no deletedAt field counts as live. Synthetic
 * workspaces and records only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

interface Readiness {
  canProceed: boolean;
  checks: {
    finalDeltaImport: { passed: boolean; message: string; details?: string };
    zeroCriticalMappings: { passed: boolean; message: string; count?: number };
  };
  blockers: string[];
}

async function reads(actor: Actor) {
  const latest = (await actor.query(api.cutover.getLatestImportRun, {})) as {
    id: string;
  } | null;
  const links = (await actor.query(api.cutover.countUnresolvedLinks, {})) as {
    count: number;
    sample: unknown[];
  };
  const readiness = (await actor.query(
    api.cutover.validateCutoverReadiness,
    {},
  )) as Readiness;
  return { latest: latest?.id ?? null, links, readiness };
}

describe("runtime proof: switch check reads follow the import read policies (AC-212)", () => {
  it("only the manager tier of the workspace reads runs, matches and check details", async () => {
    const proof = harness();
    const tenantId = "tenant-cutover-reads";
    const as = (subject: string, role: string, tenant = tenantId) =>
      proof.asRole({ subject, role, tenantId: tenant });
    const owner = as("cutover-reads-owner", "owner");
    const manager = as("cutover-reads-kitchen-manager", "kitchen_manager");
    const invented = as("cutover-reads-invented", "catering_manager");
    const staff = as("cutover-reads-staff", "event_staff");
    const outsider = as(
      "cutover-reads-outsider",
      "owner",
      "tenant-cutover-reads-other",
    );

    const start = async () =>
      (
        (await owner.mutation(api.importCoordinator.startImport, {
          sourceSystem: "tpp_legacy",
          datasetType: "events",
        })) as { importRunId: string }
      ).importRunId;
    const liveRunId = await start();
    const removedRunId = await start();
    await owner.run(async (ctx) => {
      const db = (
        ctx as unknown as {
          db: {
            patch: (id: string, value: object) => Promise<void>;
            insert: (table: string, value: object) => Promise<string>;
          };
        }
      ).db;
      // The newest run is removed; it must never count as the latest import.
      await db.patch(removedRunId, { deletedAt: Date.now() });
      const link = {
        tenantId,
        sourceSystem: "tpp_legacy",
        recordType: "event",
        capsuleEntity: "event_record",
        verified: false,
        conflictStatus: "resolved",
        version: 1,
      };
      // A live match from before the field existed: no deletedAt at all.
      await db.insert("externalRecordLinks", {
        ...link,
        externalId: "tpp-event-live",
        capsuleId: "capsule-event-live",
      });
      // A removed match never counts.
      await db.insert("externalRecordLinks", {
        ...link,
        deletedAt: Date.now(),
        externalId: "tpp-event-removed",
        capsuleId: "capsule-event-removed",
      });
    });

    // The owner and a real manager role read the live run, the one live
    // unmatched item and the check details; the removed run and the removed
    // match are left out.
    for (const allowed of [owner, manager]) {
      const r = await reads(allowed);
      expect(r.latest).toBe(liveRunId);
      expect(r.links.count).toBe(1);
      expect(r.readiness.checks.zeroCriticalMappings.count).toBe(1);
      expect(r.readiness.checks.finalDeltaImport.details).toBe(
        "Import ID: " + liveRunId,
      );
    }

    // Field staff of the same workspace and an invented role whose name only
    // ends in _manager: no importAccess, so nothing.
    for (const denied of [staff, invented]) {
      const r = await reads(denied);
      expect(r.latest).toBeNull();
      expect(r.links).toEqual({ count: 0, sample: [] });
      expect(r.readiness.canProceed).toBe(false);
      expect(r.readiness.blockers).toEqual([
        "Only managers can see the switch checks",
      ]);
      expect(r.readiness.checks.zeroCriticalMappings.count).toBe(undefined);
      expect(r.readiness.checks.finalDeltaImport.details).toBe(undefined);
    }

    // Another workspace sees none of this workspace records.
    const outsiderReads = await reads(outsider);
    expect(outsiderReads.latest).toBeNull();
    expect(outsiderReads.links.count).toBe(0);
  });
});
