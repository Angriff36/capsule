/**
 * Runtime proof (governed writes, 2026-09-29): import runs, artifacts and
 * import-commit links are written only through generated commands.
 *
 * - startImport creates the run with ImportRun_createViaStart, which stamps
 *   the same defaults the raw insert wrote and emits ImportRunStarted; the
 *   instance form of start can no longer touch an existing run.
 * - ImportArtifact_createViaRegister creates, stamps and emits in one step;
 *   the instance form of register refuses a registered row.
 * - importCommit.upsertLink creates through ExternalRecordLink_createViaLink
 *   (explicit deletedAt null, caller-chosen conflictStatus, ExternalRecordLinked)
 *   and re-links through ExternalRecordLink_relink (ExternalRecordRelinked),
 *   including a legacy link with no timestamps; supersedeLink retires through
 *   ExternalRecordLink_retire (ExternalRecordRetired).
 * - Authorization is unchanged: kitchen_staff (no importAccess) is refused.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

const TENANT = "tenant-import-governed";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(ensureTestFieldEncryptionKey);

type Row = Record<string, unknown> & { _id: string };

function actors(proof: ReturnType<typeof harness>) {
  return {
    manager: proof.asRole({
      subject: "import-governed-manager",
      role: "manager",
      tenantId: TENANT,
    }),
    kitchenStaff: proof.asRole({
      subject: "import-governed-kitchen",
      role: "kitchen_staff",
      tenantId: TENANT,
    }),
  };
}

type Actor = ReturnType<typeof actors>["manager"];

async function events(actor: Actor, type: string): Promise<Row[]> {
  return (await actor.run(async (ctx) =>
    (await ctx.db.query("manifestEvents").collect()).filter(
      (row) => row.type === type,
    ),
  )) as Row[];
}

async function rows(actor: Actor, table: string): Promise<Row[]> {
  return (await actor.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Row[];
}

describe("runtime proof: governed import writes", () => {
  it("startImport creates the run through ImportRun_createViaStart", async () => {
    const proof = harness();
    const { manager, kitchenStaff } = actors(proof);

    await expect(
      kitchenStaff.mutation(api.importCoordinator.startImport, {
        sourceSystem: "tpp_legacy",
        datasetType: "venues",
      }),
    ).rejects.toThrow("Only organization managers can perform imports.");

    const { importRunId } = (await manager.mutation(
      api.importCoordinator.startImport,
      { sourceSystem: "tpp_legacy", datasetType: "venues", checksum: "abc" },
    )) as { importRunId: string };

    const [run] = await rows(manager, "importRuns");
    expect(run._id).toBe(importRunId);
    expect(run).toMatchObject({
      tenantId: TENANT,
      sourceSystem: "tpp_legacy",
      datasetType: "venues",
      status: "started",
      recordCounts: "{}",
      actorId: "import-governed-manager",
      checksum: "abc",
      archiveWorkbookCount: 0,
      indexWorkbookCount: 0,
      discrepancyExplained: false,
      dispositionCounts: "{}",
      unaccountedRecordCount: 0,
      commitCheckpoint: "{}",
    });
    expect(typeof run.startTime).toBe("number");
    expect(typeof run.createdAt).toBe("number");

    const started = await events(manager, "ImportRunStarted");
    expect(started).toHaveLength(1);
    expect(started[0].entityId).toBe(importRunId);
    expect(started[0].payload).toMatchObject({
      importRunId,
      tenantId: TENANT,
      actorId: "import-governed-manager",
    });

    // The instance form of start cannot rewrite an existing run.
    await expect(
      manager.mutation(api.mutations.ImportRun_start, {
        docId: importRunId,
        sourceSystem: "csv_export",
        datasetType: "events",
      }),
    ).rejects.toThrow("Guard 1 failed");
  });

  it("registers artifacts in one governed create", async () => {
    const proof = harness();
    const { manager, kitchenStaff } = actors(proof);
    const { importRunId } = (await manager.mutation(
      api.importCoordinator.startImport,
      { sourceSystem: "tpp_legacy", datasetType: "events" },
    )) as { importRunId: string };
    const fields = {
      importRunId,
      name: "report.xlsx",
      byteSize: 10,
      entryCount: 2,
      checksum: "c1",
      provenance: "{}",
    };

    await expect(
      kitchenStaff.mutation(
        api.mutations.ImportArtifact_createViaRegister,
        fields,
      ),
    ).rejects.toThrow("Staff may see imported files");

    const { docId } = (await manager.mutation(
      api.mutations.ImportArtifact_createViaRegister,
      fields,
    )) as { docId: string };
    const [artifact] = await rows(manager, "importArtifacts");
    expect(artifact._id).toBe(docId);
    expect(typeof artifact.createdAt).toBe("number");
    expect(typeof artifact.registeredAt).toBe("number");
    expect(
      (await events(manager, "ImportArtifactRegistered"))[0]?.entityId,
    ).toBe(docId);

    // Registered rows can be classified, and cannot be registered again.
    await manager.mutation(api.mutations.ImportArtifact_recordParse, {
      docId,
      parseStatus: "parsed",
    });
    await expect(
      manager.mutation(api.mutations.ImportArtifact_register, {
        docId,
        ...fields,
      }),
    ).rejects.toThrow("Guard 1 failed");
  });

  it("upserts and supersedes links through ExternalRecordLink commands", async () => {
    const proof = harness();
    const { manager, kitchenStaff } = actors(proof);
    const { importRunId } = (await manager.mutation(
      api.importCoordinator.startImport,
      { sourceSystem: "tpp_legacy", datasetType: "venues" },
    )) as { importRunId: string };
    const base = {
      tenantId: TENANT,
      sourceSystem: "tpp_legacy",
      recordType: "venue",
      capsuleEntity: "venue",
      sourceImportRunId: importRunId,
      rawSourceData: "{}",
    };

    await expect(
      kitchenStaff.mutation(internal.importCommit.upsertLink, {
        ...base,
        externalId: "V-1",
        capsuleId: "venue-1",
        conflictStatus: "resolved",
      }),
    ).rejects.toThrow("Staff may see import matches");

    // A resolved link and a pending link with no Capsule record yet.
    const resolved = await manager.mutation(internal.importCommit.upsertLink, {
      ...base,
      externalId: "V-1",
      capsuleId: "venue-1",
      conflictStatus: "resolved",
    });
    const pending = await manager.mutation(internal.importCommit.upsertLink, {
      ...base,
      externalId: "V-2",
      capsuleId: "",
      conflictStatus: "pending_conflict",
      resolutionNote: "client not imported",
    });
    const links = await rows(manager, "externalRecordLinks");
    const byId = new Map(links.map((link) => [link._id, link]));
    expect(byId.get(resolved as string)).toMatchObject({
      conflictStatus: "resolved",
      deletedAt: null,
      verified: false,
    });
    expect(byId.get(pending as string)).toMatchObject({
      conflictStatus: "pending_conflict",
      capsuleId: "",
      resolutionNote: "client not imported",
      deletedAt: null,
    });
    expect(await events(manager, "ExternalRecordLinked")).toHaveLength(2);

    // Both are found by the commit lookup (deletedAt stored as null).
    expect(
      (
        (await manager.query(internal.importCommit.linksForRun, {
          sourceImportRunId: importRunId,
        })) as Row[]
      ).length,
    ).toBe(2);

    // Re-import: the same identity relinks, keeping the note when none given.
    const again = await manager.mutation(internal.importCommit.upsertLink, {
      ...base,
      externalId: "V-2",
      capsuleId: "venue-2",
      conflictStatus: "resolved",
    });
    expect(again).toBe(pending);
    const relinked = (await manager.run(async (ctx) =>
      ctx.db.get(pending as never),
    )) as Row;
    expect(relinked).toMatchObject({
      capsuleId: "venue-2",
      conflictStatus: "resolved",
      resolutionNote: "client not imported",
    });
    expect(await events(manager, "ExternalRecordRelinked")).toHaveLength(1);

    // A legacy link written before the timestamps existed relinks and retires.
    const legacy = (await manager.run(async (ctx) =>
      ctx.db.insert("externalRecordLinks", {
        tenantId: TENANT,
        sourceSystem: "tpp_legacy",
        recordType: "venue",
        externalId: "V-OLD",
        linkKey: "tpp_legacy||venue|V-OLD||0",
        capsuleEntity: "venue",
        capsuleId: "legacy-venue",
        verified: false,
        conflictStatus: "resolved",
        deletedAt: null,
        version: 0,
      }),
    )) as string;
    expect(
      await manager.mutation(internal.importCommit.upsertLink, {
        ...base,
        externalId: "V-OLD",
        capsuleId: "venue-old",
        conflictStatus: "resolved",
      }),
    ).toBe(legacy);

    // Revert: every live link of the run is superseded through retire.
    for (const link of (await manager.query(internal.importCommit.linksForRun, {
      sourceImportRunId: importRunId,
    })) as Row[]) {
      await expect(
        kitchenStaff.mutation(internal.importCommit.supersedeLink, {
          linkId: link._id,
          version: link.version as number,
        }),
      ).rejects.toThrow("Staff may see import matches");
      await manager.mutation(internal.importCommit.supersedeLink, {
        linkId: link._id,
        version: link.version as number,
      });
    }
    const after = await rows(manager, "externalRecordLinks");
    expect(after.map((link) => link.conflictStatus)).toEqual([
      "superseded",
      "superseded",
      "superseded",
    ]);
    expect(after.every((link) => link.verified === false)).toBe(true);
    expect(await events(manager, "ExternalRecordRetired")).toHaveLength(3);
  });
});
