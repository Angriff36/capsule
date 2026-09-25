/**
 * Shared harness for the AC-388 pack-quantity-override survival runtime
 * proof: roles, the planned-event seed, container dishes, the pack list
 * open, and row readers. Assertion-free; the test file owns every expect().
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
): {
  sales: Role;
  events: Role;
  kitchen: Role;
  logistics: Role;
  owner: Role;
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
    logistics: proof.asRole({
      subject: `logistics-${tenantId}`,
      role: "logistics_manager",
      tenantId,
    }),
    owner: proof.asRole({
      subject: `owner-${tenantId}`,
      role: "owner",
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
    companyName: `Pack quantity survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Packlist",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** One dish + one 10-serving container template, on the event at the seed
 * headcount. */
export async function seedContainerDishLine(
  proof: Proof,
  tenantId: string,
  eventId: string,
  dishName: string,
): Promise<{ dishId: string; lineId: string }> {
  const roles = rolesFor(proof, tenantId);
  const kitchen = runner(proof, roles.kitchen);
  const runEvent = runner(proof, roles.events);
  const dish = await kitchen(api.mutations.Dish_createViaIntroduce, {
    name: dishName,
    portionSize: 1,
    portionUnit: "portion",
  });
  await kitchen(api.mutations.DishContainer_createViaDefine, {
    dishId: dish.docId,
    name: `${dishName} container`,
    serviceMethod: "cooked_at_kitchen",
    servingsPerContainer: 10,
    baseQuantity: 0,
    unit: "each",
  });
  const line = await runEvent(api.mutations.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: S.headcount,
  });
  return { dishId: dish.docId, lineId: line.docId };
}

/** Open the pack list for the event. Must run after both event dish lines
 * exist so the open fans out one container pack item per line. */
export async function openPackList(
  proof: Proof,
  tenantId: string,
  eventId: string,
  name: string,
): Promise<string> {
  const run = runner(proof, rolesFor(proof, tenantId).owner);
  const packList = await run(api.mutations.PackList_createViaOpen, {
    eventId,
    name,
  });
  return packList.docId;
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

export type PackItemRow = {
  _id: string;
  packListId: string;
  eventDishId: string | null;
  requiredQuantity: number;
  followsDishServings: boolean | null;
  status: string;
  tenantId: string;
};

/** Live listed container pack items for one pack list, sorted by eventDishId
 * so lookups never depend on row order. */
export async function listedPackItems(
  actor: Role,
  tenantId: string,
  packListId: string,
): Promise<PackItemRow[]> {
  const rows = await liveRows<PackItemRow & { status: string }>(
    actor,
    "packListItems",
    tenantId,
  );
  return rows
    .filter((row) => row.packListId === packListId && row.status === "listed")
    .sort((a, b) => String(a.eventDishId).localeCompare(String(b.eventDishId)));
}
