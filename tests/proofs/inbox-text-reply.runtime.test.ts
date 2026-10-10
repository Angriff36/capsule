/**
 * Runtime proof (PL-INBOX / AC-353): staff answer a client text from the
 * inbox. The reply goes from the number the client texted to the client's
 * phone, is added to the conversation with Twilio's id, and Twilio's signed
 * delivery report moves it to delivered or failed once.
 *
 * - One typed reply sends at most one text: Send again after a lost answer
 *   is refused; after a plain Twilio refusal it may be sent again.
 * - A STOP refusal is said in plain words and nothing is added.
 * - Another company cannot reply in this company's conversation.
 */
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const setup = () => convexTest(schema, modules);
type TestConvex = ReturnType<typeof setup>;

const TENANT = "tenant-text-reply";
const SITE = "https://proof.convex.site";

beforeEach(() => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-proof");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "proof-token");
  vi.stubEnv("CONVEX_SITE_URL", SITE);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

type TwilioAnswer = "ok" | "stop" | "lost";

/** Twilio stand-in; returns the form of every text it was asked to send. */
function stubTwilio(answers: TwilioAnswer[]) {
  const sends: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body?: unknown }) => {
      sends.push(new URLSearchParams(String(init.body)));
      const answer = answers.shift() ?? "ok";
      if (answer === "lost") throw new TypeError("fetch failed");
      if (answer === "stop")
        return Response.json(
          { code: 21610, message: "Attempt to send to unsubscribed recipient" },
          { status: 400 },
        );
      return Response.json({
        sid: "SM" + String(sends.length).padStart(6, "0"),
      });
    }),
  );
  return sends;
}

async function seedThread(t: TestConvex): Promise<Id<"messageThreads">> {
  await t.run(async (ctx) => {
    await ctx.db.insert("organizations", {
      tenantId: TENANT,
      name: "Harvest Catering",
      status: "active",
      smsNumber: "(555) 010-2000",
      version: 1,
    } as never);
  });
  const stored = await t.mutation(internal.textInbox.ingestText, {
    to: "+15550102000",
    from: "+15557771234",
    body: "Can we add 20 guests?",
    messageSid: "SM-in-1",
  });
  if (stored.result === "unknown_number") throw new Error("not stored");
  return stored.threadId;
}

function staff(t: TestConvex, tenant = TENANT) {
  return t.withIdentity({
    subject: `text-reply-staff-${tenant}`,
    org_id: tenant,
    role: "admin",
  });
}

async function outbound(t: TestConvex) {
  return t.run(async (ctx) =>
    (await ctx.db.query("messages").collect()).filter(
      (m) => m.direction === "outbound",
    ),
  );
}

function report(t: TestConvex, params: Record<string, string>) {
  const path = `/twilio/status?tenant=${encodeURIComponent(TENANT)}`;
  const data =
    SITE +
    path +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return t.fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": createHmac("sha1", "proof-token")
        .update(data)
        .digest("base64"),
    },
    body: new URLSearchParams(params).toString(),
  });
}

describe("PL-INBOX staff text replies", () => {
  it("texts the client from the company number once and keeps the first delivery answer", async () => {
    const t = setup();
    const threadId = await seedThread(t);
    const sends = stubTwilio(["ok"]);

    const result = await staff(t).action(api.messageTextReply.sendTextReply, {
      threadId,
      bodyText: "Yes, 20 more is fine.",
      requestId: "req-1",
    });
    expect(result.to).toBe("•••1234");
    expect(sends).toHaveLength(1);
    expect(sends[0]!.get("From")).toBe("+15550102000");
    expect(sends[0]!.get("To")).toBe("+15557771234");
    expect(sends[0]!.get("Body")).toBe("Yes, 20 more is fine.");
    expect(sends[0]!.get("StatusCallback")).toBe(
      `${SITE}/twilio/status?tenant=${TENANT}`,
    );

    // Send again with the same typed reply: nothing more goes out.
    await expect(
      staff(t).action(api.messageTextReply.sendTextReply, {
        threadId,
        bodyText: "Yes, 20 more is fine.",
        requestId: "req-1",
      }),
    ).rejects.toThrow(/already tried to send this reply/u);
    expect(sends).toHaveLength(1);

    let rows = await outbound(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      threadId,
      status: "sent",
      bodyText: "Yes, 20 more is fine.",
      providerMessageId: "SM000001",
      senderIdentity: "+15550102000",
    });

    // Twilio reports delivered; a later "undelivered" changes nothing.
    await report(t, { MessageSid: "SM000001", MessageStatus: "sent" });
    expect((await outbound(t))[0]!.status).toBe("sent");
    await report(t, { MessageSid: "SM000001", MessageStatus: "delivered" });
    await report(t, {
      MessageSid: "SM000001",
      MessageStatus: "undelivered",
      ErrorCode: "30003",
    });
    rows = await outbound(t);
    expect(rows[0]!.status).toBe("delivered");
  });

  it("a STOP refusal adds nothing and may be sent again; a lost answer may not", async () => {
    const t = setup();
    const threadId = await seedThread(t);
    const sends = stubTwilio(["stop", "lost"]);

    await expect(
      staff(t).action(api.messageTextReply.sendTextReply, {
        threadId,
        bodyText: "Following up",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/texted STOP/u);
    expect(await outbound(t)).toHaveLength(0);

    // A plain refusal releases the reply: the same typed reply is tried again.
    await expect(
      staff(t).action(api.messageTextReply.sendTextReply, {
        threadId,
        bodyText: "Following up",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/not sure the reply went/u);
    // No answer from Twilio: Send again does not text a second time.
    await expect(
      staff(t).action(api.messageTextReply.sendTextReply, {
        threadId,
        bodyText: "Following up",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/already tried to send this reply/u);
    expect(sends).toHaveLength(2);
    expect(await outbound(t)).toHaveLength(0);
  });

  it("another company cannot reply in this company's conversation", async () => {
    const t = setup();
    const threadId = await seedThread(t);
    const sends = stubTwilio(["ok"]);
    await expect(
      staff(t, "tenant-other").action(api.messageTextReply.sendTextReply, {
        threadId,
        bodyText: "Hello",
        requestId: "req-3",
      }),
    ).rejects.toThrow(/could not find this conversation/u);
    expect(sends).toHaveLength(0);
  });
});
