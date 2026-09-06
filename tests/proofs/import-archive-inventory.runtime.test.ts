/**
 * Runtime proof: archive upload → workbook inventory → index reconciliation
 * → commit gate (plan R2-3 + R2-4 / AC-020, spec PR01-01).
 *
 * Why this proof exists: a successful batch import is not archive
 * accountability. The 90-workbook TPP regression archive arrived with an
 * index describing only 70 reports, and today nothing inventories the
 * archive or blocks commit on that gap. This proof drives the real governed
 * surfaces end to end — ctx.storage holds the uploaded archive, the
 * archiveInventory action safe-lists EVERY workbook actually present into
 * ImportArtifact rows (checksum, byte size, inner entry count), the
 * ImportRun records both counts, and the generated ImportRun_commit
 * mutation (the one command importCommit funnels every commit through)
 * refuses until explainArchiveDiscrepancy records the operator's answer.
 *
 * The fixture is a fully synthetic stored-only zip (90 tiny workbook zips
 * + names); no private TPP export bytes, per the spec's fixture rule.
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

/** The proof-kit harness type declares mutations only; the underlying
 * convex-test instance also runs actions (inventoryArchive is an action). */
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

// ---------------------------------------------------------------------------
// Synthetic stored-only zip builder (no compression, zero timestamps — the
// fixture only needs structural validity, not realistic deflate).
// ---------------------------------------------------------------------------

const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];
const bytesOf = (text: string) => Array.from(new TextEncoder().encode(text));

function buildStoredZip(entries: Array<{ name: string; data: number[] }>) {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = bytesOf(entry.name);
    local.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(name.length),
      ...u16(0),
      ...name,
      ...entry.data,
    );
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(entry.data.length),
      ...u32(entry.data.length),
      ...u16(name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...name,
    );
    offset += 30 + name.length + entry.data.length;
  }
  return new Uint8Array([
    ...local,
    ...central,
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(local.length),
    ...u16(0),
  ]);
}

/** One synthetic .xlsx: a stored zip with three parts and report-specific
 * bytes so every workbook checksum is distinct. */
function workbookBytes(reportName: string) {
  return buildStoredZip([
    { name: "[Content_Types].xml", data: bytesOf(`types-${reportName}`) },
    { name: "xl/workbook.xml", data: bytesOf(`workbook-${reportName}`) },
    { name: "xl/worksheets/sheet1.xml", data: bytesOf(`sheet-${reportName}`) },
  ]);
}

const REPORT_COUNT = 90;
const INDEXED_COUNT = 70;
const reportNames = Array.from(
  { length: REPORT_COUNT },
  (_, i) => `report-${String(i + 1).padStart(3, "0")}.xlsx`,
);
const indexReportNames = reportNames.slice(0, INDEXED_COUNT);

async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface InventoryResult {
  registered: number;
  skipped: number;
  repaired: number;
  workbooks: Array<{
    name: string;
    checksum: string;
    byteSize: number;
    entryCount: number;
  }>;
  reconciliation: {
    archiveWorkbookCount: number;
    indexWorkbookCount: number;
    inBoth: number;
    archiveOnly: string[];
    indexOnly: string[];
  };
}

