/**
 * Runtime proof (AC-080 PR04-06 + AC-462 BE-10.2): two events competing for
 * the same free stock through the governed commands get one valid hold each
 * and a visible line shortage — never negative stock and never two holds on
 * the same units. The free-stock rule lives in the canonical transaction
 * (InventoryReservation.reserve's reserveFitsFreeStock), so the second
 * reserve is refused with plain words at its own line, and the coordinator
 * reports the same shortage instead of freezing the event.
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

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function inventoryRole(proof: Proof, tenantId: string): Role {
  return proof.asRole({
    subject: `stock-inv-${tenantId}`,
    role: "inventory_staff",
    tenantId,
  });
}

type ItemRow = {
  _id: string;
  quantityOnHand: number;
  deletedAt: number | null;
};

async function readItem(role: Role, itemId: string): Promise<ItemRow> {
  return (await role.run(async (ctx) => ctx.db.get(itemId as never))) as never;
}

type ReservationRow = {
  _id: string;
  inventoryItemId: string;
  eventId: string;
  quantity: number;
  status: string;
  deletedAt: number | null;
};

async function itemHolds(role: Role, itemId: string) {
  const rows = (await role.run(async (ctx) =>
    ctx.db.query("inventoryReservations").collect(),
  )) as unknown as ReservationRow[];
  return rows.filter(
    (row) => row.inventoryItemId === itemId && row.deletedAt == null,
  );
}

async function seedItem(proof: Proof, tenantId: string, onHand: number) {
  const inventory = inventoryRole(proof, tenantId);
  const kitchen = proof.asRole({
    subject: `stock-kitchen-${tenantId}`,
    role: "kitchen_manager",
    tenantId,
  });
  const ing = await runner(proof, kitchen)(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Contended ingredient ${tenantId} ${onHand} ${Math.random()}`,
      unit: "kilogram",
      costPerUnit: 2,
      allergens: [],
      category: "pantry",
    },
  );
  const run = runner(proof, inventory);
  const loc = await run(api.mutations.StorageLocation_createViaRegister, {
    name: `Contended storage ${tenantId} ${onHand} ${Math.random()}`,
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

/** The coordinator's view of the live stock room, read from the database. */
async function coordinatorInput(
  role: Role,
  eventId: string,
  ingredientId: string,
  itemId: string,
  unit: string,
) {
  const [item, holds] = await Promise.all([
    readItem(role, itemId),
    itemHolds(role, itemId),
  ]);
  const demands = [
    {
      id: `demand:${eventId}:${ingredientId}`,
      eventId,
      ingredientId,
      requiredQuantity: 5,
      unit,
      status: "confirmed",
    },
  ];
  const items = [
    {
      id: itemId,
      ingredientId,
      quantityOnHand: Number(item.quantityOnHand),
      unit,
      stockedAt: 1,
    },
  ];
  const reservations = holds.map((row) => ({
    id: row._id,
    inventoryItemId: row.inventoryItemId,
    eventId: row.eventId,
    ingredientId,
    quantity: Number(row.quantity),
    status: row.status,
  }));
  return { eventId, demands, items, reservations };
}

describe("two events competing for the same stock", () => {
  it("leaves one valid hold on the last units, refuses the second at its line, and shows the shortage", async () => {
    const proof = harness();
    const tenantId = "tenant-a";
    const { inventory, ing, item } = await seedItem(proof, tenantId, 5);
    const eventA = await createPlannedEvent(proof, tenantId, "Contended A");
    const eventB = await createPlannedEvent(proof, tenantId, "Contended B");
    const run = runner(proof, inventory);

    // Event A takes all five free units through the governed command.
    const holdA = await run(
      api.mutations.InventoryReservation_createViaReserve,
      {
        inventoryItemId: item.docId,
        eventId: eventA.eventId,
        ingredientId: ing.docId,
        quantity: 5,
      },
    );

    // Event B asks for the same last units: refused in the transaction with
    // the plain free-stock words, and nothing is written.
    await expect(
      run(api.mutations.InventoryReservation_createViaReserve, {
        inventoryItemId: item.docId,
        eventId: eventB.eventId,
        ingredientId: ing.docId,
        quantity: 5,
      }),
    ).rejects.toThrow(/Not enough free stock/);

    const holds = await itemHolds(inventory, item.docId);
    expect(holds).toHaveLength(1);
    expect(holds[0]!._id).toBe(holdA.docId);
    expect(holds[0]!.status).toBe("active");
    expect(Number(holds[0]!.quantity)).toBe(5);
    expect(holds[0]!.eventId).toBe(eventA.eventId);
    // No negative stock anywhere: on hand is untouched, free is zero.
    const after = await readItem(inventory, item.docId);
    expect(Number(after.quantityOnHand)).toBe(5);

    // The shortage is visible per line and the office keeps its choices:
    // the coordinator reports it instead of freezing event B.
    const input = await coordinatorInput(
      inventory,
      eventB.eventId,
      ing.docId,
      item.docId,
      "kilogram",
    );
    let attempted = 0;
    const result = await new EventStockReservationCoordinator({
      createReservation: async () => {
        attempted += 1;
        return { docId: "should-not-create" };
      },
    }).allocate(input);
    expect(attempted).toBe(0);
    expect(result.created).toEqual([]);
    expect(result.shortages).toEqual([
      {
        ingredientId: ing.docId,
        unit: "kilogram",
        requiredQuantity: 5,
        reservedQuantity: 0,
        shortageQuantity: 5,
      },
    ]);
  });

  it("splits free stock between two events and reports only what is missing", async () => {
    const proof = harness();
    const tenantId = "tenant-b";
    const { inventory, ing, item } = await seedItem(proof, tenantId, 8);
    const eventA = await createPlannedEvent(proof, tenantId, "Split A");
    const eventB = await createPlannedEvent(proof, tenantId, "Split B");
    const run = runner(proof, inventory);

    await run(api.mutations.InventoryReservation_createViaReserve, {
      inventoryItemId: item.docId,
      eventId: eventA.eventId,
      ingredientId: ing.docId,
      quantity: 5,
    });
    await run(api.mutations.InventoryReservation_createViaReserve, {
      inventoryItemId: item.docId,
      eventId: eventB.eventId,
      ingredientId: ing.docId,
      quantity: 5,
    }).catch(() => {
      // The over-ask is expected to fail; the retry below takes the rest.
    });
    await expect(
      run(api.mutations.InventoryReservation_createViaReserve, {
        inventoryItemId: item.docId,
        eventId: eventB.eventId,
        ingredientId: ing.docId,
        quantity: 3,
      }),
    ).resolves.toBeDefined();

    const holds = await itemHolds(inventory, item.docId);
    expect(holds.map((row) => row.status)).toEqual(["active", "active"]);
    expect(holds.reduce((sum, row) => sum + Number(row.quantity), 0)).toBe(8);
    expect(holds.map((row) => row.eventId).sort()).toEqual(
      [eventA.eventId, eventB.eventId].sort(),
    );

    // One more ask for the same demand line sees the full hold and reports
    // the two missing units at the line.
    const input = await coordinatorInput(
      inventory,
      eventB.eventId,
      ing.docId,
      item.docId,
      "kilogram",
    );
    const result = await new EventStockReservationCoordinator({
      createReservation: async () => {
        throw new Error("no free stock left to create into");
      },
    }).allocate(input);
    expect(result.created).toEqual([]);
    expect(result.shortages).toEqual([
      {
        ingredientId: ing.docId,
        unit: "kilogram",
        requiredQuantity: 5,
        reservedQuantity: 3,
        shortageQuantity: 2,
      },
    ]);
  });
});
