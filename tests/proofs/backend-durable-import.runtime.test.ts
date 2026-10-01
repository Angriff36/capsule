/**
 * Runtime proof: durable import (AC-631 — spec BE-16.3) and the source
 * version on every run (AC-269 — CF-6.1-01).
 *
 * - Survives browser closure and worker retry: the run and its checkpoint
 *   live on the server; a commit that stops part-way leaves the run
 *   "committing", and calling commit again finishes it with no duplicate.
 * - Stop (cancel): nothing after the stop starts; each record the run made
 *   that nobody changed is taken back with the files the run attached; a
 *   record a person changed is kept and named; the stopped run cannot be
 *   committed again.
 * - Every quick import keeps a source checksum (the file's, or the rows').
 * - Archive extraction refuses path traversal, absolute paths, too much
 *   expansion, encrypted and corrupt entries and duplicate names, and a
 *   workbook's formulas and macros are recorded, never run.
 */
import { deflateRawSync } from "node:zlib";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  readZipEntries,
  ZipArchiveError,
} from "../../src/lib/tppReports/zipReader";
import { readXlsxWorkbookFromEntries } from "../../src/lib/tppReports/xlsxWorkbookParser";

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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5GqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
const asActions = (actor: Actor) => actor as unknown as ActionRunner;
type Storage = { storage: { store(blob: Blob): Promise<string> } };

type CommitResult = {
  committed: number;
  skipped: number;
  pending: number;
  stoppedEarly?: boolean;
};

type Row = Record<string, unknown> & {
  _id: string;
  tenantId: string;
  deletedAt?: number | null;
};

async function tableRows(owner: Actor, table: string, tenantId: string) {
  return (await owner.run(async (ctx) =>
    (await ctx.db.query(table as never).collect()).filter(
      (row) => (row as unknown as Row).tenantId === tenantId,
    ),
  )) as unknown as Row[];
}

async function runRow(owner: Actor, runId: string) {
  return (await owner.run(async (ctx) => ctx.db.get(runId as never))) as {
    status: string;
    checksum?: string;
    failureDetails?: string;
  } | null;
}

async function startCommitting(
  owner: Actor,
  datasetType: string,
  count: number,
): Promise<string> {
  const { importRunId } = (await owner.mutation(
    api.importCoordinator.startImport,
    { sourceSystem: "tpp_legacy", datasetType },
  )) as { importRunId: string };
  const counts = JSON.stringify({ [datasetType]: count });
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
  return importRunId;
}

const commit = async (
  owner: Actor,
  args: { importRunId: string; rawRows: unknown[]; maxRecords?: number },
) =>
  (await asActions(owner).action(
    api.importCommit.commitImportRun,
    args,
  )) as CommitResult;

const venueRows = (prefix: string) =>
  [1, 2, 3, 4].map((n) => ({
    VenueID: `${prefix}-${n}`,
    VenueName: `${prefix} Venue ${n}`,
    VenueType: "Office",
    Address: `${n} Pine Street`,
    City: "Seattle",
    State: "WA",
    ZipCode: "98101",
    Capacity: 50 + n,
  }));

