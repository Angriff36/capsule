/**
 * Runtime proof: the release journey — quote to booked event (D1 / AC-017).
 *
 * One continuous story in one tenant: public submit → operator conversion
 * (client + lead + event + LINKED draft proposal) → sales prices the menu
 * (dish selections + enhancements in the draft window) → send with revision
 * capture (the UI path) → viewed → accept → the ProposalAccepted cascade
 * copies the client's live menu onto the linked event.
 *
 * Why this proof exists: the release thesis is "booked without re-keying"
 * (issue #141 — the failure class in Josh's first JTBD). Every leg is proven
 * alone (AC-007…AC-009 queue + conversion, AC-001/AC-004/AC-005 booking,
 * AC-002 reverse link); this is the release gate that walks them in sequence
 * and asserts nothing was retyped: the prospect's date, end time, headcount
 * and venue text arrive on the event as typed fields, the accepted menu
 * servings copy unchanged (removed selections do not), the accepted
 * enhancements stay reachable from the event, and the proposal points at the
 * event it created — accept books no second event.
 *
 * Venue note: name → saved-Venue resolution is the create-event-screen
 * behavior (AC-003, tests/features/events/proposal-event-prefill.test.ts).
 * The quote journey never opens that screen — conversion creates the event
 * server-side and links the proposal at draft (A1), so the event snapshots
 * the prospect's venue text (events snapshot venue name/address; the queue
 * keeps venue text exactly as entered). Conversion must not silently
 * name-match a Venue the operator never chose.
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
 * convex-test instance also runs actions (submitQuote /
 * processQuoteSubmission are actions, not commands).
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

describe("runtime proof: quote to booked event (AC-017)", () => {
  it("quote to booked event journey", async () => {
    const tenantId = "tenant-journey-d1";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-journey-d1",
      role: "owner",
      tenantId,
    });

    // The public form resolves its tenant from the active organizations row;
    // without one, ingress refuses the submit (issue #119). Create it first.
    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister,
      { name: "Journey kitchen" },
    );

    // Sales-side catalog the proposal is priced from: one published menu,
    // two active dishes (same seed shape as the booking proof).
    const menu = (await proof.executeCommand(
      owner,
      api.mutations.Menu_createViaDraft,
      { name: "Journey tasting menu" },
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

    // 1. The prospect submits once from the public form (catalogs empty, so
    //    style/occasion arrive as free text — the A5 fallback).
    const eventDate = Date.UTC(2026, 11, 12, 17, 0);
    const eventEnd = Date.UTC(2026, 11, 12, 22, 0);
    const submitted = (await asActions(owner).action(
      api.quoteBuilder.submitQuote,
      {
        clientName: "Dana Prospect",
        email: "dana-journey@example.com",
        phone: "555-0100",
        eventDate,
        eventEndTime: eventEnd,
        guestCount: 75,
        consent: true,
        serviceStyleText: "Family-style buffet",
        occasionText: "Retirement party",
        venueName: "Orchard Barn",
        venueAddress: "12 Quarry Lane",
        menuPreferences: "BBQ buffet, two mains",
        dietaryRestrictions: "One gluten-free guest",
        notes: "Wants a tasting first",
      },
    )) as { submissionId: string; isDuplicate: boolean; status: string };
    expect(submitted.isDuplicate).toBe(false);
    expect(submitted.status).toBe("pending");

    // 2. Sales sees the lead with all selections: the queue row (the
    //    submission) holds every captured field — this row IS the review
    //    queue's data source (AC-007).
    const submissionBefore = (await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    )) as {
      clientName: string;
      email: string;
      eventDate: number;
      guestCount: number;
      serviceStyleText: string | null;
      occasionText: string | null;
      venueName: string | null;
      menuPreferences: string | null;
      dietaryRestrictions: string | null;
      notes: string | null;
    };
    expect(submissionBefore.clientName).toBe("Dana Prospect");
    expect(submissionBefore.email).toBe("dana-journey@example.com");
    expect(submissionBefore.eventDate).toBe(eventDate);
    expect(submissionBefore.guestCount).toBe(75);
    expect(submissionBefore.serviceStyleText).toBe("Family-style buffet");
    expect(submissionBefore.occasionText).toBe("Retirement party");
    expect(submissionBefore.venueName).toBe("Orchard Barn");
    expect(submissionBefore.menuPreferences).toBe("BBQ buffet, two mains");
    expect(submissionBefore.dietaryRestrictions).toBe("One gluten-free guest");
    expect(submissionBefore.notes).toBe("Wants a tasting first");

    // 3. Convert — one action, no re-entry: client (matched or created),
    //    lead, event, and a draft proposal already linked to that event.
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

    expect(await liveRows(owner, "clients")).toHaveLength(1);
    expect(await liveRows(owner, "leads")).toHaveLength(1);
    expect(await liveRows(owner, "events")).toHaveLength(1);
    expect(await liveRows(owner, "proposals")).toHaveLength(1);

    // The draft proposal carries the prospect's selections.
    const proposalBefore = (await owner.run(async (ctx) =>
      ctx.db.get(converted.proposalId as never),
    )) as {
      clientId: string;
      eventDate: number | null;
      eventEndDate: number | null;
      guestCount: number;
      venueName: string | null;
      notes: string | null;
      eventId: string | null;
      status: string;
    };
    expect(proposalBefore.clientId).toBe(converted.clientId);
    expect(proposalBefore.eventDate).toBe(eventDate);
    expect(proposalBefore.eventEndDate).toBe(eventEnd);
    expect(proposalBefore.guestCount).toBe(75);
    expect(proposalBefore.venueName).toBe("Orchard Barn");
    expect(proposalBefore.notes).toContain("Wants a tasting first");
    expect(proposalBefore.notes).toContain(
      "Service style: Family-style buffet",
    );
    expect(proposalBefore.notes).toContain("Occasion: Retirement party");
    // The proposal points at the event the same conversion created (A1) —
    // accept will reuse it instead of booking a second event.
    expect(proposalBefore.eventId).toBe(converted.eventId);
    expect(proposalBefore.status).toBe("draft");

    // The conversion event already carries the typed date, times, headcount,
    // the venue snapshot, and the menu/dietary preferences — everything the
    // prospect typed, nothing retyped by staff.
    const eventRow = (await owner.run(async (ctx) =>
      ctx.db.get(converted.eventId as never),
    )) as {
      startsAt: number;
      endsAt: number;
      expectedHeadcount: number;
      venueName: string | null;
      venueAddress: string | null;
      serviceRequirements: string | null;
      operationalRequirements: string | null;
    };
    expect(eventRow.startsAt).toBe(eventDate);
    expect(eventRow.endsAt).toBe(eventEnd);
    expect(eventRow.expectedHeadcount).toBe(75);
    expect(eventRow.venueName).toBe("Orchard Barn");
    expect(eventRow.venueAddress).toBe("12 Quarry Lane");
    expect(eventRow.serviceRequirements).toBe("BBQ buffet, two mains");
    expect(eventRow.operationalRequirements).toBe("One gluten-free guest");

    // 4. Sales prices the menu in the draft window: two dish selections (one
    //    then removed — only live rows copy, AC-001's rule) and enhancements
    //    (two live, one withdrawn before send).
    await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_createViaSelect,
      {
        proposalId: converted.proposalId,
        menuId: menu.docId,
        dishId: dishA.docId,
        quantityServings: 75,
        course: "main",
      },
    );
    const removedSelection = (await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_createViaSelect,
      {
        proposalId: converted.proposalId,
        menuId: menu.docId,
        dishId: dishB.docId,
        quantityServings: 40,
        course: "side",
      },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalDishSelection_remove,
      { docId: removedSelection.docId },
    );
    await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_createViaOffer,
      {
        proposalId: converted.proposalId,
        name: "Late-night snack board",
        price: 250,
        description: "Served at 22:00",
      },
    );
    await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_createViaOffer,
      { proposalId: converted.proposalId, name: "Valet parking", price: 400 },
    );
    const withdrawnEnhancement = (await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_createViaOffer,
      { proposalId: converted.proposalId, name: "Dry ice display", price: 99 },
    )) as { docId: string };
    await proof.executeCommand(
      owner,
      api.mutations.ProposalEnhancement_withdraw,
      { docId: withdrawnEnhancement.docId },
    );

    // 5. Send through the UI path (send + revision capture commit in one
    //    transaction — revision 1 is what the client accepts), the client
    //    views it, and accepts. eventId is already set, so accept keeps it
    //    and keys the ProposalAccepted menu cascade against that event.
    await proof.executeCommand(
      owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: converted.proposalId },
    );
    await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
      docId: converted.proposalId,
    });
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: converted.proposalId,
    });

    // 6. The booked event — one submission, one client, one lead, ONE event,
    //    one proposal, and nothing retyped anywhere on the journey.
    const proposalAfter = (await owner.run(async (ctx) =>
      ctx.db.get(converted.proposalId as never),
    )) as { status: string; eventId: string | null };
    expect(proposalAfter.status).toBe("accepted");
    expect(proposalAfter.eventId).toBe(converted.eventId);
    expect(await liveRows(owner, "events")).toHaveLength(1);
    expect(await liveRows(owner, "proposals")).toHaveLength(1);

    // Copied menu servings: only the live selection copied, servings
    // unchanged (the removed side never reached the event).
    const eventDishes = (
      await owner.run(async (ctx) => ctx.db.query("eventDishes").collect())
    ).filter(
      (row) =>
        (row as { eventId?: string }).eventId === converted.eventId &&
        (row as { deletedAt?: number | null }).deletedAt == null,
    );
    expect(eventDishes).toHaveLength(1);
    expect((eventDishes[0] as { dishId?: string }).dishId).toBe(dishA.docId);
    expect(
      (eventDishes[0] as { quantityServings?: number }).quantityServings,
    ).toBe(75);
    expect((eventDishes[0] as { course?: string }).course).toBe("main");

    // Accepted enhancements stay reachable from the event — the exact read
    // path the event overview card walks (C3/C4).
    const proposalsFromEvent = (await owner.query(
      api.queries.listProposalByEventId,
      { eventId: converted.eventId },
    )) as Array<{ _id: string }>;
    expect(proposalsFromEvent.map((row) => row._id)).toEqual([
      converted.proposalId,
    ]);
    const enhancements = (await owner.query(
      api.queries.listProposalEnhancementByProposalId,
      { proposalId: converted.proposalId },
    )) as Array<{
      _id: string;
      name: string;
      removedAt: number | null;
    }>;
    expect(
      enhancements
        .filter((row) => row.removedAt == null)
        .map((row) => row.name)
        .sort(),
    ).toEqual(["Late-night snack board", "Valet parking"]);
    expect(enhancements.map((row) => row._id)).not.toContain(
      withdrawnEnhancement.docId,
    );

    // The accepted revision the event-side card shows (revision 1 was
    // captured at send).
    const revisions = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: converted.proposalId },
    )) as Array<{ revisionNumber: number }>;
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revisionNumber).toBe(1);

    // The submission is completed with every record id checkpointed — the
    // queue's one-click links (A7) resolve for this journey.
    const submissionAfter = (await owner.run(async (ctx) =>
      ctx.db.get(submitted.submissionId),
    )) as {
      status: string;
      clientId: string | null;
      leadId: string | null;
      eventId: string | null;
      proposalId: string | null;
    };
    expect(submissionAfter.status).toBe("completed");
    expect(submissionAfter.clientId).toBe(converted.clientId);
    expect(submissionAfter.leadId).toBe(converted.leadId);
    expect(submissionAfter.eventId).toBe(converted.eventId);
    expect(submissionAfter.proposalId).toBe(converted.proposalId);
  });
});
