import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildStoredZip, buildWorkbook, bytesOf } from "./zipFixture";

/**
 * Runtime proof AC-021 (PR01-02): every workbook of an uploaded archive ends
 * in exactly one disposition with counted row outcomes — headers and
 * summaries separate from data outcomes — and the counts reconcile to the
 * source with no silently dropped rows. Fixtures are synthetic workbooks
 * shaped like TPP exports (a BEO with labelled facts, a table heading and a
 * printed footer), never the private archive.
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

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

interface DispositionResult {
  classified: number;
  skipped: number;
  dispositionCounts: Record<string, number>;
  unaccountedRecordCount: number;
}

interface ArtifactRow {
  _id: string;
  name: string;
  disposition: string;
  parseStatus: string;
  totalRowCount: number;
  rowOutcomeCounts: string;
}

// A clean BEO: title, blank, three labelled facts, a timeline table heading,
// and a printed footer — header/summary/data all present.
const CLEAN_BEO_ROWS: string[][] = [
  ["Banquet Event Order"],
  [],
  ["Event Date:", "2026-05-01"],
  ["Guarantee:", "75"],
  ["Time", "", "Name"],
  ["Site:", "Main Hall"],
  ["Printed Date:", "2026-04-01"],
];

// A BEO with a labelled row whose value is missing — the row the parser
// would silently skip surfaces as needs_mapping.
const GAP_BEO_ROWS: string[][] = [
  ["Banquet Event Order"],
  ["Event Date:", ""],
  ["Vendor Contact:", "Kayden"],
];

// Two byte-identical copies of one minimal BEO — the duplicate-view pair.
const COPY_ROWS: string[][] = [["Banquet Event Order"], ["Guarantee:", "40"]];

const UNKNOWN_ROWS: string[][] = [
  ["Client List", "Updated"],
  ["Acme Corp", "x"],
];

const REFERENCE_ROWS: string[][] = [
  ["Venue List", "Master"],
  ["Grand Hotel", "y"],
];

const TOTAL_SOURCE_ROWS =
  CLEAN_BEO_ROWS.length +
  GAP_BEO_ROWS.length +
  UNKNOWN_ROWS.length +
  COPY_ROWS.length * 2 +
  0 +
  REFERENCE_ROWS.length;

describe("runtime proof: import archive disposition (AC-021)", () => {
  it("every workbook and row has a counted, reconciled disposition", async () => {
    const tenantId = "tenant-import-archive-disposition";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-disposition-owner",
      role: "owner",
      tenantId,
    });

    const archive = buildStoredZip([
      {
        name: "beo-clean.xlsx",
        data: Array.from(buildWorkbook(CLEAN_BEO_ROWS)),
      },
      { name: "beo-gap.xlsx", data: Array.from(buildWorkbook(GAP_BEO_ROWS)) },
      { name: "unknown.xlsx", data: Array.from(buildWorkbook(UNKNOWN_ROWS)) },
      { name: "beo-copy-a.xlsx", data: Array.from(buildWorkbook(COPY_ROWS)) },
      { name: "beo-copy-b.xlsx", data: Array.from(buildWorkbook(COPY_ROWS)) },
      { name: "broken.xlsx", data: bytesOf("this is not a zip") },
      {
        name: "reference.xlsx",
        data: Array.from(buildWorkbook(REFERENCE_ROWS)),
      },
    ]);
    const allNames = [
      "beo-clean.xlsx",
      "beo-gap.xlsx",
      "unknown.xlsx",
      "beo-copy-a.xlsx",
      "beo-copy-b.xlsx",
      "broken.xlsx",
      "reference.xlsx",
    ];

    const storageId = (await owner.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob([archive])),
    )) as string;

    const started = (await owner.mutation(api.importCoordinator.startImport, {
      sourceSystem: "tpp_legacy",
      datasetType: "events",
    })) as { importRunId: string };
    const importRunId = started.importRunId;

    await asActions(owner).action(api.archiveInventory.inventoryArchive, {
      importRunId,
      storageId,
      indexReportNames: allNames,
    });

    // --- First classification pass: every pending workbook is classified. ---
    const first = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as DispositionResult;
    expect(first.classified).toBe(7);
    expect(first.skipped).toBe(0);
    expect(first.unaccountedRecordCount).toBe(0);
    expect(first.dispositionCounts).toEqual({
      normalized: 2, // the clean BEO + the first copy
      needs_mapping: 1,
      unsupported: 2, // unknown.xlsx + reference.xlsx (before relabel)
      duplicate_view: 1, // the second byte-identical copy
      invalid: 1,
    });

    // --- The operator relabels reference data as a linked reference. ---
    const artifactsBefore = (await owner.run(async (ctx) => {
      const rows = await ctx.db.query("importArtifacts").collect();
      return rows.filter((row) => row.deletedAt == null);
    })) as unknown as ArtifactRow[];
    const reference = artifactsBefore.find(
      (row) => row.name === "reference.xlsx",
    );
    expect(reference).toBeDefined();
    await owner.mutation(api.mutations.ImportArtifact_classify, {
      docId: reference!._id,
      disposition: "linked_reference",
    });

    // --- Second pass is a no-op for classified workbooks but recomputes the
    // run summary so the manual relabel is reflected. ---
    const second = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as DispositionResult;
    expect(second.classified).toBe(0);
    expect(second.skipped).toBe(7);
    expect(second.unaccountedRecordCount).toBe(0);
    expect(second.dispositionCounts).toEqual({
      normalized: 2,
      needs_mapping: 1,
      unsupported: 1,
      duplicate_view: 1,
      invalid: 1,
      linked_reference: 1,
    });

    // --- Per-workbook dispositions and counted outcomes. ---
    const collected = (await owner.run(async (ctx) => {
      const rows = await ctx.db.query("importArtifacts").collect();
      return rows.filter((row) => row.deletedAt == null);
    })) as unknown as ArtifactRow[];
    const artifacts = collected.sort((a, b) => (a.name < b.name ? -1 : 1));
    expect(artifacts).toHaveLength(7);

    const byName = new Map(artifacts.map((row) => [row.name, row]));
    const outcomeCounts = (row: ArtifactRow) =>
      JSON.parse(row.rowOutcomeCounts) as Record<string, number>;

    expect(byName.get("beo-clean.xlsx")).toMatchObject({
      disposition: "normalized",
      parseStatus: "parsed",
      totalRowCount: CLEAN_BEO_ROWS.length,
    });
    expect(outcomeCounts(byName.get("beo-clean.xlsx")!)).toEqual({
      header: 3, // title, blank row, timeline table heading
      normalized: 3, // three labelled facts with values
      summary: 1, // printed footer
    });

    expect(byName.get("beo-gap.xlsx")).toMatchObject({
      disposition: "needs_mapping",
      parseStatus: "parsed",
      totalRowCount: GAP_BEO_ROWS.length,
    });
    expect(outcomeCounts(byName.get("beo-gap.xlsx")!)).toEqual({
      header: 1,
      needs_mapping: 1, // labelled row with a missing value
      normalized: 1,
    });

    expect(byName.get("unknown.xlsx")).toMatchObject({
      disposition: "unsupported",
      parseStatus: "parsed",
      totalRowCount: UNKNOWN_ROWS.length,
    });
    expect(outcomeCounts(byName.get("unknown.xlsx")!)).toEqual({
      unsupported: 2,
    });

    const copyRows = ["beo-copy-a.xlsx", "beo-copy-b.xlsx"].map((name) =>
      byName.get(name)!,
    );
    expect(new Set(copyRows.map((row) => row.disposition))).toEqual(
      new Set(["normalized", "duplicate_view"]),
    );
    for (const copy of copyRows) {
      expect(copy.totalRowCount).toBe(COPY_ROWS.length);
      expect(outcomeCounts(copy)).toEqual({ header: 1, normalized: 1 });
    }

    expect(byName.get("broken.xlsx")).toMatchObject({
      disposition: "invalid",
      parseStatus: "failed",
      totalRowCount: 0,
    });
    expect(outcomeCounts(byName.get("broken.xlsx")!)).toEqual({});

    expect(byName.get("reference.xlsx")).toMatchObject({
      disposition: "linked_reference",
      parseStatus: "parsed",
      // The manual relabel kept the counted outcomes.
      totalRowCount: REFERENCE_ROWS.length,
    });
    expect(outcomeCounts(byName.get("reference.xlsx")!)).toEqual({
      unsupported: 2,
    });

    // --- Reconciliation: nothing pending, buckets sum to totals, totals sum
    // to the source row count across the whole archive. ---
    expect(artifacts.every((row) => row.disposition !== "pending")).toBe(true);
    for (const row of artifacts) {
      const summed = Object.values(outcomeCounts(row)).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(summed).toBe(row.totalRowCount);
    }
    const totalRows = artifacts.reduce(
      (sum, row) => sum + row.totalRowCount,
      0,
    );
    expect(totalRows).toBe(TOTAL_SOURCE_ROWS);

    // --- The run carries the roll-up the review stage surfaces. ---
    const run = (await owner.run(async (ctx) => ctx.db.get(importRunId))) as {
      dispositionCounts: string;
      unaccountedRecordCount: number;
    };
    expect(JSON.parse(run.dispositionCounts)).toEqual(second.dispositionCounts);
    expect(run.unaccountedRecordCount).toBe(0);
  });

  it("duplicate order survives a mid-pair classification crash", async () => {
    const tenantId = "tenant-import-disposition-resume";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-disposition-resume-owner",
      role: "owner",
      tenantId,
    });

    const archive = buildStoredZip([
      { name: "copy-first.xlsx", data: Array.from(buildWorkbook(COPY_ROWS)) },
      {
        name: "copy-second.xlsx",
        data: Array.from(buildWorkbook(COPY_ROWS)),
      },
    ]);
    const storageId = (await owner.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob([archive])),
    )) as string;

    const started = (await owner.mutation(api.importCoordinator.startImport, {
      sourceSystem: "tpp_legacy",
      datasetType: "events",
    })) as { importRunId: string };
    const importRunId = started.importRunId;

    await asActions(owner).action(api.archiveInventory.inventoryArchive, {
      importRunId,
      storageId,
      indexReportNames: ["copy-first.xlsx", "copy-second.xlsx"],
    });

    // The crash (review R2-14): the first copy of the byte-identical pair
    // was classified, then the action died before reaching the second. The
    // insertion-ordered artifact list is the order the action itself sees.
    const artifacts = (await owner.run(async (ctx) =>
      (await ctx.db.query("importArtifacts").collect()).filter(
        (row) => (row as { deletedAt?: number | null }).deletedAt == null,
      ),
    )) as Array<{ _id: string; name: string }>;
    const byInsertion = [...artifacts].sort((a, b) => (a._id < b._id ? -1 : 1));
    const firstRow = byInsertion[0];
    const secondRow = byInsertion[1];
    expect(firstRow.name).toBe("copy-first.xlsx");

    await owner.mutation(api.mutations.ImportArtifact_classify, {
      docId: firstRow._id,
      disposition: "normalized",
      totalRowCount: COPY_ROWS.length,
      rowOutcomeCounts: JSON.stringify({ normalized: COPY_ROWS.length }),
    });

    // Resume: the pending second copy must STILL be the duplicate —
    // occurrence order comes from the full artifact list, never from what
    // this invocation happens to see (the pre-fix code would treat it as
    // occurrence 1 and classify it normalized).
    const resumed = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as DispositionResult;
    expect(resumed.classified).toBe(1);
    expect(resumed.skipped).toBe(1);

    const secondAfter = (await owner.run(async (ctx) =>
      ctx.db.get(secondRow._id),
    )) as { disposition: string };
    expect(secondAfter.disposition).toBe("duplicate_view");
  });
});
