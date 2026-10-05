import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { buildStoredZip, buildStyledWorkbook } from "./zipFixture";

/**
 * Runtime proof AC-271 (CF-6.1-03): each mapped record keeps rawSourceData,
 * and for an archive import the record leads to inspectable provenance
 * (workbook/sheet/cell coordinates, raw serial, parser version) kept apart
 * from the normalized value. Read through the same seam the event and client
 * pages use (sourceProvenance.listByCapsuleId). Synthetic data only.
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

interface SourceLinkRow {
  sourceSystem: string;
  recordType: string;
  externalId: string;
  sourceImportRunId: string | null;
  fromReportFile: boolean;
  rawSourceData: string | null;
}

interface LinkDoc {
  capsuleEntity: string;
  capsuleId: string;
  externalId: string;
  rawSourceData?: string;
}

const workbook = buildStyledWorkbook({
  sheetName: "BEO",
  numFmts: [{ id: 164, code: "m/d/yyyy" }],
  xfNumFmtIds: [164],
  cells: [
    { ref: "A1", is: "Event Date:" },
    { ref: "B1", v: "44927", s: 0 },
  ],
  merges: [],
});

const CONTACT = {
  ContactID: "C-271",
  FirstName: "Provenance",
  LastName: "Proof",
  Email: "provenance-proof@example.com",
  Phone: "555-0271",
};

async function linksForRun(owner: Actor, importRunId: string) {
  return (await owner.run(async (ctx) =>
    (await ctx.db.query("externalRecordLinks").collect()).filter(
      (row) =>
        (row as { sourceImportRunId?: string | null }).sourceImportRunId ===
        importRunId,
    ),
  )) as unknown as LinkDoc[];
}

describe("runtime proof: mapped records keep their source (AC-271)", () => {
  it("an archive-imported record keeps its raw row and leads to cell provenance apart from the normalized value", async () => {
    const tenantId = "tenant-record-provenance";
    const proof = harness();
    const owner = proof.asRole({
      subject: "record-provenance-owner",
      role: "owner",
      tenantId,
    });

    const archive = buildStoredZip([
      { name: "beo.xlsx", data: Array.from(workbook) },
    ]);
    const storageId = (await owner.run(async (ctx) =>
      (
        ctx as unknown as {
          storage: { store: (blob: Blob) => Promise<string> };
        }
      ).storage.store(new Blob([archive])),
    )) as string;
    const { importRunId } = (await owner.mutation(
      api.importCoordinator.startImport,
      { sourceSystem: "tpp_legacy", datasetType: "contacts" },
    )) as { importRunId: string };

    await asActions(owner).action(api.archiveInventory.inventoryArchive, {
      importRunId,
      storageId,
      indexReportNames: ["beo.xlsx"],
    });
    await asActions(owner).action(
      api.archiveDisposition.classifyArchiveWorkbooks,
      { importRunId },
    );
    await asActions(owner).action(
      api.archiveProvenance.recordArchiveProvenance,
      { importRunId },
    );

    const counts = JSON.stringify({ contacts: 1 });
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
    const result = (await asActions(owner).action(
      api.importCommit.commitImportRun,
      { importRunId, rawRows: [CONTACT] },
    )) as { committed: number };
    expect(result.committed).toBe(1);

    // Every link the run wrote keeps the original row as imported.
    const links = await linksForRun(owner, importRunId);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.rawSourceData, link.externalId).toBeTruthy();
      expect(JSON.parse(link.rawSourceData!).sourceRow).toEqual(CONTACT);
    }
    const clientLink = links.find((l) => l.capsuleEntity === "client")!;
    expect(clientLink.externalId).toBe("C-271");

    // The client page reads the raw row, apart from the normalized record,
    // and is told the record came from a report file of this run.
    const rows = (await owner.query(api.sourceProvenance.listByCapsuleId, {
      capsuleId: clientLink.capsuleId,
    })) as SourceLinkRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceSystem: "tpp_legacy",
      externalId: "C-271",
      sourceImportRunId: importRunId,
      fromReportFile: true,
    });
    // Raw row as received, apart from the normalized fields beside it.
    expect(JSON.parse(rows[0]!.rawSourceData!)).toMatchObject({
      externalId: "C-271",
      givenName: "Provenance",
      sourceRow: CONTACT,
    });
    const client = (await owner.run(async (ctx) =>
      ctx.db.get(clientLink.capsuleId as never),
    )) as unknown as Record<string, unknown>;
    expect(client).toBeTruthy();
    expect(client).not.toHaveProperty("rawSourceData");

    // That run's report file keeps coordinates, the raw serial and the
    // reader version next to (not in place of) the interpreted value.
    const artifacts = (await owner.query(
      api.queries.listImportArtifactByImportRunId,
      { importRunId },
    )) as Array<{ provenance: string }>;
    const doc = JSON.parse(artifacts[0]!.provenance) as {
      workbook: {
        parserVersion: string;
        dateSystem: string;
        sheets: Array<{
          name: string;
          cells: Array<{ ref: string; raw: string; value?: unknown }>;
        }>;
      };
    };
    expect(doc.workbook.parserVersion).toBe("xlsx-interpreted-1");
    expect(doc.workbook.dateSystem).toBe("1900");
    expect(doc.workbook.sheets[0]!.name).toBe("BEO");
    expect(
      doc.workbook.sheets[0]!.cells.find((c) => c.ref === "B1"),
    ).toMatchObject({ raw: "44927", value: "2023-01-01" });

    // Another company never sees this record's source.
    const stranger = proof.asRole({
      subject: "record-provenance-stranger",
      role: "owner",
      tenantId: "tenant-record-provenance-other",
    });
    expect(
      await stranger.query(api.sourceProvenance.listByCapsuleId, {
        capsuleId: clientLink.capsuleId,
      }),
    ).toEqual([]);
  });

  it("a record from a plain row import keeps its raw row and is not marked as from a report file", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "record-provenance-rows-owner",
      role: "owner",
      tenantId: "tenant-record-provenance-rows",
    });
    const imported = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "contacts",
        sourceSystem: "tpp_legacy",
        rows: [CONTACT],
      },
    )) as { importRunId: string; committed: number };
    expect(imported.committed).toBe(1);

    const links = await linksForRun(owner, imported.importRunId);
    const clientLink = links.find((l) => l.capsuleEntity === "client")!;
    const rows = (await owner.query(api.sourceProvenance.listByCapsuleId, {
      capsuleId: clientLink.capsuleId,
    })) as SourceLinkRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceImportRunId: imported.importRunId,
      fromReportFile: false,
    });
    expect(JSON.parse(rows[0]!.rawSourceData!)).toMatchObject({
      sourceRow: CONTACT,
    });
  });
});
