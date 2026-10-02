/**
 * Runtime proof: AC-056 (PR01-08) — closing the browser does not stop a
 * committed run; cancel stops unstarted work; compensation touches only
 * unchanged records owned by the run and reports what needs a person.
 *
 * - The first commit keeps the run's rows on the server. A run whose worker
 *   stopped part-way is continued by ANOTHER manager with no rows at all —
 *   nothing from the first browser is needed — and nothing is doubled.
 * - Stop: rows not yet started never start; a record a person changed stays
 *   and is named in the run's saved report; an untouched record is removed
 *   again; the checkpoint the run reached is kept.
 * - A run that finished is never taken back, even by a late take-back call.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5GqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
const asActions = (actor: Actor) => actor as unknown as ActionRunner;
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

async function runDoc(owner: Actor, runId: string) {
  return (await owner.run(async (ctx) => ctx.db.get(runId as never))) as {
    status: string;
    sourceRowsStorageId?: string;
    commitCheckpoint?: string;
    stopReport?: string;
  } | null;
}

async function startCommitting(owner: Actor, count: number): Promise<string> {
  const { importRunId } = (await owner.mutation(
    api.importCoordinator.startImport,
    { sourceSystem: "tpp_legacy", datasetType: "venues" },
  )) as { importRunId: string };
  const counts = JSON.stringify({ venues: count });
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

const rowsFor = (prefix: string) =>
  [1, 2, 3, 4, 5].map((n) => ({
    VenueID: `${prefix}-${n}`,
    VenueName: `${prefix} Hall ${n}`,
    VenueType: "Office",
    Address: `${n} Cedar Road`,
    City: "Tacoma",
    State: "WA",
    ZipCode: "98402",
    Capacity: 80 + n,
  }));

const commit = async (
  actor: Actor,
  args: { importRunId: string; rawRows: unknown[]; maxRecords?: number },
) =>
  (await asActions(actor).action(api.importCommit.commitImportRun, args)) as {
    committed: number;
    stoppedEarly?: boolean;
  };

describe("runtime proof: import cancel and browser-free continue (AC-056)", () => {
  it("another manager continues a run from its kept rows with nothing from the first browser", async () => {
    const tenantId = "tenant-import-cancel-continue";
    const proof = harness();
    const first = proof.asRole({
      subject: "import-cancel-first",
      role: "owner",
      tenantId,
    });
    const second = proof.asRole({
      subject: "import-cancel-second",
      role: "owner",
      tenantId,
    });
    const rows = rowsFor("C");
    const runId = await startCommitting(first, rows.length);
    const part = await commit(first, {
      importRunId: runId,
      rawRows: rows,
      maxRecords: 2,
    });
    expect(part.stoppedEarly).toBe(true);
    expect((await runDoc(first, runId))?.sourceRowsStorageId).toBeTruthy();

    // The first browser is gone. Another manager presses Continue: no rows.
    const rest = await commit(second, { importRunId: runId, rawRows: [] });
    expect(rest.committed).toBe(3);
    expect((await runDoc(first, runId))?.status).toBe("completed");
    const venues = await tableRows(first, "venues", tenantId);
    expect(venues).toHaveLength(5);
    expect(new Set(venues.map((venue) => venue.name)).size).toBe(5);
  });

  it("cancel stops unstarted work and leaves committed records owned by the run that a person changed", async () => {
    const tenantId = "tenant-import-cancel-unstarted";
    const owner = harness().asRole({
      subject: "import-cancel-owner",
      role: "owner",
      tenantId,
    });
    const rows = rowsFor("U");
    const runId = await startCommitting(owner, rows.length);
    await commit(owner, { importRunId: runId, rawRows: rows, maxRecords: 3 });
    const checkpointBefore = (await runDoc(owner, runId))?.commitCheckpoint;
    const made = await tableRows(owner, "venues", tenantId);
    expect(made).toHaveLength(3);
    const edited = made.find((venue) => venue.name === "U Hall 2")!;
    await owner.mutation(api.mutations.Venue_changeCapacity, {
      docId: edited._id,
      capacity: 300,
    });

    const result = (await asActions(owner).action(
      api.importCancel.cancelImportRun,
      { importRunId: runId, reason: "Client sent a newer list" },
    )) as { removed: number; kept: string[] };
    expect(result).toMatchObject({ removed: 2, kept: ["U Hall 2"] });

    const after = await tableRows(owner, "venues", tenantId);
    // Rows 4 and 5 never started.
    expect(after.map((venue) => venue.name).sort()).toEqual([
      "U Hall 1",
      "U Hall 2",
      "U Hall 3",
    ]);
    const live = after.filter((venue) => venue.deletedAt == null);
    expect(live.map((venue) => venue.name)).toEqual(["U Hall 2"]);
    expect(live[0]!.capacity).toBe(300);

    const run = await runDoc(owner, runId);
    expect(run?.status).toBe("failed");
    // The checkpoint the run reached is kept for the record.
    expect(run?.commitCheckpoint).toBe(checkpointBefore);
    expect(JSON.parse(run!.stopReport!)).toMatchObject({
      removed: 2,
      kept: ["U Hall 2"],
      done: true,
    });

    // Continue is refused once stopped: nothing more is brought in.
    const retry = await commit(owner, {
      importRunId: runId,
      rawRows: [],
    }).catch((error: unknown) => error);
    expect(String(retry)).toContain("committing");
    expect(await tableRows(owner, "venues", tenantId)).toHaveLength(3);
  });

  it("a finished run is never taken back, even by a late take-back", async () => {
    const tenantId = "tenant-import-cancel-finished";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-cancel-finished",
      role: "owner",
      tenantId,
    });
    const rows = rowsFor("F").slice(0, 2);
    const runId = await startCommitting(owner, rows.length);
    await commit(owner, { importRunId: runId, rawRows: rows });
    expect((await runDoc(owner, runId))?.status).toBe("completed");

    const links = (await tableRows(owner, "externalRecordLinks", tenantId))
      .filter((link) => link.sourceImportRunId === runId)
      .map((link) => link._id);
    for (const linkId of links) {
      const outcome = await owner.mutation(
        internal.importCancel.takeBackLink as never,
        { importRunId: runId, linkId } as never,
      );
      expect(outcome).toEqual({ kind: "none" });
    }
    const venues = await tableRows(owner, "venues", tenantId);
    expect(venues.every((venue) => venue.deletedAt == null)).toBe(true);
  });
});
