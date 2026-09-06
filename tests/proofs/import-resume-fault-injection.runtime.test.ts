/**
 * Runtime proof: import checkpoints + resume with fault injection (R2-6 /
 * AC-024 — specs/ralph/production-01-import-archive.md PR01-05).
 *
 * "A failure after any parent or child write resumes missing children,
 * deposits, lines, and attachments without replacing newer user edits.
 * Fault injection at each checkpoint proves this behavior."
 *
 * Every write boundary gets an injected fault. A Convex action's already
 * committed mutations survive its death and nothing else does, so each
 * fault constructs EXACTLY the durable state a worker that died at that
 * boundary leaves; the resume is re-invoking importCommit.commitImportRun
 * with the same rows, and must create ONLY the missing records — never a
 * duplicate, never replacing a user edit made after the fault:
 *
 * - After parent create, before link (venues V-004): the venue is created
 *   directly through the generated Venue_createViaRegister with the EXACT
 *   idempotencyKey the action uses (import:<runId>:venue:<externalId>), and
 *   no link is written. Resume re-creates under the same key → the
 *   generated command's idempotency cache returns the ORIGINAL docId with
 *   ZERO writes → the link is recorded, no duplicate venue exists, and a
 *   user rename made inside the window survives.
 * - After a batch boundary (venues: maxRecords 2 of 5; payments: 1 of 2):
 *   commitImportRun persists the commit checkpoint and returns stoppedEarly
 *   without completing — the same durable state as a worker that died after
 *   the Nth write. The user then edits an already-created record; the
 *   resume creates only the unprocessed records and never touches the edit.
 * - After parent + partial children (pack list E-100): PackList and item 0
 *   are created directly with the action's parent/per-item keys, no link.
 *   Resume reuses the SAME PackList docId, adds only items 1-2 (item 0's
 *   per-item key dedups it), and a user quantity edit on item 0 survives.
 *
 * Deposits are the payments dataset's reconciliation-reference links (spec
 * §6.4 — an import never creates Payment entities; the link IS the
 * artifact). Attachments have no ImportDatasetType member (the union is
 * events/contacts/leads/menus/venues/payments/pack_list); the
 * parent-scoped child write an attachments dataset would ride is exactly
 * the PackListItem shape proven here.
 *
 * The setup legs (one contact, two events) go through quickImport.importFile
 * so the one-shot path stays exercised end to end.
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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5GqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

/** The proof-kit harness type declares mutations only; the underlying
 * convex-test instance also runs actions (commitImportRun is an action). */
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

type CommitResult = {
  committed: number;
  skipped: number;
  pending: number;
  parseErrors: number;
  stoppedEarly?: boolean;
  processedCount?: number;
};

type LinkRow = {
  _id: string;
  recordType: string;
  externalId: string;
  capsuleId: string;
  conflictStatus: string;
  sourceImportRunId: string;
};

type Checkpoint = {
  processedCount: number;
  committedCount: number;
  skippedCount: number;
  pendingCount: number;
};

