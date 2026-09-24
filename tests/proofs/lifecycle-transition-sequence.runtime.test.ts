/**
 * Runtime proof (AC-225): the full Event lifecycle ladder is driven by
 * explicit guarded commands, each transition records time on the Event
 * (the ledger createdAt when the command sets no Event field), and each
 * emits EXACTLY ONE typed manifestEvents row. Actor is the authenticated
 * command caller — the table has no actor column, none is asserted.
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
      role: "kitchen",
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
      companyName: `Lifecycle sequence client ${tenantId} ${title}`,
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
      primaryContactName: "Riley Sequence",
      budgetAmount: BUDGET,
      quotedPrice: QUOTED,
    },
  )) as { docId: string };
  return { eventId: event.docId, clientId: client.docId };
}

type EventRow = {
  stage: string;
  plannedAt: number | null;
  approvedAt: number | null;
  salesLockedAt: number | null;
  executionStartedAt: number | null;
  finalizedAt: number | null;
  completedAt: number | null;
  closedOutAt: number | null;
  cancelledAt: number | null;
  cancellationReason: string | null;
};

async function readEvent(actor: Role, eventId: string): Promise<EventRow> {
  return (await actor.run(async (ctx) =>
    ctx.db.get(eventId as never),
  )) as EventRow;
}

type LifecycleRow = {
  type: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

/** Ledger read: a raw manifestEvents collect, filtered by the typed event
 * name and this entity's id — the accepted-revision-link shape. */
async function lifecycleRows(
  actor: Role,
  eventId: string,
  type: string,
): Promise<LifecycleRow[]> {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LifecycleRow[];
  return rows.filter((row) => row.type === type && row.entityId === eventId);
}

/** The typed-event contract every lifecycle row must satisfy. */
function assertContract(row: LifecycleRow, eventId: string, tenantId: string) {
  expect(row.entity).toBe("Event");
  expect(row.entityId).toBe(eventId);
  expect(row.payload.eventId).toBe(eventId);
  expect(row.payload.tenantId).toBe(tenantId);
  expect(row.createdAt).toEqual(expect.any(Number));
  expect(row.createdAt).toBeGreaterThan(0);
}

/** Exactly one row of `type` for this event, contract-valid, with each extra
 * payload field equal to the value that was passed in. */
async function expectExactlyOne(
  actor: Role,
  eventId: string,
  tenantId: string,
  type: string,
  extra: Record<string, unknown> = {},
): Promise<LifecycleRow> {
  const rows = await lifecycleRows(actor, eventId, type);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  assertContract(row, eventId, tenantId);
  for (const [field, value] of Object.entries(extra)) {
    expect(row.payload[field]).toBe(value);
  }
  return row;
}

/** Same walker as the meanings proof: create is version 1, each public
 * lifecycle command takes the current version and bumps it by one. */
async function walkToStage(
  proof: Proof,
  tenantId: string,
  target: "planning" | "pending_approval" | "approved",
  title: string,
): Promise<{ eventId: string; version: number }> {
  const { events, sales } = rolesFor(proof, tenantId);
  const { eventId } = await createEvent(proof, tenantId, title);
  const plan: Array<readonly [Role, Cmd]> = [
    [events, M.Event_submitForApproval],
    [events, M.Event_approve],
    [sales, M.Event_lockForSales],
  ];
  const stopAt = ["planning", "pending_approval", "approved"].indexOf(target);
  let version = 1;
  for (const [i, [role, cmd]] of plan.entries()) {
    if (stopAt < i + 1) break;
    await proof.executeCommand(role, cmd, { docId: eventId, version });
    version = i + 2;
  }
  return { eventId, version };
}

const NULLABLE_STAMPS = [
  "approvedAt",
  "salesLockedAt",
  "executionStartedAt",
  "finalizedAt",
  "completedAt",
  "closedOutAt",
  "cancelledAt",
] as const;

/** Assert the Event stamp is a positive number at/after `min`; return it. */
function stampAt(row: EventRow, field: keyof EventRow, min = 0): number {
  expect(row[field]).toEqual(expect.any(Number));
  expect(row[field]).toBeGreaterThan(0);
  expect(row[field]).toBeGreaterThanOrEqual(min);
  return row[field] as number;
}

