/**
 * Runtime proof (PL-AUTH, AC-403 / AC-212 foreign event reads): every
 * hand-written event screen read gives a person in one workspace nothing
 * about an event of another workspace, and gives exactly the same answer
 * whether that event exists or not, so a guessed id cannot even prove the
 * event is there. The owner of the other workspace reads the same event, so
 * each probe hits a real row. Synthetic workspaces and records only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Outcome = { value: unknown } | { error: string };

async function outcome(read: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { value: await read() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep the first line of the thrown message only.
    return { error: message.split(String.fromCharCode(10))[0]! };
  }
}

/** Every hand-written query that takes one event id, read as the actor. */
function eventReads(actor: Role, eventId: string) {
  const id = eventId as never;
  return {
    getEvent: () => actor.query(api.queries.getEvent, { id }),
    readiness: () =>
      actor.query(api.eventReadiness.getEventReadiness, { eventId }),
    briefing: () => actor.query(api.eventDayBriefing.getBriefing, { eventId }),
    demandReview: () =>
      actor.query(api.culinaryDemand.eventDemandReview, { eventId: id }),
    laborSummary: () =>
      actor.query(api.laborSummary.eventLaborSummary, { eventId: id }),
    timingPlan: () =>
      actor.query(api.lib.operationalTransactions.eventTimingPlan, {
        eventId: id,
      }),
    prepReview: () =>
      actor.query(api.lib.culinaryOperations.eventPrepWorkReview, {
        eventId: id,
      }),
    canManagePacket: () =>
      actor.query(api.lib.eventPacket.commands.canManagePacket, {
        eventId: id,
      }),
    packet: () =>
      actor.query(api.lib.eventPacket.commands.getPacket, { eventId: id }),
    bookingDetails: () =>
      actor.query(api.quoteBuilder.getEventBookingDetails, { eventId: id }),
    chatChannel: () =>
      actor.query(api.teamChat.listChannel, { eventId, since: 0 }),
    chatSummary: () =>
      actor.query(api.teamChat.channelSummary, { eventId, since: 0 }),
  };
}

async function readAll(
  actor: Role,
  eventId: string,
): Promise<Record<string, Outcome>> {
  const reads = eventReads(actor, eventId);
  const result: Record<string, Outcome> = {};
  for (const [name, read] of Object.entries(reads)) {
    result[name] = await outcome(read);
  }
  return result;
}

/** Nothing about the event: an error, null, false or an empty list. */
function revealsNothing(result: Outcome): boolean {
  if ("error" in result) return true;
  const value = result.value as unknown;
  if (value == null || value === false) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

describe("runtime proof: an event of another workspace reads as not found (AC-403)", () => {
  it("each event read gives an outsider nothing and the same answer before and after the event stops existing", async () => {
    const proof = harness();
    const tenantA = "tenant-foreign-reads-a";
    const tenantB = "tenant-foreign-reads-b";
    const ownerA = proof.asRole({
      subject: "foreign-reads-owner-a",
      role: "owner",
      tenantId: tenantA,
    });
    const ownerB = proof.asRole({
      subject: "foreign-reads-owner-b",
      role: "owner",
      tenantId: tenantB,
    });

    const { eventId } = await createPlannedEvent(
      proof,
      tenantB,
      "Workspace B private dinner",
    );

    // Control: the owner of workspace B reads the real event.
    const own = await readAll(ownerB, eventId);
    expect(own.getEvent).toMatchObject({ value: { _id: eventId } });
    expect("value" in own.readiness && own.readiness.value != null).toBe(true);
    expect(own.timingPlan).not.toHaveProperty("error");

    // Workspace A probes the real id.
    const whileLive = await readAll(ownerA, eventId);
    for (const [name, result] of Object.entries(whileLive)) {
      expect(
        revealsNothing(result),
        name + " leaked " + JSON.stringify(result),
      ).toBe(true);
    }

    // The same id after the row is gone: every answer is unchanged.
    await ownerB.run(async (ctx) =>
      (ctx.db as unknown as { delete: (id: never) => Promise<void> }).delete(
        eventId as never,
      ),
    );
    const afterGone = await readAll(ownerA, eventId);
    expect(afterGone).toEqual(whileLive);
  });
});
