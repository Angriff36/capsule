/**
 * Runtime proof: public quote submission → operator conversion (plan A1).
 *
 * Exercises convex/quoteBuilder.ts end to end:
 *   - the public submitQuote action captures a QuoteSubmission (the active
 *     organizations row supplies the tenant — without it the form is offline)
 *   - processQuoteSubmission (authenticated operator) creates the client,
 *     lead, event and draft proposal in one action
 *   - A1 / AC-008: the draft proposal is created with the eventId, so it is
 *     linked to the event the same conversion created — no separate linkEvent
 *     step, and accepting the proposal later books no second event.
 *
 * Later proofs (dedup AC-009, dismiss AC-010, free-text AC-011/AC-014, retry
 * AC-019) extend this file.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

/**
 * The proof-kit harness type declares mutations only; the underlying
 * convex-test instance also runs actions (submitQuote / processQuoteSubmission
 * are actions, not commands).
 */
type ActionRunner = {
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
};
function asActions(actor: Actor): ActionRunner {
  return actor as unknown as ActionRunner;
}

async function liveRows(actor: Actor, table: string) {
  return actor.run(async (ctx) =>
    (await ctx.db.query(table).collect()).filter(
      (row) => (row as { deletedAt?: number | null }).deletedAt == null,
    ),
  );
}

describe("runtime proof: quote submission → conversion (AC-008)", () => {
  it("convert builds client, lead, event and linked proposal", async () => {
    const tenantId = "tenant-quote-conversion-a1";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-conversion-a1",
      role: "owner",
      tenantId,
    });

    // The public form resolves its tenant from the active organizations row;
    // without one, ingress refuses the submit (issue #119). Create it first.
    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Quote conversion kitchen" },
    );

    // Public submit. Anonymous in production; the action reads no auth, so a
    // caller identity is irrelevant to the path under proof.
    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Dana Prospect",
        email: "dana@example.com",
        phone: "555-0100",
        eventDate: Date.UTC(2026, 9, 15, 17, 0),
        eventEndTime: Date.UTC(2026, 9, 15, 22, 0),
        guestCount: 75,
        consent: true,
        venueName: "Orchard Barn",
        venueAddress: "12 Quarry Lane",
        menuPreferences: "BBQ buffet, two mains",
        dietaryRestrictions: "One gluten-free guest",
        notes: "Wants a tasting first",
      },
    )) as { submissionId: string; isDuplicate: boolean; status: string };
    expect(submitted.isDuplicate).toBe(false);
    expect(submitted.status).toBe("pending");

    // Authenticated operator converts the captured submission.
    const converted = (await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId: submitted.submissionId },
    )) as {
      clientId: string | null;
      leadId: string | null;
      eventId: string | null;
      proposalId: string | null;
      errors: string[];
    };
    expect(converted.errors).toEqual([]);
    expect(converted.clientId).toBeTruthy();
    expect(converted.leadId).toBeTruthy();
    expect(converted.eventId).toBeTruthy();
    expect(converted.proposalId).toBeTruthy();

    // The submission itself is completed with every record id checkpointed.
    const submission = await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    );
    expect((submission as { status?: string }).status).toBe("completed");
    expect((submission as { clientId?: string }).clientId).toBe(
      converted.clientId,
    );
    expect((submission as { leadId?: string }).leadId).toBe(converted.leadId);
    expect((submission as { eventId?: string }).eventId).toBe(
      converted.eventId,
    );
    expect((submission as { proposalId?: string }).proposalId).toBe(
      converted.proposalId,
    );

    // One live record of each kind. The client row is the converted one
    // (email is encrypted at rest, so compare ids, not plaintext).
    const clients = await liveRows(owner, "clients");
    expect(clients).toHaveLength(1);
    expect((clients[0] as { _id?: string })._id).toBe(converted.clientId);

    const leads = await liveRows(owner, "leads");
    expect(leads).toHaveLength(1);

    const events = await liveRows(owner, "events");
    expect(events).toHaveLength(1);
    const eventId = (events[0] as { _id?: string })._id;
    expect(eventId).toBe(converted.eventId);

    const proposals = await liveRows(owner, "proposals");
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as { _id?: string })._id).toBe(converted.proposalId);
    // AC-008: the converted proposal is linked to the event it created.
    expect((proposals[0] as { eventId?: string }).eventId).toBe(eventId);
  });
});
