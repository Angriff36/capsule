/**
 * Runtime proof (AC-415 / AC-437): no premature downstream effects before an
 * explicit approve. Drafting, sending, viewing, accepting, and booking a
 * proposal create zero invoices, messages, orders, reservations, production
 * work, notifications, or schedules. Materialization stays EventApproved-gated:
 * the control walks to approved after booking and sees exactly one draft
 * invoice appear.
 *
 * Harness and booking flow follow field-staff-booking-read.runtime.test.ts;
 * row counting and the approve control follow
 * lifecycle-quote-zero-downstream.runtime.test.ts.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;

const TABLES = [
  "invoices",
  "messages",
  "staffMessages",
  "clientCommunications",
  "vendorOrders",
  "inventoryReservations",
  "equipmentReservations",
  "productionBatches",
  "prepTasks",
  "deliveries",
  "weeklyScheduleNotices",
  "purchaseNeeds",
  "externalRecordLinks",
] as const;

/** Tables that can carry an eventId and must also be 0 scoped to the Event. */
const EVENT_SCOPED = new Set([
  "invoices",
  "vendorOrders",
  "inventoryReservations",
  "equipmentReservations",
  "productionBatches",
  "prepTasks",
  "deliveries",
  "purchaseNeeds",
  "staffMessages",
  "clientCommunications",
  "weeklyScheduleNotices",
]);

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
    { clientType: "company", companyName: `Premature client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Premature tasting menu",
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

/** Live (deletedAt == null) tenant rows in one table. */
async function liveTenantRows(
  reader: Actor,
  table: (typeof TABLES)[number],
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = (await reader.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Array<Record<string, unknown>>;
  return rows.filter(
    (row) =>
      (row as { deletedAt?: number | null }).deletedAt == null &&
      row.tenantId === tenantId,
  );
}

function rowsForEvent(
  rows: Array<Record<string, unknown>>,
  eventId: string,
): Array<Record<string, unknown>> {
  return rows.filter(
    (row) => (row as { eventId?: string }).eventId === eventId,
  );
}

describe("no premature downstream effects from proposal draft, view, accept, or booking (AC-415 / AC-437)", () => {
  it("draft and view of an unbooked proposal create no invoice, order, reservation, notification, or production", async () => {
    const proof = harness();
    const tenantId = "tenant-premature-draft-view";
    const owner = proof.asRole({ subject: "o-pdv", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await draftProposal(
      proof,
      owner,
      seed,
      "Draft only, never accepted",
    );
    await proof.executeCommand(owner, M.Proposal_send, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, M.Proposal_markViewed, {
      docId: proposalId,
    });

    for (const table of TABLES) {
      expect(await liveTenantRows(owner, table, tenantId)).toHaveLength(0);
    }
  });

  it("accept and booking create no invoice, message, provider update, or staff notification", async () => {
    const proof = harness();
    const tenantId = "tenant-premature-accept-book";
    const owner = proof.asRole({ subject: "o-pab", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await draftProposal(
      proof,
      owner,
      seed,
      "Accepted and booked, never approved",
    );
    await proof.executeCommand(owner, M.Proposal_send, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, M.Proposal_markViewed, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, M.Proposal_accept, {
      docId: proposalId,
    });
    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: {
          clientId: seed.clientId,
          title: "Autumn gala",
          eventType: "gala dinner",
          startsAt: Date.parse("2026-10-01T18:00:00Z"),
          endsAt: Date.parse("2026-10-01T23:00:00Z"),
          expectedHeadcount: 80,
          primaryContactName: "Casey Contact",
          budgetAmount: 0,
          quotedPrice: 1300,
          venueName: "Riverside Hall",
        },
      },
    )) as { docId: string };

    for (const table of TABLES) {
      const rows = await liveTenantRows(owner, table, tenantId);
      expect(rows).toHaveLength(0);
      if (EVENT_SCOPED.has(table)) {
        expect(rowsForEvent(rows, booked.docId)).toHaveLength(0);
      }
    }

    // The booked Event exists, and the menu copy is the one allowed artifact.
    const event = (await owner.query(api.queries.getEvent, {
      id: booked.docId,
    })) as { docId: string } | null;
    expect(event).not.toBeNull();
    const eventDishes = (await owner.run(async (ctx) =>
      ctx.db.query("eventDishes").collect(),
    )) as Array<Record<string, unknown> & { deletedAt?: number | null }>;
    const liveDishes = rowsForEvent(
      eventDishes.filter((row) => row.deletedAt == null),
      booked.docId,
    );
    expect(liveDishes).toHaveLength(1);
  });

  it("approve after booking seeds one draft invoice (control)", async () => {
    const proof = harness();
    const tenantId = "tenant-premature-approve-control";
    const owner = proof.asRole({ subject: "o-pac", role: "owner", tenantId });
    const seed = await seedCatalog(proof, owner, tenantId);
    const proposalId = await draftProposal(
      proof,
      owner,
      seed,
      "Approved after booking",
    );
    await proof.executeCommand(owner, M.Proposal_send, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, M.Proposal_markViewed, {
      docId: proposalId,
    });
    await proof.executeCommand(owner, M.Proposal_accept, {
      docId: proposalId,
    });
    const booked = (await proof.executeCommand(
      owner,
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: {
          clientId: seed.clientId,
          title: "Autumn gala control",
          eventType: "gala dinner",
          startsAt: Date.parse("2026-10-01T18:00:00Z"),
          endsAt: Date.parse("2026-10-01T23:00:00Z"),
          expectedHeadcount: 80,
          primaryContactName: "Casey Contact",
          budgetAmount: 0,
          quotedPrice: 1300,
          venueName: "Riverside Hall",
        },
      },
    )) as { docId: string };

    // Use the Event's live version: booking may already have bumped it.
    const live = (await owner.run(async (ctx) =>
      ctx.db.get(booked.docId as never),
    )) as { version: number };
    await proof.executeCommand(owner, M.Event_submitForApproval, {
      docId: booked.docId,
      version: live.version,
    });
    await proof.executeCommand(owner, M.Event_approve, {
      docId: booked.docId,
      version: live.version + 1,
    });

    const invoices = rowsForEvent(
      await liveTenantRows(owner, "invoices", tenantId),
      booked.docId,
    );
    expect(invoices).toHaveLength(1);
    const invoice = invoices[0] as { status?: string; sentAt?: number | null };
    expect(invoice.status).toBe("draft");
    expect(invoice.sentAt == null).toBe(true);
  });
});
