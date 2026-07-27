/**
 * Acceptance proofs for createVia commands whose guards traverse belongsTo
 * relations. Every seed is created through a public generated mutation.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantA: "tenant-relation-creation-a",
  tenantB: "tenant-relation-creation-b",
  startsAt: Date.UTC(2026, 7, 18, 17, 0),
  endsAt: Date.UTC(2026, 7, 18, 23, 0),
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

type Proof = ReturnType<typeof harness>;

function asRole(proof: Proof, tenantId: string, role: string, subject: string) {
  return proof.asRole({ subject, role, tenantId });
}

async function seedEvent(proof: Proof, tenantId: string) {
  const sales = asRole(proof, tenantId, "sales_manager", `sales-${tenantId}`);
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Relation proof client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title: "Relation hydration acceptance event",
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Proof",
      budgetAmount: 4000,
      quotedPrice: 4800,
    },
  )) as { docId: string };
  return event.docId;
}

async function seedIngredient(proof: Proof, tenantId: string) {
  const kitchen = asRole(
    proof,
    tenantId,
    "kitchen_manager",
    `kitchen-${tenantId}`,
  );
  const ingredient = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: "Relation proof lentils",
      unit: "kilogram",
      costPerUnit: 3.5,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };
  return ingredient.docId;
}

async function seedDish(proof: Proof, tenantId: string) {
  const kitchen = asRole(
    proof,
    tenantId,
    "kitchen_manager",
    `kitchen-${tenantId}`,
  );
  const component = (await proof.executeCommand(
    kitchen,
    api.mutations.Component_createViaDraft,
    {
      name: "Relation proof lentil entree",
      yieldQuantity: 20,
      yieldUnit: "portion",
      batchMultiplier: 1,
    },
  )) as { docId: string };
  const dish = (await proof.executeCommand(
    kitchen,
    api.mutations.Dish_createViaIntroduce,
    {
      name: "Relation proof lentil plate",
      portionSize: 1,
      portionUnit: "portion",
    },
  )) as { docId: string };
  return dish.docId;
}

async function seedVendor(proof: Proof, tenantId: string) {
  const inventoryManager = asRole(
    proof,
    tenantId,
    "inventory_manager",
    `inventory-manager-${tenantId}`,
  );
  const vendor = (await proof.executeCommand(
    inventoryManager,
    api.mutations.Vendor_createViaOnboard,
    {
      name: `Relation proof vendor ${tenantId}`,
      paymentTermsDays: 30,
    },
  )) as { docId: string };
  return { inventoryManager, vendorId: vendor.docId };
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("relation-guarded governed creation", () => {
  it("creates EventDish through EventDish_createViaAddToEvent", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenantA);
    const dishId = await seedDish(proof, S.tenantA);
    const eventManager = asRole(
      proof,
      S.tenantA,
      "event_manager",
      "event-menu-manager",
    );

    const result = (await proof.executeCommand(
      eventManager,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId,
        dishId,
        quantityServings: 40,
        course: "main",
        serviceStyle: "plated",
      },
    )) as { docId: string };

    expect(result.docId).toEqual(expect.any(String));
    const row = (await eventManager.run((ctx) =>
      ctx.db.get(result.docId as never),
    )) as Record<string, unknown> | null;
    expect(row).toMatchObject({
      tenantId: S.tenantA,
      version: 1,
      eventId,
      dishId,
      quantityServings: 40,
    });
    expect(row?.addedAt).toEqual(expect.any(Number));
    expect(row?.removedAt).toBeUndefined();
    expect(row?.event).toBeUndefined();
    expect(row?.dish).toBeUndefined();
    await proof.expectEvent(eventManager, {
      type: "EventDishAdded",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.eventDishId === result.docId &&
        payload.eventId === eventId &&
        payload.dishId === dishId,
    });
  });

  it("creates IngredientDemand through IngredientDemand_createViaCalculate", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenantA);
    const ingredientId = await seedIngredient(proof, S.tenantA);
    const inventoryStaff = asRole(
      proof,
      S.tenantA,
      "inventory_staff",
      "demand-ledger-staff",
    );

    const result = (await proof.executeCommand(
      inventoryStaff,
      api.mutations.IngredientDemand_createViaCalculate,
      {
        eventId,
        ingredientId,
        requiredQuantity: 12,
        unit: "kilogram",
        servings: 40,
      },
    )) as { docId: string };

    expect(result.docId).toEqual(expect.any(String));
    const row = (await inventoryStaff.run((ctx) =>
      ctx.db.get(result.docId as never),
    )) as Record<string, unknown> | null;
    expect(row).toMatchObject({
      tenantId: S.tenantA,
      version: 1,
      status: "calculated",
      eventId,
      ingredientId,
      requiredQuantity: 12,
    });
    expect(row?.calculatedAt).toEqual(expect.any(Number));
    expect(row?.event).toBeUndefined();
    expect(row?.ingredient).toBeUndefined();
    expect(row?.dish).toBeUndefined();
    await proof.expectEvent(inventoryStaff, {
      type: "IngredientDemandCalculated",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.ingredientDemandId === result.docId &&
        payload.eventId === eventId &&
        payload.ingredientId === ingredientId,
    });
  });

  it("creates InventoryReservation through InventoryReservation_createViaReserve", async () => {
    const proof = harness();
    const eventId = await seedEvent(proof, S.tenantA);
    const ingredientId = await seedIngredient(proof, S.tenantA);
    const inventoryStaff = asRole(
      proof,
      S.tenantA,
      "inventory_staff",
      "stock-book-staff",
    );
    const location = (await proof.executeCommand(
      inventoryStaff,
      api.mutations.StorageLocation_createViaRegister,
      { name: "Relation proof dry storage", locationType: "dry" },
    )) as { docId: string };
    const item = (await proof.executeCommand(
      inventoryStaff,
      api.mutations.InventoryItem_createViaOpen,
      {
        ingredientId,
        locationId: location.docId,
        unit: "kilogram",
        quantityOnHand: 30,
        parLevel: 10,
        reorderThreshold: 5,
        unitCost: 3.5,
      },
    )) as { docId: string };

    const result = (await proof.executeCommand(
      inventoryStaff,
      api.mutations.InventoryReservation_createViaReserve,
      {
        inventoryItemId: item.docId,
        eventId,
        ingredientId,
        quantity: 12,
      },
    )) as { docId: string };

    expect(result.docId).toEqual(expect.any(String));
    const row = (await inventoryStaff.run((ctx) =>
      ctx.db.get(result.docId as never),
    )) as Record<string, unknown> | null;
    expect(row).toMatchObject({
      tenantId: S.tenantA,
      version: 1,
      status: "active",
      inventoryItemId: item.docId,
      eventId,
      ingredientId,
      quantity: 12,
    });
    expect(row?.reservedAt).toEqual(expect.any(Number));
    expect(row?.inventoryItem).toBeUndefined();
    expect(row?.event).toBeUndefined();
    expect(row?.ingredient).toBeUndefined();
    await proof.expectEvent(inventoryStaff, {
      type: "InventoryReserved",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.inventoryReservationId === result.docId &&
        payload.inventoryItemId === item.docId &&
        payload.eventId === eventId,
    });
  });

  it("creates VendorOrder through VendorOrder_createViaOpen", async () => {
    const proof = harness();
    const { inventoryManager, vendorId } = await seedVendor(proof, S.tenantA);

    const result = (await proof.executeCommand(
      inventoryManager,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId,
        orderNumber: "PO-REL-001",
        notes: "Relation hydration acceptance order",
      },
    )) as { docId: string };

    expect(result.docId).toEqual(expect.any(String));
    const row = (await inventoryManager.run((ctx) =>
      ctx.db.get(result.docId as never),
    )) as Record<string, unknown> | null;
    expect(row).toMatchObject({
      tenantId: S.tenantA,
      version: 1,
      status: "draft",
      vendorId,
      orderNumber: "PO-REL-001",
    });
    expect(row?.openedAt).toEqual(expect.any(Number));
    expect(row?.vendor).toBeUndefined();
    expect(row?.event).toBeUndefined();
    await proof.expectEvent(inventoryManager, {
      type: "VendorOrderOpened",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.vendorOrderId === result.docId &&
        payload.vendorId === vendorId &&
        payload.status === "draft",
    });
  });

  it("creates VendorOrderLine through VendorOrderLine_createViaAddLine", async () => {
    const proof = harness();
    const { inventoryManager, vendorId } = await seedVendor(proof, S.tenantA);
    const order = (await proof.executeCommand(
      inventoryManager,
      api.mutations.VendorOrder_createViaOpen,
      { vendorId, orderNumber: "PO-REL-002" },
    )) as { docId: string };
    const ingredientId = await seedIngredient(proof, S.tenantA);

    const result = (await proof.executeCommand(
      inventoryManager,
      api.mutations.VendorOrderLine_createViaAddLine,
      {
        vendorOrderId: order.docId,
        ingredientId,
        orderedQuantity: 15,
        unit: "kilogram",
        unitCost: 3.25,
      },
    )) as { docId: string };

    expect(result.docId).toEqual(expect.any(String));
    const row = (await inventoryManager.run((ctx) =>
      ctx.db.get(result.docId as never),
    )) as Record<string, unknown> | null;
    expect(row).toMatchObject({
      tenantId: S.tenantA,
      version: 1,
      status: "added",
      vendorOrderId: order.docId,
      ingredientId,
      orderedQuantity: 15,
      receivedQuantity: 0,
    });
    expect(row?.addedAt).toEqual(expect.any(Number));
    expect(row?.vendorOrder).toBeUndefined();
    expect(row?.ingredient).toBeUndefined();
    expect(row?.ingredientDemand).toBeUndefined();
    expect(row?.location).toBeUndefined();
    await proof.expectEvent(inventoryManager, {
      type: "VendorOrderLineAdded",
      tenantId: S.tenantA,
      predicate: (payload) =>
        payload.vendorOrderLineId === result.docId &&
        payload.vendorOrderId === order.docId &&
        payload.ingredientId === ingredientId,
    });
  });

  it("rejects VendorOrder creation with a vendor from another tenant", async () => {
    const proof = harness();
    const { vendorId } = await seedVendor(proof, S.tenantB);
    const tenantA = asRole(
      proof,
      S.tenantA,
      "inventory_manager",
      "inventory-manager-tenant-a",
    );

    await expect(
      proof.executeCommand(tenantA, api.mutations.VendorOrder_createViaOpen, {
        vendorId,
        orderNumber: "PO-CROSS-TENANT",
      }),
    ).rejects.toThrow();

    const rows = await tenantA.run((ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    expect(rows).toEqual([]);
  });
});
