/**
 * Runtime proof (PL-OUTBOUND: AC-107, AC-109, AC-352 reply legs).
 *
 * - A reply on an email conversation goes to the person who wrote last,
 *   answers their email (In-Reply-To) and joins the conversation as an
 *   outbound "sent" message with the email service's id.
 * - A retry with the same request id sends nothing new and adds no second
 *   message.
 * - Text/social conversations and missing setup get a plain remedy.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-inbox-reply-a";

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("INVOICE_REMINDER_FROM_EMAIL", "events@proof.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Fake email service: one id per idempotency key, like the real one. */
function stubEmail() {
  const calls: Array<{ key: string; body: Record<string, unknown> }> = [];
  const ids = new Map<string, string>();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        _url: string,
        init: { headers?: Record<string, string>; body?: string } = {},
      ) => {
        const key = String(init.headers?.["Idempotency-Key"]);
        calls.push({ key, body: JSON.parse(String(init.body)) });
        if (!ids.has(key)) ids.set(key, `email_${ids.size + 1}`);
        return Response.json({ id: ids.get(key) });
      },
    ),
  );
  return { calls, ids };
}

async function setup(provider: "email" | "sms") {
  const t = convexTest(schema, modules);
  const staff = t.withIdentity({
    subject: "staff-inbox-reply",
    org_id: TENANT,
    role: "admin",
  });
  const thread = (await staff.mutation(api.mutations.MessageThread_create, {
    provider,
    providerAccountId: "events@proof.example",
    providerThreadId: "thread-ext-1",
    subject: "Saturday tasting",
    senderIdentity: "Ana Ruiz <ana@garden.example>",
  })) as { _id: string };
  const threadId = thread._id as Id<"messageThreads">;
  await staff.mutation(api.mutations.Message_createViaPost, {
    threadId,
    direction: "inbound",
    status: "received",
    bodyText: "Can we move the tasting?",
    providerMessageId: "<msg-in-1@garden.example>",
    senderIdentity: "Ana Ruiz <ana@garden.example>",
    sentAt: Date.now() - 60_000,
  });
  return { t, staff, threadId };
}

async function outbound(env: Awaited<ReturnType<typeof setup>>) {
  return await env.t.run(async (ctx) =>
    (
      await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", env.threadId))
        .collect()
    ).filter((row) => row.direction === "outbound"),
  );
}

describe("reply to an email conversation", () => {
  it("emails the last writer, answers their email and joins the conversation; a retry sends nothing new", async () => {
    const env = await setup("email");
    const { calls } = stubEmail();

    const args = {
      threadId: env.threadId,
      bodyText: "Yes, Sunday at 2 works.",
      requestId: "req-1",
    };
    const result = await env.staff.action(
      api.messageReply.sendEmailReply,
      args,
    );
    expect(result).toMatchObject({
      emailId: "email_1",
      to: "a•••@garden.example",
    });
    expect(calls[0].body).toMatchObject({
      from: "Catering company <events@proof.example>",
      to: ["ana@garden.example"],
      subject: "Re: Saturday tasting",
      text: "Yes, Sunday at 2 works.",
      headers: { "In-Reply-To": "<msg-in-1@garden.example>" },
    });
    let rows = await outbound(env);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "sent",
      providerMessageId: "email_1",
      senderIdentity: "events@proof.example",
      bodyText: "Yes, Sunday at 2 works.",
    });

    // The screen lost the answer and staff press Send again.
    await env.staff.action(api.messageReply.sendEmailReply, args);
    expect(new Set(calls.map((call) => call.key)).size).toBe(1);
    rows = await outbound(env);
    expect(rows).toHaveLength(1);
  });

  it("uses the company's own sender name and reply address", async () => {
    const env = await setup("email");
    const { calls } = stubEmail();
    await env.staff.mutation(api.mutations.Organization_createViaRegister, {
      name: "Garden Table Catering",
    });
    const organizationId = await env.t.run(
      async (ctx) =>
        (await ctx.db
          .query("organizations")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", TENANT))
          .first())!._id,
    );
    await expect(
      env.staff.mutation(api.mutations.Organization_configureEmailSender, {
        docId: organizationId,
        replyTo: "not an address",
      }),
    ).rejects.toThrow(/full email address/u);
    await env.staff.mutation(api.mutations.Organization_configureEmailSender, {
      docId: organizationId,
      senderName: "Garden Table Events",
      replyTo: "events@gardentable.example",
    });

    await env.staff.action(api.messageReply.sendEmailReply, {
      threadId: env.threadId,
      bodyText: "See you Sunday.",
      requestId: "req-sender",
    });
    expect(calls[0].body).toMatchObject({
      from: "Garden Table Events <events@proof.example>",
      reply_to: "events@gardentable.example",
    });

    // Cleared settings go back to the display name and no reply address.
    await env.staff.mutation(api.mutations.Organization_configureEmailSender, {
      docId: organizationId,
    });
    await env.staff.action(api.messageReply.sendEmailReply, {
      threadId: env.threadId,
      bodyText: "One more thing.",
      requestId: "req-sender-2",
    });
    expect(calls[1].body.from).toBe(
      "Garden Table Catering <events@proof.example>",
    );
    expect(calls[1].body).not.toHaveProperty("reply_to");
  });

  it("a text conversation is refused with a plain remedy and nothing is sent", async () => {
    const env = await setup("sms");
    const { calls } = stubEmail();
    await expect(
      env.staff.action(api.messageReply.sendEmailReply, {
        threadId: env.threadId,
        bodyText: "Hello",
        requestId: "req-2",
      }),
    ).rejects.toThrow(/email conversations only/u);
    expect(calls).toHaveLength(0);
  });

  it("without email setup it says so in plain words", async () => {
    const env = await setup("email");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(
      env.staff.action(api.messageReply.sendEmailReply, {
        threadId: env.threadId,
        bodyText: "Hello",
        requestId: "req-3",
      }),
    ).rejects.toThrow(/Email sending is not set up/u);
  });
});
