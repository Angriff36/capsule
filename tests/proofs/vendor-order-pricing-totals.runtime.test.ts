/**
 * Runtime proof (issue #140 / PR #159 review): the purchase-order money path.
 *
 * Drives the REAL generated Convex mutations end to end:
 * - auto-drafted lines price from the ingredient catalog (6.25/kg × 16 kg),
 * - the header total tracks line revise / cancel / receipt,
 * - recordReceipt drives the header to $100.00 and markReceived keeps it,
 * - the draft gets a PO-<n> order number,
 * - a direct syncLineTotals(0) on a RECEIVED order is rejected.
 *
 * Quantities are binary-exact (0.25 and 0.0625 per serving × 64 guests) so
 * money assertions are exact, not approximate. If ensureWeeklyLine ever goes
 * back to hardcoding unitCost 0, the draft pricing assertions here fail.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-po-pricing-totals-e2e",
  weekStart: Date.UTC(2026, 6, 20, 12, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
  headcount: 64,
  saffronPerServing: 0.25, // 0.25 kg × 64 = 16 kg exactly
  garnishPerServing: 0.0625, // 0.0625 kg × 64 = 4 kg exactly
  saffronCost: 6.25, // catalog: 16 kg × 6.25 = $100.00
  garnishCost: 2, // catalog: 4 kg × 2 = $8.00
  saffronRevisedCost: 5, // buyer revise: 16 kg × 5 = $80.00
  receiptQty: 16,
  receiptPrice: 6.25,
} as const;

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

type OrderRow = {
  _id: string;
  status: string;
  vendorId?: string;
  orderNumber?: string | null;
  subtotal: number;
  totalAmount: number;
  deletedAt?: number | null;
};

type LineRow = {
  _id: string;
  vendorOrderId?: string;
  ingredientId?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  lineTotalAmount?: number | null;
  status: string;
  deletedAt?: number | null;
};

describe("runtime proof: PO lines price from catalog and the header total tracks them (#140)", () => {
  it("prices draft lines, rolls the header through revise/cancel/receipt, numbers the PO, and locks received totals", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-po-pricing",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-po-pricing",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-po-pricing",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-po-pricing",
      role: "inventory_staff",
      tenantId: S.tenantId,
    });
    const procurement = proof.asRole({
      subject: "procurement-po-pricing",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      { name: "Catalog Priced Vendor", paymentTermsDays: 14 },
    )) as { docId: string };
    await proof.executeCommand(
      procurement,
      api.mutations.WeeklyPurchasingConfig_createViaConfigure,
      { defaultVendorId: vendor.docId },
    );

    const saffron = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "QA saffron",
        unit: "kilogram",
        costPerUnit: S.saffronCost,
        allergens: [],
        category: "spice",
      },
    )) as { docId: string };
    const garnish = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "QA garnish",
        unit: "kilogram",
        costPerUnit: S.garnishCost,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };

    const location = (await proof.executeCommand(
      inventory,
      api.mutations.StorageLocation_createViaRegister,
      { name: "QA dry store", locationType: "dry", temperatureZone: "ambient" },
    )) as { docId: string };

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Saffron plate",
        portionSize: 1,
        portionUnit: "portion",
        category: "entree",
      },
    )) as { docId: string };
    await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: dish.docId,
        ingredientId: saffron.docId,
        quantity: S.saffronPerServing,
        unit: "kilogram",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: dish.docId,
        ingredientId: garnish.docId,
        quantity: S.garnishPerServing,
        unit: "kilogram",
      },
    );

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "PO pricing QA client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Saffron dinner",
        eventType: "catering",
        startsAt: S.weekStart,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcount,
        primaryContactName: "Quinn Assurance",
        budgetAmount: 2000,
        quotedPrice: 2500,
      },
    )) as { docId: string };
    await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      },
    );

    await proof.executeCommand(events, api.mutations.Event_submitForApproval, {
      docId: event.docId,
      version: 1,
    });
    await proof.executeCommand(events, api.mutations.Event_approve, {
      docId: event.docId,
      version: 2,
    });

    const readOrder = async (): Promise<OrderRow> => {
      const orders = (await procurement.run(async (ctx) =>
        ctx.db.query("vendorOrders").collect(),
      )) as OrderRow[];
      const mine = orders.filter(
        (row) => row.deletedAt == null && row.vendorId === vendor.docId,
      );
      expect(mine).toHaveLength(1);
      return mine[0]!;
    };
    const readLines = async (orderId: string): Promise<LineRow[]> => {
      const lines = (await procurement.run(async (ctx) =>
        ctx.db.query("vendorOrderLines").collect(),
      )) as LineRow[];
      return lines.filter((row) => row.vendorOrderId === orderId);
    };

    // Draft pricing from the catalog: 16 kg × $6.25 and 4 kg × $2.00 — the
    // exact failure mode of #140 was unitCost 0 here.
    const draft = await readOrder();
    expect(draft.status).toBe("draft");
    expect(draft.orderNumber ?? "").toMatch(/^PO-\d+$/);

    const draftLines = (await readLines(draft._id)).filter(
      (row) => row.deletedAt == null,
    );
    expect(draftLines).toHaveLength(2);
    const saffronLine = draftLines.find(
      (row) => row.ingredientId === saffron.docId,
    )!;
    const garnishLine = draftLines.find(
      (row) => row.ingredientId === garnish.docId,
    )!;
    expect(saffronLine.orderedQuantity).toBe(16);
    expect(saffronLine.unitCost).toBe(S.saffronCost);
    expect(saffronLine.lineTotalAmount).toBe(100);
    expect(garnishLine.orderedQuantity).toBe(4);
    expect(garnishLine.unitCost).toBe(S.garnishCost);
    expect(garnishLine.lineTotalAmount).toBe(8);
    expect(draft.subtotal).toBe(108);
    expect(draft.totalAmount).toBe(108);

    // Buyer revise: header follows to 16 × $5 + $8 = $88.
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrderLine_reviseQuantity,
      {
        docId: saffronLine._id,
        orderedQuantity: 16,
        unitCost: S.saffronRevisedCost,
      },
    );
    expect((await readOrder()).totalAmount).toBe(88);

    // Cancel the garnish line: header drops its $8.
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrderLine_cancelLine,
      { docId: garnishLine._id, reason: "Garnish sourced in-house" },
    );
    expect((await readOrder()).totalAmount).toBe(80);

    // Submit → confirm → record receipt at the real $6.25: the receipt
    // reaction must move the header from $80 to $100.
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: draft._id,
    });
    await proof.executeCommand(procurement, api.mutations.VendorOrder_confirm, {
      docId: draft._id,
    });
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrderLine_recordReceipt,
      {
        docId: saffronLine._id,
        quantity: S.receiptQty,
        locationId: location.docId,
        unitPrice: S.receiptPrice,
        supplierLotNumber: "LOT-QA-140",
      },
    );

    const afterReceipt = await readOrder();
    expect(afterReceipt.subtotal).toBe(100);
    expect(afterReceipt.totalAmount).toBe(100);
    const receivedLine = (await readLines(draft._id)).find(
      (row) => row._id === saffronLine._id,
    )!;
    expect(receivedLine.receivedQuantity).toBe(16);
    expect(receivedLine.unitCost).toBe(S.receiptPrice);
    expect(receivedLine.status).toBe("complete");

    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_markReceived,
      { docId: draft._id },
    );
    const received = await readOrder();
    expect(received.status).toBe("received");
    expect(received.totalAmount).toBe(100);

    // Review finding: a direct syncLineTotals(0) must NOT zero a received PO.
    await expect(
      proof.executeCommand(
        procurement,
        api.mutations.VendorOrder_syncLineTotals,
        {
          docId: draft._id,
          lineSubtotal: 0,
        },
      ),
    ).rejects.toThrow();
    const afterForgeryAttempt = await readOrder();
    expect(afterForgeryAttempt.subtotal).toBe(100);
    expect(afterForgeryAttempt.totalAmount).toBe(100);
  });
});
