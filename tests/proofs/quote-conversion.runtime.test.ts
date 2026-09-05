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
 * Dedup proof (plan A3 / AC-009): same contact + event date submitted twice
 * resolves to ONE submission and never a second lead — the completed row still
 * dedups, and only pending rows convert, so a repeat cannot re-run conversion.
 * A different event date for the same contact is a new request: second
 * submission, second lead, same client (email match reuses it).
 *
 * Later proofs (dismiss AC-010, free-text AC-011/AC-014, retry AC-019) extend
 * this file.
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

describe("runtime proof: quote dedup (AC-009)", () => {
  it("dedup by contact and event date", async () => {
    const tenantId = "tenant-quote-dedup-a3";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-dedup-a3",
      role: "owner",
      tenantId,
    });

    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Dedup proof kitchen" },
    );

    const submit = (email: string, eventDate: number) =>
      asActions(owner).action(api.quoteBuilder.submitQuote, {
        clientName: "Dana Prospect",
        email,
        phone: "555-0100",
        eventDate,
        eventEndTime: eventDate + 5 * 60 * 60 * 1000,
        guestCount: 75,
        consent: true,
        venueName: "Orchard Barn",
        menuPreferences: "BBQ buffet",
        dietaryRestrictions: "",
        notes: "",
      }) as Promise<{
        submissionId: string;
        isDuplicate: boolean;
        status: string;
      }>;

    const convert = (submissionId: string) =>
      asActions(owner).action(api.quoteBuilder.processQuoteSubmission, {
        submissionId,
      }) as Promise<{
        clientId: string | null;
        leadId: string | null;
        errors: string[];
      }>;

    const firstDate = Date.UTC(2026, 9, 15, 17, 0);
    const otherDate = Date.UTC(2026, 10, 20, 17, 0);

    // Same contact + event date, submitted twice (the repeat in different
    // case/whitespace — the dedup key lowercases and trims the email).
    const first = await submit("dana@example.com", firstDate);
    expect(first.isDuplicate).toBe(false);
    expect(first.status).toBe("pending");

    const repeat = await submit("  Dana@Example.com ", firstDate);
    expect(repeat.isDuplicate).toBe(true);
    expect(repeat.submissionId).toBe(first.submissionId);
    expect(await liveRows(owner, "quoteSubmissions")).toHaveLength(1);

    // Convert once. The completed row still dedups the key, and converting the
    // same row again is refused (only pending rows convert) — so a repeat
    // submit can never run conversion a second time and mint a second lead.
    const converted = await convert(first.submissionId);
    expect(converted.errors).toEqual([]);
    expect(converted.leadId).toBeTruthy();

    const afterConvert = await submit("dana@example.com", firstDate);
    expect(afterConvert.isDuplicate).toBe(true);
    expect(afterConvert.submissionId).toBe(first.submissionId);
    expect(afterConvert.status).toBe("completed");

    await expect(convert(first.submissionId)).rejects.toThrow(
      /Only pending submissions can be converted/,
    );

    expect(await liveRows(owner, "quoteSubmissions")).toHaveLength(1);
    expect(await liveRows(owner, "leads")).toHaveLength(1);

    // Different event date for the same contact = a new request: a second
    // submission, a second lead — and the client is NOT duplicated (the
    // conversion's email match finds the client the first conversion made).
    const second = await submit("dana@example.com", otherDate);
    expect(second.isDuplicate).toBe(false);
    expect(second.submissionId).not.toBe(first.submissionId);
    expect(await liveRows(owner, "quoteSubmissions")).toHaveLength(2);

    const secondConverted = await convert(second.submissionId);
    expect(secondConverted.errors).toEqual([]);
    expect(secondConverted.leadId).toBeTruthy();
    expect(secondConverted.leadId).not.toBe(converted.leadId);
    expect(secondConverted.clientId).toBe(converted.clientId);

    expect(await liveRows(owner, "leads")).toHaveLength(2);
    expect(await liveRows(owner, "clients")).toHaveLength(1);
  });
});

describe("runtime proof: quote dismiss (AC-010)", () => {
  it("dismiss keeps the raw submission", async () => {
    const tenantId = "tenant-quote-dismiss-a4";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-dismiss-a4",
      role: "owner",
      tenantId,
    });

    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Dismiss proof kitchen" },
    );

    const eventDate = Date.UTC(2026, 9, 15, 17, 0);
    const submit = (email: string) =>
      asActions(owner).action(api.quoteBuilder.submitQuote, {
        clientName: "Dana Prospect",
        email,
        phone: "555-0100",
        eventDate,
        eventEndTime: eventDate + 5 * 60 * 60 * 1000,
        guestCount: 75,
        consent: true,
        venueName: "Orchard Barn",
        menuPreferences: "BBQ buffet",
        dietaryRestrictions: "",
        notes: "",
      }) as Promise<{
        submissionId: string;
        isDuplicate: boolean;
        status: string;
      }>;

    const first = await submit("dana@example.com");
    expect(first.isDuplicate).toBe(false);
    expect(first.status).toBe("pending");

    // Staff dismisses the junk/duplicate with a reason (generated command,
    // salesAccess write policy — same path the review queue button takes).
    await proof.executeCommand(owner, api.mutations.QuoteSubmission_dismiss, {
      docId: first.submissionId,
      reason: "Duplicate — booked by phone",
    });

    // The raw submission stays readable: retained (not deleted), reason
    // recorded in errorMessage, every captured field intact, dedupKey kept.
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(first.submissionId),
    )) as {
      status: string;
      errorMessage: string | null;
      clientName: string;
      dedupKey: string;
      deletedAt: number | null;
    };
    expect(row.status).toBe("dismissed");
    expect(row.errorMessage).toBe("Duplicate — booked by phone");
    expect(row.clientName).toBe("Dana Prospect");
    expect(row.dedupKey).toBeTruthy();
    expect(row.deletedAt ?? null).toBeNull();

    // Leaves the default queue: no open (non-dismissed) live row remains.
    const open = (await liveRows(owner, "quoteSubmissions")).filter(
      (r) => (r as { status?: string }).status !== "dismissed",
    );
    expect(open).toHaveLength(0);

    // Still participates in dedup: a resubmit of the same key returns the SAME
    // dismissed row and mints no second submission.
    const repeat = await submit("dana@example.com");
    expect(repeat.isDuplicate).toBe(true);
    expect(repeat.submissionId).toBe(first.submissionId);
    expect(repeat.status).toBe("dismissed");
    expect(await liveRows(owner, "quoteSubmissions")).toHaveLength(1);

    // A dismissed row cannot be converted (only pending converts).
    await expect(
      asActions(owner).action(api.quoteBuilder.processQuoteSubmission, {
        submissionId: first.submissionId,
      }),
    ).rejects.toThrow(/Only pending submissions can be converted/);
  });
});
