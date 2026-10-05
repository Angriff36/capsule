/**
 * Runtime proof for the 2026-09-30 daily review of the event-day work:
 * - a "fix first" person (on leave or on two events) and a truck or trailer
 *   (on two runs or in the shop) are saved together with the reason, both or
 *   neither;
 * - event history keeps the newest change when the event has more than 200
 *   records, and past 1,000 records keeps the newest and says it is cut;
 * - a retired checklist cannot be put on an event;
 * - a planning answer from another event cannot be rewritten, nor one
 *   answered again without the version the board showed;
 * - only the packer gives a section back; "Take over" keeps who took it.
 * Synthetic workspace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  stubTimingEnv,
  TIMING_TENANT,
  timingWorld,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const M = api.mutations;

async function refused(call: () => Promise<unknown>) {
  try {
    await call();
    return false;
  } catch {
    return true;
  }
}

describe("event-day review fixes", () => {
  it("saves a fix-first person or truck together with its reason, or neither", async () => {
    const { t, owner, plannerId, event } = await timingWorld();
    const truck = (
      (await owner.mutation(M.Vehicle_createViaRegister, {
        make: "Isuzu",
        model: "NPR",
        registration: "PROOF-1",
        ownership: "owned",
        payloadCapacityKg: 3000,
        operationalStatus: "available",
      })) as { docId: Id<"vehicles"> }
    ).docId;

    await owner.mutation(api.reasonedChanges.assignRigWithReason, {
      eventId: event,
      vehicleId: truck,
      action: "Put Isuzu NPR on the event",
      reason: "The morning run is back by noon",
      openItems: "The truck is on another run that day.",
    });
    await owner.mutation(api.reasonedChanges.assignPersonWithReason, {
      eventId: event,
      personId: plannerId,
      role: "Captain",
      action: "Put Casey Planner on the event",
      reason: "Casey offered to come in on the leave day",
      openItems: "Casey has approved time off.",
    });

    // A blank reason is refused, and the truck is not kept without it.
    const second = (
      (await owner.mutation(M.Vehicle_createViaRegister, {
        make: "Ford",
        model: "Transit",
        registration: "PROOF-2",
        ownership: "owned",
        payloadCapacityKg: 1500,
        operationalStatus: "available",
      })) as { docId: Id<"vehicles"> }
    ).docId;
    expect(
      await refused(() =>
        owner.mutation(api.reasonedChanges.assignRigWithReason, {
          eventId: event,
          vehicleId: second,
          action: "Put Ford Transit on the event",
          reason: "   ",
        }),
      ),
    ).toBe(true);

    const kept = await t.run(async (ctx) => ({
      rigs: (await ctx.db.query("eventVehicleAssignments").collect()).map(
        (row) => row.vehicleId,
      ),
      crew: (await ctx.db.query("eventAssignments").collect()).length,
      reasons: (await ctx.db.query("planningOverrides").collect()).map(
        (row) => row.reason,
      ),
    }));
    expect(kept.rigs).toEqual([truck]);
    expect(kept.crew).toBe(1);
    expect(kept.reasons.sort()).toEqual([
      "Casey offered to come in on the leave day",
      "The morning run is back by noon",
    ]);
  });

  it("keeps the newest change in event history when the event has more than 200 records", async () => {
    const { owner, event } = await timingWorld();
    const tasks: Id<"eventTasks">[] = [];
    for (let index = 0; index < 205; index += 1)
      tasks.push(
        (
          (await owner.mutation(M.EventTask_createViaAdd, {
            eventId: event,
            title: `Proof to-do ${index + 1}`,
          })) as { docId: Id<"eventTasks"> }
        ).docId,
      );
    const last = tasks[tasks.length - 1];
    await owner.mutation(M.EventTask_start, { docId: last });

    const history = (await owner.query(api.eventActivity.listEventActivity, {
      eventId: event,
    }))!;
    // The 205th to-do comes after the first 200 records; its change is
    // still read, and it is the newest to-do row.
    const todoRows = history.rows.filter((row) =>
      row.type.startsWith("EventTask"),
    );
    // Only the 205th to-do was started.
    expect(todoRows[0].type).toBe("EventTaskStarted");
    expect(
      history.rows.some(
        (row) =>
          row.type === "EventTaskAdded" &&
          row.detail?.includes("Proof to-do 205"),
      ),
    ).toBe(true);
    const times = history.rows.map((row) => row.at);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("keeps the newest record's change and says the history is cut past 1,000 records", async () => {
    const { t, owner, event } = await timingWorld();
    // 1,000 older to-dos, then one new one: the read keeps the newest 1,000.
    await t.run(async (ctx) => {
      for (let index = 0; index < 1000; index += 1)
        await ctx.db.insert("eventTasks", {
          tenantId: TIMING_TENANT,
          eventId: event,
          title: `Old to-do ${index + 1}`,
          priority: "medium",
          status: "open",
          version: 1,
        });
    });
    const newest = (
      (await owner.mutation(M.EventTask_createViaAdd, {
        eventId: event,
        title: "Newest proof to-do",
      })) as { docId: Id<"eventTasks"> }
    ).docId;
    await owner.mutation(M.EventTask_start, { docId: newest });

    const history = (await owner.query(api.eventActivity.listEventActivity, {
      eventId: event,
    }))!;
    expect(history.truncated).toBe(true);
    expect(history.rows[0].type).toBe("EventTaskStarted");
    expect(
      history.rows.some(
        (row) =>
          row.type === "EventTaskAdded" &&
          row.detail?.includes("Newest proof to-do"),
      ),
    ).toBe(true);
  });

  it("refuses to answer again without the version the board showed, or with an old one", async () => {
    const { t, owner, event } = await timingWorld();
    const receipt = (
      (await owner.mutation(M.PlanningReceipt_createViaRecord, {
        eventId: event,
        suggestionKey: "task:ice",
        quantity: 0,
        declined: true,
      })) as { docId: Id<"planningReceipts"> }
    ).docId;
    const stored = await t.run(async (ctx) => ctx.db.get(receipt));
    const accept = (receiptVersion?: number) =>
      owner.mutation(api.reasonedChanges.acceptSuggestion, {
        eventId: event,
        suggestionKey: "task:ice",
        kind: "task",
        target: "Ice",
        add: 1,
        wanted: 1,
        receiptId: receipt,
        receiptVersion,
      });

    expect(await refused(() => accept())).toBe(true);
    expect(await refused(() => accept(stored!.version + 1))).toBe(true);
    const after = await t.run(async (ctx) => ({
      tasks: (await ctx.db.query("eventTasks").collect()).length,
      receipt: await ctx.db.get(receipt),
    }));
    expect(after.tasks).toBe(0);
    expect(after.receipt?.declined).toBe(true);
    expect(after.receipt?.version).toBe(stored!.version);

    await accept(stored!.version);
    const taken = await t.run(async (ctx) => ({
      tasks: (await ctx.db.query("eventTasks").collect()).length,
      receipt: await ctx.db.get(receipt),
    }));
    expect(taken.tasks).toBe(1);
    expect(taken.receipt?.declined).toBe(false);
  });

  it("refuses a retired checklist, even from a page that still shows it", async () => {
    const { t, owner, event } = await timingWorld();
    const checklist = (
      (await owner.mutation(M.EventChecklist_createViaDefine, {
        name: "Bar setup",
        itemsJson: JSON.stringify([{ title: "Ice" }, { title: "Garnish" }]),
      })) as { docId: Id<"eventChecklists"> }
    ).docId;
    await owner.mutation(M.EventChecklist_retire, { docId: checklist });

    expect(
      await refused(() =>
        owner.mutation(api.eventChecklistApply.apply, {
          eventId: event,
          checklistId: checklist,
        }),
      ),
    ).toBe(true);
    const tasks = await t.run(async (ctx) =>
      ctx.db.query("eventTasks").collect(),
    );
    expect(tasks).toEqual([]);
  });

  it("refuses an earlier answer from another event before adding anything", async () => {
    const { t, owner, style, event } = await timingWorld();
    const client = (await owner.mutation(M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Other Proof Co",
    })) as { docId: string };
    const other = (
      (await owner.mutation(M.Event_createViaPlanEngagement, {
        clientId: client.docId,
        title: "Other proof party",
        eventType: "catering",
        startsAt: Date.UTC(2030, 7, 1, 23, 0),
        endsAt: Date.UTC(2030, 7, 2, 3, 0),
        expectedHeadcount: 40,
        primaryContactName: "Lee Other",
        budgetAmount: 2000,
        quotedPrice: 2000,
        serviceStyleId: style,
        venueName: "Pier Room",
        venueAddress: "2 Pier Rd, Portland ME, US",
      })) as { docId: Id<"events"> }
    ).docId;
    const receipt = (
      (await owner.mutation(M.PlanningReceipt_createViaRecord, {
        eventId: other,
        suggestionKey: "task:ice",
        quantity: 1,
        declined: true,
      })) as { docId: Id<"planningReceipts"> }
    ).docId;

    expect(
      await refused(() =>
        owner.mutation(api.reasonedChanges.acceptSuggestion, {
          eventId: event,
          suggestionKey: "task:ice",
          kind: "task",
          target: "Ice",
          add: 1,
          wanted: 1,
          receiptId: receipt,
        }),
      ),
    ).toBe(true);
    const after = await t.run(async (ctx) => ({
      tasks: (await ctx.db.query("eventTasks").collect()).length,
      receipt: await ctx.db.get(receipt),
    }));
    expect(after.tasks).toBe(0);
    expect(after.receipt?.eventId).toBe(other);
    expect(after.receipt?.declined).toBe(true);
  });

  it("lets only the packer give a section back; take over keeps who took it", async () => {
    const { t, owner, plannerActor, event } = await timingWorld();
    await owner.mutation(M.Person_createViaHire, {
      givenName: "Robin",
      familyName: "Helper",
      email: "robin.helper@proof.example",
      role: "event_manager",
      employmentType: "full_time",
      authSubjectId: "timing-helper",
    });
    const helper = t.withIdentity({
      subject: "timing-helper",
      org_id: TIMING_TENANT,
      role: "event_manager",
    });
    const pack = (
      (await owner.mutation(M.PackList_createViaOpen, {
        eventId: event,
        name: "Main load",
      })) as { docId: Id<"packLists"> }
    ).docId;
    const live = async () =>
      (
        await t.run(async (ctx) => ctx.db.query("packSectionClaims").collect())
      ).filter((row) => row.releasedAt == null);

    await plannerActor.mutation(api.packSections.take, {
      packListId: pack,
      sectionKey: "cat:linen",
    });
    const [caseys] = await live();
    expect(
      await refused(() =>
        helper.mutation(M.PackSectionClaim_release, { docId: caseys._id }),
      ),
    ).toBe(true);
    expect((await live()).map((row) => row._id)).toEqual([caseys._id]);

    await helper.mutation(api.packSections.take, {
      packListId: pack,
      sectionKey: "cat:linen",
    });
    const ended = await t.run(async (ctx) => ctx.db.get(caseys._id));
    expect(ended?.releasedAt).not.toBe(null);
    expect(ended?.takenOverByPersonId).not.toBe(null);
    expect(ended?.takenOverByPersonId).not.toBe(caseys.personId);
    const [robins] = await live();
    expect(robins.personId).toBe(ended?.takenOverByPersonId);

    await helper.mutation(M.PackSectionClaim_release, { docId: robins._id });
    expect(await live()).toEqual([]);
  });
});
