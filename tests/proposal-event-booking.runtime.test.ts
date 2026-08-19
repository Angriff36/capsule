/**
 * Issue #141 / PR #157 review: booking an accepted proposal into a new event.
 *
 * Exercises convex/lib/proposalEventCreation.createEventFromAcceptedProposal
 * (authored seam) and the Proposal.linkEvent domain command + its
 * ProposalEventLinked → EventDish.confirmFromProposal cascade
 * (src/sales/proposal.manifest, src/sales/proposal-dish-selection.manifest):
 *   - accepted proposal → create event → menu selections copy (removed ones don't)
 *   - sales_staff can complete the whole flow (policy regression)
 *   - already-linked proposals reject, at the seam AND the domain command
 *   - a rejected double-booking creates no duplicate event
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./proofs/convex-test-modules";

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

    // The domain command itself also refuses to re-link (guard eventId == null).
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_linkEvent, {
        docId: proposalId,
        eventId: booked.docId,
      }),
    ).rejects.toThrow();

    // The original link and menu survive untouched.
    const linked = await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    );
    expect((linked as { eventId?: string }).eventId).toBe(booked.docId);
    expect(await liveEventDishes(owner, booked.docId)).toHaveLength(1);
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
