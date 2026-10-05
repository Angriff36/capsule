/**
 * Runtime proof (AC-077 PR04-03, AC-460 BE-10.1): opening stock, receipts,
 * transfers, adjustments, reservations, consumption, returns, waste and a
 * recount all land on one on-hand amount through the real governed commands.
 * The movement ledger replays to the stored amount, free stock comes from the
 * one shared calculation, and a replayed movement writes once.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { InventoryAuditEntry } from "../../convex/inventoryAudit";
import { checkStockLedger, stockBalance } from "../../src/lib/stockBalance";
import {
  createPlannedEvent,
  harness,
  runner,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type ItemRow = { _id: string; quantityOnHand: number; version: number };
type HoldRow = {
  _id: string;
  inventoryItemId: string;
  status: string;
  quantity: number;
  returnedQuantity?: number;
  version: number;
  deletedAt: number | null;
};

async function row<T>(role: Role, id: string): Promise<T> {
  return (await role.run((ctx) => ctx.db.get(id as never))) as unknown as T;
}

async function holds(role: Role): Promise<HoldRow[]> {
  return (await role.run((ctx) =>
    ctx.db.query("inventoryReservations").collect(),
  )) as unknown as HoldRow[];
}

async function ledger(
  role: Role,
  tenantId: string,
  itemId: string,
): Promise<InventoryAuditEntry[]> {
  return (await role.query(
    internal.inventoryAudit.readForItem as never,
    {
      tenantId,
      inventoryItemId: itemId,
    } as never,
  )) as InventoryAuditEntry[];
}

async function seed(proof: Proof, tenantId: string) {
  const inventory = proof.asRole({
    subject: `ledger-inv-${tenantId}`,
    role: "inventory_staff",
    tenantId,
  });
  const kitchen = proof.asRole({
    subject: `ledger-kitchen-${tenantId}`,
    role: "kitchen_manager",
    tenantId,
  });
  const ingredient = await runner(proof, kitchen)(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Ledger flour ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 2,
      allergens: [],
      category: "pantry",
    },
  );
  const run = runner(proof, inventory);
  const dry = await run(api.mutations.StorageLocation_createViaRegister, {
    name: `Ledger dry store ${tenantId}`,
    locationType: "dry",
  });
  const annex = await run(api.mutations.StorageLocation_createViaRegister, {
    name: `Ledger annex ${tenantId}`,
    locationType: "dry",
  });
  const item = await run(api.mutations.InventoryItem_createViaOpen, {
    ingredientId: ingredient.docId,
    locationId: dry.docId,
    unit: "kilogram",
    quantityOnHand: 40,
    unitCost: 2,
  });
  const annexItem = await run(api.mutations.InventoryItem_createViaOpen, {
    ingredientId: ingredient.docId,
    locationId: annex.docId,
    unit: "kilogram",
    quantityOnHand: 0,
  });
  return { inventory, run, ingredient, dry, annex, item, annexItem };
}

describe("stock movements reconcile through one calculation", () => {
  it("all movement kinds land on one available quantity and a replayed movement writes once", async () => {
    const proof = harness();
    const tenantId = "tenant-stock-ledger";
    const s = await seed(proof, tenantId);
    const event = await createPlannedEvent(proof, tenantId, "Ledger dinner");
    const onHand = async () =>
      Number((await row<ItemRow>(s.inventory, s.item.docId)).quantityOnHand);
    const version = async () =>
      (await row<ItemRow>(s.inventory, s.item.docId)).version;

    // Every movement is sent twice with the same key: the second is a replay.
    const twice = async (cmd: never, args: Record<string, unknown>) => {
      const first = await s.run(cmd, args);
      const again = await s.run(cmd, args);
      expect(again).toEqual(first);
      return first;
    };

    // Receipt in the stock unit.
    await twice(api.mutations.InventoryItem_receiveStock as never, {
      docId: s.item.docId,
      quantity: 10,
      unitCost: 2,
      idempotencyKey: "ledger:receive:1",
    });
    expect(await onHand()).toBe(50);

    // Delivery in grams converts to the kilogram stock unit.
    await twice(api.mutations.InventoryItem_receiveDelivery as never, {
      docId: s.item.docId,
      ingredientId: s.ingredient.docId,
      locationId: s.dry.docId,
      quantity: 2000,
      unit: "gram",
      unitCost: 0.002,
      idempotencyKey: "ledger:delivery:1",
    });
    expect(await onHand()).toBe(52);

    // Adjustment with its reason.
    await twice(api.mutations.InventoryItem_adjustQuantity as never, {
      docId: s.item.docId,
      delta: -1,
      reason: "Bag split on the shelf",
      idempotencyKey: "ledger:adjust:1",
    });
    expect(await onHand()).toBe(51);

    // Transfer to the annex debits one line and credits the other once.
    await twice(api.mutations.StockTransfer_createViaRecord as never, {
      sourceInventoryItemId: s.item.docId,
      destinationInventoryItemId: s.annexItem.docId,
      ingredientId: s.ingredient.docId,
      sourceLocationId: s.dry.docId,
      destinationLocationId: s.annex.docId,
      quantity: 6,
      unit: "kilogram",
      idempotencyKey: "ledger:transfer:1",
    });
    expect(await onHand()).toBe(45);
    expect(
      Number(
        (await row<ItemRow>(s.inventory, s.annexItem.docId)).quantityOnHand,
      ),
    ).toBe(6);

    // Reservation holds stock without moving it.
    const hold = await twice(
      api.mutations.InventoryReservation_createViaReserve as never,
      {
        inventoryItemId: s.item.docId,
        eventId: event.eventId,
        ingredientId: s.ingredient.docId,
        quantity: 8,
        idempotencyKey: "ledger:reserve:1",
      },
    );
    expect(await onHand()).toBe(45);
    expect(
      stockBalance(s.item.docId, await onHand(), await holds(s.inventory)),
    ).toEqual({ onHand: 45, reserved: 8, available: 37 });

    // Consumption turns the hold into issued stock.
    await twice(api.mutations.InventoryReservation_consume as never, {
      docId: hold.docId,
      idempotencyKey: "ledger:consume:1",
    });
    expect(await onHand()).toBe(37);

    // Unused stock sent back from the event goes on the shelf once.
    await twice(api.mutations.InventoryReservation_returnUnused as never, {
      docId: hold.docId,
      quantity: 3,
      reason: "Guest count was lower",
      idempotencyKey: "ledger:return:1",
    });
    expect(await onHand()).toBe(40);
    const returned = (await holds(s.inventory)).find(
      (h) => h._id === hold.docId,
    )!;
    expect(returned).toMatchObject({
      status: "consumed",
      returnedQuantity: 3,
      returnReason: "Guest count was lower",
    });
    // Sending back more than the event used is refused and moves nothing.
    await expect(
      s.run(api.mutations.InventoryReservation_returnUnused, {
        docId: hold.docId,
        quantity: 6,
        reason: "Counted again",
      }),
    ).rejects.toThrow("That is more than this event used.");
    expect(await onHand()).toBe(40);

    // Waste decrements through its own record.
    await twice(api.mutations.WasteRecord_createViaRecord as never, {
      ingredientId: s.ingredient.docId,
      locationId: s.dry.docId,
      inventoryItemId: s.item.docId,
      eventId: event.eventId,
      quantity: 4,
      unit: "kilogram",
      reason: "spoilage",
      unitCost: 2,
      idempotencyKey: "ledger:waste:1",
    });
    expect(await onHand()).toBe(36);

    // A physical count sets the amount; the ledger records the difference.
    await twice(api.mutations.InventoryItem_recount as never, {
      docId: s.item.docId,
      actualQuantity: 35,
      idempotencyKey: "ledger:recount:1",
    });
    expect(await onHand()).toBe(35);

    // A second event hold: free stock is on hand minus active holds only.
    await s.run(api.mutations.InventoryReservation_createViaReserve, {
      inventoryItemId: s.item.docId,
      eventId: event.eventId,
      ingredientId: s.ingredient.docId,
      quantity: 5,
    });
    expect(
      stockBalance(s.item.docId, await onHand(), await holds(s.inventory)),
    ).toEqual({ onHand: 35, reserved: 5, available: 30 });

    // A stale replay without a key is refused by the version check.
    const staleVersion = (await version()) - 1;
    await expect(
      s.run(api.mutations.InventoryItem_adjustQuantity, {
        docId: s.item.docId,
        delta: -1,
        reason: "Replayed from an old screen",
        version: staleVersion,
      }),
    ).rejects.toThrow();
    expect(await onHand()).toBe(35);

    // The ledger replays to the stored amount with one entry per movement.
    const entries = await ledger(s.inventory, tenantId, s.item.docId);
    const onHandMoves = entries.filter((e) => e.measure === "on_hand");
    expect(onHandMoves.map((e) => e.action)).toEqual([
      "Opening balance",
      "Stock received",
      "Stock received",
      "Adjustment",
      "Transfer out",
      "Issued",
      "Returned",
      "Waste",
      "Recount",
    ]);
    expect(onHandMoves.map((e) => e.delta)).toEqual([
      40, 10, 2, -1, -6, -8, 3, -4, -1,
    ]);
    expect(onHandMoves.find((e) => e.action === "Adjustment")?.reason).toBe(
      "Bag split on the shelf",
    );
    expect(checkStockLedger(entries, await onHand())).toEqual({
      ledgerOnHand: 35,
      matches: true,
      difference: 0,
      gaps: [],
    });
    const annexEntries = await ledger(s.inventory, tenantId, s.annexItem.docId);
    expect(
      checkStockLedger(annexEntries, 6),
      "annex line reconciles too",
    ).toMatchObject({ matches: true, ledgerOnHand: 6 });
  });

  it("the ledger check names a stored amount the history does not reach", () => {
    const entries = [
      {
        measure: "on_hand" as const,
        quantityBefore: 0,
        quantityAfter: 10,
        delta: 10,
      },
      {
        measure: "reserved" as const,
        quantityBefore: 0,
        quantityAfter: 4,
        delta: 4,
      },
      {
        measure: "on_hand" as const,
        quantityBefore: 12,
        quantityAfter: 9,
        delta: -3,
      },
    ];
    const check = checkStockLedger(entries, 9);
    expect(check.matches).toBe(false);
    expect(check.ledgerOnHand).toBe(7);
    expect(check.difference).toBe(2);
    expect(check.gaps).toEqual([entries[2]]);
  });
});
