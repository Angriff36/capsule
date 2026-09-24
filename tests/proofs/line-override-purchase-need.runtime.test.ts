/**
 * A kitchen substitution puts the stand-in on the buyer's list.
 * Ingredients the cook did not swap stay off that list.
 * Undoing the substitution drops the stand-in back to nothing to buy.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-line-override-purchase-need",
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

type NeedRow = {
  ingredientId: string;
  requiredQuantity: number;
  deletedAt?: number | null;
};

type DemandRow = {
  _id: string;
  ingredientId: string;
  version: number;
  status: string;
  deletedAt?: number | null;
};

async function liveNeeds(
  reader: ReturnType<ReturnType<typeof harness>["asRole"]>,
): Promise<Map<string, number>> {
  const rows = await reader.run(async (ctx) => {
    const needs = (await ctx.db.query("purchaseNeeds").collect()) as NeedRow[];
    return needs.filter((row) => row.deletedAt == null);
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

async function demandFor(
  reader: ReturnType<ReturnType<typeof harness>["asRole"]>,
  ingredientId: string,
): Promise<DemandRow | null> {
  const rows = await reader.run(async (ctx) => {
    return (await ctx.db.query("ingredientDemands").collect()) as DemandRow[];
  });
  return (
    rows.find(
      (row) => row.ingredientId === ingredientId && row.deletedAt == null,
    ) ?? null
  );
}

describe("runtime proof: a kitchen substitution opens a purchase line", () => {
  it("buys the stand-in and leaves untouched ingredients off the list", async () => {
    const proof = harness();
    const sales = proof.asRole({
      subject: "sales-stand-in-need",
      role: "sales_manager",
      tenantId: S.tenantId,
    });
    const events = proof.asRole({
      subject: "events-stand-in-need",
      role: "event_manager",
      tenantId: S.tenantId,
    });
    const kitchen = proof.asRole({
      subject: "kitchen-stand-in-need",
      role: "kitchen_staff",
      tenantId: S.tenantId,
    });
    const inventory = proof.asRole({
      subject: "inventory-stand-in-need",
      role: "inventory_staff",
      tenantId: S.tenantId,
    });

    const onion = await introduce(proof, kitchen, "onion");
    const shallot = await introduce(proof, kitchen, "shallot");
    const butter = await introduce(proof, kitchen, "butter");
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
    const onionLine = await addLine(proof, kitchen, dish.docId, onion);
    await addLine(proof, kitchen, dish.docId, butter);
    const client = (await proof.executeCommand(
      sales,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Stand-in lunch client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      sales,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Stand-in lunch",
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

    const onionDemand = await demandFor(inventory, onion);
    expect(onionDemand?.status).toBe("calculated");
    await proof.executeCommand(
      inventory,
      api.mutations.IngredientDemand_confirm,
      {
        docId: onionDemand!._id,
        version: onionDemand!.version,
      },
    );

    const opened = await liveNeeds(inventory);
    expect(opened.get(onion)).toBe(S.servings);
    expect(opened.has(shallot)).toBe(false);
    expect(opened.has(butter)).toBe(false);

    const override = (await proof.executeCommand(
      kitchen,
      api.mutations.EventDishLineOverride_createViaApply,
      {
        eventDishId: eventDish.docId,
        eventId: event.docId,
        kind: "replace",
        targetDishIngredientId: onionLine,
        ingredientId: shallot,
        quantity: 1,
        unit: "each",
        portionsAffected: S.replacedPortions,
        reason: "Guest cannot eat onions",
      },
    )) as { docId: string };

    const after = await liveNeeds(inventory);
    expect(after.get(onion)).toBe(S.servings - S.replacedPortions);
    expect(after.get(shallot)).toBe(S.replacedPortions);
    expect(after.has(butter)).toBe(false);

    await proof.executeCommand(
      kitchen,
      api.mutations.EventDishLineOverride_revoke,
      {
        docId: override.docId,
        reason: "Guest can eat onions after all",
      },
    );

    const restored = await liveNeeds(inventory);
    expect(restored.get(onion)).toBe(S.servings);
    expect(restored.get(shallot) ?? 0).toBe(0);
    expect(restored.has(butter)).toBe(false);
  });
});

async function introduce(
  proof: ReturnType<typeof harness>,
  kitchen: ReturnType<ReturnType<typeof harness>["asRole"]>,
  name: string,
): Promise<string> {
  const created = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name,
      unit: "each",
      costPerUnit: 1,
      allergens: [],
      category: "produce",
    },
  )) as { docId: string };
  return created.docId;
}

async function addLine(
  proof: ReturnType<typeof harness>,
  kitchen: ReturnType<ReturnType<typeof harness>["asRole"]>,
  dishId: string,
  ingredientId: string,
): Promise<string> {
  const created = (await proof.executeCommand(
    kitchen,
    api.mutations.DishIngredient_createViaAdd,
    {
      dishId,
      ingredientId,
      quantity: 1,
      unit: "each",
      wasteFactor: 1,
    },
  )) as { docId: string };
  return created.docId;
}
