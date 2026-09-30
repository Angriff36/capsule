/**
 * Shared seed for the weekly purchasing proofs (PL-WEEKLY-PURCHASING):
 * one vendor + tenant purchasing config, a catalog of kilogram ingredients
 * each behind one published recipe part and one dish, optional stock on hand,
 * and a step to plan + approve an event serving those dishes. Assertion-free;
 * each test file owns its expect() calls.
 */
import { api } from "../../convex/_generated/api";
import {
  harness,
  liveRows,
  readRow,
  rolesFor,
  runner,
  type Proof,
  type Role,
} from "./buyer-qty-override-survival.runtime.helpers";

export { harness, liveRows, readRow, rolesFor, runner };
export type { Proof, Role };

const M = api.mutations;

/** Monday 20 July 2026; Event.planEngagement keys the week at Monday 08:00 UTC. */
export const WEEK_ONE = {
  startsAt: Date.UTC(2026, 6, 20, 12, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
  key: Date.UTC(2026, 6, 20, 8, 0),
} as const;
export const WEEK_TWO = {
  startsAt: Date.UTC(2026, 6, 28, 12, 0),
  endsAt: Date.UTC(2026, 6, 28, 22, 0),
  key: Date.UTC(2026, 6, 27, 8, 0),
} as const;

export type CatalogItem = {
  name: string;
  /** Recipe amount per serving. */
  perServing: number;
  /** Recipe unit; the catalog unit is always kilogram. */
  recipeUnit?: string;
  /** Stock on hand in kilograms. */
  stock?: number;
};

export type Catalog = {
  vendorId: string;
  locationId: string;
  ingredientIds: string[];
  dishIds: string[];
};

export async function seedCatalog(
  proof: Proof,
  tenantId: string,
  items: CatalogItem[],
): Promise<Catalog> {
  const roles = rolesFor(proof, tenantId);
  const kitchen = runner(proof, roles.kitchen);
  const buyer = runner(proof, roles.procurement);
  const stock = runner(
    proof,
    proof.asRole({
      subject: `stock-${tenantId}`,
      role: "inventory_staff",
      tenantId,
    }),
  );
  const vendor = await buyer(M.Vendor_createViaOnboard, {
    name: `Weekly vendor ${tenantId}`,
    paymentTermsDays: 14,
  });
  await buyer(M.WeeklyPurchasingConfig_createViaConfigure, {
    defaultVendorId: vendor.docId,
  });
  const location = await stock(M.StorageLocation_createViaRegister, {
    name: "Dry store",
    locationType: "dry",
    temperatureZone: "ambient",
  });
  const ingredientIds: string[] = [];
  const dishIds: string[] = [];
  for (const item of items) {
    const ingredient = await kitchen(M.Ingredient_createViaIntroduce, {
      name: `${item.name} ${tenantId}`,
      unit: "kilogram",
      costPerUnit: 2,
      allergens: [],
      category: "dry",
    });
    if (item.stock != null)
      await stock(M.InventoryItem_createViaOpen, {
        ingredientId: ingredient.docId,
        locationId: location.docId,
        unit: "kilogram",
        quantityOnHand: item.stock,
      });
    const component = await kitchen(M.Component_createViaDraft, {
      name: `${item.name} base ${tenantId}`,
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    });
    await kitchen(M.ComponentIngredient_createViaAdd, {
      componentId: component.docId,
      ingredientId: ingredient.docId,
      quantity: item.perServing,
      unit: item.recipeUnit ?? "kilogram",
    });
    await kitchen(M.Component_publishVersion, {
      docId: component.docId,
      version: 1,
    });
    const dish = await kitchen(M.Dish_createViaIntroduce, {
      name: `${item.name} dish ${tenantId}`,
      portionSize: 1,
      portionUnit: "portion",
      category: "bread",
    });
    await kitchen(M.DishComponent_createViaAttach, {
      dishId: dish.docId,
      componentId: component.docId,
      yieldQuantity: 1,
      batchMultiplier: 1,
    });
    ingredientIds.push(ingredient.docId);
    dishIds.push(dish.docId);
  }
  return {
    vendorId: vendor.docId,
    locationId: location.docId,
    ingredientIds,
    dishIds,
  };
}

/** Plan an event serving each dish to every guest, then approve it. */
export async function approvedEvent(
  proof: Proof,
  tenantId: string,
  options: {
    title: string;
    headcount: number;
    dishIds: string[];
    week?: { startsAt: number; endsAt: number };
  },
): Promise<string> {
  const roles = rolesFor(proof, tenantId);
  const sales = runner(proof, roles.sales);
  const events = runner(proof, roles.events);
  const client = await sales(M.Client_createViaRegister, {
    clientType: "company",
    companyName: `${options.title} client`,
  });
  const week = options.week ?? WEEK_ONE;
  const event = await sales(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: options.title,
    eventType: "catering",
    startsAt: week.startsAt,
    endsAt: week.endsAt,
    expectedHeadcount: options.headcount,
    primaryContactName: "Pat Planner",
    budgetAmount: 3000,
    quotedPrice: 4000,
  });
  for (const dishId of options.dishIds)
    await events(M.EventDish_createViaAddToEvent, {
      eventId: event.docId,
      dishId,
      quantityServings: options.headcount,
    });
  await events(M.Event_submitForApproval, { docId: event.docId, version: 1 });
  await events(M.Event_approve, { docId: event.docId, version: 2 });
  return event.docId;
}

