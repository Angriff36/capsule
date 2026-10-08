/**
 * Runtime proof (AC-057 contact history): TPP's "Contact Tasks & Notes"
 * report comes in through the file box's "Messages and tasks" kind.
 *
 * - The report prints a block per client and a task table; the reader turns
 *   each task line into one old-history row, reads the sheet date number as
 *   the task date, and reads a task printed again after a page break once.
 * - A task naming "(Event #: N)" lands on that event and under the event's
 *   client; a task with no event lands under the client found by exact name;
 *   a task whose client is not in Capsule waits on the match list.
 * - Done and open state come from the report; running it again writes
 *   nothing twice. Made-up names only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { parseTppDateTime } from "../../convex/tppParser";
import {
  contactTaskRowsFromGrid,
  isContactTasksReport,
} from "../../src/lib/tppReports/parseContactTasks";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5jqU=";
  }
});

type Row = Record<string, unknown> & { _id: string };

const blank = (cells: Record<number, string>) => {
  const row = Array.from({ length: 13 }, () => "");
  for (const [index, value] of Object.entries(cells))
    row[Number(index)] = value;
  return row;
};
const header = blank({
  0: "Task Owner",
  1: "Task Type",
  2: "Task Date",
  4: "Priority",
  5: "Completed ?",
  6: "Task Subject",
  8: "Task Description",
  10: "Event Information",
});
const task = (
  date: string,
  done: string,
  subject: string,
  description: string,
  event: string,
) =>
  blank({
    0: "Dana Ruiz",
    1: date,
    4: "N/A",
    5: done,
    6: subject,
    8: description,
    10: event,
  });
const block = (name: string) => [
  blank({ 0: "Name:", 1: "Work #:" }),
  blank({ 0: name, 2: "Home #:" }),
  blank({ 0: "Business Name:" }),
  blank({ 2: "Mobile #:" }),
  blank({ 0: "Email:" }),
  header,
];

// 45923 = 2025-09-23, 45928 = 2025-09-28, 46013 = 2025-12-22.
const GRID = [
  blank({ 0: "Contact Tasks & Notes" }),
  ...block("Maya Chen"),
  task(
    "45923",
    "Yes",
    "Send ETA Email 1 day out",
    "Confirm arrival time",
    "Chen Wedding - Sat (Event #: 5101)",
  ),
  task(
    "45928",
    "No",
    "Confirm Final Payment",
    "Collect the balance",
    "Chen Wedding - Sat (Event #: 5101)",
  ),
  blank({ 0: "Printed Date:", 1: "9/4/2026", 6: "1" }),
  blank({ 0: "Contact Tasks & Notes" }),
  // The same task printed again after the page break.
  task(
    "45923",
    "Yes",
    "Send ETA Email 1 day out",
    "Confirm arrival time",
    "Chen Wedding - Sat (Event #: 5101)",
  ),
  ...block("Harbor Foods"),
  task("46013", "No", "Please lock", "Lock the holiday party", ""),
  ...block("Nobody Here"),
  task("46013", "Yes", "Review for sales lock", "Check the deposit", ""),
];

describe("runtime proof: TPP Contact Tasks & Notes report import (AC-057)", () => {
  it("reads the report into tasks and places each on its event or client", async () => {
    expect(isContactTasksReport(GRID)).toBe(true);
    const rows = contactTaskRowsFromGrid(GRID);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      EventID: "5101",
      HistoryDate: "2025-09-23",
      Subject: "Send ETA Email 1 day out",
      Completed: "Yes",
      CreatedBy: "Dana Ruiz",
      ContactName: "Maya Chen",
    });
    expect(rows[2]).not.toHaveProperty("EventID");
    expect(rows[2]!.ContactName).toBe("Harbor Foods");

    const tenantId = "tenant-contact-tasks";
    const owner = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    }).asRole({ subject: "contact-tasks-owner", role: "owner", tenantId });
    const importRows = (datasetType: string, input: unknown[]) =>
      (
        owner as unknown as {
          action: (fn: unknown, args: unknown) => Promise<unknown>;
        }
      ).action(api.quickImport.importFile, {
        datasetType,
        sourceSystem: "tpp_legacy",
        rows: input,
      }) as Promise<{ committed: number; skipped: number; pending: number }>;
    const table = (name: string) =>
      owner.run(async (ctx) =>
        (
          await (
            ctx.db.query as (t: string) => { collect(): Promise<unknown[]> }
          )(name).collect()
        ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
      ) as Promise<Row[]>;

    await importRows("contacts", [
      { ContactID: "C-1", FirstName: "Maya", LastName: "Chen" },
      { CompanyID: "CO-1", CompanyName: "Harbor Foods" },
    ]);
    await importRows("events", [
      {
        EventID: "5101",
        EventName: "Chen Wedding",
        EventDate: "2025-10-04",
        StartTime: "17:00",
        EndTime: "23:00",
        ExpectedCount: 120,
        ClientID: "C-1",
        EventStatus: "Definite",
      },
    ]);
    const links = await table("externalRecordLinks");
    const mayaId = links.find((l) => l.externalId === "C-1")!.capsuleId;
    const harborId = links.find((l) => l.externalId === "CO-1")!.capsuleId;
    const eventId = links.find(
      (l) => l.recordType === "event" && l.externalId === "5101",
    )!.capsuleId;

    const first = await importRows("history", rows);
    expect(first).toMatchObject({ committed: 3, pending: 1 });

    const history = await table("clientCommunications");
    const bySubject = (words: string) =>
      history.find((row) => String(row.summary).startsWith(words))!;
    expect(bySubject("Send ETA Email")).toMatchObject({
      clientId: mayaId,
      eventId,
      medium: "task",
      authorName: "Dana Ruiz",
      occurredAt: parseTppDateTime("2025-09-23"),
      dueAt: parseTppDateTime("2025-09-23"),
      taskDone: true,
      summary: "Send ETA Email 1 day out\n\nConfirm arrival time",
    });
    expect(bySubject("Confirm Final Payment")).toMatchObject({
      clientId: mayaId,
      eventId,
      taskDone: false,
    });
    const lock = bySubject("Please lock");
    expect(lock).toMatchObject({ clientId: harborId, taskDone: false });
    expect(lock.eventId ?? null).toBeNull();

    const waiting = (await table("externalRecordLinks")).find(
      (l) =>
        l.recordType === "history" &&
        String(l.externalId).includes("review for sales lock"),
    )!;
    expect(waiting.conflictStatus).toBe("pending_conflict");
    expect(String(waiting.resolutionNote)).toContain("not in Capsule yet");

    // A part of a file where every task waits still finishes: the waiting
    // rows are on the match list, not lost.
    const onlyWaiting = await importRows("history", [
      { ...rows[3]!, HistoryID: "task:client:someone else:2025-12-22:x" },
    ]);
    expect(onlyWaiting).toMatchObject({ committed: 0, pending: 1 });

    const again = await importRows("history", rows);
    expect(again.committed).toBe(0);
    expect(await table("clientCommunications")).toHaveLength(3);
  });

  it("keeps two different tasks with one day and subject, drops an exact repeat", () => {
    const reminder = (description: string) =>
      task(
        "45928",
        "No",
        "Payment reminder",
        description,
        "Chen Wedding - Sat (Event #: 5101)",
      );
    const rows = contactTaskRowsFromGrid([
      blank({ 0: "Contact Tasks & Notes" }),
      ...block("Maya Chen"),
      reminder("Deposit"),
      reminder("Balance"),
      reminder("Deposit"),
    ]);
    expect(rows.map((row) => [row.HistoryID, row.Notes])).toEqual([
      ["task:5101:2025-09-28:payment reminder", "Deposit"],
      ["task:5101:2025-09-28:payment reminder:2", "Balance"],
    ]);
  });
});
