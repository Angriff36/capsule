import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildStoredZip, buildWorkbook } from "./zipFixture";

/**
 * Runtime proof AC-027 (PR01-09): archive success requires zero unaccounted
 * records. Commit is refused while any inventoried workbook is unclassified
 * (unaccountedRecordCount starts at the inventoried workbook count), and a
 * completed run keeps its disposition roll-up — partial, unsupported and
 * duplicate content stays visible after the completed badge, so completion
 * never implies all source data became operational records. The supplied
 * index matches the archive here; the index-discrepancy half of the gate is
 * proven by import-archive-inventory.runtime.test.ts (AC-020).
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
  dispositionCounts: Record<string, number>;
  unaccountedRecordCount: number;
}

const CLEAN_BEO_ROWS: string[][] = [
  ["Banquet Event Order"],
  [],
  ["Event Date:", "2026-06-12"],
  ["Guarantee:", "120"],
  ["Time", "", "Name"],
  ["Site:", "Terrace"],
  ["Printed Date:", "2026-05-30"],
];

const GAP_BEO_ROWS: string[][] = [
  ["Banquet Event Order"],
  ["Event Date:", ""],
  ["Vendor Contact:", "Marisol"],
];

const UNKNOWN_ROWS: string[][] = [
  ["Client List", "Updated"],
  ["Acme Corp", "x"],
];

const COPY_ROWS: string[][] = [["Banquet Event Order"], ["Guarantee:", "40"]];

describe("runtime proof: import archive completion (AC-027)", () => {
  it("completion requires zero unaccounted records", async () => {
    const tenantId = "tenant-import-archive-completion";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-completion-owner",
      role: "owner",
      tenantId,
    });

    const names = [
      "beo-clean.xlsx",
      "beo-gap.xlsx",
      "unknown.xlsx",
      "beo-copy-a.xlsx",
      "beo-copy-b.xlsx",
    ];
    const archive = buildStoredZip([
      {
        name: "beo-clean.xlsx",
        data: Array.from(buildWorkbook(CLEAN_BEO_ROWS)),
      },
      { name: "beo-gap.xlsx", data: Array.from(buildWorkbook(GAP_BEO_ROWS)) },
      { name: "unknown.xlsx", data: Array.from(buildWorkbook(UNKNOWN_ROWS)) },
      { name: "beo-copy-a.xlsx", data: Array.from(buildWorkbook(COPY_ROWS)) },
      { name: "beo-copy-b.xlsx", data: Array.from(buildWorkbook(COPY_ROWS)) },
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
      indexReportNames: names, // index matches the archive — no discrepancy
    });

    // Inventory seeds the count: every workbook starts unaccounted.
    const afterInventory = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as {
      archiveWorkbookCount: number;
      unaccountedRecordCount: number;
      dispositionCounts: string;
    };
    expect(afterInventory.archiveWorkbookCount).toBe(5);
    expect(afterInventory.unaccountedRecordCount).toBe(5);
    expect(afterInventory.dispositionCounts).toBe("{}");

    // Walk the run to the committing stage with the generated commands.
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

    // --- Commit is refused while records are unaccounted. ---
    const versionRefused = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { version: number; status: string };
    expect(versionRefused.status).toBe("committing");
    await expect(
      owner.mutation(api.mutations.ImportRun_commit, {
        docId: importRunId,
        version: versionRefused.version,
      }),
    ).rejects.toThrow(/Guard \d+ failed/);
    const stillCommitting = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { status: string; unaccountedRecordCount: number };
    expect(stillCommitting.status).toBe("committing");
    expect(stillCommitting.unaccountedRecordCount).toBe(5);

    // --- Classification accounts for every workbook; commit proceeds. ---
    const disposition = (await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    )) as DispositionResult;
    expect(disposition.classified).toBe(5);
    expect(disposition.unaccountedRecordCount).toBe(0);
    expect(disposition.dispositionCounts).toEqual({
      normalized: 2, // clean BEO + the first copy
      needs_mapping: 1, // partial: the gap BEO stays visible
      unsupported: 1,
      duplicate_view: 1,
    });

    const versionAccounted = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as { version: number };
    const committed = (await owner.mutation(api.mutations.ImportRun_commit, {
      docId: importRunId,
      version: versionAccounted.version,
    })) as { status: string };
    expect(committed.status).toBe("completed");

    // --- The completed run keeps the disposition roll-up visible: partial,
    // unsupported and duplicate content did NOT become operational records,
    // and the completed badge does not claim it did. ---
    const completed = (await owner.run(async (ctx) =>
      ctx.db.get(importRunId),
    )) as {
      status: string;
      dispositionCounts: string;
      unaccountedRecordCount: number;
      archiveWorkbookCount: number;
    };
    expect(completed.status).toBe("completed");
    expect(completed.unaccountedRecordCount).toBe(0);
    expect(completed.archiveWorkbookCount).toBe(5);
    expect(JSON.parse(completed.dispositionCounts)).toEqual({
      normalized: 2,
      needs_mapping: 1,
      unsupported: 1,
      duplicate_view: 1,
    });

    const artifacts = (await owner.run(async (ctx) => {
      const rows = await ctx.db.query("importArtifacts").collect();
      return rows.filter((row) => row.deletedAt == null);
    })) as Array<{ disposition: string }>;
    expect(artifacts).toHaveLength(5);
    expect(artifacts.every((row) => row.disposition !== "pending")).toBe(true);
  });

  it("a pre-release legacy run without the R2 fields still completes", async () => {
    // Review round 2: the R2 fields are optional for rows created before
    // they existed, and absence must read as zero in the commit gate — a
    // legacy committing run is completable, never stranded.
    const tenantId = "tenant-import-legacy-run";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-legacy-run-owner",
      role: "owner",
      tenantId,
    });

    const legacyRunId = (await owner.run(async (ctx) =>
      ctx.db.insert("importRuns", {
        tenantId,
        sourceSystem: "tpp_legacy",
        datasetType: "venues",
        status: "committing",
        recordCounts: "{}",
        actorId: "",
        reviewApprovedAt: Date.now(),
        deletedAt: null,
        version: 0,
      }),
    )) as unknown as string;

    const committed = (await owner.mutation(api.mutations.ImportRun_commit, {
      docId: legacyRunId,
    })) as { status: string };
    expect(committed.status).toBe("completed");
  });
});
