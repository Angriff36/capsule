/**
 * Seed helpers for the venue layout / venue snapshot proofs (PL-VENUE-LAYOUT,
 * PL-VENUE-PROFILE). Assertion-free; the test files own every expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const DAY = 24 * 60 * 60 * 1000;
export const M = api.mutations;

export function harness() {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Proof = ReturnType<typeof harness>;
export type Role = ReturnType<Proof["asRole"]>;
type Cmd = Parameters<Proof["executeCommand"]>[1];

export async function run(
  proof: Proof,
  role: Role,
  cmd: Cmd,
  args: Record<string, unknown>,
): Promise<{ docId: string }> {
  return (await proof.executeCommand(role, cmd, args as never)) as {
    docId: string;
  };
}

export function rolesFor(proof: Proof, tenantId: string) {
  const mk = (name: string, role: string) =>
    proof.asRole({ subject: `${name}-${tenantId}`, role, tenantId });
  return {
    owner: mk("owner", "owner"),
    sales: mk("sales", "sales_manager"),
    events: mk("event-manager", "event_manager"),
    logistics: mk("logistics", "logistics_manager"),
  };
}

/** Owner Person (proposal sends need one), a venue with operating facts, a
 * client and an event booked at that venue the way the event form books it. */
export async function seedVenueEvent(proof: Proof, tenantId: string) {
  const roles = rolesFor(proof, tenantId);
  await proof.seedEntity(roles.owner, "people", {
    tenantId,
    givenName: "Val",
    familyName: "Owner",
    email: `owner-${tenantId}@example.com`,
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: `owner-${tenantId}`,
    version: 1,
  });
  const venue = await run(proof, roles.events, M.Venue_createViaRegister, {
    name: "Garden Hall",
    venueType: "banquet_hall",
    capacity: 150,
    addressLine1: "100 Oak St",
    city: "Hudson",
    onPremise: false,
    hasStairs: true,
    loadInInstructions: "Dock door 3",
    restrictions: "No open flame",
  });
  await run(proof, roles.events, M.Venue_setSiteFacts, {
    docId: venue.docId,
    seatedCapacity: 120,
    standingCapacity: 150,
    hasOven: true,
    hasRefrigeration: false,
    loadInFrom: "07:00",
    loadOutBy: "23:30",
  });
  const client = await run(proof, roles.sales, M.Client_createViaRegister, {
    clientType: "company",
    companyName: `Venue client ${tenantId}`,
  });
  const startsAt = Date.now() + 20 * DAY;
  const event = await run(proof, roles.sales, M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Garden dinner",
    eventType: "corporate dinner",
    serviceStyleName: "Plated",
    startsAt,
    endsAt: startsAt + 4 * 60 * 60 * 1000,
    expectedHeadcount: 90,
    primaryContactName: "Pat Planner",
    budgetAmount: 3000,
    quotedPrice: 4500,
    venueId: venue.docId,
    venueName: "Garden Hall",
    venueAddress: "100 Oak St, Hudson",
    venueCapacity: 150,
  });
  return {
    roles,
    venueId: venue.docId,
    clientId: client.docId,
    eventId: event.docId,
  };
}

export async function readDoc<T>(role: Role, id: string): Promise<T> {
  return (await role.run(async (ctx) => ctx.db.get(id as never))) as T;
}

/** Cancel open pack lists (the approval reaction drafts one) so the event
 * can start; same path as the closeout lifecycle proofs. */
async function cancelOpenPackLists(
  proof: Proof,
  logistics: Role,
  eventId: string,
): Promise<void> {
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
    await proof.executeCommand(logistics, M.PackList_cancel, {
      docId: pack._id,
      reason: "Proof skips packing",
      version: pack.version,
    });
  }
}

/** planning -> pending_approval -> approved -> sales_lock -> executing -> final. */
export async function walkToFinal(
  proof: Proof,
  tenantId: string,
  eventId: string,
): Promise<void> {
  const roles = rolesFor(proof, tenantId);
  const plan: Array<readonly [Role, Cmd]> = [
    [roles.events, M.Event_submitForApproval],
    [roles.events, M.Event_approve],
    [roles.sales, M.Event_lockForSales],
    [roles.events, M.Event_beginExecution],
    [roles.events, M.Event_finalizeEvent],
  ];
  for (const [role, cmd] of plan) {
    if (cmd === M.Event_beginExecution) {
      await cancelOpenPackLists(proof, roles.logistics, eventId);
    }
    const { version } = await readDoc<{ version: number }>(role, eventId);
    await proof.executeCommand(role, cmd, { docId: eventId, version });
  }
}
