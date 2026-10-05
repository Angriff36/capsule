import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const finalLock = api.lib.eventPacket.finalLock;

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "channel-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const outsider = t.withIdentity({
    subject: "channel-outsider",
    org_id: "tenant-b",
    role: "admin",
  });
  const eventId = await t.run((ctx) =>
    ctx.db.insert("events", {
      tenantId: "tenant-a",
      title: "Ashley's Wedding",
      eventType: "Wedding",
      eventNumber: "6014",
      startsAt: Date.parse("2026-10-10T18:00:00Z"),
      endsAt: Date.parse("2026-10-10T21:00:00Z"),
      expectedHeadcount: 100,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "planning",
      version: 1,
      deletedAt: null,
    }),
  );
  const event = () => t.run(async (ctx) => (await ctx.db.get(eventId))!);
  return { t, manager, outsider, eventId, event };
}

const channel = (report: any) =>
  report.answers.find((a: any) => a.questionKey === "communication.channel");

describe("event communication", () => {
  it("mirrors the event channel to an external channel named event-number-event-name and stores the identity", async () => {
    const { manager, outsider, eventId, event } = await setup();
    const before = channel(
      await manager.query(finalLock.getFinalLock, { eventId }),
    );
    expect(before.value.fields.outsideChannelName).toBe(
      "6014-ashley-s-wedding",
    );

    const link = {
      channelName: before.value.fields.outsideChannelName,
      channelId: "C0123ABC",
      channelUrl: "https://mangia.slack.com/archives/C0123ABC",
    };
    // Another workspace cannot record a channel on this event.
    await expect(
      outsider.mutation(api.mutations.Event_linkExternalChannel, {
        docId: eventId,
        version: (await event()).version,
        ...link,
      }),
    ).rejects.toThrow();

    await manager.mutation(api.mutations.Event_linkExternalChannel, {
      docId: eventId,
      version: (await event()).version,
      ...link,
    });
    const stored = await event();
    expect(stored).toMatchObject({
      externalChannelName: "6014-ashley-s-wedding",
      externalChannelId: "C0123ABC",
      externalChannelUrl: "https://mangia.slack.com/archives/C0123ABC",
    });
    const linked = channel(
      await manager.query(finalLock.getFinalLock, { eventId }),
    );
    expect(linked.result).toBe("answered");
    expect(linked.value.fields.outsideChannel).toBe("6014-ashley-s-wedding");

    // A new event number makes the outside name out of date until renamed.
    await manager.mutation(api.mutations.Event_setEventNumber, {
      docId: eventId,
      version: (await event()).version,
      eventNumber: "6020",
    });
    const moved = channel(
      await manager.query(finalLock.getFinalLock, { eventId }),
    );
    // No outside channel name is checked (Ryan 2026-09-29).
    expect(moved.result).toBe("answered");

    await manager.mutation(api.mutations.Event_unlinkExternalChannel, {
      docId: eventId,
      version: (await event()).version,
    });
    expect((await event()).externalChannelId ?? null).toBeNull();
    expect(
      channel(await manager.query(finalLock.getFinalLock, { eventId })).result,
    ).toBe("answered");
  });
});
