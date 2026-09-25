/**
 * Shared harness for the AC-390 prep-reconciliation runtime proof: roles, the
 * planned-event seed, and one dish + dish-task pair per call so each dish line
 * drives exactly one live prep task (opened by the PrepTask.open fan-out at
 * 1 × servings). Prep readers are assertion-free; the test file owns every
 * expect().
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
    companyName: `Prep survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Prepsheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** One dish + dish task on the event, seeded at the 40-guest headcount — one
 * dish line, one live prep task opened by the fan-out at 1 × servings (40).
 * Real commands only; no direct prep writes. */
export async function seedDishWithPrepTask(
  proof: Proof,
  tenantId: string,
  eventId: string,
  nameSalt: string,
): Promise<{ lineId: string; dishTaskId: string }> {
  const roles = rolesFor(proof, tenantId);
  const runKitchen = runner(proof, roles.kitchen);
  const runEvent = runner(proof, roles.events);

  const dish = await runKitchen(api.mutations.Dish_createViaIntroduce, {
    name: `AC-390 prep ${nameSalt} dish ${tenantId}`,
    portionSize: 1,
    portionUnit: "portion",
    category: "bread",
  });
  const dishTask = await runKitchen(api.mutations.DishTask_createViaAdd, {
    dishId: dish.docId,
    name: `AC-390 prep ${nameSalt} task ${tenantId}`,
    defaultQuantity: 1,
    defaultUnit: "portion",
    station: "Prep",
  });
  const line = await runEvent(api.mutations.EventDish_createViaAddToEvent, {
    eventId,
    dishId: dish.docId,
    quantityServings: S.headcount,
  });
  return { lineId: line.docId, dishTaskId: dishTask.docId };
}

export type PrepTaskRow = {
  _id: string;
  eventId: string;
  eventDishId: string;
  dishTaskId?: string | null;
  name: string;
  quantity: number;
  deletedAt: number | null;
};

/** Live (not deleted) prepTasks of one event, sorted by eventDishId. */
export function listedPrepTasks(
  actor: Role,
  eventId: string,
): Promise<PrepTaskRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("prepTasks").collect() as unknown as Promise<
          PrepTaskRow[]
        >,
    )
    .then((rows) =>
      rows
        .filter((row) => row.eventId === eventId && row.deletedAt == null)
        .sort((a, b) => a.eventDishId.localeCompare(b.eventDishId)),
    );
}

/** The one live prep task for one event dish line, or a thrown error. */
export async function prepFor(
  actor: Role,
  eventId: string,
  eventDishId: string,
): Promise<PrepTaskRow> {
  const rows = await listedPrepTasks(actor, eventId);
  const found = rows.find((row) => row.eventDishId === eventDishId);
  if (!found) {
    throw new Error(`No live prep task for dish line ${eventDishId}`);
  }
  return found;
}
