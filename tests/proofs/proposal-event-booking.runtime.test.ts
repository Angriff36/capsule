/**
 * Issue #141 / PR #157 review: booking an accepted proposal into a new event.
 *
 * Exercises convex/lib/proposalEventCreation.createEventFromAcceptedProposal
 * (authored seam) and the Proposal.linkEvent domain command + its
 * ProposalEventLinked → EventDish.confirmFromProposal cascade
 * (src/sales/proposal.manifest, src/sales/proposal-dish-selection.manifest):
 *   - accepted proposal → create event → menu selections copy (removed ones don't)
 *   - sales_staff can complete the whole flow (policy regression) but stays
 *     DENIED on direct EventDish composition (addToEvent/adjustServings/remove)
 *   - already-linked proposals reject, at the seam AND the domain command
 *   - a rejected double-booking creates no duplicate event
 *   - linkEvent refuses a missing/fake eventId (even with no menu selections,
 *     where the cascade would never run) and a wrong-client event
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { proposalEventPrefill } from "../../src/features/events/ProposalEventPrefill";

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

/** Client + published menu + two active dishes, seeded as an owner. */
async function seedCatalog(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  tenantId: string,
) {
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `Booking client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(
    owner,
    api.mutations.Menu_createViaDraft,
    { name: "Booking tasting menu" },
  )) as { docId: string };
  await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
    docId: menu.docId,
  });
  const dishA = (await proof.executeCommand(
    owner,
    api.mutations.Dish_createViaIntroduce,
    { name: "Cedar salmon", portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  const dishB = (await proof.executeCommand(
    owner,
    api.mutations.Dish_createViaIntroduce,
    { name: "Smoked brisket", portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  return { clientId: client.docId, menuId: menu.docId, dishA, dishB };
}

/** Draft → select dishes (one kept, one removed) → send → viewed → accept. */
async function acceptedProposalWithMenu(
  proof: ReturnType<typeof harness>,
  actor: Actor,
  seed: Awaited<ReturnType<typeof seedCatalog>>,
  opts?: {
    /** Draft-window hook (C3): offer/withdraw enhancements before send. */
    beforeSend?: (proposalId: string) => Promise<void>;
    /**
     * C4: send through the UI send path
     * (sendProposalWithRevisionCapture), which captures an immutable
     * revision in the same transaction, instead of the raw Proposal_send
     * the agent bundle path uses (issue #241).
     */
    captureRevision?: boolean;
  },
) {
  const proposal = (await proof.executeCommand(
    actor,
    api.mutations.Proposal_createViaDraft,
    {
      clientId: seed.clientId,
      title: "Autumn gala proposal",
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
      eventType: "gala dinner",
      eventDate: Date.parse("2026-10-01T18:00:00Z"),
      eventEndDate: Date.parse("2026-10-01T23:00:00Z"),
      guestCount: 80,
      venueName: "Riverside Hall",
    },
  )) as { docId: string };
  await proof.executeCommand(
    actor,
    api.mutations.ProposalDishSelection_createViaSelect,
    {
      proposalId: proposal.docId,
      menuId: seed.menuId,
      dishId: seed.dishA.docId,
      quantityServings: 80,
      course: "main",
    },
  );
  const removed = (await proof.executeCommand(
    actor,
    api.mutations.ProposalDishSelection_createViaSelect,
    {
      proposalId: proposal.docId,
      menuId: seed.menuId,
      dishId: seed.dishB.docId,
      quantityServings: 40,
      course: "side",
    },
  )) as { docId: string };
  await proof.executeCommand(
    actor,
    api.mutations.ProposalDishSelection_remove,
    { docId: removed.docId },
  );
  if (opts?.beforeSend) await opts.beforeSend(proposal.docId);
  if (opts?.captureRevision) {
    await proof.executeCommand(
      actor,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal.docId },
    );
  } else {
    await proof.executeCommand(actor, api.mutations.Proposal_send, {
      docId: proposal.docId,
    });
  }
  await proof.executeCommand(actor, api.mutations.Proposal_markViewed, {
    docId: proposal.docId,
  });
  await proof.executeCommand(actor, api.mutations.Proposal_accept, {
    docId: proposal.docId,
  });
  return proposal.docId;
}

const EVENT_ARGS = {
  title: "Autumn gala",
  eventType: "gala dinner",
  startsAt: Date.parse("2026-10-01T18:00:00Z"),
  endsAt: Date.parse("2026-10-01T23:00:00Z"),
  expectedHeadcount: 80,
  primaryContactName: "Casey Contact",
  budgetAmount: 0,
  quotedPrice: 1300,
  venueName: "Riverside Hall",
};

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

async function liveEventCount(actor: Actor) {
  const rows = await actor.run(async (ctx) => ctx.db.query("events").collect());
  return rows.filter(
    (row) => (row as { deletedAt?: number | null }).deletedAt == null,
  ).length;
}

describe("accepted proposal → create event (issue #141)", () => {
  it("books the event, links the proposal, and copies live menu selections", async () => {
    const tenantId = "tenant-booking-a";
    const proof = harness();
    const owner = proof.asRole({ subject: "owner-a", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed);

    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };

    const linked = await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    );
    expect((linked as { eventId?: string }).eventId).toBe(booked.docId);

    const copied = await liveEventDishes(owner, booked.docId);
    expect(copied).toHaveLength(1);
    expect((copied[0] as { dishId?: string }).dishId).toBe(seed.dishA.docId);
    expect((copied[0] as { quantityServings?: number }).quantityServings).toBe(
      80,
    );
    expect((copied[0] as { course?: string }).course).toBe("main");
    expect((copied[0] as { addedAt?: number | null }).addedAt).toBeTruthy();

    const eventRow = await owner.run(async (ctx) =>
      ctx.db.get(booked.docId as never),
    );
    expect((eventRow as { title?: string }).title).toBe("Autumn gala");
    expect((eventRow as { stage?: string }).stage).toBe("planning");
  });

  it("typed date, times and headcount carry over", async () => {
    const tenantId = "tenant-booking-carry";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-carry",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed);

    // The proposal stores date, end and headcount as typed values (C2 adds
    // eventEndDate; eventDate/guestCount already existed).
    const proposalRow = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as {
      eventDate?: number | null;
      eventEndDate?: number | null;
      guestCount?: number;
    };
    expect(proposalRow.eventDate).toBe(Date.parse("2026-10-01T18:00:00Z"));
    expect(proposalRow.eventEndDate).toBe(Date.parse("2026-10-01T23:00:00Z"));
    expect(proposalRow.guestCount).toBe(80);

    // The real prefill the create-event screen seeds from
    // (ProposalEventPrefill), parsed the way the form mapper parses
    // datetime-local values (Date.parse, local time) — a same-process local
    // round trip, so the parsed instants equal the stored ones.
    const prefill = proposalEventPrefill.values(proposalRow as never);
    expect(prefill.startsAtLocal).toBeTruthy();
    expect(prefill.endsAtLocal).toBeTruthy();
    expect(prefill.expectedHeadcount).toBe(80);

    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: {
          clientId: seed.clientId,
          title: "Autumn gala",
          eventType: "gala dinner",
          startsAt: Date.parse(prefill.startsAtLocal as string),
          endsAt: Date.parse(prefill.endsAtLocal as string),
          expectedHeadcount: prefill.expectedHeadcount as number,
          primaryContactName: "Casey Contact",
          budgetAmount: 0,
          quotedPrice: 1300,
          venueName: "Riverside Hall",
        },
      },
    )) as { docId: string };

    // No re-entry: the event inherits the proposal's typed values exactly.
    const eventRow = (await owner.run(async (ctx) =>
      ctx.db.get(booked.docId as never),
    )) as {
      startsAt?: number;
      endsAt?: number;
      expectedHeadcount?: number;
    };
    expect(eventRow.startsAt).toBe(proposalRow.eventDate);
    expect(eventRow.endsAt).toBe(proposalRow.eventEndDate);
    expect(eventRow.expectedHeadcount).toBe(80);
  });

  it("accepted enhancements reachable from the event", async () => {
    const tenantId = "tenant-booking-enh";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-enh",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    let withdrawnId = "";
    // offer/withdraw guard proposal.status == "draft", so both run in the
    // draft window: two live enhancements plus one withdrawn before send.
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed, {
      beforeSend: async (id) => {
        await proof.executeCommand(
          owner,
          api.mutations.ProposalEnhancement_createViaOffer,
          {
            proposalId: id,
            name: "Late-night snack board",
            price: 250,
            description: "Served at 22:00",
          },
        );
        await proof.executeCommand(
          owner,
          api.mutations.ProposalEnhancement_createViaOffer,
          { proposalId: id, name: "Valet parking", price: 400 },
        );
        const withdrawn = (await proof.executeCommand(
          owner,
          api.mutations.ProposalEnhancement_createViaOffer,
          { proposalId: id, name: "Dry ice display", price: 99 },
        )) as { docId: string };
        withdrawnId = withdrawn.docId;
        await proof.executeCommand(
          owner,
          api.mutations.ProposalEnhancement_withdraw,
          { docId: withdrawn.docId },
        );
      },
    });

    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };

    // The exact read path the event overview card uses
    // (EventEnhancementsCard): reverse lookup from the event id, then live
    // enhancement rows on the resolved proposal.
    const proposals = (await owner.query(api.queries.listProposalByEventId, {
      eventId: booked.docId,
    })) as Array<{ _id: string }>;
    expect(proposals.map((row) => row._id)).toEqual([proposalId]);

    const enhancements = (await owner.query(
      api.queries.listProposalEnhancementByProposalId,
      { proposalId },
    )) as Array<{
      _id: string;
      name: string;
      removedAt: number | null;
    }>;
    const live = enhancements
      .filter((row) => row.removedAt == null)
      .map((row) => row.name)
      .sort();
    expect(live).toEqual(["Late-night snack board", "Valet parking"]);
    // Withdraw soft-deletes (removedAt AND deletedAt), so the generated read
    // already drops the row — the withdrawn offer never reaches the event.
    expect(enhancements.map((row) => row._id)).not.toContain(withdrawnId);
    type Booking = {
      canOpenProposal: boolean;
      enhancements: Array<{ name: string; price: number | null }>;
    } | null;
    const booking = await owner.query(api.quoteBuilder.getEventBookingDetails, {
      eventId: booked.docId,
    });
    expect((booking as Booking)?.canOpenProposal).toBe(true);
    expect(
      (booking as Booking)?.enhancements.map((row) => row.name).sort(),
    ).toEqual(live);
    const operations = proof.asRole({
      subject: "booking-operations",
      role: "event_manager",
      tenantId,
    });
    const operationalBooking = await operations.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: booked.docId },
    );
    expect((operationalBooking as Booking)?.canOpenProposal).toBe(false);
    expect(
      (operationalBooking as Booking)?.enhancements
        .map((row) => row.name)
        .sort(),
    ).toEqual(live);
    expect(
      (operationalBooking as Booking)?.enhancements.every(
        (row) => row.price === null,
      ),
    ).toBe(true);
    const outsider = proof.asRole({
      subject: "booking-outsider",
      role: "owner",
      tenantId: "other-tenant",
    });
    expect(
      await outsider.query(api.quoteBuilder.getEventBookingDetails, {
        eventId: booked.docId,
      }),
    ).toBeNull();
  });

  it("event resolves its proposal and accepted revision", async () => {
    const tenantId = "tenant-booking-rev";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-rev",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);

    // UI send path: send and revision capture commit in one transaction
    // (convex/lib/proposalRevision.sendProposalWithRevisionCapture).
    const capturedId = await acceptedProposalWithMenu(proof, owner, seed, {
      captureRevision: true,
    });
    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId: capturedId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };

    // The exact read path EventProposalSourceCard walks: the reverse lookup
    // resolves the proposal from the event — never a free-text copy.
    const proposals = (await owner.query(api.queries.listProposalByEventId, {
      eventId: booked.docId,
    })) as Array<{ _id: string }>;
    expect(proposals.map((row) => row._id)).toEqual([capturedId]);

    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: capturedId },
    )) as Array<{ _id: string; revisionNumber: number }>;
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revisionNumber).toBe(1);

    // No signature request exists for it yet: the card's digital branch is
    // empty and the highest revisionNumber (1) is the accepted revision.
    const signaturesBefore = (await owner.query(
      api.queries.listSignatureRequest,
      {},
    )) as Array<{ proposalId: string | null }>;
    expect(
      signaturesBefore.filter((row) => row.proposalId === capturedId),
    ).toEqual([]);

    // Digital accept: sign the captured revision, then the generated
    // SignatureCompleted reaction accepts the proposal (complete →
    // __runProposalAccept), and booking walks the same reverse lookup with
    // the signature naming WHICH revision was accepted.
    const digitalProposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: seed.clientId,
        title: "Signed gala proposal",
        subtotal: 900,
        taxAmount: 0,
        discountAmount: 0,
        total: 900,
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: digitalProposal.docId },
    );
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: digitalProposal.docId,
    });
    const digitalRevisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: digitalProposal.docId },
    )) as Array<{ _id: string; revisionNumber: number }>;
    expect(digitalRevisions).toHaveLength(1);

    // The signature commands guard on user.personId, which only a linked
    // Person row provides (person-first auth, convex/lib/authContext.ts):
    // seed one for this subject the way Team roles links a real sign-in.
    await proof.seedEntity(owner, "people", {
      tenantId,
      givenName: "Rev",
      familyName: "Owner",
      email: "rev-owner@example.com",
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "owner-rev",
      version: 1,
    });

    const signature = (await proof.executeCommand(
      owner,
      api.mutations.SignatureRequest_createViaRequestSignature,
      {
        proposalRevisionId: digitalRevisions[0]._id,
        proposalId: digitalProposal.docId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
      },
    )) as { docId: string };
    // No generated command sets callbackToken (the authored acceptance seam
    // owns it); seed it the way that seam does so complete's guard passes.
    await owner.run(async (ctx) =>
      ctx.db.patch(signature.docId as never, { callbackToken: "proof-token" }),
    );
    await proof.executeCommand(owner, api.mutations.SignatureRequest_complete, {
      docId: signature.docId,
      callbackToken: "proof-token",
      signedArtifactReference: "proof://signed",
    });
    const digitalRow = (await owner.run(async (ctx) =>
      ctx.db.get(digitalProposal.docId as never),
    )) as { status?: string };
    expect(digitalRow.status).toBe("accepted");

    const bookedDigital = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId: digitalProposal.docId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };
    const digitalProposals = (await owner.query(
      api.queries.listProposalByEventId,
      { eventId: bookedDigital.docId },
    )) as Array<{ _id: string }>;
    expect(digitalProposals.map((row) => row._id)).toEqual([
      digitalProposal.docId,
    ]);
    const signaturesAfter = (await owner.query(
      api.queries.listSignatureRequest,
      {},
    )) as Array<{
      proposalId: string | null;
      proposalRevisionId: string;
      status: string;
    }>;
    const completed = signaturesAfter.find(
      (row) => row.proposalId === digitalProposal.docId,
    );
    expect(completed?.status).toBe("completed");
    expect(completed?.proposalRevisionId).toBe(digitalRevisions[0]._id);

    // Agent bundle path (issue #241): raw Proposal.send captures no revision.
    // Zero revisions is a resolvable state — the card says "no revision
    // captured" — and the reverse lookup still resolves. Nothing throws.
    const rawId = await acceptedProposalWithMenu(proof, owner, seed);
    const bookedRaw = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId: rawId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };
    const rawProposals = (await owner.query(api.queries.listProposalByEventId, {
      eventId: bookedRaw.docId,
    })) as Array<{ _id: string }>;
    expect(rawProposals.map((row) => row._id)).toEqual([rawId]);
    const rawRevisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: rawId },
    )) as Array<{ revisionNumber: number }>;
    expect(rawRevisions).toEqual([]);
  });

  it("sales_staff can complete the whole flow, menu copy included", async () => {
    const tenantId = "tenant-booking-sales";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sales",
      role: "owner",
      tenantId,
    });
    const sales = proof.asRole({
      subject: "sales-staff-1",
      role: "sales_staff",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    // The proposal lifecycle AND the booking run as sales_staff — the menu
    // cascade (EventDish.confirmFromProposal) must not require manageAccess.
    const proposalId = await acceptedProposalWithMenu(proof, sales, seed);

    const booked = (await proof.executeCommand(
      sales,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };

    const linked = await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    );
    expect((linked as { eventId?: string }).eventId).toBe(booked.docId);
    const copied = await liveEventDishes(owner, booked.docId);
    expect(copied).toHaveLength(1);
    expect((copied[0] as { dishId?: string }).dishId).toBe(seed.dishA.docId);
  });

  it("rejects an already-linked proposal at the seam and the domain command, creating no duplicate event", async () => {
    const tenantId = "tenant-booking-dup";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-dup",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed);

    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: { clientId: seed.clientId, ...EVENT_ARGS },
      },
    )) as { docId: string };
    const eventsAfterBooking = await liveEventCount(owner);

    // Seam rejects and rolls back — no second event appears.
    await expect(
      proof.executeCommand(
        owner,
        api.lib.proposalEventCreation.createEventFromAcceptedProposal,
        {
          proposalId,
          event: { clientId: seed.clientId, ...EVENT_ARGS },
        },
      ),
    ).rejects.toThrow(/already linked/);
    expect(await liveEventCount(owner)).toBe(eventsAfterBooking);

    // The domain commands themselves also refuse to re-link (guard
    // eventId == null): staging a new candidate fails, and so does a bare
    // linkEvent.
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
        docId: proposalId,
        eventId: booked.docId,
      }),
    ).rejects.toThrow();
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
        docId: proposalId,
      }),
    ).rejects.toThrow();

    // The original link and menu survive untouched.
    const linked = await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    );
    expect((linked as { eventId?: string }).eventId).toBe(booked.docId);
    expect(await liveEventDishes(owner, booked.docId)).toHaveLength(1);
  });

  it("denies sales_staff direct EventDish composition (addToEvent/adjustServings/remove)", async () => {
    const tenantId = "tenant-booking-deny";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-deny",
      role: "owner",
      tenantId,
    });
    const sales = proof.asRole({
      subject: "sales-staff-deny",
      role: "sales_staff",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    const event = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      { clientId: seed.clientId, ...EVENT_ARGS },
    )) as { docId: string };
    const line = (await proof.executeCommand(
      owner,
      api.mutations.EventDish_createViaAddToEvent,
      { eventId: event.docId, dishId: seed.dishA.docId, quantityServings: 10 },
    )) as { docId: string };

    // The entity policy admits sales only for the proposal-confirmation
    // cascade; every composition command carries a manageAccess guard.
    await expect(
      proof.executeCommand(sales, api.mutations.EventDish_createViaAddToEvent, {
        eventId: event.docId,
        dishId: seed.dishB.docId,
        quantityServings: 5,
      }),
    ).rejects.toThrow(/Guard/);
    await expect(
      proof.executeCommand(sales, api.mutations.EventDish_adjustServings, {
        docId: line.docId,
        quantityServings: 1,
      }),
    ).rejects.toThrow(/Guard/);
    await expect(
      proof.executeCommand(sales, api.mutations.EventDish_remove, {
        docId: line.docId,
        reason: "sales should not be able to do this",
      }),
    ).rejects.toThrow(/Guard/);

    // Managers still can (policy + guard both pass).
    await proof.executeCommand(owner, api.mutations.EventDish_adjustServings, {
      docId: line.docId,
      quantityServings: 12,
    });
  });

  it("linkEvent refuses a fake eventId even when no menu selections exist", async () => {
    const tenantId = "tenant-booking-fake";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-fake",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    // Accepted proposal WITHOUT any dish selections — the cascade would never
    // run, so only the linkEvent guards stand between a fake id and eventId.
    const proposal = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: seed.clientId,
        title: "No-menu proposal",
        subtotal: 100,
        taxAmount: 0,
        discountAmount: 0,
        total: 100,
      },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Proposal_send, {
      docId: proposal.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: proposal.docId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: proposal.docId,
    });

    // A malformed id cannot even be staged — the schema validator rejects it
    // before any write (pendingEventId is a real v.id("events") column).
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
        docId: proposal.docId,
        eventId: "evt_does_not_exist",
      }),
    ).rejects.toThrow(/Validator/);

    // A well-formed id that does not exist in THIS tenant (another tenant's
    // event) stages, but linkEvent's tenant-bound pendingEvent resolve comes
    // back null → guard rejects. Nothing links.
    const foreignOwner = proof.asRole({
      subject: "owner-foreign",
      role: "owner",
      tenantId: "tenant-booking-fake-other",
    });
    const foreignClient = (await proof.executeCommand(
      foreignOwner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Foreign tenant client" },
    )) as { docId: string };
    const foreignEvent = (await proof.executeCommand(
      foreignOwner,
      api.mutations.Event_createViaPlanEngagement,
      { clientId: foreignClient.docId, ...EVENT_ARGS },
    )) as { docId: string };
    await proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
      docId: proposal.docId,
      eventId: foreignEvent.docId,
    });
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
        docId: proposal.docId,
      }),
    ).rejects.toThrow();

    const row = await owner.run(async (ctx) =>
      ctx.db.get(proposal.docId as never),
    );
    expect((row as { eventId?: string | null }).eventId ?? null).toBeNull();
  });

  it("linkEvent refuses an event that belongs to a different client", async () => {
    const tenantId = "tenant-booking-xclient";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-xclient",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    const otherClient = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Some other client" },
    )) as { docId: string };
    const foreignEvent = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      { clientId: otherClient.docId, ...EVENT_ARGS },
    )) as { docId: string };
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed);

    await proof.executeCommand(owner, api.mutations.Proposal_stageEventLink, {
      docId: proposalId,
      eventId: foreignEvent.docId,
    });
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
        docId: proposalId,
      }),
    ).rejects.toThrow(/must belong to the proposal's client/);

    const row = await owner.run(async (ctx) => ctx.db.get(proposalId as never));
    expect((row as { eventId?: string | null }).eventId ?? null).toBeNull();
  });

  it("rejects proposals that are not accepted", async () => {
    const tenantId = "tenant-booking-draft";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-draft",
      role: "owner",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    const draft = (await proof.executeCommand(
      owner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: seed.clientId,
        title: "Still a draft",
        subtotal: 10,
        taxAmount: 0,
        discountAmount: 0,
        total: 10,
      },
    )) as { docId: string };
    const eventsBefore = await liveEventCount(owner);

    await expect(
      proof.executeCommand(
        owner,
        api.lib.proposalEventCreation.createEventFromAcceptedProposal,
        {
          proposalId: draft.docId,
          event: { clientId: seed.clientId, ...EVENT_ARGS },
        },
      ),
    ).rejects.toThrow(/Only an accepted proposal/);
    expect(await liveEventCount(owner)).toBe(eventsBefore);
  });
});
