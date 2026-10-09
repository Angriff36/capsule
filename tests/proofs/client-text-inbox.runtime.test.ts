/**
 * Runtime proof (PL-INBOX; AC-104, AC-247 arrival legs): a client text sent
 * to a company's own texting number comes in through Twilio's signed
 * webhook and lands in that company's inbox.
 *
 * - Twilio's signature is checked; an unsigned or wrongly signed request
 *   stores nothing.
 * - The text is matched to the company by the number it went to; another
 *   company and a number no company uses get nothing.
 * - Twilio delivering the same text again adds nothing.
 * - One conversation per client phone, linked to the one client contact
 *   with that phone; photos are kept as ids and kinds, never as links.
 */
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const AUTH_TOKEN = "proof-twilio-token";
const SITE = "https://proof.convex.site";
const PATH = "/twilio/sms";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY)
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});
const savedToken = process.env.TWILIO_AUTH_TOKEN;
const savedSite = process.env.CONVEX_SITE_URL;
beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  process.env.CONVEX_SITE_URL = SITE;
});
afterEach(() => {
  process.env.TWILIO_AUTH_TOKEN = savedToken;
  process.env.CONVEX_SITE_URL = savedSite;
});

function sign(params: Record<string, string>, token = AUTH_TOKEN): string {
  const data =
    SITE +
    PATH +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return createHmac("sha1", token).update(data).digest("base64");
}

function text(
  t: ReturnType<typeof convexTest>,
  params: Record<string, string>,
  signature = sign(params),
) {
  return t.fetch(PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body: new URLSearchParams(params).toString(),
  });
}

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    await ctx.db.insert("organizations", {
      tenantId: "tenant-text-a",
      name: "Harvest Catering",
      status: "active",
      smsNumber: "(555) 010-2000",
      version: 1,
    } as never);
    await ctx.db.insert("organizations", {
      tenantId: "tenant-text-b",
      name: "Other Catering",
      status: "active",
      smsNumber: "+15550103000",
      version: 1,
    } as never);
    const clientId = await ctx.db.insert("clients", {
      tenantId: "tenant-text-a",
      clientType: "company",
      companyName: "Dana Weddings",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
    } as never);
    const contactId = await ctx.db.insert("clientContacts", {
      tenantId: "tenant-text-a",
      clientId,
      givenName: "Dana",
      mobile: "555-777-1234",
      isPrimary: true,
      isBillingContact: false,
      status: "active",
      version: 1,
    } as never);
    return { contactId };
  });
}

async function rows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ({
    threads: await ctx.db.query("messageThreads").collect(),
    messages: await ctx.db.query("messages").collect(),
  }));
}

const first = {
  MessageSid: "SM-first",
  AccountSid: "AC-proof",
  From: "+15557771234",
  To: "+15550102000",
  Body: "Can we add 20 guests to Saturday?",
  NumMedia: "1",
  MediaUrl0:
    "https://api.twilio.com/2010-04-01/Accounts/AC-proof/Messages/SM-first/Media/ME-photo1",
  MediaContentType0: "image/jpeg",
};

describe("PL-INBOX client texts come into the company inbox", () => {
  it("a signed text lands once in the right company's inbox, linked to the client contact", async () => {
    const t = convexTest(schema, modules);
    const { contactId } = await seed(t);

    const response = await text(t, first);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<Response>");
    // Twilio delivers the same text again.
    expect((await text(t, first)).status).toBe(200);

    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      tenantId: "tenant-text-a",
      provider: "sms",
      providerAccountId: "+15550102000",
      providerThreadId: "+15557771234",
      senderIdentity: "+15557771234",
      contactId,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      tenantId: "tenant-text-a",
      threadId: threads[0]!._id,
      direction: "inbound",
      status: "received",
      bodyText: "Can we add 20 guests to Saturday?",
      providerMessageId: "SM-first",
      senderIdentity: "+15557771234",
    });
    expect(JSON.parse(messages[0]!.mediaJson!)).toEqual([
      { id: "ME-photo1", kind: "image/jpeg" },
    ]);
    expect(messages[0]!.rawPayload).not.toContain("https://");
    expect(typeof messages[0]!.sentAt).toBe("number");

    // A second text from the same phone joins the same conversation.
    const second = {
      ...first,
      MessageSid: "SM-second",
      Body: "Also a vegan plate.",
      NumMedia: "0",
    };
    delete (second as Record<string, string>).MediaUrl0;
    delete (second as Record<string, string>).MediaContentType0;
    await text(t, second);
    const after = await rows(t);
    expect(after.threads).toHaveLength(1);
    expect(after.messages.map((m) => m.bodyText).sort()).toEqual([
      "Also a vegan plate.",
      "Can we add 20 guests to Saturday?",
    ]);

    // PL-CONNECTIONS: the company's one text connection row is for its
    // number and says when the last client text came in; company B has none.
    const connections = await t.run(async (ctx) =>
      ctx.db.query("integrationConnections").collect(),
    );
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      tenantId: "tenant-text-a",
      provider: "sms",
      status: "connected",
      externalAccountId: "+15550102000",
    });
    expect(typeof connections[0]!.lastSuccessfulSyncAt).toBe("number");
    const owner = (tenantId: string) => ({
      subject: `text-owner-${tenantId}`,
      tokenIdentifier: `text|owner-${tenantId}`,
      role: "org:owner",
      tenantId,
    });
    const setup = await t
      .withIdentity(owner("tenant-text-a"))
      .query(api.textInbox.textSetup, {});
    expect(setup?.lastTextAt).toBe(connections[0]!.lastSuccessfulSyncAt);
    const other = await t
      .withIdentity(owner("tenant-text-b"))
      .query(api.textInbox.textSetup, {});
    expect(other?.lastTextAt).toBeNull();
  });

  it("an unsigned or wrongly signed request stores nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    expect((await text(t, first, "")).status).toBe(403);
    expect((await text(t, first, sign(first, "wrong-token"))).status).toBe(403);
    expect(
      (await text(t, { ...first, Body: "changed" }, sign(first))).status,
    ).toBe(403);
    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("each company only gets texts to its own number; an unused number gets nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await text(t, { ...first, MessageSid: "SM-b", To: "+15550103000" });
    expect(
      (await text(t, { ...first, MessageSid: "SM-x", To: "+15550109999" }))
        .status,
    ).toBe(200);
    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ tenantId: "tenant-text-b" });
    // Company B has no client with that phone, so nothing is linked.
    expect(threads[0]!.contactId ?? undefined).toBeUndefined();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      tenantId: "tenant-text-b",
      providerMessageId: "SM-b",
    });
  });
});
