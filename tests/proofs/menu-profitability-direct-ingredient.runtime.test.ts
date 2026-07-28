/**
 * Runtime proof: menu margin board costs direct DishIngredient lines, not only
 * component attachments — dishes with zero components must not stay incomplete.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { buildMenuProfitability } from "../../src/features/kitchen/MenuProfitabilityAnalysis";
import type { IngredientPriceObservationInput } from "../../src/features/kitchen/IngredientPriceHistory";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-menu-profitability-direct",
  sellingPrice: 24,
  qtyPerServing: 0.5,
  costPerUnit: 12.5,
  componentQtyPerBatch: 2,
  componentCostPerUnit: 3,
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

type ProofContext = ReturnType<typeof harness>;
type KitchenRole = ReturnType<ProofContext["asRole"]>;

async function createMenuWithDish(
  proof: ProofContext,
  kitchen: KitchenRole,
  dishId: string,
  sellingPrice: number,
) {
  const menu = (await proof.executeCommand(
    kitchen,
    api.mutations.Menu_createViaDraft,
    {
      name: "Menu profitability proof",
      basePrice: 0,
      pricePerPerson: 0,
      minGuests: 1,
      maxGuests: 100,
    },
  )) as { docId: string };

  await proof.executeCommand(kitchen, api.mutations.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId,
    sortOrder: 0,
    sellingPrice,
    course: "main",
  });

  return menu.docId;
}

async function loadMenuProfitability(kitchen: KitchenRole, menuId: string) {
  const [
    menuDishes,
    dishes,
    dishComponents,
    dishIngredients,
    componentIngredients,
    ingredients,
    priceObservations,
  ] = await Promise.all([
    kitchen.query(api.queries.listMenuDish),
    kitchen.query(api.queries.listDish),
    kitchen.query(api.queries.listDishComponent),
    kitchen.query(api.queries.listDishIngredient),
    kitchen.query(api.queries.listComponentIngredient),
    kitchen.query(api.queries.listIngredient),
    kitchen.query(api.queries.listIngredientPriceObservation),
  ]);

  return buildMenuProfitability({
    menuDishes: (menuDishes as Array<Record<string, unknown>>)
      .filter(
        (selection) =>
          selection.deletedAt == null && selection.menuId === menuId,
      )
      .map((selection) => ({
        id: String(selection._id),
        version: Number(selection.version),
        dishId: String(selection.dishId),
        sortOrder: Number(selection.sortOrder ?? 0),
        sellingPrice: selection.sellingPrice as
          number | string | null | undefined,
        course: selection.course as string | null | undefined,
        deletedAt: selection.deletedAt,
      })),
    dishes: (dishes as Array<Record<string, unknown>>).map((dish) => ({
      id: String(dish._id),
      name: String(dish.name),
      deletedAt: dish.deletedAt,
    })),
    dishComponents: (dishComponents as Array<Record<string, unknown>>).map(
      (attachment) => ({
        id: String(attachment._id),
        dishId: String(attachment.dishId),
        componentId: String(attachment.componentId),
        yieldQuantity: attachment.yieldQuantity as number | string,
        batchMultiplier: attachment.batchMultiplier as number | string,
        deletedAt: attachment.deletedAt,
      }),
    ),
    dishIngredients: (dishIngredients as Array<Record<string, unknown>>).map(
      (line) => ({
        id: String(line._id),
        dishId: String(line.dishId),
        ingredientId: String(line.ingredientId),
        quantity: line.quantity as number | string,
        unit: line.unit as never,
        wasteFactor: line.wasteFactor as number | string | null | undefined,
        addedAt: line.addedAt,
        deletedAt: line.deletedAt,
      }),
    ),
    componentIngredients: (
      componentIngredients as Array<Record<string, unknown>>
    ).map((line) => ({
      id: String(line._id),
      componentId: String(line.componentId),
      ingredientId: String(line.ingredientId),
      quantity: line.quantity as number | string,
      unit: line.unit as never,
      deletedAt: line.deletedAt,
    })),
    ingredients: (ingredients as Array<Record<string, unknown>>).map(
      (ingredient) => ({
        id: String(ingredient._id),
        name: String(ingredient.name),
        unit: ingredient.unit as never,
        costPerUnit: ingredient.costPerUnit as number | string,
        deletedAt: ingredient.deletedAt,
      }),
    ),
    priceObservations:
      (priceObservations as IngredientPriceObservationInput[]) ?? [],
  });
}

describe("runtime proof: menu profitability direct DishIngredient lines", () => {
  it("prices a dish with only same-unit direct ingredient lines as complete", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "kitchen-menu-profit-direct",
      role: "kitchen_manager",
      tenantId: S.tenantId,
    });

    const protein = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Menu-margin protein",
        unit: "pound",
        costPerUnit: S.costPerUnit,
        allergens: [],
        category: "protein",
      },
    )) as { docId: string };

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Direct-only entrée",
        portionSize: 1,
        portionUnit: "portion",
        category: "entrée",
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: dish.docId,
        ingredientId: protein.docId,
        quantity: S.qtyPerServing,
        unit: "pound",
        wasteFactor: 1,
      },
    );

    const menuId = await createMenuWithDish(
      proof,
      kitchen,
      dish.docId,
      S.sellingPrice,
    );
    const analysis = await loadMenuProfitability(kitchen, menuId);
    const row = analysis.rows.find((entry) => entry.dishId === dish.docId);

    expect(row?.componentCost).toBe(S.qtyPerServing * S.costPerUnit);
    expect(row?.costComplete).toBe(true);
    expect(row?.status).toBe("on_target");
    expect(row?.incompleteCostLineCount).toBe(0);
  });

  it("marks a direct line incomplete when the unit mismatches or price is missing", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "kitchen-menu-profit-incomplete",
      role: "kitchen_manager",
      tenantId: `${S.tenantId}-incomplete`,
    });

    const pricedIngredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Priced direct ingredient",
        unit: "pound",
        costPerUnit: S.costPerUnit,
        allergens: [],
        category: "protein",
      },
    )) as { docId: string };
    const mismatchedIngredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Mismatched direct ingredient",
        unit: "pound",
        costPerUnit: 999,
        allergens: [],
        category: "other",
      },
    )) as { docId: string };
    const unpricedIngredient = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Unpriced direct ingredient",
        unit: "pound",
        costPerUnit: 0,
        allergens: [],
        category: "other",
      },
    )) as { docId: string };

    const mismatchedDish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Mismatched-unit dish",
        portionSize: 1,
        portionUnit: "portion",
        category: "entrée",
      },
    )) as { docId: string };
    const unpricedDish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Unpriced-line dish",
        portionSize: 1,
        portionUnit: "portion",
        category: "entrée",
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: mismatchedDish.docId,
        ingredientId: pricedIngredient.docId,
        quantity: S.qtyPerServing,
        unit: "kilogram",
        wasteFactor: 1,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: unpricedDish.docId,
        ingredientId: unpricedIngredient.docId,
        quantity: S.qtyPerServing,
        unit: "pound",
        wasteFactor: 1,
      },
    );
    await proof.executeCommand(
      kitchen,
      api.mutations.DishIngredient_createViaAdd,
      {
        dishId: unpricedDish.docId,
        ingredientId: mismatchedIngredient.docId,
        quantity: 1,
        unit: "pound",
        wasteFactor: 1,
      },
    );

    const menuId = await createMenuWithDish(
      proof,
      kitchen,
      mismatchedDish.docId,
      S.sellingPrice,
    );
    await proof.executeCommand(kitchen, api.mutations.MenuDish_createViaAdd, {
      menuId,
      dishId: unpricedDish.docId,
      sortOrder: 1,
      sellingPrice: S.sellingPrice,
      course: "main",
    });

    const analysis = await loadMenuProfitability(kitchen, menuId);
    const mismatchedRow = analysis.rows.find(
      (entry) => entry.dishId === mismatchedDish.docId,
    );
    const unpricedRow = analysis.rows.find(
      (entry) => entry.dishId === unpricedDish.docId,
    );

    expect(mismatchedRow?.costComplete).toBe(false);
    expect(mismatchedRow?.status).toBe("incomplete_cost");
    expect(mismatchedRow?.incompleteCostLineCount).toBeGreaterThan(0);
    expect(unpricedRow?.costComplete).toBe(false);
    expect(unpricedRow?.status).toBe("incomplete_cost");
    expect(unpricedRow?.incompleteCostLineCount).toBeGreaterThan(0);
  });

  it("keeps component-only dish costing unchanged", async () => {
    const proof = harness();
    const kitchen = proof.asRole({
      subject: "kitchen-menu-profit-component",
      role: "kitchen_manager",
      tenantId: `${S.tenantId}-component`,
    });

    const flour = (await proof.executeCommand(
      kitchen,
      api.mutations.Ingredient_createViaIntroduce,
      {
        name: "Menu-margin flour",
        unit: "kilogram",
        costPerUnit: S.componentCostPerUnit,
        allergens: [],
        category: "dry",
      },
    )) as { docId: string };

    const component = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Menu-margin dough",
        yieldQuantity: 1,
        yieldUnit: "portion",
        batchMultiplier: 1,
        servesPerYield: 1,
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.Component_publishVersion,
      {
        docId: component.docId,
        version: 1,
      },
    );

    await proof.executeCommand(
      kitchen,
      api.mutations.ComponentIngredient_createViaAdd,
      {
        componentId: component.docId,
        ingredientId: flour.docId,
        quantity: S.componentQtyPerBatch,
        unit: "kilogram",
      },
    );

    const dish = (await proof.executeCommand(
      kitchen,
      api.mutations.Dish_createViaIntroduce,
      {
        name: "Component-only bread",
        portionSize: 1,
        portionUnit: "portion",
        category: "bread",
      },
    )) as { docId: string };

    await proof.executeCommand(
      kitchen,
      api.mutations.DishComponent_createViaAttach,
      {
        dishId: dish.docId,
        componentId: component.docId,
        yieldQuantity: 1,
        batchMultiplier: 1,
      },
    );

    const menuId = await createMenuWithDish(
      proof,
      kitchen,
      dish.docId,
      S.sellingPrice,
    );
    const analysis = await loadMenuProfitability(kitchen, menuId);
    const row = analysis.rows.find((entry) => entry.dishId === dish.docId);

    expect(row?.componentCost).toBe(
      S.componentQtyPerBatch * S.componentCostPerUnit,
    );
    expect(row?.costComplete).toBe(true);
    expect(row?.status).toBe("on_target");
    expect(row?.componentCount).toBe(1);
  });
});
