/**
 * Shared harness for the AC-390 single-reconciliation runtime proof: roles,
 * the planned-event + crew-window seed (two following post-open staff needs),
 * and read helpers for the live staff needs, events, and the persisted
 * eventReconciliation receipts. Assertion-free; the test file owns every
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
} as const;

// Reschedule target — the same R1 window the staffing-override proof uses.
export const R1 = {
  startsAt: Date.UTC(2026, 9, 19, 17, 0),
  endsAt: Date.UTC(2026, 9, 19, 22, 0),
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

/** Company client + planned Event, the configureTiming crew window, and two
 * no-times post-open staff needs (captain + server, both following). No
 * overrides — every need follows the crew timeline. */
export async function seedFollowingStaffEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string }> {
  const roles = rolesFor(proof, tenantId);
  const runSales = runner(proof, roles.sales);
  const runEvents = runner(proof, roles.events);
  const runWorkforce = runner(proof, roles.workforce);

  const client = await runSales(api.mutations.Client_createViaRegister, {
    clientType: "company",
    companyName: `AC-390 once-only client ${tenantId}`,
  });
  const event = await runSales(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: 40,
    primaryContactName: "Casey Oncesheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });

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

  await runWorkforce(api.mutations.EventStaffNeed_createViaPostOpen, {
    eventId: event.docId,
    role: "captain",
  });
  await runWorkforce(api.mutations.EventStaffNeed_createViaPostOpen, {
    eventId: event.docId,
    role: "server",
  });

  return { eventId: event.docId };
}

export type EventRow = { version: number };

export async function readEventVersion(
  actor: Role,
  eventId: string,
): Promise<number> {
  const event = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as EventRow & { deletedAt?: number | null };
  return event.version;
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
  status: string;
  tenantId: string;
  deletedAt: number | null;
};

/** Live, non-cancelled staff needs of one event for the tenant, sorted by id. */
export function liveStaffNeeds(
  actor: Role,
  tenantId: string,
  eventId: string,
): Promise<StaffNeedRow[]> {
  return collectRows<StaffNeedRow>(actor, "eventStaffNeeds").then((rows) =>
    rows
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.deletedAt == null &&
          row.status !== "cancelled" &&
          row.eventId === eventId,
      )
      .sort((a, b) => a._id.localeCompare(b._id)),
  );
}

/** Live (not deleted) events for the tenant. */
export function liveEvents(
  actor: Role,
  tenantId: string,
): Promise<{ _id: string }[]> {
  return collectRows<{
    _id: string;
    tenantId: string;
    deletedAt: number | null;
  }>(actor, "events").then((rows) =>
    rows
      .filter((row) => row.tenantId === tenantId && row.deletedAt == null)
      .sort((a, b) => a._id.localeCompare(b._id)),
  );
}

export type ReceiptOutput = {
  eventId: string;
  tenantId: string;
  triggerEventId: string;
  triggerType: string;
  inputVersions: {
    checkpoint: string;
    windows: { key: string }[];
  };
  affectedDomains: string[];
  createdCount: number;
  updatedCount: number;
  retiredCount: number;
  preservedCount: number;
  exceptionCount: number;
  unresolved: { code: string; recordIds: string[] }[];
  checkpoint: { state: string; key: string };
};

type RawReceiptRow = {
  receiptKey: string | null;
  output: ReceiptOutput | null;
};

/** The eventReconciliation receipt outputs for the tenant — exact rows when
 * they exist, otherwise the head rows. */
export async function readReconciliationReceipts(
  actor: Role,
  tenantId: string,
): Promise<ReceiptOutput[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("materializationReceipts").collect(),
  )) as (RawReceiptRow & { tenantId: string })[];
  const family = rows.filter(
    (row) => row.tenantId === tenantId && row.receiptKey != null,
  );
  const exact = family.filter((row) =>
    row.receiptKey!.includes(":exact:eventReconciliation:"),
  );
  const source = exact.length
    ? exact
    : family.filter((row) => row.receiptKey!.includes("eventReconciliation"));
  return source
    .map((row) => row.output)
    .filter((output): output is ReceiptOutput => output != null);
}
