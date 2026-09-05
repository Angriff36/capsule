/**
 * Runtime proof: archive reupload no-op + revision delta (R2-9 / AC-023,
 * spec PR01-04).
 *
 * "Reuploading identical bytes, restarting a worker after a committed
 * command, or opening the run from another device creates no duplicate
 * business records. A changed source revision produces an explicit delta
 * against the prior import, not a second copy."
 *
 * Why this proof exists: the per-record layer already dedups across runs
 * (importCommit.findLink keys on tenant+source+recordType+externalId), but
 * nothing at the ARCHIVE level answered "I uploaded this zip before" — a
 * reupload walked the whole pipeline again and a revised zip looked exactly
 * like a first import. This proof drives the real surfaces end to end:
 *
 * - Identical bytes, NEW run → inventoryArchive short-circuits on the
 *   whole-archive checksum against a live prior run: registers nothing,
 *   leaves the new run without archive linkage, and names the prior run.
 * - Worker restart after a committed command → re-invoking
 *   commitImportRun on the COMPLETED run is refused (status gate), and a
 *   full quickImport of the same source rows again commits 0 / skips all —
 *   the cross-run ExternalRecordLink dedup is the durable guard, not a
 *   client-side promise. Venue count and link ownership stay fixed.
 * - Cross-device reopen → re-running the inventory action on the same run
 *   re-registers nothing (name skip), re-classification classifies 0, and
 *   no business record appears.
 * - Changed revision → the new archive inventories fully AND returns an
 *   explicit per-workbook delta (unchanged / changed with both checksums /
 *   added / removed) against the latest prior import, proven with locally
 *   computed sha256 values, across two successive revisions so every delta
 *   bucket (including removed) is exercised.
 *
 * Fixtures are synthetic (zipFixture buildWorkbook); no private TPP bytes.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildStoredZip, buildWorkbook, sha256Hex } from "./zipFixture";

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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

/** The proof-kit harness type declares mutations only; the underlying
 * convex-test instance also runs actions (inventoryArchive is an action). */
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

type CommitResult = {
  importRunId: string;
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
};

interface Delta {
  priorImportRunId: string;
  unchanged: string[];
  changed: Array<{
    name: string;
    priorChecksum: string;
    checksum: string;
  }>;
  added: string[];
  removed: string[];
}

interface RegisteredInventory {
  status: "registered";
  registered: number;
  skipped: number;
  delta?: Delta;
}

