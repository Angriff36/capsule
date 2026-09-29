/**
 * AC-183 (PR05-xlostquote) runtime proof: a lost quote is not money owed.
 *
 * A web quote request is converted (client, lead, quote-stage event, draft
 * proposal), the proposal is sent and declined, and the event is cancelled.
 * No invoice and no payment exists for the event, the event can no longer be
 * sent for approval (the only road to its automatic draft invoice), and the
 * draft-invoice step itself makes nothing when run again for the lost event.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureEventDraftInvoice } from "../../convex/lib/invoicePricingReconciliation";

type Row = Record<string, unknown>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("a lost quote never becomes money owed (AC-183)", () => {
  it("converted, declined and cancelled: zero invoices and payments for the event", async () => {
    const tenantId = "tenant-lost-quote";
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-lost-quote",
      role: "owner",
      tenantId,
    });
    const actions = owner as unknown as {
      action: (fn: unknown, args?: unknown) => Promise<unknown>;
    };
    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Lost quote kitchen" },
    );
    const submitted = (await actions.action(api.quoteBuilder.submitQuote, {
      clientName: "Robin Shopper",
      email: "robin@example.com",
      phone: "555-0142",
      eventDate: Date.UTC(2026, 10, 7, 17, 0),
      eventEndTime: Date.UTC(2026, 10, 7, 22, 0),
      guestCount: 120,
      consent: true,
      venueName: "Mill House",
      menuPreferences: "Plated dinner",
    })) as { submissionId: string };
    const converted = (await actions.action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId: submitted.submissionId },
    )) as { eventId: string; proposalId: string; errors: string[] };
    expect(converted.errors).toEqual([]);
    const { eventId, proposalId } = converted;

    const read = async (id: string) =>
      (await owner.run(async (ctx) => ctx.db.get(id as never))) as Row;
    const version = async (id: string) => Number((await read(id)).version);

    // Give the quote a real price, so a slip would make a non-zero invoice.
    await owner.run(async (ctx) =>
      ctx.db.patch(eventId as never, { quotedPrice: 6200 } as never),
    );
    const proposal = await read(proposalId);
    if (!String(proposal.title ?? "").trim())
      await owner.run(async (ctx) =>
        ctx.db.patch(proposalId as never, { title: "Robin's dinner" } as never),
      );

    await proof.executeCommand(owner, api.mutations.Proposal_send, {
      docId: proposalId,
      version: await version(proposalId),
    });
    await proof.executeCommand(owner, api.mutations.Proposal_decline, {
      docId: proposalId,
      version: await version(proposalId),
    });
    expect((await read(proposalId)).status).toBe("declined");

    await proof.executeCommand(owner, api.mutations.Event_cancel, {
      docId: eventId,
      version: await version(eventId),
      reason: "Client booked another caterer",
    });
    expect((await read(eventId)).stage).toBe("cancelled");

    // The lost event cannot be walked to approval, the step that invoices.
    await expect(
      proof.executeCommand(owner, api.mutations.Event_submitForApproval, {
        docId: eventId,
        version: await version(eventId),
      }),
    ).rejects.toThrow();

    // Replaying the draft-invoice step for the lost event makes nothing.
    await owner.run(async (ctx) =>
      ensureEventDraftInvoice(ctx as never, eventId as never),
    );

    const rows = async (table: "invoices" | "payments") =>
      (
        (await owner.run(async (ctx) =>
          ctx.db.query(table).collect(),
        )) as unknown as Row[]
      ).filter((row) => row.tenantId === tenantId);
    expect(await rows("invoices")).toEqual([]);
    expect(await rows("payments")).toEqual([]);
  });
});
