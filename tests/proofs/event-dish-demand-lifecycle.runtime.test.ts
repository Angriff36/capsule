/**
 * Runtime proof (PL-DEMAND, BE-9.3 reconciliation rules): one event menu line
 * through its whole life. Adding a dish writes one demand row per recipe line
 * (AC-442); a servings change rescales the same demand rows, prep row and
 * pack item (AC-443); removing a dish retires its demand and unstarted prep
 * but keeps finished prep (AC-444); a guest-count change moves only dishes
 * that follow guest count (AC-445, AC-379); 100 -> 150 servings scales once
 * and keeps a kitchen change and finished prep identifiable (AC-070); a
 * kitchen change survives every recalculation until it is undone (AC-447).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  harness,
  liveRows,
  listedPackItems,
  openPackList,
  readRow,
  rolesFor,
  runner,
  type Proof,
  type Role,
} from "./pack-quantity-override-survival.runtime.helpers";

const M = api.mutations;
const WHEN = {
  startsAt: Date.UTC(2026, 10, 7, 17, 0),
  endsAt: Date.UTC(2026, 10, 7, 22, 0),
};

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type ContributionRow = {
  _id: string;
  tenantId: string;
  eventDishId: string;
  componentId?: string | null;
  ingredientId: string;
  unit: string;
  quantity: number;
  servings: number;
  sourceKey?: string | null;
  ownership?: string | null;
  supersededAt?: number | null;
  deletedAt?: number | null;
};

type PrepRow = {
  _id: string;
  tenantId: string;
  eventDishId: string;
  dishTaskId?: string | null;
  quantity: number;
  completedQuantity?: number | null;
  status: string;
  deletedAt?: number | null;
};

type Reconcile = {
  created: number;
  updated: number;
  superseded: number;
  unchanged: number;
};

interface World {
  proof: Proof;
  tenantId: string;
  kitchen: Role;
  events: Role;
  manager: Role;
  eventId: string;
  butter: string;
  cream: string;
  onion: string;
  shallot: string;
  run: (role: Role) => ReturnType<typeof runner>;
}

/** Kitchen book: a sauce recipe (butter + cream), and a dish per call that
 * uses it plus its own onion line, two prep steps and a 10-serving pan. */
