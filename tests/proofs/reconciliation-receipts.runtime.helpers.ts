/**
 * Shared harness for the AC-423 §8.2 reconciliation-receipt runtime proof:
 * roles, the planned-event and timing seeds, and read helpers for the live
 * timeline and the persisted eventReconciliation receipts. Assertion-free.
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

export function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

export type Proof = ReturnType<typeof harness>;
export type Role = ReturnType<Proof["asRole"]>;

export function rolesFor(
  proof: Proof,
  tenantId: string,
): { sales: Role; events: Role; owner: Role } {
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
    owner: proof.asRole({
      subject: `owner-${tenantId}`,
      role: "owner",
      tenantId,
    }),
  };
}

/** Company client + planned Event via the sales role. */
export async function createPlannedEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    api.mutations.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Receipt client ${tenantId}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    api.mutations.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
      primaryContactName: "Casey Receipt",
      budgetAmount: 3000,
      quotedPrice: 4500,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

/** The full configureTiming form — omitted values deliberately clear minutes. */
export async function configureTiming(
  proof: Proof,
  events: Role,
  eventId: string,
  version: number,
  setupMinutes: number,
): Promise<void> {
  await proof.executeCommand(events, api.mutations.Event_configureTiming, {
    docId: eventId,
    version,
    serviceStartsAt: S.startsAt,
    setupMinutes,
    loadMinutes: 60,
    outboundTravelMinutes: 45,
    cleanupMinutes: 60,
    returnTravelMinutes: 40,
    unloadMinutes: 30,
  });
}

export async function readEventVersion(
  actor: Role,
  eventId: string,
): Promise<number> {
  const event = (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as { version: number };
  return event.version;
}

export type LiveTimelineRow = {
  id: string;
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  timingMilestone: string | null;
  deletedAt: number | null;
};

/** Live (not deleted) timeline blocks for the event, sorted by name. */
export async function liveTimeline(
  actor: Role,
  eventId: string,
): Promise<LiveTimelineRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("eventTimelineActivities").collect(),
  )) as (LiveTimelineRow & { _id: string; eventId: string })[];
  return rows
    .filter((row) => row.eventId === eventId && row.deletedAt == null)
    .map(({ _id, name, startsAt, endsAt, timingMilestone, deletedAt }) => ({
      id: _id,
      name,
      startsAt,
      endsAt,
      timingMilestone,
      deletedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
