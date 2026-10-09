/**
 * Runtime proof (PL-OUTBOUND, AC-352 delivery states): Capsule learns whether
 * a client email reached the inbox by asking the email service, without a
 * signed callback route. The first final answer stays on the conversation
 * message (delivered / bounced / failed); an email still on its way stays
 * "sent" and is asked about again later; another company's message is never
 * touched.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { emailOutcome } from "../../convex/emailDelivery";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-email-delivery-a";
const OTHER_TENANT = "tenant-email-delivery-b";

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

/** Email service stand-in: sends get ids; reads answer from `events`. */
function stubEmail(events: Map<string, string>) {
  const reads: string[] = [];
  let sent = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string } = {}) => {
      if (init.method === "GET") {
        const id = decodeURIComponent(url.split("/emails/")[1]!);
        reads.push(id);
        return Response.json({ id, last_event: events.get(id) ?? "sent" });
      }
      sent += 1;
      return Response.json({ id: `email_${sent}` });
    }),
  );
  return reads;
}

async function postOutbound(
  t: ReturnType<typeof convexTest>,
  tenantId: string,
  emailId: string,
) {
  const staff = t.withIdentity({
    subject: `staff-${tenantId}`,
    org_id: tenantId,
    role: "admin",
  });
  const thread = (await staff.mutation(api.mutations.MessageThread_create, {
    provider: "email",
    providerAccountId: "events@proof.example",
    providerThreadId: `thread-${tenantId}`,
    subject: "Your invoice",
    senderIdentity: "Ana Ruiz <ana@garden.example>",
  })) as { _id: string };
  const message = (await staff.mutation(api.mutations.Message_createViaPost, {
    threadId: thread._id as Id<"messageThreads">,
    direction: "outbound",
    status: "sent",
    bodyText: "Here is your invoice.",
    providerMessageId: emailId,
    senderIdentity: "events@proof.example",
    sentAt: Date.now(),
  })) as { _id?: string; docId?: string };
  return {
    staff,
    threadId: thread._id,
    messageId: String(message.docId ?? message._id),
  };
}

async function statusOf(t: ReturnType<typeof convexTest>, messageId: string) {
  return await t.run(
    async (ctx) => (await ctx.db.get(messageId as Id<"messages">))!.status,
  );
}

async function pendingChecks(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (job) =>
        job.name.includes("emailDelivery") && job.state.kind === "pending",
    ),
  );
}

describe("client email delivery state", () => {
  it("maps the email service's events to Capsule states", () => {
    expect(emailOutcome("delivered")).toBe("delivered");
    expect(emailOutcome("opened")).toBe("delivered");
    expect(emailOutcome("bounced")).toBe("bounced");
    expect(emailOutcome("suppressed")).toBe("bounced");
    expect(emailOutcome("failed")).toBe("failed");
    expect(emailOutcome("sent")).toBeNull();
    expect(emailOutcome("delivery_delayed")).toBeNull();
  });

  it("keeps the first final answer; a later answer never changes it", async () => {
    const t = convexTest(schema, modules);
    const events = new Map([["email_a", "delivered"]]);
    const reads = stubEmail(events);
    const own = await postOutbound(t, TENANT, "email_a");

    await t.action(internal.emailDelivery.checkEmail, {
      tenantId: TENANT,
      emailId: "email_a",
      attempt: 0,
    });
    expect(await statusOf(t, own.messageId)).toBe("delivered");

    events.set("email_a", "bounced");
    await t.action(internal.emailDelivery.checkEmail, {
      tenantId: TENANT,
      emailId: "email_a",
      attempt: 1,
    });
    expect(await statusOf(t, own.messageId)).toBe("delivered");
    // Settled: the second check did not even ask the email service.
    expect(reads).toEqual(["email_a"]);
  });

  it("marks a bounced email and leaves another company's message alone", async () => {
    const t = convexTest(schema, modules);
    stubEmail(new Map([["email_b", "bounced"]]));
    const own = await postOutbound(t, TENANT, "email_b");
    const other = await postOutbound(t, OTHER_TENANT, "email_b");

    await t.action(internal.emailDelivery.checkEmail, {
      tenantId: TENANT,
      emailId: "email_b",
      attempt: 0,
    });
    expect(await statusOf(t, own.messageId)).toBe("bounced");
    expect(await statusOf(t, other.messageId)).toBe("sent");
  });

  it("an email still on its way stays sent and is asked about again; the last try stops", async () => {
    const t = convexTest(schema, modules);
    stubEmail(new Map());
    const own = await postOutbound(t, TENANT, "email_c");

    await t.action(internal.emailDelivery.checkEmail, {
      tenantId: TENANT,
      emailId: "email_c",
      attempt: 0,
    });
    expect(await statusOf(t, own.messageId)).toBe("sent");
    expect(await pendingChecks(t)).toHaveLength(1);

    const before = (await pendingChecks(t)).length;
    await t.action(internal.emailDelivery.checkEmail, {
      tenantId: TENANT,
      emailId: "email_c",
      attempt: 5,
    });
    expect(await pendingChecks(t)).toHaveLength(before);
  });

  it("an inbox reply queues its first delivery check", async () => {
    const t = convexTest(schema, modules);
    stubEmail(new Map());
    const own = await postOutbound(t, TENANT, "email_seed");
    await own.staff.mutation(api.mutations.Message_createViaPost, {
      threadId: own.threadId as Id<"messageThreads">,
      direction: "inbound",
      status: "received",
      bodyText: "Thanks!",
      providerMessageId: "<in-1@garden.example>",
      senderIdentity: "Ana Ruiz <ana@garden.example>",
      sentAt: Date.now(),
    });
    await own.staff.action(api.messageReply.sendEmailReply, {
      threadId: own.threadId as Id<"messageThreads">,
      bodyText: "See you Saturday.",
      requestId: "req-delivery-1",
    });
    const jobs = await pendingChecks(t);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.args[0]).toMatchObject({
      tenantId: TENANT,
      emailId: "email_1",
      attempt: 0,
    });
  });
});