async function world(tenantId: string, headcount: number): Promise<World> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const manager = proof.asRole({
    subject: `manager-${tenantId}`,
    role: "manager",
    tenantId,
  });
  const run = (role: Role) => runner(proof, role);
  const kitchen = run(roles.kitchen);
  const ingredient = (name: string, unit: string) =>
    kitchen(M.Ingredient_createViaIntroduce, {
      name,
      unit,
      costPerUnit: 3,
      allergens: [],
      category: "pantry",
    });
  const butter = await ingredient("butter", "pound");
  const cream = await ingredient("heavy cream", "quart");
  const onion = await ingredient("onion", "each");
  const shallot = await ingredient("shallot", "each");
  const client = await run(roles.sales)(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Demand lifecycle ${tenantId}`,
  });
  const event = await run(roles.sales)(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Demand lifecycle dinner",
    eventType: "catering",
    startsAt: WHEN.startsAt,
    endsAt: WHEN.endsAt,
    expectedHeadcount: headcount,
    primaryContactName: "Pat Planner",
    budgetAmount: 4000,
    quotedPrice: 5000,
  });
  return {
    proof,
    tenantId,
    kitchen: roles.kitchen,
    events: roles.events,
    manager,
    eventId: event.docId,
    butter: butter.docId,
    cream: cream.docId,
    onion: onion.docId,
    shallot: shallot.docId,
    run,
  };
}

async function sauceDish(w: World, name: string) {
  const kitchen = w.run(w.kitchen);
  const recipe = await kitchen(M.Component_createViaDraft, {
    name: `${name} sauce`,
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  await kitchen(M.ComponentIngredient_createViaAdd, {
    componentId: recipe.docId,
    ingredientId: w.butter,
    quantity: 0.25,
    unit: "pound",
  });
  await kitchen(M.ComponentIngredient_createViaAdd, {
    componentId: recipe.docId,
    ingredientId: w.cream,
    quantity: 2,
    unit: "fluid_ounce",
  });
  await kitchen(M.Component_publishVersion, { docId: recipe.docId });
  const dish = await kitchen(M.Dish_createViaIntroduce, {
    name,
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
  const onionLine = await kitchen(M.DishIngredient_createViaAdd, {
    dishId: dish.docId,
    ingredientId: w.onion,
    quantity: 1,
    unit: "each",
    wasteFactor: 1,
  });
  const steps: string[] = [];
  for (const step of ["Make sauce", "Plate"]) {
    const task = await kitchen(M.DishTask_createViaAdd, {
      dishId: dish.docId,
      name: `${step} for ${name}`,
      defaultQuantity: 1,
      defaultUnit: "portion",
      station: "Hot line",
      componentId: recipe.docId,
    });
    steps.push(task.docId);
  }
  await kitchen(M.DishContainer_createViaDefine, {
    dishId: dish.docId,
    name: `${name} pan`,
    serviceMethod: "cooked_at_kitchen",
    servingsPerContainer: 10,
    baseQuantity: 0,
    unit: "each",
  });
  return {
    dishId: dish.docId,
    recipeId: recipe.docId,
    onionLineId: onionLine.docId,
    steps,
  };
}

async function addDish(w: World, dishId: string, servings: number) {
  const line = await w.run(w.manager)(M.EventDish_createViaAddToEvent, {
    eventId: w.eventId,
    dishId,
    quantityServings: servings,
  });
  return line.docId;
}

const reconcile = async (w: World) =>
  (await w.kitchen.mutation(api.culinaryDemand.reconcileEventDemand, {
    eventId: w.eventId as Id<"events">,
  })) as Reconcile;

const reconcilePrep = async (w: World, eventDishId: string) =>
  await w.kitchen.mutation(
    api.lib.culinaryOperations.reconcileEventPrepWorkBalance,
    { eventDishId: eventDishId as Id<"eventDishes"> },
  );

async function contributions(w: World, eventDishId: string) {
  return (
    await liveRows<ContributionRow>(
      w.kitchen,
      "eventIngredientContributions",
      w.tenantId,
    )
  ).filter(
    (r) =>
      r.eventDishId === eventDishId &&
      r.supersededAt == null &&
      (r.ownership ?? "event_dish") === "event_dish",
  );
}

async function allContributions(w: World, eventDishId: string) {
  return (
    (await w.kitchen.run(async (ctx) =>
      ctx.db.query("eventIngredientContributions").collect(),
    )) as unknown as ContributionRow[]
  ).filter((r) => r.eventDishId === eventDishId);
}

async function prep(w: World, eventDishId: string) {
  return (
    (await w.kitchen.run(async (ctx) =>
      ctx.db.query("prepTasks").collect(),
    )) as unknown as PrepRow[]
  ).filter((t) => t.eventDishId === eventDishId && t.deletedAt == null);
}

/** A cook finished this prep row (fixture: the finished record itself). */
async function finish(w: World, taskId: string, amount: number) {
  await w.kitchen.run(async (ctx) => {
    await ctx.db.patch(taskId as Id<"prepTasks">, {
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now(),
      completedQuantity: amount,
    });
  });
}

const keyOf = (r: ContributionRow) =>
  `${r.componentId ?? "-"}|${r.ingredientId}|${r.unit}`;
const byIngredient = (rows: ContributionRow[], id: string) =>
  rows.filter((r) => r.ingredientId === id);

describe("runtime proof: an event menu line through its life (PL-DEMAND)", () => {
  it("AC-442: adding a dish creates exactly one demand row per recipe line and a replay creates none", async () => {
    const w = await world("tenant-demand-add", 20);
    const sauce = await sauceDish(w, "Halibut");
    const line = await addDish(w, sauce.dishId, 20);

    await reconcile(w);
    const rows = await contributions(w, line);
    // butter + cream through the recipe, onion from the dish's own line.
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(keyOf)).size).toBe(3);
    expect(byIngredient(rows, w.butter)[0].quantity).toBeCloseTo(5, 6);
    expect(byIngredient(rows, w.cream)[0]).toMatchObject({ unit: "quart" });
    expect(byIngredient(rows, w.cream)[0].quantity).toBeCloseTo(1.25, 6);
    expect(byIngredient(rows, w.onion)[0].quantity).toBeCloseTo(20, 6);

    expect(await reconcile(w)).toMatchObject({
      created: 0,
      updated: 0,
      superseded: 0,
    });
    const again = await contributions(w, line);
    expect(again.map((r) => r._id).sort()).toEqual(
      rows.map((r) => r._id).sort(),
    );
  });

  it("AC-443: a servings change updates the same demand rows, prep row and pan count", async () => {
    const w = await world("tenant-demand-rescale", 40);
    const sauce = await sauceDish(w, "Chicken");
    const line = await addDish(w, sauce.dishId, 40);
    const packListId = await openPackList(
      w.proof,
      w.tenantId,
      w.eventId,
      "Rescale pack",
    );
    await reconcile(w);
    await reconcilePrep(w, line);
    const rowsBefore = await contributions(w, line);
    const prepBefore = await prep(w, line);
    const packBefore = await listedPackItems(w.kitchen, w.tenantId, packListId);
    expect(prepBefore).toHaveLength(2);
    expect(prepBefore.every((t) => t.quantity === 40)).toBe(true);
    expect(packBefore).toHaveLength(1);
    expect(packBefore[0].requiredQuantity).toBe(4);

    await w.run(w.manager)(M.EventDish_adjustServings, {
      docId: line,
      quantityServings: 60,
    });
    const change = await reconcile(w);
    expect(change.created).toBe(0);
    expect(change.superseded).toBe(0);

    const rowsAfter = await contributions(w, line);
    expect(rowsAfter.map((r) => r._id).sort()).toEqual(
      rowsBefore.map((r) => r._id).sort(),
    );
    for (const row of rowsAfter) {
      const before = rowsBefore.find((r) => r._id === row._id)!;
      expect(row.quantity).toBeCloseTo(before.quantity * 1.5, 6);
      expect(row.servings).toBe(60);
    }
    const prepAfter = await prep(w, line);
    expect(prepAfter.map((t) => t._id).sort()).toEqual(
      prepBefore.map((t) => t._id).sort(),
    );
    expect(prepAfter.every((t) => t.quantity === 60)).toBe(true);
    const packAfter = await listedPackItems(w.kitchen, w.tenantId, packListId);
    expect(packAfter.map((p) => p._id)).toEqual(packBefore.map((p) => p._id));
    expect(packAfter[0].requiredQuantity).toBe(6);
  });

  it("AC-444: removing a dish retires its demand and unstarted prep and keeps finished prep", async () => {
    const w = await world("tenant-demand-remove", 30);
    const pulled = await sauceDish(w, "Pulled pork");
    const kept = await sauceDish(w, "Salmon");
    const pulledLine = await addDish(w, pulled.dishId, 30);
    const keptLine = await addDish(w, kept.dishId, 30);
    await reconcile(w);
    await reconcilePrep(w, pulledLine);
    await reconcilePrep(w, keptLine);
    const pulledPrep = await prep(w, pulledLine);
    const made = pulledPrep.find((t) => t.dishTaskId === pulled.steps[0])!;
    const notStarted = pulledPrep.find(
      (t) => t.dishTaskId === pulled.steps[1],
    )!;
    await finish(w, made._id, 30);
    const keptBefore = await contributions(w, keptLine);

    await w.run(w.manager)(M.EventDish_remove, {
      docId: pulledLine,
      reason: "Client dropped the pork",
    });
    await reconcile(w);

    expect(await contributions(w, pulledLine)).toHaveLength(0);
    const history = await allContributions(w, pulledLine);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((r) => r.deletedAt != null && r.quantity === 0)).toBe(
      true,
    );
    expect((await readRow<PrepRow>(w.kitchen, made._id)).status).toBe(
      "completed",
    );
    expect(
      (await readRow<PrepRow>(w.kitchen, made._id)).completedQuantity,
    ).toBe(30);
    expect((await readRow<PrepRow>(w.kitchen, notStarted._id)).status).toBe(
      "cancelled",
    );
    const keptAfter = await contributions(w, keptLine);
    expect(keptAfter.map((r) => [r._id, r.quantity])).toEqual(
      keptBefore.map((r) => [r._id, r.quantity]),
    );
  });

  it("AC-445 + AC-379: a guest-count change moves only dishes that follow guest count, once", async () => {
    const w = await world("tenant-demand-headcount", 40);
    const follows = await sauceDish(w, "Buffet chicken");
    const fixed = await sauceDish(w, "Passed sliders");
    const followLine = await addDish(w, follows.dishId, 40);
    const fixedLine = await addDish(w, fixed.dishId, 24);
    await reconcile(w);
    const fixedBefore = await contributions(w, fixedLine);
    const followBefore = await contributions(w, followLine);

    await w.run(w.events)(M.Event_changeHeadcount, {
      docId: w.eventId,
      version: 1,
      newHeadcount: 50,
    });
    expect(
      (await readRow<{ quantityServings: number }>(w.kitchen, followLine))
        .quantityServings,
    ).toBe(50);
    expect(
      (await readRow<{ quantityServings: number }>(w.kitchen, fixedLine))
        .quantityServings,
    ).toBe(24);

    const change = await reconcile(w);
    expect(change.created).toBe(0);
    expect(change.superseded).toBe(0);
    const followAfter = await contributions(w, followLine);
    for (const row of followAfter) {
      const before = followBefore.find((r) => r._id === row._id)!;
      expect(row.quantity).toBeCloseTo((before.quantity * 50) / 40, 6);
    }
    expect(
      (await contributions(w, fixedLine)).map((r) => [r._id, r.quantity]),
    ).toEqual(fixedBefore.map((r) => [r._id, r.quantity]));
    // Once: the replay writes nothing.
    expect(await reconcile(w)).toMatchObject({
      created: 0,
      updated: 0,
      superseded: 0,
    });
    // Purchasing follows: the event's butter need is the two dishes' sum.
    const demands = (
      await liveRows<{
        tenantId: string;
        eventId: string;
        ingredientId: string;
        requiredQuantity: number;
        deletedAt?: number | null;
      }>(w.kitchen, "ingredientDemands", w.tenantId)
    ).filter((d) => d.eventId === w.eventId && d.ingredientId === w.butter);
    expect(demands).toHaveLength(1);
    expect(Number(demands[0].requiredQuantity)).toBeCloseTo(
      0.25 * 50 + 0.25 * 24,
      6,
    );
  });

  it("AC-070: 100 -> 150 servings scales once; the kitchen change and finished prep stay identifiable", async () => {
    const w = await world("tenant-demand-150", 100);
    const sauce = await sauceDish(w, "Short rib");
    const line = await addDish(w, sauce.dishId, 100);
    const change = await w.run(w.kitchen)(
      M.EventDishLineOverride_createViaApply,
      {
        eventDishId: line,
        eventId: w.eventId,
        kind: "replace",
        targetDishIngredientId: sauce.onionLineId,
        ingredientId: w.shallot,
        quantity: 1,
        unit: "each",
        portionsAffected: 10,
        reason: "Ten guests cannot eat onion",
      },
    );
    await reconcile(w);
    await reconcilePrep(w, line);
    const made = (await prep(w, line)).find(
      (t) => t.dishTaskId === sauce.steps[0],
    )!;
    await finish(w, made._id, 100);
    const before = await contributions(w, line);

    await w.run(w.manager)(M.EventDish_adjustServings, {
      docId: line,
      quantityServings: 150,
    });
    await reconcile(w);
    const after = await contributions(w, line);
    for (const ingredient of [w.butter, w.cream]) {
      const was = byIngredient(before, ingredient)[0];
      const now = byIngredient(after, ingredient)[0];
      expect(now._id).toBe(was._id);
      expect(now.quantity).toBeCloseTo(was.quantity * 1.5, 6);
    }
    // The swap is still ten portions of shallot; onion carries the rest.
    expect(byIngredient(after, w.shallot)[0].quantity).toBeCloseTo(10, 6);
    expect(byIngredient(after, w.onion)[0].quantity).toBeCloseTo(140, 6);
    expect(
      (
        await readRow<{ appliedAt?: number; revokedAt?: number | null }>(
          w.kitchen,
          change.docId,
        )
      ).revokedAt ?? null,
    ).toBeNull();
    // Finished prep keeps its 100; only the 50 still to make is open work.
    const steps = (await prep(w, line)).filter(
      (t) => t.dishTaskId === sauce.steps[0],
    );
    expect(steps.find((t) => t._id === made._id)).toMatchObject({
      status: "completed",
      completedQuantity: 100,
    });
    const open = steps.filter((t) => t.status !== "completed");
    expect(open).toHaveLength(1);
    expect(open[0].quantity).toBe(50);

    expect(await reconcile(w)).toMatchObject({
      created: 0,
      updated: 0,
      superseded: 0,
    });
  });

  it("AC-447: a kitchen change survives every recalculation until it is undone", async () => {
    const w = await world("tenant-demand-override", 20);
    const sauce = await sauceDish(w, "Tart");
    const line = await addDish(w, sauce.dishId, 20);
    const change = await w.run(w.kitchen)(
      M.EventDishLineOverride_createViaApply,
      {
        eventDishId: line,
        eventId: w.eventId,
        kind: "replace",
        targetDishIngredientId: sauce.onionLineId,
        ingredientId: w.shallot,
        quantity: 1,
        unit: "each",
        portionsAffected: 5,
        reason: "Five guests cannot eat onion",
      },
    );
    for (let round = 0; round < 3; round++) {
      await reconcile(w);
      await reconcilePrep(w, line);
    }
    await w.run(w.manager)(M.EventDish_adjustServings, {
      docId: line,
      quantityServings: 30,
    });
    await reconcile(w);
    let rows = await contributions(w, line);
    expect(byIngredient(rows, w.shallot)[0].quantity).toBeCloseTo(5, 6);
    expect(byIngredient(rows, w.onion)[0].quantity).toBeCloseTo(25, 6);

    await w.run(w.kitchen)(M.EventDishLineOverride_revoke, {
      docId: change.docId,
      reason: "Guests can eat onion after all",
    });
    await reconcile(w);
    rows = await contributions(w, line);
    expect(byIngredient(rows, w.shallot)).toHaveLength(0);
    expect(byIngredient(rows, w.onion)[0].quantity).toBeCloseTo(30, 6);
  });
});
