/**
 * Runtime proof (AC-475, AC-476, AC-478): a full or partial delivery moves the
 * order balance and stock exactly once; the vendor's delivery slip number and
 * a retry key both stop a retry from counting a delivery twice; the price paid
 * is kept as price evidence and never rewrites the ingredient's list price.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveRows,
  orderLines,
  readRow,
  rolesFor,
  runner,
  seedWeeklyOrder,
  submitWeeklyOrder,
  type VendorOrderRow,
} from "./plan-vs-fact-matrix.runtime.helpers";
import {
  confirmWeeklyOrder,
  liveLots,
  registerDryStore,
} from "./plan-vs-fact-partial-receipt.runtime.helpers";

type StockRow = {
  _id: string;
  ingredientId: string;
  locationId: string;
  quantityOnHand: number;
  tenantId: string;
  deletedAt?: unknown;
};

type PriceRow = {
  vendorOrderLineId: string;
  ingredientId: string;
  unitPrice: number;
  tenantId: string;
  deletedAt?: unknown;
};

type IngredientRow = { costPerUnit: number };

const TENANT = "receipt-exact-once";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("receiving counts each delivery once", () => {
  it("moves balance and stock once, refuses a repeated slip, replays a retry key, and keeps the list price", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const runProcurement = runner(proof, roles.procurement);

    const seeded = await seedWeeklyOrder(proof, TENANT, "Receipt exact once");
    const orderId = await submitWeeklyOrder(
      proof,
      TENANT,
      seeded.vendorOrderId,
    );
    await confirmWeeklyOrder(proof, TENANT, orderId);
    const locationId = await registerDryStore(proof, TENANT, "Exact once dry");

    const stockOf = async (ingredientId: string) =>
      Number(
        (
          await liveRows<StockRow>(roles.inventory, "inventoryItems", TENANT)
        ).find(
          (row) =>
            row.ingredientId === ingredientId && row.locationId === locationId,
        )?.quantityOnHand ?? 0,
      );
    const lineOf = async (lineId: string) =>
      (await orderLines(roles.procurement, TENANT, orderId)).find(
        (row) => row._id === lineId,
      );
    const lotsOf = async (lineId: string) =>
      (await liveLots(roles.procurement, TENANT)).filter(
        (row) => row.vendorOrderLineId === lineId,
      );

    // AC-475: a partial delivery (15 of 40) moves stock and balance once.
    await runProcurement(api.mutations.VendorOrderLine_recordReceipt, {
      docId: seeded.lineAId,
      quantity: 15,
      locationId,
      unitPrice: 1.5,
      supplierLotNumber: "LOT-A1",
      deliveryReference: "DS-1001",
    });
    expect(await stockOf(seeded.ingredientAId)).toBe(15);
    let lineA = await lineOf(seeded.lineAId);
    expect(Number(lineA?.receivedQuantity)).toBe(15);
    expect(lineA?.status).toBe("receiving");
    if (lineA?.pendingSupplyQuantity != null) {
      expect(Number(lineA.pendingSupplyQuantity)).toBe(25);
    }
    expect(await lotsOf(seeded.lineAId)).toHaveLength(1);

    // AC-476: the same delivery slip sent again is refused and moves nothing.
    await expect(
      runProcurement(api.mutations.VendorOrderLine_recordReceipt, {
        docId: seeded.lineAId,
        quantity: 15,
        locationId,
        unitPrice: 1.5,
        supplierLotNumber: "LOT-A1",
        deliveryReference: "DS-1001",
      }),
    ).rejects.toThrow(/already counted/);
    expect(await stockOf(seeded.ingredientAId)).toBe(15);
    expect(Number((await lineOf(seeded.lineAId))?.receivedQuantity)).toBe(15);
    expect(await lotsOf(seeded.lineAId)).toHaveLength(1);

    // AC-475 + AC-476: the rest arrives with a retry key; the retry replays
    // the saved answer and never counts the delivery a second time.
    const rest = {
      docId: seeded.lineAId,
      quantity: 25,
      locationId,
      unitPrice: 1.5,
      supplierLotNumber: "LOT-A2",
      deliveryReference: "DS-1002",
      idempotencyKey: "receive-DS-1002-line-a",
    };
    await runProcurement(api.mutations.VendorOrderLine_recordReceipt, rest);
    await runProcurement(api.mutations.VendorOrderLine_recordReceipt, rest);
    expect(await stockOf(seeded.ingredientAId)).toBe(40);
    lineA = await lineOf(seeded.lineAId);
    expect(Number(lineA?.receivedQuantity)).toBe(40);
    expect(lineA?.status).toBe("complete");
    if (lineA?.pendingSupplyQuantity != null) {
      expect(Number(lineA.pendingSupplyQuantity)).toBe(0);
    }
    const lotsA = await lotsOf(seeded.lineAId);
    expect(lotsA).toHaveLength(2);
    expect(
      lotsA
        .map((row) => [
          Number(row.receiptQuantity),
          Number(row.cumulativeReceivedQuantity),
        ])
        .sort((a, b) => a[1]! - b[1]!),
    ).toEqual([
      [15, 15],
      [25, 40],
    ]);

    // One slip may cover several lines: the same slip on line B is its own
    // delivery. A full receipt there moves stock once.
    await runProcurement(api.mutations.VendorOrderLine_recordReceipt, {
      docId: seeded.lineBId,
      quantity: 40,
      locationId,
      unitPrice: 1,
      supplierLotNumber: "LOT-B1",
      deliveryReference: "DS-1001",
    });
    expect(await stockOf(seeded.ingredientBId)).toBe(40);
    expect((await lineOf(seeded.lineBId))?.status).toBe("complete");

    // With no slip number, the running total still stops an over-count.
    await expect(
      runProcurement(api.mutations.VendorOrderLine_recordReceipt, {
        docId: seeded.lineBId,
        quantity: 40,
        locationId,
        unitPrice: 1,
        supplierLotNumber: "LOT-B1",
      }),
    ).rejects.toThrow();
    expect(await stockOf(seeded.ingredientBId)).toBe(40);

    await runProcurement(api.mutations.VendorOrder_markReceived, {
      docId: orderId,
    });
    const order = await readRow<VendorOrderRow>(roles.procurement, orderId);
    expect(order.status).toBe("received");
    expect(await stockOf(seeded.ingredientAId)).toBe(40);
    expect(await stockOf(seeded.ingredientBId)).toBe(40);

    // AC-478: the price paid is kept as evidence per delivery; the ingredient's
    // list price is not rewritten by a receipt.
    const prices = (
      await liveRows<PriceRow>(
        roles.procurement,
        "ingredientPriceObservations",
        TENANT,
      )
    ).filter((row) => row.vendorOrderLineId === seeded.lineAId);
    expect(prices).toHaveLength(2);
    expect(prices.every((row) => Number(row.unitPrice) === 1.5)).toBe(true);
    const ingredientA = await readRow<IngredientRow>(
      roles.kitchen,
      seeded.ingredientAId,
    );
    expect(Number(ingredientA.costPerUnit)).toBe(1);
  });
});
