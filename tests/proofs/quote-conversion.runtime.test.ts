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

    // AC-235: conversion links records, not loose text — the event, lead and
    // proposal all point at the converted client, and the lead points at a
    // primary contact created for that client.
    expect((events[0] as { clientId?: string }).clientId).toBe(
      converted.clientId,
    );
    expect((leads[0] as { clientId?: string }).clientId).toBe(
      converted.clientId,
    );
    expect(
      (leads[0] as { clientContactId?: string }).clientContactId,
    ).toBeTruthy();
    expect((proposals[0] as { clientId?: string }).clientId).toBe(
      converted.clientId,
    );

    const clientContacts = await liveRows(owner, "clientContacts");
    expect(clientContacts).toHaveLength(1);
    const contact = clientContacts[0] as { _id?: string; clientId?: string };
    expect(contact._id).toBe(
      (leads[0] as { clientContactId?: string }).clientContactId,
    );
    expect(contact.clientId).toBe(converted.clientId);
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

describe("runtime proof: free-text style/occasion with empty catalogs (AC-011, AC-014)", () => {
  it("public submit with empty catalogs captures free text", async () => {
    const tenantId = "tenant-quote-freetext-a5";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-freetext-a5",
      role: "owner",
      tenantId,
    });

    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Free-text proof kitchen" },
    );

    // The catalogs are empty: nothing has seeded ServiceStyle/Occasion rows
    // for this tenant — the exact state the public form must survive (the
    // form swaps each dead select for a free-text input).
    expect(await liveRows(owner, "serviceStyles")).toHaveLength(0);
    expect(await liveRows(owner, "occasions")).toHaveLength(0);

    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Renee Prospect",
        email: "renee@example.com",
        phone: "555-0142",
        eventDate: Date.UTC(2026, 10, 5, 18, 0),
        eventEndTime: Date.UTC(2026, 10, 5, 23, 0),
        guestCount: 40,
        consent: true,
        serviceStyleText: "Family-style buffet",
        occasionText: "Retirement party",
        venueName: "Lakeside Pavilion",
        menuPreferences: "",
        dietaryRestrictions: "",
        notes: "",
      },
    )) as { submissionId: string; isDuplicate: boolean; status: string };
    expect(submitted.isDuplicate).toBe(false);
    expect(submitted.status).toBe("pending");

    // The free-text answers are captured on the raw submission; no catalog id
    // exists and nothing threw.
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    )) as {
      serviceStyleId: string | null;
      occasionId: string | null;
      serviceStyleText: string | null;
      occasionText: string | null;
    };
    expect(row.serviceStyleId).toBeNull();
    expect(row.occasionId).toBeNull();
    expect(row.serviceStyleText).toBe("Family-style buffet");
    expect(row.occasionText).toBe("Retirement party");
  });

  it("empty catalogs convert as text", async () => {
    const tenantId = "tenant-quote-freetext-convert-a5";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-freetext-convert-a5",
      role: "owner",
      tenantId,
    });

    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Free-text convert kitchen" },
    );
    expect(await liveRows(owner, "serviceStyles")).toHaveLength(0);
    expect(await liveRows(owner, "occasions")).toHaveLength(0);

    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Renee Prospect",
        email: "renee-convert@example.com",
        phone: "555-0142",
        eventDate: Date.UTC(2026, 10, 5, 18, 0),
        eventEndTime: Date.UTC(2026, 10, 5, 23, 0),
        guestCount: 40,
        consent: true,
        serviceStyleText: "Family-style buffet",
        occasionText: "Retirement party",
        venueName: "Lakeside Pavilion",
        menuPreferences: "",
        dietaryRestrictions: "",
        notes: "",
      },
    )) as { submissionId: string; isDuplicate: boolean };
    expect(submitted.isDuplicate).toBe(false);

    // Conversion with zero catalog rows succeeds end to end — no throw, event
    // created with null style/occasion, proposal drafted.
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

    // The prospect's free-text answers surface on the draft proposal (its
    // notes), so sales reads them without re-opening the raw submission.
    const proposals = await liveRows(owner, "proposals");
    expect(proposals).toHaveLength(1);
    const proposal = proposals[0] as {
      notes: string | null;
      eventId: string | null;
    };
    expect(proposal.eventId).toBe(converted.eventId);
    expect(proposal.notes).toContain("Service style: Family-style buffet");
    expect(proposal.notes).toContain("Occasion: Retirement party");
  });
});

