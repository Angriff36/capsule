/**
 * Runtime proof (AC-239 remaining slice): duplicating an Event creates a
 * fresh planning Event that keeps the planning facts (who, when, where,
 * guests, money seed, live menu lines as NEW lines) and touches nothing
 * else — no invoices, payments, signatures, reservations, prep, archive
 * flags or stage timestamps — while the source Event stays exactly as it
 * was. AC-099: an approved source's invoice must never become the copy's
 * actual.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
const HEAD_COUNT = 40;
const QUOTED = 4500;
const BUDGET = 3000;
const M = api.mutations;
const duplicateEvent = api.lib.eventDuplicate.duplicateEvent;

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
type Role = ReturnType<Proof["asRole"]>;

function rolesFor(proof: Proof, tenantId: string) {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
    kitchen: proof.asRole({
      subject: `kitchen-${tenantId}`,
      role: "kitchen_manager",
      tenantId,
    }),
  };
}

async function createSourceEvent(
  proof: Proof,
  tenantId: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Duplicate proof client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "AC-239 source",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: HEAD_COUNT,
      primaryContactName: "Casey Duplicate",
      budgetAmount: BUDGET,
      quotedPrice: QUOTED,
      venueName: "Garden Hall",
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

async function addSourceDish(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const { events, kitchen } = rolesFor(proof, tenantId);
  const dish = (await proof.executeCommand(kitchen, M.Dish_createViaIntroduce, {
    name: `Garden salad ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "salad",
  })) as { docId: string };
  await proof.executeCommand(events, M.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: HEAD_COUNT,
    dishName: "Garden salad",
  });
}

type EventDoc = {
  _id: string;
  tenantId: string;
  clientId: string;
  title: string;
  stage: string;
  archivedAt: number | null;
  quotedPrice: number | null;
  budgetAmount: number | null;
  expectedHeadcount: number | null;
  venueName: string | null;
  deletedAt: number | null;
};

/** Every live Event row for this tenant, read raw. */
async function liveEvents(actor: Role, tenantId: string): Promise<EventDoc[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("events").collect(),
  )) as EventDoc[];
  return rows.filter(
    (row) => row.tenantId === tenantId && row.deletedAt == null,
  );
}

type DishRow = {
  _id: string;
  eventId: string;
  dishId: string;
  quantityServings: number;
  dishName: string | null;
};

async function eventDishes(actor: Role, eventId: string): Promise<DishRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("eventDishes").collect(),
  )) as DishRow[];
  return rows.filter((row) => row.eventId === eventId);
}

async function invoicesFor(actor: Role, eventId: string): Promise<unknown[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("invoices").collect(),
  )) as Array<{ eventId: string | null }>;
  return rows.filter((row) => row.eventId === eventId);
}

describe("event duplicate (AC-239)", () => {
  it("duplicates a planning event and its menu without touching the source", async () => {
    const proof = harness();
    const tenantId = "tenant-ac239-duplicate";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createSourceEvent(proof, tenantId);
    await addSourceDish(proof, tenantId, eventId);
    const sourceDishBefore = (await eventDishes(events, eventId))[0]!;

    const result = (await proof.executeCommand(
      events,
      duplicateEvent as never,
      { sourceEventId: eventId },
    )) as { docId: string; dishCount: number };
    expect(result.dishCount).toBe(1);

    const live = await liveEvents(events, tenantId);
    expect(live).toHaveLength(2);
    const copy = live.find((row) => row._id !== eventId)!;
    const source = live.find((row) => row._id === eventId)!;
    expect(copy.title).toBe("AC-239 source (copy)");
    expect(copy.stage).toBe("planning");
    expect(copy.archivedAt ?? null).toBeNull();
    expect(copy.quotedPrice).toBe(QUOTED);
    expect(copy.budgetAmount).toBe(BUDGET);
    expect(copy.expectedHeadcount).toBe(HEAD_COUNT);
    expect(copy.venueName).toBe("Garden Hall");
    expect(String(copy.clientId)).toBe(String(clientId));

    // The copied menu line is a NEW row with the same planning facts.
    const copyDishes = await eventDishes(events, copy._id);
    expect(copyDishes).toHaveLength(1);
    const copyDish = copyDishes[0]!;
    expect(copyDish._id).not.toBe(sourceDishBefore._id);
    expect(String(copyDish.dishId)).toBe(String(sourceDishBefore.dishId));
    expect(copyDish.quantityServings).toBe(HEAD_COUNT);
    expect(copyDish.dishName).toBe("Garden salad");

    // The source is exactly as it was.
    expect(source.title).toBe("AC-239 source");
    expect(source.stage).toBe("planning");
    expect(source.quotedPrice).toBe(QUOTED);
    const sourceDishes = await eventDishes(events, eventId);
    expect(sourceDishes).toHaveLength(1);
    expect(sourceDishes[0]!._id).toBe(sourceDishBefore._id);

    // The copy carries no invoices.
    expect(await invoicesFor(events, copy._id)).toHaveLength(0);
  });

  it("does not copy an approved source invoice onto the new event", async () => {
    const proof = harness();
    const tenantId = "tenant-ac239-approved-copy";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await createSourceEvent(proof, tenantId);
    await addSourceDish(proof, tenantId, eventId);

    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });
    expect(await invoicesFor(events, eventId)).toHaveLength(1);

    const result = (await proof.executeCommand(
      events,
      duplicateEvent as never,
      { sourceEventId: eventId },
    )) as { docId: string };

    const live = await liveEvents(events, tenantId);
    expect(live).toHaveLength(2);
    const copy = live.find((row) => row._id !== eventId)!;
    expect(copy.stage).toBe("planning");
    expect(await invoicesFor(events, copy._id)).toHaveLength(0);
    expect(await invoicesFor(events, eventId)).toHaveLength(1);
    expect(live.find((row) => row._id === eventId)!.stage).toBe("approved");
  });

  it("refuses a kitchen duplicate and a foreign-tenant id", async () => {
    const proof = harness();
    const tenantId = "tenant-ac239-duplicate-refusals";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const { eventId } = await createSourceEvent(proof, tenantId);

    await expect(
      proof.executeCommand(kitchen, duplicateEvent as never, {
        sourceEventId: eventId,
      }),
    ).rejects.toThrow(/Guard|Event and sales|not found/);
    expect(await liveEvents(events, tenantId)).toHaveLength(1);

    const otherTenant = "tenant-ac239-duplicate-foreign";
    const { events: foreignEvents } = rolesFor(proof, otherTenant);
    await expect(
      proof.executeCommand(foreignEvents, duplicateEvent as never, {
        sourceEventId: eventId,
      }),
    ).rejects.toThrow("Event not found");
    expect(await liveEvents(foreignEvents, otherTenant)).toHaveLength(0);
  });
});
