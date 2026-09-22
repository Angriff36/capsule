/**
 * Runtime proof (AC-099 / AC-223): the nine named booking-handoff outcomes
 * land on the EXISTING ten-stage machine. Sales lock is a distinct stage and
 * no stage named confirmed exists or can be reached — beginExecution from
 * approved is refused and from sales_lock lands on executing, never a
 * "confirmed" stage. Cancel/archive/reactivate map without inventing stages,
 * and a duplicate copies no invoices, payments, or signatures. Sales uses
 * beginExecution here as the execution proof; confirmSalesLock is a
 * different command and is NOT exercised in this file.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  startsAt: Date.UTC(2026, 9, 18, 17, 0),
  endsAt: Date.UTC(2026, 9, 18, 22, 0),
} as const;
const HEAD_COUNT = 40;
const QUOTED = 4500;
const BUDGET = 3000;
const M = api.mutations;
const duplicateEvent = api.lib.eventDuplicate.duplicateEvent;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Proof = ReturnType<typeof harness>;
type Role = ReturnType<Proof["asRole"]>;
type Cmd = Parameters<Proof["executeCommand"]>[1];

function rolesFor(
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

async function createEvent(
  proof: Proof,
  tenantId: string,
  title: string,
): Promise<{ eventId: string; clientId: string }> {
  const { sales } = rolesFor(proof, tenantId);
  const client = (await proof.executeCommand(
    sales,
    M.Client_createViaRegister,
    {
      clientType: "company",
      companyName: `Lifecycle map client ${tenantId} ${title}`,
    },
  )) as { docId: string };
  const event = (await proof.executeCommand(
    sales,
    M.Event_createViaPlanEngagement,
    {
      clientId: client.docId,
      title,
      eventType: "corporate dinner",
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: HEAD_COUNT,
      primaryContactName: "Casey Map",
      budgetAmount: BUDGET,
      quotedPrice: QUOTED,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

const LADDER = [
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
] as const;
type LadderStage = (typeof LADDER)[number];

/** Same walker as the meanings proof: create is version 1, each public
 * lifecycle command takes the current version and bumps it by one. */
async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: LadderStage,
  title: string,
): Promise<{ eventId: string; clientId: string; version: number }> {
  const { sales, events } = rolesFor(proof, tenantId);
  const { eventId, clientId } = await createEvent(proof, tenantId, title);
  const plan: Array<readonly [Role, Cmd]> = [
    [events, M.Event_submitForApproval],
    [events, M.Event_approve],
    [sales, M.Event_lockForSales],
    [events, M.Event_beginExecution],
    [events, M.Event_finalizeEvent],
    [events, M.Event_complete],
    [events, M.Event_closeOut],
  ];
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (LADDER.indexOf(target) < i + 1) break;
    await proof.executeCommand(role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, clientId, version };
}

type EventRow = { stage: string; archivedAt?: number | null };

async function readEvent(actor: Role, eventId: string): Promise<EventRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as EventRow;
}

async function countRows(
  actor: Role,
  table: "invoices" | "payments" | "signatureRequests",
  eventId: string,
): Promise<number> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query(table).collect(),
  )) as Array<{ eventId?: string | null }>;
  return rows.filter((row) => (row.eventId ?? null) === eventId).length;
}

async function cancelledReason(actor: Role, eventId: string): Promise<unknown> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as Array<{
    type: string;
    entityId: string;
    payload: Record<string, unknown>;
  }>;
  const row = rows.find(
    (r) => r.type === "EventCancelled" && r.entityId === eventId,
  );
  return row?.payload.reason;
}

describe("event lifecycle outcome map (AC-099 / AC-223)", () => {
  it("sales lock is a distinct stage; confirmed is not a stage", async () => {
    const proof = harness();
    const tenantId = "tenant-ac099-lock";
    const { events } = rolesFor(proof, tenantId);
    const { eventId: lockId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "AC-099 lock",
    );
    const locked = await readEvent(events, lockId);
    expect(locked.stage).toBe("sales_lock");
    expect(locked.stage).not.toBe("executing");
    expect(locked.stage).not.toBe("confirmed");

    // From approved, execution is refused: the stage gates it.
    const { eventId: approvedId } = await walkToStage(
      proof,
      tenantId,
      "approved",
      "AC-099 approved refusal",
    );
    await expect(
      proof.executeCommand(events, M.Event_beginExecution, {
        docId: approvedId,
        version: 3,
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    expect((await readEvent(events, approvedId)).stage).toBe("approved");

    // From sales_lock, execution starts — onto executing, never "confirmed".
    await proof.executeCommand(events, M.Event_beginExecution, {
      docId: lockId,
      version,
    });
    const executing = await readEvent(events, lockId);
    expect(executing.stage).toBe("executing");
    expect(executing.stage).not.toBe("confirmed");
  });

  it("cancel, archive, and reopen map without inventing stages", async () => {
    const proof = harness();
    const tenantId = "tenant-ac099-flags";
    const { events } = rolesFor(proof, tenantId);
    const { eventId: cancelId, version } = await walkToStage(
      proof,
      tenantId,
      "sales_lock",
      "AC-099 cancel",
    );
    const reason = "Cancelled from sales lock";
    await proof.executeCommand(events, M.Event_cancel, {
      docId: cancelId,
      version,
      reason,
    });
    expect((await readEvent(events, cancelId)).stage).toBe("cancelled");
    expect(await cancelledReason(events, cancelId)).toBe(reason);

    // Archive is a flag: archivedAt set, stage untouched.
    const { eventId: archiveId } = await createEvent(
      proof,
      tenantId,
      "AC-099 archive",
    );
    await proof.executeCommand(events, M.Event_archive, {
      docId: archiveId,
      version: 1,
      reason: "Hide finished",
    });
    const archived = await readEvent(events, archiveId);
    expect(archived.archivedAt).toEqual(expect.any(Number));
    expect(archived.stage).toBe("planning");

    // Reopen clears the flag; the stage still never moved.
    await proof.executeCommand(events, M.Event_reactivate, {
      docId: archiveId,
      version: 2,
    });
    const reopened = await readEvent(events, archiveId);
    expect(reopened.archivedAt ?? null).toBeNull();
    expect(reopened.stage).toBe("planning");
  });

  it("duplicate copies no invoices, payments, or signatures", async () => {
    const proof = harness();
    const tenantId = "tenant-ac099-duplicate";
    const { events } = rolesFor(proof, tenantId);
    const { eventId } = await walkToStage(
      proof,
      tenantId,
      "approved",
      "AC-099 duplicate",
    );
    expect(await countRows(events, "invoices", eventId)).toBe(1);
    expect(await countRows(events, "payments", eventId)).toBe(0);
    expect(await countRows(events, "signatureRequests", eventId)).toBe(0);

    const result = (await proof.executeCommand(
      events,
      duplicateEvent as never,
      { sourceEventId: eventId },
    )) as { docId: string };
    const copyId = result.docId;

    const copy = await readEvent(events, copyId);
    expect(copy.stage).toBe("planning");
    expect(await countRows(events, "invoices", copyId)).toBe(0);
    expect(await countRows(events, "payments", copyId)).toBe(0);
    expect(await countRows(events, "signatureRequests", copyId)).toBe(0);

    expect(await countRows(events, "invoices", eventId)).toBe(1);
    expect(await countRows(events, "payments", eventId)).toBe(0);
    expect(await countRows(events, "signatureRequests", eventId)).toBe(0);
  });
});
