/**
 * Shared harness for the AC-390 recipe-quantity runtime proof: roles, the
 * planned-event seed, and one published component-dish pair per call so each
 * dish line drives exactly one live IngredientDemand. Demand and version
 * readers are assertion-free; the test file owns every expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
  headcount: 40,
} as const;

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Proof = ReturnType<typeof harness>;
export type Role = ReturnType<Proof["asRole"]>;
export type Cmd = Parameters<Proof["executeCommand"]>[1];

/** A command runner bound to one actor, for terse seed/step calls. */
export function runner(proof: Proof, role: Role) {
  return async (cmd: Cmd, args: Record<string, unknown>) =>
    (await proof.executeCommand(role, cmd, args as never)) as {
      docId: string;
    };
}

export function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; kitchen: Role } {
  return {
    sales: proof.asRole({
      subject: `sales-${tenantId}`,
      role: "sales_manager",
      tenantId,
    }),
    events: proof.asRole({
      subject: `event-manager-${tenantId}`,
      role: "event_manager",
      tenantId,
    }),
    kitchen: proof.asRole({
      subject: `kitchen-${tenantId}`,
      role: "kitchen_manager",
      tenantId,
    }),
  };
}

/** Company client + planned Event at the 40-guest seed headcount. */
export async function createPlannedEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string }> {
  const run = runner(proof, rolesFor(proof, tenantId).sales);
  const client = await run(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `Recipe survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Recipesheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** One ingredient + published component + dish on the event, seeded at the
 * 40-guest headcount — one dish line, one live demand. Real commands only. */
export async function seedComponentDishPair(
  proof: Proof,
  tenantId: string,
  eventId: string,
  nameSalt: string,
): Promise<{
  lineId: string;
  ingredientId: string;
  componentIngredientId: string;
}> {
  const roles = rolesFor(proof, tenantId);
  const runKitchen = runner(proof, roles.kitchen);
  const runEvent = runner(proof, roles.events);

  const ingredient = await runKitchen(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `AC-390 recipe ${nameSalt} ingredient ${tenantId}`,
      unit: "each",
      costPerUnit: 1,
      allergens: [],
      category: "dry",
    },
  );
  const component = await runKitchen(api.mutations.Component_createViaDraft, {
    name: `AC-390 recipe ${nameSalt} base ${tenantId}`,
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  const componentIngredient = await runKitchen(
    api.mutations.ComponentIngredient_createViaAdd,
    {
      componentId: component.docId,
      ingredientId: ingredient.docId,
      quantity: 1,
      unit: "each",
    },
  );
  await runKitchen(api.mutations.Component_publishVersion, {
    docId: component.docId,
    version: 1,
  });
  const dish = await runKitchen(api.mutations.Dish_createViaIntroduce, {
    name: `AC-390 recipe ${nameSalt} dish ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  });
  await runKitchen(api.mutations.DishComponent_createViaAttach, {
    dishId: dish.docId,
    componentId: component.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });
  const line = await runEvent(api.mutations.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: S.headcount,
  });
  return {
    lineId: line.docId,
    ingredientId: ingredient.docId,
    componentIngredientId: componentIngredient.docId,
  };
}

export type DemandRow = {
  _id: string;
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  tenantId: string;
  deletedAt: number | null;
};

/** Live (not deleted) ingredientDemands of one event, sorted by ingredient. */
export function listedDemands(
  actor: Role,
  eventId: string,
): Promise<DemandRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("ingredientDemands").collect() as unknown as Promise<
          DemandRow[]
        >,
    )
    .then((rows) =>
      rows
        .filter((row) => row.eventId === eventId && row.deletedAt == null)
        .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)),
    );
}

/** The live demand row for one ingredient of one event. */
export async function demandFor(
  actor: Role,
  eventId: string,
  ingredientId: string,
): Promise<DemandRow> {
  const rows = await listedDemands(actor, eventId);
  const found = rows.find((row) => row.ingredientId === ingredientId);
  if (!found) {
    throw new Error(`No live demand for ingredient ${ingredientId}`);
  }
  return found;
}

export type ComponentIngredientVersionRow = { version: number };

/** The live optimistic-concurrency version of one component ingredient line. */
export async function readIngredientVersion(
  actor: Role,
  componentIngredientId: string,
): Promise<number> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(componentIngredientId as never),
  )) as ComponentIngredientVersionRow;
  return row.version;
}
