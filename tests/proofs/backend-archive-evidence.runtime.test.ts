import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  buildStoredZip,
  buildStyledWorkbook,
  buildWorkbook,
  bytesOf,
  sha256Hex,
} from "./zipFixture";

/**
 * Runtime proof AC-629 (BE-16.1): an import run inventories every file and
 * source section; each item gets exactly one disposition; success requires
 * zero unaccounted records, not that every row became a native record. The
 * run and each item keep the full source contract: original bytes +
 * checksum, parser version, workbook/sheet/cell coordinates, raw value,
 * interpreted value, timezone and date-system information, and the
 * materialization result (outcome + counted rows; an archive-only finish
 * makes no records). Driven through the same stages the import page runs:
 * inventory → sort → provenance → explain the report-list gap → finish
 * through importCommit with no rows. Synthetic workbooks only.
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

interface Cell {
  ref: string;
  raw: string;
  outcome: string;
  value?: string | number | boolean;
}
interface Artifact {
  name: string;
  checksum: string | null;
  disposition: string;
  parseStatus: string;
  totalRowCount: number;
  rowOutcomeCounts: string;
  provenance: string;
}
interface Run {
  status: string;
  version: number;
  archiveStorageId: string | null;
  archiveChecksum: string | null;
  archiveWorkbookCount: number;
  unaccountedRecordCount: number;
  dispositionCounts: string;
  discrepancyNote?: string;
}

const beo = buildStyledWorkbook({
  sheetName: "BEO",
  numFmts: [{ id: 164, code: "m/d/yyyy" }],
  xfNumFmtIds: [164],
  cells: [
    { ref: "A1", is: "Banquet Event Order" },
    { ref: "A3", is: "Event Date:" },
    { ref: "B3", v: "44927", s: 0 },
    { ref: "A4", is: "Guarantee:" },
    { ref: "B4", v: "75" },
  ],
  merges: ["A1:C1"],
});
const unknown = buildWorkbook([
  ["Client List", "Updated"],
  ["Acme Corp", "x"],
]);
const broken = bytesOf("this is not a zip");
const files: Array<{ name: string; bytes: Uint8Array }> = [
  { name: "beo.xlsx", bytes: beo },
  { name: "beo-copy.xlsx", bytes: beo },
  { name: "clients.xlsx", bytes: unknown },
  { name: "broken.xlsx", bytes: new Uint8Array(broken) },
];
const FINAL = new Set([
  "normalized",
  "linked_reference",
  "duplicate_view",
  "needs_mapping",
  "unsupported",
  "invalid",
]);

describe("runtime proof: archive evidence satisfies the full source contract (AC-629)", () => {
  it("every item keeps bytes, coordinates, raw and interpreted values, and its result", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "archive-evidence-owner",
      role: "owner",
      tenantId: "tenant-archive-evidence",
    });
    const archive = buildStoredZip(
      files.map((file) => ({ name: file.name, data: Array.from(file.bytes) })),
    );
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

    // The report list names three of the four files plus one that is missing.
    await asActions(owner).action(api.archiveInventory.inventoryArchive, {
      importRunId,
      storageId,
      indexReportNames: [
        "beo.xlsx",
        "beo-copy.xlsx",
        "clients.xlsx",
        "ghost.xlsx",
      ],
    });
    const sorted = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as { unaccountedRecordCount: number };
    expect(sorted.unaccountedRecordCount).toBe(0);
    await asActions(owner).action(
      api.archiveProvenance.recordArchiveProvenance,
      {
        importRunId,
      },
    );

    // --- Run: original bytes + checksum, every file inventoried. ---
    const run = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as unknown as Run;
    expect(run.archiveStorageId).toBe(storageId);
    expect(run.archiveChecksum).toBe(await sha256Hex(archive));
    expect(run.archiveWorkbookCount).toBe(files.length);

    // --- Each item: exactly one final disposition, every row counted, its
    // own checksum and parser version. ---
    const artifacts = (await owner.query(
      api.queries.listImportArtifactByImportRunId,
      { importRunId },
    )) as Artifact[];
    expect(artifacts.map((a) => a.name).sort()).toEqual(
      files.map((f) => f.name).sort(),
    );
    const byName = new Map(artifacts.map((a) => [a.name, a]));
    for (const file of files) {
      const artifact = byName.get(file.name)!;
      expect(FINAL.has(artifact.disposition), file.name).toBe(true);
      expect(artifact.checksum).toBe(await sha256Hex(file.bytes));
      const rows = Object.values(
        JSON.parse(artifact.rowOutcomeCounts) as Record<string, number>,
      ).reduce((sum, n) => sum + n, 0);
      expect(rows, file.name).toBe(artifact.totalRowCount);
      const provenance = JSON.parse(artifact.provenance) as {
        archiveEntry: string;
        workbook: { parserVersion: string };
      };
      expect(provenance.archiveEntry).toBe(file.name);
      expect(provenance.workbook.parserVersion).toBe("xlsx-interpreted-1");
    }
    expect(byName.get("beo.xlsx")!.disposition).toBe("normalized");
    expect(byName.get("beo-copy.xlsx")!.disposition).toBe("duplicate_view");
    expect(byName.get("clients.xlsx")!.disposition).toBe("unsupported");
    expect(byName.get("broken.xlsx")!).toMatchObject({
      disposition: "invalid",
      parseStatus: "failed",
    });

    // --- Coordinates, raw next to interpreted, date system, timezone. ---
    const workbook = (
      JSON.parse(byName.get("beo.xlsx")!.provenance) as {
        workbook: {
          dateSystem: string;
          timezone: string;
          sheets: Array<{
            name: string;
            mergedRanges: string[];
            cells: Cell[];
          }>;
        };
      }
    ).workbook;
    expect(workbook.dateSystem).toBe("1900");
    expect(workbook.timezone).toBe("naive-local");
    const sheet = workbook.sheets[0]!;
    expect(sheet.name).toBe("BEO");
    expect(sheet.mergedRanges).toEqual(["A1:C1"]);
    expect(sheet.cells.find((c) => c.ref === "B3")).toMatchObject({
      raw: "44927",
      value: "2023-01-01",
      outcome: "date_1900",
    });
    const brokenDoc = JSON.parse(byName.get("broken.xlsx")!.provenance) as {
      workbook: { error: string };
    };
    expect(brokenDoc.workbook.error).toContain("Not a ZIP container");

    // --- Success = zero unaccounted AND the report-list gap explained; it
    // never needs every row to become a record. ---
    await owner.mutation(api.mutations.ImportRun_recordParse, {
      docId: importRunId,
      recordCounts: "{}",
    });
    await owner.mutation(api.mutations.ImportRun_validate, {
      docId: importRunId,
    });
    await owner.mutation(api.mutations.ImportRun_beginReview, {
      docId: importRunId,
    });
    await owner.mutation(api.mutations.ImportRun_approveReview, {
      docId: importRunId,
      finalRecordCounts: "{}",
    });
    await expect(
      asActions(owner).action(api.importCommit.commitImportRun, {
        importRunId,
        rawRows: [],
      }),
    ).rejects.toThrow(/Guard \d+ failed/);
    await owner.mutation(api.mutations.ImportRun_explainArchiveDiscrepancy, {
      docId: importRunId,
      note: "ghost.xlsx was deleted in the old system; broken.xlsx came later.",
    });
    const finished = (await asActions(owner).action(
      api.importCommit.commitImportRun,
      { importRunId, rawRows: [] },
    )) as { committed: number; skipped: number; pending: number };
    expect(finished).toMatchObject({ committed: 0, skipped: 0, pending: 0 });

    // --- Materialization result: completed, no records made, every file's
    // outcome still on the run. ---
    const done = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as unknown as Run;
    expect(done.status).toBe("completed");
    expect(done.unaccountedRecordCount).toBe(0);
    expect(done.discrepancyNote).toContain("ghost.xlsx");
    expect(JSON.parse(done.dispositionCounts)).toEqual({
      normalized: 1,
      duplicate_view: 1,
      unsupported: 1,
      invalid: 1,
    });
    const made = await owner.run(async (ctx) => ({
      links: (await ctx.db.query("externalRecordLinks").collect()).length,
      events: (await ctx.db.query("events").collect()).length,
    }));
    expect(made).toEqual({ links: 0, events: 0 });
  });
});
