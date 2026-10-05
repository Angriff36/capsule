/**
 * Runtime proof (PL-INBOX; AC-105, AC-247, AC-248, AC-249, AC-104 data leg):
 * provider messages come in once, whatever the provider repeats.
 *
 * - Polled pages that overlap, and a restart from an older saved position,
 *   leave one row per provider message in one thread; the next position is
 *   handed back only after the page is stored.
 * - A message that cannot be read lands in the retryable failure list with
 *   its raw text, and a page that is not readable at all moves nothing.
 * - Qualifying twice at once, and replaying the delivery afterwards, leaves
 *   one lead.
 * - Each stored message keeps account, thread and message ids, the send
 *   time, the sender and its attachments (each once, no link).
 * - Staff link the conversation to an event and merge a duplicate; no
 *   message is moved or lost, and a thread cannot merge into itself.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY)
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const owner = (tenantId: string) => ({
  subject: `inbox-owner-${tenantId}`,
  tokenIdentifier: `inbox|owner-${tenantId}`,
  role: "org:owner",
  tenantId,
});

const envelope = (messageId: string, body: string, extra = {}) => ({
  threadId: "ig-thread-1",
  messageId,
  from: "@dana.events",
  body,
  sent_at: "2026-10-01T15:00:00Z",
  ...extra,
});

async function rows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ({
    threads: await ctx.db.query("messageThreads").collect(),
    messages: await ctx.db.query("messages").collect(),
    leads: await ctx.db.query("leads").collect(),
    errors: await ctx.db.query("syncErrors").collect(),
  }));
}

describe("PL-INBOX provider messages come in once", () => {
  it("overlapping pages and a restart from an older position store each message once (AC-105)", async () => {
    const t = convexTest(schema, modules);
    const staff = t.withIdentity(owner("tenant-inbox-pages"));
    const page = (messages: unknown[], nextCursor: string) =>
      staff.action(api.messageInboxPages.ingestProviderPage, {
        provider: "social",
        providerAccountId: "ig-acct-9",
        rawJson: JSON.stringify({ messages, nextCursor }),
      });

    const first = await page(
      [envelope("m1", "Do you do weddings?"), envelope("m2", "For 120 guests")],
      "cursor-1",
    );
    expect(first).toEqual({
      ingested: 2,
      duplicates: 0,
      failed: 0,
      nextCursor: "cursor-1",
    });
    // The next page overlaps the first by one message.
    const second = await page(
      [envelope("m2", "For 120 guests"), envelope("m3", "In June")],
      "cursor-2",
    );
    expect(second).toEqual({
      ingested: 1,
      duplicates: 1,
      failed: 0,
      nextCursor: "cursor-2",
    });
    // The poller stopped before saving cursor-2 and restarts at cursor-1.
    const restart = await page(
      [envelope("m2", "For 120 guests"), envelope("m3", "In June")],
      "cursor-2",
    );
    expect(restart).toEqual({
      ingested: 0,
      duplicates: 2,
      failed: 0,
      nextCursor: "cursor-2",
    });

    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      provider: "social",
      providerAccountId: "ig-acct-9",
      providerThreadId: "ig-thread-1",
    });
    expect(messages.map((m) => m.providerMessageId).sort()).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    for (const m of messages) {
      expect(m.direction).toBe("inbound");
      expect(m.senderIdentity).toBe("@dana.events");
      expect(m.sentAt).toBe(Date.parse("2026-10-01T15:00:00Z"));
    }
  });

  it("an unreadable message lands in the retry list with its raw text; an unreadable page moves nothing (AC-105, AC-248)", async () => {
    const t = convexTest(schema, modules);
    const staff = t.withIdentity(owner("tenant-inbox-bad"));

    const mixed = await staff.action(api.messageInboxPages.ingestProviderPage, {
      provider: "email",
      rawJson: JSON.stringify({
        messages: [
          envelope("e1", "Menu question"),
          { threadId: "ig-thread-1", messageId: "e2" }, // no body
        ],
        nextCursor: "c-9",
      }),
    });
    expect(mixed).toMatchObject({ ingested: 1, failed: 1, nextCursor: "c-9" });

    const broken = await staff.action(
      api.messageInboxPages.ingestProviderPage,
      { provider: "email", rawJson: "{not json" },
    );
    expect(broken).toEqual({
      ingested: 0,
      duplicates: 0,
      failed: 1,
      nextCursor: null,
    });

    const { messages, errors } = await rows(t);
    expect(messages).toHaveLength(1);
    expect(errors).toHaveLength(2);
    for (const e of errors) expect(e.status).toBe("pending");
    const missing = errors.find((e) => e.kind === "missing_field")!;
    expect(missing.externalId).toBe("e2");
    expect(missing.rawPayload).toContain('"messageId":"e2"');
    const unreadable = errors.find((e) => e.kind === "parse_failed")!;
    expect(unreadable.rawPayload).toContain("{not json");
  });

  it("qualifying twice at once and replaying the delivery leaves one lead (AC-247, AC-249)", async () => {
    const t = convexTest(schema, modules);
    const staff = t.withIdentity(owner("tenant-inbox-lead"));
    const deliver = () =>
      staff.action(api.messageInbox.ingestProviderEnvelope, {
        provider: "social",
        rawJson: JSON.stringify(envelope("q1", "Quote for a birthday?")),
      });

    const first = await deliver();
    const threadId = first.threadId as Id<"messageThreads">;
    const [a, b] = await Promise.all([
      staff.action(api.messageInbox.qualifyThreadAsLead, { threadId }),
      staff.action(api.messageInbox.qualifyThreadAsLead, { threadId }),
    ]);
    expect(a.leadId).toBe(b.leadId);
    const replay = await deliver();
    expect(replay).toMatchObject({ isDuplicate: true, threadId });
    const again = await staff.action(api.messageInbox.qualifyThreadAsLead, {
      threadId,
    });
    expect(again).toEqual({ leadId: a.leadId, created: false });

    const { leads, messages, threads } = await rows(t);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.source).toBe("Social");
    expect(messages).toHaveLength(1);
    expect(threads[0]!.leadId).toBe(a.leadId);
  });

  it("matches a new conversation to the one client contact with the sender's email (AC-247)", async () => {
    const t = convexTest(schema, modules);
    const staff = t.withIdentity(owner("tenant-inbox-contact"));
    const client = await staff.mutation(
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Lakeside Weddings" },
    );
    const contact = await staff.mutation(
      api.mutations.ClientContact_createViaAdd,
      {
        clientId: client.docId,
        givenName: "Robin",
        email: "Robin@Lakeside.test",
      } as never,
    );
    const known = await staff.action(api.messageInbox.ingestInboundMessage, {
      provider: "email",
      providerThreadId: "c-1",
      providerMessageId: "c-1-a",
      senderIdentity: "robin@lakeside.test",
      bodyText: "Tasting next week?",
    });
    const unknown = await staff.action(api.messageInbox.ingestInboundMessage, {
      provider: "email",
      providerThreadId: "c-2",
      providerMessageId: "c-2-a",
      senderIdentity: "stranger@elsewhere.test",
      bodyText: "Hello",
    });
    const threads = await t.run(async (ctx) =>
      ctx.db.query("messageThreads").collect(),
    );
    const byId = new Map(threads.map((x) => [x._id, x]));
    expect(byId.get(known.threadId)!.contactId).toBe(contact.docId);
    expect(byId.get(unknown.threadId)!.contactId ?? null).toBeNull();
    const contacts = await t.run(async (ctx) =>
      ctx.db.query("clientContacts").collect(),
    );
    expect(contacts).toHaveLength(1);
  });

  it("keeps each attachment once, as a reference with no link, and hides provider keys (AC-104, AC-112)", async () => {
    const t = convexTest(schema, modules);
    const staff = t.withIdentity(owner("tenant-inbox-media"));
    await staff.action(api.messageInbox.ingestProviderEnvelope, {
      provider: "social",
      rawJson: JSON.stringify(
        envelope("p1", "Here is the room", {
          access_token: "hush-one",
          attachments: [
            {
              id: "att-1",
              type: "image/jpeg",
              name: "ballroom.jpg",
              url: "https://cdn.provider.test/private/ballroom.jpg?sig=abc",
            },
            { id: "att-1", type: "image/jpeg", name: "ballroom.jpg" },
          ],
        }),
      ),
    });
    const { messages } = await rows(t);
    expect(JSON.parse(messages[0]!.mediaJson!)).toEqual([
      { id: "att-1", kind: "image/jpeg", name: "ballroom.jpg" },
    ]);
    expect(messages[0]!.mediaJson).not.toContain("https://");
    expect(messages[0]!.rawPayload).not.toContain("hush-one");
    expect(messages[0]!.rawPayload).toContain("[hidden]");
  });

  it("links a conversation to an event and merges a duplicate without moving or losing a message (AC-106, AC-248, AC-249)", async () => {
    const t = convexTest(schema, modules);
    const staff = t.withIdentity(owner("tenant-inbox-merge"));
    const main = await staff.action(api.messageInbox.ingestInboundMessage, {
      provider: "email",
      providerThreadId: "mail-1",
      providerMessageId: "x1",
      bodyText: "Booking the 14th",
    });
    const dup = await staff.action(api.messageInbox.ingestInboundMessage, {
      provider: "email",
      providerThreadId: "mail-2",
      providerMessageId: "x2",
      bodyText: "Same booking, new email chain",
    });
    const client = await staff.mutation(
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Smith family" },
    );
    const event = await staff.mutation(
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Smith wedding",
        eventType: "wedding",
        venueName: "Proof Hall",
        serviceStyleName: "Plated",
        startsAt: Date.UTC(2026, 10, 14, 22),
        endsAt: Date.UTC(2026, 10, 15, 3),
        expectedHeadcount: 120,
        primaryContactName: "Dana Smith",
        budgetAmount: 9000,
        quotedPrice: 12000,
      },
    );
    const eventId = event.docId;

    await staff.mutation(api.mutations.MessageThread_linkEvent, {
      docId: main.threadId,
      eventId: eventId as never,
    });
    await expect(
      staff.mutation(api.mutations.MessageThread_mergeInto, {
        docId: dup.threadId,
        targetThreadId: dup.threadId as never,
      }),
    ).rejects.toThrow("Pick a different conversation to merge into.");
    await staff.mutation(api.mutations.MessageThread_mergeInto, {
      docId: dup.threadId,
      targetThreadId: main.threadId as never,
    });

    const { threads, messages } = await rows(t);
    const target = threads.find((x) => x._id === main.threadId)!;
    const merged = threads.find((x) => x._id === dup.threadId)!;
    expect(target.eventId).toBe(eventId);
    expect(target.provider).toBe("email");
    expect(merged).toMatchObject({
      mergedIntoThreadId: main.threadId,
      status: "archived",
    });
    expect(merged.deletedAt ?? null).toBeNull();
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.providerMessageId === "x2")!.threadId).toBe(
      dup.threadId,
    );

    // Leaving the event out clears the link.
    await staff.mutation(api.mutations.MessageThread_linkEvent, {
      docId: main.threadId,
    });
    const cleared = await t.run(async (ctx) => ctx.db.get(main.threadId));
    expect(cleared!.eventId ?? null).toBeNull();
  });
});
