/**
 * Runtime proof (PL-DEMAND, BE-9.3/BE-9.6 recipe edition rule).
 *
 * - AC-459: trying changes in a draft does not rewrite event demand; a publish
 *   lists the events that follow it and the finished events that keep theirs.
 * - AC-446: a published recipe change updates a future event's demand and
 *   leaves a finished event untouched; its prep is not duplicated.
 * - AC-333 / AC-072: the finished event keeps its demand rows, recipe seed and
 *   agreed price after the recipe publishes a new edition; recalculating it
 *   writes nothing.
 * - AC-448: finished prep stays recorded against the step as it was made; a
 *   later recipe change becomes remaining work only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cookEdition } from "../../src/features/kitchen/PublishedMethodPanel";
import {
  harness,
  liveRows,
  readRow,
  rolesFor,
  runner,
  type Role,
} from "./pack-quantity-override-survival.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type ContributionRow = {
  _id: string;
  tenantId: string;
  eventId: string;
  eventDishId: string;
  ingredientId: string;
  quantity: number;
  supersededAt?: number | null;
  deletedAt?: number | null;
};

type PrepRow = {
  _id: string;
  eventDishId: string;
  dishTaskId?: string | null;
  quantity: number;
  unit: string;
  completedQuantity?: number | null;
  recipeTemplateVersion?: number | null;
  status: string;
  deletedAt?: number | null;
};

async function setup(tenantId: string) {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const kitchen = runner(proof, roles.kitchen);
  const sales = runner(proof, roles.sales);
  const events = runner(proof, roles.events);
  const ingredient = (name: string, unit: string) =>
    kitchen(M.Ingredient_createViaIntroduce, {
      name,
      unit,
      costPerUnit: 4,
      allergens: [],
      category: "dairy",
    });
  const butter = await ingredient("butter", "pound");
  const cream = await ingredient("heavy cream", "quart");
  const recipe = await kitchen(M.Component_createViaDraft, {
    name: "Beurre blanc",
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  const butterLine = await kitchen(M.ComponentIngredient_createViaAdd, {
    componentId: recipe.docId,
    ingredientId: butter.docId,
    quantity: 0.25,
    unit: "pound",
  });
  await kitchen(M.ComponentIngredient_createViaAdd, {
    componentId: recipe.docId,
    ingredientId: cream.docId,
    quantity: 2,
    unit: "fluid_ounce",
  });
  const publish = async () =>
    (await roles.kitchen.mutation(
      api.culinaryDemandSweep.publishRecipeEdition,
      { componentId: recipe.docId as Id<"components"> },
    )) as {
      following: { eventId: string }[];
      keeping: { eventId: string }[];
    };
  await publish();
  const dish = await kitchen(M.Dish_createViaIntroduce, {
    name: "Halibut",
    portionSize: 1,
    portionUnit: "portion",
    category: "entree",
  });
  await kitchen(M.DishComponent_createViaAttach, {
    dishId: dish.docId,
    componentId: recipe.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });
  // Sauce is made by weight: a quarter pound per guest.
  const makeSauce = await kitchen(M.DishTask_createViaAdd, {
    dishId: dish.docId,
    name: "Make beurre blanc",
    defaultQuantity: 0.25,
    defaultUnit: "pound",
    station: "Sauce",
    componentId: recipe.docId,
  });
  const client = await sales(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Edition client ${tenantId}`,
  });
  const newEvent = async (title: string, day: number, guests: number) => {
    const event = await sales(M.Event_createViaPlanEngagement, {
      clientId: client.docId,
      title,
      eventType: "catering",
      venueName: "Proof Hall",
      serviceStyleName: "Plated",
      startsAt: Date.UTC(2026, 10, day, 17, 0),
      endsAt: Date.UTC(2026, 10, day, 22, 0),
      expectedHeadcount: guests,
      primaryContactName: "Pat Planner",
      budgetAmount: 3000,
      quotedPrice: 4200,
    });
    const line = await events(M.EventDish_createViaAddToEvent, {
      eventId: event.docId,
      dishId: dish.docId,
      quantityServings: guests,
    });
    return { eventId: event.docId, lineId: line.docId };
  };
  const reconcile = async (eventId: string) =>
    (await roles.kitchen.mutation(api.culinaryDemand.reconcileEventDemand, {
      eventId: eventId as Id<"events">,
    })) as {
      created: number;
      updated: number;
      superseded: number;
      historyKept?: boolean;
    };
  const sweep = async () => {
    let cursor = 0;
    for (;;) {
      const page = (await roles.kitchen.mutation(
        api.culinaryDemandSweep.reconcileLiveEventsForComponent,
        { componentId: recipe.docId as Id<"components">, cursor },
      )) as { hasMore: boolean; nextCursor: number };
      if (!page.hasMore) return;
      cursor = page.nextCursor;
    }
  };
  const reconcilePrep = async (lineId: string) =>
    await roles.kitchen.mutation(
      api.lib.culinaryOperations.reconcileEventPrepWorkBalance,
      { eventDishId: lineId as Id<"eventDishes"> },
    );
  /** Walk an event through the lifecycle to completed. */
  const finishEvent = async (eventId: string) => {
    const plan: Array<[Role, (typeof M)[keyof typeof M]]> = [
      [roles.events, M.Event_submitForApproval],
      [roles.events, M.Event_approve],
      [roles.sales, M.Event_lockForSales],
      [roles.events, M.Event_beginExecution],
      [roles.events, M.Event_finalizeEvent],
      [roles.events, M.Event_complete],
    ];
    for (const [role, cmd] of plan) {
      const { version } = await readRow<{ version: number }>(
        roles.kitchen,
        eventId,
      );
      await proof.executeCommand(
        role,
        cmd as never,
        {
          docId: eventId,
          version,
        } as never,
      );
    }
  };
  const demand = async (eventId: string) =>
    (
      await liveRows<ContributionRow>(
        roles.kitchen,
        "eventIngredientContributions",
        tenantId,
      )
    ).filter((r) => r.eventId === eventId && r.supersededAt == null);
  const prep = async (lineId: string) =>
    (
      (await roles.kitchen.run(async (ctx) =>
        ctx.db.query("prepTasks").collect(),
      )) as unknown as PrepRow[]
    ).filter((t) => t.eventDishId === lineId && t.deletedAt == null);
  return {
    proof,
    roles,
    kitchen,
    butter: butter.docId,
    cream: cream.docId,
    recipeId: recipe.docId,
    butterLineId: butterLine.docId,
    makeSauceId: makeSauce.docId,
    publish,
    newEvent,
    reconcile,
    sweep,
    reconcilePrep,
    finishEvent,
    demand,
    prep,
  };
}

