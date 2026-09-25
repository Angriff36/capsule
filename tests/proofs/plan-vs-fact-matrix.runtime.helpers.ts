/**
 * Shared harness for the AC-407 §6.5 submitted/ordered slice of the plan-vs-fact
 * matrix runtime proof: roles, the weekly-purchasing seed (vendor, config, two
 * ingredients, published components, dishes, approved event, weekly draft
 * lines), the submit step, and order-line readers. Assertion-free; the test
 * file owns every expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  // Same week as the buyer-qty proof so the week key is stable
  // (Event.planEngagement normalizes the purchasing week to Monday 08:00 UTC).
  startsAt: Date.UTC(2026, 6, 20, 12, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
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
): {
  sales: Role;
  events: Role;
  kitchen: Role;
  inventory: Role;
  procurement: Role;
} {
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
    inventory: proof.asRole({
      subject: `inventory-${tenantId}`,
      role: "inventory_staff",
      tenantId,
    }),
    procurement: proof.asRole({
      subject: `procurement-${tenantId}`,
      role: "procurement_staff",
      tenantId,
    }),
  };
}

export type WeeklySeed = {
  eventId: string;
  vendorOrderId: string;
  ingredientAId: string;
  ingredientBId: string;
  lineAId: string;
  lineBId: string;
};

/** One approved event with two dishes on two distinct ingredients, plus the
 * single weekly draft VendorOrder with one auto line per ingredient
 * (quantity 1 each per serving, no stock on hand → ordered 40 at 40 guests).
 * Lines are keyed by ingredient id sorted, so A/B never depend on row order. */
export async function seedWeeklyOrder(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<WeeklySeed> {
  const roles = rolesFor(proof, tenantId);
  const runSales = runner(proof, roles.sales);
  const runEvents = runner(proof, roles.events);
  const runKitchen = runner(proof, roles.kitchen);
  const runProcurement = runner(proof, roles.procurement);

  const vendor = await runProcurement(api.mutations.Vendor_createViaOnboard, {
    name: `Weekly plan-vs-fact vendor ${tenantId}`,
    paymentTermsDays: 14,
  });
  await runProcurement(
    api.mutations.WeeklyPurchasingConfig_createViaConfigure,
    { defaultVendorId: vendor.docId },
  );

  const saltLike = await runKitchen(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `AC-407 salt-like ${tenantId}`,
      unit: "each",
      costPerUnit: 1,
      allergens: [],
      category: "dry",
    },
  );
  const pepperLike = await runKitchen(
    api.mutations.Ingredient_createViaIntroduce,
    {
      name: `AC-407 pepper-like ${tenantId}`,
      unit: "each",
      costPerUnit: 1,
      allergens: [],
      category: "dry",
    },
  );

  const componentA = await runKitchen(api.mutations.Component_createViaDraft, {
    name: `AC-407 salt base ${tenantId}`,
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  const componentB = await runKitchen(api.mutations.Component_createViaDraft, {
    name: `AC-407 pepper base ${tenantId}`,
    yieldQuantity: 1,
    yieldUnit: "portion",
    batchMultiplier: 1,
  });
  await runKitchen(api.mutations.ComponentIngredient_createViaAdd, {
    componentId: componentA.docId,
    ingredientId: saltLike.docId,
    quantity: 1,
    unit: "each",
  });
  await runKitchen(api.mutations.ComponentIngredient_createViaAdd, {
    componentId: componentB.docId,
    ingredientId: pepperLike.docId,
    quantity: 1,
    unit: "each",
  });
  // Event.approve → ProductionBatch.plan requires published components.
  await runKitchen(api.mutations.Component_publishVersion, {
    docId: componentA.docId,
    version: 1,
  });
  await runKitchen(api.mutations.Component_publishVersion, {
    docId: componentB.docId,
    version: 1,
  });

  const dishA = await runKitchen(api.mutations.Dish_createViaIntroduce, {
    name: `AC-407 salt dish ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  });
  const dishB = await runKitchen(api.mutations.Dish_createViaIntroduce, {
    name: `AC-407 pepper dish ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  });
  await runKitchen(api.mutations.DishComponent_createViaAttach, {
    dishId: dishA.docId,
    componentId: componentA.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });
  await runKitchen(api.mutations.DishComponent_createViaAttach, {
    dishId: dishB.docId,
    componentId: componentB.docId,
    yieldQuantity: 1,
    batchMultiplier: 1,
  });

  const client = await runSales(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `AC-407 plan-vs-fact client ${tenantId}`,
  });
  const event = await runSales(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "catering",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Buyersheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });

  await runEvents(api.mutations.EventDish_createViaAddToEvent, {
    eventId: event.docId,
    dishId: dishA.docId,
    quantityServings: S.headcount,
  });
  await runEvents(api.mutations.EventDish_createViaAddToEvent, {
    eventId: event.docId,
    dishId: dishB.docId,
    quantityServings: S.headcount,
  });

  await runEvents(api.mutations.Event_submitForApproval, {
    docId: event.docId,
    version: 1,
  });
  await runEvents(api.mutations.Event_approve, {
    docId: event.docId,
    version: 2,
  });

  const drafts = await liveVendorOrders(roles.procurement, tenantId);
  const draft = drafts[0]!;
  const lines = await orderLines(roles.procurement, tenantId, draft._id);
  const byIngredient = new Map(lines.map((line) => [line.ingredientId, line]));
  const ingredientIds = [saltLike.docId, pepperLike.docId].sort();
  const lineA = byIngredient.get(ingredientIds[0]!)!;
  const lineB = byIngredient.get(ingredientIds[1]!)!;

  return {
    eventId: event.docId,
    vendorOrderId: draft._id,
    ingredientAId: ingredientIds[0]!,
    ingredientBId: ingredientIds[1]!,
    lineAId: lineA._id,
    lineBId: lineB._id,
  };
}

