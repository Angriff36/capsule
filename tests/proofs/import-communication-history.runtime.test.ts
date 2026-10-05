/**
 * Runtime proof: old-system messages and tasks become normal client history
 * (PL-SOURCE-HISTORY, AC-062).
 *
 * - Each history row lands as a ClientCommunication under its real client
 *   (found through the contacts import) and its event, with the original
 *   date, author, due date and done state - read back through the normal
 *   history list staff use.
 * - A done task stays done; an open task stays open; nothing is reopened.
 * - A row whose contact is not in Capsule yet waits on the match list and is
 *   brought in by a later run once the contact is imported; a row with no
 *   date is refused, never given a made-up one.
 * - Running the same rows again writes nothing twice.
 * - A client merge moves imported history to the client kept.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { parseTppDateTime } from "../../convex/tppParser";
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
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
type Row = Record<string, unknown> & { _id: string };

async function importRows(actor: Actor, datasetType: string, rows: unknown[]) {
  return (await (actor as unknown as ActionRunner).action(
    api.quickImport.importFile,
    { datasetType, sourceSystem: "tpp_legacy", rows },
  )) as {
    committed: number;
    skipped: number;
    pending: number;
    parseErrors: number;
  };
}

async function table(actor: Actor, name: string, tenantId: string) {
  return (await actor.run(async (ctx) =>
    (
      await (ctx.db.query as (t: string) => { collect(): Promise<unknown[]> })(
        name,
      ).collect()
    ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
  )) as Row[];
}

const HISTORY = [
  {
    HistoryID: "H-1",
    ContactID: "C-1",
    HistoryDate: "2023-04-02",
    HistoryTime: "10:30",
    HistoryType: "Phone Call",
    Subject: "Asked about a June wedding",
    Notes: "Wants a plated dinner for 120.",
    CreatedBy: "Dana Ruiz",
  },
  {
    HistoryID: "H-2",
    ContactID: "C-1",
    EventID: "E-1",
    HistoryDate: "2023-04-10",
    HistoryType: "Task",
    Subject: "Send tasting menu",
    DueDate: "2023-04-20",
    CompletedDate: "2023-04-18",
    Status: "Completed",
    CreatedBy: "Dana Ruiz",
  },
  {
    HistoryID: "H-3",
    ContactID: "C-1",
    HistoryDate: "2023-05-01",
    HistoryType: "To-Do",
    Subject: "Call back about linens",
    DueDate: "2023-05-15",
    Status: "Open",
  },
  {
    HistoryID: "H-4",
    ContactID: "C-2",
    HistoryDate: "2023-03-01",
    HistoryType: "Email",
    Notes: "Sent the fall menu.",
    CreatedBy: "Sam Lee",
  },
  {
    HistoryID: "H-5",
    ContactID: "C-1",
    HistoryType: "Note",
    Notes: "A row with no date.",
  },
];

describe("runtime proof: imported communication history (AC-062)", () => {
  it("imported communications and tasks appear in the client history with original timestamps and completion state", async () => {
    const tenantId = "tenant-import-history";
    const owner = harness().asRole({
      subject: "import-history-owner",
      role: "owner",
      tenantId,
    });

    await importRows(owner, "contacts", [
      { ContactID: "C-1", FirstName: "Maya", LastName: "Chen" },
    ]);
    await importRows(owner, "events", [
      {
        EventID: "E-1",
        EventName: "Chen Wedding",
        EventDate: "2023-06-17",
        StartTime: "17:00",
        EndTime: "23:00",
        ExpectedCount: 120,
        ClientID: "C-1",
        EventStatus: "Definite",
      },
    ]);
    const links = await table(owner, "externalRecordLinks", tenantId);
    const mayaId = links.find((l) => l.externalId === "C-1")!.capsuleId;
    const eventId = links.find((l) => l.externalId === "E-1")!.capsuleId;

    const first = await importRows(owner, "history", HISTORY);
    expect(first).toMatchObject({ committed: 3, pending: 1, parseErrors: 1 });

    // Read through the normal history list staff use.
    const history = (await owner.query(
      api.queries.listClientCommunication,
      {},
    )) as Row[];
    expect(history).toHaveLength(3);
    const byWords = (words: string) =>
      history.find((row) => String(row.summary).includes(words))!;

    const call = byWords("June wedding");
    expect(call).toMatchObject({
      clientId: mayaId,
      medium: "call",
      authorName: "Dana Ruiz",
      importedFrom: "tpp_legacy",
      occurredAt: parseTppDateTime("2023-04-02", "10:30"),
      summary: "Asked about a June wedding\n\nWants a plated dinner for 120.",
    });
    expect(call.recordedAt).toBeTypeOf("number");

    const doneTask = byWords("tasting menu");
    expect(doneTask).toMatchObject({
      clientId: mayaId,
      eventId,
      medium: "task",
      occurredAt: parseTppDateTime("2023-04-10"),
      dueAt: parseTppDateTime("2023-04-20"),
      completedAt: parseTppDateTime("2023-04-18"),
      taskDone: true,
    });

    const openTask = byWords("linens");
    expect(openTask).toMatchObject({
      clientId: mayaId,
      medium: "task",
      taskDone: false,
      authorName: "Old system",
    });
    expect(openTask.completedAt ?? null).toBeNull();

    // The row whose contact is not in Capsule waits on the match list.
    const waiting = (await table(owner, "externalRecordLinks", tenantId)).find(
      (l) => l.recordType === "history" && l.externalId === "H-4",
    )!;
    expect(waiting.conflictStatus).toBe("pending_conflict");
    expect(String(waiting.resolutionNote)).toContain("not in Capsule yet");

    // The same rows again: nothing written twice.
    const again = await importRows(owner, "history", HISTORY);
    expect(again.committed).toBe(0);
    expect(await table(owner, "clientCommunications", tenantId)).toHaveLength(
      3,
    );

    // Once the contact is imported, the waiting row comes in.
    await importRows(owner, "contacts", [
      { ContactID: "C-2", FirstName: "Sam", LastName: "Park" },
    ]);
    const later = await importRows(owner, "history", HISTORY);
    expect(later.committed).toBe(1);
    const samId = (await table(owner, "externalRecordLinks", tenantId)).find(
      (l) => l.externalId === "C-2",
    )!.capsuleId;
    const email = (await table(owner, "clientCommunications", tenantId)).find(
      (row) => String(row.summary).includes("fall menu"),
    )!;
    expect(email).toMatchObject({ clientId: samId, medium: "email" });

    // A merge moves imported history to the client kept.
    await owner.mutation(api.mutations.ClientMerge_createViaMerge, {
      primaryClientId: mayaId,
      duplicateClientId: samId,
    } as never);
    const moved = (await table(owner, "clientCommunications", tenantId)).find(
      (row) => row._id === email._id,
    )!;
    expect(moved.clientId).toBe(mayaId);
  });
});