const butterOf = (rows: ContributionRow[], butter: string) =>
  rows.filter((r) => r.ingredientId === butter);

describe("runtime proof: publishing a recipe edition (PL-DEMAND)", () => {
  it("drafts never rewrite event demand; a publish reaches future events and finished events keep theirs", async () => {
    const t = await setup("tenant-recipe-edition");
    const past = await t.newEvent("Last week's dinner", 2, 20);
    await t.reconcile(past.eventId);
    await t.finishEvent(past.eventId);
    const next = await t.newEvent("Next week's dinner", 20, 30);
    await t.reconcile(next.eventId);
    await t.reconcilePrep(next.lineId);

    const pastRows = await t.demand(past.eventId);
    const pastSeeds = (
      await liveRows<{
        _id: string;
        tenantId: string;
        eventDishId: string;
        yieldQuantity: number;
        batchMultiplier: number;
        servings: number;
      }>(t.roles.kitchen, "eventDishComponentSeeds", "tenant-recipe-edition")
    ).filter((s) => s.eventDishId === past.lineId);
    const pastEvent = await readRow<{ quotedPrice: number; stage: string }>(
      t.roles.kitchen,
      past.eventId,
    );
    expect(pastEvent.stage).toBe("completed");
    expect(butterOf(pastRows, t.butter)[0].quantity).toBeCloseTo(5, 6);
    expect(
      butterOf(await t.demand(next.eventId), t.butter)[0].quantity,
    ).toBeCloseTo(7.5, 6);

    // The impact list before any change.
    const impact = (await t.roles.kitchen.query(
      api.culinaryDemandSweep.recipeEditionImpact,
      { componentId: t.recipeId as Id<"components"> },
    )) as { following: { eventId: string }[]; keeping: { eventId: string }[] };
    expect(impact.following.map((e) => e.eventId)).toEqual([next.eventId]);
    expect(impact.keeping.map((e) => e.eventId)).toEqual([past.eventId]);

    // AC-459: take the recipe back to draft and try double butter.
    await t.kitchen(M.Component_retract, { docId: t.recipeId });
    await t.kitchen(M.ComponentIngredient_adjustQuantity, {
      docId: t.butterLineId,
      quantity: 0.5,
      unit: "pound",
    });
    await t.sweep();
    expect(
      butterOf(await t.demand(next.eventId), t.butter)[0].quantity,
    ).toBeCloseTo(7.5, 6);

    // Publish: the future event follows, the finished one keeps its rows.
    const published = await t.publish();
    expect(published.following.map((e) => e.eventId)).toEqual([next.eventId]);
    expect(published.keeping.map((e) => e.eventId)).toEqual([past.eventId]);
    await t.sweep();
    const nextRows = await t.demand(next.eventId);
    expect(butterOf(nextRows, t.butter)).toHaveLength(1);
    expect(butterOf(nextRows, t.butter)[0].quantity).toBeCloseTo(15, 6);

    // AC-446 / AC-333 / AC-072: the finished event is untouched.
    const pastAfter = await t.demand(past.eventId);
    expect(pastAfter.map((r) => [r._id, r.quantity]).sort()).toEqual(
      pastRows.map((r) => [r._id, r.quantity]).sort(),
    );
    const seedsAfter = (
      await liveRows<{
        _id: string;
        tenantId: string;
        eventDishId: string;
        yieldQuantity: number;
        batchMultiplier: number;
        servings: number;
      }>(t.roles.kitchen, "eventDishComponentSeeds", "tenant-recipe-edition")
    ).filter((s) => s.eventDishId === past.lineId);
    expect(seedsAfter).toEqual(pastSeeds);
    expect(
      (await readRow<{ quotedPrice: number }>(t.roles.kitchen, past.eventId))
        .quotedPrice,
    ).toBe(pastEvent.quotedPrice);
    expect(await t.reconcile(past.eventId)).toMatchObject({
      created: 0,
      updated: 0,
      superseded: 0,
      historyKept: true,
    });
    expect(
      (await t.demand(past.eventId)).map((r) => r.quantity).sort(),
    ).toEqual(pastRows.map((r) => r.quantity).sort());

    // The future event's prep is not duplicated by the recipe change.
    const prepBefore = await t.prep(next.lineId);
    await t.reconcilePrep(next.lineId);
    expect((await t.prep(next.lineId)).map((p) => p._id).sort()).toEqual(
      prepBefore.map((p) => p._id).sort(),
    );
  });

  it("a published edition keeps its method steps, so a cook follows them while the chef changes a draft", async () => {
    const t = await setup("tenant-recipe-edition-method");
    await t.kitchen(M.Component_retract, { docId: t.recipeId });
    await t.kitchen(M.ComponentStep_createViaAdd, {
      componentId: t.recipeId,
      instruction: "Reduce shallots in wine",
      sortOrder: 0,
      durationMinutes: 10,
    });
    await t.kitchen(M.ComponentStep_createViaAdd, {
      componentId: t.recipeId,
      instruction: "Whisk in cold butter",
      sortOrder: 1,
    });
    await t.publish();
    await t.kitchen(M.Component_retract, { docId: t.recipeId });
    // The chef tries a new step in the draft.
    await t.kitchen(M.ComponentStep_createViaAdd, {
      componentId: t.recipeId,
      instruction: "Add saffron",
      sortOrder: 2,
    });

    const recipe = await readRow<{
      _id: string;
      status: string;
      versionNumber: number;
    }>(t.roles.kitchen, t.recipeId);
    expect(recipe.status).toBe("draft");
    const saved = await liveRows<{
      _id: string;
      tenantId: string;
      componentId: string;
      versionNumber: number;
      snapshot: string;
    }>(t.roles.kitchen, "componentSnapshots", "tenant-recipe-edition-method");
    const edition = cookEdition(
      {
        _id: String(t.recipeId),
        status: recipe.status,
        versionNumber: Number(recipe.versionNumber),
      },
      saved,
    );
    expect(edition?.steps).toEqual([
      {
        instruction: "Reduce shallots in wine",
        sortOrder: 0,
        durationMinutes: 10,
      },
      {
        instruction: "Whisk in cold butter",
        sortOrder: 1,
        durationMinutes: null,
      },
    ]);

    // Once published again, the recipe as it stands is the method.
    await t.publish();
    const after = await readRow<{ status: string; versionNumber: number }>(
      t.roles.kitchen,
      t.recipeId,
    );
    expect(
      cookEdition(
        {
          _id: String(t.recipeId),
          status: after.status,
          versionNumber: Number(after.versionNumber),
        },
        saved,
      ),
    ).toBeNull();
  });

  it("AC-448: finished prep keeps the step as it was made; a recipe change adds only the remaining work", async () => {
    const t = await setup("tenant-recipe-edition-prep");
    const next = await t.newEvent("Gala", 21, 30);
    await t.reconcilePrep(next.lineId);
    const [made] = await t.prep(next.lineId);
    expect(made).toMatchObject({ quantity: 7.5, unit: "pound" });
    const madeVersion = made.recipeTemplateVersion;
    // A cook finished the whole 7.5 lb.
    await t.roles.kitchen.run(async (ctx) => {
      await ctx.db.patch(made._id as Id<"prepTasks">, {
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        completedQuantity: 7.5,
      });
    });

    // The chef changes the step to 0.3 lb a guest: 9 lb in all.
    const step = await readRow<{ version: number }>(
      t.roles.kitchen,
      t.makeSauceId,
    );
    await t.kitchen(M.DishTask_revise, {
      docId: t.makeSauceId,
      name: "Make beurre blanc",
      defaultQuantity: 0.3,
      defaultUnit: "pound",
      station: "Sauce",
      componentId: t.recipeId,
      version: step.version,
    });
    await t.reconcilePrep(next.lineId);

    const rows = await t.prep(next.lineId);
    const finished = rows.find((r) => r._id === made._id)!;
    expect(finished).toMatchObject({
      status: "completed",
      quantity: 7.5,
      completedQuantity: 7.5,
    });
    expect(finished.recipeTemplateVersion ?? null).toBe(madeVersion ?? null);
    const open = rows.filter((r) => r.status !== "completed");
    expect(open).toHaveLength(1);
    expect(open[0].quantity).toBeCloseTo(1.5, 6);
    expect(open[0].unit).toBe("pound");
  });
});
