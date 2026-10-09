/**
 * Runtime proof (PL-INBOX; AC-104, AC-207, AC-633 inbound leg): a client email
 * sent to a company's Capsule inbox address comes in through the email
 * service's signed webhook and lands in that company's inbox.
 *
 * - The signature and its time are checked; an unsigned, wrongly signed or
 *   old request stores nothing.
 * - The email is matched to the company by the address it went to; another
 *   company and an address no company has get nothing.
 * - The email service delivering the same email again adds nothing; when the
 *   email cannot be read yet, Capsule asks for it again later.
 * - One conversation per client email address, linked to the one client
 *   contact with that address; files are kept as ids, kinds and names, never
 *   as links.
 * - Capsule's client emails use the inbox address as the reply address when
 *   the company has not chosen its own.
 */
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { companySender } from "../../convex/invoiceReminders";
import { modules } from "./convex-test-modules";

const SECRET_BYTES = Buffer.from("proof-email-webhook-secret-32byt");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;
const PATH = "/resend/inbound";
const DOMAIN = "in.proof.example";

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("RESEND_INBOUND_DOMAIN", DOMAIN);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const owner = (tenantId: string) => ({
  subject: `email-owner-${tenantId}`,
  tokenIdentifier: `email|owner-${tenantId}`,
  role: "org:owner",
  tenantId,
});

/** Email service stand-in: answers reads of received emails from `emails`. */
function stubEmailService(emails: Map<string, Record<string, unknown>>) {
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = decodeURIComponent(url.split("/emails/receiving/")[1]!);
      reads.push(id);
      const email = emails.get(id);
      return email
        ? Response.json(email)
        : new Response("not found", { status: 404 });
    }),
  );
  return reads;
}

function post(
  t: ReturnType<typeof convexTest>,
  emailId: string,
  opts: { secret?: string; ageSeconds?: number } = {},
) {
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: emailId },
  });
  const id = `msg_${emailId}`;
  const timestamp = String(
    Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0),
  );
  const key = opts.secret ? Buffer.from(opts.secret) : SECRET_BYTES;
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return t.fetch(PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body,
  });
}

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    for (const [tenantId, name] of [
      ["tenant-mail-a", "Harvest Catering"],
      ["tenant-mail-b", "Other Catering"],
    ]) {
      await ctx.db.insert("organizations", {
        tenantId,
        name,
        status: "active",
        version: 1,
      } as never);
    }
  });
  const staff = t.withIdentity(owner("tenant-mail-a"));
  const client = await staff.mutation(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: "Dana Weddings",
  });
  const contact = await staff.mutation(
    api.mutations.ClientContact_createViaAdd,
    {
      clientId: client.docId,
      givenName: "Dana",
      email: "Dana@Weddings.test",
    } as never,
  );
  return { contactId: contact.docId };
}

async function rows(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ({
    threads: await ctx.db.query("messageThreads").collect(),
    messages: await ctx.db.query("messages").collect(),
  }));
}

const email = (id: string, extra: Record<string, unknown> = {}) => ({
  object: "email",
  id,
  to: [`tenant-mail-a@${DOMAIN}`],
  from: "Dana Lee <dana@weddings.test>",
  created_at: "2026-10-09T15:00:00.000Z",
  subject: "Saturday headcount",
  html: "<p>Can we add <strong>20 guests</strong>?</p>",
  text: null,
  message_id: "<abc@weddings.test>",
  attachments: [
    {
      id: "att-1",
      filename: "seating.pdf",
      content_type: "application/pdf",
      size: 1000,
    },
  ],
  ...extra,
});

