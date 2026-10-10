/**
 * Runtime proof (PL-SMS-SOCIAL; AC-354): a client's Facebook or Instagram
 * message to a company's own account comes in through Meta's signed webhook
 * and lands in that company's inbox.
 *
 * - Meta's signature (X-Hub-Signature-256) is checked; an unsigned or wrongly
 *   signed request stores nothing.
 * - The message is matched to the company by the account it went to; another
 *   company and an account no company uses get nothing.
 * - Meta delivering the same message again adds no message and no lead.
 * - One conversation per client per account; the company's own replies
 *   (echoes) are not stored as client messages; photos keep only their kind.
 * - Meta's one-time setup check answers only with the right verify token.
 */
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const APP_SECRET = "proof-meta-secret";
const VERIFY_TOKEN = "proof-verify";
const SITE = "https://proof.convex.site";
const PATH = "/meta/messages";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY)
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});
const saved = {
  secret: process.env.META_APP_SECRET,
  verify: process.env.META_VERIFY_TOKEN,
  site: process.env.CONVEX_SITE_URL,
};
beforeEach(() => {
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.CONVEX_SITE_URL = SITE;
});
afterEach(() => {
  process.env.META_APP_SECRET = saved.secret;
  process.env.META_VERIFY_TOKEN = saved.verify;
  process.env.CONVEX_SITE_URL = saved.site;
});

function sign(body: string, secret = APP_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function deliver(
  t: ReturnType<typeof convexTest>,
  payload: unknown,
  signature?: string,
) {
  const body = JSON.stringify(payload);
  return t.fetch(PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signature ?? sign(body),
    },
    body,
  });
}

function dm(
  object: "page" | "instagram",
  accountId: string,
  messaging: Array<Record<string, unknown>>,
) {
  return { object, entry: [{ id: accountId, time: 1, messaging }] };
}

const firstDm = {
  sender: { id: "PSID-dana" },
  recipient: { id: "PAGE-A" },
  timestamp: 1,
  message: {
    mid: "m_first",
    text: "Do you cater weddings for 120 on June 6?",
    attachments: [
      { type: "image", payload: { url: "https://scontent.example/x.jpg" } },
    ],
  },
};

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("organizations", {
      tenantId: "tenant-social-a",
      name: "Harvest Catering",
      status: "active",
      facebookPageId: "PAGE-A",
      instagramAccountId: "IG-A",
      version: 1,
    } as never);
    await ctx.db.insert("organizations", {
      tenantId: "tenant-social-b",
      name: "Other Catering",
      status: "active",
      facebookPageId: "PAGE-B",
      version: 1,
    } as never);
  });
}

async function rows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ({
    threads: await ctx.db.query("messageThreads").collect(),
    messages: await ctx.db.query("messages").collect(),
    leads: await ctx.db.query("leads").collect(),
  }));
}

describe("PL-SMS-SOCIAL client social messages come into the company inbox", () => {
  it("replaying the same provider DM creates no duplicate message or lead", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const response = await deliver(t, dm("page", "PAGE-A", [firstDm]));
    expect(response.status).toBe(200);
    // Meta delivers the same message again.
    expect((await deliver(t, dm("page", "PAGE-A", [firstDm]))).status).toBe(
      200,
    );

    const { threads, messages, leads } = await rows(t);
    expect(leads).toHaveLength(0);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      tenantId: "tenant-social-a",
      provider: "social",
      providerAccountId: "facebook:PAGE-A",
      providerThreadId: "PSID-dana",
      senderIdentity: "PSID-dana",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      tenantId: "tenant-social-a",
      threadId: threads[0]!._id,
      direction: "inbound",
      status: "received",
      bodyText: "Do you cater weddings for 120 on June 6?",
      providerMessageId: "m_first",
    });
    expect(JSON.parse(messages[0]!.mediaJson!)).toEqual([
      { id: "m_first:0", kind: "image" },
    ]);
    expect(messages[0]!.rawPayload).not.toContain("https://");

    // A second message joins the same conversation; the company's own reply
    // (an echo) is not stored as a client message.
    await deliver(
      t,
      dm("page", "PAGE-A", [
        {
          ...firstDm,
          message: { mid: "m_second", text: "Also a vegan plate." },
        },
        {
          sender: { id: "PAGE-A" },
          recipient: { id: "PSID-dana" },
          message: { mid: "m_echo", text: "Yes we do!", is_echo: true },
        },
      ]),
    );
    const after = await rows(t);
    expect(after.threads).toHaveLength(1);
    expect(after.messages.map((m) => m.bodyText).sort()).toEqual([
      "Also a vegan plate.",
      "Do you cater weddings for 120 on June 6?",
    ]);

    // PL-CONNECTIONS: the company's Facebook connection row names its Page
    // and says when the last message came in.
    const connections = await t.run(async (ctx) =>
      ctx.db.query("integrationConnections").collect(),
    );
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      tenantId: "tenant-social-a",
      provider: "facebook",
      status: "connected",
      externalAccountId: "PAGE-A",
    });
    const setup = await t
      .withIdentity({
        subject: "social-owner-a",
        tokenIdentifier: "social|owner-a",
        role: "org:owner",
        tenantId: "tenant-social-a",
      })
      .query(api.socialInbox.socialSetup, {});
    expect(setup?.address).toBe(`${SITE}${PATH}`);
    expect(setup?.lastFacebookAt).toBe(connections[0]!.lastSuccessfulSyncAt);
    expect(setup?.lastInstagramAt).toBeNull();
  });

  it("an Instagram message to the company's Instagram account gets its own conversation", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await deliver(
      t,
      dm("instagram", "IG-A", [
        {
          ...firstDm,
          recipient: { id: "IG-A" },
          message: { mid: "ig_1", text: "Menu?" },
        },
      ]),
    );
    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      tenantId: "tenant-social-a",
      providerAccountId: "instagram:IG-A",
    });
    expect(messages).toHaveLength(1);
  });

  it("an unsigned or wrongly signed request stores nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const payload = dm("page", "PAGE-A", [firstDm]);
    expect((await deliver(t, payload, "")).status).toBe(403);
    expect(
      (await deliver(t, payload, sign(JSON.stringify(payload), "wrong")))
        .status,
    ).toBe(403);
    const changed = dm("page", "PAGE-A", [
      { ...firstDm, message: { mid: "m_first", text: "changed" } },
    ]);
    expect(
      (await deliver(t, changed, sign(JSON.stringify(payload)))).status,
    ).toBe(403);
    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("each company only gets messages to its own account; an unused account gets nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await deliver(
      t,
      dm("page", "PAGE-B", [
        { ...firstDm, message: { mid: "m_b", text: "Hi" } },
      ]),
    );
    expect(
      (
        await deliver(
          t,
          dm("page", "PAGE-X", [
            { ...firstDm, message: { mid: "m_x", text: "Hi" } },
          ]),
        )
      ).status,
    ).toBe(200);
    // Company B has no Instagram account set, so an Instagram id equal to its
    // Page id does not reach it.
    await deliver(
      t,
      dm("instagram", "PAGE-B", [
        { ...firstDm, message: { mid: "m_ig", text: "Hi" } },
      ]),
    );
    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ tenantId: "tenant-social-b" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ providerMessageId: "m_b" });
  });

  it("Meta's setup check answers only with the right verify token", async () => {
    const t = convexTest(schema, modules);
    const ok = await t.fetch(
      `${PATH}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
      { method: "GET" },
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await t.fetch(
      `${PATH}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345`,
      { method: "GET" },
    );
    expect(bad.status).toBe(403);
  });
});