describe("runtime proof: durable import (AC-631, AC-269)", () => {
  it("a run that stopped part-way (browser closed, worker died) finishes on the next try with nothing doubled", async () => {
    const tenantId = "tenant-durable-import-resume";
    const owner = harness().asRole({
      subject: "durable-import-owner",
      role: "owner",
      tenantId,
    });
    const rows = venueRows("R");
    const runId = await startCommitting(owner, "venues", rows.length);
    const first = await commit(owner, {
      importRunId: runId,
      rawRows: rows,
      maxRecords: 2,
    });
    expect(first.stoppedEarly).toBe(true);
    expect((await runRow(owner, runId))?.status).toBe("committing");

    // A different invocation (new tab, retried worker) finishes the run.
    const second = await commit(owner, { importRunId: runId, rawRows: rows });
    expect(second.committed).toBe(2);
    expect((await runRow(owner, runId))?.status).toBe("completed");
    expect(await tableRows(owner, "venues", tenantId)).toHaveLength(4);
  });

  it("stopping an import starts nothing more, takes back untouched records and their files, and keeps changed ones", async () => {
    const tenantId = "tenant-durable-import-stop";
    const owner = harness().asRole({
      subject: "durable-import-stop-owner",
      role: "owner",
      tenantId,
    });

    // Venues: 2 of 4 made, then a person changes venue 1.
    const rows = venueRows("S");
    const runId = await startCommitting(owner, "venues", rows.length);
    await commit(owner, { importRunId: runId, rawRows: rows, maxRecords: 2 });
    const madeVenues = await tableRows(owner, "venues", tenantId);
    expect(madeVenues).toHaveLength(2);
    const changed = madeVenues.find((venue) => venue.name === "S Venue 1")!;
    const untouched = madeVenues.find((venue) => venue.name === "S Venue 2")!;
    await owner.mutation(api.mutations.Venue_changeCapacity, {
      docId: changed._id,
      capacity: 999,
    });

    const stopped = (await asActions(owner).action(
      api.importCancel.cancelImportRun,
      { importRunId: runId, reason: "Wrong file" },
    )) as { removed: number; retired: number; kept: string[] };
    expect(stopped.removed).toBe(1);
    expect(stopped.kept).toEqual(["S Venue 1"]);

    const run = await runRow(owner, runId);
    expect(run?.status).toBe("failed");
    expect(run?.failureDetails).toBe("Stopped by a person: Wrong file");

    const after = await tableRows(owner, "venues", tenantId);
    expect(after).toHaveLength(2); // venues 3 and 4 never started
    expect(after.find((v) => v._id === untouched._id)?.deletedAt).toEqual(
      expect.any(Number),
    );
    expect(after.find((v) => v._id === changed._id)?.deletedAt ?? null).toBe(
      null,
    );
    expect(after.find((v) => v._id === changed._id)?.capacity).toBe(999);

    const links = (
      await tableRows(owner, "externalRecordLinks", tenantId)
    ).filter((link) => link.sourceImportRunId === runId);
    expect(
      links.find((link) => link.capsuleId === untouched._id)?.conflictStatus,
    ).toBe("superseded");
    expect(
      links.find((link) => link.capsuleId === changed._id)?.conflictStatus,
    ).toBe("resolved");

    // The stopped run cannot bring anything else in.
    const retry = await commit(owner, {
      importRunId: runId,
      rawRows: rows,
    }).catch((error: unknown) => error);
    expect(String(retry)).toContain("committing");
    expect(await tableRows(owner, "venues", tenantId)).toHaveLength(2);

    // Stopping again only finishes the take-back; nothing changes.
    const again = (await asActions(owner).action(
      api.importCancel.cancelImportRun,
      { importRunId: runId, reason: "Wrong file" },
    )) as { removed: number; kept: string[] };
    expect(again.removed).toBe(0);
    expect(again.kept).toEqual(["S Venue 1"]);
  });

  it("stopping an event import takes back the event with the files the run attached", async () => {
    const tenantId = "tenant-durable-import-stop-files";
    const owner = harness().asRole({
      subject: "durable-import-files-owner",
      role: "owner",
      tenantId,
    });
    await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "contacts",
      sourceSystem: "tpp_legacy",
      rows: [{ ContactID: "C-1", FirstName: "Stop", LastName: "Proof" }],
    });
    const fileId = await owner.run(async (ctx) =>
      (ctx as unknown as Storage).storage.store(new Blob(["beo"])),
    );
    const rows = ["E-1", "E-2"].map((id, n) => ({
      EventID: id,
      EventName: `Stop Event ${n + 1}`,
      ClientID: "C-1",
      EventDate: "2026-09-01",
      StartTime: "17:00",
      ExpectedCount: 20,
      Files: [{ FileName: `BEO ${id}.pdf`, FileSize: 3, StorageId: fileId }],
    }));
    const runId = await startCommitting(owner, "events", rows.length);
    await commit(owner, { importRunId: runId, rawRows: rows, maxRecords: 1 });
    const [event] = await tableRows(owner, "events", tenantId);
    expect(event).toBeDefined();
    const filesBefore = (
      await tableRows(owner, "attachments", tenantId)
    ).filter((file) => file.parentId === event!._id);
    expect(filesBefore).toHaveLength(1);

    const stopped = (await asActions(owner).action(
      api.importCancel.cancelImportRun,
      { importRunId: runId, reason: "Started too early" },
    )) as { removed: number; kept: string[] };
    expect(stopped).toMatchObject({ removed: 1, kept: [] });

    const events = await tableRows(owner, "events", tenantId);
    expect(events).toHaveLength(1); // Stop Event 2 never started
    expect(events[0]!.deletedAt).toEqual(expect.any(Number));
    const filesAfter = (await tableRows(owner, "attachments", tenantId)).filter(
      (file) => file.parentId === event!._id,
    );
    expect(filesAfter.every((file) => typeof file.deletedAt === "number")).toBe(
      true,
    );
  });

  it("a finished import is not stopped; it is undone with Undo import", async () => {
    const tenantId = "tenant-durable-import-finished";
    const owner = harness().asRole({
      subject: "durable-import-finished-owner",
      role: "owner",
      tenantId,
    });
    const done = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "venues",
      sourceSystem: "tpp_legacy",
      rows: venueRows("F").slice(0, 1),
    })) as { importRunId: string };
    const refused = await asActions(owner)
      .action(api.importCancel.cancelImportRun, {
        importRunId: done.importRunId,
        reason: "Too late",
      })
      .catch((error: unknown) => error);
    expect(String(refused)).toContain("Undo import");
  });

  it("every quick import keeps a source checksum (AC-269)", async () => {
    const tenantId = "tenant-durable-import-checksum";
    const owner = harness().asRole({
      subject: "durable-import-checksum-owner",
      role: "owner",
      tenantId,
    });
    const rows = venueRows("K").slice(0, 1);
    const fromRows = (await asActions(owner).action(
      api.quickImport.importFile,
      { datasetType: "venues", sourceSystem: "tpp_legacy", rows },
    )) as { importRunId: string };
    const rowsChecksum = (await runRow(owner, fromRows.importRunId))?.checksum;
    expect(rowsChecksum).toMatch(/^rows-sha256:[0-9a-f]{64}$/);

    const fromFile = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "venues",
        sourceSystem: "tpp_legacy",
        rows: venueRows("L").slice(0, 1),
        checksum: "a".repeat(64),
      },
    )) as { importRunId: string };
    expect((await runRow(owner, fromFile.importRunId))?.checksum).toBe(
      "a".repeat(64),
    );
  });
});

