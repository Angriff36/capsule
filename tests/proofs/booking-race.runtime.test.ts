/**
 * Runtime proof (AC-436 / backend §23 item 6 / §20.4): true concurrent
 * booking, acceptance, and revision capture create no duplicates. Two
 * overlapping in-flight calls (Promise.allSettled, neither awaited before the
 * other starts) produce exactly one Event, one ProposalAccepted ledger row,
 * and one proposal revision. Sequential replay is already proven in
 * proposal-event-booking.runtime.test.ts; this file covers the in-flight race.
 *
 * Harness, seed, and booking flow follow no-premature-effects.runtime.test.ts
 * and field-staff-booking-read.runtime.test.ts; the ledger read follows
 * signature-acceptance-equivalence.runtime.test.ts; the overlapping-call
 * shape follows cutover-provider-readiness.runtime.test.ts.
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

/** Client + published menu + one dish, seeded as an owner. */
async function seedCatalog(
  proof: Proof,
  owner: Actor,
  tenantId: string,
): Promise<Seed> {
  const client = (await proof.executeCommand(
    owner,
    M.Client_createViaRegister,
    { clientType: "company", companyName: `Race client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Race tasting menu",
  })) as { docId: string };
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  const dish = (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
    name: "Cedar salmon",
    portionSize: 1,
    portionUnit: "serving",
  })) as { docId: string };
  return { clientId: client.docId, menuId: menu.docId, dishId: dish.docId };
}

/** Draft → select the dish (status stays draft). */
async function draftProposal(
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
      eventDate: Date.parse("2026-10-01T18:00:00Z"),
      eventEndDate: Date.parse("2026-10-01T23:00:00Z"),
      guestCount: 80,
      venueName: "Riverside Hall",
    },
  )) as { docId: string };
  await proof.executeCommand(owner, M.ProposalDishSelection_createViaSelect, {
    proposalId: proposal.docId,
    menuId: seed.menuId,
    dishId: seed.dishId,
    quantityServings: 80,
    course: "main",
  });
  return proposal.docId;
}

async function sendAndView(proof: Proof, owner: Actor, proposalId: string) {
  await proof.executeCommand(owner, M.Proposal_send, { docId: proposalId });
  await proof.executeCommand(owner, M.Proposal_markViewed, {
    docId: proposalId,
  });
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

describe("true concurrent booking / accept / revision race (AC-436)", () => {
  it("two concurrent createEventFromAcceptedProposal calls create exactly one event", async () => {
    const proof = harness();
    const tenantId = "tenant-booking-race";
    const owner = proof.asRole({ subject: "o-br", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await draftProposal(
      proof,
      owner,
      seed,
      "Concurrent booking race",
    );
    await sendAndView(proof, owner, proposalId);
    await proof.executeCommand(owner, M.Proposal_accept, {
      docId: proposalId,
    });

    const bookArgs = {
      proposalId,
      event: { clientId: seed.clientId, ...EVENT_ARGS },
    };
    // Both in flight together — the first is NOT awaited before the second
    // starts (that sequential replay is already covered elsewhere).
    const settled = await Promise.allSettled([
      owner.mutation(
        api.lib.proposalEventCreation.createEventFromAcceptedProposal,
        bookArgs,
      ),
      owner.mutation(
        api.lib.proposalEventCreation.createEventFromAcceptedProposal,
        bookArgs,
      ),
    ]);

    const liveEvents = await liveTenantRows(owner, "events", tenantId);
    expect(liveEvents).toHaveLength(1);
    const eventId = String((liveEvents[0] as { _id: unknown })._id);

    const fulfilledIds = settled
      .filter(
        (r): r is PromiseFulfilledResult<{ docId: string }> =>
          r.status === "fulfilled",
      )
      .map((r) => String(r.value.docId));
    for (const docId of fulfilledIds) {
      expect(docId).toBe(eventId);
    }

    // A rejected loser (OCC retry surfaced as an error) must replay to the
    // SAME event on retry, never create a second one.
    if (settled.some((r) => r.status === "rejected")) {
      const retried = (await owner.mutation(
        api.lib.proposalEventCreation.createEventFromAcceptedProposal,
        bookArgs,
      )) as { docId: string };
      expect(String(retried.docId)).toBe(eventId);
      expect(await liveTenantRows(owner, "events", tenantId)).toHaveLength(1);
    }

    // The proposal is linked to that one event, with exactly one live dish.
    const proposal = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { eventId?: unknown };
    expect(String(proposal.eventId)).toBe(eventId);
    const eventDishes = (await owner.run(async (ctx) =>
      ctx.db.query("eventDishes").collect(),
    )) as Array<Record<string, unknown> & { deletedAt?: number | null }>;
    const liveDishes = eventDishes.filter(
      (row) =>
        row.deletedAt == null &&
        String(row.eventId) === eventId &&
        row.tenantId === tenantId,
    );
    expect(liveDishes).toHaveLength(1);
  });

  it("two concurrent Proposal_accept calls create exactly one acceptance", async () => {
    const proof = harness();
    const tenantId = "tenant-accept-race";
    const owner = proof.asRole({ subject: "o-ar", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await draftProposal(
      proof,
      owner,
      seed,
      "Concurrent accept race",
    );
    await sendAndView(proof, owner, proposalId);

    await Promise.allSettled([
      owner.mutation(M.Proposal_accept, { docId: proposalId }),
      owner.mutation(M.Proposal_accept, { docId: proposalId }),
    ]);

    const proposal = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { status: string };
    expect(proposal.status).toBe("accepted");

    const ledger = (await owner.run(async (ctx) =>
      ctx.db.query("manifestEvents").collect(),
    )) as Array<{ type: string; entityId: string }>;
    const acceptances = ledger.filter(
      (row) => row.type === "ProposalAccepted" && row.entityId === proposalId,
    );
    expect(acceptances).toHaveLength(1);
  });

  it("two concurrent sendProposalWithRevisionCapture calls create exactly one revision", async () => {
    const proof = harness();
    const tenantId = "tenant-revision-race";
    const owner = proof.asRole({ subject: "o-rr", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await draftProposal(
      proof,
      owner,
      seed,
      "Concurrent send race",
    );

    await Promise.allSettled([
      owner.mutation(api.lib.proposalRevision.sendProposalWithRevisionCapture, {
        docId: proposalId,
      }),
      owner.mutation(api.lib.proposalRevision.sendProposalWithRevisionCapture, {
        docId: proposalId,
      }),
    ]);

    const proposal = (await owner.run(async (ctx) =>
      ctx.db.get(proposalId as never),
    )) as { status: string };
    expect(proposal.status).toBe("sent");

    const revisions = await liveTenantRows(
      owner,
      "proposalRevisions",
      tenantId,
    );
    const forProposal = revisions.filter(
      (row) => String(row.proposalId) === proposalId,
    );
    expect(forProposal).toHaveLength(1);
  });
});