export async function versionOf(actor: Role, docId: string): Promise<number> {
  return (await readRow<{ version: number }>(actor, docId)).version;
}

export type OrderRow = {
  _id: string;
  status: string;
  vendorId: string;
  sourceRangeStart?: number | null;
  tenantId: string;
  version: number;
  submittedAt?: number | null;
};

export type LineRow = {
  _id: string;
  vendorOrderId: string;
  ingredientId: string;
  orderedQuantity: number;
  plannedQuantity: number | null;
  quantityIsManual: boolean | null;
  stockAppliedQuantity?: number | null;
  unit: string;
  unitCost: number;
  status: string;
  tenantId: string;
  version: number;
};

export type DemandLinkRow = {
  vendorOrderLineId: string;
  ingredientDemandId: string;
  contributionQuantity: number;
  removedAt?: number | null;
  tenantId: string;
};

export function orders(actor: Role, tenantId: string): Promise<OrderRow[]> {
  return liveRows<OrderRow>(actor, "vendorOrders", tenantId);
}

export async function drafts(
  actor: Role,
  tenantId: string,
): Promise<OrderRow[]> {
  return (await orders(actor, tenantId)).filter((o) => o.status === "draft");
}

export async function linesOf(
  actor: Role,
  tenantId: string,
  vendorOrderId: string,
): Promise<LineRow[]> {
  return (await liveRows<LineRow>(actor, "vendorOrderLines", tenantId)).filter(
    (line) =>
      line.vendorOrderId === vendorOrderId && line.status !== "cancelled",
  );
}

export async function lineFor(
  actor: Role,
  tenantId: string,
  vendorOrderId: string,
  ingredientId: string,
): Promise<LineRow | undefined> {
  return (await linesOf(actor, tenantId, vendorOrderId)).find(
    (line) => line.ingredientId === ingredientId,
  );
}

export async function activeLinks(
  actor: Role,
  tenantId: string,
  vendorOrderLineId: string,
): Promise<DemandLinkRow[]> {
  return (
    await liveRows<DemandLinkRow>(actor, "vendorOrderLineDemands", tenantId)
  ).filter(
    (link) =>
      link.vendorOrderLineId === vendorOrderLineId && link.removedAt == null,
  );
}

/** The event each active demand link on a line came from. */
export async function linkedEventIds(
  actor: Role,
  tenantId: string,
  vendorOrderLineId: string,
): Promise<string[]> {
  const links = await activeLinks(actor, tenantId, vendorOrderLineId);
  const ids: string[] = [];
  for (const link of links) {
    const demand = await readRow<{ eventId: string }>(
      actor,
      link.ingredientDemandId,
    );
    ids.push(demand.eventId);
  }
  return ids.sort();
}
