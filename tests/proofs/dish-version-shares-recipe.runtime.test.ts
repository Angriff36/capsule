/**
 * Runtime proof: a dish version that uses the main dish's recipe cooks from it
 * (Ryan 2026-10-04). Adding the version to an event seeds the main dish's
 * recipes and opens the main dish's prep steps; a version switched to its own
 * recipe uses only its own lines.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";

beforeAll(ensureTestFieldEncryptionKey);

const TENANT = "tenant-dish-version-recipe";
type Created = { docId: string };

describe("runtime proof: dish versions share the main recipe", () => {
  it("a sharing version uses the main recipe; an own-recipe version does not", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-version",
      role: "owner",
      tenantId: TENANT,
    });
    const run = (fn: unknown, args: Record<string, unknown>) =>
      proof.executeCommand(
        owner,
        fn as never,
        args as never,
      ) as Promise<Created>;

    await run(api.mutations.Organization_createViaRegister, {
      name: "Version kitchen",
    });
    const sauce = await run(api.mutations.Component_createViaDraft, {
      name: "Teriyaki sauce",
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    });
    const main = await run(api.mutations.Dish_createViaIntroduce, {
      name: "Grilled Chicken Teriyaki",
      portionSize: 1,
      portionUnit: "portion",
      category: "Finish at Event",
    });
    await run(api.mutations.DishComponent_createViaAttach, {
      dishId: main.docId,
      componentId: sauce.docId,
      yieldQuantity: 1,
      batchMultiplier: 1,
    });
    await run(api.mutations.DishTask_createViaAdd, {
      dishId: main.docId,
      name: "Grill chicken",
      category: "Finish at Event",
    });
    const kitchen = await run(api.mutations.Dish_createViaIntroduce, {
      name: "Grilled Chicken Teriyaki - Finish at Kitchen",
      portionSize: 1,
      portionUnit: "portion",
      category: "Finish at Kitchen",
    });
    await run(api.mutations.Dish_makeVersionOf, {
      docId: kitchen.docId,
      mainDishId: main.docId,
      label: "Finish at Kitchen",
    });
    const passed = await run(api.mutations.Dish_createViaIntroduce, {
      name: "Grilled Chicken Teriyaki - Passed",
      portionSize: 1,
      portionUnit: "portion",
      category: "Apps - Passed",
    });
    await run(api.mutations.Dish_makeVersionOf, {
      docId: passed.docId,
      mainDishId: main.docId,
      label: "Passed",
    });
    await run(api.mutations.Dish_useMainRecipe, {
      docId: passed.docId,
      shared: false,
    });

    const client = await run(api.mutations.Client_createViaRegister, {
      clientType: "company",
      companyName: "Version client",
    });
    const event = await run(api.mutations.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Version lunch",
      eventType: "catering",
      startsAt: Date.UTC(2026, 11, 3, 18, 0),
      endsAt: Date.UTC(2026, 11, 3, 22, 0),
      expectedHeadcount: 40,
      primaryContactName: "Sky Version",
      budgetAmount: 1000,
      quotedPrice: 1500,
    });
    const kitchenLine = await run(api.mutations.EventDish_createViaAddToEvent, {
      eventId: event.docId,
      dishId: kitchen.docId,
      quantityServings: 40,
    });
    const passedLine = await run(api.mutations.EventDish_createViaAddToEvent, {
      eventId: event.docId,
      dishId: passed.docId,
      quantityServings: 40,
    });

    const rows = (await owner.run(async (ctx) => ({
      lines: await ctx.db.query("eventDishes").collect(),
      seeds: await ctx.db.query("eventDishComponentSeeds").collect(),
      prep: await ctx.db.query("prepTasks").collect(),
    }))) as {
      lines: Array<{ _id: string; recipeDishId?: string | null }>;
      seeds: Array<{ eventDishId: string; componentId: string }>;
      prep: Array<{ eventDishId: string; name: string }>;
    };
    const line = (id: string) => rows.lines.find((l) => l._id === id)!;
    expect(line(kitchenLine.docId).recipeDishId).toBe(main.docId);
    expect(line(passedLine.docId).recipeDishId).toBe(passed.docId);
    expect(
      rows.seeds
        .filter((s) => s.eventDishId === kitchenLine.docId)
        .map((s) => s.componentId),
    ).toEqual([sauce.docId]);
    expect(
      rows.prep
        .filter((p) => p.eventDishId === kitchenLine.docId)
        .map((p) => p.name),
    ).toEqual(["Grill chicken"]);
    expect(
      rows.seeds.filter((s) => s.eventDishId === passedLine.docId),
    ).toEqual([]);
    expect(rows.prep.filter((p) => p.eventDishId === passedLine.docId)).toEqual(
      [],
    );
  });
});
