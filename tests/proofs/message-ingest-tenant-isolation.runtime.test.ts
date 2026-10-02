/**
 * Runtime proof (PL-INBOX; AC-112): one company's sign-in cannot add to,
 * read, or change another company's conversations, and a caller with no
 * sign-in is refused and writes nothing.
 *
 * - The same provider thread and message ids sent by two companies make two
 *   separate threads; neither sees the other's.
 * - The second company cannot link, merge, mark, or qualify the first
 *   company's thread.
 * - A delivery with no sign-in is refused before anything is stored.
 * - A failed delivery shows the failure but not the provider's keys.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY)
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const owner = (tenantId: string) => ({
  subject: `iso-owner-${tenantId}`,
  tokenIdentifier: `iso|owner-${tenantId}`,
  role: "org:owner",
  tenantId,
});

const delivery = JSON.stringify({
  threadId: "shared-thread",
  messageId: "shared-msg",
  from: "client@example.test",
  body: "Can you do the 20th?",
});

describe("PL-INBOX conversations stay inside their company (AC-112)", () => {
  it("keeps each company's threads apart and refuses cross-company changes", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity(owner("tenant-iso-a"));
    const b = t.withIdentity(owner("tenant-iso-b"));

    const inA = await a.action(api.messageInbox.ingestProviderEnvelope, {
      provider: "email",
      rawJson: delivery,
    });
    const inB = await b.action(api.messageInbox.ingestProviderEnvelope, {
      provider: "email",
      rawJson: delivery,
    });
    expect(inA.recorded).toBe("ingested");
    expect(inB.recorded).toBe("ingested");
    expect(inB.threadId).not.toBe(inA.threadId);
    expect(inB.messageId).not.toBe(inA.messageId);

    const seenByB = await b.query(api.queries.listMessageThread, {});
    expect(seenByB.map((x) => x._id)).toEqual([inB.threadId]);
    const messagesSeenByB = await b.query(api.queries.listMessage, {});
    expect(messagesSeenByB.map((m) => m._id)).toEqual([inB.messageId]);
    expect(
      await b.query(api.queries.getMessageThread, { id: inA.threadId! }),
    ).toBeNull();

    const before = await t.run(async (ctx) => ctx.db.get(inA.threadId!));
    await expect(
      b.mutation(api.mutations.MessageThread_linkEvent, {
        docId: inA.threadId!,
      }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.mutations.MessageThread_mergeInto, {
        docId: inA.threadId!,
        targetThreadId: inB.threadId! as never,
      }),
    ).rejects.toThrow();
    await expect(
      b.mutation(api.mutations.MessageThread_setStatus, {
        docId: inA.threadId!,
        status: "non_lead",
      }),
    ).rejects.toThrow();
    await expect(
      b.action(api.messageInbox.qualifyThreadAsLead, {
        threadId: inA.threadId!,
      }),
    ).rejects.toThrow("Message thread not found");
    const after = await t.run(async (ctx) => ctx.db.get(inA.threadId!));
    expect(after).toEqual(before);
    const leads = await t.run(async (ctx) => ctx.db.query("leads").collect());
    expect(leads).toHaveLength(0);
  });

  it("refuses a delivery with no sign-in and stores nothing", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.messageInbox.ingestInboundMessage, {
        provider: "email",
        providerThreadId: "anon-thread",
        providerMessageId: "anon-msg",
        bodyText: "Forged callback",
      }),
    ).rejects.toThrow();
    await t.action(api.messageInboxPages.ingestProviderPage, {
      provider: "email",
      rawJson: JSON.stringify({ messages: [JSON.parse(delivery)] }),
    });
    const stored = await t.run(async (ctx) => ({
      threads: await ctx.db.query("messageThreads").collect(),
      messages: await ctx.db.query("messages").collect(),
      errors: await ctx.db.query("syncErrors").collect(),
    }));
    expect(stored).toEqual({ threads: [], messages: [], errors: [] });
  });

  it("shows a failed delivery without the provider's keys", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity(owner("tenant-iso-keys"));
    await a.action(api.messageInbox.ingestProviderEnvelope, {
      provider: "social",
      rawJson: JSON.stringify({
        messageId: "no-thread",
        body: "Hello",
        access_token: "hush-two",
        headers: { Authorization: "hush-three" },
      }),
    });
    const errors = await a.query(api.queries.listSyncError, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]!.errorMessage).toContain("missing required field");
    expect(errors[0]!.rawPayload).toContain('"messageId":"no-thread"');
    expect(errors[0]!.rawPayload).not.toContain("hush-two");
    expect(errors[0]!.rawPayload).not.toContain("hush-three");
  });
});