async function linksFor(
  owner: Actor,
  tenantId: string,
  recordType: string,
): Promise<LinkRow[]> {
  const rows = await owner.run(async (ctx) =>
    (await ctx.db.query("externalRecordLinks").collect()).filter(
      (row) =>
        (row as { tenantId: string }).tenantId === tenantId &&
        (row as { recordType: string }).recordType === recordType &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
  return rows as unknown as LinkRow[];
}

async function runRow(owner: Actor, runId: string) {
  return (await owner.run(async (ctx) => ctx.db.get(runId as never))) as {
    status: string;
    commitCheckpoint: string;
    datasetType: string;
  } | null;
}

async function startRun(owner: Actor, datasetType: string): Promise<string> {
  const started = (await owner.mutation(api.importCoordinator.startImport, {
    sourceSystem: "tpp_legacy",
    datasetType,
  })) as { importRunId: string };
  return started.importRunId;
}

async function walkToCommitting(
  owner: Actor,
  runId: string,
  datasetKey: string,
  count: number,
): Promise<void> {
  const counts = JSON.stringify({ [datasetKey]: count });
  await owner.mutation(api.mutations.ImportRun_recordParse, {
    docId: runId,
    recordCounts: counts,
  });
  await owner.mutation(api.mutations.ImportRun_validate, { docId: runId });
  await owner.mutation(api.mutations.ImportRun_beginReview, { docId: runId });
  await owner.mutation(api.mutations.ImportRun_approveReview, {
    docId: runId,
    finalRecordCounts: counts,
  });
}

async function commit(
  owner: Actor,
  args: { importRunId: string; rawRows: unknown[]; maxRecords?: number },
): Promise<CommitResult> {
  return (await asActions(owner).action(
    api.importCommit.commitImportRun,
    args,
  )) as CommitResult;
}

describe("runtime proof: import resume with fault injection (AC-024)", () => {
  it("failure after any write resumes missing children without replacing newer edits", async () => {
    const tenantId = "tenant-import-resume-fault";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-resume-owner",
      role: "owner",
      tenantId,
    });

    // ------------------------------------------------------------------
    // Setup legs: one contact + two events through the one-shot quickImport
    // path (also proves the woven commit still completes a normal import).
    // ------------------------------------------------------------------
    const contactImport = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "contacts",
        sourceSystem: "tpp_legacy",
        rows: [
          {
            ContactID: "C-100",
            FirstName: "Resume",
            LastName: "Proof",
            Email: "resume-proof@example.com",
            Phone: "555-0100",
          },
        ],
      },
    )) as { importRunId: string } & CommitResult;
    expect(contactImport.committed).toBe(1);

    const eventsImport = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "events",
        sourceSystem: "tpp_legacy",
        rows: [
          {
            EventID: "E-100",
            EventName: "Resume Fault Event A",
            ClientID: "C-100",
            EventDate: "2026-06-15",
            StartTime: "18:00",
            ExpectedCount: 40,
            TotalRevenue: "1500.00",
          },
          {
            EventID: "E-101",
            EventName: "Resume Fault Event B",
            ClientID: "C-100",
            EventDate: "2026-07-20",
            StartTime: "17:00",
            ExpectedCount: 25,
            TotalRevenue: "900.00",
          },
        ],
      },
    )) as { importRunId: string } & CommitResult;
    expect(eventsImport.committed).toBe(2);

    const eventLinks = await linksFor(owner, tenantId, "event");
    const e100EventId = eventLinks.find(
      (link) => link.externalId === "E-100",
    )?.capsuleId;
    expect(e100EventId).toBeTruthy();

    // ------------------------------------------------------------------
    // Leg 1 — venues. Fault A: batch stop after 2 of 5 parent writes.
    // Fault B: V-004's create is durable but its link is not (crash window).
    // User edits two records inside the fault window; resume must create
    // only V-003/V-004's link/V-005 and replace nothing.
    // ------------------------------------------------------------------
    const venueRows = [1, 2, 3, 4, 5].map((n) => ({
      VenueID: `V-00${n}`,
      VenueName: `Resume Venue ${n}`,
      VenueType: "Office",
      Address: `${n} Main Street`,
      City: "Seattle",
      State: "WA",
      ZipCode: "98101",
      Capacity: 100 + n,
      CreatedDate: "2026-05-01",
    }));
    const venuesRunId = await startRun(owner, "venues");
    await walkToCommitting(owner, venuesRunId, "venues", venueRows.length);

    // Fault B state: the exact durable state of a worker that died between
    // the parent create and the link write for V-004.
    const crashWindowVenue = (await owner.mutation(
      api.mutations.Venue_createViaRegister,
      {
        name: "Crash Window Venue",
        venueType: "other",
        capacity: 40,
        idempotencyKey: `import:${venuesRunId}:venue:V-004`,
      },
    )) as { docId: string };
    expect(crashWindowVenue.docId).toBeTruthy();

    // Fault A: a controlled mid-batch stop — identical durable state to a
    // worker that died after the 2nd parent write.
    const stopped = await commit(owner, {
      importRunId: venuesRunId,
      rawRows: venueRows,
      maxRecords: 2,
    });
    expect(stopped.stoppedEarly).toBe(true);
    expect(stopped.committed).toBe(2);
    expect(stopped.processedCount).toBe(2);

    const afterStop = await runRow(owner, venuesRunId);
    expect(afterStop?.status).toBe("committing");
    expect(JSON.parse(afterStop!.commitCheckpoint) as Checkpoint).toMatchObject(
      {
        processedCount: 2,
        committedCount: 2,
        skippedCount: 0,
        pendingCount: 0,
      },
    );
    const venueLinksAfterStop = await linksFor(owner, tenantId, "venue");
    expect(venueLinksAfterStop).toHaveLength(2);

    // Fault A′ (review R2-14): the crash ALSO lost the stop checkpoint —
    // the worker died before any checkpoint persisted. The durable state is
    // the two links; the resume must still finish with checkpoint totals
    // that match the durable truth (completeRun floors committedCount at
    // the run's live link count, so no completed run undercounts).
    await owner.run(async (ctx) => {
      await ctx.db.patch(venuesRunId, {
        commitCheckpoint: JSON.stringify({
          processedCount: 0,
          committedCount: 0,
          skippedCount: 0,
          pendingCount: 0,
        }),
      });
    });

    // Newer user edits AFTER the fault, BEFORE the resume: rename the two
    // venues that already exist (one batch-committed, one crash-window).
    const v1Link = venueLinksAfterStop.find(
      (link) => link.externalId === "V-001",
    );
    expect(v1Link?.capsuleId).toBeTruthy();
    await owner.mutation(api.mutations.Venue_updateDetails, {
      docId: v1Link!.capsuleId,
      name: "USER RENAMED 001",
      venueType: "other",
    });
    await owner.mutation(api.mutations.Venue_updateDetails, {
      docId: crashWindowVenue.docId,
      name: "USER RENAMED 004",
      venueType: "other",
    });

    // Resume: no batch limit — must create ONLY V-003, V-005 and V-004's
    // missing link (V-004 re-creates under the same idempotencyKey, so the
    // generated command returns the ORIGINAL docId with zero writes).
    const resumed = await commit(owner, {
      importRunId: venuesRunId,
      rawRows: venueRows,
    });
    expect(resumed.stoppedEarly).toBeUndefined();
    expect(resumed.committed).toBe(3);
    // The invocation's own honest count is 3 (the checkpoint seed was lost
    // in Fault A′); the PERSISTED final checkpoint below is floored at the
    // durable link count, which is the number that must never undercount.
    expect(resumed.processedCount).toBe(3);

    const venuesAfter = await owner.run(async (ctx) =>
      (await ctx.db.query("venues").collect()).filter(
        (row) => (row as { tenantId: string }).tenantId === tenantId,
      ),
    );
    const venueNames = (venuesAfter as unknown as Array<{ name: string }>)
      .map((venue) => venue.name)
      .sort();
    expect(venueNames).toEqual([
      "Resume Venue 2",
      "Resume Venue 3",
      "Resume Venue 5",
      "USER RENAMED 001",
      "USER RENAMED 004",
    ]);

    const venueLinksAfter = await linksFor(owner, tenantId, "venue");
    expect(venueLinksAfter).toHaveLength(5);
    expect(
      venueLinksAfter.every(
        (link) =>
          link.conflictStatus === "resolved" &&
          link.sourceImportRunId === venuesRunId &&
          link.capsuleId !== "",
      ),
    ).toBe(true);
    // The crash-window record links to the ORIGINAL create — no duplicate.
    expect(
      venueLinksAfter.find((link) => link.externalId === "V-004")?.capsuleId,
    ).toBe(crashWindowVenue.docId);

    const venuesRunAfter = await runRow(owner, venuesRunId);
    expect(venuesRunAfter?.status).toBe("completed");
    expect(
      JSON.parse(venuesRunAfter!.commitCheckpoint) as Checkpoint,
    ).toMatchObject({
      processedCount: 5,
      committedCount: 5,
      skippedCount: 0,
      pendingCount: 0,
    });

    // A completed run is closed — a stray re-invoke creates nothing.
    await expect(
      commit(owner, { importRunId: venuesRunId, rawRows: venueRows }),
    ).rejects.toThrow(/committing/);

    // ------------------------------------------------------------------
    // Leg 2 — pack lists. Fault C: parent + item 0 writes are durable, the
    // remaining children and the link are not. A user quantity edit on item
    // 0 happens inside the window; the resume must reuse the SAME PackList,
    // add only items 1-2, and keep the user's quantity.
    // ------------------------------------------------------------------
    const packRow = (eventId: string, name: string) => ({
      SourceEventID: eventId,
      Name: name,
      Items: [
        { Item: "Chafing dish", Quantity: 6, Unit: "each" },
        { Item: "Steam pan", Quantity: 4, Unit: "each" },
        { Item: "Serving tong set", Quantity: 10, Unit: "each" },
      ],
    });
    const packRows = [
      packRow("E-100", "Kitchen List A"),
      packRow("E-101", "Kitchen List B"),
    ];
    const packRunId = await startRun(owner, "pack_list");
    await walkToCommitting(owner, packRunId, "pack_list", packRows.length);

    const crashWindowList = (await owner.mutation(
      api.mutations.PackList_createViaOpen,
      {
        eventId: e100EventId,
        name: "Crash Window List",
        idempotencyKey: `import:${packRunId}:pack_list:E-100`,
      },
    )) as { docId: string };
    const crashWindowItem = (await owner.mutation(
      api.mutations.PackListItem_createViaAddItem,
      {
        packListId: crashWindowList.docId,
        description: "Chafing dish",
        requiredQuantity: 6,
        unit: "each",
        idempotencyKey: `import:${packRunId}:pack_list:E-100:item:0`,
      },
    )) as { docId: string };

    // Newer user edit on the crash-window CHILD: operator bumps the quantity.
    await owner.mutation(api.mutations.PackListItem_adjustQuantity, {
      docId: crashWindowItem.docId,
      requiredQuantity: 99,
    });

    const packResumed = await commit(owner, {
      importRunId: packRunId,
      rawRows: packRows,
    });
    expect(packResumed.committed).toBe(2);
    expect(packResumed.processedCount).toBe(2);

    const packLists = await owner.run(async (ctx) =>
      (await ctx.db.query("packLists").collect()).filter(
        (row) =>
          (row as { tenantId: string }).tenantId === tenantId &&
          (row as { deletedAt?: number | null }).deletedAt == null,
      ),
    );
    expect(packLists).toHaveLength(2);

    const packItems = await owner.run(async (ctx) =>
      (await ctx.db.query("packListItems").collect()).filter(
        (row) => (row as { tenantId: string }).tenantId === tenantId,
      ),
    );
    const itemsByList = new Map<
      string,
      Array<{ _id: string; description: string; requiredQuantity: number }>
    >();
    for (const item of packItems as unknown as Array<{
      _id: string;
      packListId: string;
      description: string;
      requiredQuantity: number;
    }>) {
      const list = itemsByList.get(item.packListId) ?? [];
      list.push(item);
      itemsByList.set(item.packListId, list);
    }

    // The E-100 list is the ORIGINAL crash-window parent — reused, not
    // duplicated — and carries exactly 3 children, item 0 untouched.
    const listAItems = itemsByList.get(crashWindowList.docId) ?? [];
    expect(listAItems).toHaveLength(3);
    const item0 = listAItems.find(
      (item) => item.description === "Chafing dish",
    );
    expect(item0?._id).toBe(crashWindowItem.docId);
    expect(item0?.requiredQuantity).toBe(99);
    expect(listAItems.map((item) => item.description).sort()).toEqual([
      "Chafing dish",
      "Serving tong set",
      "Steam pan",
    ]);

    // The E-101 list was created whole by the resume.
    const otherListItems = [...itemsByList.entries()].find(
      ([listId]) => listId !== crashWindowList.docId,
    )?.[1];
    expect(otherListItems).toHaveLength(3);

    const packLinks = await linksFor(owner, tenantId, "pack_list");
    expect(packLinks).toHaveLength(2);
    expect(
      packLinks.find((link) => link.externalId === "E-100")?.capsuleId,
    ).toBe(crashWindowList.docId);
    expect(packLinks.every((link) => link.conflictStatus === "resolved")).toBe(
      true,
    );
    expect((await runRow(owner, packRunId))?.status).toBe("completed");

    // ------------------------------------------------------------------
    // Leg 3 — payments (deposits). Fault D: batch stop after 1 of 2
    // reference links; the resume stages only the missing one.
    // ------------------------------------------------------------------
    const paymentRows = [
      {
        PaymentID: "P-1",
        EventID: "E-100",
        PaymentDate: "2026-06-20",
        PaymentAmount: "500.00",
        PaymentMethod: "Check",
        Reference: "deposit",
      },
      {
        PaymentID: "P-2",
        EventID: "E-100",
        PaymentDate: "2026-06-27",
        PaymentAmount: "250.00",
        PaymentMethod: "ACH",
        Reference: "balance",
      },
    ];
    const paymentsRunId = await startRun(owner, "payments");
    await walkToCommitting(
      owner,
      paymentsRunId,
      "payments",
      paymentRows.length,
    );

    const paymentsStopped = await commit(owner, {
      importRunId: paymentsRunId,
      rawRows: paymentRows,
      maxRecords: 1,
    });
    expect(paymentsStopped.stoppedEarly).toBe(true);
    expect(paymentsStopped.committed).toBe(1);
    expect(await linksFor(owner, tenantId, "payment")).toHaveLength(1);

    const paymentsResumed = await commit(owner, {
      importRunId: paymentsRunId,
      rawRows: paymentRows,
    });
    expect(paymentsResumed.stoppedEarly).toBeUndefined();
    expect(paymentsResumed.committed).toBe(1);
    expect(paymentsResumed.processedCount).toBe(2);

    const paymentLinks = await linksFor(owner, tenantId, "payment");
    expect(paymentLinks).toHaveLength(2);
    expect(
      paymentLinks.every(
        (link) =>
          link.externalId === "P-1" ||
          (link.externalId === "P-2" &&
            link.capsuleId === "" &&
            link.conflictStatus === "pending_conflict" &&
            link.sourceImportRunId === paymentsRunId),
      ),
    ).toBe(true);

    const paymentsRunAfter = await runRow(owner, paymentsRunId);
    expect(paymentsRunAfter?.status).toBe("completed");
    expect(
      JSON.parse(paymentsRunAfter!.commitCheckpoint) as Checkpoint,
    ).toMatchObject({
      processedCount: 2,
      committedCount: 2,
      skippedCount: 0,
      pendingCount: 0,
    });
  });
});