// --- archive extraction defenses (BE-16.3 second paragraph) -----------------

function zipOf(
  entries: Array<{ name: string; data: Buffer; flags?: number; size?: number }>,
): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const payload = deflateRawSync(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(entry.flags ?? 0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, payload);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(entry.flags ?? 0, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(payload.length, 20);
    record.writeUInt32LE(entry.size ?? entry.data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += 30 + name.length + payload.length;
  }
  const size = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

function refusal(archive: Buffer, limits = {}): string {
  try {
    readZipEntries(archive, limits);
  } catch (error) {
    expect(error).toBeInstanceOf(ZipArchiveError);
    return (error as ZipArchiveError).code;
  }
  return "accepted";
}

describe("archive extraction defenses (AC-631)", () => {
  const data = Buffer.from("report");

  it("refuses unsafe names, duplicates, encryption, corruption and too much expansion", () => {
    expect(refusal(zipOf([{ name: "../escape.xlsx", data }]))).toBe(
      "traversal",
    );
    expect(refusal(zipOf([{ name: "/etc/report.xlsx", data }]))).toBe(
      "absolute_path",
    );
    expect(refusal(zipOf([{ name: "C:\\report.xlsx", data }]))).toBe(
      "absolute_path",
    );
    expect(
      refusal(
        zipOf([
          { name: "a.xlsx", data },
          { name: "a.xlsx", data },
        ]),
      ),
    ).toBe("duplicate_name");
    expect(refusal(zipOf([{ name: "locked.xlsx", data, flags: 1 }]))).toBe(
      "encrypted",
    );
    expect(
      refusal(zipOf([{ name: "big.xlsx", data: Buffer.alloc(500) }]), {
        maxEntryExpandedBytes: 100,
      }),
    ).toBe("entry_bytes_exceeded");
    expect(refusal(Buffer.from("not a zip at all"))).toBe("not_a_zip");
  });

  it("records a workbook's formulas and macros without running them", () => {
    const text = (value: string) => new TextEncoder().encode(value);
    const workbook = readXlsxWorkbookFromEntries(
      new Map([
        [
          "xl/workbook.xml",
          text(
            '<workbook><sheets><sheet name="Totals" sheetId="1" id="rId1"/></sheets></workbook>',
          ),
        ],
        [
          "xl/_rels/workbook.xml.rels",
          text(
            '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
          ),
        ],
        [
          "xl/worksheets/sheet1.xml",
          text(
            '<worksheet><sheetData><row r="1"><c r="A1"><f>SUM(2,3)</f><v>5</v></c><c r="B1"><f>WEBSERVICE("http://example.com")</f></c></row></sheetData></worksheet>',
          ),
        ],
        ["xl/vbaProject.bin", text("macro bytes")],
      ]),
    );
    expect(workbook.macros).toBe("present-not-executed");
    const cells = workbook.sheets[0]!.cells;
    expect(cells.find((cell) => cell.ref === "A1")).toMatchObject({
      outcome: "formula_cached_value",
      formula: "SUM(2,3)",
    });
    expect(cells.find((cell) => cell.ref === "B1")).toMatchObject({
      outcome: "formula_without_cached_value",
    });
  });
});