describe("runtime proof: retry after partial failure (AC-019)", () => {
  it("retry after partial failure reuses checkpointed records", async () => {
    const tenantId = "tenant-quote-retry-a9";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-retry-a9",
      role: "owner",
      tenantId,
    });

    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Retry proof kitchen" },
    );

    // Simulate the partial failure the checkpoint exists for: the client and
    // lead steps succeeded, then the conversion died before event/proposal.
    // Create the two records with the same generated commands the conversion
    // uses, then checkpoint them onto a failed submission by hand — in
    // production checkpointQuoteSubmissionIds + QuoteSubmission_fail produce
    // exactly this row state.
    await proof.executeCommand(owner, api.mutations.Client_createViaRegister, {
      clientType: "company",
      companyName: "Dana Prospect",
      // Deliberately NOT the submission's email: reuse must win through the
      // checkpointed id alone (the email match never runs on a retry), so a
      // single client row proves the reuse rather than the match.
      email: "existing-client@example.com",
      phone: "555-0100",
    });
    const clientId = ((await liveRows(owner, "clients"))[0] as { _id?: string })
      ._id;
    expect(clientId).toBeTruthy();

    await proof.executeCommand(owner, api.mutations.Lead_createViaCapture, {
      leadType: "company",
      source: "quote-builder",
      estimatedValue: 0,
      companyName: "Dana Prospect",
      email: "existing-client@example.com",
      phone: "555-0100",
    });
    const leadId = ((await liveRows(owner, "leads"))[0] as { _id?: string })
      ._id;
    expect(leadId).toBeTruthy();

    const eventDate = Date.UTC(2026, 9, 15, 17, 0);
    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Dana Prospect",
        email: "dana-retry@example.com",
        phone: "555-0100",
        eventDate,
        eventEndTime: eventDate + 5 * 60 * 60 * 1000,
        guestCount: 60,
        consent: true,
        venueName: "Orchard Barn",
        menuPreferences: "BBQ buffet",
        dietaryRestrictions: "",
        notes: "",
      },
    )) as { submissionId: string; isDuplicate: boolean };
    expect(submitted.isDuplicate).toBe(false);

    await owner.run(async (ctx) => {
      await ctx.db.patch(submitted.submissionId, {
        status: "failed",
        clientId,
        leadId,
        errorMessage: "Conversion could not complete all steps",
        processingErrors: "event: simulated failure for the retry proof",
      });
    });

    // Staff retries: the row reopens as pending with the errors cleared and
    // the checkpointed ids kept.
    await proof.executeCommand(owner, api.mutations.QuoteSubmission_retry, {
      docId: submitted.submissionId,
    });
    const reopened = (await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    )) as {
      status: string;
      errorMessage: string | null;
      processingErrors: string | null;
      clientId: string | null;
      leadId: string | null;
    };
    expect(reopened.status).toBe("pending");
    expect(reopened.errorMessage ?? null).toBeNull();
    expect(reopened.processingErrors ?? null).toBeNull();
    expect(reopened.clientId).toBe(clientId);
    expect(reopened.leadId).toBe(leadId);

    // Convert again: only the missing records (event, proposal) are created;
    // the client and lead are REUSED, so nothing is duplicated.
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
    expect(converted.clientId).toBe(clientId);
    expect(converted.leadId).toBe(leadId);
    expect(converted.eventId).toBeTruthy();
    expect(converted.proposalId).toBeTruthy();

    // Counts did not grow: still one client and one lead; the event and
    // proposal are the ones this retry created.
    expect(await liveRows(owner, "clients")).toHaveLength(1);
    expect(await liveRows(owner, "leads")).toHaveLength(1);
    expect(await liveRows(owner, "events")).toHaveLength(1);
    expect(await liveRows(owner, "proposals")).toHaveLength(1);

    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    )) as {
      status: string;
      eventId: string | null;
      proposalId: string | null;
    };
    expect(row.status).toBe("completed");
    expect(row.eventId).toBe(converted.eventId);
    expect(row.proposalId).toBe(converted.proposalId);

    // The retry-created proposal is linked to the retry-created event.
    const proposals = (await liveRows(owner, "proposals")) as {
      eventId?: string | null;
    }[];
    expect(proposals[0].eventId).toBe(converted.eventId);

    // Retry is a failed-only transition: a completed row refuses it (the
    // proof harness surfaces a failed guard generically, not its message).
    await expect(
      proof.executeCommand(owner, api.mutations.QuoteSubmission_retry, {
        docId: submitted.submissionId,
      }),
    ).rejects.toThrow(/Guard \d+ failed/);
  });
});

