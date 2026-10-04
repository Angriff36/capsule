/**
 * Runtime proof (PL-REPLACEMENT-PROOF, TPP dossier "Imported events all start
 * in Planning"): an old booked event that is over (Complete, Closed Out,
 * Approved) comes in completed and one that was Cancelled comes in
 * cancelled; events still to come and a past "Planning" stay in Planning. Nothing is drafted
 * for the old events (no invoice), and a resumed run replays the stage step
 * under its run-scoped key instead of failing.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { importedEventStageKey } from "../../convex/lib/importEventStage";
import { OLD_SYSTEM_CANCEL_REASON } from "../../convex/lib/oldSystemEventStage";

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

type LinkRow = {
  externalId: string;
  capsuleId: string;
  sourceImportRunId: string;
  resolutionNote?: string | null;
};
type EventRow = {
  _id: string;
  stage: string;
  endsAt: number;
  completedAt?: number | null;
  cancellationReason?: string | null;
};

describe("runtime proof: imported events keep a finished old status", () => {
  it("copies Complete / Closed Out on past events and Cancelled; leaves the rest in Planning", async () => {
    const tenantId = "tenant-import-old-status";
    const proof = harness();
    const owner = proof.asRole({
      subject: "import-old-status-owner",
      role: "owner",
      tenantId,
    });
    const contact = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "contacts",
      sourceSystem: "tpp_legacy",
      rows: [{ ContactID: "C-1", FirstName: "Old", LastName: "Client" }],
    })) as { committed: number };
    expect(contact.committed).toBe(1);

    const row = (id: string, status: string, date: string) => ({
      EventID: id,
      EventName: `Event ${id}`,
      ClientID: "C-1",
      EventDate: date,
      StartTime: "18:00",
      ExpectedCount: 40,
      EventStatus: status,
    });
    const imported = (await asActions(owner).action(
      api.quickImport.importFile,
      {
        datasetType: "events",
        sourceSystem: "tpp_legacy",
        rows: [
          row("E-1", "Complete", "2025-05-01"),
          row("E-2", "Closed Out", "2025-06-01"),
          row("E-3", "Cancelled", "2099-06-01"),
          row("E-4", "Approved", "2099-08-01"),
          row("E-5", "Complete", "2099-07-01"),
          row("E-6", "Approved", "2025-07-01"),
          row("E-7", "Planning", "2025-08-01"),
        ],
      },
    )) as { committed: number };
    expect(imported.committed).toBe(7);

    const links = (await owner.run(async (ctx) =>
      (await ctx.db.query("externalRecordLinks").collect()).filter(
        (link) =>
          (link as { tenantId: string }).tenantId === tenantId &&
          (link as { recordType: string }).recordType === "event",
      ),
    )) as unknown as LinkRow[];
    const events = (await owner.run(async (ctx) =>
      (await ctx.db.query("events").collect()).filter(
        (event) => (event as { tenantId: string }).tenantId === tenantId,
      ),
    )) as unknown as EventRow[];
    const eventFor = (externalId: string) => {
      const link = links.find((entry) => entry.externalId === externalId);
      expect(link?.resolutionNote ?? null).toBeNull();
      return events.find((event) => event._id === link?.capsuleId)!;
    };

    const complete = eventFor("E-1");
    expect(complete.stage).toBe("completed");
    expect(complete.completedAt).toBe(complete.endsAt);
    expect(eventFor("E-2").stage).toBe("completed");
    const cancelled = eventFor("E-3");
    expect(cancelled.stage).toBe("cancelled");
    expect(cancelled.cancellationReason).toBe(OLD_SYSTEM_CANCEL_REASON);
    expect(eventFor("E-4").stage).toBe("planning");
    expect(eventFor("E-5").stage).toBe("planning");
    // A booked event that is over happened, whatever word TPP left on it.
    expect(eventFor("E-6").stage).toBe("completed");
    expect(eventFor("E-7").stage).toBe("planning");

    // No approval ran, so nothing was drafted for the old events.
    const invoices = await owner.run(async (ctx) =>
      (await ctx.db.query("invoices").collect()).filter(
        (invoice) => (invoice as { tenantId: string }).tenantId === tenantId,
      ),
    );
    expect(invoices).toHaveLength(0);

    // A resumed run sends the same stage step again: the saved result is
    // replayed, the event is not moved twice and nothing throws.
    const runId = links.find(
      (link) => link.externalId === "E-1",
    )!.sourceImportRunId;
    await owner.mutation(api.mutations.Event_recordPastCompletion, {
      docId: complete._id,
      idempotencyKey: importedEventStageKey(runId, "E-1"),
    });

    // Marking finished from Planning is only for an event that is over.
    await expect(
      owner.mutation(api.mutations.Event_recordPastCompletion, {
        docId: eventFor("E-5")._id,
      }),
    ).rejects.toThrow("Only an event that has already happened");
    // The one-tap copy on the event's import panel uses the same command.
    await owner.mutation(api.mutations.Event_recordPastCompletion, {
      docId: eventFor("E-7")._id,
    });
    const after = (await owner.run(async (ctx) =>
      ctx.db.get(eventFor("E-7")._id as never),
    )) as EventRow;
    expect(after.stage).toBe("completed");
  });
});