describe("PL-INBOX client emails come into the company inbox", () => {
  it("a signed email lands once in the right company's inbox, linked to the client contact", async () => {
    const t = convexTest(schema, modules);
    const { contactId } = await seed(t);
    stubEmailService(new Map([["em-1", email("em-1")]]));

    expect((await post(t, "em-1")).status).toBe(200);
    // The email service delivers the same email again.
    expect((await post(t, "em-1")).status).toBe(200);

    const { threads, messages } = await rows(t);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      tenantId: "tenant-mail-a",
      provider: "email",
      providerAccountId: `tenant-mail-a@${DOMAIN}`,
      providerThreadId: "dana@weddings.test",
      subject: "Saturday headcount",
      contactId,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      tenantId: "tenant-mail-a",
      direction: "inbound",
      status: "received",
      bodyText: "Saturday headcount\n\nCan we add 20 guests?",
      providerMessageId: "em-1",
      senderIdentity: "Dana Lee <dana@weddings.test>",
      sentAt: Date.parse("2026-10-09T15:00:00.000Z"),
    });
    expect(JSON.parse(messages[0]!.mediaJson!)).toEqual([
      { id: "att-1", kind: "application/pdf", name: "seating.pdf" },
    ]);
    expect(messages[0]!.rawPayload).not.toContain("https://");

    // PL-CONNECTIONS: the company's one email connection row says when the
    // last client email came in, and the Brand page reads it.
    const connections = await t.run(async (ctx) =>
      ctx.db.query("integrationConnections").collect(),
    );
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      tenantId: "tenant-mail-a",
      provider: "email",
      status: "connected",
      externalAccountId: `tenant-mail-a@${DOMAIN}`,
    });
    expect(typeof connections[0]!.lastSuccessfulSyncAt).toBe("number");
    const setup = await t
      .withIdentity(owner("tenant-mail-a"))
      .query(api.emailInbox.emailSetup, {});
    expect(setup?.lastEmailAt).toBe(connections[0]!.lastSuccessfulSyncAt);
    const other = await t
      .withIdentity(owner("tenant-mail-b"))
      .query(api.emailInbox.emailSetup, {});
    expect(other?.lastEmailAt).toBeNull();
  });

  it("an unsigned, wrongly signed or old request stores nothing and reads nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const reads = stubEmailService(new Map([["em-2", email("em-2")]]));

    expect((await post(t, "em-2", { secret: "not-the-secret" })).status).toBe(
      403,
    );
    expect((await post(t, "em-2", { ageSeconds: 3600 })).status).toBe(403);
    const unsigned = await t.fetch(PATH, {
      method: "POST",
      body: JSON.stringify({
        type: "email.received",
        data: { email_id: "em-2" },
      }),
    });
    expect(unsigned.status).toBe(403);
    expect(reads).toEqual([]);
    expect((await rows(t)).messages).toHaveLength(0);
  });

  it("each company only gets emails to its own address; an email that cannot be read yet is asked for again", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const emails = new Map([
      ["em-b", email("em-b", { to: [`tenant-mail-b@${DOMAIN}`] })],
      ["em-x", email("em-x", { to: [`nobody@${DOMAIN}`] })],
    ]);
    stubEmailService(emails);

    expect((await post(t, "em-b")).status).toBe(200);
    expect((await post(t, "em-x")).status).toBe(200);
    // Not readable yet: the email service is told to send it again.
    expect((await post(t, "em-late")).status).toBe(502);
    emails.set("em-late", email("em-late", { subject: "", text: "Later!" }));
    expect((await post(t, "em-late")).status).toBe(200);

    const { threads, messages } = await rows(t);
    expect(
      threads.map((th) => [th.tenantId, th.contactId ?? null]).sort(),
    ).toEqual([
      ["tenant-mail-a", expect.anything()],
      ["tenant-mail-b", null],
    ]);
    expect(messages.map((m) => [m.tenantId, m.bodyText]).sort()).toEqual([
      ["tenant-mail-a", "Later!"],
      ["tenant-mail-b", "Saturday headcount\n\nCan we add 20 guests?"],
    ]);
  });

  it("client emails reply to the inbox address unless the company chose its own", () => {
    expect(
      companySender({ tenantId: "tenant-mail-a" }, "Harvest").replyTo,
    ).toBe(`tenant-mail-a@${DOMAIN}`);
    expect(
      companySender(
        { tenantId: "tenant-mail-a", emailReplyTo: "events@harvest.test" },
        "Harvest",
      ).replyTo,
    ).toBe("events@harvest.test");
    vi.stubEnv("RESEND_INBOUND_DOMAIN", "");
    expect(
      companySender({ tenantId: "tenant-mail-a" }, "Harvest").replyTo,
    ).toBeNull();
  });
});
