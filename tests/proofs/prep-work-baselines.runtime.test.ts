/**
 * Runtime proof (PL-PREP, spec BE-11.1 / BE-11.2 / CF-10.6): generated prep
 * work keeps its recipe baseline, follows a changed menu line in place, never
 * rewrites finished work, and leaves a kitchen override alone.
 * AC-484 one generated task per recipe step with its recipe facts, no
 * duplicate on replay; AC-485 recalculation updates unstarted generated work
 * in place and leaves an override untouched; AC-487 half-finished work keeps
 * its recorded amount and only the rest is opened; AC-337 a recipe change
 * after the work is finished is listed for review and the finished task is
 * never edited.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  harness,
  readRow,
  rolesFor,
  runner,
  type Proof,
  type Role,
} from "./pack-quantity-override-survival.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type PrepRow = {
  _id: string;
  tenantId: string;
  eventId: string;
  eventDishId: string;
  dishId?: string | null;
  dishTaskId?: string | null;
  componentId?: string | null;
  name: string;
  quantity: number;
  completedQuantity?: number | null;
  unit: string;
  station?: string | null;
  specialInstructions?: string | null;
  isGenerated: boolean;
  overrideOfDishTaskId?: string | null;
  recipeTemplateVersion?: number | null;
  recipeTemplateName?: string | null;
  status: string;
  version: number;
  dueAt?: number | null;
  deletedAt?: number | null;
};

interface World {
  proof: Proof;
  kitchen: Role;
  manager: Role;
  eventId: string;
  run: (role: Role) => ReturnType<typeof runner>;
}

async function world(tenantId: string): Promise<World> {
  const proof = harness();
  const roles = rolesFor(proof, tenantId);
  const manager = proof.asRole({
    subject: `manager-${tenantId}`,
    role: "manager",
    tenantId,
  });
  const run = (role: Role) => runner(proof, role);
  const client = await run(roles.sales)(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Prep baselines ${tenantId}`,
  });
  const event = await run(roles.sales)(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Prep baselines dinner",
    eventType: "catering",
    startsAt: Date.UTC(2026, 10, 14, 17, 0),
    endsAt: Date.UTC(2026, 10, 14, 22, 0),
    expectedHeadcount: 40,
    primaryContactName: "Pat Planner",
    budgetAmount: 4000,
    quotedPrice: 5000,
  });
  return {
    proof,
    kitchen: roles.kitchen,
    manager,
    eventId: event.docId,
    run,
  };
}

async function recipe(w: World, name: string) {
  const component = await w.run(w.kitchen)(M.Component_createViaDraft, {
    name,
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  await w.run(w.kitchen)(M.Component_publishVersion, {
    docId: component.docId,
  });
  return component.docId;
}

/** A dish with two recipe steps: make the sauce (linked to its recipe), plate. */
async function dishWithSteps(w: World, name: string) {
  const kitchen = w.run(w.kitchen);
  const sauce = await recipe(w, `${name} sauce`);
  const dish = await kitchen(M.Dish_createViaIntroduce, {
    name,
    portionSize: 1,
    portionUnit: "portion",
    category: "entree",
  });
  const make = await kitchen(M.DishTask_createViaAdd, {
    dishId: dish.docId,
    name: `Make sauce for ${name}`,
    defaultQuantity: 1,
    defaultUnit: "portion",
    station: "Hot line",
    componentId: sauce,
    instructions: "Reduce by half",
  });
  const plate = await kitchen(M.DishTask_createViaAdd, {
    dishId: dish.docId,
    name: `Plate ${name}`,
    defaultQuantity: 1,
    defaultUnit: "portion",
    station: "Pass",
  });
  return {
    dishId: dish.docId,
    sauce,
    make: make.docId,
    plate: plate.docId,
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

const reconcilePrep = async (w: World, eventDishId: string) =>
  (await w.kitchen.mutation(
    api.lib.culinaryOperations.reconcileEventPrepWorkBalance,
    { eventDishId: eventDishId as Id<"eventDishes"> },
  )) as { created: number; updated: number; unresolved: unknown[] };

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

const stepRows = (rows: PrepRow[], dishTaskId: string) =>
  rows.filter((t) => t.dishTaskId === dishTaskId && t.status !== "cancelled");

describe("runtime proof: prep baselines, overrides and partial work (PL-PREP)", () => {
  it("AC-484: one generated task per recipe step carries its recipe facts and a replay creates no duplicate", async () => {
    const w = await world("tenant-prep-shape");
    const dish = await dishWithSteps(w, "Halibut");
    const line = await addDish(w, dish.dishId, 40);

    await reconcilePrep(w, line);
    const rows = await prep(w, line);
    expect(rows).toHaveLength(2);
    const make = stepRows(rows, dish.make);
    expect(make).toHaveLength(1);
    const template = await readRow<{ version: number; name: string }>(
      w.kitchen,
      dish.make,
    );
    expect(make[0]).toMatchObject({
      eventId: w.eventId,
      eventDishId: line,
      dishId: dish.dishId,
      dishTaskId: dish.make,
      componentId: dish.sauce,
      name: "Make sauce for Halibut",
      quantity: 40,
      unit: "portion",
      station: "Hot line",
      specialInstructions: "Reduce by half",
      isGenerated: true,
      status: "pending",
      recipeTemplateVersion: template.version,
      recipeTemplateName: template.name,
    });
    // No time was given, so none is made up from the event start.
    expect(make[0].dueAt ?? null).toBeNull();
    expect(make[0].overrideOfDishTaskId ?? null).toBeNull();

    const replay = await reconcilePrep(w, line);
    expect(replay).toMatchObject({ created: 0, updated: 0, unresolved: [] });
    const again = await prep(w, line);
    expect(again.map((t) => [t._id, t.version]).sort()).toEqual(
      rows.map((t) => [t._id, t.version]).sort(),
    );
  });

  it("AC-485: a servings change updates unstarted generated work in place and leaves an override untouched", async () => {
    const w = await world("tenant-prep-recalc");
    const dish = await dishWithSteps(w, "Chicken");
    const line = await addDish(w, dish.dishId, 40);
    await reconcilePrep(w, line);
    const before = await prep(w, line);
    const make = stepRows(before, dish.make)[0];
    const plate = stepRows(before, dish.plate)[0];
    await w.run(w.kitchen)(M.PrepTask_markOverride, {
      docId: plate._id,
      overrideOfDishTaskId: dish.plate,
      reason: "Client plates it themselves",
      name: "Send plates in bulk",
      specialInstructions: "Stack 40 plates in the hot box",
    });
    const overridden = await readRow<PrepRow>(w.kitchen, plate._id);

    await w.run(w.manager)(M.EventDish_adjustServings, {
      docId: line,
      quantityServings: 60,
    });
    await reconcilePrep(w, line);

    const after = await prep(w, line);
    const makeAfter = stepRows(after, dish.make);
    expect(makeAfter.map((t) => t._id)).toEqual([make._id]);
    expect(makeAfter[0].quantity).toBe(60);
    const overrideAfter = await readRow<PrepRow>(w.kitchen, plate._id);
    expect(overrideAfter).toMatchObject({
      name: "Send plates in bulk",
      specialInstructions: "Stack 40 plates in the hot box",
      quantity: 40,
      isGenerated: false,
      overrideOfDishTaskId: dish.plate,
      version: overridden.version,
    });
    // The extra 20 plates are new generated work next to the override.
    const extra = stepRows(after, dish.plate).filter(
      (t) => t._id !== plate._id,
    );
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ quantity: 20, isGenerated: true });
  });

  it("AC-487: half-finished work keeps its recorded amount and only the rest is opened", async () => {
    const w = await world("tenant-prep-partial");
    const dish = await dishWithSteps(w, "Short rib");
    const line = await addDish(w, dish.dishId, 40);
    await reconcilePrep(w, line);
    const make = stepRows(await prep(w, line), dish.make)[0];
    await finish(w, make._id, 20);

    await w.run(w.manager)(M.EventDish_adjustServings, {
      docId: line,
      quantityServings: 60,
    });
    const change = await reconcilePrep(w, line);
    expect(change.unresolved).toEqual([]);

    const rows = stepRows(await prep(w, line), dish.make);
    expect(rows.find((t) => t._id === make._id)).toMatchObject({
      status: "completed",
      quantity: 40,
      completedQuantity: 20,
    });
    const open = rows.filter((t) => t.status !== "completed");
    expect(open).toHaveLength(1);
    expect(open[0].quantity).toBe(40);
    // A replay opens nothing more.
    expect(await reconcilePrep(w, line)).toMatchObject({
      created: 0,
      updated: 0,
    });
    expect(stepRows(await prep(w, line), dish.make)).toHaveLength(2);
  });

  it("AC-488: a person can drop one link of a waiting loop; the link and the reason stay as history", async () => {
    const w = await world("tenant-prep-loop");
    const dish = await dishWithSteps(w, "Duck");
    const line = await addDish(w, dish.dishId, 20);
    await reconcilePrep(w, line);
    const rows = await prep(w, line);
    const make = stepRows(rows, dish.make)[0];
    const plate = stepRows(rows, dish.plate)[0];
    const kitchen = w.run(w.kitchen);
    await kitchen(M.PrepTaskDependency_createViaDeclare, {
      dependentTaskId: plate._id,
      predecessorTaskId: make._id,
    });
    const back = await kitchen(M.PrepTaskDependency_createViaDeclare, {
      dependentTaskId: make._id,
      predecessorTaskId: plate._id,
    });

    await expect(
      kitchen(M.PrepTaskDependency_dropLink, {
        docId: back.docId,
        reason: " ",
      }),
    ).rejects.toThrow(/why you're dropping/i);
    await kitchen(M.PrepTaskDependency_dropLink, {
      docId: back.docId,
      reason: "Sauce does not wait for plating",
    });
    const dropped = await readRow<{
      isSatisfied: boolean;
      requirementReleasedAt?: number | null;
      requirementReleaseReason?: string | null;
      dependentTaskId: string;
      predecessorTaskId: string;
    }>(w.kitchen, back.docId);
    expect(dropped).toMatchObject({
      isSatisfied: true,
      requirementReleaseReason: "Sauce does not wait for plating",
      dependentTaskId: make._id,
      predecessorTaskId: plate._id,
    });
    expect(dropped.requirementReleasedAt).toEqual(expect.any(Number));
    // A dropped link cannot be dropped twice.
    await expect(
      kitchen(M.PrepTaskDependency_dropLink, {
        docId: back.docId,
        reason: "again",
      }),
    ).rejects.toThrow();

    // New work for the same step after a servings change never gets the
    // dropped link back.
    await finish(w, make._id, 20);
    await w.run(w.manager)(M.EventDish_adjustServings, {
      docId: line,
      quantityServings: 30,
    });
    await reconcilePrep(w, line);
    const extra = stepRows(await prep(w, line), dish.make).find(
      (t) => t._id !== make._id,
    )!;
    expect(extra.quantity).toBe(10);
    const links = (await w.kitchen.run(async (ctx) =>
      ctx.db.query("prepTaskDependencies").collect(),
    )) as unknown as { dependentTaskId: string; predecessorTaskId: string }[];
    expect(
      links.filter(
        (l) =>
          l.dependentTaskId === extra._id && l.predecessorTaskId === plate._id,
      ),
    ).toEqual([]);
  });

  it("AC-337: a recipe change after the work is finished is listed for review and the finished task is never edited", async () => {
    const w = await world("tenant-prep-review");
    const dish = await dishWithSteps(w, "Salmon");
    const line = await addDish(w, dish.dishId, 30);
    await reconcilePrep(w, line);
    const make = stepRows(await prep(w, line), dish.make)[0];
    await finish(w, make._id, 30);
    const finished = await readRow<PrepRow>(w.kitchen, make._id);

    // The chef swaps the sauce recipe on the dish after the sauce was made.
    const newSauce = await recipe(w, "Salmon beurre blanc");
    await w.run(w.kitchen)(M.DishTask_revise, {
      docId: dish.make,
      name: "Make sauce for Salmon",
      defaultQuantity: 1,
      defaultUnit: "portion",
      station: "Hot line",
      componentId: newSauce,
      instructions: "Mount with cold butter",
    });

    const review = (await w.kitchen.query(
      api.lib.culinaryOperations.eventPrepWorkReview,
      { eventId: w.eventId as Id<"events"> },
    )) as {
      eventDishId: string;
      steps: { dishTaskId: string; taskIds: string[]; reason: string }[];
    }[];
    const forLine = review.find((r) => r.eventDishId === line);
    expect(forLine).toBeDefined();
    const step = forLine!.steps.find((s) => s.dishTaskId === dish.make);
    expect(step).toBeDefined();
    expect(step!.taskIds).toContain(make._id);
    expect(step!.reason).toMatch(/recipe differs/i);

    // The writer leaves the step alone and never edits the finished task.
    const result = await reconcilePrep(w, line);
    expect(
      (result.unresolved as { dishTaskId: string }[]).map((u) => u.dishTaskId),
    ).toContain(dish.make);
    expect(await readRow<PrepRow>(w.kitchen, make._id)).toEqual(finished);
  });
});