/**
 * Read the live EventDish rows on one event (spec §7.1: a removed proposal
 * selection never becomes an EventDish; acceptance books the menu once).
 */
async function liveEventDishes(actor: Actor, eventId: string) {
  const rows = await actor.run(async (ctx) =>
    ctx.db.query("eventDishes").collect(),
  );
  return rows.filter(
    (row) =>
      (row as { eventId?: string }).eventId === eventId &&
      (row as { deletedAt?: number | null }).deletedAt == null,
  );
}

describe("runtime proof: retry links the reused proposal to one canonical event (AC-412, AC-433)", () => {
  it("resumed conversion keeps one Proposal-to-Event relationship", async () => {
    const tenantId = "tenant-quote-retry-link-a12";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-retry-link-a12",
      role: "owner",
      tenantId,
    });

    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Retry link proof kitchen" },
    );

    // Persisted partial conversion state (issue #391): the earlier attempt's
    // event step failed; the conversion caught that, still saved the draft
    // proposal unlinked (the proposal step runs after the event step), then
    // checkpointed the known ids and marked the row failed — exactly the row
    // state checkpointQuoteSubmissionIds + QuoteSubmission_fail produce. The
    // draft carries no eventId: the saved unlinked state a retry must repair.
    // This seeds persisted checkpoint state; it is not an injected transport
    // fault, and processQuoteSubmission and its persistence are never mocked.
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Dana Prospect",
        email: "dana-retry-link@example.com",
        phone: "555-0100",
      },
    )) as { docId: string };
    const clientId = client.docId;
    expect(clientId).toBeTruthy();

    const lead = (await proof.executeCommand(
      owner,
      api.mutations.Lead_createViaCapture,
      {
        leadType: "company",
        source: "quote-builder",
        estimatedValue: 0,
        companyName: "Dana Prospect",
        email: "dana-retry-link@example.com",
        phone: "555-0100",
      },
    )) as { docId: string };
    const leadId = lead.docId;
    expect(leadId).toBeTruthy();

    // A real published menu and dish, with a live proposal dish selection at
    // distinct known servings, so the acceptance cascade is checkable.
    const menu = (await proof.executeCommand(
      owner,
      api.mutations.Menu_createViaDraft,
      { name: "Retry link tasting menu" },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
      docId: menu.docId,
    });
    const dish = (await proof.executeCommand(
      owner,
      api.mutations.Dish_createViaIntroduce,
      { name: "Cedar salmon", portionSize: 1, portionUnit: "serving" },
    )) as { docId: string };

    const proposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId,
        title: "Proposal for Dana Prospect",
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        eventDate: Date.UTC(2026, 9, 15, 17, 0),
        guestCount: 60,
        venueName: "Orchard Barn",
      },
    )) as { docId: string };
    const proposalId = proposal.docId;
    expect(proposalId).toBeTruthy();

    await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_createViaSelect,
      {
        proposalId,
        menuId: menu.docId,
        dishId: dish.docId,
        quantityServings: 42,
        course: "main",
      },
    );

    const eventDate = Date.UTC(2026, 9, 15, 17, 0);
    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Dana Prospect",
        email: "dana-retry-link@example.com",
        phone: "555-0100",
        eventDate,
        eventEndTime: eventDate + 5 * 60 * 60 * 1000,
        guestCount: 60,
        consent: true,
        venueName: "Orchard Barn",
        venueAddress: "12 Quarry Lane",
        menuPreferences: "BBQ buffet",
        dietaryRestrictions: "",
        notes: "",
      },
    )) as { submissionId: string; isDuplicate: boolean };
    expect(submitted.isDuplicate).toBe(false);

    await owner.run(async (ctx) => {
      await ctx.db.patch(submitted.submissionId, {
        status: "failed",
        clientId,
        leadId,
        proposalId,
        errorMessage: "Conversion could not complete all steps",
        processingErrors: "event: simulated failure for the retry-link proof",
      });
    });

    await proof.executeCommand(owner, api.mutations.QuoteSubmission_retry, {
      docId: submitted.submissionId,
    });

    // The retry converts: the event step now succeeds and the saved records
    // are REUSED (checkpointed ids win), so nothing is duplicated.
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
    expect(converted.clientId).toBe(clientId);
    expect(converted.leadId).toBe(leadId);
    expect(converted.proposalId).toBe(proposalId);
    const eventId = converted.eventId as string;
    expect(eventId).toBeTruthy();

    // Exactly one client, lead, event and proposal.
    const clients = await liveRows(owner, "clients");
    expect(clients).toHaveLength(1);
    expect((clients[0] as { _id?: string })._id).toBe(clientId);
    expect(await liveRows(owner, "leads")).toHaveLength(1);
    const events = await liveRows(owner, "events");
    expect(events).toHaveLength(1);
    expect((events[0] as { _id?: string })._id).toBe(eventId);
    const proposals = await liveRows(owner, "proposals");
    expect(proposals).toHaveLength(1);
    expect((proposals[0] as { _id?: string })._id).toBe(proposalId);

    // THE CANONICAL LINK: the reused draft proposal must point at the event
    // this retry created. Spec §7.2-2/§23.6: a completed conversion leaves
    // one Proposal-to-Event relationship, or accepting the proposal later
    // books a second Event.
    expect((proposals[0] as { eventId?: string | null }).eventId).toBe(eventId);

    // The submission completed with the same ids checkpointed.
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    )) as {
      status: string;
      eventId: string | null;
      proposalId: string | null;
    };
    expect(row.status).toBe("completed");
    expect(row.eventId).toBe(eventId);
    expect(row.proposalId).toBe(proposalId);

    // Draft linking must not book the menu: no EventDish before acceptance.
    expect(await liveEventDishes(owner, eventId)).toHaveLength(0);

    // Accept through the real lifecycle (raw agent-bundle send path).
    await proof.executeCommand(owner, api.mutations.Proposal_send, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: proposalId,
    });

    // Acceptance books the linked event's menu exactly once, at the saved
    // selections.
    const dishes = await liveEventDishes(owner, eventId);
    expect(dishes).toHaveLength(1);
    expect((dishes[0] as { dishId?: string }).dishId).toBe(dish.docId);
    expect((dishes[0] as { quantityServings?: number }).quantityServings).toBe(
      42,
    );

    // The booking seam replays to the ALREADY-converted event — never a
    // second one (spec §7.1: replaying booking returns the existing Event;
    // §23.3: quote conversion and accepted-proposal booking converge on one
    // Event).
    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: {
          clientId,
          title: "Quote Request: Dana Prospect",
          eventType: "Catering Inquiry",
          startsAt: eventDate,
          endsAt: eventDate + 5 * 60 * 60 * 1000,
          expectedHeadcount: 60,
          primaryContactName: "Dana Prospect",
          budgetAmount: 0,
          quotedPrice: 0,
          venueName: "Orchard Barn",
        },
      },
    )) as { docId: string };
    expect(booked.docId).toBe(eventId);

    // No duplicates: still one event and one proposal, the accepted link and
    // menu copy are unchanged, and the raw-send path captured no revision for
    // booking to invent.
    expect(await liveRows(owner, "events")).toHaveLength(1);
    expect(await liveRows(owner, "proposals")).toHaveLength(1);
    const relinked = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { eventId?: string | null };
    expect(relinked.eventId).toBe(eventId);
    expect(await liveEventDishes(owner, eventId)).toHaveLength(1);
    expect(await liveRows(owner, "proposalRevisions")).toHaveLength(0);
  });
});

