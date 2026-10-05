/**
 * Seed for the event food-cost proofs (AC-334, AC-449): one priced ingredient
 * and one unpriced one on a dish, the dish on a 40-guest event with a quote,
 * an issued invoice, the event walked to closed_out (the EventClosedOut
 * reaction seeds the draft closeout). Assertion-free.
 */
import { api } from "../../convex/_generated/api";
import {
  harness,
  rolesFor,
  runner,
  S,
  type Cmd,
  type Proof,
  type Role,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";

export { harness, rolesFor, runner, S };
export type { Proof, Role };

export const FOOD = {
  butterPerGuest: 0.5,
  butterPrice: 4,
  saffronPerGuest: 0.1,
} as const;

export function kitchenOf(proof: Proof, tenantId: string) {
  return proof.asRole({
    subject: `kitchen-${tenantId}`,
    role: "kitchen_manager",
    tenantId,
  });
}

async function cancelOpenPackLists(
  proof: Proof,
  logistics: Role,
  eventId: string,
) {
  const rows = (await logistics.run(async (ctx) =>
    ctx.db.query("packLists").collect(),
  )) as Array<{
    _id: string;
    eventId?: string;
    deletedAt?: number | null;
    status?: string;
    version?: number;
  }>;
  for (const pack of rows) {
    if (pack.eventId !== eventId || pack.deletedAt != null) continue;
    if (pack.status === "cancelled" || pack.status === "dispatched") continue;
    await proof.executeCommand(logistics, api.mutations.PackList_cancel, {
      docId: pack._id,
      reason: "Food-cost proof skips packing",
      version: pack.version,
    } as never);
  }
}

export async function seedCostedEvent(proof: Proof, tenantId: string) {
  const roles = rolesFor(proof, tenantId);
  const kitchen = kitchenOf(proof, tenantId);
  const cook = runner(proof, kitchen);
  const butter = await cook(api.mutations.Ingredient_createViaIntroduce, {
    name: "Food-cost butter",
    unit: "pound",
    costPerUnit: FOOD.butterPrice,
    allergens: [],
    category: "dairy",
  });
  // Never priced: the catalog field holds its 0 default.
  const saffron = await cook(api.mutations.Ingredient_createViaIntroduce, {
    name: "Food-cost saffron",
    unit: "pound",
    costPerUnit: 0,
    allergens: [],
    category: "spice",
  });
  const dish = await cook(api.mutations.Dish_createViaIntroduce, {
    name: "Food-cost risotto",
    portionSize: 1,
    portionUnit: "portion",
    category: "entree",
  });
  for (const [ingredientId, quantity] of [
    [butter.docId, FOOD.butterPerGuest],
    [saffron.docId, FOOD.saffronPerGuest],
  ] as const)
    await cook(api.mutations.DishIngredient_createViaAdd, {
      dishId: dish.docId,
      ingredientId,
      quantity,
      unit: "pound",
      wasteFactor: 1,
    });

  const sell = runner(proof, roles.sales);
  const client = await sell(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `Food-cost client ${tenantId}`,
  });
  const event = await sell(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Food-cost dinner",
    eventType: "corporate dinner",
    venueName: "Proof Hall",
    serviceStyleName: "Plated",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.expectedHeadcount,
    primaryContactName: "Casey Cost",
    budgetAmount: S.budgetAmount,
    quotedPrice: S.quotedPrice,
  });
  await runner(proof, roles.events)(
    api.mutations.EventDish_createViaAddToEvent,
    {
      eventId: event.docId,
      dishId: dish.docId,
      quantityServings: S.expectedHeadcount,
    },
  );
  const invoice = await runner(proof, roles.finance)(
    api.mutations.Invoice_createViaIssue,
    {
      clientId: client.docId,
      eventId: event.docId,
      invoiceNumber: `INV-FC-${tenantId}`,
      subtotal: S.quotedPrice,
      taxAmount: 0,
      discountAmount: 0,
      total: S.quotedPrice,
    },
  );
  return { roles, kitchen, butter, saffron, dish, event, invoice };
}

/** Walk the seeded event to closed_out; returns the reaction-seeded closeout id. */
export async function closeOut(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<string> {
  const roles = rolesFor(proof, tenantId);
  const plan: Array<readonly [Role, Cmd]> = [
    [roles.events, api.mutations.Event_submitForApproval],
    [roles.events, api.mutations.Event_approve],
    [roles.sales, api.mutations.Event_lockForSales],
    [roles.events, api.mutations.Event_beginExecution],
    [roles.events, api.mutations.Event_finalizeEvent],
    [roles.events, api.mutations.Event_complete],
    [roles.events, api.mutations.Event_closeOut],
  ];
  for (const [role, cmd] of plan) {
    if (cmd === api.mutations.Event_beginExecution)
      await cancelOpenPackLists(proof, roles.logistics, eventId);
    const live = (await role.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as { version: number };
    await proof.executeCommand(role, cmd, {
      docId: eventId,
      version: live.version,
    } as never);
  }
  const closeouts = (await roles.finance.run(async (ctx) =>
    ctx.db.query("eventCloseouts").collect(),
  )) as Array<{ _id: string; eventId: string }>;
  const row = closeouts.find((c) => c.eventId === eventId);
  if (!row) throw new Error("closeout was not seeded");
  return row._id;
}
