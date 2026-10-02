/**
 * Runtime proof (PL-OUTBOUND: AC-107, AC-109, AC-352 proposal-email legs).
 *
 * - "Email the proposal" sends the PDF of the newest published version and
 *   keeps a send record naming that version (masked recipient, sender,
 *   template + version, attachment, fingerprint, email id).
 * - A PDF built from an older version is refused; the same version is not
 *   emailed twice in a day.
 * - The sent email joins the proposal's email conversation.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-proposal-email-a";
const PDF = btoa("%PDF-1.4\nproof proposal\n%%EOF");

beforeEach(() => {
  vi.stubEnv(
    "CONVEX_FIELD_ENCRYPTION_KEY",
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
  );
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("INVOICE_REMINDER_FROM_EMAIL", "sales@proof.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubEmail() {
  const sent: Array<Record<string, unknown> & { key?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        _url: string,
        init: { headers?: Record<string, string>; body?: string } = {},
      ) => {
        sent.push({
          ...JSON.parse(String(init.body)),
          key: init.headers?.["Idempotency-Key"],
        });
        return Response.json({ id: `email_${sent.length}` });
      },
    ),
  );
  return sent;
}

async function setup() {
  const t = convexTest(schema, modules);
  const sales = t.withIdentity({
    subject: "sales-proposal-email",
    org_id: TENANT,
    role: "admin",
  });
  const client = (await sales.mutation(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: "Garden Club",
    email: "events@garden.example",
  })) as { docId: string };
  const proposal = (await sales.mutation(
    api.mutations.Proposal_createViaDraft,
    {
      clientId: client.docId,
      title: "Spring supper",
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
    },
  )) as { docId: string };
  const proposalId = proposal.docId as Id<"proposals">;
  await sales.mutation(
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    {
      docId: proposalId,
    },
  );
  const revisions = await t.run(async (ctx) =>
    ctx.db
      .query("proposalRevisions")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
      .collect(),
  );
  expect(revisions).toHaveLength(1);
  return { t, sales, proposalId, revisionId: String(revisions[0]._id) };
}

describe("email the proposal", () => {
  it("sends the published version's PDF, records the version and joins the conversation; no second send that day", async () => {
    const env = await setup();
    const sent = stubEmail();
    const args = {
      proposalId: env.proposalId,
      revisionId: env.revisionId,
      pdfBase64: PDF,
      fileName: "proposal-spring-supper.pdf",
    };

    const result = await env.sales.action(api.proposalEmail.send, args);
    expect(result).toMatchObject({
      status: "sent",
      emailId: "email_1",
      to: "e•••@garden.example",
    });
    expect(sent[0]).toMatchObject({
      to: ["events@garden.example"],
      subject: "Proposal: Spring supper",
      key: `proposal-send/${env.proposalId}/${env.revisionId}`,
      attachments: [{ filename: "proposal-spring-supper.pdf", content: PDF }],
    });
    expect(String(sent[0].text)).toContain("$1,300.00");

    const record = await env.t.run(async (ctx) =>
      (
        await ctx.db
          .query("manifestEvents")
          .withIndex("by_entityId", (q) =>
            q.eq("entityId", String(env.proposalId)),
          )
          .collect()
      ).find((row) => row.type === "ProposalEmailSent"),
    );
    const payload = record?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      tenantId: TENANT,
      revisionId: env.revisionId,
      revisionNumber: 1,
      emailId: "email_1",
      providerState: "accepted",
      recipientMasked: "e•••@garden.example",
      template: "proposal",
      templateVersion: 1,
      attachments: ["proposal-spring-supper.pdf"],
    });
    expect(String(payload.artifactFingerprint)).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(payload)).not.toContain("events@garden.example");

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

    const again = await env.sales.action(api.proposalEmail.send, args);
    expect(again.status).toBe("already_sent");
    expect(again.to).toBe("e•••@garden.example");
    expect(sent).toHaveLength(1);
  });

  it("refuses a PDF of an older version and a file that is not a PDF", async () => {
    const env = await setup();
    const sent = stubEmail();
    await expect(
      env.sales.action(api.proposalEmail.send, {
        proposalId: env.proposalId,
        revisionId: "an-older-version",
        pdfBase64: PDF,
        fileName: "proposal.pdf",
      }),
    ).rejects.toThrow(/changed since the page loaded/u);
    await expect(
      env.sales.action(api.proposalEmail.send, {
        proposalId: env.proposalId,
        revisionId: env.revisionId,
        pdfBase64: btoa("not a pdf"),
        fileName: "proposal.pdf",
      }),
    ).rejects.toThrow(/could not be made/u);
    expect(sent).toHaveLength(0);
  });
});
