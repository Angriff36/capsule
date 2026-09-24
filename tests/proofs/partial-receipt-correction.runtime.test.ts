/**
 * Runtime proof (AC-079): a receipt correction keeps the original delivery lot
 * and records the reasoned difference once, including after some of that
 * delivery was already used. A second save of the same count does not move
 * stock again.
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
  type VendorOrderLineRow,
  type VendorOrderRow,
} from "./plan-vs-fact-matrix.runtime.helpers";
import {
  confirmWeeklyOrder,
  liveLots,
  recordPartialReceipt,
  registerDryStore,
} from "./plan-vs-fact-partial-receipt.runtime.helpers";

type StockRow = {
  _id: string;
  ingredientId: string;
  locationId: string;
  quantityOnHand: number;
  version: number;
  tenantId: string;
  deletedAt?: unknown;
};

type CorrectionRow = {
  vendorOrderLineId: string;
  priorReceivedQuantity: number;
  correctedReceivedQuantity: number;
  delta: number;
  reason: string;
  supplierLotNumber: string;
  tenantId: string;
  deletedAt?: unknown;
};

type LineVersion = VendorOrderLineRow & { version: number };

const TENANT = "receipt-correction";
const LOT = "LOT-CORRECT-A";
const REASON = "Case was two short after the cook used some";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("partial receipt correction", () => {
  it("keeps the original lot and applies the difference once after some was used", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const runProcurement = runner(proof, roles.procurement);
    const runInventory = runner(proof, roles.inventory);

    const seeded = await seedWeeklyOrder(proof, TENANT, "Receipt correction");
    const orderId = await submitWeeklyOrder(
      proof,
      TENANT,
      seeded.vendorOrderId,
    );
    await confirmWeeklyOrder(proof, TENANT, orderId);
    const locationId = await registerDryStore(
      proof,
      TENANT,
      "Correction dry store",
    );

    await recordPartialReceipt(
      proof,
      TENANT,
      seeded.lineAId,
      locationId,
      40,
      1,
      LOT,
    );
    await recordPartialReceipt(
      proof,
      TENANT,
      seeded.lineBId,
      locationId,
      40,
      1,
      "LOT-CORRECT-B",
    );
    await runProcurement(api.mutations.VendorOrder_markReceived, {
      docId: orderId,
    });

    const stock = (
      await liveRows<StockRow>(roles.inventory, "inventoryItems", TENANT)
    ).find((row) => row.ingredientId === seeded.ingredientAId);
    if (!stock) throw new Error("Receipt did not create stock");
    expect(Number(stock.quantityOnHand)).toBe(40);

    await runInventory(api.mutations.InventoryItem_adjustQuantity, {
      docId: stock._id,
      version: stock.version,
      delta: -5,
      reason: "Used for prep",
    });

    const line = await readRow<LineVersion>(roles.procurement, seeded.lineAId);
    const lotBefore = (await liveLots(roles.procurement, TENANT)).find(
      (row) => row.vendorOrderLineId === seeded.lineAId,
    );
    if (!lotBefore) throw new Error("Receipt did not create a lot");

    await runProcurement(api.mutations.VendorOrderLine_correctReceipt, {
      docId: seeded.lineAId,
      version: line.version,
      correctedQuantity: 32,
      reason: REASON,
      supplierLotNumber: LOT,
    });

    const lotAfter = (await liveLots(roles.procurement, TENANT)).find(
      (row) => row._id === lotBefore._id,
    );
    expect(Number(lotAfter?.receiptQuantity)).toBe(40);
    expect(Number(lotAfter?.cumulativeReceivedQuantity)).toBe(40);

    const corrections = await liveRows<CorrectionRow>(
      roles.procurement,
      "receiptCorrections",
      TENANT,
    );
    expect(corrections).toHaveLength(1);
    expect(Number(corrections[0]?.priorReceivedQuantity)).toBe(40);
    expect(Number(corrections[0]?.correctedReceivedQuantity)).toBe(32);
    expect(Number(corrections[0]?.delta)).toBe(-8);
    expect(corrections[0]?.reason).toBe(REASON);
    expect(corrections[0]?.supplierLotNumber).toBe(LOT);

    const correctedLine = (
      await orderLines(roles.procurement, TENANT, orderId)
    ).find((row) => row._id === seeded.lineAId);
    expect(Number(correctedLine?.receivedQuantity)).toBe(32);
    expect(correctedLine?.status).toBe("receiving");

    const order = await readRow<VendorOrderRow>(roles.procurement, orderId);
    expect(order.status).toBe("partially_received");

    const stockAfter = (
      await liveRows<StockRow>(roles.inventory, "inventoryItems", TENANT)
    ).find((row) => row._id === stock._id);
    expect(Number(stockAfter?.quantityOnHand)).toBe(27);

    const again = await readRow<LineVersion>(roles.procurement, seeded.lineAId);
    await expect(
      runProcurement(api.mutations.VendorOrderLine_correctReceipt, {
        docId: seeded.lineAId,
        version: again.version,
        correctedQuantity: 32,
        reason: REASON,
        supplierLotNumber: LOT,
      }),
    ).rejects.toThrow();

    const stockFinal = (
      await liveRows<StockRow>(roles.inventory, "inventoryItems", TENANT)
    ).find((row) => row._id === stock._id);
    expect(Number(stockFinal?.quantityOnHand)).toBe(27);
    const correctionsFinal = await liveRows<CorrectionRow>(
      roles.procurement,
      "receiptCorrections",
      TENANT,
    );
    expect(correctionsFinal).toHaveLength(1);

    const restored = await readRow<LineVersion>(
      roles.procurement,
      seeded.lineAId,
    );
    await runProcurement(api.mutations.VendorOrderLine_correctReceipt, {
      docId: seeded.lineAId,
      version: restored.version,
      correctedQuantity: 40,
      reason: "The missing case was in the walk-in",
      supplierLotNumber: LOT,
    });
    const afterRestore = (
      await liveRows<StockRow>(roles.inventory, "inventoryItems", TENANT)
    ).find((row) => row._id === stock._id);
    expect(Number(afterRestore?.quantityOnHand)).toBe(35);

    const restoredLine = await readRow<LineVersion>(
      roles.procurement,
      seeded.lineAId,
    );
    await runProcurement(api.mutations.VendorOrderLine_correctReceipt, {
      docId: seeded.lineAId,
      version: restoredLine.version,
      correctedQuantity: 32,
      reason: REASON,
      supplierLotNumber: LOT,
    });
    const afterRepeat = (
      await liveRows<StockRow>(roles.inventory, "inventoryItems", TENANT)
    ).find((row) => row._id === stock._id);
    expect(Number(afterRepeat?.quantityOnHand)).toBe(27);
    const correctionsRepeated = await liveRows<CorrectionRow>(
      roles.procurement,
      "receiptCorrections",
      TENANT,
    );
    expect(correctionsRepeated).toHaveLength(3);
    expect(
      correctionsRepeated.map((row) => Number(row.delta)).sort((a, b) => a - b),
    ).toEqual([-8, -8, 8]);
  });
});
