import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildStoredZip, buildWorkbook } from "./zipFixture";

/**
 * Runtime proof AC-177 (PR01-required-tenant-storage): archive bytes are
 * stored against the importing company's run and only reachable through
 * company-checked paths. Knowing a storage id grants nothing: another
 * company cannot inventory the archive into its own run, cannot pull a
 * record's file (an attachment) in as an archive, cannot classify or read
 * provenance of the owner's run, and archive bytes never resolve to a
 * download URL. An old unclaimed blob is refused too — an archive is a
 * fresh upload. Synthetic tenants and workbooks only.
 */

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

afterEach(() => {
  vi.useRealTimers();
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

async function storeBytes(actor: Actor, bytes: Uint8Array): Promise<string> {
  return (await actor.run(async (ctx) =>
    (
      ctx as unknown as {
        storage: { store: (blob: Blob) => Promise<string> };
      }
    ).storage.store(new Blob([bytes as BlobPart])),
  )) as string;
}

async function startRun(actor: Actor): Promise<string> {
  const started = (await actor.mutation(api.importCoordinator.startImport, {
    sourceSystem: "tpp_legacy",
    datasetType: "events",
  })) as { importRunId: string };
  return started.importRunId;
}

async function artifactCount(actor: Actor, importRunId: string) {
  return (await actor.run(async (ctx) => {
    const rows = await ctx.db.query("importArtifacts").collect();
    return rows.filter(
      (row) => (row as { importRunId: string }).importRunId === importRunId,
    ).length;
  })) as number;
}

const archive = buildStoredZip([
  {
    name: "beo.xlsx",
    data: Array.from(
      buildWorkbook([["Banquet Event Order"], ["Guarantee:", "40"]]),
    ),
  },
]);

describe("runtime proof: archive storage belongs to the importing company (AC-177)", () => {
  it("a storage id another company holds or references grants nothing", async () => {
    const proof = harness();
    const ownerA = proof.asRole({
      subject: "archive-owner-a",
      role: "owner",
      tenantId: "tenant-archive-a",
    });
    const ownerB = proof.asRole({
      subject: "archive-owner-b",
      role: "owner",
      tenantId: "tenant-archive-b",
    });

    // Company A uploads and inventories its archive.
    const archiveId = await storeBytes(ownerA, archive);
    const runA = await startRun(ownerA);
    await asActions(ownerA).action(api.archiveInventory.inventoryArchive, {
      importRunId: runA,
      storageId: archiveId,
      indexReportNames: ["beo.xlsx"],
    });
    expect(await artifactCount(ownerA, runA)).toBe(1);

    // Company B knows A's storage id and tries to pull it into its own run.
    const runB = await startRun(ownerB);
    await expect(
      asActions(ownerB).action(api.archiveInventory.inventoryArchive, {
        importRunId: runB,
        storageId: archiveId,
      }),
    ).rejects.toThrow(/not an upload from your company/);
    expect(await artifactCount(ownerB, runB)).toBe(0);
    const runBAfter = (await ownerB.run(async (ctx) => ctx.db.get(runB))) as {
      archiveStorageId?: string | null;
    };
    expect(runBAfter.archiveStorageId ?? null).toBeNull();

    // A record's file is not an archive another company may read: A's
    // contract attachment stays A's.
    const contractId = await storeBytes(ownerA, archive);
    await proof.executeCommand(
      ownerA,
      api.mutations.Attachment_createViaAttach,
      {
        parentType: "eventRecord",
        parentId: "evt-archive-proof",
        fileName: "contract.zip",
        contentType: "application/zip",
        fileSize: archive.length,
        storageId: contractId,
      },
    );
    await expect(
      asActions(ownerB).action(api.archiveInventory.inventoryArchive, {
        importRunId: runB,
        storageId: contractId,
      }),
    ).rejects.toThrow(/not an upload from your company/);

    // A's run itself is out of reach for B: no classify, no provenance, no
    // artifact rows through the read query.
    await expect(
      asActions(ownerB).action(
        api.archiveDisposition.classifyArchiveWorkbooks,
        { importRunId: runA },
      ),
    ).rejects.toThrow(/Import run not found/);
    await expect(
      asActions(ownerB).action(api.archiveProvenance.recordArchiveProvenance, {
        importRunId: runA,
      }),
    ).rejects.toThrow(/Import run not found/);
    expect(
      await ownerB.query(api.queries.listImportArtifactByImportRunId, {
        importRunId: runA,
      }),
    ).toEqual([]);
    expect(
      await ownerB.query(api.queries.listImportRunByArchiveStorageId, {
        archiveStorageId: archiveId,
      }),
    ).toEqual([]);

    // Archive bytes never resolve to a download URL — not even for A.
    for (const actor of [ownerA, ownerB]) {
      const urls = (await actor.query(api.fileStorage.urlsForStorageIds, {
        storageIds: [archiveId],
      })) as Record<string, string | null>;
      expect(urls[archiveId]).toBeNull();
    }

    // A's own resume on the same run and bytes still works.
    const again = (await asActions(ownerA).action(
      api.archiveInventory.inventoryArchive,
      {
        importRunId: runA,
        storageId: archiveId,
        indexReportNames: ["beo.xlsx"],
      },
    )) as { status: string; skipped: number };
    expect(again).toMatchObject({ status: "registered", skipped: 1 });
  });

  it("an old unclaimed file is not a fresh archive upload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
    const proof = harness();
    const owner = proof.asRole({
      subject: "archive-owner-old",
      role: "owner",
      tenantId: "tenant-archive-old",
    });
    const oldId = await storeBytes(owner, archive);
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    const run = await startRun(owner);
    await expect(
      asActions(owner).action(api.archiveInventory.inventoryArchive, {
        importRunId: run,
        storageId: oldId,
      }),
    ).rejects.toThrow(/not an upload from your company/);

    // A fresh upload of the same bytes is accepted.
    const freshId = await storeBytes(owner, archive);
    const result = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      { importRunId: run, storageId: freshId },
    )) as { status: string; registered: number };
    expect(result).toMatchObject({ status: "registered", registered: 1 });
  });
});
