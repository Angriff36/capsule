/**
 * AC-100 / PR06-07: a field employee (event_staff — staffAccess + eventAccess,
 * NO salesAccess) reads the booked event's operational facts (guest count,
 * style, venue, menu, timeline, enhancement names via
 * quoteBuilder.getEventBookingDetails, which redacts prices when getProposal
 * is denied) and is denied proposal totals. Same harness and booking flow as
 * proposal-event-booking.runtime.test.ts, trimmed to the field read paths.
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

type Booking = {
  canOpenProposal: boolean;
  enhancements: Array<{ name: string; price: number | null }>;
} | null;

/** Client + published menu + one dish, seeded as an owner. */
async function seedCatalog(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  tenantId: string,
) {
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `Field read client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(
    owner,
    api.mutations.Menu_createViaDraft,
    { name: "Field tasting menu" },
  )) as { docId: string };
  await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
    docId: menu.docId,
  });
  const dish = (await proof.executeCommand(
    owner,
    api.mutations.Dish_createViaIntroduce,
    { name: "Cedar salmon", portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  return { clientId: client.docId, menuId: menu.docId, dishId: dish.docId };
}

/** Draft → select the dish → offer an enhancement → send → viewed → accept. */
async function acceptedProposalWithMenu(
  proof: ReturnType<typeof harness>,
  actor: Actor,
  seed: Awaited<ReturnType<typeof seedCatalog>>,
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
      dishId: seed.dishId,
      quantityServings: 80,
      course: "main",
    },
  );
  await proof.executeCommand(
    actor,
    api.mutations.ProposalEnhancement_createViaOffer,
    { proposalId: proposal.docId, name: "Valet parking", price: 400 },
  );
  await proof.executeCommand(actor, api.mutations.Proposal_send, {
    docId: proposal.docId,
  });
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

async function bookEvent(
  proof: ReturnType<typeof harness>,
  owner: Actor,
  seed: Awaited<ReturnType<typeof seedCatalog>>,
  proposalId: string,
  serviceStyleId?: string,
) {
  return (await proof.executeCommand(
    owner,
    api.lib.proposalEventCreation.createEventFromAcceptedProposal,
    {
      proposalId,
      event: {
        clientId: seed.clientId,
        ...(serviceStyleId ? { serviceStyleId } : {}),
        ...EVENT_ARGS,
      },
    },
  )) as { docId: string };
}

describe("field staff booking-read (AC-100)", () => {
  it("event_staff reads guest count, style, venue, menu, timeline, and enhancement names", async () => {
    const tenantId = "tenant-field-read";
    const proof = harness();
    const owner = proof.asRole({ subject: "o-fr", role: "owner", tenantId });
    const staff = proof.asRole({
      subject: "field-fr",
      role: "event_staff",
      tenantId,
    });
    const seed = await seedCatalog(proof, owner, tenantId);
    const style = (await proof.executeCommand(
      owner,
      api.mutations.ServiceStyle_createViaRegister,
      {
        name: "Full Service",
        code: `FULL_SERVICE_${tenantId}`,
        sortOrder: 10,
      },
    )) as { docId: string };
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed);
    const booked = await bookEvent(proof, owner, seed, proposalId, style.docId);
    // Owner's operations manager schedules one day-of timeline row.
    const ev = proof.asRole({ subject: "e1", role: "event_manager", tenantId });
    await proof.executeCommand(
      ev,
      api.mutations.EventTimelineActivity_createViaSchedule,
      { eventId: booked.docId, name: "Guest arrival" },
    );
    const event = (await staff.query(api.queries.getEvent, {
      id: booked.docId,
    })) as {
      expectedHeadcount: number;
      venueName: string;
      serviceStyleId: string;
      serviceStyle: { name: string } | null;
    } | null;
    expect(event).not.toBeNull();
    expect(event?.expectedHeadcount).toBe(80);
    expect(event?.venueName).toBe("Riverside Hall");
    expect(event?.serviceStyleId).toBe(style.docId);
    expect(event?.serviceStyle?.name).toBe("Full Service");
    const dishes = (await staff.query(api.queries.listEventDishByEventId, {
      eventId: booked.docId,
    })) as Array<{
      quantityServings: number;
      deletedAt: number | null;
      removedAt: number | null;
    }>;
    const live = dishes.filter(
      (row) => row.deletedAt == null && row.removedAt == null,
    );
    expect(live).toHaveLength(1);
    expect(live[0]?.quantityServings).toBe(80);
    const timeline = (await staff.query(
      api.queries.listEventTimelineActivityByEventId,
      { eventId: booked.docId },
    )) as Array<{ name: string }>;
    expect(timeline.map((row) => row.name)).toContain("Guest arrival");
    // Enhancements: names reachable, prices redacted, proposal locked.
    const booking = (await staff.query(
      api.quoteBuilder.getEventBookingDetails,
      {
        eventId: booked.docId,
      },
    )) as Booking;
    expect(booking?.canOpenProposal).toBe(false);
    expect(booking?.enhancements.map((row) => row.name)).toEqual([
      "Valet parking",
    ]);
    expect(booking?.enhancements.every((row) => row.price === null)).toBe(true);
  });

  it("event_staff is denied proposal totals; sales_staff still reads them", async () => {
    const tenantId = "tenant-field-deny";
    const proof = harness();
    const owner = proof.asRole({ subject: "o-fd", role: "owner", tenantId });
    const staff = proof.asRole({
      subject: "field-fd",
      role: "event_staff",
      tenantId,
    });
    const sl = proof.asRole({ subject: "s1", role: "sales_staff", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await acceptedProposalWithMenu(proof, owner, seed);
    const booked = await bookEvent(proof, owner, seed, proposalId);
    // Field is denied the proposal: the generated read returns null (no
    // throw), so no total ever reaches the field actor.
    expect(
      await staff.query(api.queries.getProposal, { id: proposalId }),
    ).toBeNull();
    expect(
      await staff.query(api.queries.listProposalByEventId, {
        eventId: booked.docId,
      }),
    ).toEqual([]);
    // Sales still reads the full proposal, including the total.
    const salesProposal = (await sl.query(api.queries.getProposal, {
      id: proposalId,
    })) as { total: number } | null;
    expect(salesProposal?.total).toBe(1300);
    const salesBooking = (await sl.query(
      api.quoteBuilder.getEventBookingDetails,
      { eventId: booked.docId },
    )) as Booking;
    expect(salesBooking?.canOpenProposal).toBe(true);
    const valet = salesBooking?.enhancements.find(
      (row) => row.name === "Valet parking",
    );
    expect(valet?.price).toBe(400);
    // Cross-tenant outsider gets null booking details (tenant isolation).
    const out = proof.asRole({
      subject: "o2",
      role: "owner",
      tenantId: "ot",
    });
    expect(
      await out.query(api.quoteBuilder.getEventBookingDetails, {
        eventId: booked.docId,
      }),
    ).toBeNull();
  });
});
