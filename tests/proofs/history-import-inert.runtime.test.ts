/**
 * Runtime proof: importing old messages and tasks records history only
 * (PL-SOURCE-HISTORY, AC-111).
 *
 * The import writes ClientCommunication rows and their import links. It sends
 * no email, text or push; opens no follow-up reminder; makes no lead; posts
 * no announcement or chat message; and schedules nothing - not even for an
 * old task that was never done and is long past due.
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
  )) as { committed: number };
}

// Every place an import could start an outside send, a reminder, or a lead.
const SIDE_EFFECT_TABLES = [
  "clientOutreachTasks",
  "leads",
  "messages",
  "messageThreads",
  "staffMessages",
  "announcements",
  "weeklyScheduleNotices",
  "emailNotificationSubscriptions",
  "pushSubscriptions",
  "eventTasks",
] as const;

async function snapshot(actor: Actor) {
  return (await actor.run(async (ctx) => {
    const query = ctx.db.query as (t: string) => {
      collect(): Promise<unknown[]>;
    };
    const counts: Record<string, number> = {};
    for (const name of SIDE_EFFECT_TABLES) {
      counts[name] = (await query(name).collect()).length;
    }
    const system = (
      ctx.db as unknown as {
        system: { query(t: string): { collect(): Promise<unknown[]> } };
      }
    ).system;
    counts.scheduled = (
      await system.query("_scheduled_functions").collect()
    ).length;
    return counts;
  })) as Record<string, number>;
}

describe("runtime proof: history import is inert (AC-111)", () => {
  it("importing historical messages/tasks writes history rows and triggers zero notifications/outreach/reminders", async () => {
    const tenantId = "tenant-history-inert";
    const owner = harness().asRole({
      subject: "history-inert-owner",
      role: "owner",
      tenantId,
    });
    await importRows(owner, "contacts", [
      {
        ContactID: "C-1",
        FirstName: "Ada",
        LastName: "Moss",
        Email: "ada@example.com",
        Birthday: "05/04/1980",
      },
    ]);
    const before = await snapshot(owner);

    const result = await importRows(owner, "history", [
      {
        HistoryID: "H-1",
        ContactID: "C-1",
        HistoryDate: "2021-01-05",
        HistoryType: "Email",
        Subject: "Anniversary party next year?",
        CreatedBy: "Pat",
      },
      {
        HistoryID: "H-2",
        ContactID: "C-1",
        HistoryDate: "2021-01-06",
        HistoryType: "Task",
        Subject: "Follow up on the anniversary quote",
        DueDate: "2021-02-01",
        Status: "Open",
      },
      {
        HistoryID: "H-3",
        ContactID: "C-1",
        HistoryDate: "2021-01-07",
        HistoryType: "Text message",
        Notes: "Thanks for the call!",
      },
    ]);
    expect(result.committed).toBe(3);

    const history = (await owner.run(async (ctx) =>
      (
        await (
          ctx.db.query as (t: string) => { collect(): Promise<unknown[]> }
        )("clientCommunications").collect()
      ).filter((row) => (row as { tenantId: string }).tenantId === tenantId),
    )) as Row[];
    expect(history).toHaveLength(3);
    expect(history.every((row) => row.importedFrom === "tpp_legacy")).toBe(
      true,
    );

    // Nothing was sent, reminded, opened, or scheduled.
    expect(await snapshot(owner)).toEqual(before);

    // No Manifest event fired for the history rows, so no reaction ran.
    const events = (await owner.run(async (ctx) =>
      (
        await (
          ctx.db.query as (t: string) => { collect(): Promise<unknown[]> }
        )("manifestEvents").collect()
      ).filter((row) =>
        String((row as { entity?: string }).entity).startsWith(
          "ClientCommunication",
        ),
      ),
    )) as Row[];
    expect(events).toHaveLength(0);
  });
});
