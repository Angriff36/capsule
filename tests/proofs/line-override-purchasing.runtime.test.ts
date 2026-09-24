/**
 * A kitchen substitution on one event moves the shopping list.
 * The master recipe stays as it was. Undoing the substitution puts the
 * original ingredient back.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-line-override-purchasing",
  startsAt: Date.UTC(2026, 8, 24, 16, 0),
  endsAt: Date.UTC(2026, 8, 24, 20, 0),
  servings: 10,
  replacedPortions: 4,
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

type DemandRow = {
  ingredientId: string;
  requiredQuantity: number;
  deletedAt?: number | null;
};

async function liveDemand(
  reader: ReturnType<ReturnType<typeof harness>["asRole"]>,
): Promise<Map<string, number>> {
  const rows = await reader.run(async (ctx) => {
    const demands = (await ctx.db
      .query("ingredientDemands")
      .collect()) as DemandRow[];
    return demands.filter((row) => row.deletedAt == null);
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(
      row.ingredientId,
      (totals.get(row.ingredientId) ?? 0) + Number(row.requiredQuantity),
    );
  }
  return totals;
}

describe("runtime proof: a kitchen substitution moves purchasing", () => {
  it("orders the stand-in and restores the original when the change is undone", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-override-purchasing",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-override-purchasing",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-override-purchasing",
      role: "kitchen_staff",
      tenantId: S.tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-override-purchasing",
      role: "inventory_staff",
      tenantId: S.tenantId,
    });

    const onion = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "onion",
        unit: "each",
        costPerUnit: 1,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };
    const shallot = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "shallot",
        unit: "each",
        costPerUnit: 2,
        allergens: [],
        category: "produce",
      },
    )) as { docId: string };
    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Onion tart",
        portionSize: 1,
        portionUnit: "portion",
        category: "entree",
      },
    )) as { docId: string };
    const line = (await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: dish.docId,
        ingredientId: onion.docId,
        quantity: 1,
        unit: "each",
        wasteFactor: 1,
      },
    )) as { docId: string };
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      {
        clientType: "company",
        companyName: "Substitution lunch client",
      },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Substitution lunch",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: S.servings,
        primaryContactName: "Pat Planner",
        budgetAmount: 800,
        quotedPrice: 1200,
      },
    )) as { docId: string };
    const eventDish = (await proof.executeCommand(
      events,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: event.docId,
        dishId: dish.docId,
        quantityServings: S.servings,
      },
    )) as { docId: string };

    const before = await liveDemand(inventory);
    expect(before.get(onion.docId)).toBe(S.servings);
    expect(before.get(shallot.docId) ?? 0).toBe(0);

    const override = (await proof.executeCommand(
      kitchen,
      api.mutations.EventDishLineOverride_createViaApply,
      {
        eventDishId: eventDish.docId,
        eventId: event.docId,
        kind: "replace",
        targetDishIngredientId: line.docId,
        ingredientId: shallot.docId,
        quantity: 1,
        unit: "each",
        portionsAffected: S.replacedPortions,
        reason: "Guest cannot eat onions",
      },
    )) as { docId: string };

    const after = await liveDemand(inventory);
    expect(after.get(onion.docId)).toBe(S.servings - S.replacedPortions);
    expect(after.get(shallot.docId)).toBe(S.replacedPortions);

    const recipeLine = await kitchen.run(async (ctx) => {
      const row = await ctx.db.get(line.docId as never);
      return row as { quantity: number; ingredientId: string } | null;
    });
    expect(recipeLine?.ingredientId).toBe(onion.docId);
    expect(recipeLine?.quantity).toBe(1);

    await proof.executeCommand(
      kitchen,
      api.mutations.EventDishLineOverride_revoke,
      {
        docId: override.docId,
        reason: "Guest can eat onions after all",
      },
    );

    const restored = await liveDemand(inventory);
    expect(restored.get(onion.docId)).toBe(S.servings);
    expect(restored.get(shallot.docId) ?? 0).toBe(0);
  });
});
