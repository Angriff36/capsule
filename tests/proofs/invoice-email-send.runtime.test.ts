/**
 * Runtime proof (PL-OUTBOUND: AC-107, AC-109, AC-352 invoice-email legs).
 *
 * - "Email the invoice" sends the invoice PDF with no payment link and keeps
 *   the same send record as a reminder (masked recipient, sender, template +
 *   version, attachment, fingerprint, email id) — no payment setup needed.
 * - A second press for the same balance sends nothing and says when and to
 *   whom the first one went.
 * - A refused email names a plain remedy and shows in the invoice's list.
 * - The sent email shows in the invoice's email conversation.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-invoice-email-a";

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("INVOICE_REMINDER_FROM_EMAIL", "billing@proof.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubEmail(state: { status: number }) {
  const sent: Array<{
    to: string[];
    key: string | undefined;
    text: string;
    html: string;
    attachments: Array<{ filename: string }>;
  }> = [];
  const other: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        url: string,
        init: { headers?: Record<string, string>; body?: string } = {},
      ) => {
        if (!url.startsWith("https://api.resend.com/")) {
          other.push(url);
          return Response.json({}, { status: 500 });
        }
        const body = JSON.parse(String(init.body));
        sent.push({ ...body, key: init.headers?.["Idempotency-Key"] });
        if (state.status !== 200) {
          return Response.json(
            { message: "Email service said no" },
            { status: state.status },
          );
        }
        return Response.json({ id: `email_${sent.length}` });
      },
    ),
  );
  return { sent, other };
}

async function setup() {
  const t = convexTest(schema, modules);
  const finance = t.withIdentity({
    subject: "finance-invoice-email",
    org_id: TENANT,
    role: "admin",
  });
  const client = (await finance.mutation(
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: "Garden Club",
      email: "billing@garden.example",
    },
  )) as { docId: string };
  const invoice = (await finance.mutation(
    api.mutations.Invoice_createViaIssue,
    {
      clientId: client.docId,
      invoiceNumber: "INV-MAIL-1",
      subtotal: 400,
      total: 400,
      taxAmount: 0,
      discountAmount: 0,
      dueDate: Date.now() + 10 * 86_400_000,
    },
  )) as { docId: string };
  const invoiceId = invoice.docId as Id<"invoices">;
  return { t, finance, invoiceId };
}

async function markSent(env: Awaited<ReturnType<typeof setup>>) {
  await env.finance.mutation(api.mutations.Invoice_send, {
    docId: env.invoiceId,
    version: 1,
  });
}

describe("email the invoice", () => {
  it("sends the PDF with no payment link, keeps a send record and joins the conversation", async () => {
    const env = await setup();
    await markSent(env);
    const { sent, other } = stubEmail({ status: 200 });

    const result = await env.finance.action(api.invoiceEmail.send, {
      invoiceId: env.invoiceId,
    });
    expect(result).toMatchObject({ status: "sent", emailId: "email_1" });
    expect(other).toEqual([]); // no payment provider was called
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["billing@garden.example"]);
    expect(sent[0].key).toBe(`invoice-send/${env.invoiceId}/400`);
    expect(sent[0].attachments.map((file) => file.filename)).toEqual([
      "invoice-INV-MAIL-1.pdf",
    ]);
    expect(sent[0].text).toContain("$400.00");
    expect(`${sent[0].text} ${sent[0].html}`).not.toMatch(
      /stripe|pay invoice/iu,
    );

    const record = await env.t.run(async (ctx) =>
      (
        await ctx.db
          .query("manifestEvents")
          .withIndex("by_entityId", (q) =>
            q.eq("entityId", String(env.invoiceId)),
          )
          .collect()
      ).find((row) => row.type === "InvoiceEmailSent"),
    );
    const payload = record?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      tenantId: TENANT,
      emailId: "email_1",
      providerState: "accepted",
      amountDue: 400,
      recipientMasked: "b•••@garden.example",
      recipientSource: "client account",
      sender: "Catering company <billing@proof.example>",
      template: "invoice",
      templateVersion: 1,
      attachments: ["invoice-INV-MAIL-1.pdf"],
    });
    expect(String(payload.artifactFingerprint)).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(payload)).not.toContain("billing@garden.example");

    const history = await env.finance.action(api.invoiceReminders.getHistory, {
      invoiceId: env.invoiceId,
    });
    expect(history[0]).toMatchObject({
      outcome: "accepted",
      source: "manual",
      words:
        "Invoice emailed. Taken by the email service for b•••@garden.example.",
    });

    const messages = await env.t.run(async (ctx) =>
      (await ctx.db.query("messages").collect()).filter(
        (row) => row.providerMessageId === "email_1",
      ),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "outbound",
      status: "sent",
    });
  });

  it("a second press for the same balance sends nothing and says when and to whom", async () => {
    const env = await setup();
    await markSent(env);
    const { sent } = stubEmail({ status: 200 });
    await env.finance.action(api.invoiceEmail.send, {
      invoiceId: env.invoiceId,
    });
    const again = await env.finance.action(api.invoiceEmail.send, {
      invoiceId: env.invoiceId,
    });
    expect(again.status).toBe("already_sent");
    expect(again.to).toBe("b•••@garden.example");
    expect(typeof again.sentAt).toBe("number");
    expect(sent).toHaveLength(1);
  });

  it("a refused email gives a plain remedy and shows in the list; a draft is refused", async () => {
    const env = await setup();
    stubEmail({ status: 200 });
    await expect(
      env.finance.action(api.invoiceEmail.send, { invoiceId: env.invoiceId }),
    ).rejects.toThrow(/Mark the invoice sent before emailing it/u);

    await markSent(env);
    stubEmail({ status: 422 });
    await expect(
      env.finance.action(api.invoiceEmail.send, { invoiceId: env.invoiceId }),
    ).rejects.toThrow(/Check the client's email address/u);
    const history = await env.finance.action(api.invoiceReminders.getHistory, {
      invoiceId: env.invoiceId,
    });
    expect(history[0]).toMatchObject({
      outcome: "failed",
      words: "Invoice email not sent.",
    });
    expect(history[0].remedy).toMatch(/Check the client's email address/u);
  });

  it("without email setup it says so in plain words", async () => {
    const env = await setup();
    await markSent(env);
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(
      env.finance.action(api.invoiceEmail.send, { invoiceId: env.invoiceId }),
    ).rejects.toThrow(/Email sending is not set up/u);
  });
});
