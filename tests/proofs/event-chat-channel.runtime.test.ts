/**
 * Event chat replaces Slack event channels (BE-20.6, binder/Slack job
 * "event coordination"): a message posted in an event's channel is read by
 * the company's other staff, stays with that event only, a retried send
 * posts it once, and another company cannot open the channel.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-event-chat";
const OTHER = "tenant-event-chat-other";

async function person(
  t: ReturnType<typeof convexTest>,
  tenantId: string,
  subject: string,
): Promise<Id<"people">> {
  return t.run((ctx) =>
    ctx.db.insert("people", {
      tenantId,
      givenName: "Pat",
      familyName: subject,
      email: `${subject}@example.test`,
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
      authSubjectId: subject,
      version: 1,
    } as never),
  ) as Promise<Id<"people">>;
}

async function event(
  t: ReturnType<typeof convexTest>,
  title: string,
): Promise<Id<"events">> {
  return t.run((ctx) =>
    ctx.db.insert("events", {
      tenantId: TENANT,
      title,
      eventType: "Wedding",
      startsAt: Date.now() + 2 * 86_400_000,
      endsAt: Date.now() + 2 * 86_400_000 + 6 * 3_600_000,
      expectedHeadcount: 120,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "approved",
      version: 1,
    } as never),
  ) as Promise<Id<"events">>;
}

describe("runtime proof: event chat channel", () => {
  it("posts once in the event's channel, readable by the company's staff, not another company", async () => {
    const t = convexTest(schema, modules);
    const leadId = await person(t, TENANT, "chat-lead");
    await person(t, TENANT, "chat-cook");
    await person(t, OTHER, "chat-outsider");
    const wedding = await event(t, "Garden wedding");
    const gala = await event(t, "Winter gala");

    const lead = t.withIdentity({
      subject: "chat-lead",
      org_id: TENANT,
      role: "kitchen_staff",
    });
    const cook = t.withIdentity({
      subject: "chat-cook",
      org_id: TENANT,
      role: "kitchen_staff",
    });
    const outsider = t.withIdentity({
      subject: "chat-outsider",
      org_id: OTHER,
      role: "kitchen_staff",
    });

    const send = () =>
      lead.mutation(api.teamChatSend.sendWithFiles, {
        eventId: String(wedding),
        body: "Rentals arrive at 2, load-in at the side door",
        files: [],
        idempotencyKey: "wedding-draft-1",
        sender: { tenantId: TENANT, personId: String(leadId) },
      });
    await send();
    // A retried send (lost response) posts nothing new.
    await send();

    const since = Date.now() - 86_400_000;
    const thread = (await cook.query(api.teamChat.listChannel, {
      eventId: String(wedding),
      since,
    })) as { messages: Array<{ body: string }> } | null;
    expect(thread?.messages.map((message) => message.body)).toEqual([
      "Rentals arrive at 2, load-in at the side door",
    ]);

    // The message belongs to this event only.
    const other = (await cook.query(api.teamChat.listChannel, {
      eventId: String(gala),
      since,
    })) as { messages: unknown[] } | null;
    expect(other?.messages).toEqual([]);

    // Another company cannot open the channel.
    expect(
      await outsider.query(api.teamChat.listChannel, {
        eventId: String(wedding),
        since,
      }),
    ).toBeNull();
  });
});
