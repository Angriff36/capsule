/**
 * Runtime proof (AC-323, CF-8-done): one venue record feeds event creation,
 * the proposal's venue copy, a copied layout, the event-day sheet, pack-rule
 * facts and a Venue Sales report filtered to that venue - nobody types the
 * venue's facts twice.
 */
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { eventPlanEngagementFormMapper } from "../../src/features/events/EventPlanEngagementFormMapper";
import {
  DAY,
  harness,
  M,
  readDoc,
  rolesFor,
  run,
} from "./venue-layout.runtime.helpers";

const iso = (ms: number) => new Date(ms).toISOString();

describe("runtime proof: one venue record flows everywhere without re-entry", () => {
  it("event, proposal, layout, day sheet and venue revenue report all read the venue", async () => {
    const proof = harness();
    const tenantId = "tenant-ac323-flow";
    const roles = rolesFor(proof, tenantId);
    await proof.seedEntity(roles.owner, "people", {
      tenantId,
      givenName: "Val",
      familyName: "Owner",
      email: `owner-${tenantId}@example.com`,
      role: "owner",
      employmentType: "full_time",
      status: "active",
      authSubjectId: `owner-${tenantId}`,
      version: 1,
    });

    // The venue is entered once.
    const venue = await run(proof, roles.events, M.Venue_createViaRegister, {
      name: "Orchard Barn",
      venueType: "outdoor",
      capacity: 200,
      addressLine1: "4 Mill Rd",
      city: "Hudson",
      region: "NY",
      hasStairs: true,
      loadInInstructions: "Side barn door",
    });
    await run(proof, roles.events, M.Venue_setSiteFacts, {
      docId: venue.docId,
      seatedCapacity: 140,
      hasOven: false,
      loadInFrom: "08:00",
      loadOutBy: "23:00",
    });
    const otherVenue = await run(
      proof,
      roles.events,
      M.Venue_createViaRegister,
      {
        name: "City Loft",
        venueType: "banquet_hall",
        capacity: 80,
      },
    );
    const venueDoc = (await roles.events.query(api.queries.getVenue, {
      id: venue.docId as never,
    })) as Doc<"venues">;

    // 1. Event creation: the create form fills name, address and capacity
    //    from the picked venue.
    const client = await run(proof, roles.sales, M.Client_createViaRegister, {
      clientType: "company",
      companyName: "Flow client",
    });
    const startsAt = Date.now() + 30 * DAY;
    const args = eventPlanEngagementFormMapper.toCommandArgs({
      clientId: client.docId,
      client: { name: "Flow client" },
      venueId: venue.docId,
      venue: venueDoc,
      title: "Orchard wedding",
      eventTypeRaw: "wedding",
      occasionId: "",
      serviceStyleId: "",
      salespersonId: "",
      referralSourceId: "",
      startsAtRaw: iso(startsAt),
      endsAtRaw: iso(startsAt + 5 * 60 * 60 * 1000),
      expectedHeadcountRaw: "120",
      primaryContactName: "Robin Bride",
      primaryContactEmail: "",
      primaryContactPhone: "",
      budgetAmountRaw: "8000",
      quotedPriceRaw: "9000",
      accessibilityNeedsRaw: "",
      serviceRequirements: "",
      operationalRequirements: "",
    });
    const event = await run(
      proof,
      roles.sales,
      M.Event_createViaPlanEngagement,
      args,
    );
    const eventRow = await readDoc<{
      venueId: string;
      venueName: string;
      venueAddress: string;
      venueCapacity: number;
    }>(roles.events, event.docId);
    expect(eventRow).toMatchObject({
      venueId: venue.docId,
      venueName: "Orchard Barn",
      venueCapacity: 200,
    });
    expect(eventRow.venueAddress).toContain("4 Mill Rd");

    // 2. Proposal: the sent revision carries the venue's facts.
    const proposal = await run(proof, roles.owner, M.Proposal_createViaDraft, {
      clientId: client.docId,
      title: "Orchard wedding",
      subtotal: 9000,
      taxAmount: 0,
      discountAmount: 0,
      total: 9000,
      guestCount: 120,
      eventId: event.docId,
    });
    await run(proof, roles.owner, M.ProposalLineItem_createViaAddLine, {
      proposalId: proposal.docId,
      description: "Family style dinner",
      pricingBasis: "flat",
      unitPrice: 9000,
      amount: 9000,
    });
    await proof.executeCommand(
      roles.owner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal.docId },
    );
    const [revision] = (await roles.owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: proposal.docId },
    )) as Array<{ snapshot: string }>;
    expect(JSON.parse(revision.snapshot).venue).toMatchObject({
      name: "Orchard Barn",
      seatedCapacity: 140,
      hasOven: false,
      hasStairs: true,
      loadInFrom: "08:00",
      loadOutBy: "23:00",
    });

    // 3. Layout: the venue's template is copied into the event.
    const template = await run(
      proof,
      roles.events,
      M.VenueLayoutTemplate_createViaDefine,
      {
        venueId: venue.docId,
        name: "Barn standard",
        sections: JSON.stringify([
          { type: "Buffet", instructions: "Under the loft", sortOrder: 0 },
        ]),
      },
    );
    await proof.executeCommand(
      roles.events,
      (api.lib as any).safeMaterialization.applyLayoutTemplate,
      {
        eventId: event.docId,
        operationKey: "flow-layout",
        baseSortOrder: 0,
        sections: [],
        templateId: template.docId,
      },
    );
    const layout = (
      (await roles.events.query(
        api.queries.listEventLayoutSection,
        {},
      )) as Array<{
        eventId: string;
        type: string;
        instructions?: string;
        sourceTemplateId?: string;
      }>
    ).filter((row) => row.eventId === event.docId);
    expect(layout).toEqual([
      expect.objectContaining({
        type: "Buffet",
        instructions: "Under the loft",
        sourceTemplateId: template.docId,
      }),
    ]);

    // 4. Day sheet (crew): the venue facts reach the event-day briefing.
    const briefing = (await roles.events.query(
      api.eventDayBriefing.getBriefing,
      { eventId: event.docId },
    )) as { venue: Record<string, unknown> | null };
    expect(briefing.venue).toMatchObject({
      hasOven: false,
      hasStairs: true,
      loadInFrom: "08:00",
      loadInInstructions: "Side barn door",
    });

    // 5. Revenue: Venue Sales filtered to this venue lists this event only.
    const loftEvent = await run(
      proof,
      roles.sales,
      M.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Loft party",
        eventType: "party",
        startsAt,
        endsAt: startsAt + 3 * 60 * 60 * 1000,
        expectedHeadcount: 40,
        primaryContactName: "Robin Bride",
        budgetAmount: 900,
        quotedPrice: 1000,
        venueId: otherVenue.docId,
        venueName: "City Loft",
      },
    );
    await roles.owner.run(async (ctx) => {
      const base = {
        tenantId,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        status: "sent",
        issuedAt: startsAt,
        taxAmount: 0,
        discountAmount: 0,
        amountPaid: 0,
        depositAmount: 0,
        paymentTermsDays: 30,
        lineItems: [],
      };
      await ctx.db.insert(
        "invoices" as never,
        {
          ...base,
          clientId: client.docId,
          eventId: event.docId,
          invoiceNumber: "INV-ORCHARD",
          subtotal: 9000,
          total: 9000,
          amountDue: 9000,
        } as never,
      );
      await ctx.db.insert(
        "invoices" as never,
        {
          ...base,
          clientId: client.docId,
          eventId: loftEvent.docId,
          invoiceNumber: "INV-LOFT",
          subtotal: 1000,
          total: 1000,
          amountDue: 1000,
        } as never,
      );
    });
    const venueSales = async (parameters: Record<string, unknown>) =>
      (
        (await roles.owner.query(api.tppReports.financial.run, {
          reportId: "venue-sales",
          parameters,
        })) as { rows: Array<{ values: Record<string, unknown> }> }
      ).rows.map((row) => [
        row.values.event,
        row.values.venue,
        row.values.revenue,
      ]);
    expect(await venueSales({ venueId: venue.docId })).toEqual([
      ["Orchard wedding", "Orchard Barn", 9000],
    ]);
    expect((await venueSales({})).length).toBe(2);
  });
});
