/**
 * Shared harness for the AC-388 EventDish headcount-override survival
 * runtime proof: roles, the planned-event seed, and the two dish lines each
 * test starts from. Assertion-free; the test file owns every expect().
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
): { sales: Role; events: Role; kitchen: Role; owner: Role } {
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
    companyName: `Override survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Override",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** Two dishes on the event, each line seeded at the seed headcount. Dish A
 * is the override candidate, dish B follows the event headcount. */
export async function seedOverridableDishLines(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<{ lineA: string; lineB: string }> {
  const roles = rolesFor(proof, tenantId);
  const seedDish = runner(proof, roles.kitchen);
  const runEvent = runner(proof, roles.events);
  const lines: string[] = [];
  for (const name of [
    `Override roast ${tenantId}`,
    `Follow soup ${tenantId}`,
  ]) {
    const dish = await seedDish(api.mutations.Dish_createViaIntroduce, {
      name,
      portionSize: 1,
      portionUnit: "portion",
    });
    const line = await runEvent(api.mutations.EventDish_createViaAddToEvent, {
      eventId,
      dishId: dish.docId,
      quantityServings: S.headcount,
    });
    lines.push(line.docId);
  }
  return { lineA: lines[0], lineB: lines[1] };
}
