/**
 * Runtime proof (PL-SCALE, AC-172): the event Menu tab's recipe, price and
 * stock rows (convex/menuRecipeLookup.ts) come only from the menu's dishes,
 * never from another company, and each kind keeps the read rule of its
 * generated list. The tab read the company's whole lists before.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const TENANT = "tenant-menu-recipe-lookup";
const OTHER = "tenant-menu-recipe-lookup-other";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Named = { name: string };
type Rows = {
  dishIngredients: { ingredientId: string }[];
  dishComponents: { componentId: string }[];
  components: Named[];
  componentIngredients: { ingredientId: string }[];
  ingredients: Named[];
  priceObservations: unknown[];
  unitMappings: { ingredientId?: string | null; equalsQuantity: number }[];
  containers: Named[];
  inventoryItems: { ingredientId: string; quantityOnHand: number }[];
  inventoryReservations: unknown[];
};

describe("runtime proof: a menu reads only its own recipe rows (AC-172)", () => {
  it("returns the menu dishes' rows, by read rule, inside the company", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "menu-recipe-owner",
      role: "owner",
      tenantId: TENANT,
    });
    const buyer = proof.asRole({
      subject: "menu-recipe-buyer",
      role: "procurement_staff",
      tenantId: TENANT,
    });
    const driver = proof.asRole({
      subject: "menu-recipe-driver",
      role: "driver",
      tenantId: TENANT,
    });
    const outsider = proof.asRole({
      subject: "menu-recipe-outsider",
      role: "owner",
      tenantId: OTHER,
    });

    const ids = await owner.run(async (ctx) => {
      const ingredient = async (
        name: string,
        substituteIngredientIds?: string[],
      ) =>
        (await ctx.db.insert("ingredients", {
          tenantId: TENANT,
          name,
          unit: "pound",
          costPerUnit: 4,
          status: "active",
          substituteIngredientIds,
          version: 1,
        })) as Id<"ingredients">;
      const dish = async (name: string) =>
        (await ctx.db.insert("dishes", {
          tenantId: TENANT,
          name,
          portionSize: 1,
          portionUnit: "each",
          status: "active",
          version: 1,
        })) as Id<"dishes">;
      const trout = await ingredient("Trout");
      const salmon = await ingredient("Salmon", [trout]);
      const dill = await ingredient("Dill");
      const beef = await ingredient("Beef");
      const onMenu = await dish("Salmon plate");
      const offMenu = await dish("Beef plate");
      await ctx.db.insert("dishIngredients", {
        tenantId: TENANT,
        dishId: onMenu,
        ingredientId: salmon,
        quantity: 2,
        unit: "pound",
        sortOrder: 0,
        version: 1,
      });
      await ctx.db.insert("dishIngredients", {
        tenantId: TENANT,
        dishId: onMenu,
        ingredientId: beef,
        quantity: 1,
        unit: "pound",
        sortOrder: 1,
        deletedAt: 1,
        version: 1,
      });
      await ctx.db.insert("dishIngredients", {
        tenantId: TENANT,
        dishId: offMenu,
        ingredientId: beef,
        quantity: 3,
        unit: "pound",
        sortOrder: 0,
        version: 1,
      });
      const sauce = await ctx.db.insert("components", {
        tenantId: TENANT,
        name: "Dill sauce",
        versionNumber: 1,
        yieldQuantity: 1,
        yieldUnit: "quart",
        status: "published",
        version: 1,
      });
      await ctx.db.insert("componentIngredients", {
        tenantId: TENANT,
        componentId: sauce,
        ingredientId: dill,
        quantity: 0.5,
        unit: "pound",
        sortOrder: 0,
        version: 1,
      });
      await ctx.db.insert("dishComponents", {
        tenantId: TENANT,
        dishId: onMenu,
        componentId: sauce,
        sortOrder: 0,
        yieldQuantity: 1,
        batchMultiplier: 1,
        version: 1,
      });
      await ctx.db.insert("dishContainers", {
        tenantId: TENANT,
        dishId: onMenu,
        name: "Half pan",
        serviceMethod: "cold_service",
        servingsPerContainer: 12,
        baseQuantity: 1,
        unit: "each",
        status: "active",
        version: 1,
      });
      await ctx.db.insert("itemUnitMappings", {
        tenantId: TENANT,
        ingredientId: salmon,
        kind: "pack",
        unit: "case",
        equalsQuantity: 10,
        equalsUnit: "pound",
        version: 1,
      });
      await ctx.db.insert("itemUnitMappings", {
        tenantId: TENANT,
        ingredientId: beef,
        kind: "pack",
        unit: "case",
        equalsQuantity: 20,
        equalsUnit: "pound",
        version: 1,
      });
      await ctx.db.insert("itemUnitMappings", {
        tenantId: TENANT,
        kind: "density",
        unit: "cup",
        equalsQuantity: 8,
        equalsUnit: "fluid_ounce",
        version: 1,
      });
      await ctx.db.insert("itemUnitMappings", {
        tenantId: OTHER,
        kind: "density",
        unit: "cup",
        equalsQuantity: 99,
        equalsUnit: "fluid_ounce",
        version: 1,
      });
      const walkIn = await ctx.db.insert("storageLocations", {
        tenantId: TENANT,
        name: "Walk-in",
        status: "active",
        version: 1,
      });
      for (const [ingredientId, quantityOnHand] of [
        [trout, 5],
        [beef, 40],
      ] as const)
        await ctx.db.insert("inventoryItems", {
          tenantId: TENANT,
          ingredientId,
          locationId: walkIn,
          quantityOnHand,
          unit: "pound",
          parLevel: 0,
          reorderThreshold: 0,
          unitCost: 4,
          version: 1,
        });
      return { onMenu, salmon, trout, sauce };
    });

    const rows = (await owner.query(api.menuRecipeLookup.forDishes, {
      dishIds: [ids.onMenu, ids.onMenu, "not-an-id"],
    })) as Rows;
    // The menu dish's live lines only; the other dish's beef never comes.
    expect(rows.dishIngredients.map((r) => r.ingredientId)).toEqual([
      ids.salmon,
    ]);
    expect(rows.components.map((r) => r.name)).toEqual(["Dill sauce"]);
    expect(rows.componentIngredients).toHaveLength(1);
    // Menu ingredients plus the saved substitute (trout).
    expect(rows.ingredients.map((r) => r.name).sort()).toEqual([
      "Dill",
      "Salmon",
      "Trout",
    ]);
    expect(rows.containers.map((r) => r.name)).toEqual(["Half pan"]);
    // Salmon's pack size and the company's general mapping; not beef's,
    // not another company's.
    expect(rows.unitMappings.map((r) => r.equalsQuantity).sort()).toEqual([
      10, 8,
    ]);
    // Stock of the substitute; beef stock is not on this menu.
    expect(rows.inventoryItems.map((r) => r.ingredientId)).toEqual([ids.trout]);

    // A buyer sees ingredients, mappings and stock, not the recipes.
    const bought = (await buyer.query(api.menuRecipeLookup.forDishes, {
      dishIds: [ids.onMenu],
    })) as Rows;
    expect(bought.dishIngredients).toEqual([]);
    expect(bought.components).toEqual([]);
    expect(bought.ingredients).toHaveLength(3);
    expect(bought.inventoryItems).toHaveLength(1);

    // A driver reads none of it; another company reads nothing of ours.
    const driven = (await driver.query(api.menuRecipeLookup.forDishes, {
      dishIds: [ids.onMenu],
    })) as Rows;
    for (const list of Object.values(driven)) expect(list).toEqual([]);
    const theirs = (await outsider.query(api.menuRecipeLookup.forDishes, {
      dishIds: [ids.onMenu],
    })) as Rows;
    const { unitMappings: theirMappings, ...theirRecipe } = theirs;
    for (const list of Object.values(theirRecipe)) expect(list).toEqual([]);
    // Their own general mapping only.
    expect(theirMappings.map((r) => r.equalsQuantity)).toEqual([99]);
  });
});
