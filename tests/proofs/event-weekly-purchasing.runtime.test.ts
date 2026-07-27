/**
 * Runtime proof: Manifest-owned event → weekly purchasing draft.
 * Two approved events in the same week consolidate shortages into one DRAFT.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-weekly-purchasing-e2e",
  weekStart: Date.UTC(2026, 6, 20, 12, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
  endsAtB: Date.UTC(2026, 6, 21, 22, 0),
  headcountA: 100,
  headcountB: 50,
  headcountARevised: 120,
  flourPerServing: 0.1,
  saltPerServing: 0.01,
  pepperPerServing: 0.02,
  stockOnHand: 5,
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

describe("runtime proof: event dishes → shared weekly VendorOrder draft", () => {
  it("consolidates shortages, reconciles headcount, stays DRAFT", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-weekly",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-weekly",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-weekly",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-weekly",
      role: "inventory_staff",
      tenantId: S.tenantId,
    });
    const procurement = proof.asRole({
      subject: "procurement-weekly",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Weekly Produce Co",
        paymentTermsDays: 14,
      },
    )) as { docId: string };

    await proof.executeCommand(
      procurement,
      api.mutations.WeeklyPurchasingConfig_createViaConfigure,
      { defaultVendorId: vendor.docId },
    );

    const flour = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Shared flour",
        unit: "kilogram",
        costPerUnit: 1,
        allergens: [],
        category: "dry",
      },
    )) as { docId: string };
    const salt = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Distinct salt",
        unit: "kilogram",
        costPerUnit: 0.5,
        allergens: [],
        category: "dry",
      },
    )) as { docId: string };
    const pepper = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Distinct pepper",
        unit: "kilogram",
        costPerUnit: 0.8,
        allergens: [],
        category: "dry",
      },
    )) as { docId: string };

    const location = (await proof.executeCommand(
      inventory,
      api.mutations.StorageLocation_createViaRegister,
      {
        name: "Dry store",
        locationType: "dry",
        temperatureZone: "ambient",
      },
    )) as { docId: string };

    await proof.executeCommand(
      inventory,
      api.mutations.InventoryItem_createViaOpen,
      {
        ingredientId: flour.docId,
        locationId: location.docId,
        unit: "kilogram",
        quantityOnHand: S.stockOnHand,
      },
    );

    const componentA = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Bread base",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };
    const componentB = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Seasoned base",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: componentA.docId,
        ingredientId: flour.docId,
        quantity: S.flourPerServing,
        unit: "kilogram",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: componentA.docId,
        ingredientId: salt.docId,
        quantity: S.saltPerServing,
        unit: "kilogram",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: componentB.docId,
        ingredientId: flour.docId,
        quantity: S.flourPerServing,
        unit: "kilogram",
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: componentB.docId,
        ingredientId: pepper.docId,
        quantity: S.pepperPerServing,
        unit: "kilogram",
      },
    );

    // Event.approve → ProductionBatch.plan requires published components.
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_publishVersion,
      {
        docId: componentA.docId,
        version: 1,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_publishVersion,
      {
        docId: componentB.docId,
        version: 1,
      },
    );

    const dishA = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Dinner roll",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    )) as { docId: string };
    const dishB = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Seasoned roll",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.DishComponent_createViaAttach,
      {
        dishId: dishA.docId,
        componentId: componentA.docId,
        yieldQuantity: 1,
        batchMultiplier: 1,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.DishComponent_createViaAttach,
      {
        dishId: dishB.docId,
        componentId: componentB.docId,
        yieldQuantity: 1,
        batchMultiplier: 1,
      },
    );

    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Weekly purchasing client",
      },
    )) as { docId: string };

    const eventA = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Monday lunch",
        eventType: "catering",
        startsAt: S.weekStart,
        endsAt: S.endsAt,
        expectedHeadcount: S.headcountA,
        primaryContactName: "Alex Planner",
        budgetAmount: 4000,
        quotedPrice: 5000,
      },
    )) as { docId: string };
    const eventB = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Monday dinner",
        eventType: "catering",
        startsAt: S.weekStart,
        endsAt: S.endsAtB,
        expectedHeadcount: S.headcountB,
        primaryContactName: "Blair Planner",
        budgetAmount: 3000,
        quotedPrice: 4000,
      },
    )) as { docId: string };

    await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: eventA.docId,
        dishId: dishA.docId,
        quantityServings: S.headcountA,
      },
    );
    await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: eventB.docId,
        dishId: dishB.docId,
        quantityServings: S.headcountB,
      },
    );

    const demandsBefore = await inventory.run(async (ctx) =>
      ctx.db.query("ingredientDemands").collect(),
    );
    const activeDemands = demandsBefore.filter(
      (row) => (row as { deletedAt?: number | null }).deletedAt == null,
    );
    expect(activeDemands.length).toBeGreaterThanOrEqual(3);

    for (const event of [
      { id: eventA.docId, version: 1 },
      { id: eventB.docId, version: 1 },
    ]) {
      await proof.executeCommand(
        events,
        api.mutations.Event_submitForApproval,
        {
          docId: event.id,
          version: event.version,
        },
      );
      await proof.executeCommand(events, api.mutations.Event_approve, {
        docId: event.id,
        version: event.version + 1,
      });
    }

    const orders = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    const drafts = orders.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        String((row as { status?: string }).status) === "draft" &&
        (row as { vendorId?: string }).vendorId === vendor.docId,
    );
    expect(drafts).toHaveLength(1);
    const draft = drafts[0]! as {
      _id: string;
      status: string;
      sourceRangeStart?: number;
      vendorId: string;
    };
    expect(draft.status).toBe("draft");
    expect(draft.sourceRangeStart).toBe(S.weekStart);

    const flourDemandTotal =
      S.flourPerServing * S.headcountA + S.flourPerServing * S.headcountB;
    const expectedFlourOrder = flourDemandTotal - S.stockOnHand;
    const expectedSaltOrder = S.saltPerServing * S.headcountA;
    const expectedPepperOrder = S.pepperPerServing * S.headcountB;

    const lines = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrderLines").collect(),
    );
    const draftLines = lines.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { vendorOrderId?: string }).vendorOrderId === draft._id &&
        String((row as { status?: string }).status) !== "cancelled",
    );
    expect(draftLines).toHaveLength(3);

    const flourLine = draftLines.find(
      (row) => (row as { ingredientId?: string }).ingredientId === flour.docId,
    ) as { orderedQuantity: number } | undefined;
    const saltLine = draftLines.find(
      (row) => (row as { ingredientId?: string }).ingredientId === salt.docId,
    ) as { orderedQuantity: number } | undefined;
    const pepperLine = draftLines.find(
      (row) => (row as { ingredientId?: string }).ingredientId === pepper.docId,
    ) as { orderedQuantity: number } | undefined;

    expect(flourLine).toBeDefined();
    expect(Number(flourLine!.orderedQuantity)).toBeCloseTo(
      expectedFlourOrder,
      4,
    );
    expect(Number(saltLine!.orderedQuantity)).toBeCloseTo(expectedSaltOrder, 4);
    expect(Number(pepperLine!.orderedQuantity)).toBeCloseTo(
      expectedPepperOrder,
      4,
    );

    const needs = await inventory.run(async (ctx) =>
      ctx.db.query("purchaseNeeds").collect(),
    );
    const openNeeds = needs.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        String((row as { status?: string }).status) === "open",
    );
    expect(openNeeds.length).toBeGreaterThanOrEqual(3);
    for (const need of openNeeds) {
      expect((need as { vendorOrderId?: string }).vendorOrderId).toBe(
        draft._id,
      );
    }

    const links = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrderLineDemands").collect(),
    );
    const activeLinks = links.filter(
      (row) => (row as { deletedAt?: number | null }).deletedAt == null,
    );
    const demandIds = activeLinks.map(
      (row) => (row as { ingredientDemandId: string }).ingredientDemandId,
    );
    expect(new Set(demandIds).size).toBe(demandIds.length);

    await proof.executeCommand(events, api.mutations.Event_changeHeadcount, {
      docId: eventA.docId,
      version: 3,
      newHeadcount: S.headcountARevised,
    });

    const ordersAfter = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    const draftsAfter = ordersAfter.filter(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        String((row as { status?: string }).status) === "draft" &&
        (row as { vendorId?: string }).vendorId === vendor.docId,
    );
    expect(draftsAfter).toHaveLength(1);
    expect((draftsAfter[0] as { _id: string })._id).toBe(draft._id);
    expect((draftsAfter[0] as { status: string }).status).toBe("draft");

    const revisedFlourTotal =
      S.flourPerServing * S.headcountARevised +
      S.flourPerServing * S.headcountB;
    const linesAfter = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrderLines").collect(),
    );
    const flourLineAfter = linesAfter.find(
      (row) =>
        (row as { deletedAt?: number | null }).deletedAt == null &&
        (row as { vendorOrderId?: string }).vendorOrderId === draft._id &&
        (row as { ingredientId?: string }).ingredientId === flour.docId,
    ) as { orderedQuantity: number } | undefined;
    expect(flourLineAfter).toBeDefined();
    expect(Number(flourLineAfter!.orderedQuantity)).toBeCloseTo(
      revisedFlourTotal - S.stockOnHand,
      4,
    );
  });
});
