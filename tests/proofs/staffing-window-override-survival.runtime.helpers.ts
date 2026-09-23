/**
 * Shared harness for the AC-388 staffing-window override survival runtime
 * proof: roles, the planned-event + crew-window seed (two post-open staff
 * needs, the captain overridden off the crew timeline), and read helpers for
 * the live staff needs and the event row. Assertion-free; the test file owns
 * every expect().
 */
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

export const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;

// The deliberate override: 2pm–6pm on the original event day, ahead of the
// 5pm crew window configureTiming creates.
export const OVERRIDE = {
  startsAt: Date.UTC(2026, 9, 18, 14, 0),
  endsAt: Date.UTC(2026, 9, 18, 18, 0),
} as const;

// Reschedule targets — one day later each time.
export const R1 = {
  startsAt: Date.UTC(2026, 9, 19, 17, 0),
  endsAt: Date.UTC(2026, 9, 19, 22, 0),
} as const;
export const R2 = {
  startsAt: Date.UTC(2026, 9, 20, 17, 0),
  endsAt: Date.UTC(2026, 9, 20, 22, 0),
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

export type StaffingSeed = {
  eventId: string;
  captainId: string;
  serverId: string;
};

/** Company client + planned Event, the configureTiming crew window, two
 * no-times post-open staff needs (captain + server, both following), and the
 * captain overridden to OVERRIDE via planTiming. Needs are identified by
 * role, never by array index. */
export async function seedStaffingEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<StaffingSeed> {
  const roles = rolesFor(proof, tenantId);
  const runSales = runner(proof, roles.sales);
  const runEvents = runner(proof, roles.events);
  const runWorkforce = runner(proof, roles.workforce);

  const client = await runSales(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `AC-388 staffing survival client ${tenantId}`,
  });
  const event = await runSales(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Casey Crewsheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });

  // configureTiming creates the crew window (staff_on / staff_off).
  await runEvents(api.mutations.Event_configureTiming, {
    docId: event.docId,
    version: 1,
    serviceStartsAt: S.startsAt,
    setupMinutes: 180,
    loadMinutes: 60,
    outboundTravelMinutes: 45,
    cleanupMinutes: 60,
    returnTravelMinutes: 40,
    unloadMinutes: 30,
  });

  // No times → followsEventTiming defaults to true for both needs.
  await runWorkforce(api.mutations.EventStaffNeed_createViaPostOpen, {
    eventId: event.docId,
    role: "captain",
  });
  await runWorkforce(api.mutations.EventStaffNeed_createViaPostOpen, {
    eventId: event.docId,
    role: "server",
  });

  const needs = await liveStaffNeeds(roles.workforce, tenantId, event.docId);
  const captainRow = needs.find((row) => row.role === "captain");
  const serverRow = needs.find((row) => row.role === "server");
  if (!captainRow || !serverRow) throw new Error("Seed staff needs missing");

  // The deliberate override, detached from the crew window. synchronizeShifts
  // is omitted (undefined) — false would demand a connected personal shift.
  await runWorkforce(api.mutations.EventStaffNeed_planTiming, {
    docId: captainRow._id,
    version: captainRow.version,
    startsAt: OVERRIDE.startsAt,
    endsAt: OVERRIDE.endsAt,
    followsEventTiming: false,
  });

  return {
    eventId: event.docId,
    captainId: captainRow._id,
    serverId: serverRow._id,
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

export type StaffNeedRow = {
  _id: string;
  eventId: string;
  role: string;
  startsAt: number | null;
  endsAt: number | null;
  followsEventTiming: boolean | null;
  status: string;
  version: number;
  tenantId: string;
  deletedAt: number | null;
};

/** Live, non-cancelled staff needs of one event for the tenant. */
export function liveStaffNeeds(
  actor: Role,
  tenantId: string,
  eventId: string,
): Promise<StaffNeedRow[]> {
  return collectRows<StaffNeedRow>(actor, "eventStaffNeeds").then((rows) =>
    rows.filter(
      (row) =>
        row.tenantId === tenantId &&
        row.deletedAt == null &&
        row.status !== "cancelled" &&
        row.eventId === eventId,
    ),
  );
}

export type EventRow = {
  version: number;
  startsAt: number;
  endsAt: number;
  timingStaffOnAt?: number | null;
  timingStaffOffAt?: number | null;
};

/** The event row's schedule facts: version, window, and the stored crew
 * stamp fields when the table carries them. */
export async function readEvent(
  actor: Role,
  eventId: string,
): Promise<EventRow> {
  const row = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as EventRow & { deletedAt?: number | null };
  return {
    version: row.version,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timingStaffOnAt: row.timingStaffOnAt ?? null,
    timingStaffOffAt: row.timingStaffOffAt ?? null,
  };
}

/** Live (not deleted) events for the tenant. */
export function liveEvents(
  actor: Role,
  tenantId: string,
): Promise<(EventRow & { _id: string })[]> {
  return collectRows<
    EventRow & { _id: string; tenantId: string; deletedAt: number | null }
  >(actor, "events").then((rows) =>
    rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null),
  );
}
