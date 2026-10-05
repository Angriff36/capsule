/**
 * Runtime proof (AC-461 BE-10.2): available stock is reserved idempotently
 * for each Event demand line. Running the allocation twice through the real
 * governed commands leaves one hold per demand line — the second run sees
 * the live holds and creates nothing — and a create replayed with its
 * idempotency key (a crash between create and the next step) returns the
 * same hold instead of a second one.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  runner,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";
import { EventStockReservationCoordinator } from "../../src/features/events/EventStockReservationCoordinator";

type ReservationRow = {
  _id: string;
  inventoryItemId: string;
  eventId: string;
  ingredientId: string;
  quantity: number;
  status: string;
  deletedAt: number | null;
};

type ItemRow = {
  _id: string;
  quantityOnHand: number;
  deletedAt: number | null;
};

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function seedStock(proof: Proof, tenantId: string, onHand: number) {
  const inventory = proof.asRole({
    subject: `idem-inv-${tenantId}`,
    role: "inventory_staff",
    tenantId,
  });
  const kitchen = proof.asRole({
    subject: `idem-kitchen-${tenantId}`,
    role: "kitchen_manager",
    tenantId,
  });
  const ing = await runner(proof, kitchen)(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Idempotent stock ingredient ${tenantId} ${Math.random()}`,
      unit: "kilogram",
      costPerUnit: 1.5,
      allergens: [],
      category: "pantry",
    },
  );
  const run = runner(proof, inventory);
  const loc = await run(api.mutations.StorageLocation_createViaRegister, {
    name: `Idempotent stock storage ${tenantId} ${Math.random()}`,
    locationType: "dry",
  });
  const item = await run(api.mutations.InventoryItem_createViaOpen, {
    ingredientId: ing.docId,
    locationId: loc.docId,
    unit: "kilogram",
    quantityOnHand: onHand,
  });
  return { inventory, ing, item };
}

async function holdsFor(
  role: Role,
  eventId: string,
): Promise<ReservationRow[]> {
  const rows = (await role.run(async (ctx) =>
    ctx.db.query("inventoryReservations").collect(),
  )) as unknown as ReservationRow[];
  return rows.filter((row) => row.eventId === eventId && row.deletedAt == null);
}

/** The coordinator wired to the real governed commands, with the live stock
 * room read from the database — the same shape the event screens run. */
function liveCoordinator(proof: Proof, role: Role) {
  const run = runner(proof, role);
  return new EventStockReservationCoordinator({
    createReservation: async (input) =>
      await run(api.mutations.InventoryReservation_createViaReserve, {
        inventoryItemId: input.inventoryItemId,
        eventId: input.eventId,
        ingredientId: input.ingredientId,
        quantity: input.quantity,
        ...(input.inventoryLotId
          ? { inventoryLotId: input.inventoryLotId }
          : {}),
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      }),
    releaseReservation: async (input: { docId: string; version: number }) =>
      await run(api.mutations.InventoryReservation_release, {
        docId: input.docId,
        version: input.version,
        reason: "Event menu demand decreased",
      }),
  });
}

async function liveInput(
  role: Role,
  eventId: string,
  ingredientId: string,
  itemId: string,
  requiredQuantity: number,
) {
  const [item, holds] = await Promise.all([
    role.run(async (ctx) =>
      ctx.db.get(itemId as never),
    ) as never as Promise<ItemRow>,
    holdsFor(role, eventId),
  ]);
  return {
    eventId,
    demands: [
      {
        id: `demand:${eventId}:${ingredientId}`,
        eventId,
        ingredientId,
        requiredQuantity,
        unit: "kilogram",
        status: "confirmed",
      },
    ],
    items: [
      {
        id: itemId,
        ingredientId,
        quantityOnHand: Number(item.quantityOnHand),
        unit: "kilogram",
        stockedAt: 1,
      },
    ],
    reservations: holds.map((row) => ({
      id: row._id,
      inventoryItemId: row.inventoryItemId,
      eventId: row.eventId,
      ingredientId: row.ingredientId,
      quantity: Number(row.quantity),
      status: row.status,
    })),
  };
}

describe("reserve is idempotent per demand line", () => {
  it("running the allocation twice leaves one hold and no second write", async () => {
    const proof = harness();
    const tenantId = "tenant-a";
    const { inventory, ing, item } = await seedStock(proof, tenantId, 40);
    const event = await createPlannedEvent(proof, tenantId, "Idempotent A");

    const first = await liveCoordinator(proof, inventory).allocate(
      await liveInput(inventory, event.eventId, ing.docId, item.docId, 12),
    );
    expect(first.created).toHaveLength(1);
    expect(first.shortages).toEqual([]);

    const holdsAfterFirst = await holdsFor(inventory, event.eventId);
    expect(holdsAfterFirst).toHaveLength(1);
    expect(Number(holdsAfterFirst[0]!.quantity)).toBe(12);

    // Second run: the live hold is seen, nothing is created or changed.
    const second = await liveCoordinator(proof, inventory).allocate(
      await liveInput(inventory, event.eventId, ing.docId, item.docId, 12),
    );
    expect(second.created).toEqual([]);
    expect(second.shortages).toEqual([]);
    const holdsAfterSecond = await holdsFor(inventory, event.eventId);
    expect(holdsAfterSecond).toEqual(holdsAfterFirst);
  });

  it("a create replayed with its idempotency key returns the same hold", async () => {
    const proof = harness();
    const tenantId = "tenant-b";
    const { inventory, ing, item } = await seedStock(proof, tenantId, 40);
    const event = await createPlannedEvent(proof, tenantId, "Idempotent B");
    const run = runner(proof, inventory);
    const args = {
      inventoryItemId: item.docId,
      eventId: event.eventId,
      ingredientId: ing.docId,
      quantity: 6,
      idempotencyKey: `event-stock-reserve:${event.eventId}:${item.docId}:${ing.docId}:6:0`,
    };

    const first = await run(
      api.mutations.InventoryReservation_createViaReserve,
      args,
    );
    const replayed = await run(
      api.mutations.InventoryReservation_createViaReserve,
      args,
    );
    expect(replayed.docId).toBe(first.docId);

    const holds = await holdsFor(inventory, event.eventId);
    expect(holds).toHaveLength(1);
    expect(Number(holds[0]!.quantity)).toBe(6);
  });
});
