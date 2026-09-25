/**
 * Runtime proof (PL-BOOKING AC-410): canonical booking resolves the
 * proposal's venue NAME against saved venues when the caller omits
 * `event.venueId` — a unique live match links that venue, an ambiguous name
 * books NOTHING (never a silent first match), a caller-picked id wins, and
 * zero matches books with the proposal's text and no venueId.
 *
 * Harness, seed, and booking flow follow booking-race.runtime.test.ts; the
 * venue seed follows lifecycle-venue-snapshot-stability.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

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

type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

type Seed = { clientId: string; menuId: string; dishId: string };

const EVENT_DATE = Date.parse("2026-11-05T18:00:00Z");

/** Client + published menu + one dish, seeded as an owner. */
async function seedCatalog(
  proof: Proof,
  owner: Actor,
  tenantId: string,
): Promise<Seed> {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `Identity client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Identity tasting menu",
  })) as { docId: string };
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
    name: "Maple duck",
    portionSize: 1,
    portionUnit: "serving",
  })) as { docId: string };
  return { clientId: client.docId, menuId: menu.docId, dishId: dish.docId };
}

/** Draft ("Garden Hall") with one dish → send → view → accept. */
async function acceptedProposal(
  proof: Proof,
  owner: Actor,
  seed: Seed,
  title: string,
): Promise<string> {
  const proposal = (await proof.executeCommand(
    owner,
    M.Proposal_createViaDraft,
    {
      clientId: seed.clientId,
      title,
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
      eventType: "gala dinner",
      eventDate: EVENT_DATE,
      eventEndDate: Date.parse("2026-11-05T23:00:00Z"),
      guestCount: 80,
      venueName: "Garden Hall",
    },
  )) as { docId: string };
  await proof.executeCommand(owner, M.ProposalDishSelection_createViaSelect, {
    proposalId: proposal.docId,
    menuId: seed.menuId,
    dishId: seed.dishId,
    quantityServings: 80,
    course: "main",
  });
  await proof.executeCommand(owner, M.Proposal_send, { docId: proposal.docId });
  await proof.executeCommand(owner, M.Proposal_markViewed, {
    docId: proposal.docId,
  });
  await proof.executeCommand(owner, M.Proposal_accept, {
    docId: proposal.docId,
  });
  return proposal.docId;
}

const EVENT_ARGS = {
  title: "Autumn gala",
  eventType: "gala dinner",
  startsAt: EVENT_DATE,
  endsAt: Date.parse("2026-11-05T23:00:00Z"),
  expectedHeadcount: 80,
  primaryContactName: "Casey Contact",
  budgetAmount: 0,
  quotedPrice: 1300,
  venueName: "Garden Hall",
  // no venueId — the caller leaves venue identity to the proposal name
};

/** Saved venue seeded as the owner (same shape as the snapshot proof). */
async function registerVenue(
  proof: Proof,
  owner: Actor,
  name: string,
  addressLine1: string,
): Promise<string> {
  const venue = (await proof.executeCommand(owner, M.Venue_createViaRegister, {
    name,
    venueType: "other",
    capacity: 80,
    addressLine1,
  })) as { docId: string };
  return venue.docId;
}

/** The canonical booking call (venueId optional). */
async function book(
  seed: Seed,
  owner: Actor,
  proposalId: string,
  venueId?: string,
): Promise<{ docId: string }> {
  const result = (await owner.mutation(
    api.lib.proposalEventCreation.createEventFromAcceptedProposal,
    {
      proposalId,
      event: { clientId: seed.clientId, ...EVENT_ARGS, venueId },
    },
  )) as { docId: string };
  return result;
}

/** Live (deletedAt absent/null) tenant rows in one table. */
async function liveTenantRows(
  actor: Actor,
  table: string,
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query(table as never).collect(),
  )) as Array<Record<string, unknown>>;
  return rows.filter(
    (row) =>
      (row as { deletedAt?: number | null }).deletedAt == null &&
      row.tenantId === tenantId,
  );
}

async function getProposal(actor: Actor, proposalId: string) {
  return (await actor.run(async (ctx) => ctx.db.get(proposalId as never))) as {
    eventId?: unknown;
  };
}

describe("canonical booking venue identity (AC-410)", () => {
  it("links the unique saved venue when booking omits venueId", async () => {
    const proof = harness();
    const tenantId = "tenant-booking-identity-unique";
    const owner = proof.asRole({ subject: "o-biu", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const venueId = await registerVenue(
      proof,
      owner,
      "Garden Hall",
      "100 Oak St",
    );
    const proposalId = await acceptedProposal(
      proof,
      owner,
      seed,
      "Unique venue booking",
    );

    const result = await book(seed, owner, proposalId);

    const liveEvents = await liveTenantRows(owner, "events", tenantId);
    expect(liveEvents).toHaveLength(1);
    expect(String(result.docId)).toBe(String(liveEvents[0]._id));
    const event = liveEvents[0];
    expect(String(event.venueId)).toBe(venueId);
    expect(event.venueName).toBe("Garden Hall");
    expect(event.expectedHeadcount).toBe(80);
    expect(event.startsAt).toBe(EVENT_DATE);
    expect(String(event.clientId)).toBe(seed.clientId);
    const proposal = await getProposal(owner, proposalId);
    expect(String(proposal.eventId)).toBe(String(result.docId));
    const liveDishes = (
      await liveTenantRows(owner, "eventDishes", tenantId)
    ).filter((row) => String(row.eventId) === String(result.docId));
    expect(liveDishes).toHaveLength(1);
  });

  it("refuses to pick when two saved venues share the proposal name", async () => {
    const proof = harness();
    const tenantId = "tenant-booking-identity-ambiguous";
    const owner = proof.asRole({ subject: "o-bia", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    await registerVenue(proof, owner, "Garden Hall", "East dock");
    await registerVenue(proof, owner, "Garden Hall", "West dock");
    const proposalId = await acceptedProposal(
      proof,
      owner,
      seed,
      "Ambiguous venue booking",
    );

    await expect(book(seed, owner, proposalId)).rejects.toThrow(
      /Several saved venues share this name/i,
    );

    expect(await liveTenantRows(owner, "events", tenantId)).toHaveLength(0);
    const proposal = await getProposal(owner, proposalId);
    expect(proposal.eventId ?? null).toBeNull();
    expect(await liveTenantRows(owner, "eventDishes", tenantId)).toHaveLength(
      0,
    );
  });

  it("books the venue the operator picked when two saved venues share the name", async () => {
    const proof = harness();
    const tenantId = "tenant-booking-identity-picked";
    const owner = proof.asRole({ subject: "o-bip", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    await registerVenue(proof, owner, "Garden Hall", "East dock");
    const westId = await registerVenue(
      proof,
      owner,
      "Garden Hall",
      "West dock",
    );
    const proposalId = await acceptedProposal(
      proof,
      owner,
      seed,
      "Picked venue booking",
    );

    const result = await book(seed, owner, proposalId, westId);

    const liveEvents = await liveTenantRows(owner, "events", tenantId);
    expect(liveEvents).toHaveLength(1);
    expect(String(liveEvents[0].venueId)).toBe(westId);
    expect(String(liveEvents[0]._id)).toBe(String(result.docId));
    const proposal = await getProposal(owner, proposalId);
    expect(String(proposal.eventId)).toBe(String(result.docId));
  });

  it("seeds venue name without a venueId when no saved venue matches", async () => {
    const proof = harness();
    const tenantId = "tenant-booking-identity-none";
    const owner = proof.asRole({ subject: "o-bin", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    await registerVenue(proof, owner, "Other Hall", "200 Elm St");
    const proposalId = await acceptedProposal(
      proof,
      owner,
      seed,
      "No venue match booking",
    );

    const result = await book(seed, owner, proposalId);

    const liveEvents = await liveTenantRows(owner, "events", tenantId);
    expect(liveEvents).toHaveLength(1);
    const event = liveEvents[0];
    expect(event.venueId ?? null).toBeNull();
    expect(event.venueName).toBe("Garden Hall");
    expect(String(result.docId)).toBe(String(event._id));
    const proposal = await getProposal(owner, proposalId);
    expect(String(proposal.eventId)).toBe(String(result.docId));
  });
});