export async function readRow<T>(actor: Role, docId: string): Promise<T> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(docId as never),
  )) as never as T;
}

async function collectRows<T>(actor: Role, table: string): Promise<T[]> {
  return (await actor.run(
    async (ctx) =>
      ctx.db.query(table as never).collect() as unknown as Promise<T[]>,
  )) as T[];
}

export function liveRows<T extends { tenantId: string; deletedAt?: unknown }>(
  actor: Role,
  table: string,
  tenantId: string,
): Promise<T[]> {
  return collectRows<T>(actor, table).then((rows) =>
    rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null),
  );
}

export type VendorOrderRow = {
  _id: string;
  status: string;
  submittedAt: number | null;
  version: number;
  tenantId: string;
};

export function liveVendorOrders(
  actor: Role,
  tenantId: string,
): Promise<VendorOrderRow[]> {
  return liveRows<VendorOrderRow>(actor, "vendorOrders", tenantId);
}

export type VendorOrderLineRow = {
  _id: string;
  vendorOrderId: string;
  ingredientId: string;
  orderedQuantity: number;
  plannedQuantity: number | null;
  quantityIsManual: boolean | null;
  receivedQuantity: number;
  pendingSupplyQuantity: number | null;
  status: string;
  tenantId: string;
};

/** Live, non-cancelled lines of one order, sorted by ingredient id so A/B
 * lookups never depend on row order. */
export function orderLines(
  actor: Role,
  tenantId: string,
  vendorOrderId: string,
): Promise<VendorOrderLineRow[]> {
  return liveRows<VendorOrderLineRow>(actor, "vendorOrderLines", tenantId).then(
    (rows) =>
      rows
        .filter(
          (row) =>
            row.vendorOrderId === vendorOrderId && row.status !== "cancelled",
        )
        .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)),
  );
}

/** Live, non-cancelled lines of one draft order (the same filter as
 * orderLines; named for the draft reads in the seed). */
export function draftLines(
  actor: Role,
  tenantId: string,
  vendorOrderId: string,
): Promise<VendorOrderLineRow[]> {
  return orderLines(actor, tenantId, vendorOrderId);
}

/** Submit a weekly draft VendorOrder as procurement (version-checked). Returns
 * the submitted order id (submit keeps the same document). */
export async function submitWeeklyOrder(
  proof: Proof,
  tenantId: string,
  vendorOrderId: string,
): Promise<string> {
  const roles = rolesFor(proof, tenantId);
  const order = await readRow<VendorOrderRow>(roles.procurement, vendorOrderId);
  await proof.executeCommand(
    roles.procurement,
    api.mutations.VendorOrder_submit,
    {
      docId: vendorOrderId,
      version: order.version,
    } as never,
  );
  return vendorOrderId;
}
