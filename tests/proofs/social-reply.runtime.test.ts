/**
 * Runtime proof (PL-SMS-SOCIAL; AC-354 outbound leg): staff answer a client's
 * Facebook or Instagram message from the inbox, in the same conversation,
 * through Meta's Send API with the company's own Page key.
 *
 * - The Page key is saved only by a manager, only when Meta says it opens the
 *   company's own Page, and is kept encrypted (the plain key is never stored).
 * - The reply goes to the client the message came from and is added with
 *   Meta's message id; Send again with the same typed reply sends nothing.
 * - Meta's limits come back in plain words (24-hour window) and add nothing;
 *   another company cannot answer in this company's conversation.
 */
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-social-reply";
const PAGE_KEY = "EAAB-proof-page-key";

beforeEach(() => {
  vi.stubEnv("META_APP_SECRET", "proof-meta-secret");
  vi.stubEnv("META_VERIFY_TOKEN", "proof-verify");
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY)
    vi.stubEnv(
      "CONVEX_FIELD_ENCRYPTION_KEY",
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
    );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

interface GraphCall {
  url: string;
  auth: string;
  body: Record<string, unknown> | null;
}

/** Meta stand-in: /me names `pageOwner`; sends answer from `answers`. */
function stubMeta(pageOwner: string, answers: Array<"ok" | "window" | "lost">) {
  const calls: GraphCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: { headers?: Record<string, string>; body?: string },
      ) => {
        calls.push({
          url,
          auth: init.headers?.Authorization ?? "",
          body: init.body
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
        });
        if (url.includes("/me?fields=id"))
          return Response.json({ id: pageOwner });
        const answer = answers.shift() ?? "ok";
        if (answer === "lost") throw new TypeError("fetch failed");
        if (answer === "window")
          return Response.json(
            {
              error: {
                code: 10,
                error_subcode: 2018278,
                message:
                  "(#10) This message is sent outside of allowed window.",
              },
            },
            { status: 400 },
          );
        return Response.json({
          recipient_id: "PSID-dana",
          message_id: `m_out_${calls.length}`,
        });
      },
    ),
  );
  return calls;
}

function person(t: TestConvex, role: string, tenant = TENANT) {
  return t.withIdentity({
    subject: `social-reply-${role}-${tenant}`,
    org_id: tenant,
    role,
  });
}

async function seedThread(t: TestConvex): Promise<Id<"messageThreads">> {
  await t.run(async (ctx) => {
    await ctx.db.insert("organizations", {
      tenantId: TENANT,
      name: "Harvest Catering",
      status: "active",
      facebookPageId: "PAGE-A",
      version: 1,
    } as never);
  });
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "PAGE-A",
        messaging: [
          {
            sender: { id: "PSID-dana" },
            message: { mid: "m_in_1", text: "Do you cater weddings?" },
          },
        ],
      },
    ],
  });
  await t.fetch("/meta/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256":
        "sha256=" +
        createHmac("sha256", "proof-meta-secret").update(body).digest("hex"),
    },
    body,
  });
  const thread = await t.run(
    async (ctx) => (await ctx.db.query("messageThreads").collect())[0],
  );
  if (!thread) throw new Error("no thread");
  return thread._id;
}

async function outbound(t: TestConvex) {
  return t.run(async (ctx) =>
    (await ctx.db.query("messages").collect()).filter(
      (m) => m.direction === "outbound",
    ),
  );
}

describe("PL-SMS-SOCIAL staff answer Facebook and Instagram messages", () => {
  it("saves the Page key only for the company's own Page, encrypted, and only by a manager", async () => {
    const t = setup();
    await seedThread(t);

    stubMeta("SOMEONE-ELSE", []);
    await expect(
      person(t, "admin").action(api.socialReply.savePageKey, {
        pageKey: PAGE_KEY,
      }),
    ).rejects.toThrow(/does not open your Facebook Page/u);

    stubMeta("PAGE-A", []);
    await expect(
      person(t, "staff").action(api.socialReply.savePageKey, {
        pageKey: PAGE_KEY,
      }),
    ).rejects.toThrow(/Only a manager/u);
    expect(
      await person(t, "admin").action(api.socialReply.savePageKey, {
        pageKey: PAGE_KEY,
      }),
    ).toEqual({ saved: true });

    const ledger = await t.run(async (ctx) =>
      JSON.stringify(await ctx.db.query("manifestEvents").collect()),
    );
    expect(ledger).not.toContain(PAGE_KEY);
    const status = await person(t, "admin").query(
      api.socialReply.pageKeyStatus,
      {},
    );
    expect(typeof status?.savedAt).toBe("number");
  });

  it("answers in the same conversation once, and says Meta's limits plainly", async () => {
    const t = setup();
    const threadId = await seedThread(t);
    stubMeta("PAGE-A", []);
    await person(t, "admin").action(api.socialReply.savePageKey, {
      pageKey: PAGE_KEY,
    });
    const calls = stubMeta("PAGE-A", ["ok", "window", "lost"]);

    const result = await person(t, "staff").action(
      api.socialReply.sendSocialReply,
      { threadId, bodyText: "Yes, we do!", requestId: "req-1" },
    );
    expect(result.network).toBe("Facebook");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/me/messages");
    expect(calls[0]!.auth).toBe(`Bearer ${PAGE_KEY}`);
    expect(calls[0]!.body).toMatchObject({
      recipient: { id: "PSID-dana" },
      messaging_type: "RESPONSE",
      message: { text: "Yes, we do!" },
    });
    await expect(
      person(t, "staff").action(api.socialReply.sendSocialReply, {
        threadId,
        bodyText: "Yes, we do!",
        requestId: "req-1",
      }),
    ).rejects.toThrow(/already tried to send this reply/u);
    expect(calls).toHaveLength(1);
    let rows = await outbound(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      threadId,
      status: "sent",
      providerMessageId: "m_out_1",
      bodyText: "Yes, we do!",
    });

    // Outside Meta's 24-hour window: plain words, nothing added.
    await expect(
      person(t, "staff").action(api.socialReply.sendSocialReply, {
        threadId,
        bodyText: "Still interested?",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/within 24 hours/u);
    // A plain refusal may be tried again; a lost answer may not.
    await expect(
      person(t, "staff").action(api.socialReply.sendSocialReply, {
        threadId,
        bodyText: "Still interested?",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/not sure the reply went/u);
    await expect(
      person(t, "staff").action(api.socialReply.sendSocialReply, {
        threadId,
        bodyText: "Still interested?",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/already tried to send this reply/u);
    expect(calls).toHaveLength(3);
    rows = await outbound(t);
    expect(rows).toHaveLength(1);
  });

  it("without a saved key, or from another company, nothing is sent", async () => {
    const t = setup();
    const threadId = await seedThread(t);
    const calls = stubMeta("PAGE-A", ["ok"]);
    await expect(
      person(t, "staff").action(api.socialReply.sendSocialReply, {
        threadId,
        bodyText: "Hello",
        requestId: "req-3",
      }),
    ).rejects.toThrow(/No Facebook Page key is saved/u);
    await expect(
      person(t, "staff", "tenant-other").action(
        api.socialReply.sendSocialReply,
        { threadId, bodyText: "Hello", requestId: "req-4" },
      ),
    ).rejects.toThrow(/could not find this conversation/u);
    expect(calls).toHaveLength(0);
    expect(await outbound(t)).toHaveLength(0);
  });
});
