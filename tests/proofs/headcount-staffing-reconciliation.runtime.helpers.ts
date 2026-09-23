/**
 * Shared harness for the AC-390 staffing-reconciliation runtime proof: roles,
 * the planned-event seed, and real-command staff-need seeding + readers for
 * the live eventStaffNeeds. Assertion-free; the test file owns every expect().
 * Staffing does not scale with headcount — the seed never touches
 * Event_configureTiming (that is a different, timing-checkpoint slice).
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
): { sales: Role; events: Role; workforce: Role } {
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
    workforce: proof.asRole({
      subject: `workforce-${tenantId}`,
      role: "workforce_manager",
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
    companyName: `Staffing survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Crewsheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** One live post-open staff need on the event, created by the real
 * EventStaffNeed_createViaPostOpen command. Returns the created need id. */
export async function seedStaffNeed(
  proof: Proof,
  tenantId: string,
  eventId: string,
  role: string,
): Promise<string> {
  const runWorkforce = runner(proof, rolesFor(proof, tenantId).workforce);
  const need = await runWorkforce(
    api.mutations.EventStaffNeed_createViaPostOpen,
    {
      eventId,
      role,
    },
  );
  return need.docId;
}

export type StaffNeedRow = {
  _id: string;
  eventId: string;
  role: string;
  startsAt: number | null;
  endsAt: number | null;
  followsEventTiming: boolean | null;
  status: string;
  version: number;
  deletedAt: number | null;
};

async function collectStaffNeeds(actor: Role): Promise<StaffNeedRow[]> {
  return (await actor.run(
    async (ctx) =>
      ctx.db.query("eventStaffNeeds").collect() as unknown as Promise<
        StaffNeedRow[]
      >,
  )) as StaffNeedRow[];
}

/** Live (not deleted) staff needs of one event, sorted by role. */
export function listedStaffNeeds(
  actor: Role,
  eventId: string,
): Promise<StaffNeedRow[]> {
  return collectStaffNeeds(actor).then((rows) =>
    rows
      .filter((row) => row.eventId === eventId && row.deletedAt == null)
      .sort((a, b) => a.role.localeCompare(b.role)),
  );
}

/** The one live staff need for one role, or a thrown error. */
export async function needFor(
  actor: Role,
  eventId: string,
  role: string,
): Promise<StaffNeedRow> {
  const rows = await listedStaffNeeds(actor, eventId);
  const found = rows.filter((row) => row.role === role);
  if (found.length !== 1) {
    throw new Error(
      `Expected one live staff need for role ${role}, found ${found.length}`,
    );
  }
  return found[0]!;
}
