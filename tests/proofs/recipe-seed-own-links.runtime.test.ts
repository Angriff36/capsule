/**
 * Runtime proof (PL-AUTH, AC-151 / AC-372): a recipe seed checked its own
 * event, dish line and recipe part, then wrote the links the caller sent.
 * Workspace B could take its own seed and point it at workspace A's event,
 * dish line and recipe part, and the recipe lines of A's part were read into
 * B's purchasing. Now the links sent must be the seed's own. Synthetic
 * workspaces only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createPlannedEvent,
  harness,
  rolesFor,
  type Proof,
} from "./reconciliation-failure-isolation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Links = {
  eventId: string;
  eventDishId: string;
  dishId: string;
  componentId: string;
};

/** A recipe part with one line, a dish using it, and that dish on an event. */
async function kitchenSetup(proof: Proof, tenantId: string): Promise<Links> {
  const { kitchen, events } = rolesFor(proof, tenantId);
  const { eventId } = await createPlannedEvent(proof, tenantId, "Seed dinner");
  const flour = (await proof.executeCommand(
    kitchen,
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `Seed flour ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 2,
      allergens: [],
      category: "pantry",
    },
  )) as { docId: string };
  const component = (await proof.executeCommand(
    kitchen,
    api.mutations.Component_createViaDraft,
    {
      name: `Seed dough ${tenantId}`,
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    },
  )) as { docId: string };
  await proof.executeCommand(
    kitchen,
    api.mutations.ComponentIngredient_createViaAdd,
    {
      componentId: component.docId,
      ingredientId: flour.docId,
      quantity: 1,
      unit: "kilogram",
    },
  );
  const dish = (await proof.executeCommand(
    kitchen,
    api.mutations.Dish_createViaIntroduce,
    {
      name: `Seed bread ${tenantId}`,
      portionSize: 1,
      portionUnit: "portion",
      category: "entree",
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
  const eventDish = (await proof.executeCommand(
    events,
    api.mutations.EventDish_createViaAddToEvent,
    { eventId, dishId: dish.docId, quantityServings: 10 },
  )) as { docId: string };
  return {
    eventId,
    eventDishId: eventDish.docId,
    dishId: dish.docId,
    componentId: component.docId,
  };
}

describe("a recipe seed keeps its own links (PL-AUTH)", () => {
  it("refuses another workspace's links and still seeds its own", async () => {
    const proof = harness();
    const a = await kitchenSetup(proof, "tenant-seed-a");
    const b = await kitchenSetup(proof, "tenant-seed-b");
    const { kitchen: kitchenB } = rolesFor(proof, "tenant-seed-b");

    // Adding the dish seeded it on its own, with the same links.
    const autoSeeds = await kitchenB.run((ctx) =>
      ctx.db.query("eventDishComponentSeeds").collect(),
    );
    const autoB = autoSeeds.filter((s) => s.tenantId === "tenant-seed-b");
    expect(autoB).toHaveLength(1);
    expect(autoB[0]!.seededAt).not.toBeNull();
    expect(autoB[0]!.componentId).toBe(b.componentId);

    // A second, not yet seeded seed of workspace B on its own records.
    const seedId = await kitchenB.run((ctx) =>
      ctx.db.insert("eventDishComponentSeeds", {
        tenantId: "tenant-seed-b",
        ...b,
        servings: 0,
        yieldQuantity: 1,
        batchMultiplier: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 0,
      }),
    );
    const readSeed = () => kitchenB.run((ctx) => ctx.db.get(seedId));
    const contributionsFor = (componentId: string) =>
      kitchenB.run(async (ctx) =>
        (await ctx.db.query("eventIngredientContributions").collect()).filter(
          (c) => c.componentId === componentId,
        ),
      );
    const before = await readSeed();
    const aContributionsBefore = await contributionsFor(a.componentId);

    const send = (links: Links) =>
      proof.executeCommand(
        kitchenB,
        api.mutations.EventDishComponentSeed_seed,
        {
          docId: seedId,
          ...links,
          servings: 10,
          yieldQuantity: 1,
          batchMultiplier: 1,
        },
      );

    // All of A's links, and each of A's links alone.
    const outside: Links[] = [
      a,
      { ...b, eventId: a.eventId },
      { ...b, eventDishId: a.eventDishId },
      { ...b, dishId: a.dishId },
      { ...b, componentId: a.componentId },
    ];
    for (const links of outside) {
      await expect(send(links)).rejects.toThrow();
    }
    expect(await readSeed()).toEqual(before);
    expect(await contributionsFor(a.componentId)).toEqual(aContributionsBefore);

    // Its own links still seed.
    await send(b);
    const after = await readSeed();
    expect(after!.seededAt).not.toBeNull();
    expect(after!.componentId).toBe(b.componentId);
    expect(after!.servings).toBe(10);
  });
});