describe("runtime proof: persisted-checkpoint convergence repair (AC-433)", () => {
  const eventDate = Date.UTC(2026, 9, 15, 17, 0);

  type Seed = {
    clientId: string;
    leadId: string;
    proposalId: string;
    dishId: string;
  };

  /**
   * Seed the records a failed conversion leaves behind: organization,
   * client, lead, published menu + dish, a live dish selection, and a DRAFT
   * proposal — linked to linkedEventId when given (event-first conversion),
   * unlinked otherwise.
   */
  async function seedSavedRecords(
    proof: ReturnType<typeof harness>,
    owner: Actor,
    tenantId: string,
    opts?: { linkedEventId?: string },
  ): Promise<Seed> {
    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: `Convergence kitchen ${tenantId}` },
    );
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Dana Prospect",
        email: `dana-${tenantId}@example.com`,
        phone: "555-0100",
      },
    )) as { docId: string };
    const lead = (await proof.executeCommand(
      owner,
      api.mutations.Lead_createViaCapture,
      {
        leadType: "company",
        source: "quote-builder",
        estimatedValue: 0,
        companyName: "Dana Prospect",
        email: `dana-${tenantId}@example.com`,
        phone: "555-0100",
      },
    )) as { docId: string };
    const menu = (await proof.executeCommand(
      owner,
      api.mutations.Menu_createViaDraft,
      { name: "Convergence tasting menu" },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
      docId: menu.docId,
    });
    const dish = (await proof.executeCommand(
      owner,
      api.mutations.Dish_createViaIntroduce,
      { name: "Cedar salmon", portionSize: 1, portionUnit: "serving" },
    )) as { docId: string };
    const proposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: client.docId,
        title: "Proposal for Dana Prospect",
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        eventDate,
        guestCount: 60,
        venueName: "Orchard Barn",
        eventId: opts?.linkedEventId,
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_createViaSelect,
      {
        proposalId: proposal.docId,
        menuId: menu.docId,
        dishId: dish.docId,
        quantityServings: 42,
        course: "main",
      },
    );
    return {
      clientId: client.docId,
      leadId: lead.docId,
      proposalId: proposal.docId,
      dishId: dish.docId,
    };
  }

  /** A live conversion-shaped event for the saved client. */
  async function createConversionEvent(
    proof: ReturnType<typeof harness>,
    owner: Actor,
    clientId: string,
    title: string,
  ) {
    return (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId,
        title,
        eventType: "Catering Inquiry",
        startsAt: eventDate,
        endsAt: eventDate + 5 * 60 * 60 * 1000,
        expectedHeadcount: 60,
        primaryContactName: "Dana Prospect",
        budgetAmount: 0,
        quotedPrice: 0,
        venueName: "Orchard Barn",
      },
    )) as { docId: string };
  }

  /**
   * Submit a quote for the saved contact, checkpoint the failed row with
   * exactly the given ids (the state the failed attempt persisted), and
   * reopen it via the real retry transition.
   */
  async function retriedSubmission(
    proof: ReturnType<typeof harness>,
    owner: Actor,
    tenantId: string,
    checkpoint: Pick<Seed, "clientId" | "leadId" | "proposalId"> & {
      eventId?: string;
    },
  ) {
    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Dana Prospect",
        email: `dana-${tenantId}@example.com`,
        phone: "555-0100",
        eventDate,
        eventEndTime: eventDate + 5 * 60 * 60 * 1000,
        guestCount: 60,
        consent: true,
        venueName: "Orchard Barn",
        menuPreferences: "BBQ buffet",
        dietaryRestrictions: "",
        notes: "",
      },
    )) as { submissionId: string; isDuplicate: boolean };
    expect(submitted.isDuplicate).toBe(false);
    await owner.run(async (ctx) => {
      await ctx.db.patch(submitted.submissionId, {
        status: "failed",
        clientId: checkpoint.clientId,
        leadId: checkpoint.leadId,
        proposalId: checkpoint.proposalId,
        eventId: checkpoint.eventId ?? null,
        errorMessage: "Conversion could not complete all steps",
        processingErrors: "event: simulated failure for the convergence proof",
      });
    });
    await proof.executeCommand(owner, api.mutations.QuoteSubmission_retry, {
      docId: submitted.submissionId,
    });
    return submitted.submissionId;
  }

  it("recovers a conversion whose checkpoint lost the event id by reusing the saved proposal's event", async () => {
    const tenantId = "tenant-quote-conv-recover";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-conv-recover",
      role: "owner",
      tenantId,
    });
    const seed = await seedSavedRecords(proof, owner, tenantId);
    const event = await createConversionEvent(
      proof,
      owner,
      seed.clientId,
      "Quote Request: Dana Prospect",
    );
    // Event-first conversion (spec §7.2-2): the saved draft already
    // references its event through the domain's staged handshake, but the
    // failed row's event checkpoint is absent.
    await proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
      docId: seed.proposalId,
      eventId: event.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
      docId: seed.proposalId,
    });
    const linked = (await owner.run(async (ctx) =>
      ctx.db.get(seed.proposalId as never),
    )) as { eventId?: string | null };
    expect(linked.eventId).toBe(event.docId);

    const submissionId = await retriedSubmission(proof, owner, tenantId, {
      clientId: seed.clientId,
      leadId: seed.leadId,
      proposalId: seed.proposalId,
    });

    const converted = (await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId },
    )) as {
      eventId: string | null;
      proposalId: string | null;
      errors: string[];
    };
    expect(converted.errors).toEqual([]);
    // The conversion REUSED the saved proposal's event — no second Event.
    expect(converted.eventId).toBe(event.docId);
    expect(converted.proposalId).toBe(seed.proposalId);
    expect(await liveRows(owner, "events")).toHaveLength(1);

    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submissionId as never),
    )) as { status: string; eventId: string | null };
    expect(row.status).toBe("completed");
    expect(row.eventId).toBe(event.docId);

    // Draft state books no menu — and the draft was already linked, so the
    // retry changed nothing about the proposal.
    expect(await liveEventDishes(owner, event.docId)).toHaveLength(0);

    // Acceptance books the menu once, and booking replays to the SAME event.
    await proof.executeCommand(owner, api.mutations.Proposal_send, {
      docId: seed.proposalId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: seed.proposalId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: seed.proposalId,
    });
    const dishes = await liveEventDishes(owner, event.docId);
    expect(dishes).toHaveLength(1);
    expect((dishes[0] as { dishId?: string }).dishId).toBe(seed.dishId);
    expect((dishes[0] as { quantityServings?: number }).quantityServings).toBe(
      42,
    );
    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId: seed.proposalId,
        event: {
          clientId: seed.clientId,
          title: "Quote Request: Dana Prospect",
          eventType: "Catering Inquiry",
          startsAt: eventDate,
          endsAt: eventDate + 5 * 60 * 60 * 1000,
          expectedHeadcount: 60,
          primaryContactName: "Dana Prospect",
          budgetAmount: 0,
          quotedPrice: 0,
          venueName: "Orchard Barn",
        },
      },
    )) as { docId: string };
    expect(booked.docId).toBe(event.docId);
    expect(await liveRows(owner, "events")).toHaveLength(1);
  });

  it("fails a conversion whose saved proposal and checkpoint name different events, preserving both ids", async () => {
    const tenantId = "tenant-quote-conv-conflict";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-conv-conflict",
      role: "owner",
      tenantId,
    });
    const seed = await seedSavedRecords(proof, owner, tenantId);

    // The saved draft is already linked to ITS event through the domain's
    // staged handshake (draft linking, issue #391) — the canonical way this
    // state arises.
    const proposalEvent = await createConversionEvent(
      proof,
      owner,
      seed.clientId,
      "Proposal's event",
    );
    await proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
      docId: seed.proposalId,
      eventId: proposalEvent.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
      docId: seed.proposalId,
    });

    // The failed row's checkpoint names a DIFFERENT live event.
    const checkpointEvent = await createConversionEvent(
      proof,
      owner,
      seed.clientId,
      "Checkpoint's event",
    );
    const submissionId = await retriedSubmission(proof, owner, tenantId, {
      clientId: seed.clientId,
      leadId: seed.leadId,
      proposalId: seed.proposalId,
      eventId: checkpointEvent.docId,
    });

    const converted = (await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId },
    )) as {
      eventId: string | null;
      proposalId: string | null;
      errors: string[];
    };
    expect(converted.errors).toHaveLength(1);
    expect(converted.errors[0]).toMatch(/proposal event link/);
    expect(converted.eventId).toBe(checkpointEvent.docId);
    expect(converted.proposalId).toBe(seed.proposalId);

    // The conversion FAILED — never "completed" over a mismatched link — and
    // both recorded ids are preserved on the row for the next decision.
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submissionId as never),
    )) as {
      status: string;
      eventId: string | null;
      proposalId: string | null;
    };
    expect(row.status).toBe("failed");
    expect(row.eventId).toBe(checkpointEvent.docId);
    expect(row.proposalId).toBe(seed.proposalId);

    // The proposal's relationship is untouched: still its own event, no
    // staged pointer left behind, no third event, and no menu copied to
    // either event by the refused conversion.
    const linked = (await owner.run(async (ctx) =>
      ctx.db.get(seed.proposalId as never),
    )) as { eventId?: string | null; pendingEventId?: string | null };
    expect(linked.eventId).toBe(proposalEvent.docId);
    expect(linked.pendingEventId ?? null).toBeNull();
    expect(await liveRows(owner, "events")).toHaveLength(2);
    expect(await liveEventDishes(owner, proposalEvent.docId)).toHaveLength(0);
    expect(await liveEventDishes(owner, checkpointEvent.docId)).toHaveLength(0);
  });

  it("fails a conversion whose recovered event was soft-deleted, preserving checkpoint and pointer", async () => {
    const tenantId = "tenant-quote-conv-deleted";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-quote-conv-deleted",
      role: "owner",
      tenantId,
    });
    const seed = await seedSavedRecords(proof, owner, tenantId);

    // The saved draft is linked to its event through the domain's staged
    // handshake — then the event is soft-deleted after the fact. The failed
    // row's checkpoint names NO event, so a retry recovers the pointer from
    // the saved proposal — into a now-deleted event.
    const event = await createConversionEvent(
      proof,
      owner,
      seed.clientId,
      "Quote Request: Dana Prospect",
    );
    await proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
      docId: seed.proposalId,
      eventId: event.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
      docId: seed.proposalId,
    });
    await owner.run(async (ctx) => {
      await ctx.db.patch(event.docId as never, { deletedAt: Date.now() });
    });

    const submissionId = await retriedSubmission(proof, owner, tenantId, {
      clientId: seed.clientId,
      leadId: seed.leadId,
      proposalId: seed.proposalId,
    });

    const converted = (await asActions(owner).action(
      api.quoteBuilder.processQuoteSubmission,
      { submissionId },
    )) as {
      eventId: string | null;
      proposalId: string | null;
      errors: string[];
    };
    expect(converted.errors).toHaveLength(1);
    expect(converted.errors[0]).toMatch(/proposal event link/);
    // The recovered pointer is reported back — never a replacement Event.
    expect(converted.eventId).toBe(event.docId);
    expect(converted.proposalId).toBe(seed.proposalId);

    // Not a completion: the row stays failed with both ids preserved.
    const row = (await owner.run(async (ctx) =>
      ctx.db.get(submissionId as never),
    )) as {
      status: string;
      eventId: string | null;
      proposalId: string | null;
    };
    expect(row.status).toBe("failed");
    expect(row.eventId).toBe(event.docId);
    expect(row.proposalId).toBe(seed.proposalId);

    // No replacement Event was created (the only row is the soft-deleted
    // one, which liveRows filters out), the proposal still points at its own
    // (deleted) event with no staged pointer left behind, and the refused
    // conversion copied no menu anywhere.
    expect(await liveRows(owner, "events")).toHaveLength(0);
    const linked = (await owner.run(async (ctx) =>
      ctx.db.get(seed.proposalId as never),
    )) as { eventId?: string | null; pendingEventId?: string | null };
    expect(linked.eventId).toBe(event.docId);
    expect(linked.pendingEventId ?? null).toBeNull();
    expect(await liveEventDishes(owner, event.docId)).toHaveLength(0);
  });
});
