/**
 * Runtime proof: adding a catering package whose dishes are not in the dish
 * list yet creates those dishes, their prep step and the event menu lines in
 * one go (Drop Off / Limited Service "Express" books, 2026-10-04).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";
import {
  cateringPackages,
  defaultCateringSelections,
} from "../../src/data/cateringPackages";

beforeAll(ensureTestFieldEncryptionKey);

const TENANT = "tenant-express-package";
type Created = { docId: string };

describe("runtime proof: catering package with new dishes", () => {
  it("creates the dishes, prep steps and menu lines", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-express",
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
      name: "Express kitchen",
    });
    const client = await run(api.mutations.Client_createViaRegister, {
      clientType: "company",
      companyName: "Office lunch client",
    });
    const event = await run(api.mutations.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Office lunch",
      eventType: "catering",
      startsAt: Date.UTC(2026, 11, 3, 18, 0),
      endsAt: Date.UTC(2026, 11, 3, 20, 0),
      expectedHeadcount: 30,
      primaryContactName: "Sky Lunch",
      budgetAmount: 1000,
      quotedPrice: 1500,
    });
    const pack = cateringPackages.find((p) => p.id === "express-mexican-menu")!;
    const result = (await owner.mutation(
      (api.lib as never as Record<string, Record<string, never>>)
        .operationalTransactions.applyCateringPackage,
      {
        eventId: event.docId,
        packageId: pack.id,
        operationKey: "express-test-1",
        selections: defaultCateringSelections(pack, 30),
      } as never,
    )) as { savedDishIds: string[]; createdRecipes: number; prepTasks: number };

    expect(result.createdRecipes).toBe(3);
    expect(result.savedDishIds).toHaveLength(3);
    expect(result.prepTasks).toBe(3);
    const rows = (await owner.run(async (ctx) => ({
      dishes: await ctx.db.query("dishes").collect(),
      lines: await ctx.db.query("eventDishes").collect(),
    }))) as {
      dishes: Array<{ name: string; status: string }>;
      lines: Array<{ quantityServings: number }>;
    };
    expect(rows.dishes.map((d) => d.name).sort()).toEqual([
      "Black Beans",
      "Cilantro Lime Rice",
      "Taco Bar",
    ]);
    expect(rows.lines.map((l) => l.quantityServings)).toEqual([30, 30, 30]);
  });

  it("a dish whose recipe is listed twice still goes on an event, counted once", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-duplicate-recipe",
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
      name: "Duplicate kitchen",
    });
    const beans = await run(api.mutations.Component_createViaDraft, {
      name: "Black beans base",
      yieldQuantity: 10,
      yieldUnit: "portion",
      batchMultiplier: 1,
    });
    const dish = await run(api.mutations.Dish_createViaIntroduce, {
      name: "Black Beans",
      portionSize: 1,
      portionUnit: "portion",
    });
    // The same recipe attached three times, as repeated imports left it.
    for (let i = 0; i < 3; i++)
      await run(api.mutations.DishComponent_createViaAttach, {
        dishId: dish.docId,
        componentId: beans.docId,
        yieldQuantity: 10,
        batchMultiplier: 1,
      });
    const client = await run(api.mutations.Client_createViaRegister, {
      clientType: "company",
      companyName: "Duplicate client",
    });
    const event = await run(api.mutations.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title: "Duplicate lunch",
      eventType: "catering",
      startsAt: Date.UTC(2026, 11, 3, 18, 0),
      endsAt: Date.UTC(2026, 11, 3, 20, 0),
      expectedHeadcount: 30,
      primaryContactName: "Sky Duplicate",
      budgetAmount: 1000,
      quotedPrice: 1500,
    });
    const line = await run(api.mutations.EventDish_createViaAddToEvent, {
      eventId: event.docId,
      dishId: dish.docId,
      quantityServings: 30,
    });
    const seeds = (await owner.run((ctx) =>
      ctx.db.query("eventDishComponentSeeds").collect(),
    )) as Array<{
      eventDishId: string;
      componentId: string;
      batchMultiplier: number;
    }>;
    const mine = seeds.filter((s) => s.eventDishId === line.docId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      componentId: beans.docId,
      batchMultiplier: 1,
    });
  });
});
