/**
 * Shared harness for the AC-390 packet-reconciliation runtime proof: roles,
 * the planned-event seed, and one seeded current packet revision plus readers
 * for the live revisions. Assertion-free; the test file owns every expect().
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
): { sales: Role; events: Role } {
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
    companyName: `Packet survival client ${tenantId} ${title}`,
  });
  const event = await run(api.mutations.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title,
    eventType: "corporate dinner",
    startsAt: S.startsAt,
    endsAt: S.endsAt,
    expectedHeadcount: S.headcount,
    primaryContactName: "Casey Closesheet",
    budgetAmount: 3000,
    quotedPrice: 4500,
  });
  return { eventId: event.docId, clientId: client.docId };
}

/** One current packet revision linked to the event (a direct row insert —
 * the revision is a seed fixture, not produced by a command here). Returns
 * the id. */
export async function seedPacketRevision(
  actor: Role,
  tenantId: string,
  eventId: string,
): Promise<string> {
  const id = (await actor.run(async (ctx) =>
    ctx.db.insert("eventPacketRevisions", {
      tenantId,
      eventId: eventId as never,
      snapshotFingerprint: "seed-packet-40",
      pdfStorageId: "seed-pdf",
      snapshotStorageId: "seed-snapshot",
      stage: "review",
      createdBy: "seed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  )) as unknown as string;
  return id;
}

export type PacketRevisionRow = {
  _id: string;
  eventId: string;
  snapshotFingerprint: string | null;
  pdfStorageId: string | null;
  snapshotStorageId: string | null;
  stage: string | null;
  createdBy: string | null;
  supersededBy: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

/** Packet revisions linked to one event, sorted by id. */
export function listedRevisions(
  actor: Role,
  eventId: string,
): Promise<PacketRevisionRow[]> {
  return actor
    .run(
      async (ctx) =>
        ctx.db.query("eventPacketRevisions").collect() as unknown as Promise<
          PacketRevisionRow[]
        >,
    )
    .then((rows) =>
      rows
        .filter((row) => row.eventId === eventId)
        .sort((a, b) => a._id.localeCompare(b._id)),
    );
}

/** The one live linked revision, or a thrown error. */
export async function revisionFor(
  actor: Role,
  eventId: string,
): Promise<PacketRevisionRow> {
  const rows = await listedRevisions(actor, eventId);
  if (rows.length !== 1) {
    throw new Error(
      `Expected one live packet revision for event ${eventId}, found ${rows.length}`,
    );
  }
  return rows[0]!;
}