describe("runtime proof: import archive inventory (AC-020)", () => {
  it("upload inventories every workbook and reconciles the supplied index before commit", async () => {
    const tenantId = "tenant-import-archive-inventory";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-archive-owner",
      role: "owner",
      tenantId,
    });

    // The uploaded archive: 90 workbook zips. The supplied index describes
    // only the first 70 — the 90-vs-70 regression shape.
    const archiveBytes = buildStoredZip(
      reportNames.map((name) => ({
        name,
        data: Array.from(workbookBytes(name)),
      })),
    );
    const expectedChecksums = new Map<string, string>();
    for (const name of reportNames) {
      expectedChecksums.set(name, await sha256Hex(workbookBytes(name)));
    }

    // The harness type declares only {db, auth} on run's ctx; the underlying
    // convex-test run ctx also carries file storage (convex-test index.d.ts:
    // run receives GenericMutationCtx & Pick<GenericActionCtx, "storage">).
    const storageId = await owner.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob([archiveBytes])),
    );

    const started = (await owner.mutation(api.importCoordinator.startImport, {
      sourceSystem: "tpp_legacy",
      datasetType: "events",
    })) as { importRunId: string };
    const importRunId = started.importRunId;

    const inventory = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      { importRunId, storageId, indexReportNames },
    )) as InventoryResult;

    // --- Inventory: every workbook actually present is accounted for. ---
    expect(inventory.registered).toBe(REPORT_COUNT);
    expect(inventory.reconciliation.archiveWorkbookCount).toBe(REPORT_COUNT);
    expect(inventory.reconciliation.indexWorkbookCount).toBe(INDEXED_COUNT);
    expect(inventory.reconciliation.inBoth).toBe(INDEXED_COUNT);
    expect(inventory.reconciliation.indexOnly).toEqual([]);
    expect(inventory.reconciliation.archiveOnly).toEqual(
      reportNames.slice(INDEXED_COUNT),
    );
    expect(inventory.workbooks).toHaveLength(REPORT_COUNT);
    expect(new Set(inventory.workbooks.map((w) => w.checksum)).size).toBe(
      REPORT_COUNT,
    );

    const artifacts = await owner.run(async (ctx) =>
      (await ctx.db.query("importArtifacts").collect()).filter(
        (row) => (row as { deletedAt?: number | null }).deletedAt == null,
      ),
    );
    expect(artifacts).toHaveLength(REPORT_COUNT);
    for (const row of artifacts) {
      const artifact = row as {
        name: string;
        checksum: string | null;
        byteSize: number;
        entryCount: number;
        disposition: string;
        parseStatus: string;
        provenance: string;
      };
      expect(artifact.checksum).toBe(expectedChecksums.get(artifact.name));
      // byteSize is the workbook's own (uncompressed) file size and
      // entryCount counts the parts inside the workbook container.
      expect(artifact.byteSize).toBe(workbookBytes(artifact.name).length);
      expect(artifact.entryCount).toBe(3);
      expect(artifact.disposition).toBe("pending");
      expect(artifact.parseStatus).toBe("pending");
      const provenance = JSON.parse(artifact.provenance) as {
        indexed: string;
      };
      expect(provenance.indexed).toBe(
        indexReportNames.includes(artifact.name) ? "in_both" : "archive_only",
      );
    }

    // The run records both counts and owns its source storage.
    const runBefore = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as {
      archiveWorkbookCount: number;
      indexWorkbookCount: number;
      discrepancyExplained: boolean;
      discrepancyNote: string | null;
      archiveStorageId: string | null;
      archiveChecksum: string | null;
      status: string;
      version: number;
    };
    expect(runBefore.archiveWorkbookCount).toBe(REPORT_COUNT);
    expect(runBefore.indexWorkbookCount).toBe(INDEXED_COUNT);
    expect(runBefore.discrepancyExplained).toBe(false);
    expect(runBefore.discrepancyNote).toBeUndefined();
    expect(runBefore.archiveStorageId).toBe(storageId);
    expect(runBefore.archiveChecksum).toBe(await sha256Hex(archiveBytes));

    // Re-running the inventory on the same archive duplicates nothing.
    const rerun = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      { importRunId, storageId, indexReportNames },
    )) as InventoryResult;
    expect(rerun.registered).toBe(0);
    expect(rerun.skipped).toBe(REPORT_COUNT);
    expect(rerun.repaired).toBe(0);

    // --- Walk the run to the commit boundary (generated transitions, the
    // same walk quickImport performs). ---
    const counts = JSON.stringify({ events: 0 });
    await owner.mutation(api.mutations.ImportRun_recordParse, {
      docId: importRunId,
      recordCounts: counts,
    });
    await owner.mutation(api.mutations.ImportRun_validate, {
      docId: importRunId,
    });
    await owner.mutation(api.mutations.ImportRun_beginReview, {
      docId: importRunId,
    });
    await owner.mutation(api.mutations.ImportRun_approveReview, {
      docId: importRunId,
      finalRecordCounts: counts,
    });

    // --- Commit is refused while the discrepancy is unexplained. ---
    const versionRefused = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { version: number };
    await expect(
      owner.mutation(api.mutations.ImportRun_commit, {
        docId: importRunId,
        version: versionRefused.version,
      }),
    ).rejects.toThrow(/Guard \d+ failed/);

    const afterRefusal = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { status: string; discrepancyExplained: boolean };
    expect(afterRefusal.status).toBe("committing");
    expect(afterRefusal.discrepancyExplained).toBe(false);

    // --- The operator explains the gap; commit proceeds. ---
    await owner.mutation(api.mutations.ImportRun_explainArchiveDiscrepancy, {
      docId: importRunId,
      note: "20 workbooks were exported after the index was generated; all 90 are accounted for as archive-only artifacts.",
    });

    // R2-5 gate: every workbook must also be classified (zero unaccounted)
    // before commit — the synthetic fixtures are zero-sheet containers, so
    // all 90 classify as invalid with reconciled 0 == 0 counts.
    const disposition = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as {
      classified: number;
      unaccountedRecordCount: number;
    };
    expect(disposition.classified).toBe(REPORT_COUNT);
    expect(disposition.unaccountedRecordCount).toBe(0);

    const versionExplained = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { version: number };
    const committed = (await owner.mutation(api.mutations.ImportRun_commit, {
      docId: importRunId,
      version: versionExplained.version,
    })) as { status: string };

    expect(committed.status).toBe("completed");
  });

  it("a crash-window artifact draft is repaired on re-run, never skipped", async () => {
    const tenantId = "tenant-import-archive-repair";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-archive-repair-owner",
      role: "owner",
      tenantId,
    });

    const names = [reportNames[0], reportNames[1]];
    const archiveBytes = buildStoredZip(
      names.map((name) => ({ name, data: Array.from(workbookBytes(name)) })),
    );
    const storageId = (await owner.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob([archiveBytes])),
    )) as string;

    const started = (await owner.mutation(api.importCoordinator.startImport, {
      sourceSystem: "tpp_legacy",
      datasetType: "events",
    })) as { importRunId: string };
    const importRunId = started.importRunId;

    // The crash window (review R2-14): allocateArtifactDraft inserted the
    // named draft, then the action died — no register, no timestamp stamp.
    // A name-only skip would leave this row unusable forever, because every
    // artifact command guards createdAt != null.
    await owner.run(async (ctx) => {
      await ctx.db.insert("importArtifacts", {
        tenantId,
        importRunId,
        name: names[0],
        byteSize: 0,
        entryCount: 0,
        provenance: "{}",
        disposition: "pending",
        parseStatus: "pending",
        totalRowCount: 0,
        rowOutcomeCounts: "{}",
        version: 0,
      });
    });

    const inventory = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      { importRunId, storageId },
    )) as InventoryResult;
    expect(inventory.registered).toBe(1); // names[1]
    expect(inventory.repaired).toBe(1); // names[0] completed in place
    expect(inventory.skipped).toBe(0);

    const repairedRow = (await owner.run(async (ctx) =>
      (await ctx.db.query("importArtifacts").collect()).find(
        (row) =>
          (row as { name: string }).name === names[0] &&
          (row as { deletedAt?: number | null }).deletedAt == null,
      ),
    )) as {
      checksum: string | null;
      byteSize: number;
      createdAt: number | null;
    };
    expect(repairedRow.checksum).toBe(await sha256Hex(workbookBytes(names[0])));
    expect(repairedRow.byteSize).toBe(workbookBytes(names[0]).length);
    // The stamp is what makes the row usable downstream.
    expect(repairedRow.createdAt).not.toBeNull();

    // The repaired artifact classifies like any healthy one.
    const disposition = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as { classified: number };
    expect(disposition.classified).toBe(2);
  });

  it("an equal-count index substitution still blocks commit until explained", async () => {
    const tenantId = "tenant-import-archive-name-swap";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-archive-swap-owner",
      role: "owner",
      tenantId,
    });

    const names = [reportNames[0], reportNames[1]];
    const archiveBytes = buildStoredZip(
      names.map((name) => ({ name, data: Array.from(workbookBytes(name)) })),
    );
    const storageId = (await owner.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob([archiveBytes])),
    )) as string;
    const started = (await owner.mutation(api.importCoordinator.startImport, {
      sourceSystem: "tpp_legacy",
      datasetType: "events",
    })) as { importRunId: string };
    const importRunId = started.importRunId;

    // Counts match (2 == 2); the name SETS do not — one index entry names a
    // workbook the archive does not contain (review R2-14: counts-only
    // reconciliation let exactly this shape commit unexplained).
    const swappedIndex = [names[0], "report-not-in-the-archive.xlsx"];
    const inventory = (await asActions(owner).action(
      api.archiveInventory.inventoryArchive,
      { importRunId, storageId, indexReportNames: swappedIndex },
    )) as InventoryResult;
    expect(inventory.reconciliation.archiveWorkbookCount).toBe(2);
    expect(inventory.reconciliation.indexWorkbookCount).toBe(2);
    expect(inventory.reconciliation.archiveOnly).toEqual([names[1]]);
    expect(inventory.reconciliation.indexOnly).toEqual([
      "report-not-in-the-archive.xlsx",
    ]);

    const runRecorded = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as {
      archiveWorkbookCount: number;
      indexWorkbookCount: number;
      indexNameMismatch: boolean;
      discrepancyExplained: boolean;
    };
    expect(runRecorded.archiveWorkbookCount).toBe(2);
    expect(runRecorded.indexWorkbookCount).toBe(2);
    expect(runRecorded.indexNameMismatch).toBe(true);
    expect(runRecorded.discrepancyExplained).toBe(false);

    const counts = JSON.stringify({ events: 0 });
    await owner.mutation(api.mutations.ImportRun_recordParse, {
      docId: importRunId,
      recordCounts: counts,
    });
    await owner.mutation(api.mutations.ImportRun_validate, {
      docId: importRunId,
    });
    await owner.mutation(api.mutations.ImportRun_beginReview, {
      docId: importRunId,
    });
    await owner.mutation(api.mutations.ImportRun_approveReview, {
      docId: importRunId,
      finalRecordCounts: counts,
    });

    // Zero unaccounted (the zero-sheet fixtures classify invalid, 0 == 0),
    // so the ONLY guard refusing commit is the unexplained name mismatch.
    const disposition = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as { unaccountedRecordCount: number };
    expect(disposition.unaccountedRecordCount).toBe(0);

    const versionRefused = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { version: number };
    await expect(
      owner.mutation(api.mutations.ImportRun_commit, {
        docId: importRunId,
        version: versionRefused.version,
      }),
    ).rejects.toThrow(/Guard \d+ failed/);

    await owner.mutation(api.mutations.ImportRun_explainArchiveDiscrepancy, {
      docId: importRunId,
      note: "One index entry names a workbook the archive does not contain; the archive-only workbook is accounted for as an artifact.",
    });
    const versionExplained = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { version: number };
    const committed = (await owner.mutation(api.mutations.ImportRun_commit, {
      docId: importRunId,
      version: versionExplained.version,
    })) as { status: string };
    expect(committed.status).toBe("completed");
  });
});