describe("runtime proof: Event lifecycle transition sequence (AC-225)", () => {
  it("canonical ladder: each guarded gate records time and emits exactly one typed event", async () => {
    const proof = harness();
    const tenantId = "tenant-ac225-ladder";
    const { events, sales } = rolesFor(proof, tenantId);
    const { eventId, clientId } = await createEvent(
      proof,
      tenantId,
      "AC-225 ladder",
    );

    // Creation (planning) recorded plannedAt and one EventPlanned.
    let row = await readEvent(events, eventId);
    expect(row.stage).toBe("planning");
    let at = stampAt(row, "plannedAt");
    await expectExactlyOne(events, eventId, tenantId, "EventPlanned");

    // submitForApproval sets NO Event timestamp — time lives on the ledger row.
    await proof.executeCommand(events, M.Event_submitForApproval, {
      docId: eventId,
      version: 1,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("pending_approval");
    for (const stamp of NULLABLE_STAMPS) {
      expect(row[stamp] == null).toBe(true);
    }
    await expectExactlyOne(
      events,
      eventId,
      tenantId,
      "EventSubmittedForApproval",
    );

    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version: 2,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("approved");
    at = stampAt(row, "approvedAt", at);
    await expectExactlyOne(events, eventId, tenantId, "EventApproved", {
      clientId,
      expectedHeadcount: HEAD_COUNT,
      quotedPrice: QUOTED,
    });

    await proof.executeCommand(sales, M.Event_lockForSales, {
      docId: eventId,
      version: 3,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("sales_lock");
    at = stampAt(row, "salesLockedAt", at);
    await expectExactlyOne(events, eventId, tenantId, "EventSalesLocked");

    await proof.executeCommand(events, M.Event_beginExecution, {
      docId: eventId,
      version: 4,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("executing");
    at = stampAt(row, "executionStartedAt", at);
    await expectExactlyOne(events, eventId, tenantId, "EventExecutionStarted");

    await proof.executeCommand(events, M.Event_finalizeEvent, {
      docId: eventId,
      version: 5,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("final");
    at = stampAt(row, "finalizedAt", at);
    await expectExactlyOne(events, eventId, tenantId, "EventFinalized");

    await proof.executeCommand(events, M.Event_complete, {
      docId: eventId,
      version: 6,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("completed");
    at = stampAt(row, "completedAt", at);
    await expectExactlyOne(events, eventId, tenantId, "EventCompleted");

    await proof.executeCommand(events, M.Event_closeOut, {
      docId: eventId,
      version: 7,
    });
    row = await readEvent(events, eventId);
    expect(row.stage).toBe("closed_out");
    at = stampAt(row, "closedOutAt", at);
    await expectExactlyOne(events, eventId, tenantId, "EventClosedOut", {
      quotedPrice: QUOTED,
      budgetAmount: BUDGET,
    });

    // After the last gate, EVERY ladder type is still exactly one row.
    for (const type of [
      "EventPlanned",
      "EventSubmittedForApproval",
      "EventApproved",
      "EventSalesLocked",
      "EventExecutionStarted",
      "EventFinalized",
      "EventCompleted",
      "EventClosedOut",
    ]) {
      await expectExactlyOne(events, eventId, tenantId, type);
    }
  });

  it("cancel from approved records cancelledAt and one EventCancelled; a second cancel is refused", async () => {
    const proof = harness();
    const tenantId = "tenant-ac225-cancel";
    const { events } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "approved",
      "AC-225 cancel",
    );

    const reason = "Client postponed the reception";
    await proof.executeCommand(events, M.Event_cancel, {
      docId: eventId,
      version,
      reason,
    });

    const row = await readEvent(events, eventId);
    expect(row.stage).toBe("cancelled");
    stampAt(row, "cancelledAt");
    expect(row.cancellationReason).toBe(reason);
    await expectExactlyOne(events, eventId, tenantId, "EventCancelled", {
      reason,
    });

    await expect(
      proof.executeCommand(events, M.Event_cancel, {
        docId: eventId,
        version: version + 1,
        reason: "Second cancel must not write",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    expect(await lifecycleRows(events, eventId, "EventCancelled")).toHaveLength(
      1,
    );
  });

  it("kitchen cannot approve (actor is the authenticated caller); event_manager approve then succeeds", async () => {
    const proof = harness();
    const tenantId = "tenant-ac225-role";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const { eventId, version } = await walkToStage(
      proof,
      tenantId,
      "pending_approval",
      "AC-225 role gate",
    );

    await expect(
      proof.executeCommand(kitchen, M.Event_approve, {
        docId: eventId,
        version,
      }),
    ).rejects.toThrow(
      /Guard|denied|not authorized|Invalid|Staff may read|Staff may see/i,
    );

    const refused = await readEvent(events, eventId);
    expect(refused.stage).toBe("pending_approval");
    expect(refused.approvedAt == null).toBe(true);
    expect(await lifecycleRows(events, eventId, "EventApproved")).toHaveLength(
      0,
    );

    await proof.executeCommand(events, M.Event_approve, {
      docId: eventId,
      version,
    });
    const approved = await readEvent(events, eventId);
    expect(approved.stage).toBe("approved");
    stampAt(approved, "approvedAt");
    await expectExactlyOne(events, eventId, tenantId, "EventApproved");
  });
});