/** Runs created inside one millisecond would tie on createdAt; keep the
 * "latest prior import" ordering deterministic across the archive runs. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

const ALPHA = "workbook-alpha.xlsx";
const BRAVO = "workbook-bravo.xlsx";
const CHARLIE = "workbook-charlie.xlsx";

const alphaBytes = buildWorkbook([["Alpha Report"], ["stable row"]]);
const bravoV1 = buildWorkbook([["Bravo Report"], ["revision 1"]]);
const bravoV2 = buildWorkbook([["Bravo Report"], ["revision 2"]]);
const charlieBytes = buildWorkbook([["Charlie Report"], ["new report"]]);

const archiveV1 = buildStoredZip([
  { name: ALPHA, data: Array.from(alphaBytes) },
  { name: BRAVO, data: Array.from(bravoV1) },
]);
const archiveV2 = buildStoredZip([
  { name: ALPHA, data: Array.from(alphaBytes) },
  { name: BRAVO, data: Array.from(bravoV2) },
  { name: CHARLIE, data: Array.from(charlieBytes) },
]);
const archiveV3 = buildStoredZip([
  { name: ALPHA, data: Array.from(alphaBytes) },
]);

const venueRows = [1, 2].map((n) => ({
  VenueID: `V-90${n}`,
  VenueName: `Reupload Venue ${n}`,
  VenueType: "Office",
  Address: `${n} Main Street`,
  City: "Seattle",
  State: "WA",
  ZipCode: "98101",
  Capacity: 100 + n,
  CreatedDate: "2026-05-01",
}));

async function storeArchive(
  actor: Actor,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  return (await actor.run(async (ctx) =>
    (
      ctx as unknown as {
        storage: { store: (blob: Blob) => Promise<string> };
      }
    ).storage.store(new Blob([bytes])),
  )) as string;
}

async function startRun(actor: Actor): Promise<string> {
  const started = (await actor.mutation(api.importCoordinator.startImport, {
    sourceSystem: "tpp_legacy",
    datasetType: "events",
  })) as { importRunId: string };
  return started.importRunId;
}

async function liveVenueNames(
  actor: Actor,
  tenantId: string,
): Promise<string[]> {
  const rows = await actor.run(async (ctx) =>
    (await ctx.db.query("venues").collect()).filter(
      (row) =>
        (row as { tenantId: string }).tenantId === tenantId &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
  return (rows as unknown as Array<{ name: string }>).map((row) => row.name);
}

async function venueLinks(
  actor: Actor,
  tenantId: string,
): Promise<
  Array<{ externalId: string; capsuleId: string; sourceImportRunId: string }>
> {
  const rows = await actor.run(async (ctx) =>
    (await ctx.db.query("externalRecordLinks").collect()).filter(
      (row) =>
        (row as { tenantId: string }).tenantId === tenantId &&
        (row as { recordType: string }).recordType === "venue" &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
  return rows as unknown as Array<{
    externalId: string;
    capsuleId: string;
    sourceImportRunId: string;
  }>;
}

async function artifactsFor(actor: Actor, runId: string): Promise<number> {
  const rows = await actor.run(async (ctx) =>
    (await ctx.db.query("importArtifacts").collect()).filter(
      (row) =>
        (row as { importRunId: string }).importRunId === runId &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
  return rows.length;
}

describe("runtime proof: import reupload delta (AC-023)", () => {
  it("identical bytes no-op; changed revision produces an explicit delta", async () => {
    const tenantId = "tenant-import-reupload-delta";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-reupload-owner",
      role: "owner",
      tenantId,
    });

    // ------------------------------------------------------------------
    // Baseline business records: two venues through the one-shot quickImport
    // path. R0 is the committed run every later "restart/repeat" leg targets.
    // ------------------------------------------------------------------
    const first = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "venues",
      sourceSystem: "tpp_legacy",
      rows: venueRows,
    })) as CommitResult;
    expect(first.committed).toBe(2);
    expect(await liveVenueNames(owner, tenantId)).toHaveLength(2);
    const baselineLinks = await venueLinks(owner, tenantId);
    expect(baselineLinks).toHaveLength(2);

    // ------------------------------------------------------------------
    // Worker restart after a committed command: the completed run refuses a
    // second commit invocation, and repeating the whole import for the same
    // source rows creates no second copy of any business record.
    // ------------------------------------------------------------------
    await expect(
      asActions(owner).action(api.importCommit.commitImportRun, {
        importRunId: first.importRunId,
        rawRows: venueRows,
      }),
    ).rejects.toThrow(/committing/);

    const repeat = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "venues",
      sourceSystem: "tpp_legacy",
      rows: venueRows,
    })) as CommitResult;
    expect(repeat.committed).toBe(0);
    expect(repeat.skipped).toBe(2);
    expect(await liveVenueNames(owner, tenantId)).toHaveLength(2);
    // The skip path does not rewrite the links: ownership stays with the
    // run that actually materialized the records.
    const linksAfterRepeat = await venueLinks(owner, tenantId);
    expect(linksAfterRepeat).toHaveLength(2);
    for (const link of linksAfterRepeat) {
      expect(link.sourceImportRunId).toBe(first.importRunId);
    }

    // ------------------------------------------------------------------
    // R1: the first archive import (two workbooks, index matches).
    // ------------------------------------------------------------------
    await tick();
    const run1 = await startRun(owner);
    const storageV1 = await storeArchive(owner, archiveV1);
    const inventory1 = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      {
        importRunId: run1,
        storageId: storageV1,
        indexReportNames: [ALPHA, BRAVO],
      },
    )) as RegisteredInventory;
    expect(inventory1.status).toBe("registered");
    expect(inventory1.registered).toBe(2);
    // No prior archived import exists yet — nothing to delta against.
    expect(inventory1.delta).toBeUndefined();

    // ------------------------------------------------------------------
    // Cross-device reopen of the LIVE run: re-running the inventory action
    // from anywhere re-registers nothing (same-run name skip) and creates
    // no business record.
    // ------------------------------------------------------------------
    const reopenInventory = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      {
        importRunId: run1,
        storageId: storageV1,
        indexReportNames: [ALPHA, BRAVO],
      },
    )) as RegisteredInventory;
    expect(reopenInventory.status).toBe("registered");
    expect(reopenInventory.registered).toBe(0);
    expect(reopenInventory.skipped).toBe(2);
    expect(await artifactsFor(owner, run1)).toBe(2);
    expect(await liveVenueNames(owner, tenantId)).toHaveLength(2);

    // Walk R1 to completed through the generated gates (the quickImport
    // stage order; classify reconciles the row counts first).
    const counts = JSON.stringify({ events: 2 });
    await owner.mutation(api.mutations.ImportRun_recordParse, {
      docId: run1,
      recordCounts: counts,
    });
    await owner.mutation(api.mutations.ImportRun_validate, { docId: run1 });
    await owner.mutation(api.mutations.ImportRun_beginReview, { docId: run1 });
    await owner.mutation(api.mutations.ImportRun_approveReview, {
      docId: run1,
      finalRecordCounts: counts,
    });
    const disposition1 = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId: run1 },
    )) as { classified: number; unaccountedRecordCount: number };
    expect(disposition1.classified).toBe(2);
    expect(disposition1.unaccountedRecordCount).toBe(0);
    const run1Version = (await owner.run(async (ctx) =>
      ctx.db.get(run1 as never),
    )) as { version: number };
    const run1Committed = (await owner.mutation(
      api.mutations.ImportRun_commit,
      {
        docId: run1,
        version: run1Version.version,
      },
    )) as { status: string };
    expect(run1Committed.status).toBe("completed");

    // Reopening the COMPLETED run cannot re-inventory at all — the status
    // gate refuses, so a finished import is doubly closed to duplication.
    await expect(
      asActions(owner).action(api.archiveInventory.inventoryArchive, {
        importRunId: run1,
        storageId: storageV1,
        indexReportNames: [ALPHA, BRAVO],
      }),
    ).rejects.toThrow(/started or parsing/);
    expect(await artifactsFor(owner, run1)).toBe(2);

    // ------------------------------------------------------------------
    // Identical bytes, NEW run: the whole-archive checksum short-circuits
    // against the live prior run. No artifact is registered, the new run
    // keeps no archive linkage, and the result names the prior import.
    // ------------------------------------------------------------------
    await tick();
    const run2 = await startRun(owner);
    const storageV1Again = await storeArchive(owner, archiveV1);
    expect(storageV1Again).not.toBe(storageV1); // a genuinely new upload
    const inventory2 = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      {
        importRunId: run2,
        storageId: storageV1Again,
        indexReportNames: [ALPHA, BRAVO],
      },
    )) as { status: string; priorImportRunId: string };
    expect(inventory2.status).toBe("duplicate");
    expect(inventory2.priorImportRunId).toBe(run1);
    expect(await artifactsFor(owner, run2)).toBe(0);
    const run2Row = (await owner.run(async (ctx) =>
      ctx.db.get(run2 as never),
    )) as {
      archiveChecksum: string | null;
      archiveWorkbookCount: number;
    } | null;
    expect(run2Row).not.toBeNull();
    expect(run2Row?.archiveChecksum ?? null).toBeNull();
    expect(run2Row?.archiveWorkbookCount).toBe(0);

    // ------------------------------------------------------------------
    // Changed revision: alpha unchanged, bravo revised, charlie added. The
    // new archive inventories fully AND returns the explicit delta with the
    // real content checksums of both revisions.
    // ------------------------------------------------------------------
    await tick();
    const run4 = await startRun(owner);
    const storageV2 = await storeArchive(owner, archiveV2);
    const inventory4 = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      {
        importRunId: run4,
        storageId: storageV2,
        indexReportNames: [ALPHA, BRAVO, CHARLIE],
      },
    )) as RegisteredInventory;
    expect(inventory4.status).toBe("registered");
    expect(inventory4.registered).toBe(3);
    expect(inventory4.delta).toBeDefined();
    expect(inventory4.delta?.priorImportRunId).toBe(run1);
    expect(inventory4.delta?.unchanged).toEqual([ALPHA]);
    expect(inventory4.delta?.added).toEqual([CHARLIE]);
    expect(inventory4.delta?.removed).toEqual([]);
    expect(inventory4.delta?.changed).toHaveLength(1);
    expect(inventory4.delta?.changed[0]?.name).toBe(BRAVO);
    expect(inventory4.delta?.changed[0]?.priorChecksum).toBe(
      await sha256Hex(bravoV1),
    );
    expect(inventory4.delta?.changed[0]?.checksum).toBe(
      await sha256Hex(bravoV2),
    );
    expect(await artifactsFor(owner, run4)).toBe(3);

    // ------------------------------------------------------------------
    // Second revision (workbooks removed): the delta baseline is the LATEST
    // prior import, so removing bravo and charlie lands in `removed`.
    // ------------------------------------------------------------------
    await tick();
    const run5 = await startRun(owner);
    const storageV3 = await storeArchive(owner, archiveV3);
    const inventory5 = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      { importRunId: run5, storageId: storageV3, indexReportNames: [ALPHA] },
    )) as RegisteredInventory;
    expect(inventory5.status).toBe("registered");
    expect(inventory5.registered).toBe(1);
    expect(inventory5.delta?.priorImportRunId).toBe(run4);
    expect(inventory5.delta?.unchanged).toEqual([ALPHA]);
    expect(inventory5.delta?.changed).toEqual([]);
    expect(inventory5.delta?.added).toEqual([]);
    expect(inventory5.delta?.removed).toEqual([BRAVO, CHARLIE]);

    // ------------------------------------------------------------------
    // End-state invariants: only the registered runs hold artifacts; the
    // duplicate run contributed nothing anywhere.
    // ------------------------------------------------------------------
    expect(await artifactsFor(owner, run1)).toBe(2);
    expect(await artifactsFor(owner, run4)).toBe(3);
    expect(await artifactsFor(owner, run5)).toBe(1);
    expect(await artifactsFor(owner, run2)).toBe(0);
    expect(await liveVenueNames(owner, tenantId)).toHaveLength(2);
  });
});
